# Changelog

All notable changes to Slop Board Pro are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to semantic versioning where practical.

## [1.4.9] — 2026-04-23

### Fixed

- **Firestore "Unsupported field value: undefined" errors** during auto-save.
  Reproduced while a Seedance generation was running: `handleGenerateSeedanceVideo`
  sets `videoError: undefined` on the shot when it starts, and the debounced
  auto-save then tried to push that through `setDoc()`, which Firestore rejects.
  Fixed by initialising Firestore with `ignoreUndefinedProperties: true` via
  `initializeFirestore(...)` — undefined fields now get dropped silently
  instead of throwing.

### Notes — PiAPI queue behaviour

PiAPI's Seedance 2 queue runs hot between **09:00-15:00 UTC** (per their docs,
queue times "may extend to several hours" in that window). Long `pending` and
`staged` spells are the queue, not a client-side stall. Status is logged to the
console during polling.

## [1.4.8] — 2026-04-23

### Changed — All Seedance generations now route through PiAPI

Per user feedback that PiAPI is more reliable, **every** Seedance generation
(image-to-video, text-to-video, reference-to-video) now routes through PiAPI's
Seedance 2 API instead of fal.ai. The fal.ai Seedance integration is no longer
called from the UI (code still in `services/seedanceService.ts` but unused for
generation — only the type / constants exports are consumed by the UI).

**fal.ai → PiAPI mapping** in `ProjectEditor.handleGenerateSeedanceVideo`:

| Old fal.ai model           | New PiAPI mode       | Task type           |
| -------------------------- | -------------------- | ------------------- |
| `image-to-video`           | `first_last_frames`  | `seedance-2`        |
| `text-to-video`            | `text_to_video`      | `seedance-2`        |
| `reference-to-video`       | `omni_reference`     | `seedance-2`        |
| `fast/text-to-video`       | `text_to_video`      | `seedance-2-fast`   |
| `fast/reference-to-video`  | `omni_reference`     | `seedance-2-fast`   |

### Added

- `services/piapiService.ts` — new generic `generatePiAPISeedance2(settings)`
  function supporting all three PiAPI modes with full mode-specific validation
  (`text_to_video`, `first_last_frames`, `omni_reference`). The old
  `generatePiAPISeedance2Omni` is kept as a thin wrapper for back-compat.
- **Seedance Extend Video** now uses PiAPI `first_last_frames` — extracts the
  last frame of the existing video, uploads it to PiAPI ephemeral storage, and
  submits it as the first frame of a new generation with a "continue seamlessly"
  prompt prefix.

### UI updates

- Settings tab:
  - fal.ai key description now reads "(Wan v2.6 + Lip Sync)" — Seedance 2.0
    dropped.
  - PiAPI key description rewritten to "Required for all Seedance generations".
  - Default Video Provider card for Seedance 2.0 now says "PiAPI, 4-15s".
- VideoShotCard:
  - Generating overlay label: "Seedance 2.0 (PiAPI)".
  - Settings panel footer: "⚡ Powered by PiAPI (Seedance 2.0)".
  - API-key warning: "Add PiAPI key in Project Settings — Seedance runs on
    PiAPI."
  - Generate button disabled now requires `piapiApiKey` (not fal.ai key).

## [1.4.7] — 2026-04-21

### Added — PiAPI Seedance 2 routing for video references

- **New provider: PiAPI Seedance 2** (`services/piapiService.ts`). When Seedance
  is in reference-to-video mode AND one or more reference **videos** are
  selected in the picker, the app now routes the generation through PiAPI's
  Seedance 2 `omni_reference` endpoint instead of fal.ai. Image-only
  reference-to-video still goes through fal.ai as before.
- Upload helper `uploadPiAPIEphemeral` pushes local `data:`/`blob:` media to
  PiAPI's ephemeral resource store (`POST upload.theapi.app/api/ephemeral_resource`)
  and returns a public https URL; https URLs pass through unchanged. 10 MB cap
  per file.
- Task submission + polling (`generatePiAPISeedance2Omni`): submits a Seedance 2
  or Seedance 2 Fast task and polls `/api/v1/task/{id}` every 5s up to 20
  minutes, returning the generated video (downloaded as base64 data URL, or raw
  https URL if CORS blocks the fetch).
- Fast model (`fast/reference-to-video` in the UI) maps to PiAPI `seedance-2-fast`;
  quality maps to `seedance-2`. Max 1 video ref + up to 11 image refs (12 total,
  per PiAPI's current omni_reference limit).
- **New field `piapiApiKey`** in `VideoProviderSettings`, plus a dedicated
  input in the Settings tab's API Keys section with a save-to-localStorage
  button (key `slop_piapi_api_key`). Auto-loaded on project open just like the
  fal.ai key.
- **VideoShotCard UX**: the Reference Videos hint now explicitly says
  generation will route through PiAPI Seedance 2 (omni_reference) when videos
  are picked, warns if the PiAPI key is missing, and labels the generate button
  as "(PiAPI)" in that mode. Disabled state is driven by the correct key
  depending on the branch.

## [1.4.6] — 2026-04-20

### Added — Seedance Reference Videos

- **Reference Video picker** for Seedance 2.0 `reference-to-video` and
  `fast/reference-to-video` models. When either of those models is selected in
  the Seedance provider panel, a new collapsible section lists every video
  already generated elsewhere in the project (across all scenes/shots/segments),
  and you can tick any number of them as motion/style references for the new
  generation.
- Selected videos are sent to fal.ai as `video_urls` (list). `data:` and
  `blob:` URLs are automatically uploaded to fal.ai storage at generation time
  via the new `uploadMediaToFalStorage` helper (no image compression — videos
  preserve their bytes), and `https://` URLs are passed through unchanged.
- Picker excludes the current shot's own videos (no self-reference) and shows
  a hint if videos are selected while the model doesn't support them.

### Changed

- `services/seedanceService.ts` — `SeedanceGenerationSettings` now carries
  `referenceImageUrls?: string[]` and `referenceVideoUrls?: string[]`. Legacy
  `referenceImageUrl` / `referenceImages` still accepted for backward-compat;
  they're merged at send-time into the current `image_urls` list.
- `generateSeedanceVideo` reference-to-video path now sends `image_urls` and
  `video_urls` (plural lists) matching the current fal.ai schema. Image
  references are deduplicated and uploaded in parallel.

## [1.4.5] — 2026-04-17

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
