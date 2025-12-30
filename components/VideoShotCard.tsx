
import React, { useState, useRef } from 'react';
import { Shot, VideoSegment, VideoProviderSettings, DEFAULT_VIDEO_SETTINGS } from '../types';
import { Button } from './Button';
import { Download, Loader2, Clapperboard, Video, ImageIcon, MonitorPlay, RefreshCw, Film, Play, AlertTriangle, X, Camera, Settings, ChevronDown, ChevronUp, CheckSquare, Square } from 'lucide-react';

export interface WanGenerationSettings {
  resolution: '720p' | '1080p';
  duration: '5' | '10' | '15';
  enablePromptExpansion: boolean;
  multiShots: boolean;
  enableSafetyChecker: boolean;
  negativePrompt: string;
  seed?: number;
  audioUrl?: string;
}

interface VideoShotCardProps {
  shot: Shot;
  sceneName?: string;
  videoModelLabel: string;
  projectVideoSettings?: VideoProviderSettings;
  onUpdatePrompt: (id: string, prompt: string) => void;
  onGenerate: (id: string, model: 'fast' | 'quality') => void;
  onGenerateWan: (id: string, settings: WanGenerationSettings) => void;
  onExtend: (id: string, model: 'fast' | 'quality') => void;
  onDownload: (shot: Shot, sceneName?: string) => void;
  onCaptureFrame: (id: string, imageDataUrl: string) => void;
  synthesizePrompt: (shot: Shot) => string;
}

