## Publish an app

Thanks for publishing to the ownCloud marketplace! Submitting an app is **one file**:
drop your package tarball at the path below — all metadata is read from the
`appinfo/info.xml` inside it.

### App
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

CI will validate the `info.xml` schema, the path↔package match, release immutability,
and category validity. A maintainer will review and merge.
