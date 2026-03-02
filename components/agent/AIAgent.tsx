import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Project, Shot, Scene, Character, Location, CinematicSettings } from '../../types';
import { Bot, X, Send, Loader2, ChevronDown, ChevronUp, Sparkles, Trash2, AlertCircle, Image, Film, Zap } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { generateAssetImage, generateShotImage, generateShotVideo } from '../../services/geminiService';
import { generateWanVideo } from '../../services/falService';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AgentMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
  timestamp: number;
  actions?: AgentAction[];
  error?: boolean;
  generating?: boolean; // shows spinner while async actions run
}

export interface AgentAction {
  type: string;
  description: string;
  payload?: unknown;
}

interface AIAgentProps {
  project: Project;
  onUpdateProject: (project: Project) => void;
  onNavigate?: (tab: string) => void;
  onClose?: () => void;
  isOpen: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// API key resolution
// ─────────────────────────────────────────────────────────────────────────────

function getGeminiKey(): string {
  return (
    (typeof process !== 'undefined' && process.env?.API_KEY) ||
    (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) ||
    localStorage.getItem('gemini_api_key') ||
    ''
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Call Gemini for planning/reasoning (text only)
// ─────────────────────────────────────────────────────────────────────────────

async function callAgent(
  userMessage: string,
  project: Project,
  history: AgentMessage[]
): Promise<{ reply: string; actions: AgentAction[] }> {
  const apiKey = getGeminiKey();
  if (!apiKey) {
    return {
      reply: 'No Gemini API key found. Please add your GEMINI_API_KEY to the `.env` file or enter it in Settings.',
      actions: [],
    };
  }

  const projectSummary = {
    title: project.title,
    settings: project.settings,
    videoSettings: project.videoSettings,
    scenes: project.scenes?.map(s => ({
      id: s.id,
      name: s.name,
      shotCount: s.shots?.length ?? 0,
      shots: s.shots?.map(sh => ({
        id: sh.id,
        number: sh.number,
        description: sh.description,
        shotType: sh.shotType,
        cameraMove: sh.cameraMove,
        action: sh.action,
        hasImage: !!sh.imageUrl,
        hasVideo: !!sh.videoUrl,
        videoPrompt: sh.videoPrompt,
        characters: sh.characters,
        locationId: sh.locationId,
      })),
    })),
    characters: project.characters?.map(c => ({
      id: c.id,
      name: c.name,
      description: c.description,
      age: c.age,
      occupation: c.occupation,
      wardrobe: c.wardrobe,
      hasImage: !!c.imageUrl,
    })),
    locations: project.locations?.map(l => ({
      id: l.id,
      name: l.name,
      description: l.description,
      timeOfDay: l.timeOfDay,
      atmosphere: l.atmosphere,
      hasImage: !!l.imageUrl,
    })),
  };

  const historyContext = history
    .slice(-10)
    .map(m => `${m.role === 'user' ? 'User' : 'SLOPBOT'}: ${m.text}`)
    .join('\n');

  const systemPrompt = `You are SLOPBOT, an AI director's assistant embedded inside Slop Board — a professional cinematic pre-production and storyboarding app.

You have FULL AUTONOMOUS CONTROL over the entire app. You can:
- Create, edit, delete scenes, shots, characters, and locations
- Generate storyboard frame images for any shot using Gemini image generation
- Generate character portrait/reference images
- Generate location/environment images
- Generate videos for shots using Veo (image-to-video) or Wan (fal.ai)
- Set video prompts for shots
- Update all cinematic settings (cinematographer, film stock, lens, lighting, aspect ratio)
- Navigate to any section of the app
- Rename the project

CURRENT PROJECT STATE:
${JSON.stringify(projectSummary, null, 2)}

When you want to perform an action, include it in your response as a JSON block wrapped in triple backticks tagged "actions":
\`\`\`actions
[
  { "type": "ACTION_TYPE", "description": "what you did in plain English", "payload": { ... } }
]
\`\`\`

═══════════════════════════════════════════════════════
AVAILABLE ACTIONS AND THEIR EXACT PAYLOADS:
═══════════════════════════════════════════════════════

── Project ──────────────────────────────────────────────────────────
- RENAME_PROJECT: { "title": string }

── Scenes ───────────────────────────────────────────────────────────
- ADD_SCENE: { "name": string }
- DELETE_SCENE: { "sceneId": string }
- RENAME_SCENE: { "sceneId": string, "name": string }

── Shots ────────────────────────────────────────────────────────────
- ADD_SHOT: {
    "sceneId": string,
    "description": string,
    "action": string,
    "shotType": "Extreme Wide"|"Wide"|"Medium"|"Close Up"|"Extreme Close Up"|"Insert"|"High Angle"|"Low Angle"|"Dutch Angle (45°)"|"Overhead"|"Over the Shoulder",
    "cameraMove": "Static"|"Dolly In"|"Dolly Out"|"Pan"|"Tilt"|"Handheld"|"Tracking"|"Crane"|"Arc"|"Zoom In"|"Zoom Out"|"Whip Pan",
    "characterIds"?: string[],   // optional: IDs of characters to include
    "locationId"?: string        // optional: ID of location for this shot
  }
- DELETE_SHOT: { "sceneId": string, "shotId": string }
- UPDATE_SHOT: { "sceneId": string, "shotId": string, "description"?: string, "action"?: string, "shotType"?: string, "cameraMove"?: string, "notes"?: string, "videoPrompt"?: string }

── Image Generation (ASYNC — triggers real AI image generation) ──────
- GENERATE_SHOT_IMAGE: {
    "sceneId": string,
    "shotId": string
    // Generates a cinematic storyboard frame for this shot using Gemini image gen
    // The shot must already exist with a description
  }
- GENERATE_CHARACTER_IMAGE: {
    "characterId": string
    // Generates a character portrait/reference image using Gemini image gen
  }
- GENERATE_LOCATION_IMAGE: {
    "locationId": string
    // Generates a cinematic environment image for this location using Gemini image gen
  }

── Video Generation (ASYNC — triggers real video generation) ─────────
- GENERATE_SHOT_VIDEO: {
    "sceneId": string,
    "shotId": string,
    "model": "fast"|"quality",   // "fast" = veo-3.1-fast, "quality" = veo-3.1
    "prompt": string             // Motion/action prompt for the video
    // The shot MUST have an image (hasImage: true) before generating video
  }
- SET_VIDEO_PROMPT: {
    "sceneId": string,
    "shotId": string,
    "prompt": string
  }

── Characters ───────────────────────────────────────────────────────
- ADD_CHARACTER: { "name": string, "description": string, "age"?: string, "occupation"?: string, "wardrobe"?: string, "physicalFeatures"?: string }
- UPDATE_CHARACTER: { "characterId": string, "name"?: string, "description"?: string, "age"?: string, "occupation"?: string, "wardrobe"?: string }
- DELETE_CHARACTER: { "characterId": string }

── Locations ────────────────────────────────────────────────────────
- ADD_LOCATION: { "name": string, "description": string, "timeOfDay"?: string, "atmosphere"?: string, "weather"?: string }
- UPDATE_LOCATION: { "locationId": string, "name"?: string, "description"?: string, "timeOfDay"?: string, "atmosphere"?: string }
- DELETE_LOCATION: { "locationId": string }

── Cinematic Settings ────────────────────────────────────────────────
- UPDATE_SETTINGS: { "cinematographer"?: string, "filmStock"?: string, "lens"?: string, "lighting"?: string, "aspectRatio"?: "16:9"|"21:9"|"2.39:1"|"4:3"|"1:1"|"9:16", "colorGrade"?: string }

── Navigation ───────────────────────────────────────────────────────
- NAVIGATE: { "tab": "script"|"characters"|"locations"|"board"|"video"|"motion"|"settings"|"timeline" }

═══════════════════════════════════════════════════════
RULES:
═══════════════════════════════════════════════════════
1. Always respond conversationally AND perform the requested actions.
2. When creating multiple shots, include them all in a single actions array.
3. Always use the exact scene/character/location IDs from the project state above.
4. Be creative and cinematic in your descriptions — you are a film director's assistant.
5. Keep your conversational reply concise (2-4 sentences max).
6. If asked to "go to" or "navigate to" a section, use the NAVIGATE action.
7. If the project has no scenes, create one first before adding shots.
8. For GENERATE_SHOT_IMAGE: the shot must exist first. Create it with ADD_SHOT, then generate the image in the SAME actions array.
9. For GENERATE_SHOT_VIDEO: the shot MUST have an image (hasImage: true). If it doesn't, generate the image first.
10. You can chain actions: ADD_CHARACTER → GENERATE_CHARACTER_IMAGE in one response.
11. When the user asks to "generate" or "create" something visual, always include the appropriate GENERATE_ action.
12. For video generation, always write a cinematic motion prompt describing camera movement and action.

CONVERSATION HISTORY:
${historyContext}

User: ${userMessage}
SLOPBOT:`;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: systemPrompt,
      config: {
        temperature: 0.75,
        maxOutputTokens: 2048,
      },
    });

    const rawText: string = response.text ?? 'Sorry, I could not process that.';

    // Extract actions JSON block
    const actionsMatch = rawText.match(/```actions\s*([\s\S]*?)```/);
    let actions: AgentAction[] = [];
    let reply = rawText;

    if (actionsMatch) {
      try {
        const parsed = JSON.parse(actionsMatch[1].trim());
        actions = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        // JSON parse failed — still use the text reply
      }
      reply = rawText.replace(/```actions[\s\S]*?```/g, '').trim();
    }

    // Strip any leftover markdown code fences
    reply = reply.replace(/```[\s\S]*?```/g, '').trim();

    return { reply, actions };
  } catch (err: unknown) {
    console.error('SLOPBOT Gemini error:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return {
      reply: `Gemini error: ${msg}`,
      actions: [],
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Apply synchronous actions to the project (returns updated project + async queue)
// ─────────────────────────────────────────────────────────────────────────────

interface AsyncTask {
  type: 'GENERATE_SHOT_IMAGE' | 'GENERATE_CHARACTER_IMAGE' | 'GENERATE_LOCATION_IMAGE' | 'GENERATE_SHOT_VIDEO';
  description: string;
  payload: Record<string, unknown>;
}

function applyActions(
  project: Project,
  actions: AgentAction[],
  onNavigate?: (tab: string) => void
): { updated: Project; asyncTasks: AsyncTask[] } {
  let updated = { ...project };
  const asyncTasks: AsyncTask[] = [];

  for (const action of actions) {
    const p = action.payload as Record<string, unknown> | undefined;

    switch (action.type) {
      // ── Project ──────────────────────────────────────────────────────────
      case 'RENAME_PROJECT':
        if (p?.title) updated = { ...updated, title: p.title as string };
        break;

      // ── Scenes ───────────────────────────────────────────────────────────
      case 'ADD_SCENE': {
        const newScene: Scene = {
          id: crypto.randomUUID(),
          name: (p?.name as string) || `Scene ${(updated.scenes?.length ?? 0) + 1}`,
          scriptContent: '',
          shots: [],
          order: updated.scenes?.length ?? 0,
        };
        updated = { ...updated, scenes: [...(updated.scenes ?? []), newScene] };
        break;
      }

      case 'DELETE_SCENE':
        if ((updated.scenes?.length ?? 0) > 1 && p?.sceneId) {
          updated = {
            ...updated,
            scenes: updated.scenes?.filter(s => s.id !== p.sceneId) ?? [],
          };
        }
        break;

      case 'RENAME_SCENE':
        if (p?.sceneId && p?.name) {
          updated = {
            ...updated,
            scenes: updated.scenes?.map(s =>
              s.id === p.sceneId ? { ...s, name: p.name as string } : s
            ) ?? [],
          };
        }
        break;

      // ── Shots ────────────────────────────────────────────────────────────
      case 'ADD_SHOT': {
        const targetSceneId = (p?.sceneId as string) || updated.scenes?.[0]?.id;
        if (!targetSceneId) break;
        const newShot: Shot = {
          id: crypto.randomUUID(),
          number: 0,
          description: (p?.description as string) || '',
          action: (p?.action as string) || '',
          dialogueLines: [],
          shotType: (p?.shotType as Shot['shotType']) || 'Medium',
          cameraMove: (p?.cameraMove as Shot['cameraMove']) || 'Static',
          characters: (p?.characterIds as string[]) || [],
          locationId: (p?.locationId as string) || updated.locations?.[0]?.id || '',
          videoPrompt: (p?.videoPrompt as string) || '',
          isGenerating: false,
          isEditing: false,
        };
        updated = {
          ...updated,
          scenes: updated.scenes?.map(s => {
            if (s.id === targetSceneId) {
              const shots = [...s.shots, { ...newShot, number: s.shots.length + 1 }];
              return { ...s, shots };
            }
            return s;
          }) ?? [],
        };
        break;
      }

      case 'DELETE_SHOT':
        if (p?.sceneId && p?.shotId) {
          updated = {
            ...updated,
            scenes: updated.scenes?.map(s => {
              if (s.id === p.sceneId) {
                return { ...s, shots: s.shots.filter(sh => sh.id !== p.shotId) };
              }
              return s;
            }) ?? [],
          };
        }
        break;

      case 'UPDATE_SHOT':
        if (p?.sceneId && p?.shotId) {
          updated = {
            ...updated,
            scenes: updated.scenes?.map(s => {
              if (s.id === p.sceneId) {
                return {
                  ...s,
                  shots: s.shots.map(sh => {
                    if (sh.id === p.shotId) {
                      return {
                        ...sh,
                        ...(p.description !== undefined && { description: p.description as string }),
                        ...(p.action !== undefined && { action: p.action as string }),
                        ...(p.shotType !== undefined && { shotType: p.shotType as Shot['shotType'] }),
                        ...(p.cameraMove !== undefined && { cameraMove: p.cameraMove as Shot['cameraMove'] }),
                        ...(p.notes !== undefined && { notes: p.notes as string }),
                        ...(p.videoPrompt !== undefined && { videoPrompt: p.videoPrompt as string }),
                      };
                    }
                    return sh;
                  }),
                };
              }
              return s;
            }) ?? [],
          };
        }
        break;

      case 'SET_VIDEO_PROMPT':
        if (p?.sceneId && p?.shotId && p?.prompt) {
          updated = {
            ...updated,
            scenes: updated.scenes?.map(s => {
              if (s.id === p.sceneId) {
                return {
                  ...s,
                  shots: s.shots.map(sh => {
                    if (sh.id === p.shotId) {
                      return { ...sh, videoPrompt: p.prompt as string };
                    }
                    return sh;
                  }),
                };
              }
              return s;
            }) ?? [],
          };
        }
        break;

      // ── Characters ───────────────────────────────────────────────────────
      case 'ADD_CHARACTER': {
        const newChar: Character = {
          id: crypto.randomUUID(),
          name: (p?.name as string) || 'New Character',
          description: (p?.description as string) || '',
          age: p?.age as string | undefined,
          occupation: p?.occupation as string | undefined,
          wardrobe: p?.wardrobe as string | undefined,
          physicalFeatures: p?.physicalFeatures as string | undefined,
          isGenerating: false,
          isEditing: false,
        };
        updated = { ...updated, characters: [...(updated.characters ?? []), newChar] };
        break;
      }

      case 'UPDATE_CHARACTER':
        if (p?.characterId) {
          updated = {
            ...updated,
            characters: updated.characters?.map(c => {
              if (c.id === p.characterId) {
                return {
                  ...c,
                  ...(p.name !== undefined && { name: p.name as string }),
                  ...(p.description !== undefined && { description: p.description as string }),
                  ...(p.age !== undefined && { age: p.age as string }),
                  ...(p.occupation !== undefined && { occupation: p.occupation as string }),
                  ...(p.wardrobe !== undefined && { wardrobe: p.wardrobe as string }),
                  ...(p.physicalFeatures !== undefined && { physicalFeatures: p.physicalFeatures as string }),
                };
              }
              return c;
            }) ?? [],
          };
        }
        break;

      case 'DELETE_CHARACTER':
        if (p?.characterId) {
          updated = {
            ...updated,
            characters: updated.characters?.filter(c => c.id !== p.characterId) ?? [],
          };
        }
        break;

      // ── Locations ────────────────────────────────────────────────────────
      case 'ADD_LOCATION': {
        const newLoc: Location = {
          id: crypto.randomUUID(),
          name: (p?.name as string) || 'New Location',
          description: (p?.description as string) || '',
          timeOfDay: p?.timeOfDay as string | undefined,
          atmosphere: p?.atmosphere as string | undefined,
          weather: p?.weather as string | undefined,
          isGenerating: false,
          isEditing: false,
        };
        updated = { ...updated, locations: [...(updated.locations ?? []), newLoc] };
        break;
      }

      case 'UPDATE_LOCATION':
        if (p?.locationId) {
          updated = {
            ...updated,
            locations: updated.locations?.map(l => {
              if (l.id === p.locationId) {
                return {
                  ...l,
                  ...(p.name !== undefined && { name: p.name as string }),
                  ...(p.description !== undefined && { description: p.description as string }),
                  ...(p.timeOfDay !== undefined && { timeOfDay: p.timeOfDay as string }),
                  ...(p.atmosphere !== undefined && { atmosphere: p.atmosphere as string }),
                  ...(p.weather !== undefined && { weather: p.weather as string }),
                };
              }
              return l;
            }) ?? [],
          };
        }
        break;

      case 'DELETE_LOCATION':
        if (p?.locationId) {
          updated = {
            ...updated,
            locations: updated.locations?.filter(l => l.id !== p.locationId) ?? [],
          };
        }
        break;

      // ── Cinematic Settings ────────────────────────────────────────────────
      case 'UPDATE_SETTINGS': {
        const newSettings: CinematicSettings = {
          ...updated.settings,
          ...(p?.cinematographer && { cinematographer: p.cinematographer as string }),
          ...(p?.filmStock && { filmStock: p.filmStock as string }),
          ...(p?.lens && { lens: p.lens as string }),
          ...(p?.lighting && { lighting: p.lighting as string }),
          ...(p?.aspectRatio && { aspectRatio: p.aspectRatio as import('../../types').AspectRatio }),
          ...(p?.colorGrade && { colorGrade: p.colorGrade as string }),
        };
        updated = { ...updated, settings: newSettings };
        break;
      }

      // ── Navigation ───────────────────────────────────────────────────────
      case 'NAVIGATE':
        if (onNavigate && p?.tab) {
          setTimeout(() => onNavigate(p.tab as string), 150);
        }
        break;

      // ── Async image/video generation — queued for execution after state update ──
      case 'GENERATE_SHOT_IMAGE':
      case 'GENERATE_CHARACTER_IMAGE':
      case 'GENERATE_LOCATION_IMAGE':
      case 'GENERATE_SHOT_VIDEO':
        if (p) {
          asyncTasks.push({
            type: action.type as AsyncTask['type'],
            description: action.description,
            payload: p,
          });
        }
        break;

      default:
        console.warn('SLOPBOT: unknown action type:', action.type);
        break;
    }
  }

  return { updated, asyncTasks };
}

// ─────────────────────────────────────────────────────────────────────────────
// Execute async generation tasks
// ─────────────────────────────────────────────────────────────────────────────

async function executeAsyncTask(
  task: AsyncTask,
  project: Project,
  onUpdateProject: (p: Project) => void
): Promise<string> {
  const p = task.payload;

  switch (task.type) {
    case 'GENERATE_SHOT_IMAGE': {
      const sceneId = p.sceneId as string;
      const shotId = p.shotId as string;
      const scene = project.scenes?.find(s => s.id === sceneId);
      const shot = scene?.shots?.find(sh => sh.id === shotId);
      if (!shot) throw new Error(`Shot ${shotId} not found`);

      const imageUrl = await generateShotImage(
        shot,
        project.settings,
        project.characters ?? [],
        project.locations ?? [],
        scene?.shots ?? []
      );

      // Update project with the generated image
      const updatedProject: Project = {
        ...project,
        scenes: project.scenes?.map(s => {
          if (s.id === sceneId) {
            return {
              ...s,
              shots: s.shots.map(sh => {
                if (sh.id === shotId) {
                  return { ...sh, imageUrl, isGenerating: false };
                }
                return sh;
              }),
            };
          }
          return s;
        }) ?? [],
      };
      onUpdateProject(updatedProject);
      return `Generated storyboard frame for Shot #${shot.number}`;
    }

    case 'GENERATE_CHARACTER_IMAGE': {
      const characterId = p.characterId as string;
      const character = project.characters?.find(c => c.id === characterId);
      if (!character) throw new Error(`Character ${characterId} not found`);

      const imageUrl = await generateAssetImage(
        'Character',
        character.name,
        [character.description, character.age ? `Age: ${character.age}` : '', character.wardrobe ? `Wardrobe: ${character.wardrobe}` : '', character.physicalFeatures || ''].filter(Boolean).join('. '),
        project.settings
      );

      const updatedProject: Project = {
        ...project,
        characters: project.characters?.map(c => {
          if (c.id === characterId) {
            return { ...c, imageUrl, originalImageUrl: imageUrl, isGenerating: false };
          }
          return c;
        }) ?? [],
      };
      onUpdateProject(updatedProject);
      return `Generated portrait for ${character.name}`;
    }

    case 'GENERATE_LOCATION_IMAGE': {
      const locationId = p.locationId as string;
      const location = project.locations?.find(l => l.id === locationId);
      if (!location) throw new Error(`Location ${locationId} not found`);

      const imageUrl = await generateAssetImage(
        'Location',
        location.name,
        [location.description, location.timeOfDay ? `Time: ${location.timeOfDay}` : '', location.atmosphere ? `Atmosphere: ${location.atmosphere}` : ''].filter(Boolean).join('. '),
        project.settings
      );

      const updatedProject: Project = {
        ...project,
        locations: project.locations?.map(l => {
          if (l.id === locationId) {
            return { ...l, imageUrl, originalImageUrl: imageUrl, isGenerating: false };
          }
          return l;
        }) ?? [],
      };
      onUpdateProject(updatedProject);
      return `Generated environment image for ${location.name}`;
    }

    case 'GENERATE_SHOT_VIDEO': {
      const sceneId = p.sceneId as string;
      const shotId = p.shotId as string;
      const model = (p.model as 'fast' | 'quality') || 'fast';
      const prompt = p.prompt as string;

      const scene = project.scenes?.find(s => s.id === sceneId);
      const shot = scene?.shots?.find(sh => sh.id === shotId);
      if (!shot) throw new Error(`Shot ${shotId} not found`);
      if (!shot.imageUrl) throw new Error(`Shot #${shot.number} needs an image before generating video. Generate the image first.`);

      // Use Veo via geminiService
      const videoUrl = await generateShotVideo(shot, project.settings, model, prompt || shot.videoPrompt || shot.description);

      const updatedProject: Project = {
        ...project,
        scenes: project.scenes?.map(s => {
          if (s.id === sceneId) {
            return {
              ...s,
              shots: s.shots.map(sh => {
                if (sh.id === shotId) {
                  return { ...sh, videoUrl, isVideoGenerating: false, videoModel: model };
                }
                return sh;
              }),
            };
          }
          return s;
        }) ?? [],
      };
      onUpdateProject(updatedProject);
      return `Generated video for Shot #${shot.number}`;
    }

    default:
      throw new Error(`Unknown async task type: ${task.type}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { label: 'Create 3 shots + generate images', icon: '🎬' },
  { label: 'Generate images for all shots', icon: '🖼️' },
  { label: 'Add a character and generate portrait', icon: '🎭' },
  { label: 'Add a location and generate image', icon: '🌆' },
  { label: 'Generate video for Shot 1', icon: '🎥' },
  { label: 'Go to timeline', icon: '⏱️' },
  { label: 'What shots do I have?', icon: '📋' },
  { label: 'Change cinematographer to Roger Deakins style', icon: '🎞️' },
];

export const AIAgent: React.FC<AIAgentProps> = ({
  project,
  onUpdateProject,
  onNavigate,
  onClose,
  isOpen,
}) => {
  const [messages, setMessages] = useState<AgentMessage[]>([
    {
      id: 'welcome',
      role: 'agent',
      text: `Hey! I'm **SLOPBOT** — your AI director with full control over this project.\n\nI can create scenes, shots, characters, and locations — and I can **generate storyboard images**, **character portraits**, **location visuals**, and **videos** for any shot. I can also navigate anywhere in the app.\n\nWhat would you like to create?`,
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  const [generatingTasks, setGeneratingTasks] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Keep a ref to the latest project so async tasks always use fresh state
  const projectRef = useRef(project);
  useEffect(() => { projectRef.current = project; }, [project]);

  // Check API key on mount
  useEffect(() => {
    setApiKeyMissing(!getGeminiKey());
  }, []);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isMinimized]);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, isMinimized]);

  const handleSend = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || isLoading) return;

