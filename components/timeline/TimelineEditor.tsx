import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Project, Shot, Scene } from '../../types';
import {
  Play, Pause, SkipBack, SkipForward, ZoomIn, ZoomOut,
  Scissors, Lock, Unlock, Eye, EyeOff, Trash2,
  Volume2, VolumeX, Film, Music, Layers, RefreshCw,
  FastForward, Rewind, ChevronDown, ChevronRight,
  Monitor, Clapperboard, Download
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface TimelineClip {
  id: string;
  shotId: string;
  sceneId: string;
  trackId: string;
  startFrame: number;
  durationFrames: number;
  label: string;
  color: string;
  imageUrl?: string;
  videoUrl?: string;
  locked: boolean;
  muted: boolean;
  inPoint: number;
  outPoint: number;
  speed: number;
  opacity: number;
}

interface TimelineTrack {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'overlay';
  locked: boolean;
  muted: boolean;
  visible: boolean;
  color: string;
  height: number;
}

interface SourceItem {
  shotId: string;
  sceneId: string;
  sceneName: string;
  shotNumber: number;
  description: string;
  imageUrl?: string;
  videoUrl?: string;
  durationFrames: number;
  color: string;
}

export interface TimelineEditorProps {
  project: Project;
  onUpdateProject: (project: Project) => void;
}

export interface TimelineHandle {
  insertClips: (shotIds: { sceneId: string; shotId: string }[], trackId?: string) => void;
  clearTimeline: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const FPS = 30;
const DEFAULT_SHOT_DURATION_SEC = 5;
const DEFAULT_SHOT_DURATION = DEFAULT_SHOT_DURATION_SEC * FPS;
const TRACK_HEADER_WIDTH = 120;
const RULER_HEIGHT = 28;
const TRIM_HANDLE_WIDTH = 8;
const MIN_PANEL_H = 180;
const MIN_SOURCE_W = 240;
const MIN_PROGRAM_W = 320;
const DIVIDER_SIZE = 6;
const SHOT_COLORS = [
  '#dc2626', '#ea580c', '#ca8a04', '#16a34a',
  '#0891b2', '#7c3aed', '#db2777', '#475569',
];
const CLIP_COLORS = [
  { name: 'Red', value: '#dc2626' },
  { name: 'Orange', value: '#ea580c' },
  { name: 'Yellow', value: '#ca8a04' },
  { name: 'Green', value: '#16a34a' },
  { name: 'Teal', value: '#0891b2' },
  { name: 'Purple', value: '#7c3aed' },
  { name: 'Pink', value: '#db2777' },
  { name: 'Slate', value: '#475569' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function framesToTimecode(frames: number, fps: number = FPS): string {
  const totalSeconds = Math.floor(frames / fps);
  const f = frames % fps;
  const s = totalSeconds % 60;
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
}

function timecodeToFrames(tc: string, fps: number = FPS): number | null {
  const parts = tc.split(':').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return null;
  const [h, m, s, f] = parts;
  return h * 3600 * fps + m * 60 * fps + s * fps + f;
}

function secondsToFrames(sec: number): number {
  return Math.round(sec * FPS);
}

function loadVideoDuration(url: string): Promise<number> {
  return new Promise(resolve => {
    const vid = document.createElement('video');
    vid.preload = 'metadata';
    vid.onloadedmetadata = () => resolve(secondsToFrames(vid.duration));
    vid.onerror = () => resolve(DEFAULT_SHOT_DURATION);
    vid.src = url;
  });
}

const DEFAULT_TRACKS: TimelineTrack[] = [
  { id: 'v1', name: 'Video 1', type: 'video', locked: false, muted: false, visible: true, color: '#dc2626', height: 48 },
  { id: 'v2', name: 'Video 2', type: 'video', locked: false, muted: false, visible: true, color: '#ea580c', height: 48 },
  { id: 'a1', name: 'Audio 1', type: 'audio', locked: false, muted: false, visible: true, color: '#16a34a', height: 32 },
  { id: 'a2', name: 'Audio 2', type: 'audio', locked: false, muted: false, visible: true, color: '#0891b2', height: 32 },
  { id: 'ol', name: 'Overlays', type: 'overlay', locked: false, muted: false, visible: true, color: '#7c3aed', height: 28 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Source Monitor Component
// ─────────────────────────────────────────────────────────────────────────────

interface SourceMonitorProps {
  items: SourceItem[];
  onSendToTimeline: (item: SourceItem, trackId: string) => void;
  tracks: TimelineTrack[];
}

const SourceMonitor: React.FC<SourceMonitorProps> = ({ items, onSendToTimeline, tracks }) => {
  const [selected, setSelected] = useState<SourceItem | null>(null);
  const [targetTrack, setTargetTrack] = useState('v1');
  const [expandedScenes, setExpandedScenes] = useState<Set<string>>(new Set());
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoTime, setVideoTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isSourcePlaying, setIsSourcePlaying] = useState(false);

  const byScene = useMemo(() => {
    const map = new Map<string, { sceneName: string; items: SourceItem[] }>();
    for (const item of items) {
      if (!map.has(item.sceneId)) map.set(item.sceneId, { sceneName: item.sceneName, items: [] });
      map.get(item.sceneId)!.items.push(item);
    }
    return map;
  }, [items]);

  useEffect(() => {
    setExpandedScenes(new Set(Array.from(byScene.keys())));
  }, [byScene]);

  const selectItem = (item: SourceItem) => {
    setSelected(item);
    setIsSourcePlaying(false);
    setVideoTime(0);
    setVideoDuration(item.durationFrames / FPS);
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime = 0; }
  };

  const toggleSourcePlay = () => {
    if (!selected) return;
    if (selected.videoUrl && videoRef.current) {
      if (isSourcePlaying) { videoRef.current.pause(); setIsSourcePlaying(false); }
      else { videoRef.current.play().then(() => setIsSourcePlaying(true)).catch(() => { }); }
    }
  };

  const progress = videoDuration > 0 ? videoTime / videoDuration : 0;

  return (
    <div className="flex flex-col h-full bg-neutral-950">
      <div className="flex items-center justify-between px-3 py-1.5 bg-neutral-900 border-b border-neutral-800 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <Clapperboard size={13} className="text-red-500" />
          <span className="text-xs text-neutral-300 font-medium uppercase tracking-wider">Source Monitor</span>
        </div>
        <span className="text-xs text-neutral-600">{items.length} clips</span>
      </div>

      <div className="relative bg-black flex items-center justify-center flex-1 min-h-0">
        {selected?.videoUrl ? (
          <video ref={videoRef} src={selected.videoUrl} className="max-w-full max-h-full object-contain"
            onTimeUpdate={() => { if (videoRef.current) setVideoTime(videoRef.current.currentTime); }}
            onEnded={() => setIsSourcePlaying(false)}
            onLoadedMetadata={() => { if (videoRef.current) setVideoDuration(videoRef.current.duration); }}
            onPlay={() => setIsSourcePlaying(true)} onPause={() => setIsSourcePlaying(false)} playsInline />
        ) : selected?.imageUrl ? (
          <img src={selected.imageUrl} alt={selected.description} className="max-w-full max-h-full object-contain" draggable={false} />
        ) : (
          <div className="flex flex-col items-center gap-2 text-neutral-700">
            <Monitor size={28} strokeWidth={1} />
            <span className="text-xs">Select a clip to preview</span>
          </div>
        )}
        {selected && (
          <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 bg-black/70 px-2 py-0.5 rounded font-mono text-xs text-white tracking-widest">
            {framesToTimecode(Math.round(videoTime * FPS))} / {framesToTimecode(Math.round(videoDuration * FPS))}
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-neutral-800 flex-shrink-0 cursor-pointer" onClick={e => {
        if (!selected || !videoDuration) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const t = ((e.clientX - rect.left) / rect.width) * videoDuration;
        setVideoTime(t);
        if (videoRef.current) videoRef.current.currentTime = t;
      }}>
        <div className="h-full bg-red-600" style={{ width: `${progress * 100}%` }} />
      </div>

      {/* Source transport */}
      <div className="flex items-center justify-center gap-1 px-2 py-1 bg-neutral-900 border-b border-neutral-800 flex-shrink-0">
        <button onClick={() => { setVideoTime(0); if (videoRef.current) videoRef.current.currentTime = 0; }} className="p-1 hover:bg-neutral-700 rounded">
          <SkipBack size={12} className="text-neutral-400" />
        </button>
        <button onClick={toggleSourcePlay} className="p-1.5 bg-red-700 hover:bg-red-600 rounded-full">
          {isSourcePlaying ? <Pause size={12} className="text-white" fill="white" /> : <Play size={12} className="text-white" fill="white" />}
        </button>
        <button onClick={() => { if (videoRef.current) { videoRef.current.currentTime = videoDuration; setVideoTime(videoDuration); } }} className="p-1 hover:bg-neutral-700 rounded">
          <SkipForward size={12} className="text-neutral-400" />
        </button>
        <div className="flex items-center gap-1 ml-2 border-l border-neutral-700 pl-2">
          <select value={targetTrack} onChange={e => setTargetTrack(e.target.value)}
            className="text-xs bg-neutral-800 border border-neutral-700 rounded px-1 py-0.5 text-neutral-300">
            {tracks.filter(t => t.type === 'video').map(t => (<option key={t.id} value={t.id}>{t.name}</option>))}
          </select>
          <button onClick={() => { if (selected) onSendToTimeline(selected, targetTrack); }} disabled={!selected}
            className="flex items-center gap-1 px-2 py-0.5 text-xs bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed rounded text-white"
            title="Insert clip at playhead on selected track">
            Insert
          </button>
        </div>
      </div>

      {/* Clip browser */}
      <div className="flex-1 overflow-y-auto min-h-0 bg-neutral-950">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-neutral-700 p-4 text-center">
            <Film size={24} strokeWidth={1} className="mb-2" />
            <span className="text-xs">No shots yet. Generate shots in the Storyboard tab first.</span>
          </div>
        ) : (
          Array.from(byScene.entries()).map(([sceneId, { sceneName, items: sceneItems }]) => (
            <div key={sceneId}>
              <button onClick={() => setExpandedScenes(prev => { const n = new Set(prev); n.has(sceneId) ? n.delete(sceneId) : n.add(sceneId); return n; })}
                className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800 border-b border-neutral-900">
                {expandedScenes.has(sceneId) ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                <span className="font-medium">{sceneName}</span>
                <span className="text-neutral-600 ml-auto">{sceneItems.length}</span>
              </button>
              {expandedScenes.has(sceneId) && sceneItems.map(item => (
                <div key={item.shotId}
                  className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer border-b border-neutral-900 transition-colors ${selected?.shotId === item.shotId ? 'bg-red-950/40 border-l-2 border-l-red-600' : 'hover:bg-neutral-800/50'}`}
                  onClick={() => selectItem(item)} onDoubleClick={() => onSendToTimeline(item, targetTrack)}>
                  <div className="w-12 h-7 rounded overflow-hidden bg-neutral-800 flex-shrink-0">
                    {item.imageUrl ? <img src={item.imageUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Film size={10} className="text-neutral-600" /></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-neutral-300 truncate">Shot {item.shotNumber}</p>
                    <p className="text-xs text-neutral-600 truncate">{item.description}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {item.videoUrl && <Film size={9} className="text-green-500" />}
                    <span className="text-xs text-neutral-600 font-mono">{framesToTimecode(item.durationFrames)}</span>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Timeline Editor
// ─────────────────────────────────────────────────────────────────────────────

export const TimelineEditor: React.FC<TimelineEditorProps> = ({ project, onUpdateProject }) => {
  // ── State ──────────────────────────────────────────────────────────────────
  const [tracks, setTracks] = useState<TimelineTrack[]>([...DEFAULT_TRACKS]);
  const [clips, setClips] = useState<TimelineClip[]>([]);
  const [playheadFrame, _setPlayheadFrame] = useState(0);
  const [isPlaying, _setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [inPoint, setInPoint] = useState<number | null>(null);
  const [outPoint, setOutPoint] = useState<number | null>(null);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [isDraggingClip, setIsDraggingClip] = useState<{ clipId: string; offsetFrames: number } | null>(null);
  const [isTrimming, setIsTrimming] = useState<{ clipId: string; edge: 'left' | 'right'; startX: number; origStartFrame: number; origDuration: number; origInPoint: number; origOutPoint: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; clipId: string } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [monitorHeight, setMonitorHeight] = useState(0.32);
  const [sourceWidth, setSourceWidth] = useState(0.35);
  const [isDraggingHDivider, setIsDraggingHDivider] = useState(false);
  const [isDraggingVDivider, setIsDraggingVDivider] = useState(false);
  const [sourceDurations, setSourceDurations] = useState<Map<string, number>>(new Map());

  // ── Refs (critical for playback engine) ───────────────────────────────────
  const playheadRef = useRef(0);
  const isPlayingRef = useRef(false);
  const clipsRef = useRef<TimelineClip[]>([]);
  const tracksRef = useRef<TimelineTrack[]>([]);
  const totalFramesRef = useRef(FPS * 60);
  const animFrameRef = useRef<number | null>(null);
  const programVideoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const rulerScrollRef = useRef<HTMLDivElement>(null);
  const tracksScrollRef = useRef<HTMLDivElement>(null);
  const activeVideoClipIdRef = useRef<string | null>(null);

  // Sync refs with state
  clipsRef.current = clips;
  tracksRef.current = tracks;

  // Wrapped setters that keep refs in sync
  const setPlayheadFrame = useCallback((v: number | ((prev: number) => number)) => {
    _setPlayheadFrame(prev => {
      const next = typeof v === 'function' ? v(prev) : v;
      playheadRef.current = next;
      return next;
    });
  }, []);

  const setIsPlaying = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    _setIsPlaying(prev => {
      const next = typeof v === 'function' ? v(prev) : v;
      isPlayingRef.current = next;
      return next;
    });
  }, []);

  // ── Source items with proper duration loading ─────────────────────────────
  const sourceItems = useMemo<SourceItem[]>(() => {
    const items: SourceItem[] = [];
    for (const scene of project.scenes) {
      scene.shots.forEach((shot, i) => {
        const loadedDur = sourceDurations.get(shot.id);
        items.push({
          shotId: shot.id, sceneId: scene.id, sceneName: scene.name || `Scene ${project.scenes.indexOf(scene) + 1}`,
          shotNumber: i + 1, description: shot.description || `Shot ${i + 1}`,
          imageUrl: shot.imageUrl, videoUrl: shot.videoUrl,
          durationFrames: loadedDur ?? DEFAULT_SHOT_DURATION,
          color: SHOT_COLORS[i % SHOT_COLORS.length],
        });
      });
    }
    return items;
  }, [project.scenes, sourceDurations]);

  // Load actual video durations into state (not mutating memoized array)
  useEffect(() => {
    let cancelled = false;
    const loadDurations = async () => {
      const newDurations = new Map<string, number>();
      for (const scene of project.scenes) {
        for (const shot of scene.shots) {
          if (shot.videoUrl) {
            try {
              const dur = await loadVideoDuration(shot.videoUrl);
              if (!cancelled) newDurations.set(shot.id, dur);
            } catch (_e) { /* ignore */ }
          }
        }
      }
      if (!cancelled && newDurations.size > 0) {
        setSourceDurations(prev => {
          const merged = new Map(prev);
          newDurations.forEach((v, k) => merged.set(k, v));
          return merged;
        });
      }
    };
    loadDurations();
    return () => { cancelled = true; };
  }, [project.scenes]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const totalFrames = useMemo(() => {
    const maxClipEnd = clips.reduce((max, c) => Math.max(max, c.startFrame + (c.outPoint - c.inPoint)), 0);
    return Math.max(FPS * 60, maxClipEnd + FPS * 10);
  }, [clips]);
  totalFramesRef.current = totalFrames;

  // Get the topmost visible video clip at a given frame (uses refs for playback)
  const getClipAtFrameRef = useCallback((frame: number): TimelineClip | null => {
    const currentClips = clipsRef.current;
    const currentTracks = tracksRef.current;
    for (const c of currentClips) {
      const visibleDuration = c.outPoint - c.inPoint;
      if (frame >= c.startFrame && frame < c.startFrame + visibleDuration) {
        const track = currentTracks.find(t => t.id === c.trackId);
        if (track && track.type === 'video' && track.visible && !track.muted) return c;
      }
    }
    return null;
  }, []);

  // Same but using state (for rendering)
  const getClipAtFrame = useCallback((frame: number): TimelineClip | null => {
    for (const c of clips) {
      const visibleDuration = c.outPoint - c.inPoint;
      if (frame >= c.startFrame && frame < c.startFrame + visibleDuration) {
        const track = tracks.find(t => t.id === c.trackId);
        if (track && track.type === 'video' && track.visible && !track.muted) return c;
      }
    }
    return null;
  }, [clips, tracks]);

  const currentClip = getClipAtFrame(playheadFrame);

  // ── Resizable panel drag handlers ─────────────────────────────────────────

  useEffect(() => {
    if (!isDraggingHDivider) return;
    const onMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const totalH = rect.height;
      const y = e.clientY - rect.top;
      const fraction = Math.max(MIN_PANEL_H / totalH, Math.min(1 - MIN_PANEL_H / totalH, y / totalH));
      setMonitorHeight(fraction);
    };
    const onUp = () => setIsDraggingHDivider(false);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDraggingHDivider]);

  useEffect(() => {
    if (!isDraggingVDivider) return;
    const onMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const totalW = rect.width;
      const x = e.clientX - rect.left;
      const fraction = Math.max(MIN_SOURCE_W / totalW, Math.min(1 - MIN_PROGRAM_W / totalW, x / totalW));
      setSourceWidth(fraction);
    };
    const onUp = () => setIsDraggingVDivider(false);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDraggingVDivider]);

  // ═══════════════════════════════════════════════════════════════════════════
  // PLAYBACK ENGINE (completely rewritten — ref-based, no stale closures)
  // ═══════════════════════════════════════════════════════════════════════════

  const togglePlay = useCallback(() => {
    setIsPlaying(p => !p);
  }, [setIsPlaying]);

  // Stop playback cleanly
  const stopPlayback = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    const vid = programVideoRef.current;
    if (vid && !vid.paused) {
      vid.pause();
    }
    activeVideoClipIdRef.current = null;
  }, []);

  // Main playback effect — runs when isPlaying changes
  useEffect(() => {
    if (!isPlaying) {
      stopPlayback();
      return;
    }

    // The unified playback loop
    let lastTime = performance.now();
    let frameAccumulator = 0;

    const tick = (now: number) => {
      // Always check the ref, never the closure
      if (!isPlayingRef.current) return;

      const delta = now - lastTime;
      lastTime = now;
      frameAccumulator += (delta / 1000) * FPS;

      const framesToAdvance = Math.floor(frameAccumulator);
      if (framesToAdvance <= 0) {
        animFrameRef.current = requestAnimationFrame(tick);
        return;
      }
      frameAccumulator -= framesToAdvance;

      const currentFrame = playheadRef.current;
      const clip = getClipAtFrameRef(currentFrame);

      // If we're on a video clip, let the video drive the playhead
      if (clip?.videoUrl && programVideoRef.current) {
        const vid = programVideoRef.current;

        // If this is a new video clip, set it up (imperative src change)
        if (activeVideoClipIdRef.current !== clip.id) {
          activeVideoClipIdRef.current = clip.id;
          if (vid.src !== clip.videoUrl) {
            vid.src = clip.videoUrl!;
            vid.load();
          }
          const clipLocalFrame = currentFrame - clip.startFrame + clip.inPoint;
          vid.currentTime = clipLocalFrame / FPS;
          vid.playbackRate = clip.speed || 1;
          vid.play().catch(() => { });
        }

        // Read the video's current time and derive the playhead position
        const videoTime = vid.currentTime;
        const clipFrame = clip.startFrame + Math.round(videoTime * FPS) - clip.inPoint;
        const clipEnd = clip.startFrame + (clip.outPoint - clip.inPoint);

        if (clipFrame >= clipEnd || vid.ended) {
          // Video clip ended — move playhead to end of clip and continue
          vid.pause();
          activeVideoClipIdRef.current = null;
          const newFrame = clipEnd;

          if (newFrame >= totalFramesRef.current - 1) {
            // End of timeline
            setPlayheadFrame(totalFramesRef.current - 1);
            setIsPlaying(false);
            return;
          }

          setPlayheadFrame(newFrame);

          // Check if there's another clip immediately after
          const nextClip = getClipAtFrameRef(newFrame);
          if (nextClip?.videoUrl && programVideoRef.current) {
            // Seamless transition to next video clip — imperative src change
            activeVideoClipIdRef.current = nextClip.id;
            if (programVideoRef.current.src !== nextClip.videoUrl) {
              programVideoRef.current.src = nextClip.videoUrl!;
              programVideoRef.current.load();
            }
            const nextLocalFrame = newFrame - nextClip.startFrame + nextClip.inPoint;
            programVideoRef.current.currentTime = nextLocalFrame / FPS;
            programVideoRef.current.playbackRate = nextClip.speed || 1;
            programVideoRef.current.play().catch(() => { });
          }
        } else {
          setPlayheadFrame(Math.max(clip.startFrame, Math.min(clipEnd - 1, clipFrame)));
        }
      } else {
        // No video clip — advance playhead via RAF
        if (activeVideoClipIdRef.current) {
          // Was on a video clip, now we're not — pause the video
          if (programVideoRef.current && !programVideoRef.current.paused) {
            programVideoRef.current.pause();
          }
          activeVideoClipIdRef.current = null;
        }

        const nextFrame = currentFrame + framesToAdvance;
        if (nextFrame >= totalFramesRef.current - 1) {
          setPlayheadFrame(totalFramesRef.current - 1);
          setIsPlaying(false);
          return;
        }

        // Check if we're about to enter a video clip
        const nextClip = getClipAtFrameRef(nextFrame);
        if (nextClip?.videoUrl && programVideoRef.current) {
          // Entering a video clip — imperative src change + play
          setPlayheadFrame(nextFrame);
          activeVideoClipIdRef.current = nextClip.id;
          if (programVideoRef.current.src !== nextClip.videoUrl) {
            programVideoRef.current.src = nextClip.videoUrl!;
            programVideoRef.current.load();
          }
          const clipLocalFrame = nextFrame - nextClip.startFrame + nextClip.inPoint;
          programVideoRef.current.currentTime = clipLocalFrame / FPS;
          programVideoRef.current.playbackRate = nextClip.speed || 1;
          programVideoRef.current.play().catch(() => { });
        } else {
          setPlayheadFrame(nextFrame);
        }
      }

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [isPlaying, stopPlayback, getClipAtFrameRef, setPlayheadFrame, setIsPlaying]);

  // Sync video element when scrubbing (paused) — imperative src update
  useEffect(() => {
    if (isPlaying) return;
    const vid = programVideoRef.current;
    if (!vid) return;

    const clip = getClipAtFrame(playheadFrame);
    if (clip?.videoUrl) {
      // Update src if we moved to a different clip
      if (vid.src !== clip.videoUrl) {
        vid.src = clip.videoUrl;
        vid.load();
      }
      const clipLocalFrame = playheadFrame - clip.startFrame + clip.inPoint;
      const targetTime = clipLocalFrame / FPS;
      if (Math.abs(vid.currentTime - targetTime) > 0.04) {
        vid.currentTime = targetTime;
      }
    }
  }, [playheadFrame, isPlaying, getClipAtFrame]);

  // Volume sync
  useEffect(() => {
    if (programVideoRef.current) programVideoRef.current.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  // ── Derived layout ────────────────────────────────────────────────────────

  const pxPerFrame = zoom * 2;
  const selectedClip = clips.find(c => c.id === selectedClipId) ?? null;
  const timelineWidth = totalFrames * pxPerFrame;

  const rulerMarks = useMemo(() => {
    const marks: { frame: number; label: string }[] = [];
    const minPx = 60;
    const framesPerMark = Math.max(1, Math.ceil(minPx / pxPerFrame / FPS) * FPS);
    for (let f = 0; f <= totalFrames; f += framesPerMark) {
      const s = Math.floor(f / FPS);
      const m = Math.floor(s / 60);
      const sec = s % 60;
      marks.push({ frame: f, label: `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` });
    }
    return marks;
  }, [totalFrames, pxPerFrame]);

  // Sync ruler and tracks scroll
  useEffect(() => {
    const tEl = tracksScrollRef.current;
    const rEl = rulerScrollRef.current;
    if (!tEl || !rEl) return;
    const onT = () => { rEl.scrollLeft = tEl.scrollLeft; };
    const onR = () => { tEl.scrollLeft = rEl.scrollLeft; };
    tEl.addEventListener('scroll', onT);
    rEl.addEventListener('scroll', onR);
    return () => { tEl.removeEventListener('scroll', onT); rEl.removeEventListener('scroll', onR); };
  }, []);

  // ── Insert clip from Source Monitor ────────────────────────────────────────

  const handleInsertFromSource = useCallback((item: SourceItem, trackId: string) => {
    const trackClips = clips.filter(c => c.trackId === trackId).sort((a, b) => a.startFrame - b.startFrame);
    let startFrame = playheadFrame;
    for (const tc of trackClips) {
      const tcVisibleDur = tc.outPoint - tc.inPoint;
      if (startFrame < tc.startFrame + tcVisibleDur && startFrame + item.durationFrames > tc.startFrame) {
        startFrame = tc.startFrame + tcVisibleDur;
      }
    }
    const newClip: TimelineClip = {
      id: crypto.randomUUID(), shotId: item.shotId, sceneId: item.sceneId, trackId, startFrame,
      durationFrames: item.durationFrames, label: `${item.sceneName} · Shot ${item.shotNumber}`,
      color: item.color, imageUrl: item.imageUrl, videoUrl: item.videoUrl,
      locked: false, muted: false, inPoint: 0, outPoint: item.durationFrames,
      speed: 1, opacity: 1,
    };
    setClips(prev => [...prev, newClip]);
    setSelectedClipId(newClip.id);
  }, [clips, playheadFrame]);

  // ── Playhead drag ─────────────────────────────────────────────────────────

  const handleRulerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    setIsDraggingPlayhead(true);
    setIsPlaying(false);
    const rect = e.currentTarget.getBoundingClientRect();
    const scrollLeft = rulerScrollRef.current?.scrollLeft ?? 0;
    const x = e.clientX - rect.left + scrollLeft;
    setPlayheadFrame(Math.max(0, Math.min(totalFrames - 1, Math.round(x / pxPerFrame))));
  };

  useEffect(() => {
    if (!isDraggingPlayhead) return;
    const onMove = (e: MouseEvent) => {
      const ruler = rulerRef.current;
      if (!ruler) return;
      const rect = ruler.getBoundingClientRect();
      const scrollLeft = rulerScrollRef.current?.scrollLeft ?? 0;
      const x = e.clientX - rect.left + scrollLeft;
      setPlayheadFrame(Math.max(0, Math.min(totalFrames - 1, Math.round(x / pxPerFrame))));
    };
    const onUp = () => setIsDraggingPlayhead(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isDraggingPlayhead, pxPerFrame, totalFrames, setPlayheadFrame]);

  // ── Clip drag ─────────────────────────────────────────────────────────────

  const handleClipMouseDown = (e: React.MouseEvent, clip: TimelineClip) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setSelectedClipId(clip.id);
    if (clip.locked) return;
    const clipLeftPx = clip.startFrame * pxPerFrame;
    const tracksEl = tracksScrollRef.current;
    if (!tracksEl) return;
    const rect = tracksEl.getBoundingClientRect();
    const scrollLeft = tracksEl.scrollLeft;
    const clickPx = e.clientX - rect.left + scrollLeft - TRACK_HEADER_WIDTH;
    const offsetFrames = Math.round((clickPx - clipLeftPx) / pxPerFrame);
    setIsDraggingClip({ clipId: clip.id, offsetFrames });
  };

  useEffect(() => {
    if (!isDraggingClip) return;
    const onMove = (e: MouseEvent) => {
      const tracksEl = tracksScrollRef.current;
      if (!tracksEl) return;
      const rect = tracksEl.getBoundingClientRect();
      const scrollLeft = tracksEl.scrollLeft;
      const x = e.clientX - rect.left + scrollLeft - TRACK_HEADER_WIDTH;
      const newStart = Math.max(0, Math.round(x / pxPerFrame) - isDraggingClip.offsetFrames);
      setClips(prev => prev.map(c => c.id === isDraggingClip.clipId ? { ...c, startFrame: newStart } : c));
    };
    const onUp = () => setIsDraggingClip(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isDraggingClip, pxPerFrame]);

  // ── Edge Trimming ─────────────────────────────────────────────────────────

  const handleTrimMouseDown = (e: React.MouseEvent, clip: TimelineClip, edge: 'left' | 'right') => {
    e.stopPropagation(); e.preventDefault();
    if (clip.locked) return;
    setIsTrimming({ clipId: clip.id, edge, startX: e.clientX, origStartFrame: clip.startFrame, origDuration: clip.durationFrames, origInPoint: clip.inPoint, origOutPoint: clip.outPoint });
  };

  useEffect(() => {
    if (!isTrimming) return;
    const onMove = (e: MouseEvent) => {
      const deltaX = e.clientX - isTrimming.startX;
      const deltaFrames = Math.round(deltaX / pxPerFrame);
      setClips(prev => prev.map(c => {
        if (c.id !== isTrimming.clipId) return c;
        if (isTrimming.edge === 'left') {
          const newInPoint = Math.max(0, Math.min(isTrimming.origOutPoint - FPS, isTrimming.origInPoint + deltaFrames));
          const inDelta = newInPoint - isTrimming.origInPoint;
          return { ...c, startFrame: isTrimming.origStartFrame + inDelta, inPoint: newInPoint };
        } else {
          const newOutPoint = Math.max(isTrimming.origInPoint + FPS, Math.min(isTrimming.origDuration, isTrimming.origOutPoint + deltaFrames));
          return { ...c, outPoint: newOutPoint };
        }
      }));
    };
    const onUp = () => setIsTrimming(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isTrimming, pxPerFrame]);

  // ── Clip operations ───────────────────────────────────────────────────────

  const deleteClip = (id: string) => {
    setClips(prev => prev.filter(c => c.id !== id));
    setContextMenu(null);
    if (selectedClipId === id) setSelectedClipId(null);
  };

  const rippleDeleteClip = (id: string) => {
    const clip = clips.find(c => c.id === id);
    if (!clip) return;
    const visibleDuration = clip.outPoint - clip.inPoint;
    setClips(prev => prev.filter(c => c.id !== id).map(c => {
      if (c.trackId === clip.trackId && c.startFrame > clip.startFrame) return { ...c, startFrame: Math.max(0, c.startFrame - visibleDuration) };
      return c;
    }));
    setContextMenu(null);
    if (selectedClipId === id) setSelectedClipId(null);
  };

  const duplicateClip = (id: string) => {
    const clip = clips.find(c => c.id === id);
    if (!clip) return;
    const visibleDuration = clip.outPoint - clip.inPoint;
    setClips(prev => [...prev, { ...clip, id: crypto.randomUUID(), startFrame: clip.startFrame + visibleDuration }]);
    setContextMenu(null);
  };

  const splitClip = (id: string) => {
    const clip = clips.find(c => c.id === id);
    if (!clip) return;
    const visibleDuration = clip.outPoint - clip.inPoint;
    if (playheadFrame <= clip.startFrame || playheadFrame >= clip.startFrame + visibleDuration) return;
    const splitPoint = playheadFrame - clip.startFrame;
    const left: TimelineClip = { ...clip, outPoint: clip.inPoint + splitPoint };
    const right: TimelineClip = { ...clip, id: crypto.randomUUID(), startFrame: playheadFrame, inPoint: clip.inPoint + splitPoint };
    setClips(prev => prev.map(c => c.id === id ? left : c).concat(right));
    setContextMenu(null);
  };

  const updateClip = (id: string, updates: Partial<TimelineClip>) => {
    setClips(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  // ── Track operations ──────────────────────────────────────────────────────

  const toggleTrackProp = (trackId: string, prop: 'locked' | 'muted' | 'visible') => {
    setTracks(prev => prev.map(t => t.id === trackId ? { ...t, [prop]: !t[prop] } : t));
  };
  const addTrack = (type: 'video' | 'audio' | 'overlay') => {
    const count = tracks.filter(t => t.type === type).length + 1;
    const colors = { video: '#dc2626', audio: '#16a34a', overlay: '#7c3aed' };
    const heights = { video: 48, audio: 32, overlay: 28 };
    const prefixes = { video: 'Video', audio: 'Audio', overlay: 'Overlay' };
    setTracks(prev => [...prev, { id: crypto.randomUUID(), name: `${prefixes[type]} ${count}`, type, locked: false, muted: false, visible: true, color: colors[type], height: heights[type] }]);
  };
  const deleteTrack = (trackId: string) => {
    if (tracks.length <= 1) return;
    setTracks(prev => prev.filter(t => t.id !== trackId));
    setClips(prev => prev.filter(c => c.trackId !== trackId));
  };

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === ' ') { e.preventDefault(); togglePlay(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); setIsPlaying(false); setPlayheadFrame(f => Math.max(0, f - (e.shiftKey ? FPS : 1))); }
      if (e.key === 'ArrowRight') { e.preventDefault(); setIsPlaying(false); setPlayheadFrame(f => Math.min(totalFrames - 1, f + (e.shiftKey ? FPS : 1))); }
      if (e.key === '+' || e.key === '=') setZoom(z => Math.min(8, z * 1.25));
      if (e.key === '-') setZoom(z => Math.max(0.1, z / 1.25));
      if (e.key === 'i') setInPoint(playheadFrame);
      if (e.key === 'o') setOutPoint(playheadFrame);
      if (e.key === 'Escape') { setSelectedClipId(null); setContextMenu(null); }
      if (e.key === 'Delete' || (e.key === 'Backspace' && !e.shiftKey)) { if (selectedClipId) deleteClip(selectedClipId); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && e.shiftKey) { if (selectedClipId) rippleDeleteClip(selectedClipId); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [totalFrames, playheadFrame, selectedClipId, togglePlay, setIsPlaying, setPlayheadFrame]);

  // ── Export ────────────────────────────────────────────────────────────────

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const exportData = {
        fps: FPS, totalFrames,
        tracks: tracks.map(t => ({ id: t.id, name: t.name, type: t.type })),
        clips: clips.map(c => ({
          id: c.id, trackId: c.trackId, label: c.label, startFrame: c.startFrame,
          durationFrames: c.durationFrames, inPoint: c.inPoint, outPoint: c.outPoint,
          speed: c.speed, opacity: c.opacity,
          startTimecode: framesToTimecode(c.startFrame),
          endTimecode: framesToTimecode(c.startFrame + (c.outPoint - c.inPoint)),
          durationTimecode: framesToTimecode(c.outPoint - c.inPoint),
          videoUrl: c.videoUrl || null, imageUrl: c.imageUrl ? '(has image)' : null,
        })),
        editDecisionList: clips.sort((a, b) => a.startFrame - b.startFrame).map((c, i) => ({
          editNumber: i + 1, reelName: c.label,
          trackName: tracks.find(t => t.id === c.trackId)?.name || c.trackId,
          sourceIn: framesToTimecode(c.inPoint), sourceOut: framesToTimecode(c.outPoint),
          recordIn: framesToTimecode(c.startFrame), recordOut: framesToTimecode(c.startFrame + (c.outPoint - c.inPoint)),
        })),
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${project.title || 'timeline'}_edl.json`; a.click();
      URL.revokeObjectURL(url);
    } finally { setIsExporting(false); }
  };

  const playheadPx = playheadFrame * pxPerFrame;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className="flex flex-col bg-neutral-950 text-white select-none"
      style={{ height: 'calc(100vh - 48px)' }}
      onClick={() => setContextMenu(null)}
    >
      {/* ═══════════════════════════════════════════════════════════════════
          TOP ROW: Source Monitor | V-Divider | Program Monitor / Inspector
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-row flex-shrink-0 overflow-hidden" style={{ height: `calc(${monitorHeight * 100}% - ${DIVIDER_SIZE / 2}px)` }}>

        {/* ── LEFT: Source Monitor ── */}
        <div className="flex flex-col overflow-hidden" style={{ width: `calc(${sourceWidth * 100}% - ${DIVIDER_SIZE / 2}px)` }}>
          <SourceMonitor items={sourceItems} onSendToTimeline={handleInsertFromSource} tracks={tracks} />
        </div>

        {/* ── VERTICAL DIVIDER ── */}
        <div
          className="flex-shrink-0 flex items-center justify-center bg-neutral-800 hover:bg-red-600/50 transition-colors cursor-col-resize group"
          style={{ width: DIVIDER_SIZE }}
          onMouseDown={e => { e.preventDefault(); setIsDraggingVDivider(true); }}
        >
          <div className="w-0.5 h-8 bg-neutral-600 group-hover:bg-red-400 rounded-full transition-colors" />
        </div>

        {/* ── RIGHT: Program Monitor ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Header bar */}
          <div className="flex items-center bg-neutral-900 border-b border-neutral-800 flex-shrink-0">
            <div className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white border-b-2 border-red-600">
              <Monitor size={12} /> Program Monitor
            </div>
            <div className="flex-1" />
            <span className="text-xs text-neutral-600 pr-3 font-mono">{framesToTimecode(playheadFrame)}</span>
          </div>

          {/* Program Monitor */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 relative bg-black overflow-hidden flex items-center justify-center min-h-0 min-w-0">
              {/* Video element — flex-centered, max constrained to fit */}
              <video
                ref={programVideoRef}
                className="max-w-full max-h-full object-contain"
                style={{
                  display: currentClip?.videoUrl ? 'block' : 'none',
                  opacity: currentClip?.videoUrl ? (currentClip.opacity ?? 1) : 0,
                  pointerEvents: 'none',
                }}
                src={currentClip?.videoUrl || ''}
                muted={isMuted}
                playsInline
                preload="auto"
              />
              {/* Show image if clip has image but no video */}
              {currentClip && !currentClip.videoUrl && currentClip.imageUrl && (
                <img src={currentClip.imageUrl} alt={currentClip.label}
                  className="max-w-full max-h-full object-contain"
                  style={{ opacity: currentClip.opacity ?? 1 }}
                  draggable={false} />
              )}
              {!currentClip && (
                <div className="flex flex-col items-center justify-center gap-3 text-neutral-700">
                  <Film size={36} strokeWidth={1} />
                  <span className="text-sm text-center px-4">
                    {clips.length === 0 ? 'Insert clips from the Source Monitor' : 'Move playhead over a clip to preview'}
                  </span>
                </div>
              )}
              {/* Overlay elements positioned absolutely over the video area */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/70 px-3 py-1 rounded font-mono text-sm text-white tracking-widest pointer-events-none">
                {framesToTimecode(playheadFrame)}
              </div>
              {currentClip && <div className="absolute top-2 left-2 bg-black/60 text-neutral-300 text-xs px-2 py-0.5 rounded pointer-events-none">{currentClip.label}</div>}
              {isPlaying && (
                <div className="absolute top-2 right-2 flex items-center gap-1 bg-red-600/80 text-white text-xs px-2 py-0.5 rounded pointer-events-none">
                  <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" /> PLAYING
                </div>
              )}
            </div>

            {/* Program transport */}
            <div className="flex items-center justify-center gap-2 px-4 py-1.5 bg-neutral-900 border-t border-neutral-800 flex-shrink-0">
              <div className="flex items-center gap-1 mr-2">
                <button onClick={() => setIsMuted(v => !v)} className="p-1 hover:bg-neutral-700 rounded">
                  {isMuted ? <VolumeX size={13} className="text-neutral-400" /> : <Volume2 size={13} className="text-neutral-400" />}
                </button>
                <input type="range" min={0} max={1} step={0.05} value={isMuted ? 0 : volume}
                  onChange={e => { setVolume(Number(e.target.value)); setIsMuted(false); }} className="w-14 h-1 accent-red-600" />
              </div>
              <button onClick={() => { setPlayheadFrame(0); setIsPlaying(false); }} className="p-1 hover:bg-neutral-700 rounded" title="Go to start"><SkipBack size={14} className="text-neutral-300" /></button>
              <button onClick={() => { setIsPlaying(false); setPlayheadFrame(f => Math.max(0, f - FPS)); }} className="p-1 hover:bg-neutral-700 rounded" title="Step back 1s"><Rewind size={14} className="text-neutral-300" /></button>
              <button onClick={togglePlay} className="p-2 bg-red-600 hover:bg-red-500 rounded-full shadow-lg shadow-red-900/50 transition-colors" title="Play/Pause (Space)">
                {isPlaying ? <Pause size={15} className="text-white" fill="white" /> : <Play size={15} className="text-white" fill="white" />}
              </button>
              <button onClick={() => { setIsPlaying(false); setPlayheadFrame(f => Math.min(totalFrames - 1, f + FPS)); }} className="p-1 hover:bg-neutral-700 rounded" title="Step forward 1s"><FastForward size={14} className="text-neutral-300" /></button>
              <button onClick={() => { setPlayheadFrame(totalFrames - 1); setIsPlaying(false); }} className="p-1 hover:bg-neutral-700 rounded" title="Go to end"><SkipForward size={14} className="text-neutral-300" /></button>
              <div className="flex items-center gap-1 ml-2 border-l border-neutral-700 pl-2">
                <button onClick={() => setInPoint(playheadFrame)} className="px-2 py-0.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded text-yellow-400" title="Set In Point (I)">I</button>
                <button onClick={() => setOutPoint(playheadFrame)} className="px-2 py-0.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded text-yellow-400" title="Set Out Point (O)">O</button>
                {(inPoint !== null || outPoint !== null) && (
                  <button onClick={() => { setInPoint(null); setOutPoint(null); }} className="px-2 py-0.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-400">Clear</button>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          HORIZONTAL DIVIDER
      ═══════════════════════════════════════════════════════════════════ */}
      <div
        className="flex-shrink-0 flex items-center justify-center bg-neutral-800 hover:bg-red-600/50 transition-colors cursor-row-resize group"
        style={{ height: DIVIDER_SIZE }}
        onMouseDown={e => { e.preventDefault(); setIsDraggingHDivider(true); }}
      >
        <div className="h-0.5 w-12 bg-neutral-600 group-hover:bg-red-400 rounded-full transition-colors" />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          TOOLBAR
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="flex items-center gap-2 px-3 py-1 bg-neutral-900 border-b border-neutral-800 flex-shrink-0">
        <div className="flex items-center gap-1">
          <button onClick={() => setZoom(z => Math.max(0.1, z / 1.25))} className="p-1 hover:bg-neutral-700 rounded" title="Zoom out (-)"><ZoomOut size={12} className="text-neutral-400" /></button>
          <span className="text-xs text-neutral-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(8, z * 1.25))} className="p-1 hover:bg-neutral-700 rounded" title="Zoom in (+)"><ZoomIn size={12} className="text-neutral-400" /></button>
          <button onClick={() => setZoom(1)} className="px-2 py-0.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-400 ml-1">Fit</button>
        </div>
        <div className="w-px h-4 bg-neutral-700 mx-1" />
        <div className="flex items-center gap-1">
          <span className="text-xs text-neutral-600 mr-1">Add:</span>
          <button onClick={() => addTrack('video')} className="flex items-center gap-1 px-2 py-0.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-300"><Film size={10} /> Video</button>
          <button onClick={() => addTrack('audio')} className="flex items-center gap-1 px-2 py-0.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-300"><Music size={10} /> Audio</button>
          <button onClick={() => addTrack('overlay')} className="flex items-center gap-1 px-2 py-0.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-300"><Layers size={10} /> Overlay</button>
        </div>
        <div className="flex-1" />
        <button onClick={handleExport} disabled={clips.length === 0 || isExporting}
          className="flex items-center gap-1.5 px-3 py-1 text-xs bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed rounded text-white font-medium transition-colors"
          title="Export Edit Decision List (EDL)">
          <Download size={11} /> {isExporting ? 'Exporting...' : 'Export EDL'}
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          TIMELINE: Ruler + Tracks
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Ruler */}
        <div className="flex flex-shrink-0" style={{ height: RULER_HEIGHT }}>
          <div className="flex-shrink-0 bg-neutral-900 border-r border-b border-neutral-800 flex items-center px-2" style={{ width: TRACK_HEADER_WIDTH }}>
            <span className="text-xs text-neutral-600 font-mono">{framesToTimecode(playheadFrame)}</span>
          </div>
          <div ref={rulerScrollRef} className="flex-1 overflow-x-hidden border-b border-neutral-800 bg-neutral-900 relative cursor-col-resize" style={{ height: RULER_HEIGHT }}>
            <div ref={rulerRef} style={{ width: timelineWidth, height: RULER_HEIGHT, position: 'relative' }} onMouseDown={handleRulerMouseDown}>
              {rulerMarks.map(mark => (
                <div key={mark.frame} className="absolute top-0 flex flex-col items-center" style={{ left: mark.frame * pxPerFrame }}>
                  <div className="w-px bg-neutral-600" style={{ height: 8 }} />
                  <span className="text-neutral-500 font-mono" style={{ fontSize: 9, marginTop: 2, whiteSpace: 'nowrap' }}>{mark.label}</span>
                </div>
              ))}
              {inPoint !== null && <div className="absolute top-0 bottom-0 w-px bg-yellow-500/60" style={{ left: inPoint * pxPerFrame }}><div className="absolute top-0 left-0 w-2 h-2 bg-yellow-500" style={{ clipPath: 'polygon(0 0, 100% 0, 0 100%)' }} /></div>}
              {outPoint !== null && <div className="absolute top-0 bottom-0 w-px bg-yellow-500/60" style={{ left: outPoint * pxPerFrame }}><div className="absolute top-0 right-0 w-2 h-2 bg-yellow-500" style={{ clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }} /></div>}
              <div className="absolute top-0 bottom-0 z-20 pointer-events-none" style={{ left: playheadPx }}>
                <div className="w-3 h-3 bg-red-500 rounded-sm" style={{ marginLeft: -6, clipPath: 'polygon(50% 100%, 0 0, 100% 0)' }} />
                <div className="w-px bg-red-500 absolute top-3 bottom-0 left-1/2 -translate-x-1/2" />
              </div>
            </div>
          </div>
        </div>

        {/* Tracks */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Headers */}
          <div className="flex-shrink-0 flex flex-col bg-neutral-900 border-r border-neutral-800 overflow-y-auto" style={{ width: TRACK_HEADER_WIDTH }}>
            {tracks.map(track => (
              <div key={track.id} className="flex-shrink-0 flex items-center gap-1 px-2 border-b border-neutral-800" style={{ height: track.height, borderLeft: `3px solid ${track.color}` }}>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-neutral-300 font-medium truncate">{track.name}</p>
                  <p className="text-xs text-neutral-600 capitalize">{track.type}</p>
                </div>
                <div className="flex items-center gap-0.5">
                  <button onClick={() => toggleTrackProp(track.id, 'muted')} className="p-0.5 hover:bg-neutral-700 rounded" title="Mute">{track.muted ? <VolumeX size={11} className="text-yellow-400" /> : <Volume2 size={11} className="text-neutral-500" />}</button>
                  <button onClick={() => toggleTrackProp(track.id, 'visible')} className="p-0.5 hover:bg-neutral-700 rounded" title="Hide">{track.visible ? <Eye size={11} className="text-neutral-500" /> : <EyeOff size={11} className="text-yellow-400" />}</button>
                  <button onClick={() => toggleTrackProp(track.id, 'locked')} className="p-0.5 hover:bg-neutral-700 rounded" title="Lock">{track.locked ? <Lock size={11} className="text-yellow-400" /> : <Unlock size={11} className="text-neutral-500" />}</button>
                  <button onClick={() => deleteTrack(track.id)} className="p-0.5 hover:bg-neutral-700 rounded" title="Delete track"><Trash2 size={11} className="text-neutral-600 hover:text-red-400" /></button>
                </div>
              </div>
            ))}
          </div>

          {/* Track lanes */}
          <div ref={tracksScrollRef} className="flex-1 overflow-auto relative" style={{ cursor: isDraggingClip ? 'grabbing' : isTrimming ? 'col-resize' : 'default' }}>
            <div style={{ width: timelineWidth, position: 'relative' }}>
              {tracks.map(track => (
                <div key={track.id} className="relative border-b border-neutral-800" style={{ height: track.height, opacity: track.visible ? 1 : 0.3 }}>
                  <div className="absolute inset-0 bg-neutral-900" />
                  <div className="absolute inset-0" style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 59px, rgba(255,255,255,0.015) 59px, rgba(255,255,255,0.015) 60px)' }} />
                  {clips.filter(c => c.trackId === track.id).map(clip => {
                    const visibleDuration = clip.outPoint - clip.inPoint;
                    const clipWidthPx = Math.max(visibleDuration * pxPerFrame - 2, 4);
                    return (
                      <div key={clip.id}
                        className={`absolute top-1 rounded-md overflow-hidden border-2 transition-shadow group ${selectedClipId === clip.id ? 'z-10 shadow-lg' : ''} ${clip.locked ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'}`}
                        style={{
                          left: clip.startFrame * pxPerFrame, width: clipWidthPx, height: track.height - 8,
                          backgroundColor: clip.color + '30', borderColor: selectedClipId === clip.id ? clip.color : 'transparent',
                          opacity: clip.opacity,
                        }}
                        onMouseDown={e => handleClipMouseDown(e, clip)}
                        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, clipId: clip.id }); }}>
                        {/* Left trim handle */}
                        {!clip.locked && (
                          <div className="absolute left-0 top-0 bottom-0 z-20 cursor-col-resize opacity-0 group-hover:opacity-100 transition-opacity flex items-center"
                            style={{ width: TRIM_HANDLE_WIDTH }} onMouseDown={e => handleTrimMouseDown(e, clip, 'left')}>
                            <div className="w-1 h-8 bg-white/60 rounded-full mx-auto" />
                          </div>
                        )}
                        {/* Right trim handle */}
                        {!clip.locked && (
                          <div className="absolute right-0 top-0 bottom-0 z-20 cursor-col-resize opacity-0 group-hover:opacity-100 transition-opacity flex items-center"
                            style={{ width: TRIM_HANDLE_WIDTH }} onMouseDown={e => handleTrimMouseDown(e, clip, 'right')}>
                            <div className="w-1 h-8 bg-white/60 rounded-full mx-auto" />
                          </div>
                        )}
                        {clip.imageUrl && clipWidthPx > 40 && (
                          <div className="absolute inset-0 opacity-35"><img src={clip.imageUrl} alt="" className="w-full h-full object-cover" draggable={false} /></div>
                        )}
                        <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: clip.color }} />
                        {clipWidthPx > 60 && (
                          <div className="absolute bottom-0 left-0 right-0 px-1.5 py-0.5 bg-black/60">
                            <p className="text-white font-medium truncate" style={{ fontSize: 10 }}>{clip.label}</p>
                          </div>
                        )}
                        {clip.videoUrl && <div className="absolute top-1.5 right-1.5"><Film size={10} className="text-green-400" /></div>}
                        {clip.locked && <div className="absolute inset-0 flex items-center justify-center bg-black/30"><Lock size={12} className="text-yellow-400" /></div>}
                        {clip.speed !== 1 && <div className="absolute top-1 left-1.5 text-purple-400" style={{ fontSize: 8 }}>{clip.speed}x</div>}
                      </div>
                    );
                  })}
                </div>
              ))}
              {/* Playhead line */}
              <div className="absolute top-0 bottom-0 z-20 pointer-events-none" style={{ left: playheadPx, width: 1, backgroundColor: '#ef4444', boxShadow: '0 0 4px #ef4444' }} />
              {/* In/Out shading */}
              {inPoint !== null && outPoint !== null && inPoint < outPoint && (
                <div className="absolute top-0 bottom-0 bg-yellow-500/10 border-x border-yellow-500/30 pointer-events-none z-10" style={{ left: inPoint * pxPerFrame, width: (outPoint - inPoint) * pxPerFrame }} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-3 px-3 py-1 bg-neutral-900 border-t border-neutral-800 flex-shrink-0 text-xs text-neutral-500">
        <span>{clips.length} clips</span>
        <span>{sourceItems.length} source</span>
        <span>{tracks.length} tracks</span>
        <span>Duration: {framesToTimecode(totalFrames)}</span>
        <span>Zoom: {Math.round(zoom * 100)}%</span>
        <span>{FPS} fps</span>
        {selectedClip && <span className="text-neutral-400">Selected: <span className="text-white">{selectedClip.label}</span></span>}
        <div className="flex-1" />
        <span className="text-neutral-600">Space: Play · I/O: In/Out · +/-: Zoom · Arrows: Step · Del: Delete</span>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div className="fixed z-50 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl py-1 min-w-44" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={e => e.stopPropagation()}>
          <button onClick={() => splitClip(contextMenu.clipId)} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-700 text-sm text-neutral-200"><Scissors size={13} /> Split at playhead</button>
          <button onClick={() => duplicateClip(contextMenu.clipId)} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-700 text-sm text-neutral-200"><RefreshCw size={13} /> Duplicate</button>
          <div className="border-t border-neutral-700 my-1" />
          <button onClick={() => rippleDeleteClip(contextMenu.clipId)} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-orange-900/50 text-sm text-orange-400"><Trash2 size={13} /> Ripple Delete</button>
          <button onClick={() => deleteClip(contextMenu.clipId)} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-red-900/50 text-sm text-red-400"><Trash2 size={13} /> Delete</button>
        </div>
      )}
    </div>
  );
};
