
import React, { useState, useRef, useEffect } from 'react';
import { Shot, Character, Location } from '../types';
import { X, ChevronLeft, ChevronRight, Camera, RefreshCw, SendHorizontal, Upload, Download, MapPin, Users, MessageSquare, Trash2, Edit3, Film, Wand2, Plus, Link } from 'lucide-react';
import { Button } from './Button';

interface ShotDetailModalProps {
  shot: Shot;
  allCharacters: Character[];
  allLocations: Location[];
  allShots: Shot[];
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  onGenerate: (id: string) => void;
  onAlter: (id: string) => void;
  onEditImage: (id: string, prompt: string) => void;
  onUpdate: (id: string, updates: Partial<Shot>) => void;
  onUpload: (id: string, file: File) => void;
}

export const ShotDetailModal: React.FC<ShotDetailModalProps> = ({
  shot,
  allCharacters,
  allLocations,
  allShots,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  onGenerate,
  onAlter,
  onEditImage,
  onUpdate,
  onUpload,
}) => {
  const [editPrompt, setEditPrompt] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev) onPrev();
      if (e.key === 'ArrowRight' && hasNext) onNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onPrev, onNext, hasPrev, hasNext]);

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editPrompt.trim()) {
      onEditImage(shot.id, editPrompt);
      setEditPrompt('');
    }
  };

  const toggleCharacter = (charId: string) => {
    const current = shot.characters || [];
    const updated = current.includes(charId)
      ? current.filter(id => id !== charId)
      : [...current, charId];
    onUpdate(shot.id, { characters: updated });
  };

  const triggerUpload = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUpload(shot.id, e.target.files[0]);
    }
  };

  const handleDownload = () => {
    if (!shot.imageUrl) return;
    const link = document.createElement('a');
    link.href = shot.imageUrl;
    link.download = `shot-${shot.number}-full.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Dialogue Management
  const addDialogueLine = () => {
    const newLine = { id: crypto.randomUUID(), speakerId: "", text: "" };
    onUpdate(shot.id, { dialogueLines: [...(shot.dialogueLines || []), newLine] });
  };

  const updateDialogueLine = (lineId: string, updates: Partial<{speakerId: string, text: string}>) => {
    const updatedLines = shot.dialogueLines.map(line => 
      line.id === lineId ? { ...line, ...updates } : line
    );
    onUpdate(shot.id, { dialogueLines: updatedLines });
  };

  const deleteDialogueLine = (lineId: string) => {
    const updatedLines = shot.dialogueLines.filter(line => line.id !== lineId);
    onUpdate(shot.id, { dialogueLines: updatedLines });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm p-4 md:p-8">
      {/* Container */}
      <div className="w-full max-w-7xl h-full max-h-[90vh] flex flex-col md:flex-row bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-2xl relative">
        
        {/* Close Button */}
        <button 
            onClick={onClose}
            className="absolute top-4 right-4 z-50 p-2 bg-black/50 text-white rounded-full hover:bg-red-600 transition-colors"
        >
            <X className="w-6 h-6" />
        </button>

        {/* LEFT / TOP: Image Area (70% width on Desktop) */}
        <div className="flex-1 bg-black relative flex items-center justify-center group overflow-hidden">
             {shot.imageUrl ? (
                <img 
                    src={shot.imageUrl} 
                    alt={`Shot ${shot.number}`} 
                    className="max-w-full max-h-full object-contain"
                />
             ) : (
                <div className="text-neutral-600 flex flex-col items-center gap-4">
                    <Camera className="w-16 h-16 opacity-30" />
                    <p className="uppercase tracking-widest text-sm">No Image Rendered</p>
                    <div className="flex gap-4">
                        <Button onClick={() => onGenerate(shot.id)} isLoading={shot.isGenerating}>
                            <RefreshCw className="w-4 h-4 mr-2" /> Generate Shot
                        </Button>
                        <Button variant="secondary" onClick={triggerUpload}>
                            <Upload className="w-4 h-4 mr-2" /> Upload
                        </Button>
                    </div>
                </div>
             )}

             {/* Overlay Controls */}
             <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/90 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-4">
                 
                 <div className="flex justify-center gap-4">
                     <Button size="md" onClick={() => onGenerate(shot.id)} isLoading={shot.isGenerating || shot.isEditing}>
                        <RefreshCw className="w-4 h-4 mr-2" /> {shot.imageUrl ? "Regenerate" : "Generate"}
                     </Button>
                     {shot.imageUrl && (
                        <Button size="md" variant="secondary" onClick={() => onAlter(shot.id)} isLoading={shot.isAltering}>
                            <Wand2 className="w-4 h-4 mr-2" /> Alter
                        </Button>
                     )}
                     <Button size="md" variant="secondary" onClick={triggerUpload}>
                        <Upload className="w-4 h-4 mr-2" /> Upload
                     </Button>
                     {shot.imageUrl && (
                        <Button size="md" variant="secondary" onClick={handleDownload}>
                            <Download className="w-4 h-4 mr-2" /> Download
                        </Button>
                     )}
                 </div>

                 {shot.imageUrl && (
                    <form onSubmit={handleEditSubmit} className="max-w-xl mx-auto w-full flex gap-2">
                        <input
                            type="text"
                            value={editPrompt}
                            onChange={(e) => setEditPrompt(e.target.value)}
                            placeholder="Describe changes to refine this frame (e.g. 'Make the lighting darker')..."
                            className="flex-1 px-4 py-2 bg-neutral-900/80 backdrop-blur border border-neutral-600 rounded-md text-sm text-white focus:border-red-500 outline-none"
                        />
                        <Button type="submit" variant="primary">Refine</Button>
                    </form>
                 )}
             </div>

             {/* Navigation Arrows (On top of image) */}
             {hasPrev && (
                 <button onClick={onPrev} className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-black/40 text-white rounded-full hover:bg-white hover:text-black transition-all">
                     <ChevronLeft className="w-8 h-8" />
                 </button>
             )}
             {hasNext && (
                 <button onClick={onNext} className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-black/40 text-white rounded-full hover:bg-white hover:text-black transition-all">
                     <ChevronRight className="w-8 h-8" />
                 </button>
             )}

             {(shot.isGenerating || shot.isEditing || shot.isAltering) && (
                <div className="absolute top-8 left-8 bg-red-600 text-white text-xs uppercase font-bold px-3 py-1.5 rounded-full animate-pulse shadow-xl">
                    {shot.isEditing ? "Editing..." : shot.isAltering ? "Altering..." : "Processing AI..."}
                </div>
             )}

             <input 
                ref={fileInputRef} 
                type="file" 
                className="hidden" 
                accept="image/*" 
                onChange={handleFileChange}
            />
        </div>

        {/* RIGHT / BOTTOM: Editor Sidebar (30% width on Desktop) */}
        <div className="w-full md:w-[400px] bg-neutral-900 border-l border-neutral-800 flex flex-col h-full overflow-y-auto custom-scrollbar">
            
            {/* Header */}
            <div className="p-6 border-b border-neutral-800">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-3xl font-serif font-bold text-red-500">Shot #{shot.number}</span>
                    <div className="flex gap-2">
                         <select 
                            className="bg-neutral-800 text-xs text-neutral-300 border border-neutral-700 rounded px-2 py-1 outline-none"
                            value={shot.shotType}
                            onChange={(e) => onUpdate(shot.id, { shotType: e.target.value as any })}
                        >
                            {['Extreme Wide', 'Wide', 'Medium', 'Close Up', 'Extreme Close Up', 'Insert', 'High Angle', 'Low Angle', 'Dutch Angle (45°)', 'Overhead', 'Over the Shoulder'].map(t => <option key={t}>{t}</option>)}
                        </select>
                        <select 
                            className="bg-neutral-800 text-xs text-neutral-300 border border-neutral-700 rounded px-2 py-1 outline-none"
                            value={shot.cameraMove}
                            onChange={(e) => onUpdate(shot.id, { cameraMove: e.target.value as any })}
                        >
                            {['Static', 'Dolly In', 'Dolly Out', 'Pan', 'Tilt', 'Handheld', 'Tracking', 'Crane', 'Arc', 'Zoom In', 'Zoom Out', 'Whip Pan'].map(t => <option key={t}>{t}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            <div className="p-6 space-y-6 flex-1">
                
                {/* Description */}
                <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-500 uppercase flex items-center gap-2">
                        <Film className="w-3 h-3" /> Visual Description
                    </label>
                    <textarea 
                        className="w-full h-32 bg-black/30 border border-neutral-800 focus:border-neutral-600 rounded p-3 text-sm text-neutral-300 resize-none outline-none"
                        value={shot.description}
                        onChange={(e) => onUpdate(shot.id, { description: e.target.value })}
                        placeholder="Detailed visual description of the frame..."
                    />
                </div>

                {/* Action */}
                <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-500 uppercase flex items-center gap-2">
                        <Edit3 className="w-3 h-3" /> Action
                    </label>
                    <input 
                        className="w-full bg-black/30 border border-neutral-800 focus:border-neutral-600 rounded p-3 text-sm text-neutral-300 outline-none"
                        value={shot.action}
                        onChange={(e) => onUpdate(shot.id, { action: e.target.value })}
                        placeholder="What happens in this shot?"
                    />
                </div>

                 {/* Dialogue (Multi-line) */}
                 <div className="space-y-2">
                    <div className="flex items-center justify-between">
                         <label className="text-xs font-bold text-neutral-500 uppercase flex items-center gap-2">
                            <MessageSquare className="w-3 h-3" /> Dialogue
                        </label>
                        <Button 
                            onClick={addDialogueLine}
                            size="sm"
                            variant="secondary"
                            className="h-6 px-2 text-[10px]"
                        >
                            <Plus className="w-3 h-3 mr-1" /> Add Line
                        </Button>
                    </div>
                    
                    <div className="space-y-2">
                        {(!shot.dialogueLines || shot.dialogueLines.length === 0) && (
                            <div className="p-3 text-center text-xs text-neutral-600 bg-black/20 rounded border border-neutral-800 border-dashed">
                                No dialogue in this shot.
                            </div>
                        )}
                        {shot.dialogueLines?.map((line, index) => (
                            <div key={line.id} className="bg-black/30 border border-neutral-800 rounded p-2 flex flex-col gap-2 group/line hover:border-neutral-700 transition-colors">
                                <div className="flex justify-between items-center gap-2">
                                     <select 
                                        className="bg-transparent text-[10px] text-neutral-400 uppercase font-bold outline-none cursor-pointer hover:text-white transition-colors max-w-[120px]"
                                        value={line.speakerId || ""}
                                        onChange={(e) => updateDialogueLine(line.id, { speakerId: e.target.value })}
                                    >
                                        <option value="">No Speaker</option>
                                        {allCharacters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                    <button onClick={() => deleteDialogueLine(line.id)} className="text-neutral-600 hover:text-red-500 p-1 opacity-0 group-hover/line:opacity-100 transition-all">
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                </div>
                                <textarea
                                    className="w-full bg-transparent text-sm font-mono text-neutral-300 resize-none outline-none focus:text-white"
                                    value={line.text}
                                    onChange={(e) => updateDialogueLine(line.id, { text: e.target.value })}
                                    placeholder="Dialogue line..."
                                    rows={2}
                                />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Assets & Continuity */}
                <div className="space-y-4 pt-4 border-t border-neutral-800">
                    
                    {/* Location */}
                    <div className="space-y-2">
                         <label className="text-xs font-bold text-neutral-500 uppercase flex items-center gap-2">
                            <MapPin className="w-3 h-3" /> Location
                        </label>
                        <select 
                            className="w-full bg-neutral-800 border border-neutral-700 rounded p-2 text-sm text-neutral-300 outline-none"
                            value={shot.locationId}
                            onChange={(e) => onUpdate(shot.id, { locationId: e.target.value })}
                        >
                             <option value="">Select Location...</option>
                             {allLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                    </div>

                    {/* Reference Shot */}
                    <div className="space-y-2">
                         <label className="text-xs font-bold text-neutral-500 uppercase flex items-center gap-2">
                            <Link className="w-3 h-3" /> Visual Continuity Ref
                        </label>
                        <select 
                            className="w-full bg-neutral-800 border border-neutral-700 rounded p-2 text-sm text-neutral-300 outline-none"
                            value={shot.referenceShotId || ""}
                            onChange={(e) => onUpdate(shot.id, { referenceShotId: e.target.value })}
                        >
                             <option value="">None (Use Script Only)</option>
                             {allShots.filter(s => s.id !== shot.id).map(s => (
                                 <option key={s.id} value={s.id}>Shot #{s.number}</option>
                             ))}
                        </select>
                    </div>

                    {/* Characters */}
                    <div className="space-y-2">
                         <label className="text-xs font-bold text-neutral-500 uppercase flex items-center gap-2">
                            <Users className="w-3 h-3" /> Characters in Shot
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {allCharacters.map(char => (
                                <button
                                    key={char.id}
                                    onClick={() => toggleCharacter(char.id)}
                                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                                    shot.characters.includes(char.id) 
                                    ? 'bg-red-900/30 border-red-800 text-red-200' 
                                    : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-neutral-500'
                                    }`}
                                >
                                    {char.name}
                                </button>
                            ))}
                             {allCharacters.length === 0 && <span className="text-xs text-neutral-600 italic">No characters added yet.</span>}
                        </div>
                    </div>
                </div>

            </div>
        </div>

      </div>
    </div>
  );
};