    const userMsg: AgentMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const { reply, actions } = await callAgent(text, project, [...messages, userMsg]);

      // Apply synchronous actions first
      let currentProject = project;
      let asyncTasks: AsyncTask[] = [];

      if (actions.length > 0) {
        const result = applyActions(project, actions, onNavigate);
        currentProject = result.updated;
        asyncTasks = result.asyncTasks;
        onUpdateProject(currentProject);
      }

      const agentMsg: AgentMessage = {
        id: crypto.randomUUID(),
        role: 'agent',
        text: reply,
        timestamp: Date.now(),
        actions,
        error: reply.startsWith('Gemini error:') || reply.startsWith('No Gemini API key'),
        generating: asyncTasks.length > 0,
      };

      setMessages(prev => [...prev, agentMsg]);

      // Execute async generation tasks sequentially
      if (asyncTasks.length > 0) {
        const taskLabels = asyncTasks.map(t => t.description);
        setGeneratingTasks(taskLabels);

        const completedDescriptions: string[] = [];

        for (const task of asyncTasks) {
          try {
            const result = await executeAsyncTask(task, projectRef.current, (updated) => {
              projectRef.current = updated;
              onUpdateProject(updated);
            });
            completedDescriptions.push(`✅ ${result}`);
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            completedDescriptions.push(`❌ Failed: ${errMsg}`);
          }
        }

        setGeneratingTasks([]);

        // Update the agent message to show completion
        setMessages(prev => prev.map(m => {
          if (m.id === agentMsg.id) {
            return {
              ...m,
              generating: false,
              text: m.text + '\n\n' + completedDescriptions.join('\n'),
            };
          }
          return m;
        }));
      }

    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'agent',
          text: `Something went wrong: ${err instanceof Error ? err.message : 'Unknown error'}`,
          timestamp: Date.now(),
          error: true,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, project, messages, onUpdateProject, onNavigate]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearHistory = () => {
    setMessages([
      {
        id: crypto.randomUUID(),
        role: 'agent',
        text: "Chat cleared! I'm still here and ready to direct. What do you need?",
        timestamp: Date.now(),
      },
    ]);
  };

  const renderText = (text: string) => {
    return text.split('\n').map((line, lineIdx) => {
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      return (
        <span key={lineIdx}>
          {parts.map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>;
            }
            return <span key={i}>{part}</span>;
          })}
          {lineIdx < text.split('\n').length - 1 && <br />}
        </span>
      );
    });
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl transition-all duration-300 overflow-hidden"
      style={{
        width: '24rem',
        height: isMinimized ? '3.5rem' : '42rem',
        maxHeight: 'calc(100vh - 5rem)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-neutral-800 border-b border-neutral-700 cursor-pointer select-none flex-shrink-0"
        onClick={() => setIsMinimized(v => !v)}
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-red-600 flex items-center justify-center shadow-lg shadow-red-900/50">
            <Bot size={14} className="text-white" />
          </div>
          <div>
            <span className="text-white font-bold text-sm tracking-wide">SLOPBOT</span>
            <span className="text-neutral-500 text-xs ml-2">AI Director</span>
          </div>
          <div className={`w-2 h-2 rounded-full ml-1 ${apiKeyMissing ? 'bg-yellow-500' : generatingTasks.length > 0 ? 'bg-blue-400 animate-pulse' : 'bg-green-500 animate-pulse'}`} />
          {generatingTasks.length > 0 && (
            <span className="text-blue-400 text-xs ml-1">Generating...</span>
          )}
        </div>
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <button
            onClick={clearHistory}
            className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-neutral-700 transition-colors"
            title="Clear chat"
          >
            <Trash2 size={13} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-neutral-700 transition-colors"
            title="Close"
          >
            <X size={13} />
          </button>
          <button className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-neutral-700 transition-colors">
            {isMinimized ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* API key warning */}
          {apiKeyMissing && (
            <div className="flex items-center gap-2 px-3 py-2 bg-yellow-900/30 border-b border-yellow-800/50 flex-shrink-0">
              <AlertCircle size={12} className="text-yellow-400 flex-shrink-0" />
              <span className="text-yellow-300 text-xs">No API key found. Add GEMINI_API_KEY to .env file.</span>
            </div>
          )}

          {/* Active generation tasks */}
          {generatingTasks.length > 0 && (
            <div className="px-3 py-2 bg-blue-900/20 border-b border-blue-800/30 flex-shrink-0">
              {generatingTasks.map((task, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-blue-300">
                  <Loader2 size={10} className="animate-spin flex-shrink-0" />
                  <span>{task}</span>
                </div>
              ))}
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} gap-2`}>
                {msg.role === 'agent' && (
                  <div className="w-6 h-6 rounded-full bg-red-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot size={11} className="text-white" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-red-600 text-white rounded-br-sm'
                      : msg.error
                      ? 'bg-red-950 border border-red-800 text-red-300 rounded-bl-sm'
                      : 'bg-neutral-800 text-neutral-200 rounded-bl-sm'
                  }`}
                >
                  <div>{renderText(msg.text)}</div>

                  {/* Action badges */}
                  {msg.actions && msg.actions.length > 0 && !msg.generating && (
                    <div className="mt-2 space-y-1">
                      {msg.actions
                        .filter(a => !['NAVIGATE'].includes(a.type))
                        .map((a, i) => (
                          <div key={i} className="flex items-center gap-1.5">
                            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                              a.type.startsWith('GENERATE') ? 'bg-blue-400' : 'bg-green-400'
                            }`} />
                            <span className="text-xs text-neutral-400">{a.description}</span>
                          </div>
                        ))}
                    </div>
                  )}

                  {/* Generating spinner */}
                  {msg.generating && (
                    <div className="mt-2 flex items-center gap-2 text-blue-400">
                      <Loader2 size={11} className="animate-spin" />
                      <span className="text-xs">Generating visuals...</span>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex justify-start gap-2">
                <div className="w-6 h-6 rounded-full bg-red-600 flex items-center justify-center flex-shrink-0">
                  <Bot size={11} className="text-white" />
                </div>
                <div className="bg-neutral-800 rounded-xl rounded-bl-sm px-3 py-2">
                  <div className="flex gap-1 items-center h-4">
                    <div className="w-1.5 h-1.5 bg-neutral-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 bg-neutral-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 bg-neutral-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick actions */}
          <div className="px-3 py-2 border-t border-neutral-800 flex-shrink-0">
            <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
              {QUICK_ACTIONS.map((qa, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(qa.label)}
                  disabled={isLoading}
                  className="text-xs px-2.5 py-1 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white border border-neutral-700 hover:border-neutral-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {qa.icon} {qa.label}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <div className="px-3 pb-3 pt-1 flex-shrink-0">
            <div className="flex gap-2 items-end bg-neutral-800 rounded-xl border border-neutral-700 focus-within:border-red-600 transition-colors px-3 py-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Tell SLOPBOT what to do..."
                rows={1}
                disabled={isLoading}
                className="flex-1 bg-transparent text-white text-sm placeholder-neutral-500 resize-none outline-none leading-5 max-h-24 overflow-y-auto disabled:opacity-50"
                style={{ minHeight: '1.25rem' }}
              />
              <button
                onClick={() => handleSend()}
                disabled={isLoading || !input.trim()}
                className="p-1 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              >
                {isLoading ? <Loader2 size={14} className="text-white animate-spin" /> : <Send size={14} className="text-white" />}
              </button>
            </div>
            <p className="text-neutral-600 text-xs mt-1 text-center">Enter to send · Shift+Enter for newline</p>
          </div>
        </>
      )}
    </div>
  );
};
