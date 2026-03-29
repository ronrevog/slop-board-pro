
import { GoogleGenAI } from "@google/genai";
import { CinematicSettings, Character, Location, Shot, ChatMessage } from "../types";
import { ANAMORPHIC_LENS_PROMPTS, COMPOSITION_PROMPTS } from "../constants";

// Helper to sanitize JSON strings
const cleanJson = (text: string) => {
  const match = text.match(/```json([\s\S]*?)```/);
  return match ? match[1].trim() : text.trim();
};

// Helper to strip data URI prefix for API calls
const stripBase64Header = (base64: string) => {
  return base64.replace(/^data:image\/\w+;base64,/, "");
};

const getMimeType = (base64: string) => {
  return base64.match(/^data:(image\/\w+);base64,/)?.[1] || "image/jpeg";
};

// Map project resolution to Gemini image generation imageSize
// 'basic' returns '2K' (original default behavior)
const mapResolutionToImageSize = (resolution: string): string => {
  const mapping: Record<string, string> = {
    'basic': '2K',
    '720p': '1K',
    '1080p': '2K',
    '4k': '4K',
  };
  return mapping[resolution] || '2K';
};

// Map project resolution to Veo video resolution parameter
// 'basic' returns null — callers should fall back to model-dependent resolution
const mapResolutionToVideoRes = (resolution: string, model?: 'fast' | 'quality'): string => {
  if (resolution === 'basic' || !resolution) {
    // Original behavior: quality=1080p, fast=720p
    return model === 'quality' ? '1080p' : '720p';
  }
  const mapping: Record<string, string> = {
    '720p': '720p',
    '1080p': '1080p',
    '4k': '4k',
  };
  return mapping[resolution] || '720p';
};

// Map project aspect ratio to Gemini API-supported ratios
const mapAspectRatio = (ratio: string): string => {
  // Gemini supports: 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9, 1:4, 4:1, 1:8, 8:1
  const mapping: Record<string, string> = {
    '1:1': '1:1',
    '2:3': '2:3',
    '3:2': '3:2',
    '3:4': '3:4',
    '4:3': '4:3',
    '4:5': '4:5',
    '5:4': '5:4',
    '9:16': '9:16',
    '16:9': '16:9',
    '21:9': '21:9',
    '2.39:1': '21:9', // Cinemascope maps to ultra-wide
    '1:4': '1:4',
    '4:1': '4:1',
    '1:8': '1:8',
    '8:1': '8:1',
  };
  return mapping[ratio] || '16:9';
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

// Helper to extract last frame from a video URL (Blob or Base64)
const getLastFrameFromVideo = (videoUrl: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = videoUrl;
    video.crossOrigin = "anonymous";
    video.muted = true;

    // Safety timeout
    const timeout = setTimeout(() => reject(new Error("Video frame extraction timed out")), 5000);

    video.onloadeddata = () => {
      // Seek to the very end
      video.currentTime = Math.max(0, video.duration - 0.1);
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("No canvas context");

        ctx.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

        clearTimeout(timeout);
        // Clean up
        video.src = "";
        video.load();

        resolve(dataUrl);
      } catch (e) {
        reject(e);
      }
    };

    video.onerror = (e) => {
      clearTimeout(timeout);
      reject(new Error("Video load failed during frame extraction"));
    };
  });
};

const getApiKey = () => {
  return process.env.API_KEY || localStorage.getItem('gemini_api_key') || "";
};

const getAI = () => new GoogleGenAI({ apiKey: getApiKey() });

export interface ScriptBreakdownShot {
  description: string;
  shotType: string;
  cameraMove: string;
  action: string;
  dialogue?: string;
  speaker?: string;
}

export interface ExtractedCharacter {
  name: string;
  description: string;
}

export interface ExtractedLocation {
  name: string;
  description: string;
}

export interface ScriptAnalysisResult {
  shots: ScriptBreakdownShot[];
  characters: ExtractedCharacter[];
  locations: ExtractedLocation[];
}

export interface ExtractedScene {
  name: string;
  scriptContent: string;
  locationName: string;  // Reference to location name for linking
  shots: ScriptBreakdownShot[];
}

export interface ScreenplayAnalysisResult {
  scenes: ExtractedScene[];
  characters: ExtractedCharacter[];
  locations: ExtractedLocation[];
}

export interface CoverageShotSpec {
  coverageType: string; // e.g. "Master Wide", "OTS A→B", etc.
  description: string;
  shotType: string;
  cameraMove: string;
  action: string;
  dialogue?: string;
  speaker?: string;
  focusCharacter?: string; // Character name this shot focuses on
}

/**
 * Generates 8 standard coverage shots for a scene.
 * Coverage includes: Master Wide, Two-Shot, Close-ups of each character,
 * Over-the-shoulder shots, and unique angles.
 */
