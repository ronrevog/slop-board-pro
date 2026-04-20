
import React, { useState, useRef, useMemo } from 'react';
import { Shot, VideoSegment, VideoProviderSettings, DEFAULT_VIDEO_SETTINGS } from '../types';
import { AuroraGenerationSettings, uploadFileToFal } from '../services/falService';
import { SeedanceGenerationSettings, SEEDANCE_MODELS, SEEDANCE_DURATIONS, SEEDANCE_ASPECT_RATIOS, SEEDANCE_RESOLUTIONS, modelRequiresImage, modelAcceptsReference } from '../services/seedanceService';
import { Button } from './Button';
import { Download, Loader2, Clapperboard, Video, ImageIcon, MonitorPlay, RefreshCw, Film, Play, AlertTriangle, X, Camera, Settings, ChevronDown, ChevronUp, CheckSquare, Square, Music, Upload, Mic, StopCircle, Trash2, Archive } from 'lucide-react';
import JSZip from 'jszip';

/** A single video that can be picked as a Seedance reference. Flattened from
 *  all shots / segments across the project. */
export interface ProjectVideoRef {
  /** Stable ID to key selection state — prefer `${shotId}:${segmentId ?? 'main'}` */
  key: string;
  /** Actual video URL (https, data:, or blob:). May get uploaded to fal.ai at send time. */
  url: string;
  /** Short label for the UI card (e.g. "Shot 3") */
  label: string;
  /** Optional scene name to group / caption */
  sceneName?: string;
  /** Optional extra caption (e.g. "Extension 2", "5s quality") */
  sublabel?: string;
}

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
  projectTitle?: string;
  sceneName?: string;
  videoModelLabel: string;
  projectVideoSettings?: VideoProviderSettings;
  onUpdatePrompt: (id: string, prompt: string) => void;
  onGenerate: (id: string, model: 'fast' | 'quality') => void;
  onGenerateWan: (id: string, settings: WanGenerationSettings, sourceVideoUrl?: string) => void;
  onGenerateAurora: (id: string, settings: AuroraGenerationSettings) => void;
  onGenerateSeedance: (id: string, settings: SeedanceGenerationSettings) => void;
  onExtendSeedance: (id: string, settings: SeedanceGenerationSettings) => void;
  onExtend: (id: string, model: 'fast' | 'quality') => void;
  onDownload: (shot: Shot, sceneName?: string) => void;
  onCaptureFrame: (id: string, imageDataUrl: string) => void;
  onDeleteSegment: (shotId: string, segmentId: string) => void;
  synthesizePrompt: (shot: Shot) => string;
  /**
   * Flat list of every video in the project (excluding this shot's own videos).
   * Used as the picker source for Seedance reference-to-video generations.
   * If not provided, the picker section is simply hidden.
   */
  projectVideos?: ProjectVideoRef[];
}

