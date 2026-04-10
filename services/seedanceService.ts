/**
 * Seedance 2.0 Service - All models via fal.ai SDK
 * 
 * Supported models:
 * - bytedance/seedance-2.0/image-to-video (Quality - image + prompt → video)
 * - bytedance/seedance-2.0/text-to-video (Quality - prompt only → video)
 * - bytedance/seedance-2.0/reference-to-video (Quality - reference images + prompt → video)
 * - bytedance/seedance-2.0/fast/text-to-video (Fast - prompt only → video)
 * - bytedance/seedance-2.0/fast/reference-to-video (Fast - reference images + prompt → video)
 */

import { fal } from '@fal-ai/client';

// ============================================================
// Types
// ============================================================

export type SeedanceModel =
    | 'image-to-video'
    | 'text-to-video'
    | 'reference-to-video'
    | 'fast/text-to-video'
    | 'fast/reference-to-video';

export type SeedanceDuration = 'auto' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | '13' | '14' | '15';

export type SeedanceAspectRatio = 'auto' | '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16';

export type SeedanceResolution = '480p' | '720p';

export interface SeedanceGenerationSettings {
    model: SeedanceModel;
    duration: SeedanceDuration;
    aspectRatio: SeedanceAspectRatio;
    resolution: SeedanceResolution;
    seed?: number;
    negativePrompt?: string;
    enableSafetyChecker?: boolean;
    /** For reference-to-video: URL(s) of reference images */
    referenceImageUrl?: string;
    referenceImages?: string[];
}

/** Common input fields shared across all Seedance 2.0 endpoints */
interface SeedanceBaseInput {
    prompt: string;
    duration?: SeedanceDuration;
    aspect_ratio?: SeedanceAspectRatio;
    resolution?: SeedanceResolution;
    seed?: number;
    negative_prompt?: string;
    enable_safety_checker?: boolean;
}

/** image-to-video specific input */
interface SeedanceImageToVideoInput extends SeedanceBaseInput {
    image_url: string;
}

/** reference-to-video specific input */
interface SeedanceReferenceToVideoInput extends SeedanceBaseInput {
    reference_image_url?: string;
    image_url?: string;
    reference_images?: string[];
}

/** Output from all Seedance 2.0 endpoints */
export interface SeedanceVideoOutput {
    video: {
        url: string;
        content_type?: string;
        file_name?: string;
        file_size?: number;
        width?: number;
        height?: number;
        fps?: number;
        duration?: number;
    };
    seed?: number;
}

// ============================================================
// Helpers
// ============================================================

/** Map SeedanceModel to the fal.ai endpoint ID */
const getEndpointId = (model: SeedanceModel): string => {
    return `bytedance/seedance-2.0/${model}`;
};

/** Human-readable model name for UI */
export const getSeedanceModelLabel = (model: SeedanceModel): string => {
    switch (model) {
        case 'image-to-video': return 'Image → Video (Quality)';
        case 'text-to-video': return 'Text → Video (Quality)';
        case 'reference-to-video': return 'Reference → Video (Quality)';
        case 'fast/text-to-video': return 'Text → Video (Fast)';
        case 'fast/reference-to-video': return 'Reference → Video (Fast)';
    }
};

/** Check if a model accepts image_url as a required input */
export const modelRequiresImage = (model: SeedanceModel): boolean => {
    return model === 'image-to-video';
};

/** Check if a model accepts reference images */
export const modelAcceptsReference = (model: SeedanceModel): boolean => {
    return model === 'reference-to-video' || model === 'fast/reference-to-video';
};

// Helper to convert Blob to Base64
const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

// Helper to prepare image URL (fal SDK accepts data URIs)
const prepareImageUrl = async (imageUrl: string): Promise<string> => {
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        return imageUrl;
    }
    if (imageUrl.startsWith('data:')) {
        return imageUrl;
    }
    return `data:image/png;base64,${imageUrl}`;
};

/**
 * Compress a base64 image to fit within size limits for upload to fal.ai storage
 * Resizes to max 1024px dimension and compresses as JPEG
 */
const compressImage = (base64DataUrl: string, maxDim = 1024, quality = 0.85): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            let { width, height } = img;
            if (width > maxDim || height > maxDim) {
                const ratio = Math.min(maxDim / width, maxDim / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) { reject(new Error('Canvas context failed')); return; }
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => reject(new Error('Image load failed'));
        img.src = base64DataUrl;
    });
};

/**
 * Upload a base64 image to fal.ai storage so it can be used as image_url / reference_image_url.
 * Returns a public https:// URL.
 */
