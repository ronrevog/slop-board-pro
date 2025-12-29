
import React, { useState, useRef, useEffect } from 'react';
import { Shot, Character, Location } from '../types';
import { Camera, RefreshCw, SendHorizontal, MessageSquare, MapPin, Users, Edit3, Trash2, Upload, Download, Maximize2, Wand2, Plus, X, Link, Copy, Focus } from 'lucide-react';
import { Button } from './Button';

interface ShotCardProps {
  shot: Shot;
  sceneName?: string;
  allCharacters: Character[];
  allLocations: Location[];
  allShots: Shot[];
  onGenerate: (id: string) => void;
  onAlter: (id: string) => void;
  onEditImage: (id: string, prompt: string) => void;
  onUpdate: (id: string, updates: Partial<Shot>) => void;
  onDelete: (id: string) => void;
  onUpload: (id: string, file: File) => void;
  onExpand: (id: string) => void;
  onDuplicate: (id: string) => void;
  onCoverageFromImage?: (id: string) => void;
  isCoverageGenerating?: boolean;
}

export const ShotCard: React.FC<ShotCardProps> = ({
  shot,
  sceneName,
  allCharacters,
  allLocations,
  allShots,
  onGenerate,
  onAlter,
  onEditImage,
  onUpdate,
  onDelete,
  onUpload,
  onExpand,
  onDuplicate,
  onCoverageFromImage,
  isCoverageGenerating
}) => {
  const [editPrompt, setEditPrompt] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let timer: any;
    if (deleteConfirm) {
      timer = setTimeout(() => setDeleteConfirm(false), 3000);
    }
    return () => clearTimeout(timer);
  }, [deleteConfirm]);

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

  const handleDownload = () => {
    if (!shot.imageUrl) return;
    const link = document.createElement('a');
    link.href = shot.imageUrl;
    const scenePrefix = sceneName ? `${sceneName.replace(/\s+/g, '-').toLowerCase()}-` : '';
    link.download = `${scenePrefix}shot-${shot.number}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const triggerUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUpload(shot.id, e.target.files[0]);
    }
  };

  const handleDeleteClick = () => {
    if (deleteConfirm) {
      onDelete(shot.id);
    } else {
      setDeleteConfirm(true);
    }
  };

  // --- Dialogue Handlers ---
  const handleAddDialogue = () => {
    const newLine = { id: crypto.randomUUID(), speakerId: "", text: "" };
    onUpdate(shot.id, { dialogueLines: [...(shot.dialogueLines || []), newLine] });
  };

  const handleUpdateDialogue = (lineId: string, updates: Partial<{ speakerId: string, text: string }>) => {
    const updatedLines = (shot.dialogueLines || []).map(line =>
      line.id === lineId ? { ...line, ...updates } : line
    );
    onUpdate(shot.id, { dialogueLines: updatedLines });
  };

  const handleDeleteDialogue = (lineId: string) => {
    const updatedLines = (shot.dialogueLines || []).filter(line => line.id !== lineId);
    onUpdate(shot.id, { dialogueLines: updatedLines });
  };

  const getSpeakerName = (id: string) => allCharacters.find(c => c.id === id)?.name || "Unknown";

  return (
    <div className="group bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden flex flex-col h-full hover:border-neutral-600 transition-colors shadow-lg">

      {/* 1. VISUAL AREA */}
      <div className="relative aspect-video bg-black w-full overflow-hidden">
        {shot.imageUrl ? (
          <img
            src={shot.imageUrl}
            alt={`Shot ${shot.number}`}
            className="w-full h-full object-cover"
          />
        ) : (
          /* FIXED: absolute inset-0 forces this to fill the aspect-video container and center properly */
          <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-600 gap-3">
            <Camera className="w-8 h-8 opacity-50" />
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => onGenerate(shot.id)} isLoading={shot.isGenerating}>
                Generate
              </Button>
              <Button size="sm" variant="ghost" onClick={triggerUpload}>
                <Upload className="w-3 h-3" />
              </Button>
            </div>
          </div>
        )}

        {/* Overlay Actions */}
        <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 z-10 p-4 backdrop-blur-sm">
          <div className="flex gap-2 w-full max-w-xs justify-center">
            <Button size="sm" variant="primary" onClick={() => onGenerate(shot.id)} isLoading={shot.isGenerating || shot.isEditing} className="flex-1" title="Regenerate from text (New)">
              <RefreshCw className="w-3 h-3 mr-2" />
              {shot.imageUrl ? "Regen" : "Generate"}
            </Button>

            {shot.imageUrl && (
              <Button size="sm" variant="secondary" onClick={() => onAlter(shot.id)} isLoading={shot.isAltering} className="flex-1" title="Alter based on current image (Refine)">
                <Wand2 className="w-3 h-3 mr-2" /> Alter
              </Button>
            )}

            <Button size="sm" variant="secondary" onClick={triggerUpload} className="px-2" title="Upload Image">
              <Upload className="w-3 h-3" />
            </Button>

            {shot.imageUrl && (
              <Button size="sm" variant="secondary" onClick={handleDownload} className="px-2" title="Download">
                <Download className="w-3 h-3" />
              </Button>
            )}

            <Button size="sm" variant="secondary" onClick={() => onExpand(shot.id)} className="px-2" title="Expand to Full Frame">
              <Maximize2 className="w-3 h-3" />
            </Button>
          </div>

          {/* Coverage Button - Only shows when image exists */}
          {shot.imageUrl && onCoverageFromImage && (
            <div className="w-full max-w-xs mt-1">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onCoverageFromImage(shot.id)}
                isLoading={isCoverageGenerating}
                className="w-full"
                title="Generate 8 coverage shots using this image as reference"
              >
                <Focus className="w-3 h-3 mr-2" /> Coverage (8 Shots)
              </Button>
            </div>
          )}

          {/* Edit Image Input Overlay */}
          {shot.imageUrl && (
            <form onSubmit={handleEditSubmit} className="w-full max-w-xs mt-2 flex gap-1">
              <input
                type="text"
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                placeholder="Magic Edit (e.g. 'Add rain')"
                className="block w-full px-2 py-1 bg-neutral-900/80 backdrop-blur border border-neutral-600 rounded text-xs text-white placeholder-neutral-400 focus:border-red-500 outline-none"
              />
              <button type="submit" className="bg-red-600 text-white p-1 rounded hover:bg-red-700">
                <SendHorizontal className="w-3 h-3" />
              </button>
            </form>
          )}
        </div>

        {/* Status Badge */}
        {(shot.isGenerating || shot.isEditing || shot.isAltering) && (
          <div className="absolute top-2 right-2 bg-red-600 text-white text-[10px] uppercase font-bold px-2 py-1 rounded-full animate-pulse z-20">
            {shot.isEditing ? "Editing" : shot.isAltering ? "Altering" : "Rendering"}
          </div>
        )}

        {/* Reference Indicator */}
        {shot.referenceShotId && (
          <div className="absolute bottom-2 right-2 bg-neutral-900/80 backdrop-blur text-white text-[10px] px-2 py-1 rounded flex items-center gap-1 border border-neutral-700">
            <Link className="w-3 h-3 text-blue-400" />
            Ref: #{allShots.find(s => s.id === shot.referenceShotId)?.number}
          </div>
        )}

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*"
          onChange={handleFileChange}
        />
      </div>

      {/* 2. DATA / EDITING AREA */}
      <div className="flex-1 flex flex-col divide-y divide-neutral-800">

        {/* Shot Specs Header */}
        <div className="p-3 flex justify-between items-center bg-neutral-900">
          <div className="flex items-center gap-2">
            <span className="text-red-500 font-serif font-bold text-lg">#{shot.number}</span>
            <select
              className="bg-neutral-800 text-xs text-neutral-300 border border-neutral-700 rounded px-1 py-0.5 outline-none hover:border-neutral-500 transition-colors max-w-[120px]"
              value={shot.shotType}
              onChange={(e) => onUpdate(shot.id, { shotType: e.target.value as any })}
            >
              {['Extreme Wide', 'Wide', 'Medium', 'Close Up', 'Extreme Close Up', 'Insert', 'High Angle', 'Low Angle', 'Dutch Angle (45°)', 'Overhead', 'Over the Shoulder'].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <select
              className="bg-transparent text-xs text-neutral-500 uppercase font-medium tracking-wide outline-none text-right hover:text-neutral-300 transition-colors"
              value={shot.cameraMove}
              onChange={(e) => onUpdate(shot.id, { cameraMove: e.target.value as any })}
            >
              {['Static', 'Dolly In', 'Dolly Out', 'Pan', 'Tilt', 'Handheld', 'Tracking', 'Crane', 'Arc', 'Zoom In', 'Zoom Out', 'Whip Pan'].map(t => <option key={t}>{t}</option>)}
            </select>
            <button
              onClick={() => onDuplicate(shot.id)}
              className="text-neutral-600 hover:text-blue-400 transition-colors"
              title="Duplicate shot to end of list"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleDeleteClick}
              className={`transition-colors flex items-center gap-1 ${deleteConfirm ? 'text-red-600 font-bold animate-pulse' : 'text-neutral-600 hover:text-red-500'}`}
              title={deleteConfirm ? "Click again to confirm" : "Delete Shot"}
            >
              <Trash2 className="w-3.5 h-3.5" />
              {deleteConfirm && <span className="text-[10px]">Sure?</span>}
            </button>
          </div>
        </div>

        {/* Script & Action */}
        <div className="p-3 space-y-2">
          <textarea
            className="w-full bg-transparent text-sm text-neutral-300 font-medium resize-none focus:outline-none focus:bg-neutral-800/50 rounded p-1 transition-colors"
            value={shot.description}
            onChange={(e) => onUpdate(shot.id, { description: e.target.value })}
            placeholder="Shot description..."
            rows={2}
          />
          <div className="flex items-center gap-2">
            <Edit3 className="w-3 h-3 text-neutral-500 flex-shrink-0" />
            <input
              className="w-full bg-transparent text-xs text-neutral-400 italic focus:outline-none focus:text-white"
              value={shot.action}
              onChange={(e) => onUpdate(shot.id, { action: e.target.value })}
              placeholder="Action..."
            />
          </div>
        </div>

        {/* Configuration (Loc / Chars) */}
        <div className="p-3 bg-neutral-900/50 space-y-3">

          <div className="flex gap-2">
            {/* Location Selector */}
            <div className="flex-1 flex items-center gap-2">
              <MapPin className="w-3 h-3 text-neutral-500" />
              <select
                className="w-full bg-neutral-800 text-xs text-neutral-300 border border-neutral-700 rounded px-2 py-1 outline-none hover:border-neutral-500 transition-colors"
                value={shot.locationId}
                onChange={(e) => onUpdate(shot.id, { locationId: e.target.value })}
              >
                <option value="">Loc...</option>
                {allLocations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>

            {/* Reference Shot Selector */}
            <div className="flex-1 flex items-center gap-2">
              <Link className="w-3 h-3 text-neutral-500" />
              <select
                className="w-full bg-neutral-800 text-xs text-neutral-300 border border-neutral-700 rounded px-2 py-1 outline-none hover:border-neutral-500 transition-colors"
                value={shot.referenceShotId || ""}
                onChange={(e) => onUpdate(shot.id, { referenceShotId: e.target.value })}
              >
                <option value="">No Ref</option>
                {allShots.filter(s => s.id !== shot.id).map(s => (
                  <option key={s.id} value={s.id}>#{s.number}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Character Selector */}
          <div className="flex items-start gap-2">
            <Users className="w-3 h-3 text-neutral-500 mt-1.5" />
            <div className="flex-1 flex flex-wrap gap-1">
              {allCharacters.map(char => (
                <button
                  key={char.id}
                  onClick={() => toggleCharacter(char.id)}
                  className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${shot.characters.includes(char.id)
                    ? 'bg-neutral-700 border-neutral-600 text-white'
                    : 'bg-transparent border-neutral-800 text-neutral-600 hover:border-neutral-600'
                    }`}
                >
                  {char.name}
                </button>
              ))}
              {allCharacters.length === 0 && <span className="text-[10px] text-neutral-600 italic">No characters available</span>}
            </div>
          </div>

        </div>

        {/* RESTORED: Fully Interactive Dialogue Editor */}
        <div className="p-3 bg-neutral-900 border-t border-neutral-800/50 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-3 h-3 text-neutral-500" />
              <span className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold">Dialogue</span>
            </div>
            <button
              onClick={handleAddDialogue}
              className="text-[10px] text-neutral-400 hover:text-white flex items-center gap-1 bg-neutral-800 hover:bg-neutral-700 px-1.5 py-0.5 rounded transition-colors"
            >
              <Plus className="w-2.5 h-2.5" /> Add
            </button>
          </div>

          {/* List of Dialogue Lines */}
          <div className="space-y-2">
            {shot.dialogueLines?.map(line => (
              <div key={line.id} className="flex flex-col gap-1 bg-black/20 p-1.5 rounded border border-neutral-800 hover:border-neutral-700 transition-colors group/line">
                <div className="flex justify-between items-center gap-1">
                  <select
                    className="bg-transparent text-[10px] text-neutral-400 uppercase font-bold outline-none cursor-pointer hover:text-white transition-colors max-w-[120px]"
                    value={line.speakerId || ""}
                    onChange={(e) => handleUpdateDialogue(line.id, { speakerId: e.target.value })}
                  >
                    <option value="">Speaker</option>
                    {allCharacters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button onClick={() => handleDeleteDialogue(line.id)} className="text-neutral-600 hover:text-red-500 p-0.5 opacity-0 group-hover/line:opacity-100 transition-all">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
                <input
                  className="bg-transparent text-xs text-neutral-300 font-mono w-full outline-none placeholder-neutral-700"
                  value={line.text}
                  onChange={(e) => handleUpdateDialogue(line.id, { text: e.target.value })}
                  placeholder="Dialogue..."
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