export const generateCoverageShots = async (
  sceneDescription: string,
  characters: Character[],
  location: Location | undefined,
  settings: CinematicSettings,
  existingShots: Shot[] = []
): Promise<CoverageShotSpec[]> => {
  const ai = getAI();

  // Build character list for context
  const characterNames = characters.map(c => c.name).join(', ') || 'unspecified characters';
  const characterDescriptions = characters.map(c => `- ${c.name}: ${c.description || 'No description'}`).join('\n') || 'No character details available';

  // Build location context
  const locationContext = location
    ? `Location: ${location.name} - ${location.description || 'No description'}`
    : 'Location: Unspecified';

  // Build existing shots context
  let existingShotsContext = "";
  if (existingShots.length > 0) {
    existingShotsContext = `\nEXISTING SHOTS IN SCENE (for context, avoid exact duplicates):\n`;
    existingShots.slice(0, 5).forEach((s, i) => {
      existingShotsContext += `- Shot ${i + 1}: ${s.shotType}, ${s.description?.slice(0, 100) || 'No description'}\n`;
    });
  }

  const prompt = `
  <role>
  You are an expert cinematographer and 1st AD (Assistant Director) creating a comprehensive coverage plan for a scene.
  Your job: Generate exactly 8 professional coverage shots that would allow an editor to cut together this scene seamlessly.
  </role>

  <scene_context>
  Scene Description/Script: ${sceneDescription || 'A dialogue scene between characters'}
  
  Characters in Scene:
  ${characterDescriptions}
  
  ${locationContext}
  ${existingShotsContext}
  </scene_context>

  <cinematic_style>
  - Director of Photography Style: ${settings.cinematographer}
  - Film Stock: ${settings.filmStock}
  - Lenses: ${settings.lens}
  - Lighting: ${settings.lighting}
  </cinematic_style>

  <coverage_requirements>
  Generate EXACTLY 8 coverage shots following standard film coverage patterns:
  
  1. **MASTER WIDE** - Establishes the full scene, all characters visible, shows environment
  2. **MEDIUM TWO-SHOT** - Both/main characters in frame at medium distance (waist up)
  3. **CLOSE-UP CHARACTER A** - ${characters[0]?.name || 'First character'}'s dialogue/reaction shot
  4. **CLOSE-UP CHARACTER B** - ${characters[1]?.name || characters[0]?.name || 'Second character'}'s dialogue/reaction shot
  5. **OVER-THE-SHOULDER A→B** - Camera behind ${characters[0]?.name || 'Character A'}, looking at ${characters[1]?.name || 'Character B'}
  6. **OVER-THE-SHOULDER B→A** - Camera behind ${characters[1]?.name || 'Character B'}, looking at ${characters[0]?.name || 'Character A'}
  7. **HIGH ANGLE / OVERHEAD** - Looking down on the scene for dramatic effect or to show spatial relationship
  8. **LOW ANGLE / UNIQUE** - Dramatic low angle, Dutch angle, or creative insert shot

  If there's only ONE character, replace OTS shots with:
  - POV shot (what the character sees)
  - Insert shot (hands, object, detail)
  - Profile shot
  - Extreme close-up (eyes, mouth)
  </coverage_requirements>

  <output_format>
  Return ONLY a valid JSON array with EXACTLY 8 objects:
  [
    {
      "coverageType": "Master Wide",
      "description": "Detailed visual description of composition, what's in frame, foreground/background elements",
      "shotType": "Wide",
      "cameraMove": "Static",
      "action": "What happens in this shot",
      "dialogue": "Any dialogue (optional, can be empty string)",
      "speaker": "Speaker name (optional, can be empty string)",
      "focusCharacter": "Character name this shot focuses on (optional)"
    }
  ]
  
  Valid shotType values: "Extreme Wide", "Wide", "Medium", "Close Up", "Extreme Close Up", "Insert", "High Angle", "Low Angle", "Dutch Angle (45°)", "Overhead", "Over the Shoulder"
  Valid cameraMove values: "Static", "Dolly In", "Dolly Out", "Pan", "Tilt", "Handheld", "Tracking", "Crane", "Arc", "Zoom In", "Zoom Out", "Whip Pan"
  </output_format>
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.7,
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");

    const result = JSON.parse(cleanJson(text));

    // Ensure we have exactly 8 shots
    if (!Array.isArray(result) || result.length === 0) {
      throw new Error("Invalid coverage response");
    }

    return result.slice(0, 8); // Ensure max 8 shots
  } catch (error) {
    console.error("Coverage Generation Error:", error);
    throw error;
  }
};

/**
 * Comprehensive script analysis that extracts characters, locations, and shot breakdown.
 * Uses gemini-3-pro-preview with Deep Think (thinkingConfig) for advanced narrative analysis.
 */
export const analyzeScript = async (
  scriptText: string,
  settings: CinematicSettings
): Promise<ScriptAnalysisResult> => {
  const ai = getAI();

  const prompt = `
  <role>
  You are a master storyboard artist, cinematographer, and film director combined.
  You have worked with Spielberg, Kubrick, Nolan, and Villeneuve.
  Your job: Analyze the provided SCRIPT with extreme attention to detail and create a comprehensive, 
  SHOT-BY-SHOT storyboard that unfolds the narrative visually like a professional film.
  </role>

  <input_script>
  ${scriptText}
  </input_script>

  <cinematic_style>
  - Director of Photography Style: ${settings.cinematographer}
  - Film Stock: ${settings.filmStock}
  - Lenses: ${settings.lens}
  - Lighting: ${settings.lighting}
  </cinematic_style>

  <deep_analysis_instructions>
  ⚠️ CRITICAL: You MUST deeply analyze the script before generating shots.
  
  STEP 1 - PARSE THE NARRATIVE:
  - Read the ENTIRE script word by word
  - Identify every scene location change
  - Note every character entrance/exit
  - Mark every emotional beat (tension, relief, conflict, revelation, climax)
  - Identify key visual moments (a glance, a gesture, an object)
  
  STEP 2 - PLAN EACH SCENE:
  For each scene/location in the script:
  a) ESTABLISHING SHOT - Where are we? What time of day?
  b) MASTER SHOT - Show the geography, all characters in scene
  c) COVERAGE SHOTS - For dialogue: alternating singles, OTS shots, reaction shots
  d) INSERT SHOTS - Important objects, hands, details mentioned in script
  e) TRANSITION - How do we exit? Cut, dissolve, match cut?
  
  STEP 3 - MATCH SHOTS TO EMOTION:
  - Close-Up = Intimacy, emotion, importance
  - Wide Shot = Isolation, establishing, scale
  - Dutch Angle = Unease, disorientation
  - Low Angle = Power, dominance
  - High Angle = Vulnerability, surveillance
  - Handheld = Chaos, documentary feel, urgency
  - Dolly In = Drawing viewer attention, revelation
  - Dolly Out = Releasing, showing context
  
  STEP 4 - CREATE RHYTHM:
  - Vary shot lengths (don't make all shots the same type)
  - Action scenes = more shots, faster cutting
  - Emotional scenes = longer takes, fewer cuts
  - Build to climax with tighter framing
  </deep_analysis_instructions>

  <extraction_rules>
  1. **CHARACTERS**: Extract EVERY character mentioned, named, or implied. Include:
     - Name (use descriptive names like "Old Man" or "Guard #1" if no name given)
     - Detailed physical description: age, gender, build, hair, clothing/costume, distinguishing features
     - Role in the story and personality traits if apparent
  
  2. **LOCATIONS**: Extract EVERY unique location/setting. Include:
     - Name (e.g. "Downtown Alley", "Sarah's Apartment", "Police Station Lobby")
     - Detailed environmental description: time of day, weather, architecture, lighting conditions, mood, key props/furniture
  
  3. **SHOTS** - THE STORYBOARD (MOST IMPORTANT):
     Generate 10-30 shots that tell the COMPLETE story. Every major story beat needs a shot.
     
     For EACH shot, you MUST specify:
     - description: HYPER-SPECIFIC visual composition 
       ✓ GOOD: "Low angle close-up of JACK's face, sweat beading on forehead, eyes wide with manic intensity. The typewriter keys are visible in soft focus foreground. Harsh tungsten light from desk lamp creates deep shadows under his eyes."
       ✗ BAD: "Shot of Jack looking crazy"
     
     - shotType: Choose based on emotional need, not randomly
     - cameraMove: Every move must have PURPOSE. Static = stability. Handheld = chaos.
     - action: What CHANGES or HAPPENS in this shot. Be specific.
     - dialogue: Include the EXACT line if there is one
     - speaker: Who says it
     
     SHOT SEQUENCE RULES:
     - Start scenes with WIDE establishing shots
     - Dialogue scenes need: Master → OTS A → OTS B → Singles → Reactions
     - Action scenes need: Wide geography → Medium action → Close details → Wide aftermath
     - End scenes with transition shots (character exiting, door closing, sunset, etc.)
     - EVERY line of dialogue should have a corresponding shot
  </extraction_rules>

  <output_format>
  Return ONLY a valid JSON object with this exact schema:
  {
    "characters": [
      {
        "name": "Character Name",
        "description": "Detailed physical description including age, appearance, clothing, personality traits"
      }
    ],
    "locations": [
      {
        "name": "Location Name",
        "description": "Detailed environment description including time of day, atmosphere, architecture, key features"
      }
    ],
    "shots": [
      {
        "description": "HYPER-DETAILED visual composition - camera angle, framing, what's in foreground/background, lighting quality, depth of field, character positioning, facial expressions, visible props",
        "shotType": "Extreme Wide | Wide | Medium | Close Up | Extreme Close Up | Insert | High Angle | Low Angle | Dutch Angle (45°) | Overhead | Over the Shoulder",
        "cameraMove": "Static | Dolly In | Dolly Out | Pan | Tilt | Handheld | Tracking | Crane | Arc | Zoom In | Zoom Out | Whip Pan",
        "action": "What SPECIFICALLY happens - character movements, gestures, expressions changing",
        "dialogue": "Exact spoken line (empty string if none)",
        "speaker": "Character name (empty string if none)"
      }
    ]
  }
  
  IMPORTANT: Generate enough shots to cover the ENTIRE script. If the script has 5 scenes, you need at least 15-25 shots. 
  One line of dialogue = at least one shot. One action beat = at least one shot.
  </output_format>
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.7,
        // Enable Deep Think with extended reasoning budget
        thinkingConfig: {
          thinkingBudget: 10000 // Allow extensive reasoning for narrative analysis
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");

    const result = JSON.parse(cleanJson(text));

    // Ensure proper structure
    return {
      characters: result.characters || [],
      locations: result.locations || [],
      shots: result.shots || []
    };
  } catch (error) {
    console.error("Script Analysis Error:", error);
    throw error;
  }
};

/**
 * Analyzes a full screenplay PDF/text and extracts multiple scenes with characters, locations, and shots.
 * Uses gemini-3-pro-preview with Deep Think for comprehensive screenplay parsing.
 * @param scriptText - The extracted text from the screenplay (PDF or pasted)
 * @param settings - Cinematic settings for shot generation
 * @param isStandardFormat - If true, uses strict screenplay format parsing (INT./EXT. headers, etc.)
 */
export const analyzeScreenplayPDF = async (
  scriptText: string,
  settings: CinematicSettings,
  isStandardFormat: boolean = true
): Promise<ScreenplayAnalysisResult> => {
  const ai = getAI();

  const formatInstructions = isStandardFormat ? `
  <screenplay_format_rules>
  This is a STANDARD SCREENPLAY FORMAT. Parse it using these rules:
  
  SCENE HEADERS (SLUG LINES):
  - Each scene starts with "INT." (Interior) or "EXT." (Exterior)
  - Format: INT./EXT. LOCATION NAME - TIME OF DAY
  - Examples: "INT. OVERLOOK HOTEL - LOBBY - DAY", "EXT. MAZE - NIGHT"
  - Create a NEW SCENE for EVERY scene header you find
  
  CHARACTER NAMES:
  - Character names appear in ALL CAPS when they speak
  - Parentheticals like (V.O.), (O.S.), (CONT'D) follow the name
  - Extract every unique character name
  
  ACTION LINES:
  - Descriptions between dialogue blocks
  - May contain character descriptions, movements, props
  
  DIALOGUE:
  - Appears indented under character names
  - Parentheticals like (whispering), (angry) may appear
  </screenplay_format_rules>
  ` : `
  <freeform_parsing_rules>
  This script is NOT in standard screenplay format. Use AI inference to:
  - Detect scene changes from context (location changes, time jumps, "CUT TO:", etc.)
  - Identify character names from dialogue attribution or context
  - Infer locations from descriptions
  - Do your best to break the text into logical scenes
  </freeform_parsing_rules>
  `;

  const prompt = `
  <role>
  You are a professional screenplay analyst, script supervisor, and storyboard artist.
  Your job: Parse this ENTIRE screenplay and extract ALL scenes, characters, locations, and generate shot breakdowns for each scene.
  </role>

  <input_screenplay>
  ${scriptText}
  </input_screenplay>

  ${formatInstructions}

  <cinematic_style>
  - Director of Photography Style: ${settings.cinematographer}
  - Film Stock: ${settings.filmStock}
  - Lenses: ${settings.lens}
  - Lighting: ${settings.lighting}
  </cinematic_style>

  <deep_analysis_instructions>
  ⚠️ CRITICAL: You MUST analyze the ENTIRE screenplay thoroughly.
  
  STEP 1 - EXTRACT ALL SCENES:
  - Find every scene header (INT./EXT.) or scene break
  - Give each scene a descriptive name (e.g., "Scene 1: INT. HOTEL LOBBY - DAY")
  - Extract the full script content for each scene
  - Identify which location each scene takes place in
  
  STEP 2 - EXTRACT ALL CHARACTERS:
  - Find every character who speaks or is mentioned
  - For speaking characters, extract their name from dialogue headers
  - Infer physical descriptions from action lines where possible
  - Note their role/personality if apparent
  
  STEP 3 - EXTRACT ALL LOCATIONS:
  - Create a unique location for each distinct setting
  - Include time of day, atmosphere, key features
  - Merge similar locations (e.g., "INT. HOTEL LOBBY" and "INT. HOTEL - LOBBY" are the same)
  
  STEP 4 - GENERATE SHOTS PER SCENE:
  For EACH scene, generate 3-10 shots that cover:
  - Establishing shot
  - Coverage for dialogue
  - Key action moments
  - Reactions and inserts
  - Transition out
  </deep_analysis_instructions>

  <output_format>
  Return ONLY a valid JSON object with this exact schema:
  {
    "characters": [
      {
        "name": "CHARACTER NAME",
        "description": "Physical description, age, clothing, personality traits inferred from script"
      }
    ],
    "locations": [
      {
        "name": "Location Name (e.g., Hotel Lobby, Danny's Bedroom, The Maze)",
        "description": "Detailed environment description: architecture, atmosphere, time of day, key props, lighting"
      }
    ],
    "scenes": [
      {
        "name": "Scene 1: INT. LOCATION - TIME",
        "scriptContent": "The full script text for this scene (dialogue + action lines)",
        "locationName": "Location Name (must match a location in the locations array)",
        "shots": [
          {
            "description": "Detailed visual composition for this shot",
            "shotType": "Wide | Medium | Close Up | etc.",
            "cameraMove": "Static | Dolly In | Pan | etc.",
            "action": "What happens in this shot",
            "dialogue": "Spoken line if any",
            "speaker": "Character name if dialogue"
          }
        ]
      }
    ]
  }
  
  IMPORTANT:
  - Create a scene entry for EVERY distinct scene in the screenplay
  - Each scene's locationName MUST match exactly one location in the locations array
  - Generate enough shots per scene to cover the key moments (3-10 shots per scene)
  - Include ALL dialogue in the shots
  </output_format>
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.7,
        // Enable Deep Think with extended reasoning budget for full screenplay
        thinkingConfig: {
          thinkingBudget: 15000 // Extended budget for full screenplay analysis
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");

    const result = JSON.parse(cleanJson(text));

    // Validate and ensure proper structure
    return {
      characters: result.characters || [],
      locations: result.locations || [],
      scenes: result.scenes || []
    };
  } catch (error) {
    console.error("Screenplay Analysis Error:", error);
    throw error;
  }
};

/**
 * Extracts text content from a PDF file using Gemini's multimodal capabilities.
 * @param pdfBase64 - Base64 encoded PDF file
 */
export const extractTextFromPDF = async (pdfBase64: string): Promise<string> => {
  const ai = getAI();

  // Strip the data URI prefix if present
  const base64Data = pdfBase64.replace(/^data:application\/pdf;base64,/, "");

  const prompt = `Extract ALL text content from this PDF document. 
  Preserve the formatting as much as possible, including:
  - Scene headers (INT./EXT. lines)
  - Character names in caps
  - Dialogue indentation
  - Action lines
  - Page breaks (indicate with "---")
  
  Return the complete text content of the screenplay.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: base64Data
            }
          },
          { text: prompt }
        ]
      },
      config: {
        temperature: 0.1 // Low temperature for accurate extraction
      }
    });

    const text = response.text;
    if (!text) throw new Error("No text extracted from PDF");

    return text;
  } catch (error) {
    console.error("PDF Extraction Error:", error);
    throw error;
  }
};

