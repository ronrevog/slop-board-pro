
import React, { useState, useEffect } from 'react';
import { analyzeScript, analyzeScreenplayPDF, extractTextFromPDF, generateShotImage, editImage, generateAssetImage, alterShotImage, generateShotVideo, extendShotVideo, updateAssetWithDetails, generateCoverageShots, upscaleImage, generateCharacterTurnaround, generateLocationTurnaround, chatEditImage } from '../services/geminiService';
import { Project, Shot, CinematicSettings, Character, Location, VideoSegment, Scene, ImageHistoryEntry, VideoProviderSettings, DEFAULT_VIDEO_SETTINGS, TurnaroundImage } from '../types';
import { CINEMATOGRAPHERS, FILM_STOCKS, LENSES, LIGHTING_STYLES, ASPECT_RATIOS, RESOLUTIONS, ANAMORPHIC_LENS_PROMPTS } from '../constants';
import { ShotCard } from './ShotCard';
import { AssetCard } from './AssetCard';
import { Button } from './Button';
import { ShotDetailModal } from './ShotDetailModal';
import { VideoShotCard, WanGenerationSettings, ProjectVideoRef } from './VideoShotCard';
import { generateWanVideo, generateAuroraVideo, validateFalApiKey, AuroraGenerationSettings, uploadFileToFal } from '../services/falService';
import { generateSeedanceVideo, SeedanceGenerationSettings, uploadImageToFalStorage } from '../services/seedanceService';
import { generatePiAPISeedance2Omni, uploadRefsToPiAPI, uploadPiAPIEphemeral, PiAPISeedanceAspectRatio, PiAPISeedanceResolution } from '../services/piapiService';
import { MotionControl } from './MotionControl';
import { Clapperboard, Settings, Users, MapPin, Film, ChevronRight, LayoutGrid, Plus, ChevronLeft, Home, Video, Play, Loader2, Download, AlertCircle, ImageIcon, MonitorPlay, Layers, Trash2, Edit3, ChevronDown, ChevronUp, Focus, FileText, Upload, CheckSquare, Square, Bot, Clock } from 'lucide-react';
import { AIAgent } from './agent/AIAgent';
import { TimelineEditor } from './timeline/TimelineEditor';

interface BackupStatus {
  isActive: boolean;
  lastBackupTime: number | null;
  error: string | null;
  isSupported: boolean;
}

interface ProjectEditorProps {
  initialProject: Project;
  onSave: (project: Project) => void;
  onBack: () => void;
  backupStatus?: BackupStatus;
  onSetBackupFile?: () => void;
}

