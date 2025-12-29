
import { GoogleGenAI } from "@google/genai";
import { CinematicSettings, Character, Location, Shot } from "../types";
import { ANAMORPHIC_LENS_PROMPTS } from "../constants";

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
 * Generates an image for a Character or Location asset.
 * Uses gemini-3-pro-image-preview for maximum quality.
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
      model: 'gemini-3-pro-image-preview',
      contents: { parts: [{ text: prompt }] },
      config: {
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
 * Uses gemini-3-pro-image-preview for Multimodal input support and strict consistency.
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

  // Build Text Context - include ALL characters and locations for full context
  // This ensures descriptions are always available to the model
  let textContext = "AVAILABLE CHARACTERS IN PROJECT:\n";
  allCharacters.forEach(c => {
    const isInShot = shot.characters.includes(c.id);
    textContext += `- ${c.name}${isInShot ? ' [IN THIS SHOT]' : ''}: ${c.description || 'No description'}\n`;
  });

  textContext += "\nAVAILABLE LOCATIONS IN PROJECT:\n";
  allLocations.forEach(l => {
    const isActiveLocation = l.id === shot.locationId;
    textContext += `- ${l.name}${isActiveLocation ? ' [THIS SHOT\'S LOCATION]' : ''}: ${l.description || 'No description'}\n`;
  });

  // Highlight the specific location for this shot
  if (activeLocation) {
    textContext += `\nSHOT LOCATION: "${activeLocation.name}" - ${activeLocation.description}\n`;
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
  `;

  // Map aspect ratio
  let targetRatio = "16:9";
  if (settings.aspectRatio === '4:3') targetRatio = "4:3";
  if (settings.aspectRatio === '1:1') targetRatio = "1:1";
  if (settings.aspectRatio === '9:16') targetRatio = "9:16";

  // ATTEMPT 1: MULTIMODAL (Images + Text)
  try {
    const parts: any[] = [];

    // 0. Inject Scene Reference Shot
    if (referenceShot && referenceShot.imageUrl) {
      parts.push({
        inlineData: {
          mimeType: getMimeType(referenceShot.imageUrl),
          data: stripBase64Header(referenceShot.imageUrl)
        }
      });
      parts.push({ text: `REFERENCE_SCENE_CONTINUITY: Use this image (Shot #${referenceShot.number}) as the visual guide.` });
    }

    // 1. Inject Character Reference Images
    activeCharacters.forEach(char => {
      if (char.imageUrl) {
        parts.push({
          inlineData: {
            mimeType: getMimeType(char.imageUrl),
            data: stripBase64Header(char.imageUrl)
          }
        });
        parts.push({ text: `REFERENCE_IMAGE_CHARACTER: This is "${char.name}". Maintain this exact facial structure and costume.` });
      }
    });

    // 2. Inject Location Reference Image
    if (activeLocation && activeLocation.imageUrl) {
      parts.push({
        inlineData: {
          mimeType: getMimeType(activeLocation.imageUrl),
          data: stripBase64Header(activeLocation.imageUrl)
        }
      });
      parts.push({ text: `REFERENCE_IMAGE_LOCATION: This is the location "${activeLocation.name}". Maintain this environment.` });
    }

    // Add main prompt
    parts.push({ text: mainPromptText });

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: { parts: parts },
      config: {
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

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: { parts: [{ text: fallbackPrompt }] },
        config: {
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

  // Build Text Context with ALL characters and locations
  let textContext = "AVAILABLE CHARACTERS IN PROJECT:\n";
  allCharacters.forEach(c => {
    const isInShot = shot.characters.includes(c.id);
    textContext += `- ${c.name}${isInShot ? ' [IN THIS SHOT]' : ''}: ${c.description || 'No description'}\n`;
  });

  textContext += "\nAVAILABLE LOCATIONS IN PROJECT:\n";
  allLocations.forEach(l => {
    const isActiveLocation = l.id === shot.locationId;
    textContext += `- ${l.name}${isActiveLocation ? ' [THIS SHOT\'S LOCATION]' : ''}: ${l.description || 'No description'}\n`;
  });

  const parts: any[] = [];

  // 1. INJECT CURRENT SHOT AS PRIMARY REFERENCE
  parts.push({
    inlineData: {
      mimeType: getMimeType(shot.imageUrl),
      data: stripBase64Header(shot.imageUrl)
    }
  });
  parts.push({ text: "REFERENCE_START_IMAGE: This is the current shot. Use this as the visual base for CHARACTERS and LOCATION. However, you MUST re-frame the shot if the Shot Type or Angle has changed below." });

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

  // 3. Inject Asset References
  activeCharacters.forEach(char => {
    if (char.imageUrl) {
      parts.push({
        inlineData: {
          mimeType: getMimeType(char.imageUrl),
          data: stripBase64Header(char.imageUrl)
        }
      });
      parts.push({ text: `REFERENCE_CHARACTER: "${char.name}".` });
    }
  });

  if (activeLocation && activeLocation.imageUrl) {
    parts.push({
      inlineData: {
        mimeType: getMimeType(activeLocation.imageUrl),
        data: stripBase64Header(activeLocation.imageUrl)
      }
    });
    parts.push({ text: `REFERENCE_LOCATION: "${activeLocation.name}".` });
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
    </instructions>
  `;

  parts.push({ text: mainPrompt });

  // Map aspect ratio
  let targetRatio = "16:9";
  if (settings.aspectRatio === '4:3') targetRatio = "4:3";
  if (settings.aspectRatio === '1:1') targetRatio = "1:1";
  if (settings.aspectRatio === '9:16') targetRatio = "9:16";

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: { parts: parts },
      config: {
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
      model: 'gemini-3-pro-image-preview',
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

export const editImage = async (base64Image: string, prompt: string): Promise<string> => {
  const ai = getAI();
  const mimeType = getMimeType(base64Image);
  const data = stripBase64Header(base64Image);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
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

    const inputs: any = {
      model: modelName,
      prompt: prompt,
      config: {
        numberOfVideos: 1,
        resolution: model === 'quality' ? '1080p' : '720p',
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
        resolution: model === 'quality' ? '1080p' : '720p',
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