/**
 * Analyzes the raw script and breaks it down into a shot list only.
 * Uses gemini-3-pro-preview for complex reasoning.
 * @deprecated Use analyzeScript for comprehensive extraction
 */
export const breakdownScript = async (
  scriptText: string,
  settings: CinematicSettings
): Promise<ScriptBreakdownShot[]> => {
  const ai = getAI();

  const prompt = `
  <role>
  You are an award-winning trailer director + cinematographer + storyboard artist.
  Your job: Turn the provided SCRIPT into a cohesive cinematic storyboard sequence.
  </role>

  <input_script>
  ${scriptText}
  </input_script>

  <cinematic_style>
  - Director of Photography Style: ${settings.cinematographer}
  - Film Stock: ${settings.filmStock}
  - Lenses: ${settings.lens}
  - Lighting: ${settings.lighting}
  </cinematic_style>

  <non-negotiable rules - continuity & truthfulness>
  1) Analyze the full composition: identify ALL key subjects and describe spatial relationships.
  2) Strict continuity across ALL shots: same subjects, same wardrobe, same environment, same time-of-day.
  3) Depth of field must be realistic: deeper in wides, shallower in close-ups.
  4) Keep ONE consistent cinematic color grade across the entire sequence.
  </non-negotiable rules - continuity & truthfulness>

  <process>
  1. **Scene Breakdown**: Identify key subjects, environment, lighting, and visual anchors.
  2. **Theme & Story**: Determine the emotional arc (setup → build → turn → payoff).
  3. **Cinematic Approach**: Plan shot progression (Wide -> Close or reverse), camera movement, and lenses to support the arc.
  4. **Keyframes**: Generate 5-15 shots that create a cohesive sequence using the style of ${settings.cinematographer}.
  </process>

  <output_format>
  Return ONLY a valid JSON array of objects.
  Schema:
  [
    {
      "description": "Detailed visual description of composition, foreground/background, lighting, and depth. (e.g. 'Low angle, over-the-shoulder of Character A, strong silhouette against window')",
      "shotType": "Extreme Wide | Wide | Medium | Close Up | Extreme Close Up | Insert | High Angle | Low Angle | Dutch Angle (45°)",
      "cameraMove": "Static | Dolly In | Dolly Out | Pan | Tilt | Handheld | Tracking | Crane | Arc",
      "action": "What visibly happens in the frame.",
      "dialogue": "Spoken line (optional)",
      "speaker": "Speaker name (optional)"
    }
  ]
  </output_format>
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.7,
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");

    return JSON.parse(cleanJson(text));
  } catch (error) {
    console.error("Script Breakdown Error:", error);
    throw error;
  }
};

/**
 * Selects adjacent shots from the same scene for visual continuity.
 * Prioritizes nearest neighbors (alternating before/after) and only includes shots with images.
 * Skips the current shot and any explicitly set reference shot.
 * 
 * CHARACTER OVERLAP FILTER: Only includes adjacent shots that share at least one
 * selected character with the current shot. This prevents character contamination
 * (e.g., NBA appearing in a Cort-only shot because the adjacent shot had NBA).
 * If no adjacent shots share characters, allows up to 1 shot for environment-only reference.
 */
const getAdjacentShotsWithImages = (
  currentShot: Shot,
  allShots: Shot[],
  maxCount: number = 5,
  excludeIds: string[] = []
): { shot: Shot; environmentOnly: boolean }[] => {
  const currentIndex = allShots.findIndex(s => s.id === currentShot.id);
  if (currentIndex === -1) return [];

  const excludeSet = new Set([currentShot.id, ...excludeIds]);
  const currentCharacterIds = new Set(currentShot.characters || []);
  const hasCharacters = currentCharacterIds.size > 0;

  const characterMatchShots: { shot: Shot; environmentOnly: boolean }[] = [];
  const environmentOnlyShots: { shot: Shot; environmentOnly: boolean }[] = [];

  // Alternate: 1 before, 1 after, 2 before, 2 after, etc.
  for (let offset = 1; characterMatchShots.length < maxCount; offset++) {
    const beforeIdx = currentIndex - offset;
    const afterIdx = currentIndex + offset;
    const hasBefore = beforeIdx >= 0;
    const hasAfter = afterIdx < allShots.length;

    if (!hasBefore && !hasAfter) break;

    for (const idx of [beforeIdx, afterIdx]) {
      if (idx < 0 || idx >= allShots.length) continue;
      const shot = allShots[idx];
      if (!shot.imageUrl || excludeSet.has(shot.id)) continue;

      if (!hasCharacters) {
        // If current shot has no characters selected, allow adjacent for environment only
        if (environmentOnlyShots.length < 1) {
          environmentOnlyShots.push({ shot, environmentOnly: true });
        }
      } else {
        // Check character overlap
        const adjCharacters = shot.characters || [];
        const hasOverlap = adjCharacters.some(cId => currentCharacterIds.has(cId));

        if (hasOverlap) {
          characterMatchShots.push({ shot, environmentOnly: false });
          if (characterMatchShots.length >= maxCount) break;
        } else if (environmentOnlyShots.length < 1) {
          // Keep at most 1 environment-only shot (for color grade / location continuity)
          environmentOnlyShots.push({ shot, environmentOnly: true });
        }
      }
    }
  }

  // Return character-matched shots first, then environment-only fallback if no matches
  if (characterMatchShots.length > 0) {
    return characterMatchShots;
  }
  return environmentOnlyShots;
};

/**
 * Generates an image for a Character or Location asset.
 * Uses gemini-3.1-flash-image-preview for maximum quality.
 */
export const generateAssetImage = async (
  type: 'Character' | 'Location',
  name: string,
  description: string,
  settings: CinematicSettings
): Promise<string> => {
  const ai = getAI();

  const prompt = type === 'Character'
    ? `Full body character design sheet, cinematic lighting. Character: ${name}. Description: ${description}. Style: Photorealistic, shot on ${settings.filmStock}, ${settings.lighting} lighting.`
    : `Cinematic wide shot of location. Location: ${name}. Description: ${description}. Style: Photorealistic, shot on ${settings.filmStock}, ${settings.cinematographer} style.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: { parts: [{ text: prompt }] },
      config: {
        responseModalities: ["IMAGE"],
        imageConfig: {
          aspectRatio: '1:1',
          imageSize: '2K'
        }
      }
    });

    if (response.candidates && response.candidates.length > 0) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
    }

    throw new Error("No image generated");
  } catch (error) {
    console.error("Asset Gen Error:", error);
    throw error;
  }
};

