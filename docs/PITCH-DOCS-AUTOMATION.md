# SDK Documentation Automation

## Problem

We currently have no automated pipeline for generating, versioning, or deploying SDK documentation. API docs are written and maintained by hand, which means:

- **Documentation drifts from code.** When functions are added, renamed, or have their signatures changed, docs are not updated until someone notices. Users encounter outdated parameter lists, missing functions, and stale examples.

- **Releases ship without docs.** There is no gate or trigger tying a package release to documentation updates. A new SDK version can be published to NPM with no corresponding API reference available.

- **No versioned documentation.** Users on older SDK versions cannot view the API reference that matches their installed version. There is no version switcher, no historical snapshots, and no way to compare what changed between releases.

- **Manual work does not scale.** As the SDK surface grows (completion, embedding, transcription, translation, OCR, TTS, RAG, model load, downloads) and add-ons are introduced, maintaining docs manually across multiple products and versions becomes a bottleneck.

- **LLM full text is not version-aware.** The docs site exposes a full-text representation for LLM consumption, but it does not reflect the user's selected SDK or add-on version, reducing its usefulness for coding agents.

As a result, users lose trust in the documentation, support burden increases, and developer time is spent on repetitive copy-paste work instead of building features.

## Solution

We propose building an automated documentation pipeline that generates, versions, validates, and deploys API docs as part of the existing release flow, with zero manual intervention for the happy path.

### Zero Manual Work on Release

Documentation generation is triggered automatically when a release branch is merged. The pipeline:

1. Detects the branch pattern (`release-qvac-sdk-X.Y.Z`)
2. Extracts and validates the version (full semver)
3. Runs TypeDoc against the SDK source to extract the public API
4. Generates versioned MDX files compatible with Fumadocs
5. Commits and pushes directly to main (no separate docs PR per release)

When disabled or when no release branch is involved, no doc generation runs. Day-to-day PRs are unaffected.

### Source of Truth is Code

All API documentation is extracted from the TypeScript source (`packages/qvac-sdk/index.ts`, `client/api/`, `schemas/`). JSDoc/TSDoc comments, `@param`, `@returns`, `@example`, and `@deprecated` tags are the single source of truth. No separate markdown files to keep in sync.

### Versioned Documentation with Full Bundles

Each release produces a complete versioned directory (`content/docs/sdk/api/vX.Y.Z/`) containing:

- Auto-generated API reference pages (one MDX file per exported function)
- A physical copy as `latest/` (not symlink, for cross-platform reliability)
- An updated version list powering the UI version switcher

The entire documentation bundle (API + guides + tutorials) is versioned together per product. The sidebar and navigation are per-version; pages that exist only in newer versions (e.g., a feature added in v0.8) do not appear in older version sidebars.

### Content Validation

Before writing files, the pipeline validates each extracted function:

- Must have a non-empty description
- Must have documented parameters and return type
- Must include at least one `@example`
- Version string must match semver regex

Invalid extractions fail the pipeline with actionable error messages rather than producing broken docs silently.

### Two-Branch Deployment Strategy

- **main = staging.** Every push to main that touches docs auto-deploys to the staging site. The team reviews docs on staging before they go live.

- **docs-production = production.** To publish, open a PR from main to docs-production. This provides a reviewable Git diff of everything that will go live. After review and merge, production deploys.

This avoids accidental production pushes and gives a clear audit trail.

### CI Doctor Gate

A CI doctor script (or job) runs before merging to docs-production:

- Diffs docs between docs-production and main
- Finds all CI jobs related to docs (by naming pattern)
- Verifies they are all green

This catches the scenario where 17 out of 20 doc jobs pass but 3 silently fail, leaving gaps that are only discovered later.

### LLM Full Text (Version-Aware)

The LLM full-text representation of documentation will reflect the currently selected SDK or add-on version. When a user switches from v0.7.0 to v0.6.1, the LLM text updates accordingly. Since each version already has its own directory of MDX files, the LLM full text is generated from those files on demand — no separate full-text archive per version is needed.

### Templates per Product and Version

Templates are needed for each product (SDK and, in future, add-ons and libraries) so that every version is filled consistently with the same section layout and placeholders. When new functionality requires a new documentation section (e.g., a new API area):

- Add a new template to main; the next release picks it up automatically
- Alternatively, a coding agent on CI can detect "no such section" and generate the template programmatically

The website structure must be ready so new templates can be added without breaking existing versions.

### Documentation Deploy Flow Doc

A CONTRIBUTING-style document in the monorepo will describe:

- How docs are built and versioned
- How automation runs (triggers, branches)
- How to go from staging to production (PR main to docs-production)
- Where to find scripts, workflows, and how to run them locally

Goal: anyone can understand how docs and doc automation work without reading the full implementation guide.

### Extensible to Multiple Products

The pipeline is designed for the SDK first (Phase 1) but is parameterized for future extension:

