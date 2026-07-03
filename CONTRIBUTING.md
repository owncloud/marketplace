# Contributing

Thank you for your interest in contributing to this project!

Please read the full contributing guidelines at:
**<https://owncloud.com/contribute/>**

## Publishing an app

This is a marketplace catalog. To publish an app, open a pull request that adds a
single file:

```
apps/<app-id>/releases/<version>/package.tar.gz
```

All metadata is read from the `appinfo/info.xml` inside the tarball. See the
[pull request template](.github/pull_request_template.md) for the
full checklist.

Because the `info.xml` inside a published tarball is immutable (and may be
signed), the parser tolerates the variety found in real classic apps: several
`<author>` elements (the first is taken as the display author), a `<screenshot>`
that carries attributes such as `small-thumbnail`, and `<category>` values
outside the supported set — unsupported categories are dropped, and a release is
rejected only when *none* of its categories are supported.

Screenshots are served from committed copies, not the `info.xml` URLs (which are
only an ingestion source). A release may ship its screenshots directly:

```
apps/<app-id>/releases/<version>/screenshots/01.png   # 02.png, … (Git LFS)
```

When a release ships local screenshots, CI validates those files in place and
does **not** fetch the `info.xml` URLs — so an app whose screenshots are hosted
behind a CDN/WAF that blocks CI (e.g. returns HTTP 415 to datacenter IPs) can
commit a local copy (or a placeholder) instead. A release with no local
screenshots falls back to fetching and validating its `info.xml` URLs.

### Importing legacy releases (download counts & dates)

Two optional, committed data files preserve history for apps mirrored from the
old marketplace. Normal new submissions need neither.

| File                          | Shape                                  | Purpose                                                                                          |
| ----------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `data/downloads-baseline.json`| `{ apps: { <id>: { <version>: count } } }` (also `extensions`) | Historical download totals, **added on top of** the live GitHub asset counts at generate time. Unlike `data/downloads.json`, it is never rewritten by the download fetch step. |
| `data/created.json`           | `{ "<id>@<version>": "<ISO date>" }`   | Real historical release date; overrides the git-history date (which would otherwise be the import date). |

## Publishing an oCIS web extension

This catalog also serves a drop-in [ownCloud Infinite Scale (oCIS)](https://owncloud.dev)
app-store repository feed. To publish a web extension, open a pull request that
adds a release directory:

```
extensions/<ext-id>/releases/<version>/
├── bundle.zip       # the oCIS web-extension bundle (Git LFS)
├── extension.yaml   # the extension metadata for this release
└── screenshots/     # optional images, ingested like app screenshots
```

`<ext-id>` is a short, filesystem-friendly slug (it becomes the release tag and
the bundle asset name). The richer reverse-DNS identifier oCIS keys on is the
`id` field inside `extension.yaml`. Unlike classic apps — whose metadata lives
inside the tarball — an extension's metadata is authored in `extension.yaml`
because oCIS reads it from the repository feed, not the bundle.

### `extension.yaml` fields

| Field         | Required | Notes                                                            |
| ------------- | -------- | ---------------------------------------------------------------- |
| `id`          | yes      | Reverse-DNS id, e.g. `com.github.owncloud.web-extensions.draw-io`. Stable across all releases. |
| `name`        | yes      | Display name.                                                    |
| `subtitle`    | yes      | One-line description shown on cards.                             |
| `description` | no       | Longer description for the detail page.                          |
| `license`     | yes      | SPDX identifier, e.g. `AGPL-3.0`.                                |
| `version`     | yes      | Must match the `releases/<version>/` directory name.            |
| `minOCIS`     | no       | Minimum compatible oCIS version (semver).                        |
| `authors`     | yes      | List of `{ name, url? }`; at least one entry.                    |
| `tags`        | yes      | Free-form tags (oCIS does not use a fixed category list); at least one. |
| `resources`   | no       | List of `{ url, label, icon? }` external links.                  |

Screenshots and the cover image are not authored in `extension.yaml`: drop image
files in `screenshots/` and they are served same-origin and exposed in the feed.

Published extension releases are **immutable**, exactly like app releases —
submit a new version rather than editing an existing one.

### Using the feed in oCIS

The generated feed is published at `…/api/ocis/v1/apps.json`. An oCIS admin adds
that URL to the `web` app's app-store `repositories` configuration; the
extensions then appear in the in-product App Store. The ownCloud Classic
API at `…/api/v1/**` is unaffected — it remains a separate catalog.

## Setting up a publisher page

Publishers can have an opt-in public page at `/publishers/<slug>` (for example
`/publishers/owncloud`) that lists their apps and web extensions together with a
logo, description, website link and aggregate download stats. To set one up, open
a pull request that adds a publisher directory:

```
publishers/<slug>/
├── publisher.json   # the publisher metadata
└── logo.png         # optional logo image (PNG/JPEG/WebP)
```

`<slug>` is the URL segment of the page and **must equal the folder name**.

### `publisher.json` fields

| Field         | Required | Notes                                                                                  |
| ------------- | -------- | -------------------------------------------------------------------------------------- |
| `slug`        | yes      | Lowercase letters, digits and hyphens (e.g. `owncloud`). Must match the folder name.   |
| `name`        | yes      | Display name shown on the page.                                                        |
| `enabled`     | no       | Defaults to `false`. The page is created **only** when set to `true` (opt-in).         |
| `website`     | no       | `http(s)` URL; also links the publisher name on the publisher's app pages.             |
| `description` | no       | Short prose shown on the page.                                                         |
| `logo`        | no       | File name of an image in the publisher directory (PNG/JPEG/WebP).                      |
| `apps`        | no       | Owned app folder ids — the `apps/<id>` slugs.                                          |
| `extensions`  | no       | Owned extension folder ids — the `extensions/<ext-id>` slugs (not the reverse-DNS id). |

Ownership is exclusive: every id in `apps`/`extensions` must exist in the catalog
and be claimed by only one publisher. A publisher whose `enabled` is `false` (or
that is absent) has no page. CI validates the slug, the logo image, and ownership
integrity.

## Code contributions

For development setup, coding standards, and the pull request process, see the
[README](README.md). All commits must be PGP/GPG signed and carry a DCO
`Signed-off-by` line (`git commit -s -S`).