export const uploadImageToFalStorage = async (base64DataUrl: string, falApiKey: string): Promise<string> => {
    const cleanKey = falApiKey.trim().replace(/^Key\s+/i, '');
    fal.config({ credentials: cleanKey });

    // Compress first to keep payload reasonable
    console.log('Compressing image for fal.ai storage upload...');
    const compressed = await compressImage(base64DataUrl);
    console.log(`Image compressed: ${Math.round(base64DataUrl.length / 1024)}KB → ${Math.round(compressed.length / 1024)}KB`);

    // Convert data URL to File
    const parts = compressed.split(',');
    const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
    const bstr = atob(parts[1]);
    const u8arr = new Uint8Array(bstr.length);
    for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
    const file = new File([u8arr], 'storyboard.jpg', { type: mime });

    const url = await fal.storage.upload(file);
    console.log('Image uploaded to fal.ai storage:', url);
    return url;
};

// ============================================================
// Main Generation Function
// ============================================================

/**
 * Generate a video using Seedance 2.0 via fal.ai SDK.
 * Automatically selects the correct endpoint based on the model setting.
 * 
 * @param prompt - Text prompt for video generation
 * @param imageUrl - Base64 or URL of the storyboard image (used for image-to-video & reference-to-video)
 * @param falApiKey - fal.ai API key
 * @param settings - Seedance generation settings
 * @param onProgress - Optional progress callback
 * @returns Video URL (base64 data URL or hosted URL)
 */
export const generateSeedanceVideo = async (
    prompt: string,
    imageUrl: string | undefined,
    falApiKey: string,
    settings: SeedanceGenerationSettings,
    onProgress?: (status: string, position?: number) => void
): Promise<string> => {
    if (!falApiKey) {
        throw new Error('fal.ai API key is required. Please add it in Project Settings.');
    }

    const cleanKey = falApiKey.trim().replace(/^Key\s+/i, '');
    fal.config({ credentials: cleanKey });

    const endpointId = getEndpointId(settings.model);

    // Build the base input — only include fields the API actually accepts.
    // Confirmed Seedance 2.0 schema:
    //   - duration: string literal union ('auto' | '4' | '5' | ... | '15') — NOT an integer
    //   - aspect_ratio / resolution: NOT valid for image-to-video (determined by input image)
    //   - negative_prompt, enable_safety_checker: NOT supported
    let input: Record<string, any> = {
        prompt,
        // Disable safety checker to avoid false-positive "real person likeness" blocks
        // on AI-generated storyboard characters
        enable_safety_checker: false,
    };

    // duration: API expects a string literal ('auto' | '4' | '5' | ... | '15')
    // Always coerce to string — saved project data may hold a number (e.g. 5 instead of '5')
    if (settings.duration !== undefined && settings.duration !== null) {
        input.duration = String(settings.duration);
    }

    // aspect_ratio and resolution are only valid for text-to-video / reference-to-video.
    // For image-to-video both are determined by the input image — sending them causes 422.
    if (settings.model !== 'image-to-video') {
        if (settings.aspectRatio) {
            input.aspect_ratio = settings.aspectRatio;
        }
        if (settings.resolution) {
            input.resolution = settings.resolution;
        }
    }

    if (settings.seed !== undefined && settings.seed !== null) {
        input.seed = settings.seed;
    }

    // Model-specific input
    if (settings.model === 'image-to-video') {
        // image-to-video requires image_url (must be a proper URL, not data URI)
        if (!imageUrl) {
            throw new Error('Image URL is required for image-to-video. Generate a storyboard image first.');
        }
        // If it's a data URI, upload to fal.ai storage first
        if (imageUrl.startsWith('data:')) {
            console.log('Uploading image to fal.ai storage for Seedance image-to-video...');
            input.image_url = await uploadImageToFalStorage(imageUrl, falApiKey);
        } else {
            input.image_url = imageUrl;
        }
    } else if (modelAcceptsReference(settings.model)) {
        // reference-to-video: only pass reference_image_url (not image_url — that
        // field is specific to the image-to-video endpoint and causes a 422 here)
        if (imageUrl) {
            let uploadedUrl = imageUrl;
            if (imageUrl.startsWith('data:')) {
                uploadedUrl = await uploadImageToFalStorage(imageUrl, falApiKey);
            }
            input.reference_image_url = uploadedUrl;
        }
        if (settings.referenceImages && settings.referenceImages.length > 0) {
            input.reference_images = settings.referenceImages;
        }
    }
    // text-to-video models don't need any image input

    console.log(`Submitting to fal.ai ${endpointId}:`, {
        ...input,
        image_url: input.image_url ? input.image_url.substring(0, 50) + '...' : undefined,
        reference_image_url: input.reference_image_url ? input.reference_image_url.substring(0, 50) + '...' : undefined,
    });
    onProgress?.(`Submitting to Seedance 2.0 (${getSeedanceModelLabel(settings.model)})...`);

    try {
        const result = await fal.subscribe(endpointId, {
            input,
            logs: true,
            onQueueUpdate: (update) => {
                if (update.status === 'IN_QUEUE') {
                    const position = (update as any).queue_position;
                    onProgress?.('In queue...', position);
                    console.log('Seedance queue position:', position);
                } else if (update.status === 'IN_PROGRESS') {
                    onProgress?.('Generating video...');
                    console.log('Seedance generation in progress...');
                    if (update.logs) {
                        update.logs.forEach(log => console.log('Seedance log:', log.message));
                    }
                }
            },
        });

        console.log('Seedance result:', result);

        const videoData = result.data as SeedanceVideoOutput;

        if (!videoData?.video?.url) {
            throw new Error('No video URL in Seedance result');
        }

        console.log('Seedance video generated:', videoData.video.url);
        onProgress?.('Downloading video...');

        // Fetch the video and convert to base64
        try {
            const videoResponse = await fetch(videoData.video.url);
            if (!videoResponse.ok) {
                throw new Error('Failed to download video');
            }
            const blob = await videoResponse.blob();
            return await blobToBase64(blob);
        } catch (fetchError) {
            console.warn('Could not fetch video blob, returning URL:', fetchError);
            return videoData.video.url;
        }
    } catch (error: any) {
        // Log the full error object so the actual validation details appear in the console
        console.error('Seedance SDK error:', error);
        console.error('Seedance error body:', error?.body ?? error?.detail ?? error?.response ?? '(no body)');

        if (error.status === 401 || error.message?.includes('401')) {
            throw new Error('fal.ai API key is invalid. Please check your key in Settings.');
        }
        if (error.status === 403 || error.message?.includes('403')) {
            throw new Error('fal.ai API key does not have permission for this Seedance model.');
        }
        if (error.message?.includes('CORS') || error.message?.includes('Load failed')) {
            throw new Error('Network error - please check your connection and try again.');
        }

        // Expose the most informative error message available
        const detail =
            error?.body?.detail ??
            error?.detail ??
            error?.body?.message ??
            error?.message ??
            'Seedance video generation failed';
        throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
    }
};

