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
extensions then appear in the in-product App Store. The classic ownCloud Server
API at `…/api/v1/**` is unaffected — it remains a separate catalog.

## Code contributions

For development setup, coding standards, and the pull request process, see the
[README](README.md). All commits must be PGP/GPG signed and carry a DCO
`Signed-off-by` line (`git commit -s -S`).
