import { describe, expect, test } from "bun:test";
import { readCookie, SESSION_COOKIE } from "./session";

describe("readCookie name matching", () => {
  test("does not treat a longer cookie name as the session cookie", () => {
    const header = `${SESSION_COOKIE}_extra=evil; not_${SESSION_COOKIE}=also-evil; other=1`;
    expect(readCookie(header, SESSION_COOKIE)).toBeNull();
  });

  test("reads the session cookie when a lookalike is present", () => {
    const header = `${SESSION_COOKIE}_extra=evil; ${SESSION_COOKIE}=real-token; other=1`;
    expect(readCookie(header, SESSION_COOKIE)).toBe("real-token");
  });

  test("the first matching cookie wins", () => {
    const header = `${SESSION_COOKIE}=first; ${SESSION_COOKIE}=second`;
    expect(readCookie(header, SESSION_COOKIE)).toBe("first");
  });
});
