/**
 * PiAPI Service — Seedance 2 via https://api.piapi.ai
 *
 * Why: fal.ai Seedance's reference-to-video endpoint is great for image refs,
 * but for *video* references we route through PiAPI's Seedance 2 `omni_reference`
 * mode instead (user preference). This service handles:
 *
 *   1. Uploading local (data:/blob:) media to PiAPI's ephemeral resource store
 *      → returns a public https:// URL.
 *   2. Submitting a Seedance 2 task and polling until completion.
 *
 * All calls go directly from the browser. If you hit CORS, add a server-side
 * proxy (see `api/piapi-api.ts` / `api/piapi-upload.ts` scaffolding for Vercel).
 */

import { blobToBase64, dataUrlToBlob, stripBase64Header } from './imageUtils';

// ============================================================
// Constants / endpoints
// ============================================================

const PIAPI_TASK_URL = 'https://api.piapi.ai/api/v1/task';
const PIAPI_UPLOAD_URL = 'https://upload.theapi.app/api/ephemeral_resource';

// PiAPI's ephemeral upload tops out at 10 MB per file.
const PIAPI_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

// ============================================================
// Types
// ============================================================

export type PiAPISeedanceTaskType = 'seedance-2' | 'seedance-2-fast';

export type PiAPISeedanceMode = 'text_to_video' | 'first_last_frames' | 'omni_reference';

export type PiAPISeedanceAspectRatio =
    | '21:9'
    | '16:9'
    | '4:3'
    | '1:1'
    | '3:4'
    | '9:16'
    | 'auto';

export type PiAPISeedanceResolution = '480p' | '720p' | '1080p';

/** Request body shape for POST /api/v1/task */
export interface PiAPISeedanceInput {
    prompt: string;
    mode: PiAPISeedanceMode;
    duration?: number; // 4-15
    aspect_ratio?: PiAPISeedanceAspectRatio;
    resolution?: PiAPISeedanceResolution;
    image_urls?: string[];
    video_urls?: string[];
    audio_urls?: string[];
}

/** Response shape for POST /api/v1/task (and GET task by id during polling) */
interface PiAPITaskResponse {
    code: number;
    data?: {
        task_id: string;
        status: 'Pending' | 'Staged' | 'Processing' | 'Completed' | 'Failed' | string;
        output?: { video?: string };
        error?: { code?: number; message?: string };
    };
    message?: string;
}

/** Response shape for POST /api/ephemeral_resource */
interface PiAPIUploadResponse {
    code: number;
    data?: { url: string };
    message?: string;
}

// ============================================================
// Upload helpers
// ============================================================

/**
 * Upload a file to PiAPI's ephemeral resource store.
 * Accepts `data:`, `blob:`, or `http(s)://` URLs.
 *
 * For http(s) URLs: by default we pass them through unchanged (assumed
 * publicly accessible). If `forceReupload` is true OR `requiredExts` is set
 * and the URL's extension doesn't match, we fetch the bytes and re-upload so
 * PiAPI gets a properly-named file. This is critical for PiAPI Seedance's
 * `video_urls` validator, which sniffs the URL extension and rejects
 * anything that isn't `.mp4`/`.mov` — we have legacy videos stored in
 * Firebase Storage with `.png` extensions (an old bug in `firebaseSync.ts`)
 * that only work via this re-upload path.
 *
 * @throws if the payload exceeds 10 MB or upload fails.
 */
