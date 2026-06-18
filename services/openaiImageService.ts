/**
 * OpenAI GPT Image 2 Service
 * -------------------------------------------------------------
 * Alternative image-generation backend that mirrors the three core
 * functions from geminiService (generateShotImage, alterShotImage,
 * generateAssetImage) using OpenAI's Image API (`gpt-image-2`).
 *
 * Called via the provider router in services/imageService.ts when the
 * global toggle (localStorage 'image_provider') is set to 'openai'.
 *
 * Design notes:
 * - This is a client-side app, so we call OpenAI's REST endpoints
 *   directly with the user's key (same security model as the Gemini /
 *   fal.ai keys already used here). The key lives in
 *   localStorage('openai_api_key').
 * - gpt-image-2 processes every image input at HIGH fidelity
 *   automatically (no input_fidelity param), which is ideal for
 *   character likeness. We therefore send the selected character
 *   portrait(s) + location image as reference images on the /edits
 *   endpoint, and fall back to /generations when there are no refs.
 * - gpt-image-2 does NOT support transparent backgrounds.
 */

import { CinematicSettings, Character, Location, Shot } from "../types";
import { ANAMORPHIC_LENS_PROMPTS, COMPOSITION_PROMPTS } from "../constants";

const OPENAI_IMAGE_GENERATIONS_URL = "https://api.openai.com/v1/images/generations";
const OPENAI_IMAGE_EDITS_URL = "https://api.openai.com/v1/images/edits";
const OPENAI_IMAGE_MODEL = "gpt-image-2";

export const getOpenAIApiKey = (): string => {
  return (
    (typeof process !== "undefined" && (process as any).env?.OPENAI_API_KEY) ||
    localStorage.getItem("openai_api_key") ||
    ""
  );
};

// ---- mapping helpers ---------------------------------------------------

const PORTRAIT_RATIOS = new Set(["9:16", "2:3", "3:4", "4:5", "1:4", "1:8"]);
const SQUARE_RATIOS = new Set(["1:1"]);

/**
 * Map the project's aspect ratio to a gpt-image-2 supported `size`.
 * gpt-image-2 accepts many resolutions, but we map to the documented
 * "popular sizes" for reliability. Ultra-wide cinematic ratios are
 * approximated to the nearest landscape size.
 */
const mapAspectRatioToSize = (ratio: string): string => {
  if (SQUARE_RATIOS.has(ratio)) return "1024x1024";
  if (PORTRAIT_RATIOS.has(ratio)) return "1024x1536";
  return "1536x1024"; // all landscape + ultra-wide ratios
};

/**
 * Map the project's resolution preference to gpt-image-2 `quality`.
 * 'low' is fastest (drafts), 'high' is best detail.
 */
const mapResolutionToQuality = (resolution?: string): string => {
  switch (resolution) {
    case "4k":
    case "1080p":
      return "high";
    case "720p":
    case "basic":
      return "medium";
    default:
      return "medium";
  }
};

// ---- base64 / blob helpers --------------------------------------------

/** Decode raw base64 into a Blob. */
const base64ToBlob = (b64: string, mime: string): Blob => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
};

/**
 * Convert ANY image input into a Blob for FormData uploads.
 * Handles three shapes the app produces:
 *  - `https://` / `blob:` URLs (e.g. Firebase Storage cloud URLs that replace
 *    base64 after a cloud save) -> fetched over the network.
 *  - `data:` URLs -> base64 decoded locally.
 *  - raw base64 (no header) -> base64 decoded locally as PNG.
 * Previously this assumed every input was base64 and called atob() directly,
 * which threw "InvalidCharacterError: Failed to execute 'atob'" the moment a
 * synced project handed it an https cloud URL.
 */
const imageInputToBlob = async (input: string): Promise<Blob> => {
  if (input.startsWith("http://") || input.startsWith("https://") || input.startsWith("blob:")) {
    const res = await fetch(input);
    if (!res.ok) throw new Error(`Failed to fetch reference image (HTTP ${res.status}).`);
    return await res.blob();
  }
  if (input.startsWith("data:")) {
    const commaIdx = input.indexOf(",");
    const header = input.slice(0, commaIdx);
    const b64 = input.slice(commaIdx + 1);
    const mimeMatch = header.match(/data:([^;]+)/);
    return base64ToBlob(b64, mimeMatch ? mimeMatch[1] : "image/png");
  }
  // Raw base64 with no data-URL header.
  return base64ToBlob(input, "image/png");
};

/** Pick a sensible file extension from a blob mime type for the OpenAI upload. */
const extForBlob = (blob: Blob): string => {
  if (blob.type.includes("jpeg") || blob.type.includes("jpg")) return "jpg";
  if (blob.type.includes("webp")) return "webp";
  return "png";
};

