/**
 * Seedance 2 (PiAPI) Service - Text/Image-to-Video via PiAPI
 * Supports text-to-video and image-to-video (using @imageN references)
 * Also supports extending existing videos via parent_task_id
 */

export interface SeedanceGenerationSettings {
    taskType: 'seedance-2-preview' | 'seedance-2-fast-preview';
    duration: 5 | 10 | 15;
    aspectRatio: '16:9' | '9:16' | '4:3' | '3:4';
    imageUrls?: string[]; // Reference image URLs for image-to-video
    parentTaskId?: string; // For extending a previous video
}

export interface SeedanceTaskResponse {
    code: number;
    data: {
        task_id: string;
        model: string;
        task_type: string;
        status: 'Completed' | 'Processing' | 'Pending' | 'Failed' | 'Staged';
        input: any;
        output: {
            video?: string;
            image_url?: string;
            image_urls?: string[];
        } | null;
        meta: {
            created_at: string;
            started_at: string;
            ended_at: string;
            usage: {
                type: string;
                frozen: number;
                consume: number;
            };
            is_using_private_pool: boolean;
        };
        detail: any;
        logs: any[];
        error: {
            code: number;
            message: string;
            raw_message?: string;
            detail?: any;
        };
    };
    message: string;
}

// Use Vite proxy in dev, Vercel serverless proxy in production
const isDev = typeof window !== 'undefined' && window.location.hostname === 'localhost';
const PIAPI_BASE_URL = isDev ? '/piapi-api' : 'https://api.piapi.ai';
const PIAPI_UPLOAD_URL = isDev ? '/piapi-upload' : '/api/piapi-upload';

/**
 * Compress a base64 image to fit within size limits
 * Resizes to max 1024px dimension and compresses as JPEG
 */
const compressImage = (base64DataUrl: string, maxDim = 1024, quality = 0.8): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            let { width, height } = img;
            // Scale down if needed
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
 * Upload a file to PiAPI's ephemeral resource storage
 * Returns a public URL that can be used in image_urls
 */
export const uploadFileToPiAPI = async (
    base64DataUrl: string,
    apiKey: string
): Promise<string> => {
    // Compress image to avoid Vercel payload limits (~4.5MB)
    console.log('Compressing image for upload...');
    const compressed = await compressImage(base64DataUrl);
    console.log(`Image compressed: ${Math.round(base64DataUrl.length / 1024)}KB → ${Math.round(compressed.length / 1024)}KB`);

    const response = await fetch(PIAPI_UPLOAD_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
        },
        body: JSON.stringify({
            file_name: 'storyboard.jpg',
            file_data: compressed,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`PiAPI upload error (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    console.log('PiAPI upload response:', JSON.stringify(result));
    const url = result.data?.url;
    if (!url) {
        throw new Error('PiAPI upload succeeded but no URL in response');
    }

    return url;
};

// Helper to convert base64 to a publicly accessible URL
// PiAPI requires image_urls to be publicly accessible URLs, not base64
const prepareImageUrl = (imageUrl: string): string | null => {
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        return imageUrl;
    }
    console.warn('Seedance requires publicly accessible image URLs. Base64/data URIs are not supported directly.');
    return null;
};

/**
 * Submit a Seedance 2 video generation task
 */
export const submitSeedanceTask = async (
    prompt: string,
    apiKey: string,
    settings: SeedanceGenerationSettings
): Promise<SeedanceTaskResponse> => {
    if (!apiKey) {
        throw new Error('PiAPI API key is required. Please add it in Project Settings.');
    }

    // Build the input
    const input: any = {
        prompt,
        duration: settings.duration,
        aspect_ratio: settings.aspectRatio,
    };

    // Add image URLs if provided (for image-to-video)
    if (settings.imageUrls && settings.imageUrls.length > 0) {
        const validUrls = settings.imageUrls
            .map(url => prepareImageUrl(url))
            .filter((url): url is string => url !== null);
        if (validUrls.length > 0) {
            input.image_urls = validUrls;
        }
    }

    // Add parent task ID for extending
    if (settings.parentTaskId) {
        input.parent_task_id = settings.parentTaskId;
    }

    const body = {
        model: 'seedance',
        task_type: settings.taskType,
        input,
    };

    console.log('Submitting Seedance task:', JSON.stringify(body, null, 2));

    const response = await fetch(`${PIAPI_BASE_URL}/api/v1/task`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Seedance API error (${response.status}): ${errorText}`);
    }

    const result: SeedanceTaskResponse = await response.json();

    if (result.code !== 200) {
        throw new Error(`Seedance API error: ${result.message || 'Unknown error'}`);
    }

    return result;
};

