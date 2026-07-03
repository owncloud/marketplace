## Submit to the ownCloud marketplace

Thanks for contributing! This catalog has **no upload form and no database** — every
submission is a pull request that adds files to the repository. Pick the type of
submission below, fill in that section, and **delete the sections you are not using**.

**What are you submitting?**
- [ ] An **app** (ownCloud Classic app)
- [ ] An **oCIS web extension**
- [ ] A **publisher page**

---

## App

Submitting an app is **one file**: drop your package tarball at the path below — all
metadata is read from the `appinfo/info.xml` inside it.

- **App id** (the `<id>` in info.xml):
- **Version** (the `<version>` in info.xml):
- **File added:** `apps/<app-id>/releases/<version>/package.tar.gz`
- **Changelog (optional):** `apps/<app-id>/releases/<version>/CHANGELOG.md`

### Checklist
- [ ] The tarball is committed at `apps/<app-id>/releases/<version>/package.tar.gz`.
- [ ] `<app-id>` and `<version>` in the path exactly match `<id>` and `<version>` in `info.xml`.
- [ ] This is a **new** release — I am not modifying or deleting an already-published release.
- [ ] Every `<category>` in info.xml is one of the supported marketplace categories.
- [ ] (Optional) I added a `CHANGELOG.md` next to the package.

---

## oCIS web extension

A web extension adds a release directory whose metadata is authored in
`extension.yaml` (oCIS reads it from the repository feed, not the bundle).

- **Extension id** (the reverse-DNS `id` in extension.yaml):
- **Folder slug** (`<ext-id>`, also the release tag / asset name):
- **Version** (the `version` in extension.yaml):
- **Files added:** `extensions/<ext-id>/releases/<version>/` containing `bundle.zip`
  (Git LFS) and `extension.yaml` (and an optional `screenshots/` dir).

### Checklist
- [ ] `bundle.zip` and `extension.yaml` are committed under `extensions/<ext-id>/releases/<version>/`.
- [ ] The `version` in `extension.yaml` matches the `releases/<version>/` directory name.
- [ ] The reverse-DNS `id` is the same across every release of this extension.
- [ ] This is a **new** release — I am not modifying or deleting an already-published release.
- [ ] `extension.yaml` has at least one `authors` entry and at least one `tags` entry.

---

## Publisher page

A publisher page at `/publishers/<slug>` lists a publisher's apps and extensions with
a logo, description, website and aggregate stats. Pages are **opt-in**: one is created
only when `enabled: true`.

- **Slug** (the `slug`, also the folder name):
- **File added:** `publishers/<slug>/publisher.json` (and an optional logo image
  alongside it).

### Checklist
- [ ] `slug` equals the folder name and is lowercase letters, digits and hyphens.
- [ ] `enabled: true` (a page is generated only for enabled publishers).
- [ ] Every id in `apps`/`extensions` is an existing app/extension folder id, and is
  not already claimed by another publisher.
- [ ] (Optional) `logo` is the file name of a PNG/JPEG/WebP image in the publisher directory.

---

CI validates the relevant rules for your submission — schema, path↔metadata match,
release immutability, category validity, and publisher slug/ownership/logo. A
maintainer will review and merge.
