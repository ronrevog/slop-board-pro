/**
 * Image-generation provider router.
 * -------------------------------------------------------------
 * Provides drop-in replacements for the three core image functions that the
 * UI calls (generateShotImage, alterShotImage, generateAssetImage) and
 * dispatches to either the Gemini backend (default) or the OpenAI
 * gpt-image-2 backend based on the GLOBAL toggle stored in
 * localStorage('image_provider').
 *
 * Components import these from here instead of geminiService so the backend
 * can be swapped without touching call sites. All other geminiService
 * functions (turnarounds, upscale, chat-edit, video, etc.) remain on Gemini.
 */

import { CinematicSettings, Character, Location, Shot, ImageProvider } from "../types";
import {
  generateShotImage as generateShotImageGemini,
  alterShotImage as alterShotImageGemini,
  generateAssetImage as generateAssetImageGemini,
} from "./geminiService";
import {
  generateShotImageOpenAI,
  alterShotImageOpenAI,
  generateAssetImageOpenAI,
} from "./openaiImageService";

const IMAGE_PROVIDER_KEY = "image_provider";

/** Read the global image provider toggle. Defaults to 'gemini'. */
export const getImageProvider = (): ImageProvider => {
  return localStorage.getItem(IMAGE_PROVIDER_KEY) === "openai" ? "openai" : "gemini";
};

/** Persist the global image provider toggle. */
export const setImageProvider = (provider: ImageProvider): void => {
  localStorage.setItem(IMAGE_PROVIDER_KEY, provider);
};

export const generateShotImage = (
  shot: Shot,
  settings: CinematicSettings,
  allCharacters: Character[],
  allLocations: Location[],
  allShots: Shot[] = []
): Promise<string> => {
  return getImageProvider() === "openai"
    ? generateShotImageOpenAI(shot, settings, allCharacters, allLocations, allShots)
    : generateShotImageGemini(shot, settings, allCharacters, allLocations, allShots);
};

export const alterShotImage = (
  shot: Shot,
  settings: CinematicSettings,
  allCharacters: Character[],
  allLocations: Location[],
  allShots: Shot[] = []
): Promise<string> => {
  return getImageProvider() === "openai"
    ? alterShotImageOpenAI(shot, settings, allCharacters, allLocations, allShots)
    : alterShotImageGemini(shot, settings, allCharacters, allLocations, allShots);
};

export const generateAssetImage = (
  type: "Character" | "Location",
  name: string,
  description: string,
  settings: CinematicSettings
): Promise<string> => {
  return getImageProvider() === "openai"
    ? generateAssetImageOpenAI(type, name, description, settings)
    : generateAssetImageGemini(type, name, description, settings);
};
