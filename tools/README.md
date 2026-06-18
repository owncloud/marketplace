# marketplace-tools

TypeScript tooling that validates app submissions and generates the static
marketplace API.

## Setup

```bash
nvm use            # Node 20 (see ../.nvmrc)
npm ci
```

## Commands

- `npm test` — run the vitest suite
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` / `npm run format:check`
- `npx tsx src/cli/validate.ts ../apps` — validate every release
- `npx tsx src/cli/generate-api.ts --apps ../apps --out ../_site` — build the API
  (reads `../data/downloads-baseline.json` and `../data/created.json` when present)
- `npx tsx src/cli/fetch-downloads.ts --out ../data/downloads.json` — refresh release download data

## Module map

- `info-xml.ts` — parse + structurally validate `appinfo/info.xml`
- `package-reader.ts` — extract `info.xml` from a `.tar.gz`
- `scan.ts` — walk `apps/{appId}/releases/{version}/`
- `validate.ts` — per-release rules + changeset immutability/collision rules
- `generate.ts` — build the catalog and write `api/v1/**`
- `downloads-generate.ts` — match release binaries, normalize and write `api/v1/downloads.json`;
  also merges `data/downloads-baseline.json` (historical totals) on top of live counts
- `created.ts` — git-backed release timestamps, overridable per release via `data/created.json`
- `categories.ts` — the hardcoded, English-only category list

## Adding a validation rule

Add the check to `validateRelease` (single release) or `validateChangeset`
(cross-release/PR) in `src/validate.ts`, throwing `ValidationError` with a
publisher-friendly message, and add a test under `test/`.

## Adding a category

Edit the `CATEGORIES` array in `src/categories.ts`.
