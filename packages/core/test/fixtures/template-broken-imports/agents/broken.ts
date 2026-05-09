// Intentionally imports a package that does not exist.
// scanTemplate must catch the resolution failure and continue.
// @ts-expect-error Testing here
import { defineAgent } from "@nonexistent-pkg-do-not-publish/foo";

export default defineAgent({});