export const ProjectEditor: React.FC<ProjectEditorProps> = ({ initialProject, onSave, onBack, backupStatus, onSetBackupFile }) => {
  // Initialize internal state with the passed project
  const [project, setProject] = useState<Project>(() => {
    // Ensure scenes array exists for backward compatibility
    if (!initialProject.scenes || initialProject.scenes.length === 0) {
      const defaultScene: Scene = {
        id: crypto.randomUUID(),
        name: 'Scene 1',
        scriptContent: initialProject.scriptContent || '',
        shots: initialProject.shots || [],
        order: 0
      };
      return { ...initialProject, scenes: [defaultScene] };
    }
    return initialProject;
  });
  const [activeSceneId, setActiveSceneId] = useState<string>(() => project.scenes?.[0]?.id || '');
  const [activeTab, setActiveTab] = useState<'script' | 'characters' | 'locations' | 'board' | 'video' | 'motion' | 'settings' | 'timeline'>('board');
  const [agentOpen, setAgentOpen] = useState(false);
  const [isBreakingDown, setIsBreakingDown] = useState(false);
  const [isGeneratingCoverage, setIsGeneratingCoverage] = useState(false);
  const [coverageSourceShotId, setCoverageSourceShotId] = useState<string | null>(null);
  const [expandedShotId, setExpandedShotId] = useState<string | null>(null);
  const [editingSceneName, setEditingSceneName] = useState<string | null>(null);
  const [scenesCollapsed, setScenesCollapsed] = useState(false);

  // fal.ai API Key Validation State
  const [falKeyValidating, setFalKeyValidating] = useState(false);
  const [falKeyStatus, setFalKeyStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const [falKeyError, setFalKeyError] = useState<string | null>(null);

  // Google API Key State
  const [googleApiKey, setGoogleApiKey] = useState<string>(() => localStorage.getItem('gemini_api_key') || '');
  const [googleKeyStatus, setGoogleKeyStatus] = useState<'idle' | 'saved'>(() =>
    localStorage.getItem('gemini_api_key') ? 'saved' : 'idle'
  );

  // Master API key save status
  const [masterKeySaved, setMasterKeySaved] = useState(false);

  // PiAPI key save status — PiAPI doesn't expose a validation endpoint so we
  // just confirm "saved" after the user clicks the button.
  const [piapiKeyStatus, setPiapiKeyStatus] = useState<'idle' | 'saved'>('idle');

  // Auto-populate API keys from localStorage on mount (so keys persist across projects/sessions)
  useEffect(() => {
    const savedFalKey = localStorage.getItem('slop_fal_api_key');
    const savedPiapiKey = localStorage.getItem('slop_piapi_api_key');

    setProject(prev => {
      const vs = prev.videoSettings || DEFAULT_VIDEO_SETTINGS;
      const newFal = !vs.falApiKey && savedFalKey ? savedFalKey : vs.falApiKey;
      const newPiapi = !vs.piapiApiKey && savedPiapiKey ? savedPiapiKey : vs.piapiApiKey;
      if (newFal !== vs.falApiKey || newPiapi !== vs.piapiApiKey) {
        return { ...prev, videoSettings: { ...vs, falApiKey: newFal, piapiApiKey: newPiapi } };
      }
      return prev;
    });
    if (savedPiapiKey) setPiapiKeyStatus('saved');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Save all API keys to localStorage
  const handleSaveAllApiKeys = () => {
    // Google key
    if (googleApiKey.trim()) {
      localStorage.setItem('gemini_api_key', googleApiKey.trim());
      setGoogleKeyStatus('saved');
    }
    // fal.ai key
    const falKey = project.videoSettings?.falApiKey;
    if (falKey?.trim()) {
      localStorage.setItem('slop_fal_api_key', falKey.trim());
      setFalKeyStatus('valid');
    }
    // PiAPI key
    const piapiKey = project.videoSettings?.piapiApiKey;
    if (piapiKey?.trim()) {
      localStorage.setItem('slop_piapi_api_key', piapiKey.trim());
      setPiapiKeyStatus('saved');
    }
    // Save project too
    onSave(project);
    setMasterKeySaved(true);
    setTimeout(() => setMasterKeySaved(false), 3000);
  };

  // PDF Upload State
  const [isUploadingPDF, setIsUploadingPDF] = useState(false);
  const [isStandardScreenplayFormat, setIsStandardScreenplayFormat] = useState(true);
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);

  // Text Selection State for partial analysis
  const [selectedText, setSelectedText] = useState<string>('');
  const [analyzedRanges, setAnalyzedRanges] = useState<Array<{ start: number; end: number }>>([]);
  const scriptTextareaRef = React.useRef<HTMLTextAreaElement>(null);
  const highlightOverlayRef = React.useRef<HTMLDivElement>(null);

  // Sync scroll between textarea and highlight overlay
  const handleScriptScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (highlightOverlayRef.current) {
      highlightOverlayRef.current.scrollTop = e.currentTarget.scrollTop;
      highlightOverlayRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  // Get the currently active scene
  const activeScene = project.scenes?.find(s => s.id === activeSceneId) || project.scenes?.[0];
  const currentShots = activeScene?.shots || [];

  // --- Scene Handlers ---
  const handleAddScene = () => {
    const newScene: Scene = {
      id: crypto.randomUUID(),
      name: `Scene ${(project.scenes?.length || 0) + 1}`,
      scriptContent: '',
      shots: [],
      order: project.scenes?.length || 0
    };
    setProject(prev => ({
      ...prev,
      scenes: [...(prev.scenes || []), newScene]
    }));
    setActiveSceneId(newScene.id);
  };

  const handleDeleteScene = (sceneId: string) => {
    if ((project.scenes?.length || 0) <= 1) return; // Keep at least one scene
    setProject(prev => {
      const filtered = prev.scenes?.filter(s => s.id !== sceneId) || [];
      return { ...prev, scenes: filtered };
    });
    if (activeSceneId === sceneId) {
      setActiveSceneId(project.scenes?.find(s => s.id !== sceneId)?.id || '');
    }
  };

  const handleRenameScene = (sceneId: string, newName: string) => {
    setProject(prev => ({
      ...prev,
      scenes: prev.scenes?.map(s => s.id === sceneId ? { ...s, name: newName } : s) || []
    }));
    setEditingSceneName(null);
  };

  const updateSceneShots = (sceneId: string, updater: (shots: Shot[]) => Shot[]) => {
    setProject(prev => ({
      ...prev,
      scenes: prev.scenes?.map(s => s.id === sceneId ? { ...s, shots: updater(s.shots) } : s) || []
    }));
  };

  const updateSceneScript = (sceneId: string, script: string) => {
    setProject(prev => ({
      ...prev,
      scenes: prev.scenes?.map(s => s.id === sceneId ? { ...s, scriptContent: script } : s) || []
    }));
  };

  // Auto-save effect: Debounced to prevent constant IndexedDB writes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      onSave(project);
    }, 1000); // Wait 1 second after last change before saving

    return () => clearTimeout(timeoutId);
  }, [project, onSave]);

  const handleSettingChange = (key: keyof CinematicSettings, value: string) => {
    setProject(prev => ({
      ...prev,
      settings: { ...prev.settings, [key]: value }
    }));
  };

  // Helper function to match character names in text to existing project characters
  const matchCharacterByName = (name: string, existingCharacters: Character[]): string | undefined => {
    const normalizedName = name.toLowerCase().trim();
    // Try exact match first
    let match = existingCharacters.find(c => c.name.toLowerCase().trim() === normalizedName);
    if (match) return match.id;
    // Try partial match (name contains or is contained)
    match = existingCharacters.find(c =>
      c.name.toLowerCase().includes(normalizedName) ||
      normalizedName.includes(c.name.toLowerCase())
    );
    return match?.id;
  };

  // Helper function to match location names to existing project locations
  const matchLocationByName = (name: string, existingLocations: Location[]): string | undefined => {
    const normalizedName = name.toLowerCase().trim();
    // Try exact match first
    let match = existingLocations.find(l => l.name.toLowerCase().trim() === normalizedName);
    if (match) return match.id;
    // Try partial match
    match = existingLocations.find(l =>
      l.name.toLowerCase().includes(normalizedName) ||
      normalizedName.includes(l.name.toLowerCase())
    );
    return match?.id;
  };

  // Get selection from textarea
  const getTextareaSelection = (): { text: string; start: number; end: number } | null => {
    const textarea = scriptTextareaRef.current;
    if (!textarea) return null;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (start === end) return null; // No selection

    const selectedText = project.scriptContent.substring(start, end);
    return { text: selectedText, start, end };
  };

  const handleScriptBreakdown = async () => {
    if (!project.scriptContent.trim()) return;
    setIsBreakingDown(true);

    try {
      // Check if there's a text selection - analyze only the selected portion
      const selection = getTextareaSelection();
      const textToAnalyze = selection ? selection.text : project.scriptContent;

      if (!textToAnalyze.trim()) return;

      // Use comprehensive script analysis that extracts characters, locations, and shots
      const analysis = await analyzeScript(textToAnalyze, project.settings);

      // Check if we have existing characters/locations to match against
      const hasExistingCharacters = project.characters.length > 0;
      const hasExistingLocations = project.locations.length > 0;

      // Create or match characters
      let workingCharacters = [...project.characters];
      const characterIdMap: Record<string, string> = {}; // map from extracted name to ID

      analysis.characters.forEach(c => {
        const existingId = matchCharacterByName(c.name, workingCharacters);
        if (existingId) {
          // Character already exists, map the name to existing ID
          characterIdMap[c.name.toLowerCase()] = existingId;
        } else {
          // Create new character
          const newId = crypto.randomUUID();
          characterIdMap[c.name.toLowerCase()] = newId;
          workingCharacters.push({
            id: newId,
            name: c.name,
            description: c.description,
            isGenerating: false,
            isEditing: false
          });
        }
      });

      // Create or match locations
      let workingLocations = [...project.locations];
      const locationIdMap: Record<string, string> = {}; // map from extracted name to ID

      analysis.locations.forEach(l => {
        const existingId = matchLocationByName(l.name, workingLocations);
        if (existingId) {
          // Location already exists, map the name to existing ID
          locationIdMap[l.name.toLowerCase()] = existingId;
        } else {
          // Create new location
          const newId = crypto.randomUUID();
          locationIdMap[l.name.toLowerCase()] = newId;
          workingLocations.push({
            id: newId,
            name: l.name,
            description: l.description,
            isGenerating: false,
            isEditing: false
          });
        }
      });

      // Get existing shots count for numbering
      const existingShotsCount = currentShots.length;

      // Create shots with character and location linking (auto-matched!)
      const newShots: Shot[] = analysis.shots.map((s, idx) => {
        const lines = [];
        if (s.dialogue && s.speaker) {
          // Try to find the character by speaker name in our character map
          const speakerId = characterIdMap[s.speaker.toLowerCase()] || '';
          lines.push({
            id: crypto.randomUUID(),
            speakerId,
            text: s.dialogue
          });
        }

        // Auto-detect characters mentioned in description/action
        const linkedCharacters: string[] = [];
        const descLower = (s.description + ' ' + s.action).toLowerCase();
        Object.entries(characterIdMap).forEach(([name, id]) => {
          if (descLower.includes(name) && !linkedCharacters.includes(id)) {
            linkedCharacters.push(id);
          }
        });

        // If speaker exists, add them to characters
        if (s.speaker) {
          const speakerId = characterIdMap[s.speaker.toLowerCase()];
          if (speakerId && !linkedCharacters.includes(speakerId)) {
            linkedCharacters.push(speakerId);
          }
        }

        // Try to match location from description
        let locationId = Object.values(locationIdMap)[0] || workingLocations[0]?.id || '';

        return {
          id: crypto.randomUUID(),
          number: existingShotsCount + idx + 1,
          description: s.description || '',
          action: s.action || '',
          dialogueLines: lines,
          shotType: (s.shotType as any) || 'Medium',
          cameraMove: (s.cameraMove as any) || 'Static',
          composition: 'None' as const,
          characters: linkedCharacters, // AUTO-LINKED!
          locationId: locationId, // AUTO-LINKED!
          isGenerating: false,
          isEditing: false,
        };
      });

      // If selection was used, mark that range as analyzed
      if (selection) {
        setAnalyzedRanges(prev => [...prev, { start: selection.start, end: selection.end }]);
      }

      // Update project - add new shots to existing ones (don't replace)
      setProject(prev => ({
        ...prev,
        characters: workingCharacters,
        locations: workingLocations,
        scenes: prev.scenes?.map(s =>
          s.id === activeSceneId ? {
            ...s,
            shots: selection ? [...s.shots, ...newShots] : newShots, // Append if selection, replace if full
            scriptContent: selection ? prev.scriptContent : project.scriptContent
          } : s
        ) || []
      }));

      setActiveTab('board');
    } catch (e) {
      console.error(e);
    } finally {
      setIsBreakingDown(false);
    }
  };

  // --- PDF Upload Handler ---
  const handlePDFUpload = async (file: File) => {
    if (!file.name.endsWith('.pdf')) {
      console.error("Only PDF files are supported");
      return;
    }

    setIsUploadingPDF(true);
    setPdfFileName(file.name);

    try {
      // Read PDF as base64
      const reader = new FileReader();
      const pdfBase64 = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Extract text from PDF using Gemini
      const extractedText = await extractTextFromPDF(pdfBase64);

      // Set the extracted text as the script content
      setProject(p => ({ ...p, scriptContent: extractedText }));

    } catch (e) {
      console.error("PDF extraction failed:", e);
    } finally {
      setIsUploadingPDF(false);
    }
  };

  // --- Full Screenplay Analysis (Multi-Scene) ---
  const handleFullScreenplayAnalysis = async () => {
    if (!project.scriptContent.trim()) return;
    setIsBreakingDown(true);

    try {
      // Use the multi-scene screenplay analysis with Deep Think
      const analysis = await analyzeScreenplayPDF(
        project.scriptContent,
        project.settings,
        isStandardScreenplayFormat
      );

      // Create new characters from extracted data
      const newCharacters: Character[] = analysis.characters.map(c => ({
        id: crypto.randomUUID(),
        name: c.name,
        description: c.description,
        isGenerating: false,
        isEditing: false
      }));

      // Create new locations from extracted data with ID mapping
      const locationIdMap: Record<string, string> = {};
      const newLocations: Location[] = analysis.locations.map(l => {
        const id = crypto.randomUUID();
        locationIdMap[l.name.toLowerCase()] = id;
        return {
          id,
          name: l.name,
          description: l.description,
          isGenerating: false,
          isEditing: false
        };
      });

      // Create scenes with shots from the analysis
      const newScenes: Scene[] = analysis.scenes.map((extractedScene, sceneIdx) => {
        // Find the location ID for this scene
        const locationId = locationIdMap[extractedScene.locationName?.toLowerCase() || ''] || newLocations[0]?.id || '';

        // Convert shots for this scene
        const sceneShots: Shot[] = extractedScene.shots.map((s, shotIdx) => {
          const lines = [];
          if (s.dialogue) {
            const speakerChar = newCharacters.find(c =>
              c.name.toLowerCase() === s.speaker?.toLowerCase()
            );
            lines.push({
              id: crypto.randomUUID(),
              speakerId: speakerChar?.id || "",
              text: s.dialogue
            });
          }

          return {
            id: crypto.randomUUID(),
            number: shotIdx + 1,
            description: s.description || '',
            action: s.action || '',
            dialogueLines: lines,
            shotType: (s.shotType as any) || 'Medium',
            cameraMove: (s.cameraMove as any) || 'Static',
            composition: 'None' as const,
            characters: [],
            locationId: locationId,
            isGenerating: false,
            isEditing: false,
          };
        });

        return {
          id: crypto.randomUUID(),
          name: extractedScene.name || `Scene ${sceneIdx + 1}`,
          scriptContent: extractedScene.scriptContent || '',
          shots: sceneShots,
          order: sceneIdx
        };
      });

      // If no scenes were extracted, create a default one
      if (newScenes.length === 0) {
        newScenes.push({
          id: crypto.randomUUID(),
          name: 'Scene 1',
          scriptContent: project.scriptContent,
          shots: [],
          order: 0
        });
      }

      // Update project with all extracted data
      setProject(prev => ({
        ...prev,
        characters: newCharacters,
        locations: newLocations,
        scenes: newScenes
      }));

      // Set the first scene as active
      setActiveSceneId(newScenes[0].id);
      setActiveTab('board');

    } catch (e) {
      console.error("Screenplay analysis failed:", e);
    } finally {
      setIsBreakingDown(false);
    }
  };

  // --- Shot Handlers (Scene-aware) ---

  const handleAddShot = () => {
    if (!activeSceneId) return;
    const newId = crypto.randomUUID();
    const newShot: Shot = {
      id: newId,
      number: currentShots.length + 1,
      description: '',
      action: '',
      dialogueLines: [],
      shotType: 'Medium',
      cameraMove: 'Static',
      composition: 'None',
      characters: [],
      locationId: project.locations[0]?.id || '',
      isGenerating: false,
      isEditing: false
    };
    updateSceneShots(activeSceneId, shots => [...shots, newShot]);
  };

  const handleDeleteShot = (id: string) => {
    if (!activeSceneId) return;
    updateSceneShots(activeSceneId, shots => {
      const filtered = shots.filter(s => s.id !== id);
      return filtered.map((s, idx) => ({ ...s, number: idx + 1 }));
    });
    if (expandedShotId === id) setExpandedShotId(null);
  };

  const handleDuplicateShot = (id: string) => {
    if (!activeSceneId) return;
    const shot = currentShots.find(s => s.id === id);
    if (!shot) return;

    // Create a new shot with the same data but new IDs
    const newShot: Shot = {
      ...shot,
      id: crypto.randomUUID(),
      number: currentShots.length + 1, // Will go at the end
      // Copy dialogue lines with new IDs
      dialogueLines: shot.dialogueLines?.map(line => ({
        ...line,
        id: crypto.randomUUID()
      })) || [],
      // Reset video-related fields (keep the image)
      videoUrl: undefined,
      videoSegments: undefined,
      videoPrompt: undefined,
      videoError: undefined,
      isVideoGenerating: false,
      isExtending: false,
      videoModel: undefined,
      // Reset generation states
      isGenerating: false,
      isEditing: false,
      isAltering: false
    };

    updateSceneShots(activeSceneId, shots => [...shots, newShot]);
  };

  // Helper to add image to history before replacing
  const addToImageHistory = (shot: Shot, source: ImageHistoryEntry['source']): ImageHistoryEntry[] => {
    if (!shot.imageUrl) return shot.imageHistory || [];
    const newEntry: ImageHistoryEntry = {
      id: crypto.randomUUID(),
      imageUrl: shot.imageUrl,
      timestamp: Date.now(),
      source
    };
    const existingHistory = shot.imageHistory || [];
    // Keep max 10 history entries per shot
    return [...existingHistory, newEntry].slice(-10);
  };

  const handleGenerateShot = async (shotId: string) => {
    if (!activeSceneId) return;
    updateSceneShots(activeSceneId, shots =>
      shots.map(s => s.id === shotId ? { ...s, isGenerating: true } : s)
    );

    try {
      const shot = currentShots.find(s => s.id === shotId);
      if (!shot) return;

      const imageUrl = await generateShotImage(shot, project.settings, project.characters, project.locations, currentShots);

      // Save current image to history before replacing
      const updatedHistory = addToImageHistory(shot, 'generate');

      updateSceneShots(activeSceneId, shots =>
        shots.map(s => s.id === shotId ? { ...s, isGenerating: false, imageUrl, imageHistory: updatedHistory } : s)
      );
    } catch (e) {
      console.error(e);
      updateSceneShots(activeSceneId, shots =>
        shots.map(s => s.id === shotId ? { ...s, isGenerating: false } : s)
      );
    }
  };

  const handleAlterShot = async (shotId: string) => {
    if (!activeSceneId) return;
    updateSceneShots(activeSceneId, shots =>
      shots.map(s => s.id === shotId ? { ...s, isAltering: true } : s)
    );

    try {
      const shot = currentShots.find(s => s.id === shotId);
      if (!shot || !shot.imageUrl) return;

      const imageUrl = await alterShotImage(shot, project.settings, project.characters, project.locations, currentShots);

      // Save current image to history before replacing
      const updatedHistory = addToImageHistory(shot, 'alter');

      updateSceneShots(activeSceneId, shots =>
        shots.map(s => s.id === shotId ? { ...s, isAltering: false, imageUrl, imageHistory: updatedHistory } : s)
      );
    } catch (e) {
      console.error(e);
      updateSceneShots(activeSceneId, shots =>
        shots.map(s => s.id === shotId ? { ...s, isAltering: false } : s)
      );
    }
  };

  const handleUpscaleShot = async (shotId: string) => {
    if (!activeSceneId) return;
    updateSceneShots(activeSceneId, shots =>
      shots.map(s => s.id === shotId ? { ...s, isUpscaling: true } : s)
    );

    try {
      const shot = currentShots.find(s => s.id === shotId);
      if (!shot || !shot.imageUrl) return;

      const imageUrl = await upscaleImage(shot.imageUrl, project.settings.aspectRatio);

      // Save current image to history before replacing
      const updatedHistory = addToImageHistory(shot, 'edit');

      updateSceneShots(activeSceneId, shots =>
        shots.map(s => s.id === shotId ? { ...s, isUpscaling: false, imageUrl, imageHistory: updatedHistory } : s)
      );
    } catch (e) {
      console.error("Upscale failed:", e);
      updateSceneShots(activeSceneId, shots =>
        shots.map(s => s.id === shotId ? { ...s, isUpscaling: false } : s)
      );
    }
  };

  const handleEditShotImage = async (shotId: string, prompt: string) => {
    if (!activeSceneId) return;
    updateSceneShots(activeSceneId, shots =>
      shots.map(s => s.id === shotId ? { ...s, isEditing: true } : s)
    );

    try {
      const shot = currentShots.find(s => s.id === shotId);
      if (!shot || !shot.imageUrl) return;

      const newImageUrl = await editImage(shot.imageUrl, prompt);

      // Save current image to history before replacing
      const updatedHistory = addToImageHistory(shot, 'edit');

      updateSceneShots(activeSceneId, shots =>
        shots.map(s => s.id === shotId ? { ...s, isEditing: false, imageUrl: newImageUrl, imageHistory: updatedHistory } : s)
      );
    } catch (e) {
      console.error(e);
      updateSceneShots(activeSceneId, shots =>
        shots.map(s => s.id === shotId ? { ...s, isEditing: false } : s)
      );
    }
  };

  const handleUploadShotImage = (shotId: string, file: File) => {
    if (!activeSceneId) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      const shot = currentShots.find(s => s.id === shotId);

      // Save current image to history before replacing
      const updatedHistory = shot ? addToImageHistory(shot, 'upload') : [];

      updateSceneShots(activeSceneId, shots =>
        shots.map(s => s.id === shotId ? { ...s, imageUrl: base64, imageHistory: updatedHistory } : s)
      );
    };
    reader.readAsDataURL(file);
  };

  // Restore image from history
  const handleRestoreFromHistory = (shotId: string, historyEntry: ImageHistoryEntry) => {
    if (!activeSceneId) return;
    const shot = currentShots.find(s => s.id === shotId);
    if (!shot) return;

    // Save current image to history first
    const updatedHistory = addToImageHistory(shot, 'generate');

    updateSceneShots(activeSceneId, shots =>
      shots.map(s => s.id === shotId ? { ...s, imageUrl: historyEntry.imageUrl, imageHistory: updatedHistory } : s)
    );
  };

  const updateShot = (id: string, updates: Partial<Shot>) => {
    if (!activeSceneId) return;
    updateSceneShots(activeSceneId, shots =>
      shots.map(s => s.id === id ? { ...s, ...updates } : s)
    );
  };

  const getExpandedShotIndex = () => currentShots.findIndex(s => s.id === expandedShotId);
  const handleNextShot = () => {
    const idx = getExpandedShotIndex();
    if (idx < currentShots.length - 1) setExpandedShotId(currentShots[idx + 1].id);
  };
  const handlePrevShot = () => {
    const idx = getExpandedShotIndex();
    if (idx > 0) setExpandedShotId(currentShots[idx - 1].id);
  };

  // --- Asset Handlers ---

  const addAsset = (type: 'Character' | 'Location') => {
    const newId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    const newItem = {
      id: newId,
      name: `New ${type}`,
      description: '',
      isGenerating: false
    };

    if (type === 'Character') {
      setProject(prev => ({ ...prev, characters: [...prev.characters, newItem] }));
    } else {
      setProject(prev => ({ ...prev, locations: [...prev.locations, newItem] }));
    }
  };

  const handleGenerateAsset = async (id: string, type: 'Character' | 'Location') => {
    const listKey = type === 'Character' ? 'characters' : 'locations';
    const item = (project[listKey] as any[]).find((i: any) => i.id === id);

    if (!item || !item.name.trim() || item.name.includes("New ")) return;

    setProject(prev => ({
      ...prev,
      [listKey]: prev[listKey].map((item: any) => item.id === id ? { ...item, isGenerating: true } : item)
    }));

    try {
      const imageUrl = await generateAssetImage(type, item.name, item.description, project.settings);
      setProject(prev => ({
        ...prev,
        [listKey]: prev[listKey].map((item: any) => item.id === id ? { ...item, isGenerating: false, imageUrl } : item)
      }));
    } catch (e) {
      setProject(prev => ({
        ...prev,
        [listKey]: prev[listKey].map((item: any) => item.id === id ? { ...item, isGenerating: false } : item)
      }));
    }
  };

  const handleEditAsset = async (id: string, prompt: string, type: 'Character' | 'Location') => {
    const listKey = type === 'Character' ? 'characters' : 'locations';
    setProject(prev => ({
      ...prev,
      [listKey]: prev[listKey].map((item: any) => item.id === id ? { ...item, isEditing: true } : item)
    }));
    try {
      const item = (project[listKey] as any[]).find((i: any) => i.id === id);
      if (!item || !item.imageUrl) return;
      const imageUrl = await editImage(item.imageUrl, prompt);
      setProject(prev => ({
        ...prev,
        [listKey]: prev[listKey].map((item: any) => item.id === id ? { ...item, isEditing: false, imageUrl } : item)
      }));
    } catch (e) {
      setProject(prev => ({
        ...prev,
        [listKey]: prev[listKey].map((item: any) => item.id === id ? { ...item, isEditing: false } : item)
      }));
    }
  };

  const handleUploadAsset = async (id: string, file: File, type: 'Character' | 'Location') => {
    const listKey = type === 'Character' ? 'characters' : 'locations';
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      setProject(prev => ({
        ...prev,
        [listKey]: prev[listKey].map((item: any) => item.id === id ? { ...item, imageUrl: base64 } : item)
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleUpdateAsset = (id: string, updates: Partial<Character | Location>, type: 'Character' | 'Location') => {
    const listKey = type === 'Character' ? 'characters' : 'locations';
    setProject(prev => ({
      ...prev,
      [listKey]: prev[listKey].map((item: any) => item.id === id ? { ...item, ...updates } : item)
    }));
  };

  const handleDeleteAsset = (id: string, type: 'Character' | 'Location') => {
    const listKey = type === 'Character' ? 'characters' : 'locations';
    setProject(prev => ({
      ...prev,
      [listKey]: prev[listKey].filter((item: any) => item.id !== id)
    }));
  };

  // Update asset image based on all detail fields
  const handleUpdateAssetWithDetails = async (id: string, type: 'Character' | 'Location') => {
    const listKey = type === 'Character' ? 'characters' : 'locations';
    const item = (project[listKey] as any[]).find((i: any) => i.id === id);
    if (!item || !item.imageUrl) return;

    // Set isUpdating flag
    setProject(prev => ({
      ...prev,
      [listKey]: prev[listKey].map((i: any) => i.id === id ? { ...i, isUpdating: true } : i)
    }));

    try {
      // Store original image if not already stored
      const currentOriginal = item.originalImageUrl || item.imageUrl;

      // Call the update function
      const newImageUrl = await updateAssetWithDetails(type, item, project.settings);

      setProject(prev => ({
        ...prev,
        [listKey]: prev[listKey].map((i: any) => i.id === id ? {
          ...i,
          isUpdating: false,
          imageUrl: newImageUrl,
          originalImageUrl: currentOriginal // Preserve the original
        } : i)
      }));
    } catch (e) {
      console.error("Update with details failed:", e);
      setProject(prev => ({
        ...prev,
        [listKey]: prev[listKey].map((i: any) => i.id === id ? { ...i, isUpdating: false } : i)
      }));
    }
  };

  // Reset asset image to original
  const handleResetAssetToOriginal = (id: string, type: 'Character' | 'Location') => {
    const listKey = type === 'Character' ? 'characters' : 'locations';
    const item = (project[listKey] as any[]).find((i: any) => i.id === id);
    if (!item || !item.originalImageUrl) return;

    setProject(prev => ({
      ...prev,
      [listKey]: prev[listKey].map((i: any) => i.id === id ? {
        ...i,
        imageUrl: i.originalImageUrl
      } : i)
    }));
  };

  const handleGenerateAll = async () => {
    for (const shot of currentShots) {
      if (!shot.imageUrl) await handleGenerateShot(shot.id);
    }
  };

  // --- Asset Turnaround Handlers ---
  const handleGenerateAssetTurnaround = async (id: string, type: 'Character' | 'Location') => {
    const listKey = type === 'Character' ? 'characters' : 'locations';
    const item = (project[listKey] as any[]).find((i: any) => i.id === id);
    if (!item || !item.imageUrl) return;

    setProject(prev => ({
      ...prev,
      [listKey]: prev[listKey].map((i: any) => i.id === id ? { ...i, isTurnaroundGenerating: true } : i)
    }));

    try {
      const results = type === 'Character'
        ? await generateCharacterTurnaround(item as Character, project.settings)
        : await generateLocationTurnaround(item as Location, project.settings);

      const turnaroundImages: TurnaroundImage[] = results.map(r => ({
        id: crypto.randomUUID(),
        angle: r.angle,
        imageUrl: r.imageUrl,
        isSelected: true // Selected by default
      }));

      setProject(prev => ({
        ...prev,
        [listKey]: prev[listKey].map((i: any) => i.id === id ? { ...i, isTurnaroundGenerating: false, turnaroundImages } : i)
      }));
    } catch (e) {
      console.error('Turnaround generation failed:', e);
      setProject(prev => ({
        ...prev,
        [listKey]: prev[listKey].map((i: any) => i.id === id ? { ...i, isTurnaroundGenerating: false } : i)
      }));
    }
  };

  const handleToggleTurnaroundRef = (assetId: string, turnaroundId: string, type: 'Character' | 'Location') => {
    const listKey = type === 'Character' ? 'characters' : 'locations';
    setProject(prev => ({
      ...prev,
      [listKey]: prev[listKey].map((i: any) => i.id === assetId ? {
        ...i,
        turnaroundImages: (i.turnaroundImages || []).map((t: TurnaroundImage) =>
          t.id === turnaroundId ? { ...t, isSelected: !t.isSelected } : t
        )
      } : i)
    }));
  };

  // --- Coverage Handler ---
  const handleGenerateCoverage = async () => {
    if (!activeSceneId) return;

    setIsGeneratingCoverage(true);
    try {
      // Build scene description from script content or existing shots
      const sceneScript = activeScene?.scriptContent || project.scriptContent || '';
      const existingShotDescriptions = currentShots.map(s => s.description).filter(Boolean).join('. ');
      const sceneDescription = sceneScript || existingShotDescriptions || `A scene with ${project.characters.map(c => c.name).join(' and ')}`;

      // Get the active location for this scene
      const activeLocationId = currentShots[0]?.locationId || project.locations[0]?.id;
      const activeLocation = project.locations.find(l => l.id === activeLocationId);

      // Generate coverage shots using AI
      const coverageSpecs = await generateCoverageShots(
        sceneDescription,
        project.characters,
        activeLocation,
        project.settings,
        currentShots
      );

      // Convert coverage specs to Shot objects
      const startingNumber = currentShots.length + 1;
      const newShots: Shot[] = coverageSpecs.map((spec, idx) => {
        // Try to link characters based on focusCharacter
        const linkedCharacters: string[] = [];
        if (spec.focusCharacter) {
          const foundChar = project.characters.find(c =>
            c.name.toLowerCase().includes(spec.focusCharacter!.toLowerCase()) ||
            spec.focusCharacter!.toLowerCase().includes(c.name.toLowerCase())
          );
          if (foundChar) linkedCharacters.push(foundChar.id);
        }
        // For wide/two shots, include all characters
        if (spec.coverageType.toLowerCase().includes('master') ||
          spec.coverageType.toLowerCase().includes('two-shot') ||
          spec.coverageType.toLowerCase().includes('wide')) {
          project.characters.forEach(c => {
            if (!linkedCharacters.includes(c.id)) linkedCharacters.push(c.id);
          });
        }

        // Build dialogue lines if present
        const dialogueLines = [];
        if (spec.dialogue && spec.speaker) {
          const speakerChar = project.characters.find(c =>
            c.name.toLowerCase() === spec.speaker?.toLowerCase()
          );
          dialogueLines.push({
            id: crypto.randomUUID(),
            speakerId: speakerChar?.id || "",
            text: spec.dialogue
          });
        }

        return {
          id: crypto.randomUUID(),
          number: startingNumber + idx,
          description: `[${spec.coverageType}] ${spec.description}`,
          action: spec.action || '',
          dialogueLines,
          shotType: (spec.shotType as any) || 'Medium',
          cameraMove: (spec.cameraMove as any) || 'Static',
          composition: 'None' as const,
          characters: linkedCharacters,
          locationId: activeLocationId || '',
          isGenerating: false,
          isEditing: false,
        };
      });

      // Add all coverage shots to the scene
      updateSceneShots(activeSceneId, shots => [...shots, ...newShots]);

    } catch (e) {
      console.error("Coverage generation failed:", e);
    } finally {
      setIsGeneratingCoverage(false);
    }
  };

  // --- Image-Based Coverage Handler ---
  const handleGenerateCoverageFromImage = async (sourceShotId: string) => {
    if (!activeSceneId) return;

    const sourceShot = currentShots.find(s => s.id === sourceShotId);
    if (!sourceShot || !sourceShot.imageUrl) return;

    setCoverageSourceShotId(sourceShotId);
    try {
      // Build scene description from the source shot
      const sceneDescription = sourceShot.description || sourceShot.action || `A cinematic scene`;

      // Get the location from the source shot
      const activeLocationId = sourceShot.locationId || project.locations[0]?.id;
      const activeLocation = project.locations.find(l => l.id === activeLocationId);

      // Generate coverage shots using AI (same function, but shots will use reference)
      const coverageSpecs = await generateCoverageShots(
        sceneDescription,
        project.characters,
        activeLocation,
        project.settings,
        currentShots
      );

      // Convert coverage specs to Shot objects, ALL with referenceShotId pointing to source
      const startingNumber = currentShots.length + 1;
      const newShots: Shot[] = coverageSpecs.map((spec, idx) => {
        // Try to link characters based on focusCharacter
        const linkedCharacters: string[] = [];
        if (spec.focusCharacter) {
          const foundChar = project.characters.find(c =>
            c.name.toLowerCase().includes(spec.focusCharacter!.toLowerCase()) ||
            spec.focusCharacter!.toLowerCase().includes(c.name.toLowerCase())
          );
          if (foundChar) linkedCharacters.push(foundChar.id);
        }
        // For wide/two shots, include all characters
        if (spec.coverageType.toLowerCase().includes('master') ||
          spec.coverageType.toLowerCase().includes('two-shot') ||
          spec.coverageType.toLowerCase().includes('wide')) {
          project.characters.forEach(c => {
            if (!linkedCharacters.includes(c.id)) linkedCharacters.push(c.id);
          });
        }

        // Build dialogue lines if present
        const dialogueLines = [];
        if (spec.dialogue && spec.speaker) {
          const speakerChar = project.characters.find(c =>
            c.name.toLowerCase() === spec.speaker?.toLowerCase()
          );
          dialogueLines.push({
            id: crypto.randomUUID(),
            speakerId: speakerChar?.id || "",
            text: spec.dialogue
          });
        }

        return {
          id: crypto.randomUUID(),
          number: startingNumber + idx,
          description: `[${spec.coverageType}] ${spec.description}`,
          action: spec.action || '',
          dialogueLines,
          shotType: (spec.shotType as any) || 'Medium',
          cameraMove: (spec.cameraMove as any) || 'Static',
          composition: 'None',
          characters: linkedCharacters,
          locationId: activeLocationId || '',
          referenceShotId: sourceShotId, // KEY: Set source shot as reference for visual consistency
          isGenerating: false,
          isEditing: false,
        };
      });

      // Add all coverage shots to the scene
      updateSceneShots(activeSceneId, shots => [...shots, ...newShots]);

    } catch (e) {
      console.error("Image-based coverage generation failed:", e);
    } finally {
      setCoverageSourceShotId(null);
    }
  };

  // --- Video Handlers ---

  // Helper to determine depth of field based on shot type and lens
  const getDepthOfFieldDescription = (shotType: string, lens: string) => {
    // Extract focal length from lens name if it's a C-Series
    const focalMatch = lens.match(/(\d+)mm/);
    const focalLength = focalMatch ? parseInt(focalMatch[1]) : 50;

    // Determine DOF based on shot type
    const isCloseUp = shotType.toLowerCase().includes('close') || shotType.toLowerCase().includes('insert');
    const isWide = shotType.toLowerCase().includes('wide') || shotType.toLowerCase().includes('extreme wide');

    if (isCloseUp) {
      return `Shallow depth of field - subject sharply in focus, background beautifully blurred with ${focalLength >= 75 ? 'creamy' : 'soft'} bokeh`;
    } else if (isWide) {
      return `Deep depth of field - foreground, subject, and background all in acceptable focus`;
    } else {
      return `Medium depth of field - subject in sharp focus with gradual background blur`;
    }
  };

  const synthesizeVideoPrompt = (shot: Shot) => {
    let dialogueText = "";
    if (shot.dialogueLines && shot.dialogueLines.length > 0) {
      dialogueText = "\nDialogue:\n";
      shot.dialogueLines.forEach(line => {
        const speaker = project.characters.find(c => c.id === line.speakerId)?.name || "Unknown";
        dialogueText += `${speaker}: "${line.text}"\n`;
      });
    }

    // Get lens information
    const lens = project.settings.lens;
    const isAnamorphicLens = lens.startsWith("Panavision C-Series");
    const anamorphicPrompt = isAnamorphicLens ? ANAMORPHIC_LENS_PROMPTS[lens] : null;

    // Build depth of field description
    const dofDescription = getDepthOfFieldDescription(shot.shotType, lens);

    // Build lens characteristics section
    let lensSection = `\nLens: ${lens}`;
    lensSection += `\nDepth of Field: ${dofDescription}`;

    if (anamorphicPrompt) {
      lensSection += `\nAnamorphic Characteristics: Oval/vertical bokeh, blue horizontal lens flares on bright light sources, classic cinematic anamorphic look.`;
    }

    return `Cinematic Shot.
Action: ${shot.action}
Description: ${shot.description}
Camera Movement: ${shot.cameraMove}.
Shot Type: ${shot.shotType}.${lensSection}
Lighting: ${project.settings.lighting}.
Style: ${project.settings.cinematographer}, shot on ${project.settings.filmStock}.${dialogueText}`;
  };

  const handleGenerateVideo = async (shotId: string, model: 'fast' | 'quality') => {
    if (!activeSceneId) return;
    const shot = currentShots.find(s => s.id === shotId);
    if (!shot) return;

    // 1. API Key Selection Check
    if ((window as any).aistudio) {
      try {
        const hasKey = await (window as any).aistudio.hasSelectedApiKey();
        if (!hasKey) {
          await (window as any).aistudio.openSelectKey();
        }
      } catch (e) {
        console.error("API Key check failed", e);
      }
    }

    updateSceneShots(activeSceneId, shots =>
      shots.map(s => s.id === shotId ? { ...s, isVideoGenerating: true, videoModel: model, videoError: undefined } : s)
    );

    try {
      const promptToUse = shot.videoPrompt || synthesizeVideoPrompt(shot);
      const videoUrl = await generateShotVideo(shot, project.settings, model, promptToUse);

      const newSegment: VideoSegment = {
        id: crypto.randomUUID(),
        url: videoUrl,
        timestamp: Date.now(),
        model: model,
        isExtension: false
      };

      const existingSegments = shot.videoSegments || [];

      updateSceneShots(activeSceneId, shots =>
        shots.map(s => s.id === shotId ? {
          ...s,
          isVideoGenerating: false,
          videoUrl,
          videoSegments: [...existingSegments, newSegment],
          videoError: undefined
        } : s)
      );
    } catch (e: any) {
      console.error(e);
      const errorMessage = e.message || 'Video generation failed';
      updateSceneShots(activeSceneId, shots =>
        shots.map(s => s.id === shotId ? { ...s, isVideoGenerating: false, videoError: errorMessage } : s)
      );
      if (e.message?.includes("Requested entity was not found") && (window as any).aistudio) {
        await (window as any).aistudio.openSelectKey();
      }
    }
  };

  const handleExtendVideo = async (shotId: string, model: 'fast' | 'quality') => {
    if (!activeSceneId) return;
    const shot = currentShots.find(s => s.id === shotId);
    if (!shot || !shot.videoUrl) return;

    // 1. API Key Selection Check
    if ((window as any).aistudio) {
      try {
        const hasKey = await (window as any).aistudio.hasSelectedApiKey();
        if (!hasKey) {
          await (window as any).aistudio.openSelectKey();
        }
      } catch (e) {
        console.error("API Key check failed", e);
      }
    }

    updateSceneShots(activeSceneId, shots =>
      shots.map(s => s.id === shotId ? { ...s, isExtending: true, videoModel: model, videoError: undefined } : s)
    );

    try {
      const promptToUse = shot.videoPrompt || synthesizeVideoPrompt(shot);
      const videoUrl = await extendShotVideo(shot, project.settings, model, promptToUse, shot.videoUrl);

      const newSegment: VideoSegment = {
        id: crypto.randomUUID(),
        url: videoUrl,
        timestamp: Date.now(),
        model: model,
        isExtension: true
      };

      const existingSegments = shot.videoSegments || [];

      updateSceneShots(activeSceneId, shots =>
        shots.map(s => s.id === shotId ? {
          ...s,
          isExtending: false,
          videoUrl,
          videoSegments: [...existingSegments, newSegment],
          videoError: undefined
        } : s)
      );
    } catch (e: any) {
      console.error(e);
      const errorMessage = e.message || 'Video extension failed';
      updateSceneShots(activeSceneId, shots =>
        shots.map(s => s.id === shotId ? { ...s, isExtending: false, videoError: errorMessage } : s)
      );
      if (e.message?.includes("Requested entity was not found") && (window as any).aistudio) {
        await (window as any).aistudio.openSelectKey();
      }
    }
  };

  const handleDownloadVideo = (shot: Shot, sceneName?: string) => {
    if (!shot.videoUrl) return;
    const link = document.createElement('a');
    link.href = shot.videoUrl;
    const scenePrefix = sceneName ? `${sceneName.replace(/\s+/g, '-').toLowerCase()}-` : '';
    link.download = `${scenePrefix}shot-${shot.number}-video.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleUpdateVideoPrompt = (shotId: string, prompt: string) => {
    updateShot(shotId, { videoPrompt: prompt });
  };

  const handleCaptureFrame = (shotId: string, imageDataUrl: string) => {
    updateShot(shotId, { imageUrl: imageDataUrl });
  };

  // --- Chat Edit Handler ---
  const handleChatEdit = async (shotId: string, prompt: string) => {
    if (!activeSceneId) return;
    const shot = currentShots.find(s => s.id === shotId);
    if (!shot || !shot.imageUrl) return;

    // Add user message to chat history immediately
    const userMessage = { id: crypto.randomUUID(), role: 'user' as const, text: prompt, timestamp: Date.now() };
    const currentHistory = shot.chatHistory || [];

    updateSceneShots(activeSceneId, shots =>
      shots.map(s => s.id === shotId ? { ...s, isChatEditing: true, chatHistory: [...currentHistory, userMessage] } : s)
    );

    try {
      const newImageUrl = await chatEditImage(shot.imageUrl, currentHistory, prompt, project.settings.aspectRatio);

      // Save current image to history before replacing
      const updatedImageHistory = addToImageHistory(shot, 'edit');

      // Add assistant message confirming the edit
      const assistantMessage = { id: crypto.randomUUID(), role: 'assistant' as const, text: 'Applied', imageUrl: newImageUrl, timestamp: Date.now() };

      updateSceneShots(activeSceneId, shots =>
        shots.map(s => s.id === shotId ? {
          ...s,
          isChatEditing: false,
          imageUrl: newImageUrl,
          imageHistory: updatedImageHistory,
          chatHistory: [...currentHistory, userMessage, assistantMessage]
        } : s)
      );
    } catch (e) {
      console.error('Chat edit failed:', e);
      // Remove the user message on failure and add error
      updateSceneShots(activeSceneId, shots =>
        shots.map(s => s.id === shotId ? { ...s, isChatEditing: false, chatHistory: currentHistory } : s)
      );
    }
  };

  const handleDeleteVideoSegment = (shotId: string, segmentId: string) => {
    if (!activeSceneId) return;
    updateSceneShots(activeSceneId, shots =>
      shots.map(s => {
        if (s.id !== shotId) return s;
        const updatedSegments = (s.videoSegments || []).filter(seg => seg.id !== segmentId);
        // Update videoUrl to the last remaining segment, or clear if none left
        const newVideoUrl = updatedSegments.length > 0
          ? updatedSegments[updatedSegments.length - 1].url
          : undefined;
        return {
          ...s,
          videoSegments: updatedSegments,
          videoUrl: newVideoUrl
        };
      })
    );
  };

  // --- Wan v2.6 Video Generation ---
  const handleGenerateWanVideo = async (shotId: string, wanSettings: WanGenerationSettings, sourceVideoUrl?: string) => {
    if (!activeSceneId) return;
    const shot = currentShots.find(s => s.id === shotId);
    if (!shot || !shot.imageUrl) return;

    const videoSettings = project.videoSettings || DEFAULT_VIDEO_SETTINGS;
    if (!videoSettings.falApiKey) {
      console.error('fal.ai API key not configured');
      updateSceneShots(activeSceneId, shots =>
        shots.map(s => s.id === shotId ? { ...s, videoError: 'fal.ai API key not configured. Go to Settings tab.' } : s)
      );
      return;
    }

    updateSceneShots(activeSceneId, shots =>
      shots.map(s => s.id === shotId ? { ...s, isVideoGenerating: true, videoError: undefined } : s)
    );

    try {
      const promptToUse = shot.videoPrompt || synthesizeVideoPrompt(shot);

      // Convert WanGenerationSettings to VideoProviderSettings format for the service
      const settings: VideoProviderSettings = {
        ...videoSettings,
        wanResolution: wanSettings.resolution,
        wanDuration: wanSettings.duration,
        wanEnablePromptExpansion: wanSettings.enablePromptExpansion,
        wanMultiShots: wanSettings.multiShots,
        wanEnableSafetyChecker: wanSettings.enableSafetyChecker,
        wanNegativePrompt: wanSettings.negativePrompt,
        wanSeed: wanSettings.seed,
        wanAudioUrl: wanSettings.audioUrl
      };

      // Determine source image: extract last frame from selected segment, or use storyboard image
      let sourceImage = shot.imageUrl;
      if (sourceVideoUrl) {
        try {
          console.log('Extracting last frame from selected segment for Wan generation...');
          sourceImage = await extractLastFrameFromVideo(sourceVideoUrl);
          console.log('Last frame extracted successfully from selected segment');
        } catch (frameErr) {
          console.warn('Could not extract last frame from segment, using storyboard image instead:', frameErr);
        }
      }

      const videoUrl = await generateWanVideo(sourceImage, promptToUse, settings);

      const newSegment: VideoSegment = {
        id: crypto.randomUUID(),
        url: videoUrl,
        timestamp: Date.now(),
        model: 'quality',
        isExtension: false
      };

      const existingSegments = shot.videoSegments || [];

      updateSceneShots(activeSceneId, shots =>
        shots.map(s => s.id === shotId ? {
          ...s,
          isVideoGenerating: false,
          videoUrl,
          videoSegments: [...existingSegments, newSegment],
          videoError: undefined
        } : s)
      );
    } catch (e: any) {
      console.error('Wan video generation failed:', e);
      const errorMessage = e.message || 'Wan video generation failed';
      updateSceneShots(activeSceneId, shots =>
        shots.map(s => s.id === shotId ? { ...s, isVideoGenerating: false, videoError: errorMessage } : s)
      );
    }
  };

  // Helper: Extract last frame from a video as a data URL
  const extractLastFrameFromVideo = (videoSrc: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.preload = 'auto';
      video.muted = true;

      video.onloadedmetadata = () => {
        // Seek to near the end (last 0.1 seconds)
        video.currentTime = Math.max(0, video.duration - 0.1);
      };

      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 1280;
          canvas.height = video.videoHeight || 720;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/png');
          if (!dataUrl || dataUrl === 'data:,') {
            reject(new Error('Failed to capture last frame'));
            return;
          }
          resolve(dataUrl);
        } catch (e) {
          reject(e);
        } finally {
          video.src = '';
          video.load();
        }
      };

      video.onerror = () => {
        reject(new Error('Failed to load video for frame extraction'));
      };

      video.src = videoSrc;
    });
  };

  // Helper: Convert base64 data URL to a File object
  const base64ToFile = (base64: string, filename: string): File => {
    const parts = base64.split(',');
    const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
    const bstr = atob(parts[1]);
    const u8arr = new Uint8Array(bstr.length);
    for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
    return new File([u8arr], filename, { type: mime });
  };

  // --- Seedance Video Generation ---
  // Routes to PiAPI Seedance 2 (omni_reference mode) when the user has selected
  // one or more reference videos. Otherwise falls through to the existing
  // fal.ai Seedance flow (image-to-video / text-to-video / image-only refs).
  const handleGenerateSeedanceVideo = async (shotId: string, seedSettings: SeedanceGenerationSettings) => {
    if (!activeSceneId) return;
    const shot = currentShots.find(s => s.id === shotId);
    if (!shot) return;

    const videoSettings = project.videoSettings || DEFAULT_VIDEO_SETTINGS;
    const hasVideoRefs = !!(seedSettings.referenceVideoUrls && seedSettings.referenceVideoUrls.length > 0);

    // ────────────────────────────────────────────────────────────────────
    // Branch 1: PiAPI Seedance 2 omni_reference (video references present)
    // ────────────────────────────────────────────────────────────────────
    if (hasVideoRefs) {
      if (!videoSettings.piapiApiKey) {
        console.error('PiAPI key not configured');
        updateSceneShots(activeSceneId, shots =>
          shots.map(s => s.id === shotId ? { ...s, videoError: 'PiAPI key not configured. Video references require PiAPI — add one in Settings.' } : s)
        );
        return;
      }

      updateSceneShots(activeSceneId, shots =>
        shots.map(s => s.id === shotId ? { ...s, isVideoGenerating: true, videoError: undefined } : s)
      );

      try {
        const promptToUse = shot.videoPrompt || synthesizeVideoPrompt(shot);
        const piapiKey = videoSettings.piapiApiKey;
        const isFastModel = seedSettings.model.startsWith('fast/');
        const taskType = isFastModel ? 'seedance-2-fast' : 'seedance-2';

        // Gather every image reference the UI has collected + the storyboard
        // image itself (if the user has one) — they all get uploaded to PiAPI
        // ephemeral storage (https URLs pass through unchanged).
        const rawImageRefs: string[] = [];
        if (shot.imageUrl) rawImageRefs.push(shot.imageUrl);
        if (seedSettings.referenceImageUrl) rawImageRefs.push(seedSettings.referenceImageUrl);
        if (seedSettings.referenceImages?.length) rawImageRefs.push(...seedSettings.referenceImages);
        if (seedSettings.referenceImageUrls?.length) rawImageRefs.push(...seedSettings.referenceImageUrls);
        const uniqueImageRefs = Array.from(new Set(rawImageRefs.filter(Boolean)));

        console.log(`[PiAPI] Uploading ${uniqueImageRefs.length} image ref(s) + ${seedSettings.referenceVideoUrls!.length} video ref(s)...`);
        const [imageUrls, videoUrls] = await Promise.all([
          uploadRefsToPiAPI(uniqueImageRefs, piapiKey, `${shot.id}_img`),
          uploadRefsToPiAPI(seedSettings.referenceVideoUrls, piapiKey, `${shot.id}_vid`),
        ]);

        // PiAPI omni_reference cap: 12 total references. If we overshoot (lots
        // of shots in the project), drop extras — keep the video ref first.
        const MAX_REFS = 12;
        let finalImageUrls = imageUrls;
        const finalVideoUrls = videoUrls.slice(0, 1); // API currently accepts 1 video
        const totalRefs = finalImageUrls.length + finalVideoUrls.length;
        if (totalRefs > MAX_REFS) {
          const keep = MAX_REFS - finalVideoUrls.length;
          finalImageUrls = finalImageUrls.slice(0, Math.max(0, keep));
          console.warn(`[PiAPI] Trimmed refs to ${MAX_REFS} total (kept ${finalImageUrls.length} images + ${finalVideoUrls.length} video).`);
        }

        // Map Seedance settings → PiAPI settings.
        const mappedAspect: Exclude<PiAPISeedanceAspectRatio, 'auto'> | undefined =
          seedSettings.aspectRatio && seedSettings.aspectRatio !== 'auto'
            ? (seedSettings.aspectRatio as Exclude<PiAPISeedanceAspectRatio, 'auto'>)
            : '16:9';
        const mappedResolution: PiAPISeedanceResolution | undefined =
          seedSettings.resolution === '480p' || seedSettings.resolution === '720p'
            ? seedSettings.resolution
            : '720p';
        const mappedDuration =
          seedSettings.duration === 'auto' || !seedSettings.duration
            ? 5
            : parseInt(seedSettings.duration, 10);

        const videoUrl = await generatePiAPISeedance2Omni(
          {
            taskType,
            prompt: promptToUse,
            duration: mappedDuration,
            aspectRatio: mappedAspect,
            resolution: mappedResolution,
            imageUrls: finalImageUrls,
            videoUrls: finalVideoUrls,
          },
          piapiKey
        );

        const newSegment: VideoSegment = {
          id: crypto.randomUUID(),
          url: videoUrl,
          timestamp: Date.now(),
          model: isFastModel ? 'fast' : 'quality',
          isExtension: false,
        };
        const existingSegments = shot.videoSegments || [];
        updateSceneShots(activeSceneId, shots =>
          shots.map(s => s.id === shotId ? {
            ...s,
            isVideoGenerating: false,
            videoUrl,
            videoSegments: [...existingSegments, newSegment],
            videoError: undefined,
          } : s)
        );
        return;
      } catch (e: any) {
        console.error('PiAPI Seedance generation failed:', e);
        const errorMessage = e.message || 'PiAPI Seedance generation failed';
        updateSceneShots(activeSceneId, shots =>
          shots.map(s => s.id === shotId ? { ...s, isVideoGenerating: false, videoError: errorMessage } : s)
        );
        return;
      }
    }

    // ────────────────────────────────────────────────────────────────────
    // Branch 2: fal.ai Seedance 2.0 (no video references)
    // ────────────────────────────────────────────────────────────────────
    if (!videoSettings.falApiKey) {
      console.error('fal.ai API key not configured');
      updateSceneShots(activeSceneId, shots =>
        shots.map(s => s.id === shotId ? { ...s, videoError: 'fal.ai API key not configured. Go to Settings tab.' } : s)
      );
      return;
    }

    updateSceneShots(activeSceneId, shots =>
      shots.map(s => s.id === shotId ? { ...s, isVideoGenerating: true, videoError: undefined } : s)
    );

    try {
      const promptToUse = shot.videoPrompt || synthesizeVideoPrompt(shot);

      // Prepare image URL for image-to-video or reference-to-video models
      let imageUrl: string | undefined = undefined;
      if (shot.imageUrl) {
        if (shot.imageUrl.startsWith('data:')) {
          try {
            console.log('Uploading storyboard image to fal.ai storage for Seedance...');
            imageUrl = await uploadImageToFalStorage(shot.imageUrl, videoSettings.falApiKey!);
            console.log('Storyboard image uploaded to fal.ai storage:', imageUrl);
          } catch (uploadErr) {
            console.warn('Could not upload storyboard image, trying direct data URI:', uploadErr);
            imageUrl = shot.imageUrl;
          }
        } else {
          imageUrl = shot.imageUrl;
        }
      }

      const videoUrl = await generateSeedanceVideo(
        promptToUse,
        imageUrl,
        videoSettings.falApiKey!,
        seedSettings
      );

      const isFastModel = seedSettings.model.startsWith('fast/');
      const newSegment: VideoSegment = {
        id: crypto.randomUUID(),
        url: videoUrl,
        timestamp: Date.now(),
        model: isFastModel ? 'fast' : 'quality',
        isExtension: false
      };

      const existingSegments = shot.videoSegments || [];

      updateSceneShots(activeSceneId, shots =>
        shots.map(s => s.id === shotId ? {
          ...s,
          isVideoGenerating: false,
          videoUrl,
          videoSegments: [...existingSegments, newSegment],
          videoError: undefined
        } : s)
      );
    } catch (e: any) {
      console.error('Seedance video generation failed:', e);
      const errorMessage = e.message || 'Seedance video generation failed';
      updateSceneShots(activeSceneId, shots =>
        shots.map(s => s.id === shotId ? { ...s, isVideoGenerating: false, videoError: errorMessage } : s)
      );
    }
  };

  // --- Seedance 2.0 Extend Video (regenerate with last frame as source) ---
  const handleExtendSeedanceVideo = async (shotId: string, seedSettings: SeedanceGenerationSettings) => {
    if (!activeSceneId) return;
    const shot = currentShots.find(s => s.id === shotId);
    if (!shot || !shot.videoUrl) return;

    const videoSettings = project.videoSettings || DEFAULT_VIDEO_SETTINGS;
    if (!videoSettings.falApiKey) {
      console.error('fal.ai API key not configured');
      return;
    }

    updateSceneShots(activeSceneId, shots =>
      shots.map(s => s.id === shotId ? { ...s, isExtending: true, videoError: undefined } : s)
    );

    try {
      const promptToUse = shot.videoPrompt || synthesizeVideoPrompt(shot);

      // Extract last frame from existing video to use as source for extension
      let imageUrl: string | undefined = undefined;
      try {
        console.log('Extracting last frame from existing video for Seedance extension...');
        const lastFrame = await extractLastFrameFromVideo(shot.videoUrl);
        imageUrl = await uploadImageToFalStorage(lastFrame, videoSettings.falApiKey!);
        console.log('Last frame uploaded for extension:', imageUrl);
      } catch (frameErr) {
        console.warn('Could not extract last frame, using storyboard image:', frameErr);
        if (shot.imageUrl) {
          imageUrl = shot.imageUrl.startsWith('data:')
            ? await uploadImageToFalStorage(shot.imageUrl, videoSettings.falApiKey!)
            : shot.imageUrl;
        }
      }

      // Force image-to-video model for extensions (needs the last frame)
      const extendSettings: SeedanceGenerationSettings = {
        ...seedSettings,
        model: 'image-to-video',
      };

      const videoUrl = await generateSeedanceVideo(
        promptToUse,
        imageUrl,
        videoSettings.falApiKey!,
        extendSettings
      );

      const isFastModel = seedSettings.model.startsWith('fast/');
      const newSegment: VideoSegment = {
        id: crypto.randomUUID(),
        url: videoUrl,
        timestamp: Date.now(),
        model: isFastModel ? 'fast' : 'quality',
        isExtension: true
      };

      const existingSegments = shot.videoSegments || [];

      updateSceneShots(activeSceneId, shots =>
        shots.map(s => s.id === shotId ? {
          ...s,
          isExtending: false,
          videoUrl,
          videoSegments: [...existingSegments, newSegment],
          videoError: undefined
        } : s)
      );
    } catch (e: any) {
      console.error('Seedance video extension failed:', e);
      const errorMessage = e.message || 'Seedance video extension failed';
      updateSceneShots(activeSceneId, shots =>
        shots.map(s => s.id === shotId ? { ...s, isExtending: false, videoError: errorMessage } : s)
      );
    }
  };

  // --- Aurora Video Generation ---
  const handleGenerateAuroraVideo = async (shotId: string, auroraSettings: AuroraGenerationSettings) => {
    if (!activeSceneId) return;
    const shot = currentShots.find(s => s.id === shotId);
    if (!shot || !shot.imageUrl) return;

    const videoSettings = project.videoSettings || DEFAULT_VIDEO_SETTINGS;
    if (!videoSettings.falApiKey) {
      console.error('fal.ai API key not configured');
      updateSceneShots(activeSceneId, shots =>
        shots.map(s => s.id === shotId ? { ...s, videoError: 'fal.ai API key not configured. Go to Settings tab.' } : s)
      );
      return;
    }

    updateSceneShots(activeSceneId, shots =>
      shots.map(s => s.id === shotId ? { ...s, isVideoGenerating: true, videoError: undefined } : s)
    );

    try {
      // If there's already a rendered video, grab the last frame and use it as the source image
      let sourceImage = shot.imageUrl;
      if (shot.videoUrl) {
        try {
          console.log('Extracting last frame from existing video for Lip Sync...');
          sourceImage = await extractLastFrameFromVideo(shot.videoUrl);
          console.log('Last frame extracted successfully');
        } catch (frameErr) {
          console.warn('Could not extract last frame from video, using storyboard image instead:', frameErr);
          // Fall back to the storyboard image
        }
      }

      const videoUrl = await generateAuroraVideo(
        sourceImage,
        auroraSettings,
        videoSettings.falApiKey
      );

      const newSegment: VideoSegment = {
        id: crypto.randomUUID(),
        url: videoUrl,
        timestamp: Date.now(),
        model: 'quality',
        isExtension: false
      };

      const existingSegments = shot.videoSegments || [];

      updateSceneShots(activeSceneId, shots =>
        shots.map(s => s.id === shotId ? {
          ...s,
          isVideoGenerating: false,
          videoUrl,
          videoSegments: [...existingSegments, newSegment],
          videoError: undefined
        } : s)
      );
    } catch (e: any) {
      console.error('Aurora video generation failed:', e);
      const errorMessage = e.message || 'Aurora video generation failed';
      updateSceneShots(activeSceneId, shots =>
        shots.map(s => s.id === shotId ? { ...s, isVideoGenerating: false, videoError: errorMessage } : s)
      );
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-950 text-neutral-200 animate-fade-in">

      {/* Sidebar - Cinematic Controls (hidden on timeline tab for full-width NLE) */}
      <aside className={`w-80 bg-neutral-900 border-r border-neutral-800 flex flex-col overflow-y-auto custom-scrollbar${activeTab === 'timeline' ? ' hidden' : ''}`}>
        <div className="p-6 border-b border-neutral-800">
          {/* Back Button */}
          <button onClick={onBack} className="flex items-center text-xs text-neutral-500 hover:text-white mb-4 transition-colors">
            <ChevronLeft className="w-4 h-4 mr-1" /> Back to Projects
          </button>
          <input
            className="bg-transparent text-2xl font-serif font-bold text-white tracking-tight w-full outline-none focus:border-b focus:border-red-600 transition-all placeholder-neutral-600"
            value={project.title}
            onChange={(e) => setProject(p => ({ ...p, title: e.target.value }))}
            placeholder="Project Title"
          />
          <p className="text-xs text-neutral-500 mt-1 uppercase tracking-widest">Cinematic Settings</p>

          {/* Backup Status Badge */}
          {backupStatus && (
            <button
              onClick={onSetBackupFile}
              className={`mt-3 w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs transition-colors ${backupStatus.isActive
                ? 'bg-green-900/20 border border-green-900/30 text-green-400 hover:bg-green-900/30'
                : backupStatus.isSupported
                  ? 'bg-yellow-900/20 border border-yellow-800/30 text-yellow-500 hover:bg-yellow-900/30'
                  : 'bg-neutral-800 border border-neutral-700 text-neutral-500'
                }`}
              title={backupStatus.isActive
                ? `Auto-backup active${backupStatus.lastBackupTime ? ` — Last: ${new Date(backupStatus.lastBackupTime).toLocaleTimeString()}` : ''}`
                : 'Click to set a backup file on disk'
              }
            >
              {backupStatus.isActive ? (
                <>
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span>Backup Active</span>
                  {backupStatus.lastBackupTime && (
                    <span className="ml-auto text-green-600">{new Date(backupStatus.lastBackupTime).toLocaleTimeString()}</span>
                  )}
                </>
              ) : backupStatus.isSupported ? (
                <>
                  <span className="w-2 h-2 bg-yellow-500 rounded-full" />
                  <span>Set Backup File</span>
                  <span className="ml-auto text-yellow-700">⚠</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 bg-neutral-600 rounded-full" />
                  <span>Auto-save to localStorage</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Scene Selector - Collapsible */}
        <div className="border-b border-neutral-800">
          <button
            onClick={() => setScenesCollapsed(!scenesCollapsed)}
            className="w-full p-4 flex items-center justify-between hover:bg-neutral-800/30 transition-colors"
          >
            <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-2 cursor-pointer">
              <Layers className="w-3 h-3" /> Scenes
              <span className="text-neutral-600">({project.scenes?.length || 0})</span>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-500">{activeScene?.name}</span>
              {scenesCollapsed ? (
                <ChevronDown className="w-4 h-4 text-neutral-500" />
              ) : (
                <ChevronUp className="w-4 h-4 text-neutral-500" />
              )}
            </div>
          </button>
          {!scenesCollapsed && (
            <div className="px-4 pb-4">
              <div className="flex justify-end mb-2">
                <button
                  onClick={handleAddScene}
                  className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3 h-3" /> Add Scene
                </button>
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
                {project.scenes?.map((scene) => (
                  <div
                    key={scene.id}
                    className={`group flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-all ${activeSceneId === scene.id
                      ? 'bg-red-900/30 border border-red-900/50 text-white'
                      : 'bg-neutral-800/50 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-transparent'
                      }`}
                    onClick={() => setActiveSceneId(scene.id)}
                  >
                    {editingSceneName === scene.id ? (
                      <input
                        autoFocus
                        className="flex-1 bg-transparent text-sm outline-none border-b border-red-600"
                        defaultValue={scene.name}
                        onBlur={(e) => handleRenameScene(scene.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameScene(scene.id, (e.target as HTMLInputElement).value);
                          if (e.key === 'Escape') setEditingSceneName(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <>
                        <span className="flex-1 text-sm truncate">{scene.name}</span>
                        <span className="text-xs text-neutral-600">{scene.shots?.length || 0} shots</span>
                      </>
                    )}
                    <div className="hidden group-hover:flex items-center gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingSceneName(scene.id); }}
                        className="p-1 hover:text-white transition-colors"
                      >
                        <Edit3 className="w-3 h-3" />
                      </button>
                      {(project.scenes?.length || 0) > 1 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteScene(scene.id); }}
                          className="p-1 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-6 flex flex-col gap-8">
          <div className="space-y-3">
            <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-2">
              <Users className="w-3 h-3" /> Director of Photography
            </label>
            <select
              className="w-full bg-neutral-800 border border-neutral-700 rounded-md p-2 text-sm text-white focus:ring-1 focus:ring-red-500 outline-none"
              value={project.settings.cinematographer}
              onChange={(e) => handleSettingChange('cinematographer', e.target.value)}
            >
              {CINEMATOGRAPHERS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="space-y-3">
            <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-2">
              <Film className="w-3 h-3" /> Film Stock
            </label>
            <select
              className="w-full bg-neutral-800 border border-neutral-700 rounded-md p-2 text-sm text-white focus:ring-1 focus:ring-red-500 outline-none"
              value={project.settings.filmStock}
              onChange={(e) => handleSettingChange('filmStock', e.target.value)}
            >
              {FILM_STOCKS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="space-y-3">
            <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-2">
              <Settings className="w-3 h-3" /> Glass / Lenses
            </label>
            <select
              className="w-full bg-neutral-800 border border-neutral-700 rounded-md p-2 text-sm text-white focus:ring-1 focus:ring-red-500 outline-none"
              value={project.settings.lens}
              onChange={(e) => handleSettingChange('lens', e.target.value)}
            >
              {LENSES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="space-y-3">
            <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-2">
              <Settings className="w-3 h-3" /> Lighting Key
            </label>
            <select
              className="w-full bg-neutral-800 border border-neutral-700 rounded-md p-2 text-sm text-white focus:ring-1 focus:ring-red-500 outline-none"
              value={project.settings.lighting}
              onChange={(e) => handleSettingChange('lighting', e.target.value)}
            >
              {LIGHTING_STYLES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="space-y-3">
            <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-2">
              <MonitorPlay className="w-3 h-3" /> Resolution
            </label>
            <select
              className="w-full bg-neutral-800 border border-neutral-700 rounded-md p-2 text-sm text-white focus:ring-1 focus:ring-red-500 outline-none"
              value={project.settings.resolution || 'basic'}
              onChange={(e) => handleSettingChange('resolution', e.target.value)}
            >
              {RESOLUTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <p className="text-xs text-neutral-600">
              {RESOLUTIONS.find(r => r.value === (project.settings.resolution || 'basic'))?.description} — Applies to storyboard images &amp; video output
            </p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full relative">
        <header className="h-16 border-b border-neutral-800 flex items-center px-8 justify-between bg-neutral-900/50 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-1">
            <button onClick={() => setActiveTab('script')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'script' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'}`}>Script</button>
            <ChevronRight className="w-4 h-4 text-neutral-600" />
            <button onClick={() => setActiveTab('characters')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'characters' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'}`}>Characters</button>
            <button onClick={() => setActiveTab('locations')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'locations' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'}`}>Locations</button>
            <ChevronRight className="w-4 h-4 text-neutral-600" />
            <button onClick={() => setActiveTab('board')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'board' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'}`}>Storyboard</button>
            <ChevronRight className="w-4 h-4 text-neutral-600" />
            <button onClick={() => setActiveTab('video')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${activeTab === 'video' ? 'bg-red-900/20 text-red-500 border border-red-900/30' : 'text-neutral-400 hover:text-white'}`}>
              <Video className="w-3 h-3" /> Video
            </button>
            <ChevronRight className="w-4 h-4 text-neutral-600" />
            <button onClick={() => setActiveTab('motion')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${activeTab === 'motion' ? 'bg-purple-900/20 text-purple-400 border border-purple-900/30' : 'text-neutral-400 hover:text-white'}`}>
              <Clapperboard className="w-3 h-3" /> Motion
            </button>
            <ChevronRight className="w-4 h-4 text-neutral-600" />
            <button onClick={() => setActiveTab('settings')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${activeTab === 'settings' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'}`}>
              <Settings className="w-3 h-3" /> Settings
            </button>
            {/* Timeline tab hidden — feature not ready yet
            <ChevronRight className="w-4 h-4 text-neutral-600" />
            <button onClick={() => setActiveTab('timeline')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${activeTab === 'timeline' ? 'bg-blue-900/20 text-blue-400 border border-blue-900/30' : 'text-neutral-400 hover:text-white'}`}>
              <Clock className="w-3 h-3" /> Timeline
            </button>
            */}
          </div>
          <div className="flex items-center gap-4">
            {/* SLOPBOT AI Agent Button */}
            <button
              onClick={() => setAgentOpen(v => !v)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${agentOpen
                ? 'bg-red-600 text-white border-red-500 shadow-lg shadow-red-900/40'
                : 'bg-neutral-800 text-neutral-300 border-neutral-700 hover:border-red-600 hover:text-white'
                }`}
              title="Open SLOPBOT AI Agent"
            >
              <Bot size={14} />
              <span>SLOPBOT</span>
              <div className={`w-1.5 h-1.5 rounded-full ${agentOpen ? 'bg-green-400' : 'bg-neutral-600'}`} />
            </button>
            {activeTab === 'board' && (
              <>
                <Button size="sm" variant="secondary" onClick={handleAddShot}>
                  <Plus className="w-4 h-4 mr-2" /> Add Shot
                </Button>
                <Button size="sm" variant="secondary" onClick={handleGenerateCoverage} isLoading={isGeneratingCoverage} disabled={project.characters.length === 0}>
                  <Focus className="w-4 h-4 mr-2" /> Coverage
                </Button>
                <Button variant="danger" size="sm" onClick={handleGenerateAll} disabled={currentShots.length === 0}>
                  Render All Frames
                </Button>
              </>
            )}
          </div>
        </header>

        <div className={activeTab === 'timeline' ? 'flex-1 flex flex-col min-h-0 overflow-hidden' : 'flex-1 overflow-y-auto p-8 custom-scrollbar'}>
          {activeTab === 'timeline' && (
            <TimelineEditor
              project={project}
              onUpdateProject={(updated) => setProject(updated)}
            />
          )}
          {activeTab === 'script' && (
            <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
              {/* PDF Upload Section */}
              <div className="bg-neutral-900 p-6 rounded-lg border border-neutral-800 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-serif text-white flex items-center gap-2">
                    <FileText className="w-5 h-5 text-red-600" />
                    Upload Screenplay PDF
                  </h3>
                  {pdfFileName && (
                    <span className="text-xs text-green-500 bg-green-900/20 px-2 py-1 rounded">
                      ✓ {pdfFileName}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex-1 cursor-pointer">
                    <div className={`border-2 border-dashed rounded-lg p-6 text-center transition-all ${isUploadingPDF ? 'border-red-600 bg-red-900/10' : 'border-neutral-700 hover:border-neutral-500 hover:bg-neutral-800/50'}`}>
                      {isUploadingPDF ? (
                        <div className="flex items-center justify-center gap-2 text-red-400">
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>Extracting text from PDF...</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-neutral-400">
                          <Upload className="w-8 h-8" />
                          <span className="text-sm">Click to upload or drag & drop</span>
                          <span className="text-xs text-neutral-600">PDF screenplay files only</span>
                        </div>
                      )}
                    </div>
                    <input
                      type="file"
                      accept=".pdf"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handlePDFUpload(file);
                      }}
                      disabled={isUploadingPDF}
                    />
                  </label>
                </div>
                {/* Standard Screenplay Format Checkbox */}
                <div className="mt-4 flex items-center gap-3">
                  <button
                    onClick={() => setIsStandardScreenplayFormat(!isStandardScreenplayFormat)}
                    className="flex items-center gap-2 text-sm text-neutral-300 hover:text-white transition-colors"
                  >
                    {isStandardScreenplayFormat ? (
                      <CheckSquare className="w-5 h-5 text-red-500" />
                    ) : (
                      <Square className="w-5 h-5 text-neutral-500" />
                    )}
                    Standard Screenplay Format
                  </button>
                  <span className="text-xs text-neutral-600">
                    (INT./EXT. headers, character names in CAPS)
                  </span>
                </div>
              </div>

              {/* Script Text Area */}
              <div className="bg-neutral-900 p-8 rounded-lg border border-neutral-800 shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-serif text-white">Script Input</h2>
                  <div className="flex items-center gap-3">
                    {analyzedRanges.length > 0 && (
                      <span className="text-xs text-green-500 bg-green-900/20 px-2 py-1 rounded flex items-center gap-1">
                        <CheckSquare className="w-3 h-3" />
                        {analyzedRanges.length} section{analyzedRanges.length > 1 ? 's' : ''} analyzed
                      </span>
                    )}
                    <div className="text-xs text-neutral-500 bg-neutral-800 px-2 py-1 rounded">Format: Screenplay or Prose</div>
                  </div>
                </div>

                {/* Selection Indicator */}
                {selectedText && (
                  <div className="mb-4 p-3 bg-red-900/20 border border-red-900/30 rounded-md">
                    <p className="text-xs text-red-400 flex items-center gap-2">
                      <span className="font-bold">Selected:</span>
                      {selectedText.length} characters selected
                      <span className="text-neutral-500">— Click "Analyze Scene" to analyze only this selection</span>
                    </p>
                  </div>
                )}

                {/* Script Editor with Highlighting */}
                <div className="relative w-full h-96">
                  {/* Highlighted Background Layer - shows analyzed text in green */}
                  {analyzedRanges.length > 0 && (
                    <div
                      ref={highlightOverlayRef}
                      className="absolute inset-0 bg-black border border-neutral-800 rounded-md p-6 font-mono text-sm leading-relaxed overflow-auto pointer-events-none whitespace-pre-wrap break-words"
                      aria-hidden="true"
                    >
                      {(() => {
                        // Sort ranges by start position
                        const sortedRanges = [...analyzedRanges].sort((a, b) => a.start - b.start);
                        const content = project.scriptContent;
                        const elements: React.ReactNode[] = [];
                        let lastEnd = 0;

                        sortedRanges.forEach((range, idx) => {
                          // Add text before this range (invisible, just for spacing)
                          if (range.start > lastEnd) {
                            elements.push(
                              <span key={`before-${idx}`} className="text-transparent">
                                {content.substring(lastEnd, range.start)}
                              </span>
                            );
                          }
                          // Add the highlighted range
                          elements.push(
                            <span key={`range-${idx}`} className="text-green-400 bg-green-900/30 rounded">
                              {content.substring(range.start, range.end)}
                            </span>
                          );
                          lastEnd = range.end;
                        });

                        // Add remaining text (invisible)
                        if (lastEnd < content.length) {
                          elements.push(
                            <span key="after" className="text-transparent">
                              {content.substring(lastEnd)}
                            </span>
                          );
                        }

                        return elements;
                      })()}
                    </div>
                  )}

                  {/* Actual Textarea - sits on top */}
                  <textarea
                    ref={scriptTextareaRef}
                    className={`absolute inset-0 w-full h-full border border-neutral-800 rounded-md p-6 font-mono text-sm leading-relaxed focus:ring-1 focus:ring-red-900 outline-none resize-none ${analyzedRanges.length > 0 ? 'bg-transparent text-neutral-300 caret-white' : 'bg-black text-neutral-300'
                      }`}
                    placeholder="EXT. DESERT HIGHWAY - DAY...

TIP: Select (highlight) a portion of text and click 'Analyze Scene' to analyze only that section."
                    value={project.scriptContent}
                    onChange={(e) => {
                      setProject(p => ({ ...p, scriptContent: e.target.value }));
                      // Reset analyzed ranges when content changes significantly
                      setAnalyzedRanges([]);
                    }}
                    onScroll={handleScriptScroll}
                    onSelect={(e) => {
                      const textarea = e.target as HTMLTextAreaElement;
                      const start = textarea.selectionStart;
                      const end = textarea.selectionEnd;
                      if (start !== end) {
                        setSelectedText(project.scriptContent.substring(start, end));
                      } else {
                        setSelectedText('');
                      }
                    }}
                    onBlur={() => {
                      // Keep selection visible for a moment after blur
                      setTimeout(() => {
                        if (!scriptTextareaRef.current ||
                          scriptTextareaRef.current.selectionStart === scriptTextareaRef.current.selectionEnd) {
                          setSelectedText('');
                        }
                      }, 100);
                    }}
                  />
                </div>

                {/* Analyzed Ranges Summary */}
                {analyzedRanges.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {analyzedRanges.map((range, idx) => (
                      <span key={idx} className="text-xs bg-green-900/30 text-green-400 px-2 py-1 rounded flex items-center gap-1">
                        ✓ Chars {range.start}-{range.end}
                      </span>
                    ))}
                    <button
                      onClick={() => setAnalyzedRanges([])}
                      className="text-xs text-neutral-500 hover:text-red-400 px-2 py-1 transition-colors"
                    >
                      Clear markers
                    </button>
                  </div>
                )}

                <div className="mt-6 flex items-center justify-between">
                  {/* Info about what each button does */}
                  <div className="text-xs text-neutral-500 max-w-md">
                    <span className="text-neutral-400">Analyze Scene:</span> {selectedText ? <span className="text-red-400">Analyzes SELECTED text only!</span> : 'Analyzes current scene.'}
                    <br />
                    <span className="text-red-400">Full Screenplay:</span> Creates multiple scenes from entire screenplay.
                  </div>
                  <div className="flex gap-3">
                    <Button onClick={handleScriptBreakdown} isLoading={isBreakingDown && !isStandardScreenplayFormat} size="lg" variant="secondary">
                      <Clapperboard className="w-4 h-4 mr-2" />
                      {selectedText ? 'Analyze Selection' : 'Analyze Scene'}
                    </Button>
                    <Button onClick={handleFullScreenplayAnalysis} isLoading={isBreakingDown} size="lg">
                      <Layers className="w-4 h-4 mr-2" />
                      Full Screenplay Analysis
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'characters' && (
            <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-serif text-white flex items-center gap-2"><Users className="w-5 h-5 text-red-600" /> Character Sheet</h2>
                <Button size="sm" variant="secondary" onClick={() => addAsset('Character')}><Plus className="w-4 h-4 mr-2" /> Add Character</Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {project.characters.length === 0 && (
                  <div className="col-span-2 p-12 border border-dashed border-neutral-800 rounded-lg text-center text-neutral-500">No characters defined.</div>
                )}
                {project.characters.map(char => (
                  <AssetCard
                    key={char.id}
                    item={char}
                    type="Character"
                    onGenerate={(id) => handleGenerateAsset(id, 'Character')}
                    onEdit={(id, p) => handleEditAsset(id, p, 'Character')}
                    onUpload={(id, f) => handleUploadAsset(id, f, 'Character')}
                    onDelete={(id) => handleDeleteAsset(id, 'Character')}
                    onUpdate={(id, u) => handleUpdateAsset(id, u, 'Character')}
                    onUpdateWithDetails={(id) => handleUpdateAssetWithDetails(id, 'Character')}
                    onResetToOriginal={(id) => handleResetAssetToOriginal(id, 'Character')}
                    onGenerateTurnaround={(id) => handleGenerateAssetTurnaround(id, 'Character')}
                    onToggleTurnaroundRef={(assetId, tId) => handleToggleTurnaroundRef(assetId, tId, 'Character')}
                  />
                ))}
              </div>
            </div>
          )}

          {activeTab === 'locations' && (
            <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-serif text-white flex items-center gap-2"><MapPin className="w-5 h-5 text-red-600" /> Location Scout</h2>
                <Button size="sm" variant="secondary" onClick={() => addAsset('Location')}><Plus className="w-4 h-4 mr-2" /> Add Location</Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {project.locations.length === 0 && (
                  <div className="col-span-2 p-12 border border-dashed border-neutral-800 rounded-lg text-center text-neutral-500">No locations defined.</div>
                )}
                {project.locations.map(loc => (
                  <AssetCard
                    key={loc.id}
                    item={loc}
                    type="Location"
                    onGenerate={(id) => handleGenerateAsset(id, 'Location')}
                    onEdit={(id, p) => handleEditAsset(id, p, 'Location')}
                    onUpload={(id, f) => handleUploadAsset(id, f, 'Location')}
                    onDelete={(id) => handleDeleteAsset(id, 'Location')}
                    onUpdate={(id, u) => handleUpdateAsset(id, u, 'Location')}
                    onUpdateWithDetails={(id) => handleUpdateAssetWithDetails(id, 'Location')}
                    onResetToOriginal={(id) => handleResetAssetToOriginal(id, 'Location')}
                    onGenerateTurnaround={(id) => handleGenerateAssetTurnaround(id, 'Location')}
                    onToggleTurnaroundRef={(assetId, tId) => handleToggleTurnaroundRef(assetId, tId, 'Location')}
                  />
                ))}
              </div>
            </div>
          )}

          {activeTab === 'board' && (
            <div className="animate-fade-in">
              {currentShots.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-96 text-neutral-500">
                  <LayoutGrid className="w-16 h-16 mb-4 opacity-20" />
                  <p className="text-lg">No shots in {activeScene?.name || 'this scene'}.</p>
                  <Button size="md" variant="secondary" onClick={handleAddShot}>
                    <Plus className="w-4 h-4 mr-2" /> Create First Shot
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-2 gap-8 pb-20">
                  {currentShots.map(shot => (
                    <ShotCard
                      key={shot.id}
                      shot={shot}
                      sceneName={activeScene?.name}
                      allCharacters={project.characters}
                      allLocations={project.locations}
                      allShots={currentShots}
                      aspectRatio={project.settings.aspectRatio}
                      onAspectRatioChange={(ratio) => handleSettingChange('aspectRatio', ratio)}
                      onGenerate={handleGenerateShot}
                      onAlter={handleAlterShot}
                      onEditImage={handleEditShotImage}
                      onUpdate={updateShot}
                      onDelete={handleDeleteShot}
                      onUpload={handleUploadShotImage}
                      onExpand={setExpandedShotId}
                      onDuplicate={handleDuplicateShot}
                      onUpscale={handleUpscaleShot}
                      onCoverageFromImage={handleGenerateCoverageFromImage}
                      onRestoreFromHistory={handleRestoreFromHistory}
                      onChatEdit={handleChatEdit}
                      isCoverageGenerating={coverageSourceShotId === shot.id}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'video' && (() => {
            // Flatten every generated video in the project into a picker-friendly
            // list so shots can reference videos from other shots as Seedance
            // reference-to-video inputs (`video_urls`).
            const allProjectVideos: ProjectVideoRef[] = [];
            (project.scenes || []).forEach(scene => {
              (scene.shots || []).forEach(s => {
                const segs = s.videoSegments || [];
                if (segs.length > 0) {
                  segs.forEach((seg, i) => {
                    if (!seg.url) return;
                    allProjectVideos.push({
                      key: `${s.id}:${seg.id}`,
                      url: seg.url,
                      label: `Shot ${s.number}`,
                      sceneName: scene.name,
                      sublabel: seg.isExtension
                        ? `Extension ${i} · ${seg.model}`
                        : `Segment ${i + 1} · ${seg.model}`,
                    });
                  });
                } else if (s.videoUrl) {
                  // Legacy shots without a segments array
                  allProjectVideos.push({
                    key: `${s.id}:main`,
                    url: s.videoUrl,
                    label: `Shot ${s.number}`,
                    sceneName: scene.name,
                  });
                }
              });
            });
            // Also include legacy top-level shots if present
            (project.shots || []).forEach(s => {
              const segs = s.videoSegments || [];
              if (segs.length > 0) {
                segs.forEach((seg, i) => {
                  if (!seg.url) return;
                  allProjectVideos.push({
                    key: `${s.id}:${seg.id}`,
                    url: seg.url,
                    label: `Shot ${s.number}`,
                    sublabel: seg.isExtension
                      ? `Extension ${i} · ${seg.model}`
                      : `Segment ${i + 1} · ${seg.model}`,
                  });
                });
              } else if (s.videoUrl) {
                allProjectVideos.push({
                  key: `${s.id}:main`,
                  url: s.videoUrl,
                  label: `Shot ${s.number}`,
                });
              }
            });

            return (
              <div className="animate-fade-in space-y-8 pb-20">
                <div className="flex flex-col gap-12">
                  {currentShots.map(shot => (
                    <VideoShotCard
                      key={shot.id}
                      shot={shot}
                      projectTitle={project.title}
                      sceneName={activeScene?.name}
                      videoModelLabel={`Veo ${shot.videoModel === 'quality' ? 'Quality' : 'Fast'} Model`}
                      projectVideoSettings={project.videoSettings}
                      onUpdatePrompt={handleUpdateVideoPrompt}
                      onGenerate={handleGenerateVideo}
                      onGenerateWan={handleGenerateWanVideo}
                      onGenerateAurora={handleGenerateAuroraVideo}
                      onGenerateSeedance={handleGenerateSeedanceVideo}
                      onExtendSeedance={handleExtendSeedanceVideo}
                      onExtend={handleExtendVideo}
                      onDownload={handleDownloadVideo}
                      onCaptureFrame={handleCaptureFrame}
                      onDeleteSegment={handleDeleteVideoSegment}
                      synthesizePrompt={synthesizeVideoPrompt}
                      projectVideos={allProjectVideos}
                    />
                  ))}
                </div>
              </div>
            );
          })()}

          {activeTab === 'motion' && (
            <MotionControl project={project} />
          )}

          {activeTab === 'settings' && (
            <div className="max-w-3xl mx-auto space-y-8 animate-fade-in pb-20">
              <h2 className="text-2xl font-serif text-white flex items-center gap-2">
                <Settings className="w-5 h-5 text-red-600" /> Project Settings
              </h2>

              {/* API Keys Section - Always Visible */}
              <div className="bg-neutral-900 p-6 rounded-lg border border-neutral-800 shadow-xl space-y-6">
                <h3 className="text-lg font-serif text-white flex items-center gap-2">
                  🔑 API Keys
                </h3>

                {/* fal.ai API Key */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest">
                    fal.ai API Key <span className="text-neutral-600">(Wan v2.6 + Seedance 2.0 + Lip Sync)</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      className={`flex-1 bg-neutral-800 border rounded-md p-3 text-sm text-white focus:ring-1 focus:ring-red-500 outline-none ${falKeyStatus === 'valid' ? 'border-green-600' : falKeyStatus === 'invalid' ? 'border-red-600' : 'border-neutral-700'
                        }`}
                      placeholder="Enter your fal.ai API key..."
                      value={project.videoSettings?.falApiKey || ''}
                      onChange={(e) => {
                        setFalKeyStatus('idle');
                        setFalKeyError(null);
                        setProject(p => ({
                          ...p,
                          videoSettings: { ...(p.videoSettings || DEFAULT_VIDEO_SETTINGS), falApiKey: e.target.value }
                        }));
                      }}
                    />
                    <Button
                      variant={falKeyStatus === 'valid' ? 'secondary' : 'primary'}
                      onClick={async () => {
                        const key = project.videoSettings?.falApiKey;
                        if (!key) return;
                        setFalKeyValidating(true);
                        setFalKeyStatus('idle');
                        setFalKeyError(null);
                        try {
                          const result = await validateFalApiKey(key);
                          if (result.valid) {
                            setFalKeyStatus('valid');
                            onSave(project);
                          } else {
                            setFalKeyStatus('invalid');
                            setFalKeyError(result.error || 'Invalid API key');
                          }
                        } catch (e: any) {
                          setFalKeyStatus('invalid');
                          setFalKeyError(e.message || 'Validation failed');
                        } finally {
                          setFalKeyValidating(false);
                        }
                      }}
                      disabled={!project.videoSettings?.falApiKey || falKeyValidating}
                      isLoading={falKeyValidating}
                      className="whitespace-nowrap"
                    >
                      {falKeyStatus === 'valid' ? '✓ Saved' : 'Validate & Save'}
                    </Button>
                  </div>
                  {falKeyStatus === 'valid' && (
                    <p className="text-xs text-green-500 flex items-center gap-1">
                      <CheckSquare className="w-3 h-3" /> API key validated and saved
                    </p>
                  )}
                  {falKeyStatus === 'invalid' && falKeyError && (
                    <p className="text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {falKeyError}
                    </p>
                  )}
                  <p className="text-xs text-neutral-600">
                    Shared across all fal.ai models. Get yours from <a href="https://fal.ai/dashboard/keys" target="_blank" rel="noopener noreferrer" className="text-red-500 hover:underline">fal.ai/dashboard/keys</a>
                  </p>
                </div>

                {/* PiAPI Key — powers Seedance 2 omni_reference (video refs) */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest">
                    PiAPI Key <span className="text-neutral-600">(Seedance 2 omni_reference — used when you pick video references)</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      className={`flex-1 bg-neutral-800 border rounded-md p-3 text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none ${piapiKeyStatus === 'saved' ? 'border-emerald-600' : 'border-neutral-700'
                        }`}
                      placeholder="Enter your PiAPI key..."
                      value={project.videoSettings?.piapiApiKey || ''}
                      onChange={(e) => {
                        setPiapiKeyStatus('idle');
                        setProject(p => ({
                          ...p,
                          videoSettings: { ...(p.videoSettings || DEFAULT_VIDEO_SETTINGS), piapiApiKey: e.target.value }
                        }));
                      }}
                    />
                    <Button
                      variant={piapiKeyStatus === 'saved' ? 'secondary' : 'primary'}
                      onClick={() => {
                        const key = project.videoSettings?.piapiApiKey;
                        if (!key?.trim()) return;
                        localStorage.setItem('slop_piapi_api_key', key.trim());
                        setPiapiKeyStatus('saved');
                        onSave(project);
                      }}
                      disabled={!project.videoSettings?.piapiApiKey}
                      className="whitespace-nowrap"
                    >
                      {piapiKeyStatus === 'saved' ? '✓ Saved' : 'Save Key'}
                    </Button>
                  </div>
                  {piapiKeyStatus === 'saved' && (
                    <p className="text-xs text-emerald-500 flex items-center gap-1">
                      <CheckSquare className="w-3 h-3" /> PiAPI key saved
                    </p>
                  )}
                  <p className="text-xs text-neutral-600">
                    Only used when Seedance is in reference-to-video mode with one or more <strong>video</strong> references selected. Get yours at <a href="https://piapi.ai" target="_blank" rel="noopener noreferrer" className="text-emerald-500 hover:underline">piapi.ai</a>.
                  </p>
                </div>

                {/* Google / Gemini API Key */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest">
                    Google AI Studio Key <span className="text-neutral-600">(Gemini + Veo)</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      className={`flex-1 bg-neutral-800 border rounded-md p-3 text-sm text-white focus:ring-1 focus:ring-red-500 outline-none ${googleKeyStatus === 'saved' ? 'border-green-600' : 'border-neutral-700'
                        }`}
                      placeholder="Enter your Google AI Studio API key..."
                      value={googleApiKey}
                      onChange={(e) => {
                        setGoogleApiKey(e.target.value);
                        setGoogleKeyStatus('idle');
                      }}
                    />
                    <Button
                      variant={googleKeyStatus === 'saved' ? 'secondary' : 'primary'}
                      onClick={() => {
                        if (!googleApiKey.trim()) return;
                        localStorage.setItem('gemini_api_key', googleApiKey.trim());
                        setGoogleKeyStatus('saved');
                      }}
                      disabled={!googleApiKey.trim()}
                      className="whitespace-nowrap"
                    >
                      {googleKeyStatus === 'saved' ? '✓ Saved' : 'Save Key'}
                    </Button>
                  </div>
                  {googleKeyStatus === 'saved' && (
                    <p className="text-xs text-green-500 flex items-center gap-1">
                      <CheckSquare className="w-3 h-3" /> Google API key saved to browser
                    </p>
                  )}
                  <p className="text-xs text-neutral-600">
                    Powers Gemini image generation + Veo video. Get yours from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-red-500 hover:underline">aistudio.google.com/apikey</a>
                  </p>
                </div>

                {/* Master Save All Keys */}
                <div className="pt-4 border-t border-neutral-700">
                  <Button
                    variant={masterKeySaved ? 'secondary' : 'primary'}
                    onClick={handleSaveAllApiKeys}
                    className="w-full h-12"
                  >
                    {masterKeySaved ? '✓ All API Keys Saved to Browser' : '💾 Save All API Keys (Persists Across Sessions)'}
                  </Button>
                  <p className="text-xs text-neutral-600 mt-2 text-center">
                    Saves all keys to your browser's local storage so they auto-fill when you open any project.
                  </p>
                </div>
              </div>

              {/* Video Provider Selection */}
              <div className="bg-neutral-900 p-6 rounded-lg border border-neutral-800 shadow-xl">
                <h3 className="text-lg font-serif text-white flex items-center gap-2 mb-4">
                  <Video className="w-5 h-5 text-red-600" />
                  Default Video Provider
                </h3>
                <p className="text-xs text-neutral-500 mb-4">Sets the default provider for new shots. You can override per-shot in the Video tab.</p>
                <div className="grid grid-cols-4 gap-4">
                  <button
                    onClick={() => setProject(p => ({ ...p, videoSettings: { ...(p.videoSettings || DEFAULT_VIDEO_SETTINGS), provider: 'veo' } }))}
                    className={`p-4 rounded-lg border-2 transition-all ${(project.videoSettings?.provider || 'veo') === 'veo'
                      ? 'border-red-600 bg-red-900/20 text-white'
                      : 'border-neutral-700 bg-neutral-800/50 text-neutral-400 hover:border-neutral-500'
                      }`}
                  >
                    <div className="font-bold text-sm mb-1">Veo (Google)</div>
                    <div className="text-xs text-neutral-500">AI Studio API key</div>
                  </button>
                  <button
                    onClick={() => setProject(p => ({ ...p, videoSettings: { ...(p.videoSettings || DEFAULT_VIDEO_SETTINGS), provider: 'fal-wan' } }))}
                    className={`p-4 rounded-lg border-2 transition-all ${project.videoSettings?.provider === 'fal-wan'
                      ? 'border-orange-600 bg-orange-900/20 text-white'
                      : 'border-neutral-700 bg-neutral-800/50 text-neutral-400 hover:border-neutral-500'
                      }`}
                  >
                    <div className="font-bold text-sm mb-1">Wan v2.6 (fal.ai)</div>
                    <div className="text-xs text-neutral-500">Image-to-Video, 5-15s</div>
                  </button>
                  <button
                    onClick={() => setProject(p => ({ ...p, videoSettings: { ...(p.videoSettings || DEFAULT_VIDEO_SETTINGS), provider: 'seedance' } }))}
                    className={`p-4 rounded-lg border-2 transition-all ${project.videoSettings?.provider === 'seedance'
                      ? 'border-emerald-600 bg-emerald-900/20 text-white'
                      : 'border-neutral-700 bg-neutral-800/50 text-neutral-400 hover:border-neutral-500'
                      }`}
                  >
                    <div className="font-bold text-sm mb-1">Seedance 2.0</div>
                    <div className="text-xs text-neutral-500">fal.ai, 4-15s</div>
                  </button>
                  <button
                    onClick={() => setProject(p => ({ ...p, videoSettings: { ...(p.videoSettings || DEFAULT_VIDEO_SETTINGS), provider: 'fal-aurora' } }))}
                    className={`p-4 rounded-lg border-2 transition-all ${project.videoSettings?.provider === 'fal-aurora'
                      ? 'border-purple-600 bg-purple-900/20 text-white'
                      : 'border-neutral-700 bg-neutral-800/50 text-neutral-400 hover:border-neutral-500'
                      }`}
                  >
                    <div className="font-bold text-sm mb-1">Lip Sync (fal.ai)</div>
                    <div className="text-xs text-neutral-500">Audio-driven video</div>
                  </button>
                </div>
              </div>

              {/* fal.ai Wan v2.6 Settings */}
              {project.videoSettings?.provider === 'fal-wan' && (
                <div className="bg-neutral-900 p-6 rounded-lg border border-neutral-800 shadow-xl space-y-6">
                  <h3 className="text-lg font-serif text-white flex items-center gap-2">
                    <Settings className="w-5 h-5 text-orange-500" />
                    Wan v2.6 Default Settings
                  </h3>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Resolution */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Resolution</label>
                      <select
                        className="w-full bg-neutral-800 border border-neutral-700 rounded-md p-2 text-sm text-white focus:ring-1 focus:ring-red-500 outline-none"
                        value={project.videoSettings?.wanResolution || '1080p'}
                        onChange={(e) => setProject(p => ({
                          ...p,
                          videoSettings: { ...(p.videoSettings || DEFAULT_VIDEO_SETTINGS), wanResolution: e.target.value as '720p' | '1080p' }
                        }))}
                      >
                        <option value="720p">720p</option>
                        <option value="1080p">1080p</option>
                      </select>
                    </div>

                    {/* Duration */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Duration</label>
                      <select
                        className="w-full bg-neutral-800 border border-neutral-700 rounded-md p-2 text-sm text-white focus:ring-1 focus:ring-red-500 outline-none"
                        value={project.videoSettings?.wanDuration || '5'}
                        onChange={(e) => setProject(p => ({
                          ...p,
                          videoSettings: { ...(p.videoSettings || DEFAULT_VIDEO_SETTINGS), wanDuration: e.target.value as '5' | '10' | '15' }
                        }))}
                      >
                        <option value="5">5 seconds</option>
                        <option value="10">10 seconds</option>
                        <option value="15">15 seconds</option>
                      </select>
                    </div>
                  </div>

                  {/* Checkboxes */}
                  <div className="space-y-3">
                    <button
                      onClick={() => setProject(p => ({
                        ...p,
                        videoSettings: { ...(p.videoSettings || DEFAULT_VIDEO_SETTINGS), wanEnablePromptExpansion: !(p.videoSettings?.wanEnablePromptExpansion ?? true) }
                      }))}
                      className="flex items-center gap-2 text-sm text-neutral-300 hover:text-white transition-colors"
                    >
                      {project.videoSettings?.wanEnablePromptExpansion !== false ? (
                        <CheckSquare className="w-5 h-5 text-red-500" />
                      ) : (
                        <Square className="w-5 h-5 text-neutral-500" />
                      )}
                      Enable Prompt Expansion
                      <span className="text-xs text-neutral-600">(LLM rewrites prompt for better results)</span>
                    </button>

                    <button
                      onClick={() => setProject(p => ({
                        ...p,
                        videoSettings: { ...(p.videoSettings || DEFAULT_VIDEO_SETTINGS), wanMultiShots: !(p.videoSettings?.wanMultiShots ?? false) }
                      }))}
                      className="flex items-center gap-2 text-sm text-neutral-300 hover:text-white transition-colors"
                    >
                      {project.videoSettings?.wanMultiShots ? (
                        <CheckSquare className="w-5 h-5 text-red-500" />
                      ) : (
                        <Square className="w-5 h-5 text-neutral-500" />
                      )}
                      Multi-Shots Mode
                      <span className="text-xs text-neutral-600">(Intelligent scene segmentation)</span>
                    </button>

                    <button
                      onClick={() => setProject(p => ({
                        ...p,
                        videoSettings: { ...(p.videoSettings || DEFAULT_VIDEO_SETTINGS), wanEnableSafetyChecker: !(p.videoSettings?.wanEnableSafetyChecker ?? true) }
                      }))}
                      className="flex items-center gap-2 text-sm text-neutral-300 hover:text-white transition-colors"
                    >
                      {project.videoSettings?.wanEnableSafetyChecker !== false ? (
                        <CheckSquare className="w-5 h-5 text-red-500" />
                      ) : (
                        <Square className="w-5 h-5 text-neutral-500" />
                      )}
                      Safety Checker
                      <span className="text-xs text-neutral-600">(Content filter)</span>
                    </button>
                  </div>

                  {/* Negative Prompt */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Negative Prompt</label>
                    <textarea
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-md p-3 text-sm text-white focus:ring-1 focus:ring-red-500 outline-none resize-none"
                      placeholder="Content to avoid (e.g., 'low quality, blurry, defects')"
                      rows={2}
                      value={project.videoSettings?.wanNegativePrompt || ''}
                      onChange={(e) => setProject(p => ({
                        ...p,
                        videoSettings: { ...(p.videoSettings || DEFAULT_VIDEO_SETTINGS), wanNegativePrompt: e.target.value }
                      }))}
                    />
                    <p className="text-xs text-neutral-600">Max 500 characters</p>
                  </div>

                  {/* Seed */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Seed (Optional)</label>
                    <input
                      type="number"
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-md p-3 text-sm text-white focus:ring-1 focus:ring-red-500 outline-none"
                      placeholder="Random seed for reproducibility"
                      value={project.videoSettings?.wanSeed || ''}
                      onChange={(e) => setProject(p => ({
                        ...p,
                        videoSettings: { ...(p.videoSettings || DEFAULT_VIDEO_SETTINGS), wanSeed: e.target.value ? parseInt(e.target.value) : undefined }
                      }))}
                    />
                  </div>

                  {/* Audio URL */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Audio URL (Optional)</label>
                    <input
                      type="url"
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-md p-3 text-sm text-white focus:ring-1 focus:ring-red-500 outline-none"
                      placeholder="https://example.com/audio.mp3"
                      value={project.videoSettings?.wanAudioUrl || ''}
                      onChange={(e) => setProject(p => ({
                        ...p,
                        videoSettings: { ...(p.videoSettings || DEFAULT_VIDEO_SETTINGS), wanAudioUrl: e.target.value }
                      }))}
                    />
                    <p className="text-xs text-neutral-600">Background music URL (WAV/MP3, max 15MB)</p>
                  </div>
                </div>
              )}

              {/* fal.ai Aurora Settings */}
              {project.videoSettings?.provider === 'fal-aurora' && (
                <div className="bg-neutral-900 p-6 rounded-lg border border-purple-900/30 shadow-xl space-y-6">
                  <h3 className="text-lg font-serif text-white flex items-center gap-2">
                    <Settings className="w-5 h-5 text-purple-500" />
                    Lip Sync Default Settings
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Generates audio-driven video from an image + audio file. Ideal for lip-sync talking heads and audio-reactive motion.
                  </p>

                  {/* Default Resolution */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Default Resolution</label>
                    <select
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-md p-2 text-sm text-white focus:ring-1 focus:ring-purple-500 outline-none"
                      value={project.videoSettings?.auroraResolution || '720p'}
                      onChange={(e) => setProject(p => ({
                        ...p,
                        videoSettings: { ...(p.videoSettings || DEFAULT_VIDEO_SETTINGS), auroraResolution: e.target.value as '480p' | '720p' }
                      }))}
                    >
                      <option value="480p">480p</option>
                      <option value="720p">720p</option>
                    </select>
                  </div>

                  {/* Default Audio URL */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Default Audio URL</label>
                    <input
                      type="url"
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-md p-3 text-sm text-white focus:ring-1 focus:ring-purple-500 outline-none"
                      placeholder="https://example.com/audio.wav"
                      value={project.videoSettings?.auroraAudioUrl || ''}
                      onChange={(e) => setProject(p => ({
                        ...p,
                        videoSettings: { ...(p.videoSettings || DEFAULT_VIDEO_SETTINGS), auroraAudioUrl: e.target.value }
                      }))}
                    />
                    <p className="text-xs text-neutral-600">Default audio URL pre-filled per shot. WAV or MP3 (required for generation).</p>
                  </div>

                  {/* Default Guidance Scales */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest">
                        Prompt Guidance ({project.videoSettings?.auroraGuidanceScale ?? 1})
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="5"
                        step="0.1"
                        value={project.videoSettings?.auroraGuidanceScale ?? 1}
                        onChange={(e) => setProject(p => ({
                          ...p,
                          videoSettings: { ...(p.videoSettings || DEFAULT_VIDEO_SETTINGS), auroraGuidanceScale: parseFloat(e.target.value) }
                        }))}
                        className="w-full accent-purple-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest">
                        Audio Guidance ({project.videoSettings?.auroraAudioGuidanceScale ?? 2})
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="5"
                        step="0.1"
                        value={project.videoSettings?.auroraAudioGuidanceScale ?? 2}
                        onChange={(e) => setProject(p => ({
                          ...p,
                          videoSettings: { ...(p.videoSettings || DEFAULT_VIDEO_SETTINGS), auroraAudioGuidanceScale: parseFloat(e.target.value) }
                        }))}
                        className="w-full accent-purple-500"
                      />
                    </div>
                  </div>

                  {/* Default Prompt */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Default Prompt (Optional)</label>
                    <textarea
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-md p-3 text-sm text-white focus:ring-1 focus:ring-purple-500 outline-none resize-none"
                      placeholder="e.g., 4K studio interview, medium close-up..."
                      rows={2}
                      value={project.videoSettings?.auroraPrompt || ''}
                      onChange={(e) => setProject(p => ({
                        ...p,
                        videoSettings: { ...(p.videoSettings || DEFAULT_VIDEO_SETTINGS), auroraPrompt: e.target.value }
                      }))}
                    />
                    <p className="text-xs text-neutral-600">If set, overrides the Director's Prompt by default. Can be changed per-shot.</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* SLOPBOT AI Agent */}
        <AIAgent
          project={project}
          onUpdateProject={(updated) => setProject(updated)}
          onNavigate={(tab) => setActiveTab(tab as any)}
          onClose={() => setAgentOpen(false)}
          isOpen={agentOpen}
          onInsertClips={() => { setActiveTab('timeline'); }}
          onClearTimeline={() => { setActiveTab('timeline'); }}
        />

        {expandedShotId && (
          <ShotDetailModal
            shot={currentShots.find(s => s.id === expandedShotId)!}
            allCharacters={project.characters}
            allLocations={project.locations}
            allShots={currentShots}
            onClose={() => setExpandedShotId(null)}
            onPrev={handlePrevShot}
            onNext={handleNextShot}
            hasPrev={getExpandedShotIndex() > 0}
            hasNext={getExpandedShotIndex() < currentShots.length - 1}
            onGenerate={handleGenerateShot}
            onAlter={handleAlterShot}
            onEditImage={handleEditShotImage}
            onUpdate={updateShot}
            onUpload={handleUploadShotImage}
          />
        )}
      </main>
    </div>
  );
}
