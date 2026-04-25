// Intentionally imports a package that does not exist.
// scanTemplate must catch the resolution failure and continue.
import { defineAgent } from "@nonexistent-pkg-do-not-publish/foo";

export default defineAgent({});