// ============================================================
// Constants for UI
// ============================================================

export const SEEDANCE_MODELS: { value: SeedanceModel; label: string; description: string }[] = [
    { value: 'image-to-video', label: 'Image → Video', description: 'Quality — Storyboard image + prompt' },
    { value: 'text-to-video', label: 'Text → Video', description: 'Quality — Prompt only' },
    { value: 'reference-to-video', label: 'Reference → Video', description: 'Quality — Reference image(s) + prompt' },
    { value: 'fast/text-to-video', label: 'Fast Text → Video', description: 'Fast — Prompt only' },
    { value: 'fast/reference-to-video', label: 'Fast Reference → Video', description: 'Fast — Reference image(s) + prompt' },
];

export const SEEDANCE_DURATIONS: { value: SeedanceDuration; label: string }[] = [
    { value: 'auto', label: 'Auto' },
    { value: '4', label: '4s' },
    { value: '5', label: '5s' },
    { value: '6', label: '6s' },
    { value: '7', label: '7s' },
    { value: '8', label: '8s' },
    { value: '9', label: '9s' },
    { value: '10', label: '10s' },
    { value: '11', label: '11s' },
    { value: '12', label: '12s' },
    { value: '13', label: '13s' },
    { value: '14', label: '14s' },
    { value: '15', label: '15s' },
];

export const SEEDANCE_ASPECT_RATIOS: { value: SeedanceAspectRatio; label: string }[] = [
    { value: 'auto', label: 'Auto' },
    { value: '21:9', label: '21:9 (Ultra Wide)' },
    { value: '16:9', label: '16:9 (Landscape)' },
    { value: '4:3', label: '4:3 (Classic)' },
    { value: '1:1', label: '1:1 (Square)' },
    { value: '3:4', label: '3:4 (Portrait Classic)' },
    { value: '9:16', label: '9:16 (Portrait)' },
];

export const SEEDANCE_RESOLUTIONS: { value: SeedanceResolution; label: string }[] = [
    { value: '480p', label: '480p' },
    { value: '720p', label: '720p' },
];
