import type { Handler } from "../../../src/handler.ts";
const handler: Handler = async () => {
  throw new Error("intentional");
};
export default handler;
