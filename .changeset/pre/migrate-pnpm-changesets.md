---
"bioregions": patch
---

Migrate the package manager from npm to pnpm and adopt Changesets for versioning
and a maintained `CHANGELOG.md`. CI now opens an automatic "Version Packages" PR
on `main` that bumps the version and updates the changelog (no npm publish — the app
stays private and ships via the GitHub Pages deploy).
