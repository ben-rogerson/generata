import { timingSafeEqual } from "node:crypto";

export type BearerAuth = {
  verify: (header: string | undefined) => boolean;
};

export function createBearerAuth({ token }: { token: string }): BearerAuth {
  if (!token) {
    throw new Error("createBearerAuth: token must be a non-empty string");
  }
  const expected = Buffer.from(token, "utf8");

  return {
    verify(header) {
      if (!header) return false;
      const prefix = "Bearer ";
      if (!header.startsWith(prefix)) return false;
      const provided = header.slice(prefix.length);
      if (!provided) return false;
      const providedBuf = Buffer.from(provided, "utf8");
      if (providedBuf.length !== expected.length) return false;
      return timingSafeEqual(providedBuf, expected);
    },
  };
}
