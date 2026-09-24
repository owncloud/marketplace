## 1.6.0 - 2026-09-22

### Removed

- **Support for ownCloud 10 and for PHP below 8.3.** This version requires ownCloud 11
  and PHP 8.3 - [#756](https://github.com/owncloud/contacts/pull/756). Installations
  still on ownCloud 10 must stay on 1.5.5.

### Added

- Translations for 11 further languages: `de_CH`, `en_US`, `gl`, `id`, `lo`, `lt_LT`,
  `lv`, `ru_RU`, `ug`, `zh-Hans` and `zh_HK`, taking the app from 43 to 54 locales

### Changed

- [#738](https://github.com/owncloud/contacts/pull/738) - Use vCard from the app itself
- [#794](https://github.com/owncloud/contacts/pull/794) - The vendored dav bundle
  (`js/dav/dav.js`) is reproducible from the repository again: its dependency tree is
  locked and the build is recorded in `js/dav/Makefile`. Rebuilding it takes the bundled
  `@xmldom/xmldom` from 0.8.13 to 0.8.15.
- Documentation links now point to doc.owncloud.com
- Numerous updates to the development toolchain (gulp, karma, mocha, sinon)

### Fixed

- [#794](https://github.com/owncloud/contacts/pull/794) - Restore the contact and address
  book list. Every request template in the vendored dav library resolved to a module
  namespace instead of a function, so nothing loaded at all. The regression arrived with
  [#775](https://github.com/owncloud/contacts/pull/775) and never reached a release, so
  1.5.5 is unaffected.
- [#733](https://github.com/owncloud/contacts/pull/733) - Replace the deprecated `String.prototype.substr()`
- [#663](https://github.com/owncloud/contacts/pull/663) - Rename the share icon to be adblock friendly

### Security

- [#775](https://github.com/owncloud/contacts/pull/775) - Replace the bundled `xmldom`
  0.1.x, which carries unpatched advisories with no fix available on that release line,
  with the maintained `@xmldom/xmldom`. It parses every CardDAV multistatus response.