/**
 * Generates a cinematic storyboard image for a specific shot.
 * Uses gemini-3.1-flash-image-preview for Multimodal input support and strict consistency.
 * FALLBACK: If multimodal fails (500 error), falls back to text-only description generation.
 */
export const generateShotImage = async (
  shot: Shot,
  settings: CinematicSettings,
  allCharacters: Character[],
  allLocations: Location[],
  allShots: Shot[] = []
): Promise<string> => {
  const ai = getAI();

  // Resolve specific characters and location
  const activeCharacters = allCharacters.filter(c => shot.characters.includes(c.id));
  const activeLocation = allLocations.find(l => l.id === shot.locationId);
  const referenceShot = shot.referenceShotId ? allShots.find(s => s.id === shot.referenceShotId) : null;

  // Build Text Context - ONLY include characters and locations chosen for this shot
  // This prevents Gemini from getting confused by irrelevant references
  let textContext = "";

  if (activeCharacters.length > 0) {
    textContext += "CHARACTERS IN THIS SHOT:\n";
    activeCharacters.forEach(c => {
      textContext += `- ${c.name}: ${c.description || 'No description'}`;
      if ((c as any).wardrobe) textContext += ` | Wardrobe: ${(c as any).wardrobe}`;
      if ((c as any).physicalFeatures) textContext += ` | Physical: ${(c as any).physicalFeatures}`;
      if ((c as any).age) textContext += ` | Age: ${(c as any).age}`;
      textContext += '\n';
    });
  }

  if (activeLocation) {
    textContext += `\nSHOT LOCATION: "${activeLocation.name}" - ${activeLocation.description || 'No description'}`;
    if ((activeLocation as any).timeOfDay) textContext += ` | Time: ${(activeLocation as any).timeOfDay}`;
    if ((activeLocation as any).atmosphere) textContext += ` | Atmosphere: ${(activeLocation as any).atmosphere}`;
    if ((activeLocation as any).weather) textContext += ` | Weather: ${(activeLocation as any).weather}`;
    textContext += '\n';
  }

  // Build Dialogue Context for facial expressions/mouth shape
  let dialogueContext = "";
  if (shot.dialogueLines && shot.dialogueLines.length > 0) {
    dialogueContext = "\nDIALOGUE (Characters may be speaking/reacting):\n";
    shot.dialogueLines.forEach(line => {
      const speakerName = allCharacters.find(c => c.id === line.speakerId)?.name || "Unknown";
      dialogueContext += `- ${speakerName}: "${line.text}"\n`;
    });
  }

  // Check if using Panavision C-Series Anamorphic lens
  const isAnamorphicLens = settings.lens.startsWith("Panavision C-Series");
  const anamorphicPrompt = isAnamorphicLens ? ANAMORPHIC_LENS_PROMPTS[settings.lens] : null;

  // Build anamorphic-specific instructions if applicable
  let anamorphicInstructions = "";
  if (anamorphicPrompt) {
    anamorphicInstructions = `
    <ANAMORPHIC_LENS_PHYSICS>
    This shot uses a Panavision C-Series Anamorphic lens. Apply authentic anamorphic characteristics:
    
    ${anamorphicPrompt}
    
    Key anamorphic traits to include:
    - Oval/vertical bokeh ellipses in out-of-focus areas
    - Characteristic blue horizontal lens flares where light sources are present
    - Subtle barrel distortion on wide lenses
    - Classic cinematic anamorphic look
    </ANAMORPHIC_LENS_PHYSICS>
    `;
  }

  // Build composition technique instructions if applicable
  const compositionTechnique = shot.composition && shot.composition !== 'None' ? shot.composition : null;
  const compositionPrompt = compositionTechnique ? COMPOSITION_PROMPTS[compositionTechnique] : null;
  let compositionInstructions = "";
  if (compositionPrompt) {
    compositionInstructions = `
    <COMPOSITION_TECHNIQUE>
    ⚠️ MANDATORY COMPOSITION: ${compositionTechnique}
    ${compositionPrompt}
    You MUST arrange the visual elements in the frame according to this composition technique. This is a primary creative directive.
    </COMPOSITION_TECHNIQUE>
    `;
  }

  // Main Cinematic Prompt - Character/Location descriptions are CRITICAL and must be followed
  const mainPromptText = `
    TASK: Generate a high-fidelity cinematic movie keyframe.
    
    ⚠️ CRITICAL: YOU MUST CAREFULLY READ AND APPLY ALL CHARACTER AND LOCATION DETAILS BELOW ⚠️
    
    ${textContext}
    
    =============================================
    SCENE ACTION & VISUAL DESCRIPTION
    =============================================
    Action: ${shot.action}
    Visual Description: ${shot.description}
    ${dialogueContext}
    
    =============================================
    TECHNICAL SPECIFICATIONS
    =============================================
    - Cinematographer Style: ${settings.cinematographer}
    - Film Stock: ${settings.filmStock}
    - Lens: ${settings.lens}
    - Lighting: ${settings.lighting}
    - Shot Type: ${shot.shotType}
    - Camera Move: ${shot.cameraMove}
    - Aspect Ratio: ${settings.aspectRatio}
    ${compositionInstructions}
    ${anamorphicInstructions}

    =============================================
    MANDATORY INSTRUCTIONS
    =============================================
    1. **CHARACTER ACCURACY IS PARAMOUNT**: Each character MUST match their description EXACTLY as specified above. Pay close attention to:
       - Physical appearance (age, build, hair color, skin tone)
       - Clothing and costume details
       - Any distinguishing features mentioned
    
    2. **LOCATION ACCURACY IS PARAMOUNT**: The environment MUST match the location description EXACTLY as specified above. Pay attention to:
       - Architecture and setting details
       - Time of day and lighting conditions
       - Atmosphere and mood
       - Props and environmental elements
    
    3. If reference images are provided, use them for visual consistency but OVERRIDE with the text descriptions where they conflict.
    
    4. Render with "Masterpiece" quality: 8k resolution, professional color grading, realistic textures, volumetric lighting.
    
    5. If dialogue is present, characters should have appropriate facial expressions.
    ${isAnamorphicLens ? '6. Apply classic anamorphic lens characteristics: oval bokeh, blue horizontal flares, and cinematic depth.' : ''}
    
    ⚠️ CHARACTER EXCLUSION RULE: ONLY the characters listed above under "CHARACTERS IN THIS SHOT" should appear as people in the generated image. Do NOT add any other people, faces, or figures from reference images. If an adjacent reference shot shows different characters, IGNORE those people entirely — use the reference ONLY for color grade and environment.
  `;

  const targetRatio = mapAspectRatio(settings.aspectRatio);

  // ATTEMPT 1: MULTIMODAL (Images + Text)
  try {
    const parts: any[] = [];

    // 0. If reference shot is set, use EDIT mode (alterShotImage-style)
    // This forces true img2img by using "Edit this image" framing
    if (referenceShot && referenceShot.imageUrl) {
      // Use edit-style approach - inject reference as THE image to edit
      parts.push({
        inlineData: {
          mimeType: getMimeType(referenceShot.imageUrl),
          data: stripBase64Header(referenceShot.imageUrl)
        }
      });

      // Build edit-specific prompt that forces transformation of THIS image
      const editPrompt = `EDIT THIS IMAGE. Transform this exact scene to a ${shot.shotType} shot.

WHAT TO PRESERVE (DO NOT CHANGE):
- The SAME person/character (exact face, hair, skin tone, clothing)
- The SAME room/environment (same furniture, walls, objects)
- The SAME lighting style and color grade
- The SAME time period/aesthetic

WHAT TO CHANGE:
- Camera angle: Change to ${shot.shotType}
- Framing: ${shot.shotType === 'Close Up' || shot.shotType === 'Extreme Close Up' ? 'Zoom in on the characters face/upper body' : shot.shotType === 'Wide' || shot.shotType === 'Extreme Wide' ? 'Pull back to show more of the room' : 'Adjust framing as needed'}
- Action: ${shot.action || 'Keep the character in a similar pose'}
- Description: ${shot.description}
${shot.cameraMove !== 'Static' ? `- Camera movement feel: ${shot.cameraMove}` : ''}

CRITICAL: This must look like a DIFFERENT CAMERA ANGLE of the SAME SCENE - not a new image. The person must be recognizably THE SAME PERSON from the input image.`;

      parts.push({ text: editPrompt });

      // Add ONLY chosen character references (characters selected for this shot)
      const refActiveCharsWithImages = activeCharacters.filter(c => c.imageUrl);
      refActiveCharsWithImages.slice(0, 5).forEach(char => {
        // Main character image
        parts.push({
          inlineData: {
            mimeType: getMimeType(char.imageUrl!),
            data: stripBase64Header(char.imageUrl!)
          }
        });
        parts.push({
          text: `REFERENCE_CHARACTER_IN_SHOT: "${char.name}" — MUST appear in this shot. Use this EXACT appearance (face, hair, skin tone, clothing).`
        });
        // Include selected turnaround images for better consistency
        const selectedTurnarounds = (char.turnaroundImages || []).filter(t => t.isSelected);
        selectedTurnarounds.forEach((t, tIdx) => {
          parts.push({
            inlineData: {
              mimeType: getMimeType(t.imageUrl),
              data: stripBase64Header(t.imageUrl)
            }
          });
          parts.push({
            text: `REFERENCE_CHARACTER_TURNAROUND_${tIdx + 1}: "${char.name}" ${t.angle} — additional angle reference for consistency.`
          });
        });
      });

      // Add adjacent shots for continuity (up to 3 in edit mode, filtered by character overlap)
      const refAdjacentShots = getAdjacentShotsWithImages(shot, allShots, 3, [referenceShot.id]);
      refAdjacentShots.forEach(({ shot: adjShot, environmentOnly }, idx) => {
        parts.push({
          inlineData: {
            mimeType: getMimeType(adjShot.imageUrl!),
            data: stripBase64Header(adjShot.imageUrl!)
          }
        });
        parts.push({
          text: environmentOnly
            ? `REFERENCE_ENVIRONMENT_${idx + 1}: Nearby Shot #${adjShot.number} — use ONLY for color grade, lighting, and environment continuity. IGNORE all people/characters in this image.`
            : `REFERENCE_ADJACENT_SHOT_${idx + 1}: Nearby Shot #${adjShot.number} — maintain visual continuity with this shot.`
        });
      });

    } else {
      // NO REFERENCE - normal generation with reference images for consistency
      const hasUserRefPhotos = shot.referenceImages && shot.referenceImages.length > 0;
      const hasComposeRefs = !!(shot.sceneReferenceImage || shot.characterReferenceImage);
      const hasFullCompose = !!(shot.sceneReferenceImage && shot.characterReferenceImage);

      // 0. COMPOSE MODE — Scene Reference + Character Reference
      // When both are present: explicit compositing instruction
      // When only one is present: use as highest-priority reference
      if (hasFullCompose) {
        // Scene background first
        parts.push({
          inlineData: {
            mimeType: getMimeType(shot.sceneReferenceImage!),
            data: stripBase64Header(shot.sceneReferenceImage!)
          }
        });
        parts.push({
          text: `⚡ COMPOSE_SCENE_REFERENCE (HIGHEST PRIORITY): This is the BACKGROUND / ENVIRONMENT for this shot.
You MUST reproduce this exact location: same architecture, furniture, walls, lighting, atmosphere, colors.
Do NOT invent a different environment. Use THIS scene as the setting.`
        });

        // Character to composite in
        parts.push({
          inlineData: {
            mimeType: getMimeType(shot.characterReferenceImage!),
            data: stripBase64Header(shot.characterReferenceImage!)
          }
        });
        parts.push({
          text: `⚡ COMPOSE_CHARACTER_REFERENCE (HIGHEST PRIORITY): This is the CHARACTER / PERSON to place into the scene above.
CRITICAL COMPOSITING INSTRUCTIONS:
- Take THIS exact person (face, hair, skin tone, body type, clothing) from this photo
- Place them into the SCENE_REFERENCE environment above
- The character must look like they naturally belong in that scene
- Match the lighting direction and color temperature of the scene
- Apply the shot framing: ${shot.shotType} shot, ${shot.cameraMove} camera move
- Action happening: ${shot.action || shot.description}
- The result must look like a professional film still — NOT a photoshop cutout`
        });
      } else if (shot.sceneReferenceImage) {
        parts.push({
          inlineData: {
            mimeType: getMimeType(shot.sceneReferenceImage),
            data: stripBase64Header(shot.sceneReferenceImage)
          }
        });
        parts.push({
          text: `⚡ SCENE_REFERENCE (HIGHEST PRIORITY): This is the background/environment for this shot.
Reproduce this EXACT location as the setting. Same architecture, furniture, atmosphere.`
        });
      } else if (shot.characterReferenceImage) {
        parts.push({
          inlineData: {
            mimeType: getMimeType(shot.characterReferenceImage),
            data: stripBase64Header(shot.characterReferenceImage)
          }
        });
        parts.push({
          text: `⚡ CHARACTER_REFERENCE (HIGHEST PRIORITY): This is the character/person for this shot.
Use this EXACT person's face, hair, skin tone, body type, and clothing. Do NOT create a different person.`
        });
      }

      // 1. USER REFERENCE PHOTOS — high priority (style/mood references)
      if (hasUserRefPhotos) {
        shot.referenceImages!.forEach((refImg, idx) => {
          const base64Data = refImg.startsWith('data:') ? refImg.split(',')[1] : refImg;
          const mimeMatch = refImg.match(/data:(image\/[^;]+);/);
          const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
          parts.push({
            inlineData: {
              mimeType: mimeType,
              data: base64Data,
            }
          });
          parts.push({
            text: `⚠️ DIRECTOR_REFERENCE_PHOTO_${idx + 1} (HIGHEST PRIORITY): This is a reference photo provided by the director.
THIS TAKES PRIORITY OVER ALL OTHER REFERENCE IMAGES.
You MUST closely reproduce the visual qualities, composition, subject matter, style, mood, and lighting shown in this photo.
Adjacent shot continuity is SECONDARY to matching this reference.`
          });
        });
      }

      // 2. Inject Location Reference Image (only for the chosen location)
      if (activeLocation && activeLocation.imageUrl) {
        parts.push({
          inlineData: {
            mimeType: getMimeType(activeLocation.imageUrl),
            data: stripBase64Header(activeLocation.imageUrl)
          }
        });
        parts.push({
          text: `REFERENCE_IMAGE_LOCATION: This is the location "${activeLocation.name}". 
⚠️ CRITICAL: You MUST use this EXACT environment/room for the shot. 
Match the architecture, furniture, walls, lighting, and atmosphere from this image.
Do NOT create a different room - use THIS room.`
        });
        // Include selected location turnaround images for better environment consistency
        const selectedLocTurnarounds = (activeLocation.turnaroundImages || []).filter(t => t.isSelected);
        selectedLocTurnarounds.forEach((t, tIdx) => {
          parts.push({
            inlineData: {
              mimeType: getMimeType(t.imageUrl),
              data: stripBase64Header(t.imageUrl)
            }
          });
          parts.push({
            text: `REFERENCE_LOCATION_TURNAROUND_${tIdx + 1}: "${activeLocation.name}" ${t.angle} — additional angle of the same location for spatial consistency.`
          });
        });
      }

      // 3. Inject ONLY chosen Character Reference Images (characters selected for this shot)
      // Only characters toggled ON in the storyboard card get their images sent
      const activeCharsWithImages = activeCharacters.filter(c => c.imageUrl);
      activeCharsWithImages.slice(0, 5).forEach(char => {
        // Main character image
        parts.push({
          inlineData: {
            mimeType: getMimeType(char.imageUrl!),
            data: stripBase64Header(char.imageUrl!)
          }
        });
        parts.push({
          text: `REFERENCE_CHARACTER_IN_SHOT: This is "${char.name}" — this character MUST appear in this shot.
⚠️ CRITICAL: Use this EXACT person's face, hair, skin tone, and clothing. Do NOT create a different person.`
        });
        // Include selected turnaround images for better character consistency
        const selectedTurnarounds = (char.turnaroundImages || []).filter(t => t.isSelected);
        selectedTurnarounds.forEach((t, tIdx) => {
          parts.push({
            inlineData: {
              mimeType: getMimeType(t.imageUrl),
              data: stripBase64Header(t.imageUrl)
            }
          });
          parts.push({
            text: `REFERENCE_CHARACTER_TURNAROUND_${tIdx + 1}: "${char.name}" ${t.angle} — additional angle reference for character consistency.`
          });
        });
      });

      // 3. Inject Adjacent Scene Shots for visual continuity (filtered by character overlap)
      const adjacentShots = getAdjacentShotsWithImages(shot, allShots, hasUserRefPhotos ? 2 : 5);
      if (adjacentShots.length > 0) {
        adjacentShots.forEach(({ shot: adjShot, environmentOnly }, idx) => {
          parts.push({
            inlineData: {
              mimeType: getMimeType(adjShot.imageUrl!),
              data: stripBase64Header(adjShot.imageUrl!)
            }
          });
          parts.push({
            text: environmentOnly
              ? `REFERENCE_ENVIRONMENT_${idx + 1}: Nearby Shot #${adjShot.number} — use ONLY for color grade, lighting, and environment continuity. IGNORE all people/characters in this image — they are NOT in this shot.`
              : `REFERENCE_ADJACENT_SHOT_${idx + 1}: This is nearby Shot #${adjShot.number} from the same scene.
Maintain visual continuity: same color grade, lighting, environment details, and character appearances as this shot.`
          });
        });
      }

      // Add main prompt for normal generation
      parts.push({ text: mainPromptText });
    }

    const targetImageSize = mapResolutionToImageSize(settings.resolution || '1080p');

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: { parts: parts },
      config: {
        responseModalities: ["IMAGE"],
        imageConfig: {
          aspectRatio: targetRatio,
          imageSize: targetImageSize
        }
      }
    });

    if (response.candidates && response.candidates.length > 0) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
    }
    throw new Error("No multimodal image generated");

  } catch (error) {
    console.warn("Multimodal generation failed, attempting text-only fallback...", error);

    // ATTEMPT 2: TEXT-ONLY FALLBACK
    // This handles cases where 500 errors occur due to complexity or image processing limits
    try {
      const fallbackPrompt = `
       ${mainPromptText}
       
       <visual_fallback_references>
       ${textContext}
       </visual_fallback_references>
       `;

      const fallbackImageSize = mapResolutionToImageSize(settings.resolution || '1080p');

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: { parts: [{ text: fallbackPrompt }] },
        config: {
          responseModalities: ["IMAGE"],
          imageConfig: {
            aspectRatio: targetRatio,
            imageSize: fallbackImageSize
          }
        }
      });

      if (response.candidates && response.candidates.length > 0) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          }
        }
      }
      throw new Error("No image generated in fallback");
    } catch (fallbackError) {
      console.error("Shot Gen Error (Final):", fallbackError);
      throw fallbackError;
    }
  }
};