/**
 * Poll for task completion
 */
export const pollSeedanceTask = async (
    taskId: string,
    apiKey: string
): Promise<SeedanceTaskResponse> => {
    const response = await fetch(`${PIAPI_BASE_URL}/api/v1/task/${taskId}`, {
        method: 'GET',
        headers: {
            'X-API-Key': apiKey,
        },
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Seedance poll error (${response.status}): ${errorText}`);
    }

    const result: SeedanceTaskResponse = await response.json();
    return result;
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

/**
 * Generate a video using Seedance 2 via PiAPI
 * Handles task submission + polling loop until completion
 * @param prompt - Text prompt for video generation (can use @image1, @image2 for refs)
 * @param apiKey - PiAPI API key
 * @param settings - Seedance generation settings
 * @param onProgress - Optional progress callback
 * @returns Base64 data URL of the generated video, or the video URL
 */
export const generateSeedanceVideo = async (
    prompt: string,
    apiKey: string,
    settings: SeedanceGenerationSettings,
    onProgress?: (status: string) => void
): Promise<{ videoUrl: string; taskId: string }> => {
    onProgress?.('Submitting to Seedance 2...');

    // Submit the task
    const submitResult = await submitSeedanceTask(prompt, apiKey, settings);
    const taskId = submitResult.data.task_id;

    if (!taskId) {
        throw new Error('No task_id returned from Seedance API');
    }

    console.log('Seedance task submitted:', taskId);
    onProgress?.(`Task submitted: ${taskId}`);

    // Polling loop
    const MAX_POLLS = 180; // 30 minutes max (10s intervals)
    const POLL_INTERVAL = 10000; // 10 seconds

    for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));

        onProgress?.(`Polling task... (${Math.floor((i + 1) * POLL_INTERVAL / 1000)}s elapsed)`);

        try {
            const pollResult = await pollSeedanceTask(taskId, apiKey);
            const status = pollResult.data.status?.toLowerCase();

            console.log(`Seedance task ${taskId} status: ${status}`, pollResult.data.error || '');

            if (status === 'completed') {
                // Get video URL from output - PiAPI returns it in output.video
                const videoUrl = pollResult.data.output?.video
                    || pollResult.data.output?.image_url
                    || pollResult.data.output?.image_urls?.[0];

                if (!videoUrl) {
                    throw new Error('Seedance task completed but no video URL in output');
                }

                console.log('Seedance video generated:', videoUrl);
                onProgress?.('Downloading video...');

                // Try to download and convert to base64
                try {
                    const videoResponse = await fetch(videoUrl);
                    if (!videoResponse.ok) {
                        throw new Error('Failed to download video');
                    }
                    const blob = await videoResponse.blob();
                    const base64 = await blobToBase64(blob);
                    return { videoUrl: base64, taskId };
                } catch (fetchError) {
                    console.warn('Could not fetch video blob, returning URL:', fetchError);
                    return { videoUrl, taskId };
                }
            }

            if (status === 'failed') {
                const errorMsg = pollResult.data.error?.message || pollResult.data.error?.raw_message || 'Task failed';
                console.error('Seedance task failed. Full error:', JSON.stringify(pollResult.data.error, null, 2));
                throw new Error(`Seedance generation failed: ${errorMsg}`);
            }

            // pending, processing, staged - continue polling
            if (status === 'pending') {
                onProgress?.('Waiting in queue...');
            } else if (status === 'processing') {
                onProgress?.('Generating video...');
            } else if (status === 'staged') {
                onProgress?.('Staged (waiting for capacity)...');
            }
        } catch (pollError: any) {
            // If it's a network error, continue polling (transient)
            if (pollError.message?.includes('Seedance generation failed')) {
                throw pollError;
            }
            console.warn('Poll error (will retry):', pollError);
        }
    }

    throw new Error('Seedance video generation timed out after 30 minutes');
};
