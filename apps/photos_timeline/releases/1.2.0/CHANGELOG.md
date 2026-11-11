# YearRoll 1.2.0

- New name: **YearRoll** (menu, page title, Files button, notices, logs, docs),
  because "PhotoLine" is the name of an existing image editor. The app id stays
  `photos_timeline`, so settings, index and thumbnails are kept.
- occ commands renamed to `yearroll:index|thumbnails|status|purge`; the
  `photoline:…` and `photos-timeline:…` names remain as aliases.
- Repository moved to github.com/rumcajz/yearroll (the old address redirects).
- Marketplace metadata in `appinfo/info.xml`: website, issue tracker,
  repository, documentation links and screenshots (demo account, Unsplash photos).
- Author set to Radoslaw Cichocki; SECURITY.md explains private vulnerability reports.
- First release signed with an ownCloud code-signing certificate (new PKI).
- `make-package.sh` builds the Marketplace package (run-time files only),
  signed with `ocsign` when a key and certificate are given.