// ---- error handling ----------------------------------------------------

const handleOpenAIError = async (response: Response): Promise<never> => {
  let body: any = null;
  try {
    body = await response.json();
  } catch {
    /* non-JSON error body */
  }
  const err = body?.error || {};

  if (err.code === "moderation_blocked") {
    const stage = err.moderation_details?.moderation_stage;
    const categories: string[] = err.moderation_details?.categories || [];
    let hint = "This request was blocked by OpenAI's content safety filter.";
    if (categories.length) hint += ` (flagged: ${categories.join(", ")})`;
    else if (stage === "input") hint += " Try revising the prompt or input images.";
    else if (stage === "output") hint += " The generated result was blocked — try changing the prompt.";
    throw new Error(hint);
  }

  if (response.status === 401) {
    throw new Error("OpenAI API key is invalid or missing. Check it in Settings.");
  }
  if (response.status === 403) {
    throw new Error(
      "OpenAI rejected the request (403). gpt-image-2 may require API Organization Verification on your account."
    );
  }
  if (response.status === 429) {
    throw new Error("OpenAI rate limit / quota exceeded (429). Please retry shortly.");
  }

  throw new Error(err.message || `OpenAI image request failed (HTTP ${response.status}).`);
};

const extractB64 = (json: any): string => {
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI returned no image data.");
  return `data:image/png;base64,${b64}`;
};

// ---- prompt building ---------------------------------------------------

const buildTechnicalSpecs = (shot: Shot, settings: CinematicSettings): string => {
  const isAnamorphic = settings.lens.startsWith("Panavision C-Series");
  const anamorphic = isAnamorphic ? ANAMORPHIC_LENS_PROMPTS[settings.lens] : null;
  const composition =
    shot.composition && shot.composition !== "None" ? COMPOSITION_PROMPTS[shot.composition] : null;

  // Every cinematic setting is fed through so gpt-image-2 honours the SAME
  // inputs the Gemini backend uses (plus colorGrade + resolution, which the
  // app exposes but Gemini's prompt historically omitted).
  const lines = [
    `- Cinematographer Style: ${settings.cinematographer}`,
    `- Film Stock: ${settings.filmStock}`,
    `- Lens: ${settings.lens}`,
    `- Lighting: ${settings.lighting}`,
    settings.colorGrade ? `- Color Grade: ${settings.colorGrade}` : "",
    `- Shot Type: ${shot.shotType}`,
    `- Camera Move: ${shot.cameraMove}`,
    `- Aspect Ratio: ${settings.aspectRatio}`,
    settings.resolution ? `- Target Detail / Resolution: ${settings.resolution}` : "",
  ].filter(Boolean);

  return `
TECHNICAL SPECIFICATIONS
${lines.join("\n")}
${composition ? `\nCOMPOSITION (mandatory): ${shot.composition}\n${composition}` : ""}
${anamorphic ? `\nANAMORPHIC LENS PHYSICS:\n${anamorphic}\n- Oval bokeh, blue horizontal flares, classic anamorphic look.` : ""}`.trim();
};

const buildShotTextContext = (
  activeCharacters: Character[],
  activeLocation: Location | undefined
): string => {
  let ctx = "";
  if (activeCharacters.length > 0) {
    ctx += "CHARACTERS IN THIS SHOT:\n";
    activeCharacters.forEach((c) => {
      if (c.imageUrl) {
        ctx += `- "${c.name}": facial identity, age, build, hair, and skin tone are defined ENTIRELY by this character's reference image (the source of truth).`;
        // Wardrobe / occupation are scene context, not identity — safe to pass through alongside the locked portrait.
        if (c.wardrobe) ctx += ` Wardrobe context: ${c.wardrobe}.`;
        if (c.occupation) ctx += ` Occupation: ${c.occupation}.`;
        ctx += "\n";
      } else {
        ctx += `- ${c.name}: ${c.description || "No description"}`;
        if (c.age) ctx += ` | Age: ${c.age}`;
        if (c.physicalFeatures) ctx += ` | Physical: ${c.physicalFeatures}`;
        if (c.wardrobe) ctx += ` | Wardrobe: ${c.wardrobe}`;
        if (c.occupation) ctx += ` | Occupation: ${c.occupation}`;
        if (c.personality) ctx += ` | Personality / demeanor: ${c.personality}`;
        ctx += "\n";
      }
    });
  }
  if (activeLocation) {
    ctx += `\nSHOT LOCATION: "${activeLocation.name}" - ${activeLocation.description || "No description"}`;
    if (activeLocation.timeOfDay) ctx += ` | Time of Day: ${activeLocation.timeOfDay}`;
    if (activeLocation.weather) ctx += ` | Weather: ${activeLocation.weather}`;
    if (activeLocation.atmosphere) ctx += ` | Atmosphere: ${activeLocation.atmosphere}`;
    if (activeLocation.keyProps) ctx += ` | Key Props: ${activeLocation.keyProps}`;
    if (activeLocation.practicalLighting) ctx += ` | Practical Lighting: ${activeLocation.practicalLighting}`;
    ctx += "\n";
  }
  return ctx;
};

