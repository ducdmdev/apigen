---
name: release
description: Use when releasing a new version of apigen to npm. Triggers on "release", "publish", "bump version", "tag and push", or after completing a milestone.
argument-hint: "[version]"
allowed-tools: Bash, Read, Edit, Grep, Glob
---

# Release apigen to npm

## Overview

Release workflow: verify version in `package.json` → run tests → create annotated git tag → create GitHub Release → GitHub Actions publishes to npm automatically.

**Key:** The Release workflow triggers on `release: published`, NOT on tag push. You must create a GitHub Release via `gh release create`.

## Checklist

### 1. Verify version

```bash
grep '"version"' package.json          # Only version source in this project
git tag -l "v<VERSION>"                # Must not exist locally
git ls-remote --tags origin v<VERSION> # Must not exist remotely
```

### 2. Run tests on the release branch

```bash
bun test              # All must pass
bun run typecheck     # Must be clean
bun run build         # Must succeed
```

### 3. Check for stale version refs in docs

```bash
grep -rn "<OLD_VERSION>" . --include="*.md" | grep -v node_modules | grep -v '.agent-team' | grep -v CHANGELOG
```

Skip historical references in plan docs. Update any stale install instructions or badges.

### 4. Create annotated tag and push

```bash
git tag -a v<VERSION> -m "Release v<VERSION> — <summary>"
git push origin main
git push origin v<VERSION>
```

### 5. Create GitHub Release (triggers npm publish)

```bash
gh release create v<VERSION> --title "v<VERSION>" --notes "<release notes>"
```

### 6. Verify publish succeeded

```bash
gh run list --workflow release.yml --limit 1   # Should show in_progress or success
gh run watch <RUN_ID>                          # Watch until complete
```

The workflow runs: `bun install` → `bun run typecheck` → `bun test` → `bun run build` → `npm publish --provenance --access public`.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Push tag only, skip GitHub Release | Workflow triggers on `release: published`, not tag push |
| Forget to pull merged PR before tagging | `git pull origin main` first |
| Tag before version bump commit | Version in `package.json` must match tag |
| Use `npm publish` locally | Use GitHub Actions — it has the NPM_TOKEN secret |
