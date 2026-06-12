# ownCloud Marketplace

<!-- OSPO-managed README | Generated: 2026-06-12 | v2 -->

[![License](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE) [![ownCloud OSPO](https://img.shields.io/badge/OSPO-ownCloud-blue)](https://kiteworks.com/opensource)

A backend-free replacement for marketplace.owncloud.com. Publishers submit apps
via pull request; CI validates each submission; a static website and a JSON API
are generated from the catalog and hosted on GitHub Pages. There is no server and
no database — the Git repository itself is the source of truth.

## Getting Started

This repository contains two independent npm packages: `tools/` (the TypeScript
validator and API generator) and `website/` (the Astro site). Each is installed
and built on its own.

### Prerequisites

- [Node.js](https://nodejs.org/) 20 (see [`.nvmrc`](.nvmrc))
- npm
- [Git LFS](https://git-lfs.com/) (app tarballs are stored via LFS)

### Development Setup

```bash
git clone https://github.com/owncloud/marketplace.git
cd marketplace

# Validator + API generator
cd tools
npm install
npm test
npm run typecheck

# Static website
cd ../website
npm install
npm run build
```

### Repository Structure

- **apps/** — the catalog and source of truth (one folder per app/release):
  `apps/<app-id>/releases/<version>/package.tar.gz`. Metadata is read from the
  `appinfo/info.xml` inside each tarball.
- **tools/** — TypeScript validator and API generator (run with `tsx`, tested
  with Vitest). See [`tools/README.md`](tools/README.md).
- **website/** — Astro static site that renders the catalog.
- **.github/** — CI workflows, the publish-app pull request template, and
  Dependabot configuration.

## Publishing an App

Open a pull request that adds a single file:

```
apps/<app-id>/releases/<version>/package.tar.gz
```

All metadata is read from the `appinfo/info.xml` inside the tarball. Optionally
add a `CHANGELOG.md` next to it. CI validates the submission; once merged to
`main`, the catalog, API and website are regenerated and deployed automatically.
See the pull request template for the full checklist.

## Generated API

Served as static JSON from GitHub Pages:

- `GET /api/v1/categories.json`
- `GET /api/v1/apps.json` — full catalog
- `GET /api/v1/platform/{ocVersion}/apps.json` — back-compat with the `market` app
- `GET /api/v1/bundles.json`

## Documentation

- Publishing workflow and catalog layout — this README and the
  [pull request template](.github/PULL_REQUEST_TEMPLATE/publish-app.md)
- Validator and API generator internals — [`tools/README.md`](tools/README.md)

## Community & Support

**[Star](https://github.com/owncloud/marketplace)** this repo and **Watch** for
release notifications!

- [ownCloud Website](https://owncloud.com)
- [Community Discussions](https://github.com/orgs/owncloud/discussions)
- [Matrix Chat](https://app.element.io/#/room/#owncloud:matrix.org)
- [Documentation](https://doc.owncloud.com)
- [Enterprise Support](https://owncloud.com/contact-us/)
- [OSPO Home](https://kiteworks.com/opensource)

## Contributing

We welcome contributions! Please read the [Contributing Guidelines](CONTRIBUTING.md)
and our [Code of Conduct](CODE_OF_CONDUCT.md) before getting started.

### Workflow

- **Rebase Early, Rebase Often!** We use a rebase workflow. Always rebase on the
  target branch before submitting a PR.
- **Dependabot**: Automated dependency updates are managed via Dependabot. Review
  and merge dependency PRs promptly.
- **Signed Commits**: All commits **must** be PGP/GPG signed. See
  [GitHub's signing guide](https://docs.github.com/en/authentication/managing-commit-signature-verification).
- **DCO Sign-off**: Every commit must carry a `Signed-off-by` line:
  ```
  git commit -s -S -m "your commit message"
  ```
- **GitHub Actions Policy**: Workflows may only use actions that are (a) owned by
  `owncloud`, (b) created by GitHub (`actions/*`), or (c) verified in the GitHub
  Marketplace. All actions are pinned to a full commit SHA.

## Security

**Do not open a public GitHub issue for security vulnerabilities.**

Report vulnerabilities at **<https://security.owncloud.com>** — see [SECURITY.md](SECURITY.md).

Bug bounty: [YesWeHack ownCloud Program](https://yeswehack.com/programs/owncloud-bug-bounty-program)

## License

This project is licensed under the [Apache License 2.0](LICENSE).

## About the ownCloud OSPO

The [Kiteworks Open Source Program Office](https://kiteworks.com/opensource), operating under
the [ownCloud](https://owncloud.com) brand, launched on May 5, 2026, to steward the open source
ecosystem around ownCloud's products. The OSPO ensures transparent governance, license compliance,
community health, and sustainable collaboration between the open source community and
[Kiteworks](https://www.kiteworks.com), which acquired ownCloud in 2023.

- **OSPO Home**: <https://kiteworks.com/opensource>
- **GitHub**: <https://github.com/owncloud>
- **ownCloud**: <https://owncloud.com>

For questions about the OSPO or licensing, contact ospo@kiteworks.com.
