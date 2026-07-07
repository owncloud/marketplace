/**
 * Build the copy-paste shell snippets that set up the ownCloud desktop client
 * apt / dnf repositories. Pure string builders so they can be unit-tested and
 * reused for both the current and previous version lines. The repository layout
 * is flat (`deb <baseUrl> ./`); adjust here if it ever becomes a dists/ suite.
 */

/** apt (Debian/Ubuntu) setup: keyring + signed source + install. */
export function aptSetup(baseUrl: string, signingKey: string): string {
  return [
    "sudo install -m 0755 -d /etc/apt/keyrings",
    `sudo curl -fsSL ${signingKey} -o /etc/apt/keyrings/owncloud.asc`,
    `echo "deb [signed-by=/etc/apt/keyrings/owncloud.asc] ${baseUrl} ./" \\`,
    "  | sudo tee /etc/apt/sources.list.d/owncloud-client.list",
    "sudo apt update && sudo apt install owncloud-client",
  ].join("\n");
}

/** dnf/zypper (Fedora/RHEL/openSUSE) setup: .repo file + install. */
export function dnfSetup(baseUrl: string, signingKey: string): string {
  return [
    "sudo tee /etc/yum.repos.d/owncloud-client.repo <<'EOF'",
    "[owncloud-client]",
    "name=ownCloud Desktop Client",
    `baseurl=${baseUrl}`,
    "enabled=1",
    "type=rpm-md",
    "gpgcheck=1",
    `gpgkey=${signingKey}`,
    "EOF",
    "sudo dnf install owncloud-client   # openSUSE: sudo zypper install owncloud-client",
  ].join("\n");
}
