import { describe, it, expect, vi } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  makeStaticCreatedProvider,
  withCreatedOverrides,
  readCreatedOverrides,
} from "../src/created.js";

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

describe("withCreatedOverrides", () => {
  const base = makeStaticCreatedProvider({ "calendar@1.0.0": "2020-01-01T00:00:00+00:00" });

  it("returns the override when one is present", () => {
    const provider = withCreatedOverrides(base, { "calendar@1.0.0": "2026-05-10T00:00:00+00:00" });
    expect(provider("calendar", "1.0.0")).toBe("2026-05-10T00:00:00+00:00");
  });

  it("delegates to the base provider when no override matches", () => {
    const provider = withCreatedOverrides(base, { "music@2.5.2": "2026-05-10T00:00:00+00:00" });
    expect(provider("calendar", "1.0.0")).toBe("2020-01-01T00:00:00+00:00");
  });
});

describe("readCreatedOverrides", () => {
  it("parses a committed overrides file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "created-"));
    const path = join(dir, "created.json");
    await writeFile(path, JSON.stringify({ "music@2.5.2": "2026-05-10T00:00:00+00:00" }));
    try {
      expect(await readCreatedOverrides(path)).toEqual({
        "music@2.5.2": "2026-05-10T00:00:00+00:00",
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns {} when the file is absent", async () => {
    expect(await readCreatedOverrides(join(tmpdir(), "does-not-exist-created.json"))).toEqual({});
  });

  it("warns when an explicitly-requested file is missing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const missing = join(tmpdir(), "does-not-exist-created.json");
      expect(await readCreatedOverrides(missing, true)).toEqual({});
      expect(warn).toHaveBeenCalledOnce();
      expect(warn.mock.calls[0][0]).toContain(missing);
    } finally {
      warn.mockRestore();
    }
  });

  it("does not warn when a defaulted file is absent", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await readCreatedOverrides(join(tmpdir(), "does-not-exist-created.json"));
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
