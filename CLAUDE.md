# Project rules — ownCloud Marketplace

## Website changes require a screenshot

Whenever a change touches the website (anything under `website/` — pages,
layouts, components, or styles), you MUST verify it visually and attach a
screenshot of the affected page(s) to the pull request.

**How to capture:**

1. Build and preview the site (Node 22 via nvm; run with the command sandbox
   disabled so Astro can write its `.astro/` sync files and bind a port):
   ```
   cd website && npm run build && npm run preview   # serves http://localhost:4321/appstore
   ```
2. Screenshot the changed page with a headless browser (Chromium + Playwright
   are available on this machine). Use a 1280-wide viewport at
   `deviceScaleFactor: 2` and `fullPage: true`. For error pages, navigate to a
   route that actually triggers them (e.g. an unknown path for the 404) and
   confirm the real HTTP status.
3. Attach the image to the PR (drag into the description or a comment).

**Why:** the site is the public face of the marketplace; the build succeeding
does not prove the page looks right. A screenshot lets reviewers confirm layout,
theming, and content at a glance and creates a visual record on the PR.