export const uploadPiAPIEphemeral = async (
    url: string,
    apiKey: string,
    fileName: string = 'upload',
    options?: { forceReupload?: boolean; requiredExts?: string[] }
): Promise<string> => {
    if (!apiKey) throw new Error('PiAPI API key is required for uploads.');
    if (!url) throw new Error('uploadPiAPIEphemeral: url is required');

    const isHttp = url.startsWith('http://') || url.startsWith('https://');

    // Figure out whether we should re-upload an http(s) URL. We strip query
    // string when matching the extension so Firebase Storage tokens don't
    // break the check.
    const needsReupload = (() => {
        if (!isHttp) return false;
        if (options?.forceReupload) return true;
        if (options?.requiredExts?.length) {
            const pathOnly = url.split('?')[0].toLowerCase();
            const ok = options.requiredExts.some(ext => pathOnly.endsWith(`.${ext.toLowerCase()}`));
            return !ok;
        }
        return false;
    })();

    // Already public and extension is fine? Pass through.
    if (isHttp && !needsReupload) return url;

    // Resolve to a Blob
    let blob: Blob;
    if (url.startsWith('data:')) {
        blob = dataUrlToBlob(url, 'application/octet-stream');
    } else if (url.startsWith('blob:')) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch blob URL: HTTP ${res.status}`);
        blob = await res.blob();
    } else if (isHttp) {
        // Re-upload path: download from Firebase / wherever, upload to PiAPI.
        console.log(`[PiAPI] Re-uploading ${url.split('/').pop()?.split('?')[0]} (wrong ext / forced)...`);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch http URL for re-upload: HTTP ${res.status}`);
        blob = await res.blob();
    } else {
        throw new Error(`Unsupported URL scheme for PiAPI upload: ${url.substring(0, 32)}...`);
    }


    if (blob.size > PIAPI_UPLOAD_MAX_BYTES) {
        throw new Error(
            `File too large for PiAPI ephemeral upload: ${Math.round(blob.size / 1024 / 1024)}MB > 10MB limit.`
        );
    }

    // Give it a sensible extension based on mime (so PiAPI / Seedance know the type).
    const mime = blob.type || 'application/octet-stream';
    const extFromMime =
        mime.startsWith('video/') ? (mime.split('/')[1] || 'mp4')
            : mime.startsWith('image/') ? (mime.split('/')[1] || 'png')
                : mime.startsWith('audio/') ? (mime.split('/')[1] || 'mp3')
                    : 'bin';
    const finalFileName = fileName.includes('.') ? fileName : `${fileName}.${extFromMime}`;

    // Convert Blob → base64 (strip the `data:...;base64,` prefix — PiAPI wants raw b64).
    const dataUrl = await blobToBase64(blob);
    const base64 = stripBase64Header(dataUrl);

    console.log(`[PiAPI] Uploading ${finalFileName} (${Math.round(blob.size / 1024)}KB, ${mime})...`);

    const res = await fetch(PIAPI_UPLOAD_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey.trim(),
        },
        body: JSON.stringify({ file_name: finalFileName, file_data: base64 }),
    });

    if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`PiAPI upload failed: HTTP ${res.status} ${txt.substring(0, 200)}`);
    }

    const body = (await res.json()) as PiAPIUploadResponse;
    if (body.code !== 200 || !body.data?.url) {
        throw new Error(`PiAPI upload failed: ${body.message || 'unknown error'}`);
    }
    console.log(`[PiAPI] Uploaded → ${body.data.url}`);
    return body.data.url;
};

// ============================================================
// Seedance 2 omni_reference generation
// ============================================================

export interface PiAPISeedance2OmniSettings {
    /** Task type: controls quality vs cost */
    taskType: PiAPISeedanceTaskType;
    /** Text prompt (up to 4000 chars) */
    prompt: string;
    /** Integer seconds 4-15 (default 5) */
    duration?: number;
    /** Omni mode does NOT accept 'auto' — pick a real ratio */
    aspectRatio?: Exclude<PiAPISeedanceAspectRatio, 'auto'>;
    /** Resolution — note fast variant caps at 720p per pricing docs */
    resolution?: PiAPISeedanceResolution;
    /** Reference image URLs (public https only). 0-12. */
    imageUrls?: string[];
    /**
     * Reference video URLs (public https only). PiAPI currently accepts **1**
     * video URL in omni_reference mode.
     */
    videoUrls?: string[];
    /** Reference audio URLs (mp3/wav, ≤15 s). 0+. */
    audioUrls?: string[];
}

/**
 * Generic Seedance 2 settings covering all three PiAPI modes.
 * Mode-specific constraints:
 *   - `text_to_video`:      no refs
 *   - `first_last_frames`:  1-2 `imageUrls` required (first, optional last)
 *   - `omni_reference`:     1-12 mixed refs total; ≥1 non-audio ref required
 */
export interface PiAPISeedance2GenerateSettings {
    mode: PiAPISeedanceMode;
    taskType: PiAPISeedanceTaskType;
    prompt: string;
    duration?: number;
    aspectRatio?: PiAPISeedanceAspectRatio;
    resolution?: PiAPISeedanceResolution;
    imageUrls?: string[];
    videoUrls?: string[];
    audioUrls?: string[];
}

/** Clamp duration into the API's 4-15 integer range. */
const clampDuration = (v: unknown): number | undefined => {
    if (v === undefined || v === null) return undefined;
    const n = typeof v === 'number' ? v : parseInt(String(v), 10);
    if (!Number.isFinite(n)) return undefined;
    return Math.min(15, Math.max(4, Math.round(n)));
};

/**
 * Submit a Seedance 2 omni_reference task and poll until completion.
 * Returns the generated video as a base64 data URL (same contract as the fal.ai
 * service) so the rest of the app doesn't have to care where it came from.
 *
 * Falls back to the raw hosted https URL if downloading the video bytes fails
 * due to CORS.
 */
export const generatePiAPISeedance2Omni = async (
    settings: PiAPISeedance2OmniSettings,
    apiKey: string,
    onProgress?: (status: string, position?: number) => void
): Promise<string> => {
    return generatePiAPISeedance2({ ...settings, mode: 'omni_reference' }, apiKey, onProgress);
};

