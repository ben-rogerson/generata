import { deepStrictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import { parseArgs } from "./parse-args.js";

describe("parseArgs", () => {
  it("collects positional args", () => {
    deepStrictEqual(parseArgs(["agent", "writer"]), {
      positional: ["agent", "writer"],
      flags: {},
    });
  });

  it("parses --key value space-separated", () => {
    deepStrictEqual(parseArgs(["--port", "3000"]), {
      positional: [],
      flags: { port: "3000" },
    });
  });

  it("parses --key=value", () => {
    deepStrictEqual(parseArgs(["--port=3000", "--verbose"]), {
      positional: [],
      flags: { port: "3000", verbose: "true" },
    });
  });

  it("preserves '=' inside --key=value after the first '='", () => {
    deepStrictEqual(parseArgs(["--filter=name=widget"]), {
      positional: [],
      flags: { filter: "name=widget" },
    });
  });

  it("treats --flag with no following value as boolean true", () => {
    deepStrictEqual(parseArgs(["--verbose"]), {
      positional: [],
      flags: { verbose: "true" },
    });
  });

  it("does not consume a following flag-shaped token as a value", () => {
    deepStrictEqual(parseArgs(["--verbose", "--port", "3000"]), {
      positional: [],
      flags: { verbose: "true", port: "3000" },
    });
  });

  it("mixes positional and flags", () => {
    deepStrictEqual(parseArgs(["agent", "writer", "--plan_name=foo", "--verbose"]), {
      positional: ["agent", "writer"],
      flags: { plan_name: "foo", verbose: "true" },
    });
  });

  it("allows empty value via --key=", () => {
    deepStrictEqual(parseArgs(["--note="]), {
      positional: [],
      flags: { note: "" },
    });
  });
});
