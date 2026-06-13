# Changesets

This folder is managed by [Changesets](https://github.com/changesets/changesets).
It records intent-to-release notes that accumulate into version bumps and the
`CHANGELOG.md` for Infomap Bioregions.

`bioregions` is a **private app**, not a published npm package — Changesets is used
here purely to version the app and maintain a human-readable changelog. Nothing is
published to npm.

## Adding a changeset

When your change should appear in the changelog, run:

```sh
pnpm changeset
```

Pick the bump type and write a short, user-facing summary. While the app is in
`2.0.0-alpha.*`, prefer `patch` for ordinary changes; use `minor`/`major` only for
deliberate milestone bumps.

## Releasing

CI (`.github/workflows/release.yml`) opens a "Version Packages" pull request that
applies the accumulated changesets — bumping the version in `package.json` and
updating `CHANGELOG.md`. Merging that PR is the release; the GitHub Pages deploy
(`.github/workflows/pages.yml`) then ships the new version. No npm publish happens.
