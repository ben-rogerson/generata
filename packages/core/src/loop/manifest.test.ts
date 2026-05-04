import { describe, it } from "node:test";
import { deepEqual, equal } from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loopManifestPath, writeManifest, type LoopManifest } from "./manifest.js";

describe("loopManifestPath", () => {
  it("composes <work_dir>/.generata/loops/<workflow>-<step>-<run>.json", () => {
    const path = loopManifestPath("/proj", "review-and-ship", "reviews", "20260504-103201");
    equal(path, "/proj/.generata/loops/review-and-ship-reviews-20260504-103201.json");
  });

  it("flattens slashes in workflow names (mirrors prompt-log behaviour)", () => {
    const path = loopManifestPath("/proj", "core/review-and-ship", "reviews", "20260504");
    equal(path, "/proj/.generata/loops/core-review-and-ship-reviews-20260504.json");
  });
});

describe("writeManifest", () => {
  it("writes the manifest as pretty-printed JSON and creates the dir", () => {
    const dir = mkdtempSync(join(tmpdir(), "loop-manifest-"));
    try {
      const path = join(dir, ".generata", "loops", "wf-step-rid.json");
      const manifest: LoopManifest = {
        workflow: "wf",
        step: "step",
        subWorkflow: "sub",
        runId: "rid",
        startedAt: "2026-05-04T10:00:00Z",
        finishedAt: "2026-05-04T10:01:00Z",
        source: { kind: "glob", spec: "*.md", count: 1 },
        concurrency: 1,
        onFailure: "halt",
        items: [
          {
            index: 0,
            vars: { file: "a.md" },
            status: "ok",
            runId: "rid-0",
            outputs: { read: "a.review.md" },
          },
        ],
      };
      writeManifest(path, manifest);
      const round = JSON.parse(readFileSync(path, "utf8"));
      deepEqual(round, manifest);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