/**
 * Alters an existing shot using the current image as a base reference.
 */
export const alterShotImage = async (
  shot: Shot,
  settings: CinematicSettings,
  allCharacters: Character[],
  allLocations: Location[],
  allShots: Shot[] = []
): Promise<string> => {
  const ai = getAI();

  if (!shot.imageUrl) throw new Error("No image to alter");

  // Resolve specific characters and location
  const activeCharacters = allCharacters.filter(c => shot.characters.includes(c.id));
  const activeLocation = allLocations.find(l => l.id === shot.locationId);
  const referenceShot = shot.referenceShotId ? allShots.find(s => s.id === shot.referenceShotId) : null;

  // Build Text Context - ONLY include characters and locations chosen for this shot
  let textContext = "";

  if (activeCharacters.length > 0) {
    textContext += "CHARACTERS IN THIS SHOT:\n";
    activeCharacters.forEach(c => {
      textContext += `- ${c.name}: ${c.description || 'No description'}`;
      if ((c as any).wardrobe) textContext += ` | Wardrobe: ${(c as any).wardrobe}`;
      if ((c as any).physicalFeatures) textContext += ` | Physical: ${(c as any).physicalFeatures}`;
      if ((c as any).age) textContext += ` | Age: ${(c as any).age}`;
      textContext += '\n';
    });
  }

  if (activeLocation) {
    textContext += `\nSHOT LOCATION: "${activeLocation.name}" - ${activeLocation.description || 'No description'}`;
    if ((activeLocation as any).timeOfDay) textContext += ` | Time: ${(activeLocation as any).timeOfDay}`;
    if ((activeLocation as any).atmosphere) textContext += ` | Atmosphere: ${(activeLocation as any).atmosphere}`;
    textContext += '\n';
  }

  const parts: any[] = [];

  // 1. INJECT CURRENT SHOT AS PRIMARY REFERENCE
  parts.push({
    inlineData: {
      mimeType: getMimeType(shot.imageUrl),
      data: stripBase64Header(shot.imageUrl)
    }
  });
  parts.push({ text: "REFERENCE_START_IMAGE: This is the current shot. Use this as the visual base for CHARACTERS and LOCATION. However, you MUST re-frame the shot if the Shot Type or Angle has changed below." });

  // 1b. USER REFERENCE PHOTOS — highest priority after current shot
  const hasAlterUserRefPhotos = shot.referenceImages && shot.referenceImages.length > 0;
  if (hasAlterUserRefPhotos) {
    shot.referenceImages!.forEach((refImg, idx) => {
      const base64Data = refImg.startsWith('data:') ? refImg.split(',')[1] : refImg;
      const mimeMatch = refImg.match(/data:(image\/[^;]+);/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
      parts.push({
        inlineData: {
          mimeType: mimeType,
          data: base64Data,
        }
      });
      parts.push({
        text: `⚠️ DIRECTOR_REFERENCE_PHOTO_${idx + 1} (HIGHEST PRIORITY): This is a reference photo provided by the director.
THIS TAKES PRIORITY OVER adjacent shots and other references.
You MUST closely reproduce the visual qualities, composition, subject matter, style, mood, and lighting shown in this photo while transforming the start image.`
      });
    });
  }

  // 2. Inject Reference Shot (Scene Continuity)
  if (referenceShot && referenceShot.imageUrl && referenceShot.id !== shot.id) {
    parts.push({
      inlineData: {
        mimeType: getMimeType(referenceShot.imageUrl),
        data: stripBase64Header(referenceShot.imageUrl)
      }
    });
    parts.push({ text: `REFERENCE_SCENE_CONTINUITY: Also consider this shot (Shot #${referenceShot.number}) for environmental consistency.` });
  }

  // 3. Inject ONLY chosen Character References (characters selected for this shot)
  const alterActiveCharsWithImages = activeCharacters.filter(c => c.imageUrl);
  alterActiveCharsWithImages.slice(0, 5).forEach(char => {
    parts.push({
      inlineData: {
        mimeType: getMimeType(char.imageUrl!),
        data: stripBase64Header(char.imageUrl!)
      }
    });
    parts.push({
      text: `REFERENCE_CHARACTER_IN_SHOT: "${char.name}" — MUST appear. Use this EXACT appearance (face, hair, skin tone, clothing).`
    });
    // Include selected turnaround images for better consistency
    const selectedTurnarounds = (char.turnaroundImages || []).filter(t => t.isSelected);
    selectedTurnarounds.forEach((t, tIdx) => {
      parts.push({
        inlineData: {
          mimeType: getMimeType(t.imageUrl),
          data: stripBase64Header(t.imageUrl)
        }
      });
      parts.push({
        text: `REFERENCE_CHARACTER_TURNAROUND_${tIdx + 1}: "${char.name}" ${t.angle} — additional angle for consistency.`
      });
    });
  });

  // 4. Inject Location Reference (only the chosen location)
  if (activeLocation && activeLocation.imageUrl) {
    parts.push({
      inlineData: {
        mimeType: getMimeType(activeLocation.imageUrl),
        data: stripBase64Header(activeLocation.imageUrl)
      }
    });
    parts.push({ text: `REFERENCE_LOCATION: "${activeLocation.name}" — use this EXACT environment.` });
    // Include selected location turnaround images
    const selectedLocTurnarounds = (activeLocation.turnaroundImages || []).filter(t => t.isSelected);
    selectedLocTurnarounds.forEach((t, tIdx) => {
      parts.push({
        inlineData: {
          mimeType: getMimeType(t.imageUrl),
          data: stripBase64Header(t.imageUrl)
        }
      });
      parts.push({
        text: `REFERENCE_LOCATION_TURNAROUND_${tIdx + 1}: "${activeLocation.name}" ${t.angle} — additional angle for spatial consistency.`
      });
    });
  }

  // 5. Inject Adjacent Scene Shots for continuity (filtered by character overlap)
  const alterExcludeIds = referenceShot ? [referenceShot.id] : [];
  const alterAdjacentShots = getAdjacentShotsWithImages(shot, allShots, hasAlterUserRefPhotos ? 1 : 3, alterExcludeIds);
  alterAdjacentShots.forEach(({ shot: adjShot, environmentOnly }, idx) => {
    parts.push({
      inlineData: {
        mimeType: getMimeType(adjShot.imageUrl!),
        data: stripBase64Header(adjShot.imageUrl!)
      }
    });
    parts.push({
      text: environmentOnly
        ? `REFERENCE_ENVIRONMENT_${idx + 1}: Nearby Shot #${adjShot.number} — use ONLY for color grade, lighting, and environment continuity. IGNORE all people/characters in this image.`
        : `REFERENCE_ADJACENT_SHOT_${idx + 1}: Nearby Shot #${adjShot.number} — maintain visual continuity.`
    });
  });

  // Check if using Panavision C-Series Anamorphic lens
  const isAnamorphicLens = settings.lens.startsWith("Panavision C-Series");
  const anamorphicPrompt = isAnamorphicLens ? ANAMORPHIC_LENS_PROMPTS[settings.lens] : null;

  // Build anamorphic-specific instructions if applicable
  let anamorphicInstructions = "";
  if (anamorphicPrompt) {
    anamorphicInstructions = `
    <ANAMORPHIC_LENS_PHYSICS>
    This shot uses a Panavision C-Series Anamorphic lens. Apply authentic anamorphic characteristics:
    
    ${anamorphicPrompt}
    
    Key anamorphic traits to include:
    - Oval/vertical bokeh ellipses in out-of-focus areas
    - Characteristic blue horizontal lens flares where light sources are present
    - Classic cinematic anamorphic look
    </ANAMORPHIC_LENS_PHYSICS>
    `;
  }

  // 4. Main Prompt with override instructions
  const mainPrompt = `
    TASK: Alter and refine the provided start image.
    
    <TARGET_TECHNICAL_SPECS>
    - NEW Shot Type: ${shot.shotType}
    - NEW Camera Move: ${shot.cameraMove}
    - Cinematographer Style: ${settings.cinematographer}
    - Film Stock: ${settings.filmStock}
    - Lens: ${settings.lens}
    - Lighting: ${settings.lighting}
    - Aspect Ratio: ${settings.aspectRatio}
    </TARGET_TECHNICAL_SPECS>
    ${(() => {
      const ct = shot.composition && shot.composition !== 'None' ? shot.composition : null;
      const cp = ct ? COMPOSITION_PROMPTS[ct] : null;
      return cp ? `
    <COMPOSITION_TECHNIQUE>
    ⚠️ MANDATORY COMPOSITION: ${ct}
    ${cp}
    You MUST rearrange the visual elements to follow this composition technique.
    </COMPOSITION_TECHNIQUE>` : '';
    })()}
    ${anamorphicInstructions}
    <scene_description>
    Action: ${shot.action}
    Visual Description: ${shot.description}
    </scene_description>

    <instructions>
    1. **Primary Task**: Transform the composition of the REFERENCE_START_IMAGE to strictly match the NEW Shot Type and Camera Move.
       - If the user selected "High Angle", you MUST re-render the scene from above.
       - If the user selected "Low Angle", you MUST re-render from below.
       - If the user selected "Close Up" from a "Wide", crop and re-render the details.
    2. **Consistency**: Maintain the identity of the characters and the details of the location.
    ${isAnamorphicLens ? '3. **Anamorphic**: Apply classic anamorphic lens characteristics: oval bokeh, blue horizontal flares, and cinematic depth.' : ''}
    
    ⚠️ CHARACTER EXCLUSION RULE: ONLY the characters from the REFERENCE_START_IMAGE and REFERENCE_CHARACTER_IN_SHOT labels should appear as people. Do NOT add any other people, faces, or figures from adjacent reference shots. If an environment reference shows different characters, IGNORE those people entirely.
    </instructions>
  `;

  parts.push({ text: mainPrompt });

  const targetRatio = mapAspectRatio(settings.aspectRatio);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: { parts: parts },
      config: {
        responseModalities: ["IMAGE"],
        imageConfig: {
          aspectRatio: targetRatio,
          imageSize: mapResolutionToImageSize(settings.resolution || '1080p')
        }
      }
    });

    if (response.candidates && response.candidates.length > 0) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
    }

    throw new Error("No image generated in response");
  } catch (error) {
    console.error("Alter Shot Error:", error);
    throw error;
  }
};