const referenceLockClause = (hasCharRef: boolean, hasLocRef: boolean): string => {
  if (!hasCharRef && !hasLocRef) return "";
  return `
=============================================
REFERENCE LOCK — THE PROVIDED REFERENCE IMAGES ARE THE ONLY AUTHORITY
=============================================
- The PEOPLE in this image are defined ONLY by the character reference image(s).
  Reproduce each character's exact face, bone structure, eye color, hairline,
  skin tone, age, and build. Do NOT age, stylize, beautify, or swap faces.
- The ENVIRONMENT is defined ONLY by the location reference image. Reproduce that
  exact place; do NOT invent a different room or landscape.
- Do NOT add, invent, or borrow any other person or face from anywhere.
- Use the written description ONLY for pose, action, framing, expression, wardrobe
  context, and lighting mood — NEVER to override the reference images on identity
  or environment.`;
};

const buildDialogueContext = (shot: Shot, allCharacters: Character[]): string => {
  if (!shot.dialogueLines || shot.dialogueLines.length === 0) return "";
  let ctx = "\nDIALOGUE (characters may be speaking/reacting):\n";
  shot.dialogueLines.forEach((line) => {
    const speaker = allCharacters.find((c) => c.id === line.speakerId)?.name || "Unknown";
    ctx += `- ${speaker}: "${line.text}"\n`;
  });
  return ctx;
};

/** Director's free-text notes for the shot, applied as an explicit directive. */
const buildDirectorNotes = (shot: Shot): string =>
  shot.notes && shot.notes.trim()
    ? `\nDIRECTOR'S NOTES (apply these):\n${shot.notes.trim()}\n`
    : "";

// ---- reference image collection ---------------------------------------

interface RefImage {
  dataUrl: string;
}

/** Collect the reference images for a shot (character portraits + selected
 * turnarounds, then location image + selected turnarounds). Capped to keep
 * token cost reasonable since gpt-image-2 processes all inputs at high fidelity. */
const collectShotReferences = (
  activeCharacters: Character[],
  activeLocation: Location | undefined
): RefImage[] => {
  const refs: RefImage[] = [];

  activeCharacters
    .filter((c) => c.imageUrl)
    .slice(0, 3)
    .forEach((c) => {
      refs.push({ dataUrl: c.imageUrl! });
      const selected = (c.turnaroundImages || []).filter((t) => t.isSelected).slice(0, 1);
      selected.forEach((t) => refs.push({ dataUrl: t.imageUrl }));
    });

  if (activeLocation?.imageUrl) {
    refs.push({ dataUrl: activeLocation.imageUrl });
    const selectedLoc = (activeLocation.turnaroundImages || []).filter((t) => t.isSelected).slice(0, 1);
    selectedLoc.forEach((t) => refs.push({ dataUrl: t.imageUrl }));
  }

  return refs;
};

// ---- request executors -------------------------------------------------

const requestGeneration = async (prompt: string, size: string, quality: string): Promise<string> => {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) throw new Error("OpenAI API key is required. Add it in Settings.");

  const response = await fetch(OPENAI_IMAGE_GENERATIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_IMAGE_MODEL,
      prompt,
      size,
      quality,
      n: 1,
    }),
  });

  if (!response.ok) await handleOpenAIError(response);
  return extractB64(await response.json());
};