export const VideoShotCard: React.FC<VideoShotCardProps> = ({
  shot,
  projectTitle,
  sceneName,
  videoModelLabel,
  projectVideoSettings,
  onUpdatePrompt,
  onGenerate,
  onGenerateWan,
  onGenerateAurora,
  onGenerateSeedance,
  onExtendSeedance,
  onExtend,
  onDownload,
  onCaptureFrame,
  onDeleteSegment,
  synthesizePrompt,
  projectVideos
}) => {
  // State is now safe here because this is a separate component instance
  const [viewMode, setViewMode] = useState<'image' | 'video'>(shot.videoUrl ? 'video' : 'image');

  // Track currently selected segment for stringout playback
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState<number | null>(null);

  // Video ref for frame capture
  const videoRef = useRef<HTMLVideoElement>(null);

  // Feedback state for capture
  const [captureStatus, setCaptureStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Zip download state
  const [isZipping, setIsZipping] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);

  // Helper: convert any video URL to a Blob
  const urlToBlob = async (url: string): Promise<Blob> => {
    // Base64 data URL → decode directly (no network needed)
    if (url.startsWith('data:')) {
      const parts = url.split(',');
      const mime = parts[0].match(/:(.*?);/)?.[1] || 'video/mp4';
      const bstr = atob(parts[1]);
      const u8arr = new Uint8Array(bstr.length);
      for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
      return new Blob([u8arr], { type: mime });
    }
    // Blob URL → fetch works directly
    if (url.startsWith('blob:')) {
      const res = await fetch(url);
      return await res.blob();
    }
    // Remote URL → try fetch, if CORS blocks, load via video+MediaRecorder
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.blob();
    } catch {
      // CORS fallback: load video into element and capture via canvas frames
      return new Promise<Blob>((resolve, reject) => {
        const video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.preload = 'auto';
        video.muted = true;
        video.playsInline = true;

        const timeout = setTimeout(() => {
          reject(new Error('Video load timeout'));
        }, 30000);

        video.onloadeddata = async () => {
          clearTimeout(timeout);
          try {
            // Use MediaRecorder to capture the video as a blob
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth || 1280;
            canvas.height = video.videoHeight || 720;
            const ctx = canvas.getContext('2d')!;
            const stream = canvas.captureStream(30);

            // Add audio if available
            try {
              const audioCtx = new AudioContext();
              const source = audioCtx.createMediaElementSource(video);
              const dest = audioCtx.createMediaStreamDestination();
              source.connect(dest);
              dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
            } catch { }

            const chunks: Blob[] = [];
            const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
            recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

            recorder.onstop = () => {
              const blob = new Blob(chunks, { type: 'video/webm' });
              video.src = '';
              resolve(blob);
            };

            recorder.start();
            video.play();

            video.onended = () => {
              recorder.stop();
            };
          } catch (e) {
            reject(e);
          }
        };

        video.onerror = () => {
          clearTimeout(timeout);
          reject(new Error('Failed to load video'));
        };

        video.src = url;
      });
    }
  };

  // Provider selection state per-shot (defaults to project setting or 'veo')
  const [selectedProvider, setSelectedProvider] = useState<'veo' | 'wan' | 'aurora' | 'seedance'>(() => {
    if (projectVideoSettings?.provider === 'seedance') return 'seedance';
    if (projectVideoSettings?.provider === 'fal-aurora') return 'aurora';
    if (projectVideoSettings?.provider === 'fal-wan') return 'wan';
    return 'veo';
  });

  // Seedance settings state (initialized from project settings)
  const [seedanceSettings, setSeedanceSettings] = useState<SeedanceGenerationSettings>({
    model: projectVideoSettings?.seedanceModel || 'image-to-video',
    duration: projectVideoSettings?.seedanceDuration || '5',
    aspectRatio: projectVideoSettings?.seedanceAspectRatio || '16:9',
    resolution: projectVideoSettings?.seedanceResolution || '720p',
    seed: projectVideoSettings?.seedanceSeed,
    negativePrompt: projectVideoSettings?.seedanceNegativePrompt || '',
    enableSafetyChecker: projectVideoSettings?.seedanceEnableSafetyChecker,
  });

  // Show/hide Seedance settings panel
  const [showSeedanceSettings, setShowSeedanceSettings] = useState(false);

  // Seedance reference-video picker state ------------------------------------
  // Show/hide the picker (open by default when there's something to pick)
  const [showSeedanceRefVideos, setShowSeedanceRefVideos] = useState(true);
  // Keys (ProjectVideoRef.key) of currently selected reference videos
  const [selectedRefVideoKeys, setSelectedRefVideoKeys] = useState<Set<string>>(new Set());

  // Exclude the current shot's videos from the picker — you can't reference yourself.
  const availableRefVideos = useMemo<ProjectVideoRef[]>(() => {
    if (!projectVideos) return [];
    return projectVideos.filter(v => !v.key.startsWith(`${shot.id}:`));
  }, [projectVideos, shot.id]);

  const toggleRefVideo = (key: string) => {
    setSelectedRefVideoKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const clearRefVideos = () => setSelectedRefVideoKeys(new Set());

  // Resolve selected keys → URLs whenever we actually call the generator
  const getSelectedRefVideoUrls = (): string[] =>
    availableRefVideos.filter(v => selectedRefVideoKeys.has(v.key)).map(v => v.url);


  // Aurora settings state (initialized from project settings)
  const [auroraSettings, setAuroraSettings] = useState<AuroraGenerationSettings>({
    resolution: projectVideoSettings?.auroraResolution || '720p',
    guidanceScale: projectVideoSettings?.auroraGuidanceScale ?? 1,
    audioGuidanceScale: projectVideoSettings?.auroraAudioGuidanceScale ?? 2,
    audioUrl: projectVideoSettings?.auroraAudioUrl || '',
    prompt: projectVideoSettings?.auroraPrompt || '',
  });

  // Show/hide Aurora settings panel
  const [showAuroraSettings, setShowAuroraSettings] = useState(false);

  // Audio file upload state
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [uploadedAudioName, setUploadedAudioName] = useState<string | null>(null);
  const audioFileInputRef = useRef<HTMLInputElement>(null);

  // Handle audio file upload
  const handleAudioFileUpload = async (file: File) => {
    if (!projectVideoSettings?.falApiKey) {
      console.error('fal.ai API key required for upload');
      return;
    }
    setIsUploadingAudio(true);
    setUploadedAudioName(null);
    try {
      const url = await uploadFileToFal(file, projectVideoSettings.falApiKey);
      setAuroraSettings(s => ({ ...s, audioUrl: url }));
      setUploadedAudioName(file.name);
    } catch (e: any) {
      console.error('Audio upload failed:', e);
    } finally {
      setIsUploadingAudio(false);
    }
  };

  // --- Microphone Recording ---
  const MAX_RECORDING_SECONDS = 60;
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;
      audioChunksRef.current = [];
      setRecordingSeconds(0);

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach(t => t.stop());
        recordingStreamRef.current = null;

        // Clear timer
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }

        // Create WAV file from chunks
        const blob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });
        const file = new File([blob], `recording-${Date.now()}.wav`, { type: 'audio/wav' });

        // Upload to fal.ai
        await handleAudioFileUpload(file);
        setIsRecording(false);
      };

      mediaRecorder.start(250); // Collect data every 250ms
      setIsRecording(true);

      // Start timer and auto-stop at 60 seconds
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(prev => {
          const next = prev + 1;
          if (next >= MAX_RECORDING_SECONDS) {
            stopRecording();
          }
          return next;
        });
      }, 1000);
    } catch (err) {
      console.error('Microphone access denied or unavailable:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (recordingStreamRef.current) {
        recordingStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

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
                <Loader2 className={`w-12 h-12 animate-spin mb-4 ${selectedProvider === 'wan' ? 'text-orange-500' : selectedProvider === 'aurora' ? 'text-purple-500' : selectedProvider === 'seedance' ? 'text-emerald-500' : 'text-red-600'
                  }`} />
                <div className="text-white font-serif text-xl tracking-wide">
                  {shot.isExtending ? 'Extending Video...' : 'Generating Video...'}
                </div>
                <div className={`text-xs mt-2 uppercase tracking-widest ${selectedProvider === 'wan' ? 'text-orange-400' : selectedProvider === 'aurora' ? 'text-purple-400' : selectedProvider === 'seedance' ? 'text-emerald-400' : 'text-neutral-400'
                  }`}>
                  {selectedProvider === 'wan' ? 'Wan v2.6 (fal.ai)'
                    : selectedProvider === 'aurora' ? 'Lip Sync — Aurora (fal.ai)'
                      : selectedProvider === 'seedance' ? 'Seedance 2.0 (fal.ai)'
                        : videoModelLabel}
                </div>
                {/* Indeterminate progress bar */}
                <div className="w-48 mt-4 bg-neutral-800 rounded-full h-1.5 overflow-hidden">
                  <div className={`h-full rounded-full animate-indeterminate-progress ${selectedProvider === 'wan' ? 'bg-orange-500' : selectedProvider === 'aurora' ? 'bg-purple-500' : selectedProvider === 'seedance' ? 'bg-emerald-500' : 'bg-red-600'
                    }`}
                    style={{ width: '40%' }}
                  />
                </div>
                <p className="text-[10px] text-neutral-500 mt-2">This may take 1-3 minutes</p>
              </div>
            )}
          </div>

          {/* Stringout Timeline - Video Segments */}
          {segments.length > 0 && viewMode === 'video' && (
            <div className="bg-neutral-900/50 border-t border-neutral-800 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Film className="w-3 h-3 text-neutral-500" />
                  <span className="text-xs font-bold text-neutral-500 uppercase tracking-widest">
                    Video Stringout ({segments.length} {segments.length === 1 ? 'segment' : 'segments'})
                  </span>
                </div>
                {segments.length > 0 && (
                  <button
                    onClick={async () => {
                      if (isZipping) return;
                      setIsZipping(true);
                      setZipError(null);
                      try {
                        const zip = new JSZip();
                        const titlePrefix = projectTitle ? `${projectTitle.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-` : '';
                        const scenePrefix = sceneName ? `${sceneName.replace(/\s+/g, '-').toLowerCase()}-` : '';

                        for (let i = 0; i < segments.length; i++) {
                          const segment = segments[i];
                          const ext = segment.url.startsWith('data:video/webm') ? '.webm' : '.mp4';
                          const fileName = `${titlePrefix}${scenePrefix}shot-${shot.number}-seg-${i + 1}${ext}`;
                          const blob = await urlToBlob(segment.url);
                          zip.file(fileName, blob);
                        }

                        const zipBlob = await zip.generateAsync({ type: 'blob' });
                        const zipUrl = URL.createObjectURL(zipBlob);
                        const link = document.createElement('a');
                        link.href = zipUrl;
                        link.download = `${titlePrefix}${scenePrefix}shot-${shot.number}-all-segments.zip`;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        setTimeout(() => URL.revokeObjectURL(zipUrl), 5000);
                      } catch (err: any) {
                        console.error('Zip download failed:', err);
                        setZipError(err?.message || 'Download failed');
                        setTimeout(() => setZipError(null), 5000);
                      } finally {
                        setIsZipping(false);
                      }
                    }}
                    disabled={isZipping}
                    className={`flex items-center gap-1.5 px-2.5 py-1 border rounded-md transition-colors text-xs ${isZipping
                      ? 'bg-neutral-700 text-neutral-400 border-neutral-600 cursor-wait'
                      : zipError
                        ? 'bg-red-900/50 text-red-400 border-red-800'
                        : 'bg-neutral-800 hover:bg-red-900/50 text-neutral-400 hover:text-white border-neutral-700 hover:border-red-800'
                      }`}
                    title={zipError || `Download all ${segments.length} segments as ZIP`}
                  >
                    {isZipping ? (
                      <><Loader2 className="w-3 h-3 animate-spin" /> Zipping...</>
                    ) : zipError ? (
                      <><AlertTriangle className="w-3 h-3" /> Failed</>
                    ) : (
                      <><Archive className="w-3 h-3" /> Download ZIP</>
                    )}
                  </button>
                )}
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
                          {segment.isExtension ? `Ext ${index}` : `Gen ${index + 1}`}
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

                    {/* Segment action buttons */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const link = document.createElement('a');
                        link.href = segment.url;
                        const tPrefix = projectTitle ? `${projectTitle.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-` : '';
                        const scenePrefix = sceneName ? `${sceneName.replace(/\s+/g, '-').toLowerCase()}-` : '';
                        link.download = `${tPrefix}${scenePrefix}shot-${shot.number}-${index === 0 ? 'original' : `ext-${index}`}.mp4`;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }}
                      className="absolute -bottom-1 -right-1 p-1 bg-neutral-800 hover:bg-red-600 text-white rounded-full transition-colors z-10 opacity-0 group-hover/segment:opacity-100"
                      title={`Download ${index === 0 ? 'Original' : `Extension ${index}`}`}
                    >
                      <Download className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (selectedSegmentIndex === index) {
                          setSelectedSegmentIndex(null);
                        }
                        onDeleteSegment(shot.id, segment.id);
                      }}
                      className="absolute -top-1 -right-1 p-1 bg-neutral-800 hover:bg-red-600 text-white rounded-full transition-colors z-10 opacity-0 group-hover/segment:opacity-100"
                      title="Remove segment"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-[10px] text-neutral-500">
                  {selectedSegmentIndex !== null
                    ? `Selected: ${segments[selectedSegmentIndex]?.isExtension ? `Extension ${selectedSegmentIndex}` : `Segment ${selectedSegmentIndex + 1}`} — last frame used as source`
                    : 'No segment selected — storyboard image used as source'}
                </p>
                {selectedSegmentIndex !== null && (
                  <button
                    onClick={() => setSelectedSegmentIndex(null)}
                    className="text-[10px] text-neutral-400 hover:text-white flex items-center gap-1 bg-neutral-800 hover:bg-neutral-700 px-2 py-0.5 rounded transition-colors"
                  >
                    <X className="w-3 h-3" /> Deselect
                  </button>
                )}
              </div>
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
              <div className="grid grid-cols-4 gap-2">
                <button
                  onClick={() => setSelectedProvider('veo')}
                  className={`px-2 py-2 rounded-lg border-2 text-xs font-medium transition-all ${selectedProvider === 'veo'
                    ? 'border-red-600 bg-red-900/20 text-white'
                    : 'border-neutral-700 bg-neutral-800/50 text-neutral-400 hover:border-neutral-500'
                    }`}
                >
                  Veo
                </button>
                <button
                  onClick={() => setSelectedProvider('wan')}
                  className={`px-2 py-2 rounded-lg border-2 text-xs font-medium transition-all ${selectedProvider === 'wan'
                    ? 'border-orange-600 bg-orange-900/20 text-white'
                    : 'border-neutral-700 bg-neutral-800/50 text-neutral-400 hover:border-neutral-500'
                    }`}
                >
                  Wan v2.6
                </button>
                <button
                  onClick={() => setSelectedProvider('seedance')}
                  className={`px-2 py-2 rounded-lg border-2 text-xs font-medium transition-all ${selectedProvider === 'seedance'
                    ? 'border-emerald-600 bg-emerald-900/20 text-white'
                    : 'border-neutral-700 bg-neutral-800/50 text-neutral-400 hover:border-neutral-500'
                    }`}
                >
                  Seedance
                </button>
                <button
                  onClick={() => setSelectedProvider('aurora')}
                  className={`px-2 py-2 rounded-lg border-2 text-xs font-medium transition-all ${selectedProvider === 'aurora'
                    ? 'border-purple-600 bg-purple-900/20 text-white'
                    : 'border-neutral-700 bg-neutral-800/50 text-neutral-400 hover:border-neutral-500'
                    }`}
                >
                  Lip Sync
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

                {/* Source Indicator for Wan */}
                {segments.length > 0 && (
                  <div className={`text-xs rounded px-2 py-1 flex items-center gap-1 ${selectedSegmentIndex !== null
                    ? 'text-blue-400 bg-blue-900/20 border border-blue-900/30'
                    : 'text-neutral-400 bg-neutral-800/50 border border-neutral-700'
                    }`}>
                    🎬 Source: {selectedSegmentIndex !== null
                      ? `Last frame of ${segments[selectedSegmentIndex]?.isExtension ? `Extension ${selectedSegmentIndex}` : `Segment ${selectedSegmentIndex + 1}`}`
                      : 'Storyboard image (no segment selected)'}
                  </div>
                )}

                {/* Generate Button */}
                <Button
                  variant="primary"
                  onClick={() => {
                    const sourceUrl = selectedSegmentIndex !== null && segments[selectedSegmentIndex]
                      ? segments[selectedSegmentIndex].url
                      : undefined;
                    onGenerateWan(shot.id, wanSettings, sourceUrl);
                  }}
                  disabled={shot.isVideoGenerating || shot.isExtending || !shot.imageUrl || !projectVideoSettings?.falApiKey}
                  className="w-full h-12 bg-orange-600 hover:bg-orange-700"
                >
                  {shot.videoUrl ? `Regenerate (${wanSettings.duration}s)` : `Generate Wan (${wanSettings.duration}s)`}
                </Button>
              </div>
            )}

            {/* Seedance 2 Settings & Generate */}
            {selectedProvider === 'seedance' && (
              <div className="space-y-3 animate-fade-in">
                {/* Seedance Settings Toggle */}
                <button
                  onClick={() => setShowSeedanceSettings(!showSeedanceSettings)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-neutral-800/50 border border-neutral-700 rounded-lg text-sm text-neutral-300 hover:bg-neutral-800 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Settings className="w-3 h-3" /> Seedance 2 Settings
                  </span>
                  {showSeedanceSettings ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {/* Seedance Settings Panel */}
                {showSeedanceSettings && (
                  <div className="bg-neutral-800/30 border border-neutral-700 rounded-lg p-3 space-y-3 animate-fade-in">
                    {/* Model Selection */}
                    <div className="space-y-1">
                      <label className="text-[10px] text-neutral-500 uppercase">Model</label>
                      <select
                        className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-white"
                        value={seedanceSettings.model}
                        onChange={(e) => setSeedanceSettings(s => ({ ...s, model: e.target.value as any }))}
                      >
                        {SEEDANCE_MODELS.map(m => (
                          <option key={m.value} value={m.value}>{m.label} — {m.description}</option>
                        ))}
                      </select>
                    </div>

                    {/* Duration & Resolution Row */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] text-neutral-500 uppercase">Duration</label>
                        <select
                          className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-white"
                          value={seedanceSettings.duration}
                          onChange={(e) => setSeedanceSettings(s => ({ ...s, duration: e.target.value as any }))}
                        >
                          {SEEDANCE_DURATIONS.map(d => (
                            <option key={d.value} value={d.value}>{d.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-neutral-500 uppercase">Resolution</label>
                        <select
                          className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-white"
                          value={seedanceSettings.resolution}
                          onChange={(e) => setSeedanceSettings(s => ({ ...s, resolution: e.target.value as any }))}
                        >
                          {SEEDANCE_RESOLUTIONS.map(r => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Aspect Ratio */}
                    <div className="space-y-1">
                      <label className="text-[10px] text-neutral-500 uppercase">Aspect Ratio</label>
                      <select
                        className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-white"
                        value={seedanceSettings.aspectRatio}
                        onChange={(e) => setSeedanceSettings(s => ({ ...s, aspectRatio: e.target.value as any }))}
                      >
                        {SEEDANCE_ASPECT_RATIOS.map(a => (
                          <option key={a.value} value={a.value}>{a.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Negative Prompt */}
                    <div className="space-y-1">
                      <label className="text-[10px] text-neutral-500 uppercase">Negative Prompt</label>
                      <input
                        type="text"
                        className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-white placeholder-neutral-600"
                        placeholder="low quality, blurry..."
                        value={seedanceSettings.negativePrompt || ''}
                        onChange={(e) => setSeedanceSettings(s => ({ ...s, negativePrompt: e.target.value }))}
                      />
                    </div>

                    {/* Seed */}
                    <div className="space-y-1">
                      <label className="text-[10px] text-neutral-500 uppercase">Seed (optional)</label>
                      <input
                        type="number"
                        className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-white placeholder-neutral-600"
                        placeholder="Random"
                        value={seedanceSettings.seed || ''}
                        onChange={(e) => setSeedanceSettings(s => ({ ...s, seed: e.target.value ? parseInt(e.target.value) : undefined }))}
                      />
                    </div>

                    {/* Model-specific hints */}
                    <div className="text-[9px] text-neutral-600 bg-neutral-800/50 rounded p-2">
                      {modelRequiresImage(seedanceSettings.model) && (
                        <p>🖼️ Uses storyboard image as input (image-to-video)</p>
                      )}
                      {modelAcceptsReference(seedanceSettings.model) && (
                        <p>🎨 Reference image(s) will be passed from storyboard</p>
                      )}
                      {!modelRequiresImage(seedanceSettings.model) && !modelAcceptsReference(seedanceSettings.model) && (
                        <p>📝 Text-only generation (no image input)</p>
                      )}
                      <p className="mt-1">⚡ Powered by fal.ai SDK (Seedance 2.0)</p>
                    </div>
                  </div>
                )}

                {/* API Key Warning */}
                {!projectVideoSettings?.falApiKey && (
                  <div className="text-xs text-emerald-400 bg-emerald-900/20 border border-emerald-900/30 rounded px-2 py-1">
                    ⚠️ Add fal.ai API key in Project Settings
                  </div>
                )}

                {/* Image required warning for image-to-video */}
                {modelRequiresImage(seedanceSettings.model) && !shot.imageUrl && (
                  <div className="text-xs text-yellow-400 bg-yellow-900/20 border border-yellow-900/30 rounded px-2 py-1">
                    ⚠️ Generate a storyboard image first (required for Image → Video)
                  </div>
                )}

                {/* ────────────────────────────────────────────────────────── */}
                {/* Reference Videos Picker                                   */}
                {/* Only visible for reference-to-video models — these are    */}
                {/* the only endpoints that accept `video_urls`.              */}
                {/* ────────────────────────────────────────────────────────── */}
                {modelAcceptsReference(seedanceSettings.model) && availableRefVideos.length > 0 && (
                  <div className="space-y-2 animate-fade-in">
                    <button
                      onClick={() => setShowSeedanceRefVideos(!showSeedanceRefVideos)}
                      className="w-full flex items-center justify-between px-3 py-2 bg-emerald-900/10 border border-emerald-900/40 rounded-lg text-sm text-emerald-300 hover:bg-emerald-900/20 transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <Film className="w-3 h-3" />
                        Reference Videos
                        <span className="text-[10px] bg-emerald-900/40 text-emerald-300 px-1.5 py-0.5 rounded-full">
                          {selectedRefVideoKeys.size} / {availableRefVideos.length}
                        </span>
                      </span>
                      {showSeedanceRefVideos ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>

                    {showSeedanceRefVideos && (
                      <div className="bg-neutral-800/30 border border-neutral-700 rounded-lg p-3 space-y-2 animate-fade-in">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] text-neutral-500 uppercase tracking-wider">
                            Select videos to use as motion / style reference
                          </p>
                          {selectedRefVideoKeys.size > 0 && (
                            <button
                              onClick={clearRefVideos}
                              className="text-[10px] text-neutral-400 hover:text-white flex items-center gap-1 bg-neutral-800 hover:bg-neutral-700 px-2 py-0.5 rounded transition-colors"
                            >
                              <X className="w-3 h-3" /> Clear
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                          {availableRefVideos.map(v => {
                            const isSelected = selectedRefVideoKeys.has(v.key);
                            return (
                              <button
                                key={v.key}
                                onClick={() => toggleRefVideo(v.key)}
                                className={`relative text-left rounded-lg overflow-hidden border-2 transition-all group ${isSelected
                                  ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                                  : 'border-neutral-700 hover:border-neutral-500'
                                  }`}
                                title={`${v.sceneName ? v.sceneName + ' • ' : ''}${v.label}${v.sublabel ? ' — ' + v.sublabel : ''}`}
                              >
                                <div className="aspect-video bg-neutral-900">
                                  <video
                                    src={v.url}
                                    className="w-full h-full object-cover"
                                    muted
                                    preload="metadata"
                                  />
                                </div>
                                {/* Selection indicator */}
                                <div className={`absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center ${isSelected ? 'bg-emerald-500' : 'bg-black/60 border border-neutral-600'
                                  }`}>
                                  {isSelected ? (
                                    <CheckSquare className="w-3 h-3 text-black" />
                                  ) : (
                                    <Square className="w-3 h-3 text-neutral-400" />
                                  )}
                                </div>
                                {/* Label overlay */}
                                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent px-2 py-1">
                                  <p className="text-[10px] text-white font-medium truncate">{v.label}</p>
                                  {(v.sceneName || v.sublabel) && (
                                    <p className="text-[9px] text-neutral-400 truncate">
                                      {v.sceneName}
                                      {v.sceneName && v.sublabel ? ' • ' : ''}
                                      {v.sublabel}
                                    </p>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        {selectedRefVideoKeys.size > 0 && (
                          <p className="text-[9px] text-emerald-400/80 bg-emerald-900/10 border border-emerald-900/30 rounded px-2 py-1">
                            ℹ️ {selectedRefVideoKeys.size} video{selectedRefVideoKeys.size === 1 ? '' : 's'} will be uploaded to fal.ai as <code>video_urls</code>. Local (data:/blob:) URLs are uploaded automatically at generation time.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Hint when videos are selected but model doesn't accept them */}
                {!modelAcceptsReference(seedanceSettings.model) && selectedRefVideoKeys.size > 0 && (
                  <div className="text-xs text-yellow-400 bg-yellow-900/20 border border-yellow-900/30 rounded px-2 py-1">
                    ⚠️ {selectedRefVideoKeys.size} reference video{selectedRefVideoKeys.size === 1 ? '' : 's'} selected — switch model to <strong>Reference → Video</strong> to use them.
                  </div>
                )}

                {/* Generate Button */}
                <Button
                  variant="primary"
                  onClick={() => onGenerateSeedance(shot.id, {
                    ...seedanceSettings,
                    // Only pass video refs when the selected model accepts them.
                    referenceVideoUrls: modelAcceptsReference(seedanceSettings.model)
                      ? getSelectedRefVideoUrls()
                      : undefined,
                  })}
                  disabled={shot.isVideoGenerating || shot.isExtending || !projectVideoSettings?.falApiKey || (modelRequiresImage(seedanceSettings.model) && !shot.imageUrl)}
                  className="w-full h-12 bg-emerald-600 hover:bg-emerald-700"
                >
                  {shot.videoUrl
                    ? `Regen Seedance (${seedanceSettings.duration}s)`
                    : `Generate Seedance (${seedanceSettings.duration}s)`}
                </Button>
              </div>
            )}

            {/* Aurora (Creatify) Settings & Generate */}
            {selectedProvider === 'aurora' && (
              <div className="space-y-3 animate-fade-in">
                {/* Aurora Settings Toggle */}
                <button
                  onClick={() => setShowAuroraSettings(!showAuroraSettings)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-neutral-800/50 border border-neutral-700 rounded-lg text-sm text-neutral-300 hover:bg-neutral-800 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Settings className="w-3 h-3" /> Aurora Settings
                  </span>
                  {showAuroraSettings ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {/* Aurora Settings Panel */}
                {showAuroraSettings && (
                  <div className="bg-neutral-800/30 border border-neutral-700 rounded-lg p-3 space-y-3 animate-fade-in">
                    {/* Resolution */}
                    <div className="space-y-1">
                      <label className="text-[10px] text-neutral-500 uppercase">Resolution</label>
                      <select
                        className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-white"
                        value={auroraSettings.resolution}
                        onChange={(e) => setAuroraSettings(s => ({ ...s, resolution: e.target.value as '480p' | '720p' }))}
                      >
                        <option value="480p">480p</option>
                        <option value="720p">720p</option>
                      </select>
                    </div>

                    {/* Guidance Scale */}
                    <div className="space-y-1">
                      <label className="text-[10px] text-neutral-500 uppercase">
                        Prompt Guidance Scale ({auroraSettings.guidanceScale})
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="5"
                        step="0.1"
                        value={auroraSettings.guidanceScale}
                        onChange={(e) => setAuroraSettings(s => ({ ...s, guidanceScale: parseFloat(e.target.value) }))}
                        className="w-full accent-purple-500"
                      />
                      <div className="flex justify-between text-[9px] text-neutral-600">
                        <span>0 (Free)</span>
                        <span>5 (Strict)</span>
                      </div>
                    </div>

                    {/* Audio Guidance Scale */}
                    <div className="space-y-1">
                      <label className="text-[10px] text-neutral-500 uppercase">
                        Audio Guidance Scale ({auroraSettings.audioGuidanceScale})
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="5"
                        step="0.1"
                        value={auroraSettings.audioGuidanceScale}
                        onChange={(e) => setAuroraSettings(s => ({ ...s, audioGuidanceScale: parseFloat(e.target.value) }))}
                        className="w-full accent-purple-500"
                      />
                      <div className="flex justify-between text-[9px] text-neutral-600">
                        <span>0 (Free)</span>
                        <span>5 (Strict)</span>
                      </div>
                    </div>

                    {/* Prompt Override */}
                    <div className="space-y-1">
                      <label className="text-[10px] text-neutral-500 uppercase">Prompt Override (optional)</label>
                      <input
                        type="text"
                        className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-white placeholder-neutral-600"
                        placeholder="Custom prompt for Aurora (overrides Director's Prompt)"
                        value={auroraSettings.prompt || ''}
                        onChange={(e) => setAuroraSettings(s => ({ ...s, prompt: e.target.value }))}
                      />
                      <p className="text-[9px] text-neutral-600">If empty, uses the Director's Prompt above</p>
                    </div>
                  </div>
                )}

                {/* Audio Input - Upload or URL */}
                <div className="space-y-2">
                  <label className="text-[10px] text-neutral-500 uppercase flex items-center gap-1">
                    <Music className="w-3 h-3" /> Audio <span className="text-red-500">*</span>
                  </label>

                  {/* Upload Button */}
                  <input
                    ref={audioFileInputRef}
                    type="file"
                    accept="audio/wav,audio/mp3,audio/mpeg,audio/x-wav,.wav,.mp3"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleAudioFileUpload(file);
                      e.target.value = '';
                    }}
                  />
                  <button
                    onClick={() => audioFileInputRef.current?.click()}
                    disabled={isUploadingAudio || !projectVideoSettings?.falApiKey}
                    className={`w-full flex items-center justify-center gap-2 px-3 py-3 rounded-lg border-2 border-dashed transition-all ${isUploadingAudio
                      ? 'border-purple-600 bg-purple-900/20 text-purple-300 cursor-wait'
                      : uploadedAudioName
                        ? 'border-green-700 bg-green-900/20 text-green-300 hover:bg-green-900/30'
                        : 'border-neutral-700 bg-neutral-800/30 text-neutral-400 hover:border-purple-600 hover:bg-purple-900/10 hover:text-purple-300'
                      }`}
                  >
                    {isUploadingAudio ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-xs">Uploading audio...</span>
                      </>
                    ) : uploadedAudioName ? (
                      <>
                        <Music className="w-4 h-4" />
                        <span className="text-xs truncate max-w-[180px]">✓ {uploadedAudioName}</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        <span className="text-xs">Upload WAV / MP3 file</span>
                      </>
                    )}
                  </button>

                  {/* Record from Mic */}
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isUploadingAudio || !projectVideoSettings?.falApiKey}
                    className={`w-full flex items-center justify-center gap-2 px-3 py-3 rounded-lg border-2 transition-all ${isRecording
                      ? 'border-red-500 bg-red-900/30 text-red-300 animate-pulse'
                      : 'border-neutral-700 bg-neutral-800/30 text-neutral-400 hover:border-red-600 hover:bg-red-900/10 hover:text-red-300'
                      }`}
                  >
                    {isRecording ? (
                      <>
                        <StopCircle className="w-4 h-4" />
                        <span className="text-xs font-mono">
                          Stop Recording — {Math.floor(recordingSeconds / 60)}:{(recordingSeconds % 60).toString().padStart(2, '0')} / 1:00
                        </span>
                      </>
                    ) : (
                      <>
                        <Mic className="w-4 h-4" />
                        <span className="text-xs">Record from Mic (max 60s)</span>
                      </>
                    )}
                  </button>
                  {isRecording && (
                    <div className="w-full bg-neutral-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-red-500 h-full transition-all duration-1000 ease-linear"
                        style={{ width: `${(recordingSeconds / MAX_RECORDING_SECONDS) * 100}%` }}
                      />
                    </div>
                  )}

                  {/* Or paste URL */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 border-t border-neutral-800" />
                    <span className="text-[9px] text-neutral-600 uppercase">or paste url</span>
                    <div className="flex-1 border-t border-neutral-800" />
                  </div>
                  <input
                    type="url"
                    className={`w-full bg-neutral-800 border rounded px-2 py-2 text-xs text-white placeholder-neutral-600 focus:outline-none ${auroraSettings.audioUrl ? 'border-neutral-700' : 'border-red-900/50'
                      }`}
                    placeholder="https://example.com/audio.wav"
                    value={auroraSettings.audioUrl}
                    onChange={(e) => {
                      setAuroraSettings(s => ({ ...s, audioUrl: e.target.value }));
                      setUploadedAudioName(null);
                    }}
                  />
                  <p className="text-[9px] text-neutral-600">Audio drives lip-sync and motion generation</p>

                  {/* Audio Preview Player */}
                  {auroraSettings.audioUrl && (
                    <div className="mt-2 bg-neutral-800/50 border border-neutral-700 rounded-lg p-2">
                      <div className="flex items-center gap-2 mb-1">
                        <Play className="w-3 h-3 text-purple-400" />
                        <span className="text-[10px] text-purple-400 uppercase font-bold">Audio Preview</span>
                        {uploadedAudioName && (
                          <span className="text-[10px] text-neutral-500 truncate max-w-[120px]">{uploadedAudioName}</span>
                        )}
                      </div>
                      <audio
                        src={auroraSettings.audioUrl}
                        controls
                        className="w-full h-8"
                        style={{ filter: 'invert(1) hue-rotate(180deg)', opacity: 0.8 }}
                      />
                    </div>
                  )}
                </div>

                {/* API Key Warning */}
                {!projectVideoSettings?.falApiKey && (
                  <div className="text-xs text-purple-400 bg-purple-900/20 border border-purple-900/30 rounded px-2 py-1">
                    ⚠️ Add fal.ai API key in Project Settings
                  </div>
                )}

                {/* Audio URL Required Warning */}
                {projectVideoSettings?.falApiKey && !auroraSettings.audioUrl && (
                  <div className="text-xs text-purple-400 bg-purple-900/20 border border-purple-900/30 rounded px-2 py-1">
                    ⚠️ Audio URL is required for Lip Sync generation
                  </div>
                )}

                {/* Last Frame Indicator */}
                {shot.videoUrl && (
                  <div className="text-xs text-blue-400 bg-blue-900/20 border border-blue-900/30 rounded px-2 py-1 flex items-center gap-1">
                    🎬 Last frame of existing video will be used as source image
                  </div>
                )}

                {/* Generate Button */}
                <Button
                  variant="primary"
                  onClick={() => onGenerateAurora(shot.id, {
                    ...auroraSettings,
                    prompt: auroraSettings.prompt || displayPrompt,
                  })}
                  disabled={shot.isVideoGenerating || shot.isExtending || !shot.imageUrl || !projectVideoSettings?.falApiKey || !auroraSettings.audioUrl}
                  className="w-full h-12 bg-purple-600 hover:bg-purple-700"
                >
                  {shot.videoUrl ? 'Regenerate Lip Sync' : 'Generate Lip Sync'}
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

            {/* Extend Video - Seedance */}
            {shot.videoUrl && selectedProvider === 'seedance' && (() => {
              const lastSeedanceTaskId = [...(shot.videoSegments || [])].reverse().find(s => s.seedanceTaskId)?.seedanceTaskId;
              return lastSeedanceTaskId ? (
                <div className="space-y-2 pt-4 border-t border-neutral-800 animate-fade-in">
                  <label className="text-xs font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                    <MonitorPlay className="w-3 h-3" /> Extend Video (Seedance)
                  </label>
                  <p className="text-[9px] text-neutral-500">
                    Continues from the last Seedance-generated segment using parent_task_id.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => onExtendSeedance(shot.id, seedanceSettings)}
                    disabled={shot.isVideoGenerating || shot.isExtending}
                    className="w-full h-10 text-xs border-emerald-700 hover:bg-emerald-900/30 text-emerald-300"
                  >
                    Extend Seedance ({seedanceSettings.duration}s)
                  </Button>
                </div>
              ) : null;
            })()}
          </div>

        </div>
      </div>
    </div>
  );
};
