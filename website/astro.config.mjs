import { defineConfig } from "astro/config";

// site/base are overridable for GitHub Pages project-site hosting.
export default defineConfig({
  site: process.env.MARKETPLACE_SITE_URL ?? "https://owncloud.github.io",
  base: process.env.MARKETPLACE_BASE_PATH ?? "/appstore",
  outDir: "../_site",
  build: { assets: "_assets" },
  // The API generator writes ../_site/api before the Astro build runs; keep
  // those artifacts by not emptying the shared outDir on build.
  vite: { build: { emptyOutDir: false } },
});
