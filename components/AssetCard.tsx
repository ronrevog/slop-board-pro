
import React, { useState, useRef, useEffect } from 'react';
import { Character, Location, TurnaroundImage } from '../types';
import { RefreshCw, Sparkles, SendHorizontal, Upload, Trash2, Wand2, ImagePlus, Download, ChevronDown, ChevronUp, User, Clock, Cloud, Palette, Volume2, Lightbulb, Shirt, Brain, Mic, Briefcase, Maximize2, X, RotateCcw, Settings2, RotateCw, CheckSquare, Square } from 'lucide-react';
import { Button } from './Button';

interface AssetCardProps {
  item: Character | Location;
  type: 'Character' | 'Location';
  onGenerate: (id: string) => void;
  onEdit: (id: string, prompt: string) => void;
  onUpload: (id: string, file: File) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Character | Location>) => void;
  onUpdateWithDetails: (id: string) => void;
  onResetToOriginal: (id: string) => void;
  onGenerateTurnaround?: (id: string) => void;
  onToggleTurnaroundRef?: (assetId: string, turnaroundId: string) => void;
}

export const AssetCard: React.FC<AssetCardProps> = ({
  item,
  type,
  onGenerate,
  onEdit,
  onUpload,
  onDelete,
  onUpdate,
  onUpdateWithDetails,
  onResetToOriginal,
  onGenerateTurnaround,
  onToggleTurnaroundRef
}) => {
  const [editPrompt, setEditPrompt] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
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
      onEdit(item.id, editPrompt);
      setEditPrompt('');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUpload(item.id, e.target.files[0]);
    }
  };

  const triggerUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleDownload = () => {
    if (!item.imageUrl) return;
    const link = document.createElement('a');
    link.href = item.imageUrl;
    link.download = `${item.name.replace(/\s+/g, '-').toLowerCase()}-${type.toLowerCase()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDeleteClick = () => {
    if (deleteConfirm) {
      onDelete(item.id);
    } else {
      setDeleteConfirm(true);
    }
  };

  // Cast item to Character or Location for type-specific fields
  const characterItem = type === 'Character' ? (item as Character) : null;
  const locationItem = type === 'Location' ? (item as Location) : null;

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden hover:border-neutral-600 transition-all shadow-sm flex flex-col">

      {/* Main Row */}
      <div className="flex flex-row h-52">
        {/* Image Area - Fixed Width */}
        <div className="relative w-52 bg-black flex-shrink-0 border-r border-neutral-800 group h-full">

          {item.imageUrl ? (
            <>
              <img
                src={item.imageUrl}
                alt={item.name}
                className="w-full h-full object-cover transition-opacity duration-300 group-hover:opacity-50"
              />

              {/* Expand button - top left */}
              <button
                onClick={() => setShowLightbox(true)}
                className="absolute top-2 left-2 p-2 bg-black/60 hover:bg-black text-white rounded-full opacity-0 group-hover:opacity-100 transition-all z-10"
                title="View full size"
              >
                <Maximize2 className="w-4 h-4" />
              </button>

              {/* Overlay Actions (Visible on Hover) */}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => onGenerate(item.id)}
                  isLoading={item.isGenerating}
                  className="w-full shadow-lg"
                >
                  <RefreshCw className="w-3 h-3 mr-2" /> Regenerate
                </Button>

                <div className="flex gap-2 w-full">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={triggerUpload}
                    className="flex-1 shadow-lg bg-neutral-800/90 backdrop-blur"
                  >
                    <Upload className="w-3 h-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleDownload}
                    className="flex-1 shadow-lg bg-neutral-800/90 backdrop-blur"
                  >
                    <Download className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            /* Empty State */
            <div className="flex flex-col h-full p-3">
              <div className="flex-1 flex flex-col items-center justify-center text-neutral-600 space-y-2">
                <div className="w-10 h-10 rounded-full bg-neutral-900 flex items-center justify-center border border-neutral-800">
                  {type === 'Character' ? <Sparkles className="w-5 h-5 text-neutral-700" /> : <ImagePlus className="w-5 h-5 text-neutral-700" />}
                </div>
                <span className="text-[10px] uppercase tracking-widest font-medium">No Visual</span>
              </div>

              {/* Actions Grid */}
              <div className="grid grid-cols-2 gap-2 mt-auto">
                <button
                  onClick={() => onGenerate(item.id)}
                  disabled={item.isGenerating}
                  className="flex flex-col items-center justify-center p-2 bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-300 transition-colors border border-neutral-700 hover:border-neutral-600"
                >
                  {item.isGenerating ? (
                    <div className="w-4 h-4 border-2 border-neutral-500 border-t-white rounded-full animate-spin mb-1"></div>
                  ) : (
                    <Wand2 className="w-4 h-4 mb-1 text-red-500" />
                  )}
                  <span className="text-[9px] uppercase font-bold">AI Gen</span>
                </button>

                <button
                  onClick={triggerUpload}
                  className="flex flex-col items-center justify-center p-2 bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-300 transition-colors border border-neutral-700 hover:border-neutral-600"
                >
                  <Upload className="w-4 h-4 mb-1 text-neutral-400" />
                  <span className="text-[9px] uppercase font-bold">Upload</span>
                </button>
              </div>
            </div>
          )}

          {/* Status Badge */}
          {(item.isGenerating || item.isEditing) && (
            <div className="absolute top-2 right-2 bg-red-600 text-white text-[10px] uppercase font-bold px-2 py-1 rounded-full animate-pulse z-20 shadow-md">
              {item.isEditing ? "Editing" : "Rendering"}
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

        {/* Info / Edit Area */}
        <div className="p-5 flex-1 flex flex-col gap-3 overflow-hidden">
          <div className="flex justify-between items-start gap-4">
            <input
              className="bg-transparent text-xl font-serif font-bold text-white border-b border-transparent hover:border-neutral-700 focus:border-red-600 focus:outline-none w-full pb-1 transition-colors"
              value={item.name}
              onChange={(e) => onUpdate(item.id, { name: e.target.value })}
              placeholder={`${type} Name`}
            />
            <button
              onClick={handleDeleteClick}
              className={`transition-colors p-1 ${deleteConfirm ? 'text-red-600 animate-pulse font-bold' : 'text-neutral-600 hover:text-red-500'}`}
              title={deleteConfirm ? "Click again to confirm" : "Delete"}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <textarea
            className="bg-neutral-950/30 text-sm text-neutral-400 w-full resize-none border border-transparent hover:border-neutral-800 focus:border-neutral-700 rounded-md p-2 focus:outline-none flex-1 transition-all"
            value={item.description}
            onChange={(e) => onUpdate(item.id, { description: e.target.value })}
            placeholder="Visual description..."
          />

          {/* Edit Image Input */}
          {item.imageUrl && !item.isGenerating && !item.isEditing && (
            <form onSubmit={handleEditSubmit} className="mt-auto pt-2 flex gap-2">
              <div className="relative flex-1 group/input">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Sparkles className="h-3 w-3 text-neutral-500 group-focus-within/input:text-red-500 transition-colors" />
                </div>
                <input
                  type="text"
                  value={editPrompt}
                  onChange={(e) => setEditPrompt(e.target.value)}
                  placeholder={`Modify image with AI...`}
                  className="block w-full pl-9 pr-3 py-2 bg-neutral-950 border border-neutral-800 rounded-md text-xs text-neutral-200 placeholder-neutral-600 focus:ring-1 focus:ring-red-600 focus:border-red-600 transition-all outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={!editPrompt.trim()}
                className="bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-1 rounded-md disabled:opacity-50 transition-colors flex items-center justify-center border border-neutral-700"
              >
                <SendHorizontal className="w-3 h-3" />
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Expand/Collapse Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full py-2 flex items-center justify-center gap-2 text-xs text-neutral-500 hover:text-white bg-neutral-950/50 hover:bg-neutral-800 border-t border-neutral-800 transition-colors"
      >
        {isExpanded ? (
          <>
            <ChevronUp className="w-3 h-3" /> Hide Details
          </>
        ) : (
          <>
            <ChevronDown className="w-3 h-3" /> Show Details
          </>
        )}
      </button>

      {/* Expanded Details Section */}
      {isExpanded && (
        <div className="border-t border-neutral-800 p-5 bg-neutral-950/30 animate-fade-in">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {type === 'Character' && characterItem && (
              <>
                {/* Age */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold flex items-center gap-1">
                    <User className="w-3 h-3" /> Age
                  </label>
                  <input
                    type="text"
                    value={characterItem.age || ''}
                    onChange={(e) => onUpdate(item.id, { age: e.target.value })}
                    placeholder="e.g. 30s, elderly"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-sm text-white placeholder-neutral-600 focus:border-red-600 focus:outline-none"
                  />
                </div>

                {/* Occupation */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold flex items-center gap-1">
                    <Briefcase className="w-3 h-3" /> Occupation
                  </label>
                  <input
                    type="text"
                    value={characterItem.occupation || ''}
                    onChange={(e) => onUpdate(item.id, { occupation: e.target.value })}
                    placeholder="e.g. Detective, Teacher"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-sm text-white placeholder-neutral-600 focus:border-red-600 focus:outline-none"
                  />
                </div>

                {/* Wardrobe */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold flex items-center gap-1">
                    <Shirt className="w-3 h-3" /> Wardrobe
                  </label>
                  <input
                    type="text"
                    value={characterItem.wardrobe || ''}
                    onChange={(e) => onUpdate(item.id, { wardrobe: e.target.value })}
                    placeholder="e.g. Leather jacket, suit"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-sm text-white placeholder-neutral-600 focus:border-red-600 focus:outline-none"
                  />
                </div>

                {/* Physical Features */}
                <div className="space-y-1 col-span-2">
                  <label className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold flex items-center gap-1">
                    <User className="w-3 h-3" /> Physical Features
                  </label>
                  <input
                    type="text"
                    value={characterItem.physicalFeatures || ''}
                    onChange={(e) => onUpdate(item.id, { physicalFeatures: e.target.value })}
                    placeholder="e.g. Scar on left cheek, tall and slender"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-sm text-white placeholder-neutral-600 focus:border-red-600 focus:outline-none"
                  />
                </div>

                {/* Personality */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold flex items-center gap-1">
                    <Brain className="w-3 h-3" /> Personality
                  </label>
                  <input
                    type="text"
                    value={characterItem.personality || ''}
                    onChange={(e) => onUpdate(item.id, { personality: e.target.value })}
                    placeholder="e.g. Stoic, nervous"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-sm text-white placeholder-neutral-600 focus:border-red-600 focus:outline-none"
                  />
                </div>

                {/* Voice Notes */}
                <div className="space-y-1 col-span-2">
                  <label className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold flex items-center gap-1">
                    <Mic className="w-3 h-3" /> Voice / Acting Notes
                  </label>
                  <input
                    type="text"
                    value={characterItem.voiceNotes || ''}
                    onChange={(e) => onUpdate(item.id, { voiceNotes: e.target.value })}
                    placeholder="e.g. Deep voice, speaks slowly, Brooklyn accent"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-sm text-white placeholder-neutral-600 focus:border-red-600 focus:outline-none"
                  />
                </div>
              </>
            )}

            {type === 'Location' && locationItem && (
              <>
                {/* Time of Day */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Time of Day
                  </label>
                  <input
                    type="text"
                    value={locationItem.timeOfDay || ''}
                    onChange={(e) => onUpdate(item.id, { timeOfDay: e.target.value })}
                    placeholder="e.g. Dawn, Golden hour"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-sm text-white placeholder-neutral-600 focus:border-red-600 focus:outline-none"
                  />
                </div>

                {/* Weather */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold flex items-center gap-1">
                    <Cloud className="w-3 h-3" /> Weather
                  </label>
                  <input
                    type="text"
                    value={locationItem.weather || ''}
                    onChange={(e) => onUpdate(item.id, { weather: e.target.value })}
                    placeholder="e.g. Overcast, heavy rain"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-sm text-white placeholder-neutral-600 focus:border-red-600 focus:outline-none"
                  />
                </div>

                {/* Atmosphere */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold flex items-center gap-1">
                    <Palette className="w-3 h-3" /> Atmosphere / Mood
                  </label>
                  <input
                    type="text"
                    value={locationItem.atmosphere || ''}
                    onChange={(e) => onUpdate(item.id, { atmosphere: e.target.value })}
                    placeholder="e.g. Tense, romantic"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-sm text-white placeholder-neutral-600 focus:border-red-600 focus:outline-none"
                  />
                </div>

                {/* Key Props */}
                <div className="space-y-1 col-span-2">
                  <label className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold flex items-center gap-1">
                    <ImagePlus className="w-3 h-3" /> Key Props
                  </label>
                  <input
                    type="text"
                    value={locationItem.keyProps || ''}
                    onChange={(e) => onUpdate(item.id, { keyProps: e.target.value })}
                    placeholder="e.g. Old typewriter, vintage car, broken mirror"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-sm text-white placeholder-neutral-600 focus:border-red-600 focus:outline-none"
                  />
                </div>

                {/* Sound Ambience */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold flex items-center gap-1">
                    <Volume2 className="w-3 h-3" /> Sound / Ambience
                  </label>
                  <input
                    type="text"
                    value={locationItem.soundAmbience || ''}
                    onChange={(e) => onUpdate(item.id, { soundAmbience: e.target.value })}
                    placeholder="e.g. City traffic, forest birds"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-sm text-white placeholder-neutral-600 focus:border-red-600 focus:outline-none"
                  />
                </div>

                {/* Practical Lighting */}
                <div className="space-y-1 col-span-2">
                  <label className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold flex items-center gap-1">
                    <Lightbulb className="w-3 h-3" /> Practical Lighting
                  </label>
                  <input
                    type="text"
                    value={locationItem.practicalLighting || ''}
                    onChange={(e) => onUpdate(item.id, { practicalLighting: e.target.value })}
                    placeholder="e.g. Neon signs, fireplace, street lamps"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-sm text-white placeholder-neutral-600 focus:border-red-600 focus:outline-none"
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Expanded Editor Modal */}
      {showLightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm animate-fade-in overflow-y-auto p-6"
          onClick={() => setShowLightbox(false)}
        >
          <div
            className="bg-neutral-900 rounded-xl border border-neutral-700 shadow-2xl max-w-5xl w-full max-h-[95vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-neutral-800 sticky top-0 bg-neutral-900 z-10">
              <div>
                <input
                  className="bg-transparent text-2xl font-serif font-bold text-white border-b border-transparent hover:border-neutral-700 focus:border-red-600 focus:outline-none w-full pb-1 transition-colors"
                  value={item.name}
                  onChange={(e) => onUpdate(item.id, { name: e.target.value })}
                  placeholder={`${type} Name`}
                />
                <p className="text-sm text-neutral-500 mt-1">{type} Details</p>
              </div>
              <button
                onClick={() => setShowLightbox(false)}
                className="p-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-full transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex flex-col md:flex-row">
              {/* Image Section */}
              <div className="md:w-1/2 p-6 border-b md:border-b-0 md:border-r border-neutral-800">
                <div className="relative bg-black rounded-lg overflow-hidden group min-h-[200px] flex items-center justify-center">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="max-w-full max-h-[60vh] object-contain"
                    />
                  ) : (
                    <div className="w-full h-64 flex flex-col items-center justify-center text-neutral-600">
                      <ImagePlus className="w-16 h-16 mb-4 opacity-50" />
                      <span className="text-sm">No image generated</span>
                    </div>
                  )}
                </div>

                {/* Image Action Buttons */}
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => onGenerate(item.id)}
                    isLoading={item.isGenerating}
                    className="w-full"
                  >
                    <Wand2 className="w-4 h-4 mr-2" />
                    {item.imageUrl ? 'Regenerate' : 'Generate'}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={triggerUpload}
                    className="w-full"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Upload
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleDownload}
                    disabled={!item.imageUrl}
                    className="w-full"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                </div>

                {/* AI Edit Input */}
                {item.imageUrl && !item.isGenerating && !item.isEditing && (
                  <form onSubmit={handleEditSubmit} className="mt-4 flex gap-2">
                    <div className="relative flex-1">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Sparkles className="h-4 w-4 text-neutral-500" />
                      </div>
                      <input
                        type="text"
                        value={editPrompt}
                        onChange={(e) => setEditPrompt(e.target.value)}
                        placeholder="Modify image with AI..."
                        className="block w-full pl-10 pr-3 py-3 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-neutral-200 placeholder-neutral-600 focus:ring-1 focus:ring-red-600 focus:border-red-600 outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={!editPrompt.trim()}
                      className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
                    >
                      <SendHorizontal className="w-4 h-4" />
                    </button>
                  </form>
                )}

                {item.isEditing && (
                  <div className="mt-4 flex items-center justify-center gap-2 text-amber-500 py-3">
                    <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-sm font-medium">Editing image...</span>
                  </div>
                )}
              </div>

              {/* Details Section */}
              <div className="md:w-1/2 p-6 space-y-6">
                {/* Description */}
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wider text-neutral-500 font-bold">
                    Visual Description
                  </label>
                  <textarea
                    className="w-full h-28 bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-sm text-white placeholder-neutral-600 focus:border-red-600 focus:outline-none resize-none"
                    value={item.description}
                    onChange={(e) => onUpdate(item.id, { description: e.target.value })}
                    placeholder="Detailed visual description..."
                  />
                </div>

                {/* Character Fields */}
                {type === 'Character' && characterItem && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs uppercase tracking-wider text-neutral-500 font-bold flex items-center gap-1">
                        <User className="w-3 h-3" /> Age
                      </label>
                      <input
                        type="text"
                        value={characterItem.age || ''}
                        onChange={(e) => onUpdate(item.id, { age: e.target.value })}
                        placeholder="e.g. 30s, elderly"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:border-red-600 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs uppercase tracking-wider text-neutral-500 font-bold flex items-center gap-1">
                        <Briefcase className="w-3 h-3" /> Occupation
                      </label>
                      <input
                        type="text"
                        value={characterItem.occupation || ''}
                        onChange={(e) => onUpdate(item.id, { occupation: e.target.value })}
                        placeholder="e.g. Detective"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:border-red-600 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs uppercase tracking-wider text-neutral-500 font-bold flex items-center gap-1">
                        <Shirt className="w-3 h-3" /> Wardrobe
                      </label>
                      <input
                        type="text"
                        value={characterItem.wardrobe || ''}
                        onChange={(e) => onUpdate(item.id, { wardrobe: e.target.value })}
                        placeholder="e.g. Leather jacket"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:border-red-600 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs uppercase tracking-wider text-neutral-500 font-bold flex items-center gap-1">
                        <Brain className="w-3 h-3" /> Personality
                      </label>
                      <input
                        type="text"
                        value={characterItem.personality || ''}
                        onChange={(e) => onUpdate(item.id, { personality: e.target.value })}
                        placeholder="e.g. Stoic, nervous"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:border-red-600 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <label className="text-xs uppercase tracking-wider text-neutral-500 font-bold flex items-center gap-1">
                        <User className="w-3 h-3" /> Physical Features
                      </label>
                      <input
                        type="text"
                        value={characterItem.physicalFeatures || ''}
                        onChange={(e) => onUpdate(item.id, { physicalFeatures: e.target.value })}
                        placeholder="e.g. Scar on left cheek, tall and slender"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:border-red-600 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <label className="text-xs uppercase tracking-wider text-neutral-500 font-bold flex items-center gap-1">
                        <Mic className="w-3 h-3" /> Voice / Acting Notes
                      </label>
                      <input
                        type="text"
                        value={characterItem.voiceNotes || ''}
                        onChange={(e) => onUpdate(item.id, { voiceNotes: e.target.value })}
                        placeholder="e.g. Deep voice, speaks slowly, Brooklyn accent"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:border-red-600 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* Location Fields */}
                {type === 'Location' && locationItem && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs uppercase tracking-wider text-neutral-500 font-bold flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Time of Day
                      </label>
                      <input
                        type="text"
                        value={locationItem.timeOfDay || ''}
                        onChange={(e) => onUpdate(item.id, { timeOfDay: e.target.value })}
                        placeholder="e.g. Dawn, Golden hour"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:border-red-600 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs uppercase tracking-wider text-neutral-500 font-bold flex items-center gap-1">
                        <Cloud className="w-3 h-3" /> Weather
                      </label>
                      <input
                        type="text"
                        value={locationItem.weather || ''}
                        onChange={(e) => onUpdate(item.id, { weather: e.target.value })}
                        placeholder="e.g. Overcast, rain"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:border-red-600 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs uppercase tracking-wider text-neutral-500 font-bold flex items-center gap-1">
                        <Palette className="w-3 h-3" /> Atmosphere
                      </label>
                      <input
                        type="text"
                        value={locationItem.atmosphere || ''}
                        onChange={(e) => onUpdate(item.id, { atmosphere: e.target.value })}
                        placeholder="e.g. Tense, romantic"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:border-red-600 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs uppercase tracking-wider text-neutral-500 font-bold flex items-center gap-1">
                        <Volume2 className="w-3 h-3" /> Sound Ambience
                      </label>
                      <input
                        type="text"
                        value={locationItem.soundAmbience || ''}
                        onChange={(e) => onUpdate(item.id, { soundAmbience: e.target.value })}
                        placeholder="e.g. City traffic"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:border-red-600 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <label className="text-xs uppercase tracking-wider text-neutral-500 font-bold flex items-center gap-1">
                        <ImagePlus className="w-3 h-3" /> Key Props
                      </label>
                      <input
                        type="text"
                        value={locationItem.keyProps || ''}
                        onChange={(e) => onUpdate(item.id, { keyProps: e.target.value })}
                        placeholder="e.g. Old typewriter, vintage car, broken mirror"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:border-red-600 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <label className="text-xs uppercase tracking-wider text-neutral-500 font-bold flex items-center gap-1">
                        <Lightbulb className="w-3 h-3" /> Practical Lighting
                      </label>
                      <input
                        type="text"
                        value={locationItem.practicalLighting || ''}
                        onChange={(e) => onUpdate(item.id, { practicalLighting: e.target.value })}
                        placeholder="e.g. Neon signs, fireplace, street lamps"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:border-red-600 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* Update with Details Button */}
                {item.imageUrl && !item.isGenerating && !item.isEditing && !item.isUpdating && (
                  <div className="pt-4 border-t border-neutral-800">
                    <div className="bg-neutral-950 rounded-lg p-4 border border-neutral-800">
                      <h4 className="text-xs uppercase tracking-wider text-neutral-500 font-bold mb-3 flex items-center gap-2">
                        <Settings2 className="w-4 h-4" /> Apply Details to Image
                      </h4>
                      <p className="text-xs text-neutral-500 mb-3">
                        Click "Update Image" to regenerate the image using all the details above. The AI will modify the current image to match the specified details.
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => onUpdateWithDetails(item.id)}
                          className="flex-1"
                        >
                          <Settings2 className="w-4 h-4 mr-2" />
                          Update Image with Details
                        </Button>
                        {item.originalImageUrl && item.originalImageUrl !== item.imageUrl && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => onResetToOriginal(item.id)}
                            className="flex-1"
                          >
                            <RotateCcw className="w-4 h-4 mr-2" />
                            Reset to Original
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Updating Status */}
                {item.isUpdating && (
                  <div className="pt-4 border-t border-neutral-800">
                    <div className="flex items-center justify-center gap-2 text-blue-500 py-3 bg-blue-950/20 rounded-lg border border-blue-900/50">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-sm font-medium">Updating image with details...</span>
                    </div>
                  </div>
                )}

                {/* Turnaround Section */}
                <div className="pt-4 border-t border-neutral-800">
                  <div className="bg-neutral-950 rounded-lg p-4 border border-neutral-800">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs uppercase tracking-wider text-neutral-500 font-bold flex items-center gap-2">
                        <RotateCw className="w-4 h-4" /> Reference Angles
                      </h4>
                      <span className="text-[10px] text-neutral-600">
                        {(item.turnaroundImages || []).filter(t => t.isSelected).length} selected as ref
                      </span>
                    </div>
                    <p className="text-xs text-neutral-500 mb-3">
                      Generate multiple angle views. Selected images will be injected as references when generating storyboard shots.
                    </p>

                    {/* Generate Turnaround Button */}
                    {onGenerateTurnaround && item.imageUrl && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => onGenerateTurnaround(item.id)}
                        isLoading={item.isTurnaroundGenerating}
                        disabled={item.isTurnaroundGenerating || !item.imageUrl}
                        className="w-full mb-3"
                      >
                        <RotateCw className="w-4 h-4 mr-2" />
                        {item.turnaroundImages?.length ? 'Regenerate Turnaround' : 'Generate Turnaround (4 Angles)'}
                      </Button>
                    )}

                    {item.isTurnaroundGenerating && (
                      <div className="flex items-center justify-center gap-2 text-orange-400 py-3 mb-3 bg-orange-950/20 rounded-lg border border-orange-900/30">
                        <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-xs font-medium">Generating angles (this takes a minute)...</span>
                      </div>
                    )}

                    {/* Turnaround Image Gallery */}
                    {item.turnaroundImages && item.turnaroundImages.length > 0 && (
                      <div className="grid grid-cols-2 gap-3">
                        {item.turnaroundImages.map(tImg => (
                          <div
                            key={tImg.id}
                            className={`relative rounded-lg overflow-hidden border-2 cursor-pointer transition-all group/turnaround ${tImg.isSelected
                                ? 'border-green-500 shadow-lg shadow-green-900/30'
                                : 'border-neutral-700 hover:border-neutral-500'
                              }`}
                            onClick={() => onToggleTurnaroundRef && onToggleTurnaroundRef(item.id, tImg.id)}
                          >
                            <img
                              src={tImg.imageUrl}
                              alt={tImg.angle}
                              className="w-full aspect-[3/4] object-cover"
                            />
                            {/* Selection Indicator */}
                            <div className="absolute top-2 right-2">
                              {tImg.isSelected ? (
                                <CheckSquare className="w-5 h-5 text-green-400 drop-shadow-lg" />
                              ) : (
                                <Square className="w-5 h-5 text-neutral-400 opacity-0 group-hover/turnaround:opacity-100 transition-opacity drop-shadow-lg" />
                              )}
                            </div>
                            {/* Angle Label */}
                            <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-2 py-1.5 text-center">
                              <span className="text-[10px] uppercase tracking-wider text-neutral-300 font-bold">{tImg.angle}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Delete Button */}
                <div className="pt-4 border-t border-neutral-800">
                  <button
                    onClick={handleDeleteClick}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${deleteConfirm
                      ? 'bg-red-600 text-white hover:bg-red-500'
                      : 'bg-neutral-800 text-neutral-400 hover:bg-red-900/50 hover:text-red-400'
                      }`}
                  >
                    <Trash2 className="w-4 h-4" />
                    {deleteConfirm ? 'Click again to confirm delete' : `Delete ${type}`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
