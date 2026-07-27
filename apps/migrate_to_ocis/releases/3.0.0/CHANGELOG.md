# Table of Contents

* [Changelog for 3.0.0](#changelog-for-300-2026-07-27)
# Changes in 3.0.0

## Summary

* Change - Support ownCloud Server 11 and drop ownCloud 10: [#53](https://github.com/owncloud/migrate_to_ocis/pull/53)

## Details

* Change - Support ownCloud Server 11 and drop ownCloud 10: [#53](https://github.com/owncloud/migrate_to_ocis/pull/53)

   This release targets ownCloud Server 11. The app now requires PHP 8.3 or newer,
   matching the ownCloud 11 runtime baseline, and its dependency range is pinned to
   ownCloud 11 only. As a consequence it no longer installs on ownCloud 10, which
   continues to be served by the 2.0.x release line.

   The release tarball is now signed with a G2 code-signing certificate using the
   standalone `ocsign` tool, because ownCloud 11 mandates a valid app signature and
   removed the `occ integrity:sign-app` command.

   https://github.com/owncloud/migrate_to_ocis/pull/53
