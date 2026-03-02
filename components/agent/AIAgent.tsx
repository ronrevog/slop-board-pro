import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Project, Shot, Scene, Character, Location, CinematicSettings } from '../../types';
import { Bot, X, Send, Loader2, ChevronDown, ChevronUp, Sparkles, Trash2, AlertCircle } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';

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
// Gemini client — resolves API key from Vite-injected env vars
// ─────────────────────────────────────────────────────────────────────────────

function getGeminiKey(): string {
  // Vite injects both via define in vite.config.ts
  const key =
    (typeof process !== 'undefined' && process.env?.API_KEY) ||
    (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) ||
    localStorage.getItem('gemini_api_key') ||
    '';
  return key;
}

// ─────────────────────────────────────────────────────────────────────────────
// Call Gemini
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
      })),
    })),
    characters: project.characters?.map(c => ({
      id: c.id,
      name: c.name,
      description: c.description,
      age: c.age,
      occupation: c.occupation,
    })),
    locations: project.locations?.map(l => ({
      id: l.id,
      name: l.name,
      description: l.description,
      timeOfDay: l.timeOfDay,
      atmosphere: l.atmosphere,
    })),
    settings: project.settings,
  };

  const historyContext = history
    .slice(-10)
    .map(m => `${m.role === 'user' ? 'User' : 'SLOPBOT'}: ${m.text}`)
    .join('\n');

  const systemPrompt = `You are SLOPBOT, an AI director's assistant embedded inside Slop Board — a cinematic storyboarding and pre-production app.
You have FULL control over the entire project. You can create, edit, and delete scenes, shots, characters, locations, and settings.
You can also navigate to any section of the app.

CURRENT PROJECT STATE:
${JSON.stringify(projectSummary, null, 2)}

When you want to perform an action, include it in your response as a JSON block wrapped in triple backticks tagged "actions":
\`\`\`actions
[
  { "type": "ACTION_TYPE", "description": "what you did in plain English", "payload": { ... } }
]
\`\`\`

AVAILABLE ACTIONS AND THEIR EXACT PAYLOADS:

Project:
- RENAME_PROJECT: { "title": string }

Scenes:
- ADD_SCENE: { "name": string }
- DELETE_SCENE: { "sceneId": string }
- RENAME_SCENE: { "sceneId": string, "name": string }

Shots (always use the scene's ID from the project state above):
- ADD_SHOT: {
    "sceneId": string,
    "description": string,
    "action": string,
    "shotType": "Extreme Wide"|"Wide"|"Medium"|"Close Up"|"Extreme Close Up"|"Insert"|"High Angle"|"Low Angle"|"Dutch Angle (45°)"|"Overhead"|"Over the Shoulder",
    "cameraMove": "Static"|"Dolly In"|"Dolly Out"|"Pan"|"Tilt"|"Handheld"|"Tracking"|"Crane"|"Arc"|"Zoom In"|"Zoom Out"|"Whip Pan"
  }
- DELETE_SHOT: { "sceneId": string, "shotId": string }
- UPDATE_SHOT: { "sceneId": string, "shotId": string, "description"?: string, "action"?: string, "shotType"?: string, "cameraMove"?: string, "notes"?: string }

Characters:
- ADD_CHARACTER: { "name": string, "description": string, "age"?: string, "occupation"?: string, "wardrobe"?: string }
- UPDATE_CHARACTER: { "characterId": string, "name"?: string, "description"?: string, "age"?: string, "occupation"?: string, "wardrobe"?: string }
- DELETE_CHARACTER: { "characterId": string }

Locations:
- ADD_LOCATION: { "name": string, "description": string, "timeOfDay"?: string, "atmosphere"?: string }
- UPDATE_LOCATION: { "locationId": string, "name"?: string, "description"?: string, "timeOfDay"?: string, "atmosphere"?: string }
- DELETE_LOCATION: { "locationId": string }

Cinematic Settings:
- UPDATE_SETTINGS: { "cinematographer"?: string, "filmStock"?: string, "lens"?: string, "lighting"?: string, "aspectRatio"?: string, "colorGrade"?: string }

Navigation (switches the active tab in the app):
- NAVIGATE: { "tab": "script"|"characters"|"locations"|"board"|"video"|"motion"|"settings"|"timeline" }

RULES:
1. Always respond conversationally AND perform the requested actions.
2. When creating multiple shots, include them all in a single actions array.
3. Always use the exact scene/character/location IDs from the project state above.
4. Be creative and cinematic in your descriptions — you are a film director's assistant.
5. Keep your conversational reply concise (2-4 sentences max).
6. If asked to "go to" or "navigate to" a section, use the NAVIGATE action.
7. If the project has no scenes, create one first before adding shots.

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
// Apply actions to the project
// ─────────────────────────────────────────────────────────────────────────────

function applyActions(
  project: Project,
  actions: AgentAction[],
  onNavigate?: (tab: string) => void
): Project {
  let updated = { ...project };

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
          characters: [],
          locationId: updated.locations?.[0]?.id ?? '',
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

      // ── Characters ───────────────────────────────────────────────────────
      case 'ADD_CHARACTER': {
        const newChar: Character = {
          id: crypto.randomUUID(),
          name: (p?.name as string) || 'New Character',
          description: (p?.description as string) || '',
          age: p?.age as string | undefined,
          occupation: p?.occupation as string | undefined,
          wardrobe: p?.wardrobe as string | undefined,
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

      default:
        console.warn('SLOPBOT: unknown action type:', action.type);
        break;
    }
  }

  return updated;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  'Add a new scene',
  'Create 3 cinematic shots',
  'Add a character',
  'Add a location',
  'Go to timeline',
  'What shots do I have?',
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
      text: `Hey! I'm **SLOPBOT** — your AI director's assistant.\n\nI have full control over this project. I can create scenes, shots, characters, and locations, update cinematic settings, and navigate anywhere in the app.\n\nWhat would you like to do?`,
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  const handleSend = useCallback(async () => {
    const text = input.trim();
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

      // Apply actions to project state
      if (actions.length > 0) {
        const updatedProject = applyActions(project, actions, onNavigate);
        onUpdateProject(updatedProject);
      }

      const agentMsg: AgentMessage = {
        id: crypto.randomUUID(),
        role: 'agent',
        text: reply,
        timestamp: Date.now(),
        actions,
        error: reply.startsWith('Gemini error:') || reply.startsWith('No Gemini API key'),
      };

      setMessages(prev => [...prev, agentMsg]);
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
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl transition-all duration-300 overflow-hidden"
      style={{
        width: '22rem',
        height: isMinimized ? '3.5rem' : '38rem',
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
          <div className={`w-2 h-2 rounded-full ml-1 ${apiKeyMissing ? 'bg-yellow-500' : 'bg-green-500 animate-pulse'}`} />
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={e => { e.stopPropagation(); clearHistory(); }}
            className="text-neutral-500 hover:text-neutral-300 transition-colors p-1 rounded"
            title="Clear chat"
          >
            <Trash2 size={13} />
          </button>
          {isMinimized ? (
            <ChevronUp size={15} className="text-neutral-400" />
          ) : (
            <ChevronDown size={15} className="text-neutral-400" />
          )}
          {onClose && (
            <button
              onClick={e => { e.stopPropagation(); onClose(); }}
              className="text-neutral-500 hover:text-red-400 transition-colors p-1 rounded"
              title="Close"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* API key warning */}
          {apiKeyMissing && (
            <div className="mx-3 mt-2 px-3 py-2 bg-yellow-900/30 border border-yellow-700/50 rounded-lg flex items-start gap-2">
              <AlertCircle size={13} className="text-yellow-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-yellow-400">
                No Gemini API key found. Add <code className="bg-neutral-800 px-1 rounded">GEMINI_API_KEY</code> to your <code className="bg-neutral-800 px-1 rounded">.env</code> file or enter it in Settings.
              </p>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} items-end gap-2`}
              >
                {msg.role === 'agent' && (
                  <div className="w-6 h-6 rounded-full bg-red-600 flex items-center justify-center flex-shrink-0 mb-0.5">
                    <Bot size={11} className="text-white" />
                  </div>
                )}
                <div
                  className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-red-700 text-white rounded-br-sm'
                      : msg.error
                      ? 'bg-red-950/60 text-red-300 border border-red-800/50 rounded-bl-sm'
                      : 'bg-neutral-800 text-neutral-300 rounded-bl-sm'
                  }`}
                >
                  <div className="whitespace-pre-wrap break-words">
                    {msg.text.split('\n').map((line, i) => (
                      <div key={i}>{renderText(line)}</div>
                    ))}
                  </div>
                  {msg.actions && msg.actions.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-neutral-600/60 space-y-1">
                      {msg.actions.map((action, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-xs text-green-400">
                          <Sparkles size={10} className="flex-shrink-0" />
                          <span>{action.description}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start items-end gap-2">
                <div className="w-6 h-6 rounded-full bg-red-600 flex items-center justify-center flex-shrink-0">
                  <Bot size={11} className="text-white" />
                </div>
                <div className="bg-neutral-800 rounded-2xl rounded-bl-sm px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick actions */}
          <div className="px-3 pb-2 flex gap-1.5 flex-wrap">
            {QUICK_ACTIONS.map(q => (
              <button
                key={q}
                onClick={() => { setInput(q); setTimeout(() => inputRef.current?.focus(), 50); }}
                className="text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white px-2 py-1 rounded-full border border-neutral-700 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="px-3 pb-3 pt-1 border-t border-neutral-700 flex-shrink-0">
            <div className="flex items-end gap-2 bg-neutral-800 rounded-xl px-3 py-2 border border-neutral-600 focus-within:border-red-600 transition-colors">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Tell SLOPBOT what to do..."
                className="flex-1 bg-transparent text-white text-sm resize-none outline-none placeholder-neutral-500 max-h-24"
                rows={1}
                disabled={isLoading}
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="w-7 h-7 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors flex-shrink-0"
              >
                {isLoading ? (
                  <Loader2 size={13} className="text-white animate-spin" />
                ) : (
                  <Send size={13} className="text-white" />
                )}
              </button>
            </div>
            <p className="text-xs text-neutral-600 mt-1 text-center">Enter to send · Shift+Enter for newline</p>
          </div>
        </>
      )}
    </div>
  );
};

export default AIAgent;
