# Changelog

All notable changes to Slop Board Pro are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to semantic versioning where practical.

## [Unreleased]

### Changed — Tier 1 efficiency pass (behaviour-preserving)

- **Deduplicated base64 / blob helpers** across `geminiService`,
  `seedanceService`, `falService`, and `firebaseSync` into a new
  `services/imageUtils.ts` module (`blobToBase64`, `dataUrlToBlob`,
  `dataUrlToFile`, `stripBase64Header`, `getMimeType`, `isDataUrl`). Removes
  ~80 lines of copy-paste and keeps fallback mime behaviour consistent.
- **Cached the IndexedDB connection** in `services/storage.ts`. `getDB()` now
  memoises the open-DB promise (previously `initDB()` ran on every save /
  delete / read, which is dozens of times per minute with auto-save + cloud
  sync active). Added `onversionchange` handling so another tab's upgrade
  invalidates the cache safely.
- **Switched `uploadProjectImages` to `structuredClone`** in
  `services/firebaseSync.ts` — faster than `JSON.parse(JSON.stringify(...))`
  for large base64-heavy projects.
- **Parallelised serial loops** that were previously `await`-ing one project at
  a time:
  - `App.tsx` — saving cloud projects into IndexedDB on load / post-migration.
  - `services/firebaseSync.ts > syncAllProjectsToCloud` — uses a bounded
    worker pool (concurrency = 3) so we sync faster without flooding
    Firestore / Storage.

### Removed

- Unused `getCurrentUser` import in `App.tsx`.
- `test_genai_type.ts` scratch file from the repo root (was not referenced
  anywhere, left over from a type probe).
