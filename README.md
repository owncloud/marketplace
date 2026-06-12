# ownCloud Marketplace (static)

A backend-free replacement for marketplace.owncloud.com. Publishers submit apps
via pull request; CI validates them; a static website + JSON API are generated
and hosted on GitHub Pages.

## Publishing an app
Open a PR adding a single file:
`apps/<app-id>/releases/<version>/package.tar.gz`
All metadata is read from the `appinfo/info.xml` inside the tarball. Optionally
add a `CHANGELOG.md` next to it. See the PR template for the checklist.

## Layout
- `apps/` — the catalog source of truth (one folder per app/release)
- `tools/` — TypeScript validator + API generator (see `tools/README.md`)
- `website/` — Astro site
- `.github/workflows/` — validate, deploy, tools-ci

## Generated API (served from GitHub Pages)
- `GET /api/v1/categories.json`
- `GET /api/v1/apps.json` (full catalog)
- `GET /api/v1/platform/{ocVersion}/apps.json` (back-compat with the `market` app)
- `GET /api/v1/bundles.json`
