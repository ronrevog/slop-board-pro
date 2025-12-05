
import React, { useState, useEffect } from 'react';
import { breakdownScript, generateShotImage, editImage, generateAssetImage, alterShotImage } from '../services/geminiService';
import { Project, Shot, CinematicSettings, Character, Location } from '../types';
import { CINEMATOGRAPHERS, FILM_STOCKS, LENSES, LIGHTING_STYLES } from '../constants';
import { ShotCard } from './ShotCard';
import { AssetCard } from './AssetCard';
import { Button } from './Button';
import { ShotDetailModal } from './ShotDetailModal';
import { Clapperboard, Settings, Users, MapPin, Film, ChevronRight, LayoutGrid, Plus, ChevronLeft, Home } from 'lucide-react';

interface ProjectEditorProps {
    initialProject: Project;
    onSave: (project: Project) => void;
    onBack: () => void;
}

export const ProjectEditor: React.FC<ProjectEditorProps> = ({ initialProject, onSave, onBack }) => {
  // Initialize internal state with the passed project
  const [project, setProject] = useState<Project>(initialProject);
  const [activeTab, setActiveTab] = useState<'script' | 'characters' | 'locations' | 'board'>('board');
  const [isBreakingDown, setIsBreakingDown] = useState(false);
  const [expandedShotId, setExpandedShotId] = useState<string | null>(null);

  // Auto-save effect: Whenever 'project' changes, notify parent
  useEffect(() => {
      onSave(project);
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
      const breakdown = await breakdownScript(project.scriptContent, project.settings);
      
      const newShots: Shot[] = breakdown.map((s, idx) => {
        const lines = [];
        if (s.dialogue) {
            lines.push({
                id: crypto.randomUUID(),
                speakerId: s.speaker ? project.characters.find(c => c.name.toLowerCase() === s.speaker?.toLowerCase())?.id || "" : "",
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
          characters: [],
          locationId: project.locations[0]?.id || '',
          isGenerating: false,
          isEditing: false,
        };
      });

      setProject(prev => ({ ...prev, shots: newShots }));
      setActiveTab('board');
    } catch (e) {
      console.error(e);
    } finally {
      setIsBreakingDown(false);
    }
  };

  // --- Shot Handlers ---

  const handleAddShot = () => {
    const newId = crypto.randomUUID();
    const newShot: Shot = {
      id: newId,
      number: project.shots.length + 1,
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
    setProject(prev => ({ ...prev, shots: [...prev.shots, newShot] }));
  };

  const handleDeleteShot = (id: string) => {
    setProject(prev => {
        const filtered = prev.shots.filter(s => s.id !== id);
        const renumbered = filtered.map((s, idx) => ({ ...s, number: idx + 1 }));
        return { ...prev, shots: renumbered };
    });
    if (expandedShotId === id) setExpandedShotId(null);
  };

  const handleGenerateShot = async (shotId: string) => {
    setProject(prev => ({
      ...prev,
      shots: prev.shots.map(s => s.id === shotId ? { ...s, isGenerating: true } : s)
    }));

    try {
      const shot = project.shots.find(s => s.id === shotId);
      if (!shot) return;

      const imageUrl = await generateShotImage(shot, project.settings, project.characters, project.locations, project.shots);

      setProject(prev => ({
        ...prev,
        shots: prev.shots.map(s => s.id === shotId ? { ...s, isGenerating: false, imageUrl } : s)
      }));
    } catch (e) {
      console.error(e);
      setProject(prev => ({
        ...prev,
        shots: prev.shots.map(s => s.id === shotId ? { ...s, isGenerating: false } : s)
      }));
    }
  };

  const handleAlterShot = async (shotId: string) => {
    setProject(prev => ({
      ...prev,
      shots: prev.shots.map(s => s.id === shotId ? { ...s, isAltering: true } : s)
    }));

    try {
      const shot = project.shots.find(s => s.id === shotId);
      if (!shot || !shot.imageUrl) return;

      const imageUrl = await alterShotImage(shot, project.settings, project.characters, project.locations, project.shots);

      setProject(prev => ({
        ...prev,
        shots: prev.shots.map(s => s.id === shotId ? { ...s, isAltering: false, imageUrl } : s)
      }));
    } catch (e) {
      console.error(e);
      setProject(prev => ({
        ...prev,
        shots: prev.shots.map(s => s.id === shotId ? { ...s, isAltering: false } : s)
      }));
    }
  };

  const handleEditShotImage = async (shotId: string, prompt: string) => {
    setProject(prev => ({
      ...prev,
      shots: prev.shots.map(s => s.id === shotId ? { ...s, isEditing: true } : s)
    }));

    try {
      const shot = project.shots.find(s => s.id === shotId);
      if (!shot || !shot.imageUrl) return;

      const newImageUrl = await editImage(shot.imageUrl, prompt);

      setProject(prev => ({
        ...prev,
        shots: prev.shots.map(s => s.id === shotId ? { ...s, isEditing: false, imageUrl: newImageUrl } : s)
      }));
    } catch (e) {
      console.error(e);
      setProject(prev => ({
        ...prev,
        shots: prev.shots.map(s => s.id === shotId ? { ...s, isEditing: false } : s)
      }));
    }
  };

  const handleUploadShotImage = (shotId: string, file: File) => {
      const reader = new FileReader();
      reader.onloadend = () => {
          const base64 = reader.result as string;
          setProject(prev => ({
              ...prev,
              shots: prev.shots.map(s => s.id === shotId ? { ...s, imageUrl: base64 } : s)
          }));
      };
      reader.readAsDataURL(file);
  };

  const updateShot = (id: string, updates: Partial<Shot>) => {
    setProject(prev => ({
        ...prev,
        shots: prev.shots.map(s => s.id === id ? { ...s, ...updates } : s)
    }));
  };

  const getExpandedShotIndex = () => project.shots.findIndex(s => s.id === expandedShotId);
  const handleNextShot = () => {
      const idx = getExpandedShotIndex();
      if (idx < project.shots.length - 1) setExpandedShotId(project.shots[idx + 1].id);
  };
  const handlePrevShot = () => {
      const idx = getExpandedShotIndex();
      if (idx > 0) setExpandedShotId(project.shots[idx - 1].id);
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
    for (const shot of project.shots) {
      if (!shot.imageUrl) await handleGenerateShot(shot.id);
    }
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
          </div>
          <div className="flex items-center gap-4">
             {activeTab === 'board' && (
                 <>
                    <Button size="sm" variant="secondary" onClick={handleAddShot}>
                        <Plus className="w-4 h-4 mr-2" /> Add Shot
                    </Button>
                    <Button variant="danger" size="sm" onClick={handleGenerateAll} disabled={project.shots.length === 0}>
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
                 <h2 className="text-2xl font-serif text-white flex items-center gap-2"><Users className="w-5 h-5 text-red-600"/> Character Sheet</h2>
                 <Button size="sm" variant="secondary" onClick={() => addAsset('Character')}><Plus className="w-4 h-4 mr-2"/> Add Character</Button>
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
                 <h2 className="text-2xl font-serif text-white flex items-center gap-2"><MapPin className="w-5 h-5 text-red-600"/> Location Scout</h2>
                 <Button size="sm" variant="secondary" onClick={() => addAsset('Location')}><Plus className="w-4 h-4 mr-2"/> Add Location</Button>
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
                 {project.shots.length === 0 ? (
                     <div className="flex flex-col items-center justify-center h-96 text-neutral-500">
                         <LayoutGrid className="w-16 h-16 mb-4 opacity-20" />
                         <p className="text-lg">No shots yet.</p>
                         <Button size="md" variant="secondary" onClick={handleAddShot}>
                             <Plus className="w-4 h-4 mr-2" /> Create First Shot
                         </Button>
                     </div>
                 ) : (
                    <div className="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-2 gap-8 pb-20">
                        {project.shots.map(shot => (
                            <ShotCard 
                                key={shot.id} 
                                shot={shot}
                                allCharacters={project.characters}
                                allLocations={project.locations}
                                allShots={project.shots}
                                onGenerate={handleGenerateShot}
                                onAlter={handleAlterShot}
                                onEditImage={handleEditShotImage}
                                onUpdate={updateShot}
                                onDelete={handleDeleteShot} 
                                onUpload={handleUploadShotImage}
                                onExpand={setExpandedShotId}
                            />
                        ))}
                    </div>
                 )}
             </div>
          )}
        </div>

        {expandedShotId && (
            <ShotDetailModal 
                shot={project.shots.find(s => s.id === expandedShotId)!}
                allCharacters={project.characters}
                allLocations={project.locations}
                allShots={project.shots}
                onClose={() => setExpandedShotId(null)}
                onPrev={handlePrevShot}
                onNext={handleNextShot}
                hasPrev={getExpandedShotIndex() > 0}
                hasNext={getExpandedShotIndex() < project.shots.length - 1}
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
