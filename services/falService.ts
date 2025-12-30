/**
 * fal.ai Service - Wan v2.6 Image-to-Video
 * Queue-based video generation using fal.ai's Wan 2.6 model
 */

import { VideoProviderSettings } from '../types';

const FAL_API_BASE = 'https://queue.fal.run';

/**
 * Validate a fal.ai API key by making a test request
 * @returns { valid: boolean, error?: string }
 */
export const validateFalApiKey = async (apiKey: string): Promise<{ valid: boolean; error?: string }> => {
    if (!apiKey || apiKey.trim().length < 10) {
        return { valid: false, error: 'API key is too short' };
    }

    const cleanKey = apiKey.trim().replace(/^Key\s+/i, '');

    try {
        // Use the fal.ai API info endpoint or a lightweight validation
        // Making a small request to check if key is valid
        const response = await fetch('https://fal.run/fal-ai/fast-sdxl', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Key ${cleanKey}`,
            },
            body: JSON.stringify({
                prompt: 'test',
                num_inference_steps: 1,
                guidance_scale: 1,
                sync_mode: true
            }),
        });

        // If we get 401 or 403, the key is invalid
        if (response.status === 401) {
            return { valid: false, error: 'Invalid API key - authentication failed' };
        }
        if (response.status === 403) {
            return { valid: false, error: 'API key does not have required permissions' };
        }

        // Even if we get other errors, if we didn't get 401/403, the key is likely valid
        // (other errors might be rate limiting, model not found, etc.)
        return { valid: true };
    } catch (e: any) {
        // Network errors might be CORS - try a different approach
        console.warn('Key validation failed, assuming valid:', e);
        // If we can't reach the API, assume the key format is ok
        if (cleanKey.startsWith('fal-') || cleanKey.length > 20) {
            return { valid: true };
        }
        return { valid: false, error: 'Could not validate key - network error' };
    }
};

export interface WanVideoInput {
    prompt: string;
    image_url: string;
    resolution?: '720p' | '1080p';
    duration?: '5' | '10' | '15';
    enable_safety_checker?: boolean;
    enable_prompt_expansion?: boolean;
    multi_shots?: boolean;
    negative_prompt?: string;
    seed?: number;
    audio_url?: string;
}

export interface WanVideoOutput {
    video: {
        url: string;
        content_type?: string;
        file_size?: number;
        width?: number;
        height?: number;
        fps?: number;
        duration?: number;
    };
    seed: number;
    actual_prompt?: string;
}

interface QueueStatus {
    status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED';
    request_id: string;
    response_url?: string;
    status_url?: string;
    queue_position?: number;
    logs?: any;
    metrics?: any;
}

// Helper to convert Blob to Base64
const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

// Helper to upload base64 image to a temporary host or convert to data URI
const prepareImageUrl = async (imageUrl: string): Promise<string> => {
    // If already a URL, return as-is
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        return imageUrl;
    }
    // If base64 data URI, return as-is (fal.ai accepts data URIs)
    if (imageUrl.startsWith('data:')) {
        return imageUrl;
    }
    // Otherwise assume it's base64 without prefix
    return `data:image/png;base64,${imageUrl}`;
};

/**
 * Submit a video generation request to fal.ai queue
 */
const submitToQueue = async (
    input: WanVideoInput,
    apiKey: string
): Promise<QueueStatus> => {
    const response = await fetch(`${FAL_API_BASE}/wan/v2.6/image-to-video`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Key ${apiKey}`,
        },
        body: JSON.stringify(input),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`fal.ai submission failed: ${response.status} - ${errorText}`);
    }

    return await response.json();
};

/**
 * Check the status of a queued request
 */
const checkStatus = async (
    requestId: string,
    apiKey: string
): Promise<QueueStatus> => {
    const response = await fetch(
        `${FAL_API_BASE}/wan/v2.6/image-to-video/requests/${requestId}/status`,
        {
            headers: {
                'Authorization': `Key ${apiKey}`,
            },
        }
    );

    if (!response.ok) {
        throw new Error(`Status check failed: ${response.status}`);
    }

    return await response.json();
};