/**
 * Generic Seedance 2 task submit + poll. Handles all three PiAPI modes
 * (`text_to_video`, `first_last_frames`, `omni_reference`). Validates
 * mode-specific constraints before submitting.
 *
 * Returns the video as a base64 data URL (same contract as fal.ai service).
 * Falls back to the raw https URL if downloading the bytes fails (CORS).
 */
export const generatePiAPISeedance2 = async (
    settings: PiAPISeedance2GenerateSettings,
    apiKey: string,
    onProgress?: (status: string, position?: number) => void,
    abortSignal?: AbortSignal
): Promise<string> => {
    if (!apiKey) {
        throw new Error('PiAPI API key is required. Add one in Project Settings.');
    }
    const { mode, prompt, taskType, imageUrls, videoUrls, audioUrls } = settings;

    // ---- Mode-specific validation ----
    if (mode === 'text_to_video') {
        const anyRefs = (imageUrls?.length || 0) + (videoUrls?.length || 0) + (audioUrls?.length || 0);
        if (anyRefs > 0) {
            console.warn('[PiAPI] text_to_video does not accept references — dropping extras.');
        }
    } else if (mode === 'first_last_frames') {
        const imgCount = imageUrls?.length || 0;
        if (imgCount < 1 || imgCount > 2) {
            throw new Error(`first_last_frames requires 1-2 images (got ${imgCount}).`);
        }
        if ((videoUrls?.length || 0) > 0 || (audioUrls?.length || 0) > 0) {
            console.warn('[PiAPI] first_last_frames does not accept video/audio refs — dropping them.');
        }
    } else if (mode === 'omni_reference') {
        const refCount = (imageUrls?.length || 0) + (videoUrls?.length || 0) + (audioUrls?.length || 0);
        if (refCount === 0) {
            throw new Error('omni_reference requires at least one image, video, or audio reference.');
        }
        if (refCount > 12) {
            throw new Error(`omni_reference supports up to 12 references total (got ${refCount}).`);
        }
        if ((videoUrls?.length || 0) > 1) {
            console.warn(`[PiAPI] ${videoUrls!.length} video refs provided; only the first will be used.`);
        }
    }

    // ---- Build request body ----
    const input: PiAPISeedanceInput = {
        prompt,
        mode,
        ...(settings.duration !== undefined && { duration: clampDuration(settings.duration) }),
        // aspect_ratio is IGNORED in first_last_frames mode per the API docs;
        // skip sending it so we don't trip validation.
        ...(mode !== 'first_last_frames' && settings.aspectRatio && { aspect_ratio: settings.aspectRatio }),
        ...(settings.resolution && { resolution: settings.resolution }),
    };

    if (mode === 'first_last_frames') {
        input.image_urls = (imageUrls || []).slice(0, 2);
    } else if (mode === 'omni_reference') {
        if (imageUrls?.length) input.image_urls = imageUrls;
        if (videoUrls?.length) input.video_urls = videoUrls.slice(0, 1); // 1 video max
        if (audioUrls?.length) input.audio_urls = audioUrls;
    }
    // text_to_video: nothing extra

    console.log(`[PiAPI] Submitting Seedance 2 ${mode} task:`, {
        task_type: taskType,
        ...input,
    });
    onProgress?.(`Submitting to PiAPI Seedance 2 (${taskType} · ${mode})...`);

    const submitRes = await fetch(PIAPI_TASK_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey.trim(),
        },
        body: JSON.stringify({
            model: 'seedance',
            task_type: taskType,
            input,
        }),
    });

    if (!submitRes.ok) {
        const txt = await submitRes.text().catch(() => '');
        // Try to pull out the most useful error detail from PiAPI's response
        // shape: { code, message, data: { error: { message } } }. If we can't
        // parse it cleanly, fall back to a longer raw-text slice so the user
        // can actually see what went wrong (was 300 chars, now 2000).
        let detail = txt.substring(0, 2000);
        try {
            const parsed = JSON.parse(txt);
            const apiMsg =
                parsed?.data?.error?.message ||
                parsed?.error?.message ||
                parsed?.message;
            if (apiMsg) detail = `${apiMsg} — ${txt.substring(0, 1500)}`;
        } catch { /* keep raw text */ }
        console.error('[PiAPI] submit failed raw response:', txt);
        throw new Error(`PiAPI submit failed: HTTP ${submitRes.status} ${detail}`);
    }

    const submitBody = (await submitRes.json()) as PiAPITaskResponse;
    if (submitBody.code !== 200 || !submitBody.data?.task_id) {
        const apiMsg =
            submitBody.data?.error?.message || submitBody.message || 'no task_id';
        throw new Error(`PiAPI submit failed: ${apiMsg}`);
    }


    const taskId = submitBody.data.task_id;
    console.log(`[PiAPI] Task submitted — id=${taskId}`);

    // ---- Poll ----
    // PiAPI's own docs say peak-hour queue can extend to "several hours", so
    // 60 min client-side is a pragmatic upper bound.
    const POLL_INTERVAL_ACTIVE_MS = 5000;   // used for pending/processing
    const POLL_INTERVAL_QUEUED_MS = 15000;  // slow down while in staged queue
    const POLL_TIMEOUT_MS = 60 * 60 * 1000; // 60 min max
    const startedAt = Date.now();
    let lastStatus: string | null = null;

    // eslint-disable-next-line no-constant-condition
    while (true) {
        if (abortSignal?.aborted) {
            throw new Error('Cancelled');
        }
        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
            throw new Error('PiAPI task timed out after 60 minutes.');
        }

        // Adaptive poll interval: 15s while PiAPI has the task queued (staged),
        // 5s while it's actively pending/processing. Less network chatter on
        // long peak-hour waits.
        const interval =
            lastStatus === 'staged' ? POLL_INTERVAL_QUEUED_MS : POLL_INTERVAL_ACTIVE_MS;
        await new Promise<void>((resolve, reject) => {
            const t = setTimeout(() => {
                abortSignal?.removeEventListener('abort', onAbort);
                resolve();
            }, interval);
            const onAbort = () => {
                clearTimeout(t);
                reject(new Error('Cancelled'));
            };
            abortSignal?.addEventListener('abort', onAbort, { once: true });
        });

        if (abortSignal?.aborted) {
            throw new Error('Cancelled');
        }

        const pollRes = await fetch(`${PIAPI_TASK_URL}/${taskId}`, {
            method: 'GET',
            headers: { 'X-API-Key': apiKey.trim() },
            signal: abortSignal,
        });
        if (!pollRes.ok) {
            const txt = await pollRes.text().catch(() => '');
            throw new Error(`PiAPI poll failed: HTTP ${pollRes.status} ${txt.substring(0, 200)}`);
        }
        const pollBody = (await pollRes.json()) as PiAPITaskResponse;
        const status = pollBody.data?.status || '';
        const normalized = status.toLowerCase();
        lastStatus = normalized;

        console.log(`[PiAPI] task=${taskId} status=${status}`);
        // Only fire progress when status actually transitions — PiAPI may
        // report the same status dozens of times in a row during queue waits.
        onProgress?.(normalized);

        if (normalized === 'completed') {
            const videoUrl = pollBody.data?.output?.video;
            if (!videoUrl) throw new Error('PiAPI task completed but no video URL in output.');
            console.log('[PiAPI] Video ready:', videoUrl);
            onProgress?.('Downloading video...');

            // Try to fetch the bytes so we can store offline as base64 (matches
            // the fal.ai service's return contract). CORS on PiAPI CDN would
            // make this fail — in that case we return the URL directly.
            try {
                const videoRes = await fetch(videoUrl);
                if (!videoRes.ok) throw new Error(`Download failed: HTTP ${videoRes.status}`);
                const blob = await videoRes.blob();
                return await blobToBase64(blob);
            } catch (downloadErr) {
                console.warn('[PiAPI] Could not fetch video bytes, returning URL:', downloadErr);
                return videoUrl;
            }
        }

        if (normalized === 'failed') {
            const errMsg =
                pollBody.data?.error?.message ||
                pollBody.message ||
                `task failed (code=${pollBody.data?.error?.code})`;
            throw new Error(`PiAPI task failed: ${errMsg}`);
        }

        // Pending / Staged / Processing → keep polling.
    }
};

// ============================================================
// Convenience: batch-upload mixed refs so callers don't have to
// ============================================================

/**
 * Given a list of URLs that might be any mix of https / data: / blob:, return
 * a new list of public https URLs suitable for `image_urls` / `video_urls`.
 * Uploads only what needs uploading; passes through existing https URLs.
 *
 * Pass `options.requiredExts` (e.g. `['mp4', 'mov']`) to force re-upload of
 * any https URL whose extension doesn't match — needed for PiAPI Seedance's
 * `video_urls`, which rejects anything that isn't a true `.mp4`/`.mov` URL
 * (we have legacy Firebase Storage URLs saved with `.png` extensions).
 */
export const uploadRefsToPiAPI = async (
    urls: string[] | undefined,
    apiKey: string,
    namePrefix: string,
    options?: { requiredExts?: string[]; forceReupload?: boolean }
): Promise<string[]> => {
    if (!urls || urls.length === 0) return [];
    const results = await Promise.all(
        urls.map((u, i) => uploadPiAPIEphemeral(u, apiKey, `${namePrefix}_${i}`, options))
    );
    return results.filter((u): u is string => !!u);
};


