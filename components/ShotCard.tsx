
import React, { useState, useRef, useEffect } from 'react';
import { Shot, Character, Location, ImageHistoryEntry, ChatMessage } from '../types';
import { Camera, RefreshCw, SendHorizontal, MessageSquare, MapPin, Users, Edit3, Trash2, Upload, Download, Maximize2, Wand2, Plus, X, Link, Copy, Focus, History, RotateCcw, MonitorPlay, ArrowUpFromLine, MessageCircle, ImageIcon } from 'lucide-react';
import { Button } from './Button';
import { ASPECT_RATIOS, COMPOSITION_TECHNIQUES } from '../constants';
import { AspectRatio, CompositionTechnique } from '../types';

// Convert aspect ratio string to numeric value for CSS
const getAspectRatioValue = (ratio: string): string => {
  const map: Record<string, string> = {
    '1:1': '1/1', '2:3': '2/3', '3:2': '3/2', '3:4': '3/4', '4:3': '4/3',
    '4:5': '4/5', '5:4': '5/4', '9:16': '9/16', '16:9': '16/9', '21:9': '21/9',
    '2.39:1': '2.39/1',
  };
  return map[ratio] || '16/9';
};

// Decide whether the ratio is taller than it is wide (portrait).
// Portrait ratios make the card explode vertically when sized by full column
// width, so we drive sizing from a capped height instead.
const isPortraitRatio = (ratio: string): boolean => {
  const v = getAspectRatioValue(ratio);
  const [w, h] = v.split('/').map(Number);
  return Number.isFinite(w) && Number.isFinite(h) && h > w;
};