/**
 * Updates an asset image by editing it with all the character/location details.
 * This takes the existing image and modifies it based on the provided detail fields.
 */
export const updateAssetWithDetails = async (
  type: 'Character' | 'Location',
  item: Character | Location,
  settings: CinematicSettings
): Promise<string> => {
  const ai = getAI();

  if (!item.imageUrl) throw new Error("No image to update");

  // Build a comprehensive prompt from all detail fields
  let detailPrompt = "";

  if (type === 'Character') {
    const char = item as Character;
    detailPrompt = `Update this character image to match these EXACT specifications:
    
CHARACTER NAME: ${char.name}
VISUAL DESCRIPTION: ${char.description || 'Not specified'}
AGE: ${char.age || 'Not specified'}
OCCUPATION: ${char.occupation || 'Not specified'}
WARDROBE/CLOTHING: ${char.wardrobe || 'Not specified'}
PHYSICAL FEATURES: ${char.physicalFeatures || 'Not specified'}
PERSONALITY (reflected in expression/posture): ${char.personality || 'Not specified'}

INSTRUCTIONS:
- Modify the character's appearance to match ALL the details above
- If age is specified, adjust facial features and skin accordingly
- If wardrobe is specified, change the clothing to match
- If physical features are specified, update them accurately
- Maintain the same pose and composition, but update the character's appearance
- Keep photorealistic cinematic quality with ${settings.lighting} lighting`;
  } else {
    const loc = item as Location;
    detailPrompt = `Update this location/environment image to match these EXACT specifications:

LOCATION NAME: ${loc.name}
VISUAL DESCRIPTION: ${loc.description || 'Not specified'}
TIME OF DAY: ${loc.timeOfDay || 'Not specified'}
WEATHER: ${loc.weather || 'Not specified'}
ATMOSPHERE/MOOD: ${loc.atmosphere || 'Not specified'}
KEY PROPS: ${loc.keyProps || 'Not specified'}
PRACTICAL LIGHTING: ${loc.practicalLighting || 'Not specified'}

INSTRUCTIONS:
- Modify the environment to match ALL the details above
- If time of day is specified, adjust lighting and sky accordingly
- If weather is specified, add appropriate weather effects
- If key props are specified, ensure they're visible in the scene
- If practical lighting is specified, add those light sources
- Maintain the same camera angle but update the environment details
- Keep photorealistic cinematic quality in ${settings.cinematographer} style`;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: getMimeType(item.imageUrl),
              data: stripBase64Header(item.imageUrl)
            }
          },
          { text: detailPrompt }
        ]
      },
      config: {
        responseModalities: ["IMAGE"],
        imageConfig: {
          aspectRatio: '1:1',
          imageSize: '2K'
        }
      }
    });

    if (response.candidates && response.candidates.length > 0) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
    }

    throw new Error("No image generated from update");
  } catch (error) {
    console.error("Update Asset Error:", error);
    throw error;
  }
};

