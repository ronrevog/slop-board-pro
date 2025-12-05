
import React, { useState } from 'react';
import { Shot } from '../types';
import { Button } from './Button';
import { Download, Loader2, Clapperboard, Video, ImageIcon, MonitorPlay, RefreshCw } from 'lucide-react';

interface VideoShotCardProps {
  shot: Shot;
  videoModelLabel: string;
  onUpdatePrompt: (id: string, prompt: string) => void;
  onGenerate: (id: string, model: 'fast' | 'quality') => void;
  onDownload: (shot: Shot) => void;
  synthesizePrompt: (shot: Shot) => string;
}

export const VideoShotCard: React.FC<VideoShotCardProps> = ({
  shot,
  videoModelLabel,
  onUpdatePrompt,
  onGenerate,
  onDownload,
  synthesizePrompt
}) => {
  // State is now safe here because this is a separate component instance
  const [viewMode, setViewMode] = useState<'image' | 'video'>(shot.videoUrl ? 'video' : 'image');

  // Ensure videoPrompt is populated in UI state if empty
  const displayPrompt = shot.videoPrompt || synthesizePrompt(shot);

  // Auto-switch to video view when URL becomes available (e.g. after generation)
  React.useEffect(() => {
    if (shot.videoUrl) {
        setViewMode('video');
    }
  }, [shot.videoUrl]);

  return (
    <div className="bg-black border border-neutral-800 rounded-xl overflow-hidden shadow-2xl">
      
      {/* 1. HEADER */}
      <div className="bg-neutral-900 px-6 py-4 border-b border-neutral-800 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <span className="text-red-500 font-serif font-bold text-2xl">Shot #{shot.number}</span>
          <div className="text-xs bg-neutral-800 text-neutral-400 px-2 py-1 rounded border border-neutral-700">
            {shot.cameraMove} • {shot.shotType}
          </div>
        </div>
        {/* View Toggles */}
        <div className="flex bg-neutral-800 p-1 rounded-lg">
          <button 
            onClick={() => setViewMode('image')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-2 ${viewMode === 'image' ? 'bg-neutral-600 text-white shadow' : 'text-neutral-400 hover:text-neutral-200'}`}
            disabled={!shot.imageUrl}
          >
            <ImageIcon className="w-3 h-3" /> Reference
          </button>
          <button 
            onClick={() => setViewMode('video')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-2 ${viewMode === 'video' ? 'bg-red-900/50 text-red-200 shadow' : 'text-neutral-400 hover:text-neutral-200'}`}
            disabled={!shot.videoUrl}
          >
            <MonitorPlay className="w-3 h-3" /> Video Result
          </button>
        </div>
      </div>

      {/* 2. SPLIT CONTENT */}
      <div className="grid grid-cols-1 lg:grid-cols-3">
        
        {/* LEFT: MEDIA PLAYER (Span 2 cols) */}
        <div className="lg:col-span-2 bg-black relative aspect-video flex items-center justify-center border-b lg:border-b-0 lg:border-r border-neutral-800">
          {viewMode === 'video' && shot.videoUrl ? (
            <div className="relative w-full h-full group">
              <video 
                src={shot.videoUrl} 
                controls 
                className="w-full h-full object-contain"
              />
              <button 
                onClick={() => onDownload(shot)}
                className="absolute top-4 right-4 p-2 bg-black/70 hover:bg-red-600 text-white rounded-full transition-colors opacity-0 group-hover:opacity-100 z-10"
                title="Download Video"
              >
                <Download className="w-5 h-5" />
              </button>
            </div>
          ) : shot.imageUrl ? (
            <img src={shot.imageUrl} alt="Ref" className="w-full h-full object-contain" />
          ) : (
            <div className="text-neutral-600 flex flex-col items-center gap-2">
              <ImageIcon className="w-12 h-12 opacity-20" />
              <span className="text-xs uppercase tracking-widest">No Visual Reference</span>
            </div>
          )}

          {/* Loading Overlay */}
          {shot.isVideoGenerating && (
            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-20 backdrop-blur-sm">
              <Loader2 className="w-12 h-12 text-red-600 animate-spin mb-4" />
              <div className="text-white font-serif text-xl tracking-wide">Generating Video...</div>
              <div className="text-neutral-400 text-xs mt-2 uppercase tracking-widest">{videoModelLabel}</div>
            </div>
          )}
        </div>

        {/* RIGHT: CONTROLS */}
        <div className="lg:col-span-1 bg-neutral-900 p-6 flex flex-col gap-6">
          
          <div className="space-y-2 flex-1">
            <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                <Clapperboard className="w-3 h-3" /> Director's Prompt
                </label>
                <button 
                    onClick={() => onUpdatePrompt(shot.id, synthesizePrompt(shot))}
                    className="text-xs text-neutral-500 hover:text-white flex items-center gap-1 transition-colors bg-neutral-800 px-2 py-1 rounded"
                    title="Pull latest Dialogue, Action, and Camera settings from Storyboard"
                >
                    <RefreshCw className="w-3 h-3" /> Sync to Script
                </button>
            </div>
            
            <textarea 
              className="w-full h-64 bg-black/40 border border-neutral-700 rounded-md p-4 text-sm text-neutral-300 font-mono leading-relaxed resize-none focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-900"
              value={displayPrompt}
              onChange={(e) => onUpdatePrompt(shot.id, e.target.value)}
              placeholder="Enter detailed prompt for video generation..."
            />
            <p className="text-[10px] text-neutral-500">
              Tip: Describe the motion clearly. E.g. "Slow dolly in on the character's face as they look up in fear."
            </p>
          </div>

          <div className="space-y-3 pt-6 border-t border-neutral-800">
            <div className="space-y-2">
              <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                <Video className="w-3 h-3" /> Generate Video
              </label>
              <div className="grid grid-cols-2 gap-3">
                <Button 
                  variant="secondary" 
                  onClick={() => onGenerate(shot.id, 'fast')}
                  disabled={shot.isVideoGenerating || !shot.imageUrl}
                  className="h-12"
                >
                  Veo Fast
                </Button>
                <Button 
                  variant="primary" 
                  onClick={() => onGenerate(shot.id, 'quality')}
                  disabled={shot.isVideoGenerating || !shot.imageUrl}
                  className="h-12"
                >
                  Veo Quality
                </Button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
