
import { GoogleGenAI } from "@google/genai";
import { CinematicSettings, Character, Location, Shot } from "../types";

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

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

export interface ScriptBreakdownShot {
  description: string;
  shotType: string;
  cameraMove: string;
  action: string;
  dialogue?: string;
  speaker?: string;
}

/**
 * Analyzes the raw script and breaks it down into a shot list.
 * Uses gemini-3-pro-preview for complex reasoning.
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

  // Build Text Context for missing visuals or fallback
  let textContext = "CONTEXT:\n";
  activeCharacters.forEach(c => {
    textContext += `- Character "${c.name}": ${c.description}\n`;
  });
  if (activeLocation) {
    textContext += `- Location "${activeLocation.name}": ${activeLocation.description}\n`;
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

  // Main Cinematic Prompt
  const mainPromptText = `
    TASK: Generate a high-fidelity cinematic movie keyframe.
    
    <technical_specs>
    - Cinematographer Style: ${settings.cinematographer}
    - Film Stock: ${settings.filmStock}
    - Lens: ${settings.lens}
    - Lighting: ${settings.lighting}
    - Shot Type: ${shot.shotType}
    - Camera Move: ${shot.cameraMove}
    - Aspect Ratio: ${settings.aspectRatio}
    </technical_specs>

    ${textContext}
    ${dialogueContext}

    <scene_action>
    Action: ${shot.action}
    Visual Description: ${shot.description}
    </scene_action>

    <instructions>
    - Match the lighting direction, skin tones, and textures of the references.
    - If characters are interacting, ensure their relative scale is correct.
    - If dialogue is present, characters should have appropriate facial expressions (talking, shouting, whispering, listening).
    - Render with "Masterpiece" quality: 8k resolution, professional color grading, realistic textures, volumetric lighting.
    </instructions>
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
    </TARGET_TECHNICAL_SPECS>

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
    </instructions>
  `;

  parts.push({ text: mainPrompt });

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
        
        let operation = await ai.models.generateVideos({
            model: modelName,
            prompt: prompt,
            image: {
                imageBytes: stripBase64Header(shot.imageUrl),
                mimeType: getMimeType(shot.imageUrl),
            },
            config: {
                numberOfVideos: 1,
                resolution: model === 'quality' ? '1080p' : '720p',
                aspectRatio: settings.aspectRatio === '9:16' ? '9:16' : '16:9' 
            }
        });

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

        // Fetch the video URI. Check 'response' (standard) or 'result' (variant).
        const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri 
                      || (operation as any).result?.generatedVideos?.[0]?.video?.uri;

        if (!videoUri) {
            console.error("Final Operation State:", JSON.stringify(operation, null, 2));
            throw new Error("Video generation failed or returned no URI");
        }

        // Fetch the actual video bytes
        // Use intelligent separator to avoid malformed URLs if videoUri already has params
        const separator = videoUri.includes('?') ? '&' : '?';
        const videoResponse = await fetch(`${videoUri}${separator}key=${process.env.API_KEY}`);
        
        if (!videoResponse.ok) throw new Error("Failed to download generated video");
        
        const blob = await videoResponse.blob();
        return await blobToBase64(blob);

    } catch (error: any) {
        console.error("Video Gen Error:", error);
        throw error;
    }
};