/**
 * Upscales an image to 4K resolution using Gemini's image generation.
 * Sends the existing image back through the model at 4K output size with
 * a preservation-focused prompt to maintain exact composition and details.
 */
export const upscaleImage = async (
  base64Image: string,
  aspectRatio: string = '16:9'
): Promise<string> => {
  const ai = getAI();
  const mimeType = getMimeType(base64Image);
  const data = stripBase64Header(base64Image);
  const targetRatio = mapAspectRatio(aspectRatio);

  const prompt = `Upscale this image to maximum resolution. 

CRITICAL RULES:
- Do NOT change ANYTHING about the image content
- Preserve the EXACT same composition, framing, and camera angle
- Preserve ALL characters, their faces, clothing, poses, and expressions exactly
- Preserve the EXACT same environment, lighting, colors, and atmosphere
- Preserve all text, logos, or fine details exactly as they are
- ONLY increase the resolution, sharpness, and fine detail
- Enhance texture detail, skin pores, fabric weave, and surface detail
- The output must be pixel-perfect identical to the input, just at higher resolution`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: data
            }
          },
          { text: prompt }
        ]
      },
      config: {
        responseModalities: ["IMAGE"],
        imageConfig: {
          aspectRatio: targetRatio,
          imageSize: '4K'
        }
      }
    });

    if (response.candidates && response.candidates.length > 0) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
    }

    throw new Error("No image generated from upscale");
  } catch (error) {
    console.error("Upscale Error:", error);
    throw error;
  }
};

/**
 * Generates a character turnaround — 4 views of the same character.
 * Returns an array of {angle, imageUrl} for: Front, 3/4 Right, Profile Right, Back.
 * Uses the character's existing image as the reference.
 */
export const generateLocationTurnaround = async (
  location: Location,
  settings: CinematicSettings
): Promise<Array<{ angle: string; imageUrl: string }>> => {
  const ai = getAI();

  if (!location.imageUrl) throw new Error("Location must have an image for turnaround generation");

  const angles = [
    { angle: 'Wide Establishing', prompt: 'wide establishing shot showing the full exterior or full room, maximum environmental context' },
    { angle: 'Interior Detail', prompt: 'medium shot focusing on the key architectural or design details, furniture, and practical elements of the space' },
    { angle: 'Alternate Angle', prompt: 'shot from the opposite end or corner of the space, revealing what was behind the camera in the original image' },
    { angle: 'Atmosphere / Mood', prompt: 'moody atmospheric shot emphasizing lighting, shadows, and the emotional quality of the space' },
  ];

  const results: Array<{ angle: string; imageUrl: string }> = [];

  for (const { angle, prompt } of angles) {
    try {
      const parts: any[] = [
        {
          inlineData: {
            mimeType: getMimeType(location.imageUrl),
            data: stripBase64Header(location.imageUrl)
          }
        },
        {
          text: `EDIT THIS IMAGE. This is a location called "${location.name}".
${location.description ? `Location description: ${location.description}` : ''}
${(location as any).timeOfDay ? `Time of day: ${(location as any).timeOfDay}` : ''}
${(location as any).weather ? `Weather: ${(location as any).weather}` : ''}
${(location as any).atmosphere ? `Atmosphere: ${(location as any).atmosphere}` : ''}

TASK: Generate a ${angle} of this EXACT SAME location.

ANGLE: ${prompt}

CRITICAL RULES:
- This must be the EXACT SAME location — same architecture, same colors, same furniture, same props
- Same time of day and lighting conditions
- Same weather and atmosphere
- Professional cinematic location reference quality
- Cinematic lighting: ${settings.lighting}
- Cinematographer style: ${settings.cinematographer}
- Shot on ${settings.filmStock}
- Do NOT change the location's identity or design in any way`
        }
      ];

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: { parts },
        config: {
          responseModalities: ["IMAGE"],
          imageConfig: {
            aspectRatio: '16:9',
            imageSize: '2K'
          }
        }
      });

      if (response.candidates && response.candidates.length > 0) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            results.push({
              angle,
              imageUrl: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
            });
            break;
          }
        }
      }
    } catch (e) {
      console.error(`Location turnaround failed for ${angle}:`, e);
    }
  }

  if (results.length === 0) {
    throw new Error("All location turnaround angles failed to generate");
  }

  return results;
};

export const generateCharacterTurnaround = async (
  character: Character,
  settings: CinematicSettings
): Promise<Array<{ angle: string; imageUrl: string }>> => {
  const ai = getAI();

  if (!character.imageUrl) throw new Error("Character must have an image for turnaround generation");

  const angles = [
    { angle: 'Front View', prompt: 'facing directly toward the camera, straight-on front view, symmetrical pose, arms relaxed at sides' },
    { angle: '3/4 Right View', prompt: 'turned approximately 45 degrees to the right, three-quarter view showing both eyes, classic portrait angle' },
    { angle: 'Profile Right', prompt: 'turned 90 degrees to the right, perfect side profile view, showing silhouette of nose, chin, and forehead' },
    { angle: 'Back View', prompt: 'turned completely away from camera, showing the back of head, shoulders, and full back, rear view' },
  ];

  const results: Array<{ angle: string; imageUrl: string }> = [];

  for (const { angle, prompt } of angles) {
    try {
      const parts: any[] = [
        {
          inlineData: {
            mimeType: getMimeType(character.imageUrl),
            data: stripBase64Header(character.imageUrl)
          }
        },
        {
          text: `EDIT THIS IMAGE. This is a character named "${character.name}".
${character.description ? `Character description: ${character.description}` : ''}
${character.wardrobe ? `Wardrobe: ${character.wardrobe}` : ''}
${character.physicalFeatures ? `Physical features: ${character.physicalFeatures}` : ''}

TASK: Generate a ${angle} of this EXACT SAME person.

POSE: ${prompt}

CRITICAL RULES:
- This must be the EXACT SAME PERSON — same face, same hair, same skin tone, same body type
- Same clothing/wardrobe — identical outfit, colors, textures, accessories
- Clean studio background (neutral gray or white)
- Full body or 3/4 body framing, centered in frame
- Professional character reference sheet quality
- Cinematic lighting: ${settings.lighting}
- Shot on ${settings.filmStock}
- Do NOT change the person's identity, age, or appearance in any way`
        }
      ];

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: { parts },
        config: {
          responseModalities: ["IMAGE"],
          imageConfig: {
            aspectRatio: '3:4',
            imageSize: '2K'
          }
        }
      });

      if (response.candidates && response.candidates.length > 0) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            results.push({
              angle,
              imageUrl: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
            });
            break;
          }
        }
      }
    } catch (e) {
      console.error(`Turnaround generation failed for ${angle}:`, e);
      // Continue with other angles even if one fails
    }
  }

  if (results.length === 0) {
    throw new Error("All turnaround angles failed to generate");
  }

  return results;
};

