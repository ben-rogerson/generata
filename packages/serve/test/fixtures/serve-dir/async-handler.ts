import type { Handler } from "../../../src/handler.ts";
const handler: Handler = async ({ runAsync }) => {
  return runAsync({ kind: "workflow", name: "fake" } as never, { inputs: {} } as never);
};
export default handler;
