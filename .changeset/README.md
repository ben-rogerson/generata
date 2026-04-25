# Changesets

This project uses [Changesets](https://github.com/changesets/changesets) for versioning and publishing.

## Adding a changeset

```bash
pnpm changeset
```

Pick the package (`@generata/core`), pick a bump type (patch / minor / major), and write a one-line summary. Commit the generated `.changeset/*.md` file with your PR.

## Releasing

The release workflow creates a "Version Packages" PR. Merging it bumps versions, updates CHANGELOGs, and publishes to npm.
