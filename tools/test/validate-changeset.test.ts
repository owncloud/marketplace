import { describe, it, expect } from "vitest";
import { validateChangeset } from "../src/validate.js";

/**
 * validateChangeset(changedPaths, existsOnMaster) enforces:
 *  - no modify/delete of existing apps/**\/releases/** (immutability)
 *  - no new release that already exists on master (collision)
 * existsOnMaster(path) reports whether the release dir is already published.
 */
describe("validateChangeset", () => {
  const onMaster = (p: string) => p === "apps/calendar/releases/1.0.0";

  it("accepts adding a brand-new release folder", () => {
    expect(() =>
      validateChangeset(
        [{ path: "apps/calendar/releases/2.0.0/package.tar.gz", status: "A" }],
        onMaster,
      ),
    ).not.toThrow();
  });

  it("rejects modifying a file inside an existing release", () => {
    expect(() =>
      validateChangeset(
        [{ path: "apps/calendar/releases/1.0.0/package.tar.gz", status: "M" }],
        onMaster,
      ),
    ).toThrow(/immutable|modify/i);
  });

  it("rejects deleting a file inside an existing release", () => {
    expect(() =>
      validateChangeset(
        [{ path: "apps/calendar/releases/1.0.0/CHANGELOG.md", status: "D" }],
        onMaster,
      ),
    ).toThrow(/immutable|delete/i);
  });

  it("rejects adding a release that already exists on master (collision)", () => {
    expect(() =>
      validateChangeset(
        [{ path: "apps/calendar/releases/1.0.0/package.tar.gz", status: "A" }],
        onMaster,
      ),
    ).toThrow(/already.*publish|collision|exists/i);
  });

  // The same immutability/collision rules apply to the oCIS extensions catalog.
  const extOnMaster = (p: string) => p === "extensions/draw-io/releases/0.1.0";

  it("accepts adding a brand-new extension release folder", () => {
    expect(() =>
      validateChangeset(
        [{ path: "extensions/draw-io/releases/0.2.0/bundle.zip", status: "A" }],
        extOnMaster,
      ),
    ).not.toThrow();
  });

  it("rejects modifying a file inside an existing extension release", () => {
    expect(() =>
      validateChangeset(
        [{ path: "extensions/draw-io/releases/0.1.0/extension.yaml", status: "M" }],
        extOnMaster,
      ),
    ).toThrow(/immutable|modify/i);
  });

  it("rejects adding an extension release that already exists on master", () => {
    expect(() =>
      validateChangeset(
        [{ path: "extensions/draw-io/releases/0.1.0/bundle.zip", status: "A" }],
        extOnMaster,
      ),
    ).toThrow(/already.*publish|collision|exists/i);
  });
});
