import type { Handler } from "../../../src/handler.ts";
const handler: Handler = async ({ body }) => ({ ok: true, echo: body });
export default handler;