const requestEdit = async (
  prompt: string,
  size: string,
  quality: string,
  images: RefImage[]
): Promise<string> => {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) throw new Error("OpenAI API key is required. Add it in Settings.");

  const form = new FormData();
  form.append("model", OPENAI_IMAGE_MODEL);
  form.append("prompt", prompt);
  form.append("size", size);
  form.append("quality", quality);
  form.append("n", "1");
  const blobs = await Promise.all(images.map((img) => imageInputToBlob(img.dataUrl)));
  blobs.forEach((blob, i) => {
    form.append("image[]", blob, `ref_${i}.${extForBlob(blob)}`);
  });

  const response = await fetch(OPENAI_IMAGE_EDITS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` }, // do NOT set Content-Type — browser sets multipart boundary
    body: form,
  });

  if (!response.ok) await handleOpenAIError(response);
  return extractB64(await response.json());
};

// ---- public API --------------------------------------------------------

/**
 * Generate an asset (Character/Location) reference image from text.
 */
export const generateAssetImageOpenAI = async (
  type: "Character" | "Location",
  name: string,
  description: string,
  settings: CinematicSettings
): Promise<string> => {
  const grade = settings.colorGrade ? `, ${settings.colorGrade} color grade` : "";
  const prompt =
    type === "Character"
      ? `Full body character design sheet, cinematic lighting, clean neutral studio background. Character: ${name}. Description: ${description}. Photorealistic, shot on ${settings.filmStock} with ${settings.lens}, ${settings.lighting} lighting${grade}, in the style of ${settings.cinematographer}.`
      : `Cinematic wide establishing shot of a location. Location: ${name}. Description: ${description}. Photorealistic, shot on ${settings.filmStock} with ${settings.lens}, ${settings.lighting} lighting${grade}, in the style of ${settings.cinematographer}.`;

  const size = type === "Character" ? "1024x1024" : mapAspectRatioToSize(settings.aspectRatio);
  return requestGeneration(prompt, size, mapResolutionToQuality(settings.resolution));
};

/**
 * Generate a cinematic keyframe for a shot using gpt-image-2.
 * Uses the /edits endpoint with character + location references when
 * available; otherwise falls back to text-only /generations.
 */
export const generateShotImageOpenAI = async (
  shot: Shot,
  settings: CinematicSettings,
  allCharacters: Character[],
  allLocations: Location[],
  _allShots: Shot[] = []
): Promise<string> => {
  const activeCharacters = allCharacters.filter((c) => shot.characters.includes(c.id));
  const activeLocation = allLocations.find((l) => l.id === shot.locationId);

  const references = collectShotReferences(activeCharacters, activeLocation);
  const hasCharRef = activeCharacters.some((c) => c.imageUrl);
  const hasLocRef = !!activeLocation?.imageUrl;

  const prompt = `
TASK: Generate a high-fidelity cinematic movie keyframe.

${buildShotTextContext(activeCharacters, activeLocation)}

SCENE ACTION & VISUAL DESCRIPTION
Action: ${shot.action}
Visual Description: ${shot.description}
${buildDialogueContext(shot, allCharacters)}
${buildDirectorNotes(shot)}
${buildTechnicalSpecs(shot, settings)}

Render with masterpiece quality: honour the color grade and film stock above, with realistic textures and volumetric lighting.
ONLY the characters listed above should appear as people in the image — do not add any other people or faces.
${referenceLockClause(hasCharRef, hasLocRef)}`.trim();

  const size = mapAspectRatioToSize(settings.aspectRatio);
  const quality = mapResolutionToQuality(settings.resolution);

  if (references.length > 0) {
    return requestEdit(prompt, size, quality, references);
  }
  return requestGeneration(prompt, size, quality);
};

/**
 * Alter an existing shot image (re-frame / re-angle) using gpt-image-2.
 * Sends the current image as the primary base, plus character + location refs.
 */
export const alterShotImageOpenAI = async (
  shot: Shot,
  settings: CinematicSettings,
  allCharacters: Character[],
  allLocations: Location[],
  _allShots: Shot[] = []
): Promise<string> => {
  if (!shot.imageUrl) throw new Error("No image to alter");

  const activeCharacters = allCharacters.filter((c) => shot.characters.includes(c.id));
  const activeLocation = allLocations.find((l) => l.id === shot.locationId);

  const hasCharRef = activeCharacters.some((c) => c.imageUrl);
  const hasLocRef = !!activeLocation?.imageUrl;

  // Current image FIRST (the base to transform), then supporting references.
  const references: RefImage[] = [{ dataUrl: shot.imageUrl }];
  collectShotReferences(activeCharacters, activeLocation).forEach((r) => references.push(r));

  const prompt = `
TASK: Alter and refine the FIRST provided image (the current shot).

Transform its composition to strictly match:
- NEW Shot Type: ${shot.shotType}
- NEW Camera Move: ${shot.cameraMove}

${buildShotTextContext(activeCharacters, activeLocation)}

SCENE ACTION & VISUAL DESCRIPTION
Action: ${shot.action}
Visual Description: ${shot.description}
${buildDialogueContext(shot, allCharacters)}
${buildDirectorNotes(shot)}
${buildTechnicalSpecs(shot, settings)}

Maintain the identity of the characters and the details of the location across the re-frame.
ONLY the characters from the references should appear as people — do not add any other people or faces.
${referenceLockClause(hasCharRef, hasLocRef)}`.trim();

  const size = mapAspectRatioToSize(settings.aspectRatio);
  const quality = mapResolutionToQuality(settings.resolution);

  return requestEdit(prompt, size, quality, references);
};
