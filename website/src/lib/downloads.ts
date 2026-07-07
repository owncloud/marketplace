import type { Downloads } from "./catalog.ts";

/** The download surfaces, in display order, that key into a Downloads object. */
export type SurfaceKey = Exclude<keyof Downloads, "generatedAt">;

/** One apt/dnf repository line for a self-hosted package surface. */
export interface LinuxRepoLine {
  /** Human label, e.g. "ownCloud 7 (current)". */
  label: string;
  /** Repository base URL, trailing slash, e.g. ".../packages/desktop/7/". */
  baseUrl: string;
}

/**
 * apt/dnf repository setup metadata for a self-hosted package surface (the
 * desktop client). The GPG key verifies both lines; `current` is shown first
 * and `previous` (when set) is offered as a collapsed secondary option.
 */
export interface LinuxRepos {
  /** Armored GPG signing-key URL used to verify the repositories. */
  signingKey: string;
  current: LinuxRepoLine;
  previous?: LinuxRepoLine;
  /** Support floor: distro list + glibc note, shown above the commands. */
  supportNote: string;
  /** When set, the client page shows a page-level "Beta" banner with this text. */
  beta?: string;
}

/** Display metadata for one download surface (the data itself lives in Downloads). */
export interface SurfaceMeta {
  key: SurfaceKey;
  name: string;
  tagline: string;
  repo: string;
  /** Docker Hub image (namespace/name) when the surface ships an official image. */
  dockerImage?: string;
  /** apt/dnf repository setup, when the surface ships self-hosted Linux repos. */
  linuxRepos?: LinuxRepos;
}

/**
 * Display order and labels for the download surfaces, shared by the downloads
 * landing page and the per-product release-history subpages so the two stay in
 * lockstep. Each `key` maps to a field on the published Downloads object.
 */
export const SURFACES: readonly SurfaceMeta[] = [
  { key: "ocis", name: "ownCloud Infinite Scale", tagline: "oCIS, the next-generation ownCloud", repo: "owncloud/ocis", dockerImage: "owncloud/ocis" },
  { key: "server", name: "ownCloud Classic", tagline: "ownCloud Classic, the PHP server", repo: "owncloud/core", dockerImage: "owncloud/server" },
  {
    key: "client",
    name: "Desktop Client",
    tagline: "Sync files on Windows, macOS and Linux",
    repo: "owncloud/client",
    linuxRepos: {
      signingKey: "https://marketplace.owncloud.com/packages/desktop/owncloud.asc",
      current: { label: "ownCloud 7 (current)", baseUrl: "https://marketplace.owncloud.com/packages/desktop/7/" },
      previous: { label: "ownCloud 6", baseUrl: "https://marketplace.owncloud.com/packages/desktop/6/" },
      supportNote:
        "Debian 11+, Ubuntu 20.04+, Fedora 31+, RHEL/Rocky/AlmaLinux 9+ and openSUSE Leap 15.3+ (glibc 2.30 or newer). The packages bundle Qt, OpenSSL and their other libraries; they need only a graphical desktop with OpenGL.",
      beta:
        "The Linux package-manager repositories below are being rolled out — the repository URLs or signing key may still change, and the commands may not work yet. The Windows, macOS and Linux binary downloads are unaffected.",
    },
  },
  { key: "android", name: "Android", tagline: "ownCloud for phones and tablets", repo: "owncloud/android" },
  { key: "ios", name: "iOS", tagline: "ownCloud for iPhone and iPad", repo: "owncloud/ios-app" },
] as const;
