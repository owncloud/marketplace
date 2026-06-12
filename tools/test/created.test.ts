import { describe, it, expect } from "vitest";
import { makeStaticCreatedProvider } from "../src/created.js";

describe("makeStaticCreatedProvider", () => {
  it("returns the mapped ISO timestamp for a known appId/version", () => {
    const provider = makeStaticCreatedProvider({
      "calendar@1.0.0": "2026-01-02T03:04:05+00:00",
    });
    expect(provider("calendar", "1.0.0")).toBe("2026-01-02T03:04:05+00:00");
  });

  it("falls back to the provided default for unknown keys", () => {
    const provider = makeStaticCreatedProvider({}, "1970-01-01T00:00:00+00:00");
    expect(provider("x", "9.9.9")).toBe("1970-01-01T00:00:00+00:00");
  });
});
