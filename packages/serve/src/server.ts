import {
  createServer as createHttpServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomUUID } from "node:crypto";
import { runWorkflow } from "@generata/core";
import type { BearerAuth } from "./auth.js";
import type { RunStore } from "./run-store.js";
import type { Handler, HandlerContext, HandlerLogger } from "./handler.js";
import { runAsync, isRunAsyncSentinel } from "./run-async.js";

export type CreateServerOptions = {
  routes: Map<string, Handler>;
  auth: BearerAuth;
  runStore: RunStore;
  bodyLimitBytes: number;
  logger?: HandlerLogger;
};

export type ServerHandle = {
  listen: (port: number, host: string) => Promise<Server>;
  close: () => Promise<void>;
  drain: (timeoutSec: number) => Promise<void>;
};

const noopSink = { post: () => {} } as never;

const defaultLogger: HandlerLogger = {
  info: (...a) => console.log(...a),
  warn: (...a) => console.warn(...a),
  error: (...a) => console.error(...a),
};

export function createServer({
  routes,
  auth,
  runStore,
  bodyLimitBytes,
  logger = defaultLogger,
}: CreateServerOptions): ServerHandle {
  const inFlight = new Set<Promise<unknown>>();

  const server = createHttpServer((req, res) => {
    const started = handleRequest(req, res).catch((err) => {
      logger.error(`server: unhandled request error: ${(err as Error).message}`);
      if (!res.headersSent) {
        respond(res, 500, { error: "internal" });
      }
    });
    inFlight.add(started);
    started.finally(() => inFlight.delete(started));
  });

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (req.method === "GET" && url.pathname === "/healthz") {
      respond(res, 200, { ok: true });
      return;
    }

    if (!auth.verify(req.headers.authorization)) {
      res.setHeader("WWW-Authenticate", 'Bearer realm="generata"');
      respond(res, 401, { error: "unauthorised" });
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/runs/")) {
      const runId = url.pathname.slice("/runs/".length);
      const state = await runStore.get(runId);
      if (!state) {
        respond(res, 404, { error: "not-found" });
        return;
      }
      respond(res, 200, state);
      return;
    }

    if (req.method !== "POST") {
      respond(res, 405, { error: "method-not-allowed" });
      return;
    }

    const route = url.pathname.replace(/^\//, "");
    const handler = routes.get(route);
    if (!handler) {
      respond(res, 404, { error: "not-found" });
      return;
    }

    let body: unknown;
    try {
      body = await readJsonBody(req, bodyLimitBytes);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "BODY_TOO_LARGE") {
        respond(res, 413, { error: "payload-too-large" });
        return;
      }
      respond(res, 400, { error: "bad-request", detail: (err as Error).message });
      return;
    }

    const runId = randomUUID();
    const controller = new AbortController();
    req.on("close", () => controller.abort());

    const ctx: HandlerContext = {
      body,
      runId,
      runWorkflow,
      runAsync,
      eventSink: noopSink,
      logger,
      signal: controller.signal,
    };

    let resolved: unknown;
    try {
      resolved = await handler(ctx);
    } catch (err) {
      logger.error(`handler '${route}' threw: ${(err as Error).message}`);
      respond(res, 500, { error: "handler-error", runId });
      return;
    }

    if (isRunAsyncSentinel(resolved)) {
      await runStore.create(runId);
      res.setHeader("Location", `/runs/${runId}`);
      respond(res, 202, { runId });

      const bg = (async () => {
        try {
          const result = await runWorkflow(resolved.workflow, resolved.args, resolved.options);
          await runStore.complete(runId, result);
        } catch (err) {
          try {
            await runStore.fail(runId, {
              code: "workflow-error",
              message: (err as Error).message,
            });
          } catch (storeErr) {
            logger.error(`run-store: failed to record failure for ${runId}: ${(storeErr as Error).message}`);
          }
        }
      })();
      inFlight.add(bg);
      bg.finally(() => inFlight.delete(bg));
      return;
    }

    respond(res, 200, resolved);
  }

  return {
    listen(port, host) {
      return new Promise<Server>((res, rej) => {
        const onErr = (err: Error) => rej(err);
        server.once("error", onErr);
        server.listen(port, host, () => {
          server.removeListener("error", onErr);
          res(server);
        });
      });
    },
    async close() {
      await new Promise<void>((res, rej) => {
        server.close((err) => (err ? rej(err) : res()));
      });
    },
    async drain(timeoutSec) {
      const deadline = Date.now() + timeoutSec * 1000;
      while (inFlight.size > 0 && Date.now() < deadline) {
        await Promise.race([
          Promise.all(inFlight),
          new Promise((r) => setTimeout(r, Math.min(250, deadline - Date.now()))),
        ]);
      }
    },
  };
}

function respond(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage, limit: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (total > limit) {
      const err: Error & { code?: string } = new Error("payload too large");
      err.code = "BODY_TOO_LARGE";
      throw err;
    }
    chunks.push(buf);
  }
  if (chunks.length === 0) return undefined;
  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw.trim() === "") return undefined;
  return JSON.parse(raw);
}
