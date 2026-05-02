import { test } from "node:test";
import { deepEqual } from "node:assert/strict";
import { resolveCommand } from "./resolve-command.js";

test("resolveCommand: reserved subcommand passes through", () => {
  deepEqual(resolveCommand(["workflow", "hello"]), {
    command: "workflow",
    rest: ["hello"],
  });
  deepEqual(resolveCommand(["run", "hello"]), { command: "run", rest: ["hello"] });
  deepEqual(resolveCommand(["agent", "greeter"]), {
    command: "agent",
    rest: ["greeter"],
  });
  deepEqual(resolveCommand(["validate"]), { command: "validate", rest: [] });
  deepEqual(resolveCommand(["init", "@generata/starter"]), {
    command: "init",
    rest: ["@generata/starter"],
  });
});

test("resolveCommand: empty positional returns undefined command", () => {
  deepEqual(resolveCommand([]), { command: undefined, rest: [] });
});

test("resolveCommand: unreserved first arg becomes workflow target", () => {
  deepEqual(resolveCommand(["hello"]), { command: "workflow", rest: ["hello"] });
  deepEqual(resolveCommand(["build-project"]), {
    command: "workflow",
    rest: ["build-project"],
  });
});

test("resolveCommand: extra positional args are preserved", () => {
  deepEqual(resolveCommand(["hello", "world"]), {
    command: "workflow",
    rest: ["hello", "world"],
  });
});

test("resolveCommand: help variants are reserved", () => {
  deepEqual(resolveCommand(["help"]), { command: "help", rest: [] });
  deepEqual(resolveCommand(["--help"]), { command: "--help", rest: [] });
  deepEqual(resolveCommand(["-h"]), { command: "-h", rest: [] });
});
