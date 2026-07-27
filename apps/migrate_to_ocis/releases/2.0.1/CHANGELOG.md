# Table of Contents

* [Changelog for 2.0.1](#changelog-for-201-2026-07-24)
# Changes in 2.0.1

## Summary

* Bugfix - Select the migration role by name in the acceptance test: [#42](https://github.com/owncloud/migrate_to_ocis/issues/42)
* Change - Ship a properly signed release tarball: [#49](https://github.com/owncloud/migrate_to_ocis/pull/49)

## Details

* Bugfix - Select the migration role by name in the acceptance test: [#42](https://github.com/owncloud/migrate_to_ocis/issues/42)

   We fixed a flaky acceptance test that intermittently failed during file
   migration with "409 Conflict: intermediate collection does not exist". oCIS
   returns the available roles in a non-deterministic order, and the test picked
   the role by index (0), which sometimes resolved to the "User Light" role. That
   role has no personal drive, so migrated users had no home folder and the file
   migration failed.

   The migration driver now answers the role prompt with the role label "User"
   instead of an index, which deterministically selects the standard role
   regardless of the order oCIS returns the roles in.

   https://github.com/owncloud/migrate_to_ocis/issues/42

* Change - Ship a properly signed release tarball: [#49](https://github.com/owncloud/migrate_to_ocis/pull/49)

   The 2.0.0 release tarball was not signed with the ownCloud code-signing
   certificate, so it could not be verified by ownCloud Classic's integrity check.
   The 2.0.1 release distribution is signed with the G1 code-signing certificate,
   allowing `occ integrity:check-app migrate_to_ocis` to validate the app.

   https://github.com/owncloud/migrate_to_ocis/pull/49
