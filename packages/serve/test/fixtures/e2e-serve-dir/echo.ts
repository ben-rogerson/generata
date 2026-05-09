import type { Handler } from "../../../src/handler.ts";
const handler: Handler = async ({ body }) => ({ echo: body });
export default handler;
