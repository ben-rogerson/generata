import type { Handler } from "../../../src/handler.ts";
import { runAsync } from "../../../src/run-async.ts";

// Fake workflow that the engine cannot actually run. We're testing transport,
// not engine behaviour. The bg runWorkflow call will throw, runStore.fail will
// record the failure, and the test polls until status flips off pending.
const fakeWorkflow = { kind: "workflow", name: "fake" } as never;
const fakeArgs = {} as never;

const handler: Handler = async () => runAsync(fakeWorkflow, fakeArgs);
export default handler;
