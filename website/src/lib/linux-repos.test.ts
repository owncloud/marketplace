import { describe, it, expect } from "vitest";
import { aptSetup, dnfSetup } from "./linux-repos.ts";

const URL = "https://marketplace.owncloud.com/packages/desktop/7/";
const KEY = "https://marketplace.owncloud.com/packages/desktop/owncloud.asc";

describe("aptSetup", () => {
  const out = aptSetup(URL, KEY);

  it("downloads the signing key into the apt keyring", () => {
    expect(out).toContain(`curl -fsSL ${KEY} -o /etc/apt/keyrings/owncloud.asc`);
  });

  it("writes a signed-by source referencing the flat repo", () => {
    expect(out).toContain(
      `deb [signed-by=/etc/apt/keyrings/owncloud.asc] ${URL} ./`,
    );
  });

  it("installs the owncloud-client package", () => {
    expect(out).toContain("apt install owncloud-client");
  });
});

describe("dnfSetup", () => {
  const out = dnfSetup(URL, KEY);

  it("writes a .repo file with the base url", () => {
    expect(out).toContain("/etc/yum.repos.d/owncloud-client.repo");
    expect(out).toContain(`baseurl=${URL}`);
  });

  it("enables gpg verification against the signing key", () => {
    expect(out).toContain("gpgcheck=1");
    expect(out).toContain(`gpgkey=${KEY}`);
  });

  it("installs via dnf (with a zypper note)", () => {
    expect(out).toContain("dnf install owncloud-client");
    expect(out).toContain("zypper");
  });
});
