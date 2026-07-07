import { describe, it, expect } from "vitest";
import { SURFACES } from "./downloads.ts";

describe("client surface Linux repos", () => {
  const client = SURFACES.find((s) => s.key === "client");

  it("exposes linuxRepos on the client surface", () => {
    expect(client?.linuxRepos).toBeDefined();
  });

  it("points the current line at the v7 marketplace repo", () => {
    expect(client?.linuxRepos?.current.baseUrl).toBe(
      "https://marketplace.owncloud.com/packages/desktop/7/",
    );
  });

  it("offers the v6 line as the previous option", () => {
    expect(client?.linuxRepos?.previous?.baseUrl).toBe(
      "https://marketplace.owncloud.com/packages/desktop/6/",
    );
  });

  it("verifies repos against the armored marketplace signing key", () => {
    expect(client?.linuxRepos?.signingKey).toBe(
      "https://marketplace.owncloud.com/packages/desktop/owncloud.asc",
    );
  });

  it("no other surface declares linuxRepos", () => {
    const others = SURFACES.filter((s) => s.key !== "client");
    expect(others.every((s) => s.linuxRepos === undefined)).toBe(true);
  });

  it("carries a non-empty beta note while the repos are being rolled out", () => {
    expect(client?.linuxRepos?.beta).toBeTruthy();
    expect(typeof client?.linuxRepos?.beta).toBe("string");
  });
});
