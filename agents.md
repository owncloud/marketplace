# agents.md — marketplace

## Repository Overview

A backend-free replacement for marketplace.owncloud.com. Publishers submit
ownCloud apps via pull request; CI validates each submission against the catalog
rules; a static website and a JSON API are generated and deployed to GitHub
Pages. There is no runtime server and no database — the Git repository is the
source of truth.

- **Classification:** Tooling / infrastructure
- **Activity Status:** Active
- **License:** Apache-2.0
- **Language:** TypeScript (tools), Astro (website)

## Architecture & Key Paths

- `apps/` — catalog source of truth. One folder per app and release:
  `apps/<app-id>/releases/<version>/package.tar.gz`. Metadata lives in the
  `appinfo/info.xml` inside each tarball; an optional `CHANGELOG.md` may sit
  alongside it. Tarballs are stored via Git LFS.
- `tools/` — TypeScript validator + API generator (run with `tsx`, tested with
  Vitest):
  - `tools/src/info-xml.ts` — parse and validate `appinfo/info.xml`
  - `tools/src/package-reader.ts` — extract `info.xml` from a `.tar.gz`
  - `tools/src/scan.ts` — walk `apps/<app-id>/releases/<version>/`
  - `tools/src/validate.ts` — per-release and cross-release validation rules
  - `tools/src/generate.ts` — build the catalog and write `api/v1/**`
  - `tools/src/categories.ts` — category list
  - `tools/src/cli/` — entrypoints: `validate.ts`, `generate-api.ts`,
    `check-changeset.ts`
- `website/` — Astro static site rendering the catalog.
- `.github/workflows/` — `validate.yml` (PR validation of `apps/**`),
  `tools-ci.yml` (lint/test/build for `tools/**` and `website/**`),
  `deploy.yml` (regenerate API + build site + deploy to Pages on push to `main`).
- `.github/PULL_REQUEST_TEMPLATE/publish-app.md` — submission checklist.
- `.github/dependabot.yml` — github-actions + npm (`/tools`, `/website`), weekly.
- `.nvmrc` — Node version (20).

## Development Conventions

- Two independent npm packages (`tools/`, `website/`), each with its own
  `package-lock.json`. Not a workspace/monorepo — install in each separately.
- ESLint + Prettier for the tools package.
- Vitest for unit tests (tools); the website is validated via a build smoke test.
- App releases are **immutable**: once a `package.tar.gz` is merged it must not
  change. `check-changeset.ts` enforces this over changed paths in a PR.

## Build & Test Commands

```bash
# tools/ (validator + API generator)
cd tools
npm ci                 # install (clean)
npm test               # Vitest unit tests
npm run typecheck      # tsc --noEmit
npm run lint           # ESLint
npm run format:check   # Prettier --check
npx tsx src/cli/validate.ts ../apps                       # validate all releases
npx tsx src/cli/generate-api.ts --apps ../apps --out ../_site   # generate API

# website/ (Astro)
cd website
npm ci
npm run dev            # local dev server
npm run build          # production build
npm run typecheck      # astro check
```

## Important Constraints

- **Static only:** no backend or database. All output is static JSON + HTML
  served from GitHub Pages. Do not introduce server-side runtime dependencies.
- **Immutable releases:** never modify or delete an already-published
  `package.tar.gz`. Publish a new version instead.
- **Metadata source:** app metadata comes exclusively from `appinfo/info.xml`
  inside the tarball — not from files in the PR outside the tarball.
- **Git LFS:** tarballs are LFS-tracked; CI checks out with `lfs: true`.

## OSPO Policy Constraints

### GitHub Actions
- **Only** use actions owned by `owncloud`, created by GitHub (`actions/*`),
  verified on the GitHub Marketplace, or verified by the ownCloud Maintainers.
- Pin all actions to their full commit SHA (not tags): `uses: actions/checkout@<SHA> # vX.Y.Z`
- Never introduce actions from unverified third parties.

### Dependency Management
- Dependabot is configured for automated dependency updates.
- Review and merge Dependabot PRs as part of regular maintenance.
- Do not introduce new dependencies without discussion in an issue first.

### Git Workflow
- **Rebase policy**: Always rebase; never create merge commits. Use
  `git pull --rebase` and `git rebase` before pushing.
- **Signed commits**: All commits **must** be PGP/GPG signed (`git commit -S -s`).
- **DCO sign-off**: Every commit needs a `Signed-off-by` line (`git commit -s`).
- **Conventional Commits & Squash Merge**: Use the
  [Conventional Commits](https://www.conventionalcommits.org/) format where the
  repository enforces it. Many repos use squash merge, where the PR title becomes
  the commit message on the default branch — apply Conventional Commits format to
  PR titles as well.

## Context for AI Agents

- The data flow is: PR adds `package.tar.gz` → `scan.ts` discovers it →
  `package-reader.ts` extracts `info.xml` → `info-xml.ts` parses/validates →
  `validate.ts` applies catalog rules → `generate.ts` writes `api/v1/**` →
  Astro builds the site → deployed to GitHub Pages.
- There is no application runtime; everything is build-time generation.
- App releases are immutable and LFS-tracked. Treat the `apps/` tree as
  append-only.
- Keep `tools/` and `website/` independent — they do not share a lockfile.