- Phase 2: Add-ons (per add-on versioning, e.g., `addons/whisper/v1.0.0/`)
- Phase 3: Multi-collection migration (`js-sdk/`, `addons/`, `libs/`)
- Phase 4: Utility libraries (per-library versioning)

Scripts accept a product parameter so the same infrastructure serves all product types. Concurrent releases across products write to different directories and do not conflict.

### Prerequisite

The current qvac-docs repository must be synced and merged into the monorepo (`packages/docs`) before automation runs. The monorepo package was behind at the time of the last sync meeting and needs to be brought up to date first.

## Risks

**Risk: Docs generated after NPM publish creates a visibility gap.**

Users who install a new version immediately may not find docs yet if the doc pipeline takes a few minutes.

Mitigation: Accepted for now. The delay is minimal and unlikely to cause issues in practice. Can be revisited later if needed (e.g., generating docs as part of release PR validation instead of post-merge).

**Risk: Cross-platform path inconsistencies.**

File path handling differs between Windows, macOS, and Linux, especially around separators and symlinks.

Mitigation: All scripts use `path.join()`, never string concatenation. `latest/` is a physical copy, not a symlink. CI runs on Linux; local dev tested on Windows.

**Risk: Version accumulation grows the repository.**

Over time, many versioned directories add up in size and clutter.

Mitigation: Pruning script provided (keep all versions for current major, only latest for older majors). Can be run manually or scheduled.

**Risk: Silent CI failures leave docs gaps.**

If a doc generation job fails but the release continues, a version may be missing from the site.

Mitigation: CI doctor gate on docs-production merge catches this. Additionally, the pipeline fails loudly with detailed error messages.

**Risk: Fumadocs routing edge cases.**

Version-specific routes may break if Fumadocs conventions change or if a page exists in one version but not another.

Mitigation: Routing test suite provided; redirect to version index when a page does not exist in the selected version.

**Risk: Backfilling old versions can corrupt latest.**

Running the generator against an old tag (e.g., v0.5.0) would incorrectly overwrite `latest/` to point to the old version instead of the newest.

Mitigation: `--no-update-latest` flag for backfill operations; only forward releases update latest.

**Risk: Patch versions clutter the version switcher.**

Multiple patch releases (v0.6.0, v0.6.1, v0.6.2) all appear individually in the switcher, making it noisy.

Mitigation: Directories always use full `vX.Y.Z` for accuracy; future UI enhancement can group patches visually (e.g., "v0.6.x" with dropdown).

**Risk: Concurrent releases can conflict.**

Two packages releasing at the same time could produce conflicting commits or race on the same files.

Mitigation: GitHub workflow concurrency groups per product; concurrent releases write to different directories and cannot collide.

**Risk: No rollback strategy if generated docs are wrong.**

If TypeDoc produces incorrect output that passes validation, bad docs could reach staging.

Mitigation: Backup of current `latest/` before overwriting; rollback function restores previous state. The two-branch strategy (staging then production) provides a review gate before bad docs go live.

**Risk: Invalid version formats could create broken directories.**

A branch like `release-qvac-sdk-beta` would create an invalid `vbeta/` directory if not caught.

Mitigation: Strict semver validation (pattern: major.minor.patch only, e.g. `/^\d+\.\d+\.\d+$/`) before any file operations; pipeline fails with actionable error message.

**Risk: Malformed TypeDoc output committed silently.**

If TypeDoc extracts incomplete or malformed data, broken MDX could be committed without anyone noticing.

Mitigation: `validateApiFunction()` checks every extracted function for description, parameters, return type, and at least one example before writing files. Invalid extractions fail the pipeline.

## Out of Scope

- Full observability UI or dashboard for doc generation metrics
- Long-term analytics or time-series tracking of documentation usage
- Automated alerting on documentation regressions
- Deep content quality assessment beyond structural validation
- Migration of existing prose documentation (guides, tutorials) into the versioned structure (handled separately by content owner)
- Distributed tracing across external documentation crawlers (Inkeep, etc. — they crawl on their own; no special handling required from our side)

## Nice to Haves

- Percentile latency tracking for doc generation pipeline (p95/p99 build times)
- Code injection via Remark plugin (inject tested code examples from `packages/qvac-sdk/examples/` into tutorials at build time)
- Grammar and spelling validation (textlint or write-good) as a non-blocking CI step
- AI-generated code examples from function signatures
- Semantic search across versions
- Auto-generated migration guides between SDK versions
- Visual timeline of doc generation pipeline execution
- Single-page copy for LLM (copy just the current page, not the full docs) — Fumadocs already supports this (https://www.fumadocs.dev/docs/integrations/llms), but requires running a server instead of a static site. Needs trade-off evaluation.
- Post-process LLM full text with an LLM to optimize for size and applicability
- Export documentation metrics to OpenTelemetry format
