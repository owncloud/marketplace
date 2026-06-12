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
[pull request template](.github/PULL_REQUEST_TEMPLATE/publish-app.md) for the
full checklist.

## Code contributions

For development setup, coding standards, and the pull request process, see the
[README](README.md). All commits must be PGP/GPG signed and carry a DCO
`Signed-off-by` line (`git commit -s -S`).