/**
 * Get the result of a completed request
 */
const getResult = async (
    requestId: string,
    apiKey: string
): Promise<WanVideoOutput> => {
    const response = await fetch(
        `${FAL_API_BASE}/wan/v2.6/image-to-video/requests/${requestId}`,
        {
            headers: {
                'Authorization': `Key ${apiKey}`,
            },
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Result fetch failed: ${response.status} - ${errorText}`);
    }

    return await response.json();
};

/**
 * Generate a video using Wan v2.6 image-to-video
 * @param imageUrl - Base64 or URL of the source image
 * @param prompt - Motion/action prompt for the video
 * @param settings - Video provider settings
 * @param onProgress - Optional callback for progress updates
 * @returns Base64 data URL of the generated video
 */
export const generateWanVideo = async (
    imageUrl: string,
    prompt: string,
    settings: VideoProviderSettings,
    onProgress?: (status: string, position?: number) => void
): Promise<string> => {
    const apiKey = settings.falApiKey;
    if (!apiKey) {
        throw new Error('fal.ai API key is required. Please add it in project settings.');
    }

    // Prepare the image URL
    const preparedImageUrl = await prepareImageUrl(imageUrl);

    // Build the input
    const input: WanVideoInput = {
        prompt,
        image_url: preparedImageUrl,
        resolution: settings.wanResolution,
        duration: settings.wanDuration,
        enable_safety_checker: settings.wanEnableSafetyChecker,
        enable_prompt_expansion: settings.wanEnablePromptExpansion,
        multi_shots: settings.wanMultiShots,
        negative_prompt: settings.wanNegativePrompt || undefined,
        seed: settings.wanSeed,
        audio_url: settings.wanAudioUrl || undefined,
    };

    console.log('Submitting to fal.ai Wan v2.6:', input);
    onProgress?.('Submitting to queue...');

    // Submit to queue
    const queueResponse = await submitToQueue(input, apiKey);
    const requestId = queueResponse.request_id;

    console.log('fal.ai request submitted:', requestId);
    onProgress?.('In queue...', queueResponse.queue_position);

    // Poll for completion
    let status = queueResponse.status;
    let pollCount = 0;
    const maxPolls = 300; // 5 minutes max (1 poll per second)

    while (status !== 'COMPLETED' && pollCount < maxPolls) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Poll every 2 seconds
        pollCount++;

        const statusResponse = await checkStatus(requestId, apiKey);
        status = statusResponse.status;

        if (status === 'IN_QUEUE') {
            onProgress?.('In queue...', statusResponse.queue_position);
        } else if (status === 'IN_PROGRESS') {
            onProgress?.('Generating video...');
        }

        console.log(`fal.ai status (${pollCount}):`, status);
    }

    if (status !== 'COMPLETED') {
        throw new Error('Video generation timed out');
    }

    onProgress?.('Downloading video...');

    // Get the result
    const result = await getResult(requestId, apiKey);

    if (!result.video?.url) {
        throw new Error('No video URL in result');
    }

    console.log('fal.ai video generated:', result.video.url);

    // Fetch the video and convert to base64
    try {
        const videoResponse = await fetch(result.video.url);
        if (!videoResponse.ok) {
            throw new Error('Failed to download video');
        }
        const blob = await videoResponse.blob();
        return await blobToBase64(blob);
    } catch (fetchError) {
        console.warn('Could not fetch video blob, returning URL:', fetchError);
        return result.video.url;
    }
};

/**
 * Cancel a queued request
 */
export const cancelWanVideo = async (
    requestId: string,
    apiKey: string
): Promise<boolean> => {
    try {
        const response = await fetch(
            `${FAL_API_BASE}/wan/v2.6/image-to-video/requests/${requestId}/cancel`,
            {
                method: 'PUT',
                headers: {
                    'Authorization': `Key ${apiKey}`,
                },
            }
        );

        if (!response.ok) {
            return false;
        }

        const result = await response.json();
        return result.success || false;
    } catch (error) {
        console.error('Cancel failed:', error);
        return false;
    }
};