/**
 * Multi-turn chat image editing. Sends the current image along with the full conversation
 * history so the model understands the chain of edits and can apply the latest instruction
 * with awareness of all previous refinements.
 */
export const chatEditImage = async (
  currentImage: string,
  chatHistory: ChatMessage[],
  newPrompt: string,
  aspectRatio: string = '16:9'
): Promise<string> => {
  const ai = getAI();
  const targetRatio = mapAspectRatio(aspectRatio);

  const parts: any[] = [];

  // Inject the current image as primary reference
  parts.push({
    inlineData: {
      mimeType: getMimeType(currentImage),
      data: stripBase64Header(currentImage)
    }
  });

  // Build conversation context from history (text only — keeps token usage reasonable)
  if (chatHistory.length > 0) {
    let conversationContext = "EDIT HISTORY (previous refinements applied to this image):\n";
    chatHistory.forEach((msg, idx) => {
      if (msg.role === 'user') {
        conversationContext += `  [Edit ${Math.floor(idx / 2) + 1}]: "${msg.text}"\n`;
      } else if (msg.role === 'assistant') {
        conversationContext += `  → Applied successfully\n`;
      }
    });
    conversationContext += "\nThe image above is the CURRENT STATE after all previous edits.\n";
    parts.push({ text: conversationContext });
  }

  // The new edit instruction
  parts.push({
    text: `NOW APPLY THIS NEW EDIT to the image above:

"${newPrompt}"

RULES:
- PRESERVE everything from previous edits that is not contradicted by this new instruction
- Only change what the instruction specifically asks for
- Maintain photorealism, cinematic quality, and existing style
- Keep the same composition and framing unless the instruction asks to change it
- This is an iterative refinement — build upon the current image, don't start over`
  });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: { parts },
      config: {
        responseModalities: ["IMAGE"],
        imageConfig: {
          aspectRatio: targetRatio,
          imageSize: '2K'
        }
      }
    });

    if (response.candidates && response.candidates.length > 0) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
    }

    throw new Error("No image generated from chat edit");
  } catch (error) {
    console.error("Chat Edit Error:", error);
    throw error;
  }
};

export const editImage = async (base64Image: string, prompt: string): Promise<string> => {
  const ai = getAI();
  const mimeType = getMimeType(base64Image);
  const data = stripBase64Header(base64Image);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: data
            }
          },
          { text: `Edit this image. Instruction: ${prompt}. Maintain photorealism and the existing cinematic style.` }
        ]
      },
      config: {
        responseModalities: ["IMAGE"],
        imageConfig: {
          imageSize: '2K'
        }
      }
    });

    if (response.candidates && response.candidates.length > 0) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
    }

    throw new Error("No image generated from edit");
  } catch (error) {
    console.error("Edit Image Error:", error);
    throw error;
  }
};

/**
 * Generates a video for a shot using Veo 3.1.
 */
export const generateShotVideo = async (
  shot: Shot,
  settings: CinematicSettings,
  model: 'fast' | 'quality',
  prompt: string
): Promise<string> => {
  const ai = getAI();
  const modelName = model === 'fast' ? 'veo-3.1-fast-generate-preview' : 'veo-3.1-generate-preview';

  if (!shot.imageUrl) throw new Error("Visual reference required for video generation");

  try {
    console.log("Starting video generation with model:", modelName);

    const videoRes = mapResolutionToVideoRes(settings.resolution || 'basic', model);

    const inputs: any = {
      model: modelName,
      prompt: prompt,
      config: {
        numberOfVideos: 1,
        resolution: videoRes,
        aspectRatio: settings.aspectRatio === '9:16' ? '9:16' : '16:9'
      }
    };

    // If both start and end frames are present -> Image-to-Video with Control
    // Note: This relies on the API supporting 'end_image' or multiple images logic.
    // Based on user request "last frame first frame", we ensure we pass appropriate image context.

    // Standard Image-to-Video
    inputs.image = {
      imageBytes: stripBase64Header(shot.imageUrl),
      mimeType: getMimeType(shot.imageUrl),
    };

    let operation = await ai.models.generateVideos(inputs);

    console.log("Video operation started:", operation.name);

    // Polling loop
    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 10000)); // Poll every 10s (Veo takes time)

      // SDK-compliant polling
      const updatedOp = await ai.operations.getVideosOperation({ operation: operation });

      // Preserve name if lost in update, crucial for next poll
      if (!updatedOp.name && operation.name) {
        (updatedOp as any).name = operation.name;
      }

      operation = updatedOp;
      console.log("Polling video operation...", operation);

      if (operation.error) {
        throw new Error(`Video Gen Error: ${operation.error.message || 'Unknown error'}`);
      }
    }

    // Check for RAI (Responsible AI) content filtering
    const raiReasons = operation.response?.raiMediaFilteredReasons
      || (operation as any).result?.raiMediaFilteredReasons;

    if (raiReasons && raiReasons.length > 0) {
      console.error("Video blocked by content policy:", raiReasons);
      throw new Error(`Content Policy: ${raiReasons[0]}`);
    }

    // Fetch the video URI. Check 'response' (standard) or 'result' (variant).
    const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri
      || (operation as any).result?.generatedVideos?.[0]?.video?.uri;

    if (!videoUri) {
      console.error("Final Operation State:", JSON.stringify(operation, null, 2));
      throw new Error("Video generation failed - no video returned. Try regenerating the source image.");
    }

    // Fetch the actual video bytes
    // Use intelligent separator to avoid malformed URLs if videoUri already has params
    const separator = videoUri.includes('?') ? '&' : '?';
    const finalVideoUrl = `${videoUri}${separator}key=${getApiKey()}`;

    try {
      const videoResponse = await fetch(finalVideoUrl);
      if (!videoResponse.ok) throw new Error("Failed to download generated video");

      const blob = await videoResponse.blob();
      return await blobToBase64(blob);
    } catch (fetchError) {
      console.warn("Could not fetch video blob (likely CORS). Falling back to direct URL.", fetchError);
      return finalVideoUrl;
    }

  } catch (error: any) {
    console.error("Video Gen Error:", error);
    throw error;
  }
};

/**
 * Extends an existing video.
 */
export const extendShotVideo = async (
  shot: Shot,
  settings: CinematicSettings,
  model: 'fast' | 'quality',
  prompt: string,
  videoBase64: string
): Promise<string> => {
  const ai = getAI();
  const modelName = model === 'fast' ? 'veo-3.1-fast-generate-preview' : 'veo-3.1-generate-preview';

  try {
    console.log("Starting video extension with model:", modelName);

    // Extract the last frame to use as the start frame for the extension
    // This implements the "Last Frame First Frame" logic which is the core of video extension
    // when direct video input is not supported or optimal.
    const lastFrameBase64 = await getLastFrameFromVideo(videoBase64);

    // Use the last frame as the input image
    const inputs: any = {
      model: modelName,
      prompt: `(Continue this action seamlessly) ${prompt}`,
      image: {
        imageBytes: stripBase64Header(lastFrameBase64),
        mimeType: 'image/jpeg',
      },
      config: {
        numberOfVideos: 1,
        resolution: mapResolutionToVideoRes(settings.resolution || 'basic', model),
        aspectRatio: settings.aspectRatio === '9:16' ? '9:16' : '16:9'
      }
    };

    let operation = await ai.models.generateVideos(inputs);
    console.log("Extension operation started:", operation.name);

    // Polling loop
    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      const updatedOp = await ai.operations.getVideosOperation({ operation: operation });
      if (!updatedOp.name && operation.name) (updatedOp as any).name = operation.name;
      operation = updatedOp;
      console.log("Polling extension operation...", operation);

      if (operation.error) throw new Error(`Extension Error: ${operation.error.message || 'Unknown error'}`);
    }

    // Check for RAI (Responsible AI) content filtering
    const raiReasons = operation.response?.raiMediaFilteredReasons
      || (operation as any).result?.raiMediaFilteredReasons;

    if (raiReasons && raiReasons.length > 0) {
      console.error("Video extension blocked by content policy:", raiReasons);
      throw new Error(`Content Policy: ${raiReasons[0]}`);
    }

    const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri
      || (operation as any).result?.generatedVideos?.[0]?.video?.uri;

    if (!videoUri) throw new Error("Video extension failed - no video returned. Try regenerating the source video.");

    const separator = videoUri.includes('?') ? '&' : '?';
    const finalVideoUrl = `${videoUri}${separator}key=${getApiKey()}`;

    try {
      const videoResponse = await fetch(finalVideoUrl);
      if (!videoResponse.ok) throw new Error("Failed to download extended video");
      const blob = await videoResponse.blob();
      return await blobToBase64(blob);
    } catch (fetchError) {
      console.warn("Could not fetch extended video blob. Falling back to URL.", fetchError);
      return finalVideoUrl;
    }

  } catch (error: any) {
    console.error("Video Extension Error:", error);
    throw error;
  }
};
