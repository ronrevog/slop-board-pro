/**
 * Shared image/base64/blob helpers.
 *
 * These utilities were previously duplicated across geminiService, seedanceService,
 * falService, and firebaseSync. Centralising them keeps behaviour consistent and
 * removes ~80 lines of copy-paste.
 */

/** Returns true if the string looks like a `data:` URL. */
export const isDataUrl = (v: unknown): v is string =>
    typeof v === 'string' && v.startsWith('data:');

/**
 * Strip the `data:image/...;base64,` prefix from a data URL, leaving just the
 * base64 payload. Returns the input unchanged if it wasn't a data URL.
 */
export const stripBase64Header = (base64: string): string =>
    base64.replace(/^data:image\/\w+;base64,/, '');

/**
 * Extract the MIME type from a data URL. Defaults to `image/jpeg` to match the
 * long-standing behaviour of the Gemini service — callers that need a different
 * fallback (e.g. `image/png` for binary blob construction) can pass one in.
 */
export const getMimeType = (dataUrl: string, fallback: string = 'image/jpeg'): string =>
    dataUrl.match(/^data:(image\/\w+);base64,/)?.[1] || fallback;

/**
 * Convert a Blob to a base64 data URL using FileReader.
 */
export const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });

/**
 * Convert a data URL into a Blob. Uses the URL's declared mime type when
 * present, otherwise the provided fallback. The regex is intentionally loose
 * (`/:(.*?);/`) so that non-image data URLs (e.g. video) also parse correctly.
 */
export const dataUrlToBlob = (dataUrl: string, fallbackMime: string = 'image/png'): Blob => {
    const parts = dataUrl.split(',');
    const mime = parts[0].match(/:(.*?);/)?.[1] || fallbackMime;
    const bstr = atob(parts[1]);
    const u8arr = new Uint8Array(bstr.length);
    for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
    return new Blob([u8arr], { type: mime });
};

/**
 * Convert a data URL into a named File (useful for SDK uploads that expect a
 * File instance rather than a Blob).
 */
export const dataUrlToFile = (
    dataUrl: string,
    fileName: string,
    fallbackMime: string = 'image/jpeg'
): File => {
    const blob = dataUrlToBlob(dataUrl, fallbackMime);
    return new File([blob], fileName, { type: blob.type });
};