interface ShotCardProps {
  shot: Shot;
  sceneName?: string;
  allCharacters: Character[];
  allLocations: Location[];
  allShots: Shot[];
  aspectRatio?: AspectRatio;
  onAspectRatioChange?: (ratio: string) => void;
  onGenerate: (id: string) => void;
  onAlter: (id: string) => void;
  onEditImage: (id: string, prompt: string) => void;
  onUpdate: (id: string, updates: Partial<Shot>) => void;
  onDelete: (id: string) => void;
  onUpload: (id: string, file: File) => void;
  onExpand: (id: string) => void;
  onDuplicate: (id: string) => void;
  onUpscale?: (id: string) => void;
  onCoverageFromImage?: (id: string) => void;
  onRestoreFromHistory?: (shotId: string, entry: ImageHistoryEntry) => void;
  onChatEdit?: (shotId: string, prompt: string) => void;
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
  onUpscale,
  onCoverageFromImage,
  onRestoreFromHistory,
  onChatEdit,
  isCoverageGenerating,
  aspectRatio,
  onAspectRatioChange
}) => {
  const [editPrompt, setEditPrompt] = useState('');
  const [chatPrompt, setChatPrompt] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    if (chatScrollRef.current && showChat) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [shot.chatHistory, showChat]);

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

  // Compute the visual area sizing once per render.
  // Portrait ratios (9:16, 2:3, 3:4, 4:5) are capped by HEIGHT so the card
  // doesn't explode vertically when the column is wide.
  // Landscape / square ratios fill column WIDTH (with a safety max-height).
  const _ratio = aspectRatio || '16:9';
  const _ratioValue = getAspectRatioValue(_ratio);
  const _portrait = isPortraitRatio(_ratio);
  const _visualStyle: React.CSSProperties = _portrait
    ? { aspectRatio: _ratioValue, height: 'min(60vh, 560px)', width: 'auto', maxWidth: '100%' }
    : { aspectRatio: _ratioValue, width: '100%', maxHeight: 'min(70vh, 720px)' };

  return (
    <div className="group bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden flex flex-col h-full hover:border-neutral-600 transition-colors shadow-lg">

      {/* 1. VISUAL AREA — dynamic aspect ratio (height-capped for portrait) */}
      <div className={`relative bg-black overflow-hidden ${_portrait ? 'mx-auto' : 'w-full'}`} style={_visualStyle}>

        {/* Aspect Ratio Selector — bottom-left of image window */}
        {onAspectRatioChange && (
          <div className="absolute bottom-2 left-2 z-20">
            <select
              value={aspectRatio || '16:9'}
              onChange={(e) => { e.stopPropagation(); onAspectRatioChange(e.target.value); }}
              onClick={(e) => e.stopPropagation()}
              className="bg-neutral-900/80 backdrop-blur text-[10px] text-neutral-300 border border-neutral-700 rounded px-1.5 py-0.5 outline-none hover:border-neutral-500 hover:text-white transition-colors cursor-pointer appearance-none pr-4"
              title="Aspect Ratio — changes the frame shape"
              style={{ backgroundImage: 'none' }}
            >
              {ASPECT_RATIOS.map(ar => (
                <option key={ar.value} value={ar.value}>{ar.value}</option>
              ))}
            </select>
          </div>
        )}
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

          {/* Upscale + Coverage row */}
          {shot.imageUrl && (
            <div className="flex gap-2 w-full max-w-xs mt-1">
              {onUpscale && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onUpscale(shot.id)}
                  isLoading={shot.isUpscaling}
                  className="flex-1"
                  title="Upscale image to 4K resolution"
                >
                  <ArrowUpFromLine className="w-3 h-3 mr-1" /> 4K
                </Button>
              )}
              {onCoverageFromImage && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onCoverageFromImage(shot.id)}
                  isLoading={isCoverageGenerating}
                  className="flex-1"
                  title="Generate 8 coverage shots using this image as reference"
                >
                  <Focus className="w-3 h-3 mr-1" /> Coverage
                </Button>
              )}
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
        {(shot.isGenerating || shot.isEditing || shot.isAltering || shot.isUpscaling) && (
          <div className={`absolute top-2 right-2 text-white text-[10px] uppercase font-bold px-2 py-1 rounded-full animate-pulse z-20 ${shot.isUpscaling ? 'bg-blue-600' : 'bg-red-600'}`}>
            {shot.isEditing ? "Editing" : shot.isAltering ? "Altering" : shot.isUpscaling ? "Upscaling 4K" : "Rendering"}
          </div>
        )}

        {/* Reference Indicator */}
        {shot.referenceShotId && (
          <div className="absolute bottom-2 right-2 bg-neutral-900/80 backdrop-blur text-white text-[10px] px-2 py-1 rounded flex items-center gap-1 border border-neutral-700">
            <Link className="w-3 h-3 text-blue-400" />
            Ref: #{allShots.find(s => s.id === shot.referenceShotId)?.number}
          </div>
        )}

        {/* History Badge - Click to toggle history panel */}
        {shot.imageHistory && shot.imageHistory.length > 0 && (
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`absolute top-2 left-2 z-20 px-2 py-1 rounded flex items-center gap-1 text-[10px] transition-all ${showHistory
              ? 'bg-blue-600 text-white'
              : 'bg-neutral-900/80 backdrop-blur text-neutral-400 hover:text-white border border-neutral-700'
              }`}
            title={`${shot.imageHistory.length} previous version${shot.imageHistory.length > 1 ? 's' : ''}`}
          >
            <History className="w-3 h-3" />
            {shot.imageHistory.length}
          </button>
        )}

        {/* History Panel - Shows previous versions */}
        {showHistory && shot.imageHistory && shot.imageHistory.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 bg-neutral-900/95 backdrop-blur-md border-t border-neutral-700 z-30 p-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold flex items-center gap-1">
                <History className="w-3 h-3" /> Version History
              </span>
              <button
                onClick={() => setShowHistory(false)}
                className="text-neutral-500 hover:text-white p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
              {[...shot.imageHistory].reverse().map((entry, idx) => (
                <div
                  key={entry.id}
                  className="relative flex-shrink-0 group/history cursor-pointer"
                  onClick={() => {
                    if (onRestoreFromHistory) {
                      onRestoreFromHistory(shot.id, entry);
                      setShowHistory(false);
                    }
                  }}
                  title={`${new Date(entry.timestamp).toLocaleString()} - ${entry.source}`}
                >
                  <img
                    src={entry.imageUrl}
                    alt={`Version ${shot.imageHistory!.length - idx}`}
                    className="w-16 h-10 object-cover rounded border border-neutral-700 hover:border-blue-500 transition-colors"
                  />
                  {/* Restore overlay */}
                  <div className="absolute inset-0 bg-blue-600/80 opacity-0 group-hover/history:opacity-100 transition-opacity flex items-center justify-center rounded">
                    <RotateCcw className="w-3 h-3 text-white" />
                  </div>
                  {/* Source badge */}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-[8px] text-center text-neutral-300 rounded-b py-0.5">
                    {entry.source === 'generate' ? 'Gen' : entry.source === 'alter' ? 'Alt' : entry.source === 'edit' ? 'Edit' : 'Up'}
                  </div>
                </div>
              ))}
            </div>
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
            <select
              className="bg-transparent text-xs text-neutral-500 uppercase font-medium tracking-wide outline-none text-right hover:text-neutral-300 transition-colors max-w-[100px]"
              value={shot.composition || 'None'}
              onChange={(e) => onUpdate(shot.id, { composition: e.target.value as CompositionTechnique })}
              title="Composition technique — guides visual arrangement"
            >
              {COMPOSITION_TECHNIQUES.map(ct => (
                <option key={ct.value} value={ct.value} title={ct.description}>{ct.label}</option>
              ))}
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

          {/* Reference Images */}
          <div className="flex items-start gap-2">
            <ImageIcon className="w-3 h-3 text-neutral-500 mt-1.5" />
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold">Ref Photos</span>
                <label className="text-[10px] text-neutral-400 hover:text-white flex items-center gap-1 bg-neutral-800 hover:bg-neutral-700 px-1.5 py-0.5 rounded transition-colors cursor-pointer">
                  <Plus className="w-2.5 h-2.5" /> Add
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (!e.target.files) return;
                      const files = Array.from(e.target.files) as File[];
                      files.forEach((file: File) => {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          const base64 = reader.result as string;
                          const current = shot.referenceImages || [];
                          onUpdate(shot.id, { referenceImages: [...current, base64] });
                        };
                        reader.readAsDataURL(file);
                      });
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
              {shot.referenceImages && shot.referenceImages.length > 0 ? (
                <div className="flex gap-1.5 flex-wrap">
                  {shot.referenceImages.map((img, idx) => (
                    <div key={idx} className="relative group/ref flex-shrink-0">
                      <img
                        src={img}
                        alt={`Ref ${idx + 1}`}
                        className="w-12 h-12 object-cover rounded border border-neutral-700 hover:border-blue-500 transition-colors"
                      />
                      <button
                        onClick={() => {
                          const updated = shot.referenceImages!.filter((_, i) => i !== idx);
                          onUpdate(shot.id, { referenceImages: updated });
                        }}
                        className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full p-0.5 opacity-0 group-hover/ref:opacity-100 transition-opacity"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-[10px] text-neutral-600 italic">No reference photos — add images to guide generation</span>
              )}
            </div>
          </div>

          {/* Compose: Scene Reference + Character Reference */}
          <div className="mt-2 rounded border border-dashed border-neutral-700 bg-neutral-950/40 p-2 space-y-2">
            <div className="flex items-center gap-1 mb-1">
              <span className="text-[10px] text-amber-500 uppercase tracking-widest font-bold">⚡ Compose</span>
              <span className="text-[10px] text-neutral-500">— place a character into a scene</span>
            </div>

            {/* Scene Reference */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-neutral-400 w-16 flex-shrink-0">Scene</span>
              {shot.sceneReferenceImage ? (
                <div className="relative group/scene flex-shrink-0">
                  <img
                    src={shot.sceneReferenceImage}
                    alt="Scene Reference"
                    className="w-16 h-10 object-cover rounded border border-amber-600/60 hover:border-amber-400 transition-colors"
                    title="Scene/background reference"
                  />
                  <button
                    onClick={() => onUpdate(shot.id, { sceneReferenceImage: undefined })}
                    className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full p-0.5 opacity-0 group-hover/scene:opacity-100 transition-opacity"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center gap-1 text-[10px] text-neutral-500 hover:text-amber-400 bg-neutral-800 hover:bg-neutral-700 px-2 py-1 rounded transition-colors cursor-pointer border border-neutral-700 hover:border-amber-600/50">
                  <Upload className="w-2.5 h-2.5" /> Upload Background
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onloadend = () => onUpdate(shot.id, { sceneReferenceImage: reader.result as string });
                      reader.readAsDataURL(file);
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
              <span className="text-[10px] text-neutral-600 italic">environment / bg</span>
            </div>

            {/* Character Reference */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-neutral-400 w-16 flex-shrink-0">Character</span>
              {shot.characterReferenceImage ? (
                <div className="relative group/char flex-shrink-0">
                  <img
                    src={shot.characterReferenceImage}
                    alt="Character Reference"
                    className="w-10 h-14 object-cover rounded border border-blue-600/60 hover:border-blue-400 transition-colors"
                    title="Character reference photo"
                  />
                  <button
                    onClick={() => onUpdate(shot.id, { characterReferenceImage: undefined })}
                    className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full p-0.5 opacity-0 group-hover/char:opacity-100 transition-opacity"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center gap-1 text-[10px] text-neutral-500 hover:text-blue-400 bg-neutral-800 hover:bg-neutral-700 px-2 py-1 rounded transition-colors cursor-pointer border border-neutral-700 hover:border-blue-600/50">
                  <Upload className="w-2.5 h-2.5" /> Upload Character
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onloadend = () => onUpdate(shot.id, { characterReferenceImage: reader.result as string });
                      reader.readAsDataURL(file);
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
              <span className="text-[10px] text-neutral-600 italic">person / actor</span>
            </div>

            {(shot.sceneReferenceImage || shot.characterReferenceImage) && (
              <p className="text-[9px] text-amber-500/70 italic">
                {shot.sceneReferenceImage && shot.characterReferenceImage
                  ? '✓ Both refs set — Gemini will place the character into the scene on Generate'
                  : shot.sceneReferenceImage
                    ? 'Scene ref set — add a character photo to enable compose mode'
                    : 'Character ref set — add a background photo to enable compose mode'}
              </p>
            )}
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

        {/* Refine Chat Toggle + Panel */}
        {shot.imageUrl && onChatEdit && (
          <>
            <button
              onClick={() => setShowChat(!showChat)}
              className={`w-full py-2 flex items-center justify-center gap-2 text-xs transition-colors border-t border-neutral-800 ${showChat
                ? 'bg-purple-900/20 text-purple-400 hover:bg-purple-900/30'
                : 'bg-neutral-950/50 text-neutral-500 hover:text-white hover:bg-neutral-800'
                }`}
            >
              <MessageCircle className="w-3 h-3" />
              {showChat ? 'Hide Refine Chat' : `Refine Chat${shot.chatHistory?.length ? ` (${Math.floor((shot.chatHistory.length) / 2)} edits)` : ''}`}
            </button>

            {showChat && (
              <div className="border-t border-neutral-800 bg-neutral-950/50">
                {/* Chat Messages */}
                <div
                  ref={chatScrollRef}
                  className="max-h-48 overflow-y-auto custom-scrollbar p-3 space-y-2"
                >
                  {(!shot.chatHistory || shot.chatHistory.length === 0) && (
                    <div className="text-center py-4 text-neutral-600 text-xs">
                      <MessageCircle className="w-6 h-6 mx-auto mb-2 opacity-30" />
                      Type an instruction to iteratively refine this image.<br />
                      Each edit builds on the previous result.
                    </div>
                  )}
                  {shot.chatHistory?.map(msg => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[85%] rounded-lg px-3 py-1.5 text-xs ${msg.role === 'user'
                        ? 'bg-purple-900/40 text-purple-200 border border-purple-800/50'
                        : 'bg-neutral-800 text-green-400 border border-neutral-700'
                        }`}
                      >
                        {msg.role === 'user' ? (
                          <span>{msg.text}</span>
                        ) : (
                          <span className="flex items-center gap-1">✓ Applied</span>
                        )}
                      </div>
                    </div>
                  ))}
                  {shot.isChatEditing && (
                    <div className="flex justify-start">
                      <div className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-neutral-400 flex items-center gap-2">
                        <div className="w-3 h-3 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                        Refining image...
                      </div>
                    </div>
                  )}
                </div>

                {/* Chat Input */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (chatPrompt.trim() && !shot.isChatEditing) {
                      onChatEdit(shot.id, chatPrompt);
                      setChatPrompt('');
                    }
                  }}
                  className="p-2 border-t border-neutral-800 flex gap-2"
                >
                  <input
                    type="text"
                    value={chatPrompt}
                    onChange={(e) => setChatPrompt(e.target.value)}
                    placeholder="e.g. Make the lighting warmer..."
                    disabled={shot.isChatEditing}
                    className="flex-1 px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-xs text-white placeholder-neutral-600 focus:border-purple-600 focus:ring-1 focus:ring-purple-600 outline-none disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={!chatPrompt.trim() || shot.isChatEditing}
                    className="bg-purple-600 hover:bg-purple-500 text-white px-3 py-2 rounded-lg disabled:opacity-50 disabled:hover:bg-purple-600 transition-colors flex items-center"
                  >
                    <SendHorizontal className="w-3 h-3" />
                  </button>
                </form>

                {/* Clear Chat Button */}
                {shot.chatHistory && shot.chatHistory.length > 0 && (
                  <div className="px-3 pb-2 flex justify-end">
                    <button
                      onClick={() => onUpdate(shot.id, { chatHistory: [] })}
                      className="text-[10px] text-neutral-600 hover:text-red-400 transition-colors"
                    >
                      Clear history
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
