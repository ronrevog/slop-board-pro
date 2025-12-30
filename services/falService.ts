/**
 * fal.ai Service - Wan v2.6 Image-to-Video
 * Uses official @fal-ai/client SDK to avoid CORS issues
 */

import { fal } from '@fal-ai/client';
import { VideoProviderSettings } from '../types';

/**
 * Validate a fal.ai API key by checking its format
 * Note: Full validation happens on first request
 */
export const validateFalApiKey = async (apiKey: string): Promise<{ valid: boolean; error?: string }> => {
    if (!apiKey || apiKey.trim().length < 10) {
        return { valid: false, error: 'API key is too short' };
    }

    const cleanKey = apiKey.trim().replace(/^Key\s+/i, '');

    // Check if it looks like a valid fal.ai key format
    if (!cleanKey.match(/^[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+$/) && !cleanKey.startsWith('fal-')) {
        // Key might still be valid, but format is unusual
        console.warn('API key format is unusual, but proceeding...');
    }

    // Configure fal client with the key for a quick test
    fal.config({
        credentials: cleanKey
    });

    // The SDK doesn't have a direct "validate" endpoint, so we accept format-valid keys
    // Real validation will happen on first video generation
    if (cleanKey.length >= 20) {
        return { valid: true };
    }

    return { valid: false, error: 'API key appears to be invalid format' };
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

/**
 * Generate a video using Wan v2.6 image-to-video via fal.ai SDK
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

    // Configure fal client with credentials
    const cleanKey = apiKey.trim().replace(/^Key\s+/i, '');
    fal.config({
        credentials: cleanKey
    });

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

    console.log('Submitting to fal.ai Wan v2.6 via SDK:', { ...input, image_url: input.image_url.substring(0, 50) + '...' });
    onProgress?.('Submitting to fal.ai...');

    try {
        // Use fal.subscribe for queue-based generation with progress updates
        const result = await fal.subscribe('fal-ai/wan/v2.6/image-to-video', {
            input,
            logs: true,
            onQueueUpdate: (update) => {
                if (update.status === 'IN_QUEUE') {
                    const position = (update as any).queue_position;
                    onProgress?.('In queue...', position);
                    console.log('Queue position:', position);
                } else if (update.status === 'IN_PROGRESS') {
                    onProgress?.('Generating video...');
                    console.log('Generation in progress...');
                    if (update.logs) {
                        update.logs.forEach(log => console.log('fal.ai log:', log.message));
                    }
                }
            },
        });

        console.log('fal.ai result:', result);

        const videoData = result.data as WanVideoOutput;

        if (!videoData?.video?.url) {
            throw new Error('No video URL in result');
        }

        console.log('fal.ai video generated:', videoData.video.url);
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
        console.error('fal.ai SDK error:', error);

        // Handle specific error types
        if (error.status === 401 || error.message?.includes('401')) {
            throw new Error('fal.ai API key is invalid. Please check your key in Settings.');
        }
        if (error.status === 403 || error.message?.includes('403')) {
            throw new Error('fal.ai API key does not have permission for this model.');
        }
        if (error.message?.includes('CORS') || error.message?.includes('Load failed')) {
            throw new Error('Network error - please check your connection and try again.');
        }

        throw new Error(error.message || 'fal.ai video generation failed');
    }
};

/**
 * Cancel is not directly supported by fal SDK subscribe
 * The generation will complete but result won't be used
 */
export const cancelWanVideo = async (
    requestId: string,
    apiKey: string
): Promise<boolean> => {
    console.warn('Cancel not supported via fal SDK');
    return false;
};