export const VideoShotCard: React.FC<VideoShotCardProps> = ({
  shot,
  sceneName,
  videoModelLabel,
  projectVideoSettings,
  onUpdatePrompt,
  onGenerate,
  onGenerateWan,
  onExtend,
  onDownload,
  onCaptureFrame,
  synthesizePrompt
}) => {
  // State is now safe here because this is a separate component instance
  const [viewMode, setViewMode] = useState<'image' | 'video'>(shot.videoUrl ? 'video' : 'image');

  // Track currently selected segment for stringout playback
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState<number | null>(null);

  // Video ref for frame capture
  const videoRef = useRef<HTMLVideoElement>(null);

  // Feedback state for capture
  const [captureStatus, setCaptureStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Provider selection state per-shot (defaults to project setting or 'veo')
  const [selectedProvider, setSelectedProvider] = useState<'veo' | 'wan'>(
    projectVideoSettings?.provider === 'fal-wan' ? 'wan' : 'veo'
  );

  // Wan settings state (initialized from project settings)
  const [wanSettings, setWanSettings] = useState<WanGenerationSettings>({
    resolution: projectVideoSettings?.wanResolution || '1080p',
    duration: projectVideoSettings?.wanDuration || '5',
    enablePromptExpansion: projectVideoSettings?.wanEnablePromptExpansion ?? true,
    multiShots: projectVideoSettings?.wanMultiShots ?? false,
    enableSafetyChecker: projectVideoSettings?.wanEnableSafetyChecker ?? true,
    negativePrompt: projectVideoSettings?.wanNegativePrompt || '',
    seed: projectVideoSettings?.wanSeed,
    audioUrl: projectVideoSettings?.wanAudioUrl || ''
  });

  // Show/hide Wan settings panel
  const [showWanSettings, setShowWanSettings] = useState(false);

  // Capture current video frame as image
  const handleCaptureFrame = () => {
    const video = videoRef.current;
    if (!video) {
      console.error('Video element not found');
      setCaptureStatus('error');
      setTimeout(() => setCaptureStatus('idle'), 2000);
      return;
    }

    try {
      // Create a canvas with video dimensions
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || video.clientWidth;
      canvas.height = video.videoHeight || video.clientHeight;

      // Draw the current video frame to canvas
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('Could not get canvas context');
        setCaptureStatus('error');
        setTimeout(() => setCaptureStatus('idle'), 2000);
        return;
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Convert to data URL (PNG for quality)
      const imageDataUrl = canvas.toDataURL('image/png');

      // Check if we got a valid image
      if (!imageDataUrl || imageDataUrl === 'data:,') {
        console.error('Failed to capture frame - empty result');
        setCaptureStatus('error');
        setTimeout(() => setCaptureStatus('idle'), 2000);
        return;
      }

      // Call the callback with the captured image
      onCaptureFrame(shot.id, imageDataUrl);
      setCaptureStatus('success');
      setTimeout(() => setCaptureStatus('idle'), 2000);
    } catch (e) {
      console.error('Frame capture error:', e);
      setCaptureStatus('error');
      setTimeout(() => setCaptureStatus('idle'), 2000);
    }
  };

  // Ensure videoPrompt is populated in UI state if empty
  const displayPrompt = shot.videoPrompt || synthesizePrompt(shot);

  // Get the current video URL to display (either selected segment or latest)
  const segments = shot.videoSegments || [];
  const currentVideoUrl = selectedSegmentIndex !== null && segments[selectedSegmentIndex]
    ? segments[selectedSegmentIndex].url
    : shot.videoUrl;

  // Auto-switch to video view when URL becomes available (e.g. after generation)
  React.useEffect(() => {
    if (shot.videoUrl) {
      setViewMode('video');
    }
  }, [shot.videoUrl]);

  // Reset selected segment to latest when new segment is added
  React.useEffect(() => {
    if (segments.length > 0) {
      setSelectedSegmentIndex(segments.length - 1);
    }
  }, [segments.length]);

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
        <div className="lg:col-span-2 bg-black flex flex-col border-b lg:border-b-0 lg:border-r border-neutral-800">
          {/* Video/Image Display */}
          <div className="relative aspect-video flex items-center justify-center">
            {viewMode === 'video' && currentVideoUrl ? (
              <div className="relative w-full h-full group">
                <video
                  ref={videoRef}
                  key={currentVideoUrl} // Force re-render when URL changes
                  src={currentVideoUrl}
                  controls
                  className="w-full h-full object-contain"
                />
                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 z-10">
                  <button
                    onClick={handleCaptureFrame}
                    className={`p-2 text-white rounded-full transition-colors ${captureStatus === 'success'
                      ? 'bg-green-600'
                      : captureStatus === 'error'
                        ? 'bg-red-600'
                        : 'bg-black/70 hover:bg-blue-600'
                      }`}
                    title="Capture current frame as storyboard image"
                  >
                    <Camera className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => onDownload(shot, sceneName)}
                    className="p-2 bg-black/70 hover:bg-red-600 text-white rounded-full transition-colors"
                    title="Download Video"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                </div>
                {/* Capture feedback toast */}
                {captureStatus === 'success' && (
                  <div className="absolute top-16 right-4 bg-green-600 text-white text-xs px-3 py-1 rounded animate-fade-in z-20">
                    Frame captured!
                  </div>
                )}
                {captureStatus === 'error' && (
                  <div className="absolute top-16 right-4 bg-red-600 text-white text-xs px-3 py-1 rounded animate-fade-in z-20">
                    Capture failed
                  </div>
                )}
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
            {(shot.isVideoGenerating || shot.isExtending) && (
              <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-20 backdrop-blur-sm">
                <Loader2 className="w-12 h-12 text-red-600 animate-spin mb-4" />
                <div className="text-white font-serif text-xl tracking-wide">{shot.isExtending ? 'Extending Video...' : 'Generating Video...'}</div>
                <div className="text-neutral-400 text-xs mt-2 uppercase tracking-widest">{videoModelLabel}</div>
              </div>
            )}
          </div>

          {/* Stringout Timeline - Video Segments */}
          {segments.length > 0 && viewMode === 'video' && (
            <div className="bg-neutral-900/50 border-t border-neutral-800 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Film className="w-3 h-3 text-neutral-500" />
                <span className="text-xs font-bold text-neutral-500 uppercase tracking-widest">
                  Video Stringout ({segments.length} {segments.length === 1 ? 'segment' : 'segments'})
                </span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                {segments.map((segment, index) => (
                  <div key={segment.id} className="relative flex-shrink-0 group/segment">
                    <button
                      onClick={() => setSelectedSegmentIndex(index)}
                      className={`relative w-24 h-16 rounded-lg overflow-hidden border-2 transition-all group ${selectedSegmentIndex === index
                        ? 'border-red-500 ring-2 ring-red-500/30'
                        : 'border-neutral-700 hover:border-neutral-500'
                        }`}
                      title={`${segment.isExtension ? 'Extension' : 'Generation'} - ${segment.model} model`}
                    >
                      {/* Thumbnail placeholder with gradient */}
                      <div className={`absolute inset-0 ${segment.isExtension
                        ? 'bg-gradient-to-br from-orange-900/50 to-red-900/50'
                        : 'bg-gradient-to-br from-neutral-800 to-neutral-900'
                        }`}>
                        <video
                          src={segment.url}
                          className="w-full h-full object-cover opacity-80"
                          muted
                          preload="metadata"
                        />
                      </div>

                      {/* Segment info overlay */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 group-hover:bg-black/20 transition-colors">
                        <Play className={`w-4 h-4 ${selectedSegmentIndex === index ? 'text-red-400' : 'text-white/70'}`} />
                        <span className="text-[10px] text-white/80 mt-1 font-medium">
                          {index === 0 ? 'Original' : `Ext ${index}`}
                        </span>
                      </div>

                      {/* Model badge */}
                      <div className={`absolute bottom-1 right-1 px-1 py-0.5 rounded text-[8px] font-bold uppercase ${segment.model === 'quality'
                        ? 'bg-red-600/80 text-white'
                        : 'bg-neutral-600/80 text-neutral-200'
                        }`}>
                        {segment.model === 'quality' ? 'Q' : 'F'}
                      </div>

                      {/* Selected indicator */}
                      {selectedSegmentIndex === index && (
                        <div className="absolute top-1 left-1 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      )}
                    </button>

                    {/* Download button for segment */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const link = document.createElement('a');
                        link.href = segment.url;
                        const scenePrefix = sceneName ? `${sceneName.replace(/\s+/g, '-').toLowerCase()}-` : '';
                        link.download = `${scenePrefix}shot-${shot.number}-${index === 0 ? 'original' : `ext-${index}`}.mp4`;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }}
                      className="absolute -bottom-1 -right-1 p-1 bg-neutral-800 hover:bg-red-600 text-white rounded-full transition-colors z-10 opacity-0 group-hover/segment:opacity-100"
                      title={`Download ${index === 0 ? 'Original' : `Extension ${index}`}`}
                    >
                      <Download className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
              {segments.length > 1 && (
                <p className="text-[10px] text-neutral-500 mt-1">
                  Click a segment to view. Current: {selectedSegmentIndex !== null ? (selectedSegmentIndex === 0 ? 'Original' : `Extension ${selectedSegmentIndex}`) : 'Latest'}
                </p>
              )}
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

          {/* Error Display */}
          {shot.videoError && (
            <div className="bg-red-950/50 border border-red-900/50 rounded-lg p-4 animate-fade-in">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-red-400 mb-1">Video Generation Failed</p>
                  <p className="text-xs text-red-300/80 break-words">{shot.videoError}</p>
                  {shot.videoError.includes('Content Policy') && (
                    <p className="text-xs text-neutral-400 mt-2">
                      💡 Try regenerating the storyboard image or modifying the character.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3 pt-6 border-t border-neutral-800">
            {/* Provider Selection */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                <Video className="w-3 h-3" /> Video Provider
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setSelectedProvider('veo')}
                  className={`px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all ${selectedProvider === 'veo'
                    ? 'border-red-600 bg-red-900/20 text-white'
                    : 'border-neutral-700 bg-neutral-800/50 text-neutral-400 hover:border-neutral-500'
                    }`}
                >
                  Veo (Google)
                </button>
                <button
                  onClick={() => setSelectedProvider('wan')}
                  className={`px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all ${selectedProvider === 'wan'
                    ? 'border-orange-600 bg-orange-900/20 text-white'
                    : 'border-neutral-700 bg-neutral-800/50 text-neutral-400 hover:border-neutral-500'
                    }`}
                >
                  Wan v2.6 (fal.ai)
                </button>
              </div>
            </div>

            {/* Veo Generate Buttons */}
            {selectedProvider === 'veo' && (
              <div className="space-y-2 animate-fade-in">
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="secondary"
                    onClick={() => onGenerate(shot.id, 'fast')}
                    disabled={shot.isVideoGenerating || shot.isExtending || !shot.imageUrl}
                    className="h-12"
                  >
                    {shot.videoUrl ? 'Regen Fast' : 'Veo Fast'}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => onGenerate(shot.id, 'quality')}
                    disabled={shot.isVideoGenerating || shot.isExtending || !shot.imageUrl}
                    className="h-12"
                  >
                    {shot.videoUrl ? 'Regen Quality' : 'Veo Quality'}
                  </Button>
                </div>
              </div>
            )}

            {/* Wan v2.6 Settings & Generate */}
            {selectedProvider === 'wan' && (
              <div className="space-y-3 animate-fade-in">
                {/* Wan Settings Toggle */}
                <button
                  onClick={() => setShowWanSettings(!showWanSettings)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-neutral-800/50 border border-neutral-700 rounded-lg text-sm text-neutral-300 hover:bg-neutral-800 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Settings className="w-3 h-3" /> Wan v2.6 Settings
                  </span>
                  {showWanSettings ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {/* Wan Settings Panel */}
                {showWanSettings && (
                  <div className="bg-neutral-800/30 border border-neutral-700 rounded-lg p-3 space-y-3 animate-fade-in">
                    {/* Resolution & Duration Row */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] text-neutral-500 uppercase">Resolution</label>
                        <select
                          className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-white"
                          value={wanSettings.resolution}
                          onChange={(e) => setWanSettings(s => ({ ...s, resolution: e.target.value as '720p' | '1080p' }))}
                        >
                          <option value="720p">720p</option>
                          <option value="1080p">1080p</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-neutral-500 uppercase">Duration</label>
                        <select
                          className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-white"
                          value={wanSettings.duration}
                          onChange={(e) => setWanSettings(s => ({ ...s, duration: e.target.value as '5' | '10' | '15' }))}
                        >
                          <option value="5">5 sec</option>
                          <option value="10">10 sec</option>
                          <option value="15">15 sec</option>
                        </select>
                      </div>
                    </div>

                    {/* Checkboxes */}
                    <div className="space-y-2">
                      <button
                        onClick={() => setWanSettings(s => ({ ...s, enablePromptExpansion: !s.enablePromptExpansion }))}
                        className="flex items-center gap-2 text-xs text-neutral-300 hover:text-white transition-colors w-full"
                      >
                        {wanSettings.enablePromptExpansion ? (
                          <CheckSquare className="w-4 h-4 text-orange-500" />
                        ) : (
                          <Square className="w-4 h-4 text-neutral-500" />
                        )}
                        Prompt Expansion
                      </button>
                      <button
                        onClick={() => setWanSettings(s => ({ ...s, multiShots: !s.multiShots }))}
                        className="flex items-center gap-2 text-xs text-neutral-300 hover:text-white transition-colors w-full"
                      >
                        {wanSettings.multiShots ? (
                          <CheckSquare className="w-4 h-4 text-orange-500" />
                        ) : (
                          <Square className="w-4 h-4 text-neutral-500" />
                        )}
                        Multi-Shots
                      </button>
                      <button
                        onClick={() => setWanSettings(s => ({ ...s, enableSafetyChecker: !s.enableSafetyChecker }))}
                        className="flex items-center gap-2 text-xs text-neutral-300 hover:text-white transition-colors w-full"
                      >
                        {wanSettings.enableSafetyChecker ? (
                          <CheckSquare className="w-4 h-4 text-orange-500" />
                        ) : (
                          <Square className="w-4 h-4 text-neutral-500" />
                        )}
                        Safety Checker
                      </button>
                    </div>

                    {/* Negative Prompt */}
                    <div className="space-y-1">
                      <label className="text-[10px] text-neutral-500 uppercase">Negative Prompt</label>
                      <input
                        type="text"
                        className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-white placeholder-neutral-600"
                        placeholder="low quality, blurry..."
                        value={wanSettings.negativePrompt}
                        onChange={(e) => setWanSettings(s => ({ ...s, negativePrompt: e.target.value }))}
                      />
                    </div>

                    {/* Seed */}
                    <div className="space-y-1">
                      <label className="text-[10px] text-neutral-500 uppercase">Seed (optional)</label>
                      <input
                        type="number"
                        className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-white placeholder-neutral-600"
                        placeholder="Random"
                        value={wanSettings.seed || ''}
                        onChange={(e) => setWanSettings(s => ({ ...s, seed: e.target.value ? parseInt(e.target.value) : undefined }))}
                      />
                    </div>

                    {/* Audio URL */}
                    <div className="space-y-1">
                      <label className="text-[10px] text-neutral-500 uppercase">Audio URL (optional)</label>
                      <input
                        type="url"
                        className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-white placeholder-neutral-600"
                        placeholder="https://..."
                        value={wanSettings.audioUrl || ''}
                        onChange={(e) => setWanSettings(s => ({ ...s, audioUrl: e.target.value }))}
                      />
                    </div>
                  </div>
                )}

                {/* API Key Warning */}
                {!projectVideoSettings?.falApiKey && (
                  <div className="text-xs text-orange-400 bg-orange-900/20 border border-orange-900/30 rounded px-2 py-1">
                    ⚠️ Add fal.ai API key in Project Settings
                  </div>
                )}

                {/* Generate Button */}
                <Button
                  variant="primary"
                  onClick={() => onGenerateWan(shot.id, wanSettings)}
                  disabled={shot.isVideoGenerating || shot.isExtending || !shot.imageUrl || !projectVideoSettings?.falApiKey}
                  className="w-full h-12 bg-orange-600 hover:bg-orange-700"
                >
                  {shot.videoUrl ? `Regenerate (${wanSettings.duration}s)` : `Generate Wan (${wanSettings.duration}s)`}
                </Button>
              </div>
            )}

            {/* Extend Video - Only for Veo */}
            {shot.videoUrl && selectedProvider === 'veo' && (
              <div className="space-y-2 pt-4 border-t border-neutral-800 animate-fade-in">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                  <MonitorPlay className="w-3 h-3" /> Extend Video
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    onClick={() => onExtend(shot.id, 'fast')}
                    disabled={shot.isVideoGenerating || shot.isExtending}
                    className="h-10 text-xs"
                  >
                    Extend (Fast)
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => onExtend(shot.id, 'quality')}
                    disabled={shot.isVideoGenerating || shot.isExtending}
                    className="h-10 text-xs"
                  >
                    Extend (Quality)
                  </Button>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};
