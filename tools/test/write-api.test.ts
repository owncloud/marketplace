import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeApi, buildApp } from "../src/generate.js";
import type { AppInfo } from "../src/types.js";

let out: string;
afterEach(async () => {
  if (out) await rm(out, { recursive: true, force: true });
});

const info: AppInfo = {
  id: "calendar",
  name: "Calendar",
  summary: "s",
  description: "d",
  license: "AGPL",
  author: "me",
  version: "1.0.0",
  categories: ["tools"],
  screenshots: [],
  platformMin: "10.0.0",
  platformMax: "10.99.99",
};

describe("writeApi", () => {
  it("writes categories.json, bundles.json, apps.json and per-version files", async () => {
    out = await mkdtemp(join(tmpdir(), "api-"));
    const app = buildApp("calendar", [info], () => "2026-06-11T00:00:00+00:00", "https://site");
    await writeApi(out, [app], ["10.0.0", "11.0.0"]);

    const read = async (p: string) => JSON.parse(await readFile(join(out, p), "utf8"));

    expect(await read("api/v1/bundles.json")).toEqual([]);
    const cats = await read("api/v1/categories.json");
    expect(cats.find((c: { id: string }) => c.id === "tools")).toBeTruthy();

    const all = await read("api/v1/apps.json");
    expect(all.map((a: { id: string }) => a.id)).toEqual(["calendar"]);

    const v10 = await read("api/v1/platform/10.0.0/apps.json");
    expect(v10.map((a: { id: string }) => a.id)).toEqual(["calendar"]);

    const v11 = await read("api/v1/platform/11.0.0/apps.json");
    expect(v11).toEqual([]); // 10.0.0–10.99.99 does not cover 11.0.0
  });

  it("is deterministic: re-running yields byte-identical apps.json", async () => {
    out = await mkdtemp(join(tmpdir(), "api-"));
    const app = buildApp("calendar", [info], () => "2026-06-11T00:00:00+00:00", "https://site");
    await writeApi(out, [app], ["10.0.0"]);
    const first = await readFile(join(out, "api/v1/apps.json"), "utf8");
    await writeApi(out, [app], ["10.0.0"]);
    const second = await readFile(join(out, "api/v1/apps.json"), "utf8");
    expect(second).toBe(first);
  });
});
