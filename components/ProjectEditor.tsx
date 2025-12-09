
import React, { useState, useEffect } from 'react';
import { analyzeScript, generateShotImage, editImage, generateAssetImage, alterShotImage, generateShotVideo, extendShotVideo } from '../services/geminiService';
import { Project, Shot, CinematicSettings, Character, Location, VideoSegment, Scene } from '../types';
import { CINEMATOGRAPHERS, FILM_STOCKS, LENSES, LIGHTING_STYLES, ANAMORPHIC_LENS_PROMPTS } from '../constants';
import { ShotCard } from './ShotCard';
import { AssetCard } from './AssetCard';
import { Button } from './Button';
import { ShotDetailModal } from './ShotDetailModal';
import { VideoShotCard } from './VideoShotCard';
import { Clapperboard, Settings, Users, MapPin, Film, ChevronRight, LayoutGrid, Plus, ChevronLeft, Home, Video, Play, Loader2, Download, AlertCircle, ImageIcon, MonitorPlay, Layers, Trash2, Edit3, ChevronDown, ChevronUp } from 'lucide-react';

interface ProjectEditorProps {
  initialProject: Project;
  onSave: (project: Project) => void;
  onBack: () => void;
}

export const ProjectEditor: React.FC<ProjectEditorProps> = ({ initialProject, onSave, onBack }) => {
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
  const [activeTab, setActiveTab] = useState<'script' | 'characters' | 'locations' | 'board' | 'video'>('board');
  const [isBreakingDown, setIsBreakingDown] = useState(false);
  const [expandedShotId, setExpandedShotId] = useState<string | null>(null);
  const [editingSceneName, setEditingSceneName] = useState<string | null>(null);
  const [scenesCollapsed, setScenesCollapsed] = useState(false);

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

  const handleScriptBreakdown = async () => {
    if (!project.scriptContent.trim()) return;
    setIsBreakingDown(true);
    try {
      // Use comprehensive script analysis that extracts characters, locations, and shots
      const analysis = await analyzeScript(project.scriptContent, project.settings);

      // Create new characters from extracted data
      const newCharacters: Character[] = analysis.characters.map(c => ({
        id: crypto.randomUUID(),
        name: c.name,
        description: c.description,
        isGenerating: false,
        isEditing: false
      }));

      // Create new locations from extracted data
      const newLocations: Location[] = analysis.locations.map(l => ({
        id: crypto.randomUUID(),
        name: l.name,
        description: l.description,
        isGenerating: false,
        isEditing: false
      }));

      // Create shots with character and location linking
      const newShots: Shot[] = analysis.shots.map((s, idx) => {
        const lines = [];
        if (s.dialogue) {
          // Try to find the character by speaker name
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
          number: idx + 1,
          description: s.description || '',
          action: s.action || '',
          dialogueLines: lines,
          shotType: (s.shotType as any) || 'Medium',
          cameraMove: (s.cameraMove as any) || 'Static',
          characters: [], // Can be linked manually later or auto-detected
          locationId: newLocations[0]?.id || '', // Default to first location
          isGenerating: false,
          isEditing: false,
        };
      });

      // Update project with all extracted data
      setProject(prev => ({
        ...prev,
        characters: newCharacters,
        locations: newLocations,
        shots: newShots
      }));

      setActiveTab('board');
    } catch (e) {
      console.error(e);
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

  const handleGenerateShot = async (shotId: string) => {
    if (!activeSceneId) return;
    updateSceneShots(activeSceneId, shots =>
      shots.map(s => s.id === shotId ? { ...s, isGenerating: true } : s)
    );

    try {
      const shot = currentShots.find(s => s.id === shotId);
      if (!shot) return;

      const imageUrl = await generateShotImage(shot, project.settings, project.characters, project.locations, currentShots);

      updateSceneShots(activeSceneId, shots =>
        shots.map(s => s.id === shotId ? { ...s, isGenerating: false, imageUrl } : s)
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

      updateSceneShots(activeSceneId, shots =>
        shots.map(s => s.id === shotId ? { ...s, isAltering: false, imageUrl } : s)
      );
    } catch (e) {
      console.error(e);
      updateSceneShots(activeSceneId, shots =>
        shots.map(s => s.id === shotId ? { ...s, isAltering: false } : s)
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

      updateSceneShots(activeSceneId, shots =>
        shots.map(s => s.id === shotId ? { ...s, isEditing: false, imageUrl: newImageUrl } : s)
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
      updateSceneShots(activeSceneId, shots =>
        shots.map(s => s.id === shotId ? { ...s, imageUrl: base64 } : s)
      );
    };
    reader.readAsDataURL(file);
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

  const handleGenerateAll = async () => {
    for (const shot of currentShots) {
      if (!shot.imageUrl) await handleGenerateShot(shot.id);
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

      updateSceneShots(activeSceneId, shots =>
        shots.map(s => s.id === shotId ? {
          ...s,
          isVideoGenerating: false,
          videoUrl,
          videoSegments: [newSegment],
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

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-950 text-neutral-200 animate-fade-in">

      {/* Sidebar - Cinematic Controls */}
      <aside className="w-80 bg-neutral-900 border-r border-neutral-800 flex flex-col overflow-y-auto custom-scrollbar">
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
          </div>
          <div className="flex items-center gap-4">
            {activeTab === 'board' && (
              <>
                <Button size="sm" variant="secondary" onClick={handleAddShot}>
                  <Plus className="w-4 h-4 mr-2" /> Add Shot
                </Button>
                <Button variant="danger" size="sm" onClick={handleGenerateAll} disabled={currentShots.length === 0}>
                  Render All Frames
                </Button>
              </>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {activeTab === 'script' && (
            <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
              <div className="bg-neutral-900 p-8 rounded-lg border border-neutral-800 shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-serif text-white">Script Input</h2>
                  <div className="text-xs text-neutral-500 bg-neutral-800 px-2 py-1 rounded">Format: Screenplay or Prose</div>
                </div>
                <textarea
                  className="w-full h-96 bg-black border border-neutral-800 rounded-md p-6 text-neutral-300 font-mono text-sm leading-relaxed focus:ring-1 focus:ring-red-900 outline-none resize-none"
                  placeholder="EXT. DESERT HIGHWAY - DAY..."
                  value={project.scriptContent}
                  onChange={(e) => setProject(p => ({ ...p, scriptContent: e.target.value }))}
                />
                <div className="mt-6 flex justify-end">
                  <Button onClick={handleScriptBreakdown} isLoading={isBreakingDown} size="lg">
                    <Clapperboard className="w-4 h-4 mr-2" />
                    Analyze & Generate
                  </Button>
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
                      onGenerate={handleGenerateShot}
                      onAlter={handleAlterShot}
                      onEditImage={handleEditShotImage}
                      onUpdate={updateShot}
                      onDelete={handleDeleteShot}
                      onUpload={handleUploadShotImage}
                      onExpand={setExpandedShotId}
                      onDuplicate={handleDuplicateShot}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'video' && (
            <div className="animate-fade-in space-y-8 pb-20">
              <div className="flex flex-col gap-12">
                {currentShots.map(shot => (
                  <VideoShotCard
                    key={shot.id}
                    shot={shot}
                    sceneName={activeScene?.name}
                    videoModelLabel={`Veo ${shot.videoModel === 'quality' ? 'Quality' : 'Fast'} Model`}
                    onUpdatePrompt={handleUpdateVideoPrompt}
                    onGenerate={handleGenerateVideo}
                    onExtend={handleExtendVideo}
                    onDownload={handleDownloadVideo}
                    onCaptureFrame={handleCaptureFrame}
                    synthesizePrompt={synthesizeVideoPrompt}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

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
