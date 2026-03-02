import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Project, Shot, Scene } from '../../types';
import {
  Play, Pause, SkipBack, SkipForward, ZoomIn, ZoomOut,
  Scissors, Lock, Unlock, Eye, EyeOff, Trash2,
  Volume2, VolumeX, Film, Music, Layers, RefreshCw,
  FastForward, Rewind, PlusCircle, ChevronDown, ChevronRight,
  Monitor, Clapperboard, ListVideo, Download, GripVertical
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
const TRACK_HEADER_WIDTH = 180;
const RULER_HEIGHT = 28;
const TRIM_HANDLE_WIDTH = 8;
const SHOT_COLORS = [
  '#dc2626', '#ea580c', '#ca8a04', '#16a34a',
  '#0891b2', '#7c3aed', '#db2777', '#475569',
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

function secondsToFrames(sec: number): number {
  return Math.round(sec * FPS);
}

async function loadVideoDuration(url: string): Promise<number> {
  return new Promise(resolve => {
    const vid = document.createElement('video');
    vid.preload = 'metadata';
    vid.onloadedmetadata = () => resolve(secondsToFrames(vid.duration));
    vid.onerror = () => resolve(DEFAULT_SHOT_DURATION);
    vid.src = url;
  });
}

const DEFAULT_TRACKS: TimelineTrack[] = [
  { id: 'v1', name: 'Video 1', type: 'video', locked: false, muted: false, visible: true, color: '#dc2626', height: 72 },
  { id: 'v2', name: 'Video 2', type: 'video', locked: false, muted: false, visible: true, color: '#ea580c', height: 72 },
  { id: 'a1', name: 'Audio 1', type: 'audio', locked: false, muted: false, visible: true, color: '#16a34a', height: 48 },
  { id: 'a2', name: 'Audio 2', type: 'audio', locked: false, muted: false, visible: true, color: '#0891b2', height: 48 },
  { id: 'ol', name: 'Overlays', type: 'overlay', locked: false, muted: false, visible: true, color: '#7c3aed', height: 40 },
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
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  const toggleSourcePlay = () => {
    if (!selected) return;
    if (selected.videoUrl && videoRef.current) {
      if (isSourcePlaying) {
        videoRef.current.pause();
        setIsSourcePlaying(false);
      } else {
        videoRef.current.play().then(() => setIsSourcePlaying(true)).catch(() => {});
      }
    }
  };

  const progress = videoDuration > 0 ? videoTime / videoDuration : 0;

  return (
    <div className="flex flex-col h-full bg-neutral-950 border-r border-neutral-800">
      <div className="flex items-center justify-between px-3 py-1.5 bg-neutral-900 border-b border-neutral-800 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <Clapperboard size={13} className="text-red-500" />
          <span className="text-xs text-neutral-300 font-medium uppercase tracking-wider">Source Monitor</span>
        </div>
        <span className="text-xs text-neutral-600">{items.length} clips</span>
      </div>

      <div className="relative bg-black flex items-center justify-center flex-shrink-0" style={{ height: 160 }}>
        {selected?.videoUrl ? (
          <video
            ref={videoRef}
            src={selected.videoUrl}
            className="max-w-full max-h-full object-contain"
            onTimeUpdate={() => { if (videoRef.current) setVideoTime(videoRef.current.currentTime); }}
            onEnded={() => setIsSourcePlaying(false)}
            onLoadedMetadata={() => { if (videoRef.current) setVideoDuration(videoRef.current.duration); }}
            onPlay={() => setIsSourcePlaying(true)}
            onPause={() => setIsSourcePlaying(false)}
            playsInline
          />
        ) : selected?.imageUrl ? (
          <img src={selected.imageUrl} alt={selected.description} className="max-w-full max-h-full object-contain" draggable={false} />
        ) : (
          <div className="flex flex-col items-center gap-2 text-neutral-700">
            <Monitor size={32} strokeWidth={1} />
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
      <div className="flex items-center justify-center gap-1 px-2 py-1.5 bg-neutral-900 border-b border-neutral-800 flex-shrink-0">
        <button onClick={() => { setVideoTime(0); if (videoRef.current) videoRef.current.currentTime = 0; }} className="p-1 hover:bg-neutral-700 rounded">
          <SkipBack size={13} className="text-neutral-400" />
        </button>
        <button onClick={toggleSourcePlay} className="p-1.5 bg-red-700 hover:bg-red-600 rounded-full">
          {isSourcePlaying ? <Pause size={13} className="text-white" fill="white" /> : <Play size={13} className="text-white" fill="white" />}
        </button>
        <button onClick={() => { if (videoRef.current) { videoRef.current.currentTime = videoDuration; setVideoTime(videoDuration); } }} className="p-1 hover:bg-neutral-700 rounded">
          <SkipForward size={13} className="text-neutral-400" />
        </button>

        <div className="flex items-center gap-1 ml-2 border-l border-neutral-700 pl-2">
          <select
            value={targetTrack}
            onChange={e => setTargetTrack(e.target.value)}
            className="text-xs bg-neutral-800 border border-neutral-700 rounded px-1 py-0.5 text-neutral-300"
          >
            {tracks.filter(t => t.type === 'video').map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <button
            onClick={() => { if (selected) onSendToTimeline(selected, targetTrack); }}
            disabled={!selected}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed rounded text-white"
            title="Insert clip at playhead on selected track"
          >
            <PlusCircle size={11} /> Insert
          </button>
        </div>
      </div>

      {/* Clip browser */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-neutral-700 p-4 text-center">
            <Film size={24} strokeWidth={1} className="mb-2" />
            <p className="text-xs">No shots yet. Generate shots in the Storyboard tab first.</p>
          </div>
        ) : (
          Array.from(byScene.entries()).map(([sceneId, { sceneName, items: sceneItems }]) => (
            <div key={sceneId}>
              <button
                onClick={() => setExpandedScenes(prev => { const n = new Set(prev); if (n.has(sceneId)) n.delete(sceneId); else n.add(sceneId); return n; })}
                className="w-full flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900/50 hover:bg-neutral-800 text-xs text-neutral-400 border-b border-neutral-800"
              >
                {expandedScenes.has(sceneId) ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                <span className="font-medium">{sceneName}</span>
                <span className="text-neutral-600 ml-auto">{sceneItems.length}</span>
              </button>
              {expandedScenes.has(sceneId) && sceneItems.map(item => (
                <div
                  key={item.shotId}
                  className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer border-b border-neutral-800/50 hover:bg-neutral-800/50 transition-colors ${selected?.shotId === item.shotId ? 'bg-neutral-800 border-l-2 border-l-red-500' : ''}`}
                  onClick={() => selectItem(item)}
                  onDoubleClick={() => { selectItem(item); onSendToTimeline(item, targetTrack); }}
                  title="Click to preview · Double-click to insert"
                >
                  <div className="w-12 h-8 rounded overflow-hidden flex-shrink-0 bg-neutral-800 relative">
                    {item.imageUrl
                      ? <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><Film size={12} className="text-neutral-600" /></div>
                    }
                    {item.videoUrl && <div className="absolute bottom-0.5 right-0.5 w-2 h-2 bg-green-500 rounded-full" title="Has video" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-neutral-300 font-medium truncate">Shot {item.shotNumber}</p>
                    <p className="text-xs text-neutral-600 truncate">{item.description || 'No description'}</p>
                  </div>
                  <span className="text-xs text-neutral-600 font-mono flex-shrink-0">
                    {(item.durationFrames / FPS).toFixed(1)}s
                  </span>
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
// Main TimelineEditor Component
// ─────────────────────────────────────────────────────────────────────────────

export const TimelineEditor: React.FC<TimelineEditorProps> = ({ project, onUpdateProject }) => {
  const [tracks, setTracks] = useState<TimelineTrack[]>(DEFAULT_TRACKS);
  const [clips, setClips] = useState<TimelineClip[]>([]);
  const [sourceItems, setSourceItems] = useState<SourceItem[]>([]);
  const [totalFrames, setTotalFrames] = useState(FPS * 60);
  const [playheadFrame, setPlayheadFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [inPoint, setInPoint] = useState<number | null>(null);
  const [outPoint, setOutPoint] = useState<number | null>(null);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [isDraggingClip, setIsDraggingClip] = useState<{ clipId: string; offsetFrames: number } | null>(null);
  const [isTrimming, setIsTrimming] = useState<{ clipId: string; edge: 'left' | 'right'; startX: number; origStartFrame: number; origDuration: number; origInPoint: number; origOutPoint: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; clipId: string } | null>(null);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [activePanel, setActivePanel] = useState<'program' | 'inspector'>('program');
  const [isExporting, setIsExporting] = useState(false);

  // Refs
  const programVideoRef = useRef<HTMLVideoElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const tracksScrollRef = useRef<HTMLDivElement>(null);
  const rulerScrollRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number | null>(null);
  // Track the current video clip to avoid re-mounting the video element unnecessarily
  const currentVideoClipIdRef = useRef<string | null>(null);
  // Track whether video-driven playback is active (video controls the playhead)
  const videoDrivenRef = useRef(false);
  // Ref for latest clips/tracks to avoid stale closures in RAF
  const clipsRef = useRef(clips);
  clipsRef.current = clips;
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const playheadRef = useRef(playheadFrame);
  playheadRef.current = playheadFrame;
  const totalFramesRef = useRef(totalFrames);
  totalFramesRef.current = totalFrames;

  // ── Build source items from project (with real video durations) ───────────

  useEffect(() => {
    let cancelled = false;
    const build = async () => {
      const items: SourceItem[] = [];
      let colorIdx = 0;
      for (const scene of project.scenes ?? []) {
        for (const shot of scene.shots ?? []) {
          let dur = DEFAULT_SHOT_DURATION;
          if (shot.videoUrl) {
            try { dur = await loadVideoDuration(shot.videoUrl); } catch { /* use default */ }
          }
          if (cancelled) return;
          items.push({
            shotId: shot.id,
            sceneId: scene.id,
            sceneName: scene.name,
            shotNumber: shot.number,
            description: shot.description || '',
            imageUrl: shot.imageUrl,
            videoUrl: shot.videoUrl,
            durationFrames: dur,
            color: SHOT_COLORS[colorIdx % SHOT_COLORS.length],
          });
          colorIdx++;
        }
      }
      if (!cancelled) {
        setSourceItems(items);
        setClips(prev => prev.map(c => {
          const src = items.find(i => i.shotId === c.shotId);
          if (!src) return c;
          return {
            ...c,
            imageUrl: src.imageUrl,
            videoUrl: src.videoUrl,
            durationFrames: src.durationFrames,
            outPoint: src.durationFrames,
          };
        }));
      }
    };
    build();
    return () => { cancelled = true; };
  }, [project.scenes]);

  useEffect(() => {
    const end = clips.reduce((max, c) => Math.max(max, c.startFrame + (c.outPoint - c.inPoint)), 0);
    setTotalFrames(Math.max(end + FPS * 10, FPS * 60));
  }, [clips]);

  // ── Find clip at a given frame ────────────────────────────────────────────

  const getClipAtFrame = useCallback((frame: number): TimelineClip | null => {
    const videoTracks = tracksRef.current.filter(t => t.type === 'video' && t.visible);
    for (const track of videoTracks) {
      const clip = clipsRef.current.find(c => {
        if (c.trackId !== track.id || c.muted) return false;
        const visibleDuration = c.outPoint - c.inPoint;
        return frame >= c.startFrame && frame < c.startFrame + visibleDuration;
      });
      if (clip) return clip;
    }
    return null;
  }, []);

  const currentClip = getClipAtFrame(playheadFrame);

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYBACK ENGINE — Video-driven when a video clip is at the playhead,
  // RAF-driven (for images/empty) otherwise.
  // ══════════════════════════════════════════════════════════════════════════

  // When the user presses play:
  // 1. If the playhead is on a video clip → start the <video> element with .play(),
  //    and use its `timeupdate` to advance the playhead. No RAF needed.
  // 2. If the playhead is on an image clip or empty → use RAF to advance the playhead
  //    at the correct frame rate.
  // 3. When the playhead crosses from one clip to another, seamlessly switch modes.

  // Handle play/pause toggle
  const togglePlay = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  // Video timeupdate handler — drives the playhead when video is playing
  const handleProgramTimeUpdate = useCallback(() => {
    if (!videoDrivenRef.current) return;
    const vid = programVideoRef.current;
    if (!vid) return;
    const clip = getClipAtFrame(playheadRef.current);
    if (!clip || !clip.videoUrl) return;
    // Convert video currentTime back to timeline frame
    const clipLocalTime = vid.currentTime;
    const timelineFrame = clip.startFrame + Math.round(clipLocalTime * FPS) - clip.inPoint;
    const visibleEnd = clip.startFrame + (clip.outPoint - clip.inPoint);
    if (timelineFrame >= visibleEnd) {
      // Clip ended — advance to next frame and let the RAF/video switch handle it
      setPlayheadFrame(visibleEnd);
    } else {
      setPlayheadFrame(timelineFrame);
    }
  }, [getClipAtFrame]);

  const handleProgramEnded = useCallback(() => {
    // Video clip ended — check if there's a next clip
    const clip = getClipAtFrame(playheadRef.current);
    if (clip) {
      const visibleEnd = clip.startFrame + (clip.outPoint - clip.inPoint);
      setPlayheadFrame(visibleEnd);
    }
    // Don't stop playing — the RAF loop will pick up for the next segment
    videoDrivenRef.current = false;
  }, [getClipAtFrame]);

  // Main playback effect
  useEffect(() => {
    if (!isPlaying) {
      // Stop everything
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      if (programVideoRef.current && !programVideoRef.current.paused) {
        programVideoRef.current.pause();
      }
      videoDrivenRef.current = false;
      return;
    }

    // Start playback — determine mode based on current clip
    const startPlayback = () => {
      const clip = getClipAtFrame(playheadRef.current);

      if (clip?.videoUrl && programVideoRef.current) {
        // VIDEO MODE: let the video element drive
        videoDrivenRef.current = true;
        if (animFrameRef.current) {
          cancelAnimationFrame(animFrameRef.current);
          animFrameRef.current = null;
        }

        const clipLocalFrame = playheadRef.current - clip.startFrame + clip.inPoint;
        const targetTime = clipLocalFrame / FPS;
        const vid = programVideoRef.current;
        vid.volume = isMuted ? 0 : volume;

        // Only seek if we're not already close
        if (Math.abs(vid.currentTime - targetTime) > 0.15) {
          vid.currentTime = targetTime;
        }
        vid.play().catch(() => {
          // If video play fails, fall back to RAF mode
          videoDrivenRef.current = false;
          startRAFLoop();
        });
      } else {
        // RAF MODE: advance playhead frame-by-frame for images/empty
        videoDrivenRef.current = false;
        if (programVideoRef.current && !programVideoRef.current.paused) {
          programVideoRef.current.pause();
        }
        startRAFLoop();
      }
    };

    const startRAFLoop = () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      let lastTime = performance.now();

      const tick = (now: number) => {
        if (!isPlaying) return; // safety check

        const delta = now - lastTime;
        // Advance by the correct number of frames based on elapsed time
        if (delta >= (1000 / FPS)) {
          const framesToAdvance = Math.floor(delta / (1000 / FPS));
          lastTime = now - (delta % (1000 / FPS)); // carry remainder

          const currentFrame = playheadRef.current;
          const nextFrame = currentFrame + framesToAdvance;

          if (nextFrame >= totalFramesRef.current - 1) {
            setIsPlaying(false);
            setPlayheadFrame(0);
            return;
          }

          // Check if we're entering a video clip
          const nextClip = getClipAtFrame(nextFrame);
          if (nextClip?.videoUrl && programVideoRef.current) {
            // Switch to video-driven mode
            setPlayheadFrame(nextFrame);
            // Small timeout to let React update the video src if needed
            setTimeout(() => startPlayback(), 16);
            return;
          }

          setPlayheadFrame(nextFrame);
        }

        animFrameRef.current = requestAnimationFrame(tick);
      };

      animFrameRef.current = requestAnimationFrame(tick);
    };

    startPlayback();

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [isPlaying, getClipAtFrame, isMuted, volume]);

  // When playhead moves and we're video-driven, check if we've left the current video clip
  useEffect(() => {
    if (!isPlaying || !videoDrivenRef.current) return;
    const clip = getClipAtFrame(playheadFrame);
    if (!clip?.videoUrl) {
      // Left the video clip — pause video, switch to RAF
      if (programVideoRef.current && !programVideoRef.current.paused) {
        programVideoRef.current.pause();
      }
      videoDrivenRef.current = false;
      // Re-trigger the play effect by toggling
      setIsPlaying(false);
      setTimeout(() => setIsPlaying(true), 0);
    }
  }, [playheadFrame, isPlaying, getClipAtFrame]);

  // Sync video element when NOT playing (scrubbing / stepping)
  useEffect(() => {
    if (isPlaying) return;
    if (!currentClip?.videoUrl || !programVideoRef.current) return;
    const clipLocalFrame = playheadFrame - currentClip.startFrame + currentClip.inPoint;
    const targetTime = clipLocalFrame / FPS;
    // Only seek when stopped — this is fine for scrubbing
    if (Math.abs(programVideoRef.current.currentTime - targetTime) > 0.05) {
      programVideoRef.current.currentTime = targetTime;
    }
  }, [playheadFrame, isPlaying, currentClip]);

  // Update video volume
  useEffect(() => {
    if (programVideoRef.current) {
      programVideoRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // ── Derived ───────────────────────────────────────────────────────────────

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

  // ── Sync ruler ↔ tracks scroll ────────────────────────────────────────────

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

  // ── Insert clip from Source Monitor ──────────────────────────────────────

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
      id: crypto.randomUUID(),
      shotId: item.shotId,
      sceneId: item.sceneId,
      trackId,
      startFrame,
      durationFrames: item.durationFrames,
      label: `${item.sceneName} · Shot ${item.shotNumber}`,
      color: item.color,
      imageUrl: item.imageUrl,
      videoUrl: item.videoUrl,
      locked: false,
      muted: false,
      inPoint: 0,
      outPoint: item.durationFrames,
    };
    setClips(prev => [...prev, newClip]);
    setSelectedClipId(newClip.id);
    setActivePanel('inspector');
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
  }, [isDraggingPlayhead, pxPerFrame, totalFrames]);

  // ── Clip drag ─────────────────────────────────────────────────────────────

  const handleClipMouseDown = (e: React.MouseEvent, clip: TimelineClip) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setSelectedClipId(clip.id);
    setActivePanel('inspector');
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
    e.stopPropagation();
    e.preventDefault();
    if (clip.locked) return;
    setIsTrimming({
      clipId: clip.id,
      edge,
      startX: e.clientX,
      origStartFrame: clip.startFrame,
      origDuration: clip.durationFrames,
      origInPoint: clip.inPoint,
      origOutPoint: clip.outPoint,
    });
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
    setClips(prev => {
      return prev
        .filter(c => c.id !== id)
        .map(c => {
          if (c.trackId === clip.trackId && c.startFrame > clip.startFrame) {
            return { ...c, startFrame: Math.max(0, c.startFrame - visibleDuration) };
          }
          return c;
        });
    });
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
    const right: TimelineClip = {
      ...clip,
      id: crypto.randomUUID(),
      startFrame: playheadFrame,
      inPoint: clip.inPoint + splitPoint,
    };
    setClips(prev => prev.map(c => c.id === id ? left : c).concat(right));
    setContextMenu(null);
  };

  // ── Track operations ──────────────────────────────────────────────────────

  const toggleTrackProp = (trackId: string, prop: 'locked' | 'muted' | 'visible') => {
    setTracks(prev => prev.map(t => t.id === trackId ? { ...t, [prop]: !t[prop] } : t));
  };
  const addTrack = (type: 'video' | 'audio' | 'overlay') => {
    const count = tracks.filter(t => t.type === type).length + 1;
    const colors = { video: '#dc2626', audio: '#16a34a', overlay: '#7c3aed' };
    const heights = { video: 72, audio: 48, overlay: 40 };
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
      if (e.key === 'Delete' || (e.key === 'Backspace' && !e.shiftKey)) {
        if (selectedClipId) { deleteClip(selectedClipId); }
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && e.shiftKey) {
        if (selectedClipId) { rippleDeleteClip(selectedClipId); }
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [totalFrames, playheadFrame, selectedClipId, togglePlay]);

  // ── Export ────────────────────────────────────────────────────────────────

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const exportData = {
        fps: FPS,
        totalFrames,
        tracks: tracks.map(t => ({ id: t.id, name: t.name, type: t.type })),
        clips: clips.map(c => ({
          id: c.id,
          trackId: c.trackId,
          label: c.label,
          startFrame: c.startFrame,
          durationFrames: c.durationFrames,
          inPoint: c.inPoint,
          outPoint: c.outPoint,
          startTimecode: framesToTimecode(c.startFrame),
          endTimecode: framesToTimecode(c.startFrame + (c.outPoint - c.inPoint)),
          durationTimecode: framesToTimecode(c.outPoint - c.inPoint),
          videoUrl: c.videoUrl || null,
          imageUrl: c.imageUrl ? '(base64 image)' : null,
        })),
        editDecisionList: clips
          .sort((a, b) => a.startFrame - b.startFrame)
          .map((c, i) => ({
            editNumber: i + 1,
            reelName: c.label,
            trackName: tracks.find(t => t.id === c.trackId)?.name || c.trackId,
            sourceIn: framesToTimecode(c.inPoint),
            sourceOut: framesToTimecode(c.outPoint),
            recordIn: framesToTimecode(c.startFrame),
            recordOut: framesToTimecode(c.startFrame + (c.outPoint - c.inPoint)),
          })),
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.title || 'timeline'}_edl.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  const playheadPx = playheadFrame * pxPerFrame;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col bg-neutral-950 text-white select-none"
      style={{ height: 'calc(100vh - 48px)' }}
      onClick={() => setContextMenu(null)}
    >
      {/* ═══════════════════════════════════════════════════════════════════
          TOP ROW: Source Monitor | Program Monitor
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-row flex-shrink-0" style={{ height: '46%', minHeight: 300 }}>

        {/* ── LEFT: Source Monitor + Clip Browser ── */}
        <div className="flex flex-col border-r border-neutral-800" style={{ width: '38%', minWidth: 280 }}>
          <SourceMonitor
            items={sourceItems}
            onSendToTimeline={handleInsertFromSource}
            tracks={tracks}
          />
        </div>

        {/* ── RIGHT: Program Monitor + Inspector tabs ── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Tab bar */}
          <div className="flex items-center bg-neutral-900 border-b border-neutral-800 flex-shrink-0">
            <button
              onClick={() => setActivePanel('program')}
              className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium border-b-2 transition-colors ${activePanel === 'program' ? 'border-red-600 text-white' : 'border-transparent text-neutral-500 hover:text-neutral-300'}`}
            >
              <Monitor size={12} /> Program Monitor
            </button>
            <button
              onClick={() => setActivePanel('inspector')}
              className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium border-b-2 transition-colors ${activePanel === 'inspector' ? 'border-red-600 text-white' : 'border-transparent text-neutral-500 hover:text-neutral-300'}`}
            >
              <ListVideo size={12} /> Clip Inspector
            </button>
            <div className="flex-1" />
            <span className="text-xs text-neutral-600 pr-3 font-mono">{framesToTimecode(playheadFrame)}</span>
          </div>

          {/* Program Monitor */}
          <div className="flex-1 flex flex-col min-h-0" style={{ display: activePanel === 'program' ? 'flex' : 'none' }}>
            <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
              {currentClip?.videoUrl ? (
                <video
                  ref={programVideoRef}
                  key={currentClip.id + '-' + currentClip.videoUrl}
                  src={currentClip.videoUrl}
                  className="max-w-full max-h-full object-contain"
                  muted={isMuted}
                  playsInline
                  preload="auto"
                  onTimeUpdate={handleProgramTimeUpdate}
                  onEnded={handleProgramEnded}
                />
              ) : currentClip?.imageUrl ? (
                <img src={currentClip.imageUrl} alt={currentClip.label} className="max-w-full max-h-full object-contain" draggable={false} />
              ) : (
                <div className="flex flex-col items-center gap-3 text-neutral-700">
                  <Film size={40} strokeWidth={1} />
                  <span className="text-sm text-center px-4">
                    {clips.length === 0
                      ? 'Insert clips from the Source Monitor on the left'
                      : 'Move playhead over a clip to preview'}
                  </span>
                </div>
              )}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/70 px-3 py-1 rounded font-mono text-sm text-white tracking-widest">
                {framesToTimecode(playheadFrame)}
              </div>
              {currentClip && (
                <div className="absolute top-2 left-2 bg-black/60 text-neutral-300 text-xs px-2 py-0.5 rounded">{currentClip.label}</div>
              )}
              {isPlaying && (
                <div className="absolute top-2 right-2 flex items-center gap-1 bg-red-600/80 text-white text-xs px-2 py-0.5 rounded">
                  <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" /> PLAYING
                </div>
              )}
              {inPoint !== null && (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-yellow-700/80 text-white text-xs px-2 py-0.5 rounded font-mono">
                  IN {framesToTimecode(inPoint)} — OUT {outPoint !== null ? framesToTimecode(outPoint) : '--'}
                </div>
              )}
            </div>

            {/* Program transport */}
            <div className="flex items-center justify-center gap-2 px-4 py-2 bg-neutral-900 border-t border-neutral-800 flex-shrink-0">
              <div className="flex items-center gap-1 mr-2">
                <button onClick={() => setIsMuted(v => !v)} className="p-1 hover:bg-neutral-700 rounded">
                  {isMuted ? <VolumeX size={13} className="text-neutral-400" /> : <Volume2 size={13} className="text-neutral-400" />}
                </button>
                <input type="range" min={0} max={1} step={0.05} value={isMuted ? 0 : volume}
                  onChange={e => { setVolume(Number(e.target.value)); setIsMuted(false); }}
                  className="w-14 h-1 accent-red-600" />
              </div>
              <button onClick={() => { setPlayheadFrame(0); setIsPlaying(false); }} className="p-1.5 hover:bg-neutral-700 rounded" title="Go to start"><SkipBack size={15} className="text-neutral-300" /></button>
              <button onClick={() => { setIsPlaying(false); setPlayheadFrame(f => Math.max(0, f - FPS)); }} className="p-1.5 hover:bg-neutral-700 rounded" title="Step back 1s"><Rewind size={15} className="text-neutral-300" /></button>
              <button onClick={togglePlay} className="p-2.5 bg-red-600 hover:bg-red-500 rounded-full shadow-lg shadow-red-900/50 transition-colors" title="Play/Pause (Space)">
                {isPlaying ? <Pause size={17} className="text-white" fill="white" /> : <Play size={17} className="text-white" fill="white" />}
              </button>
              <button onClick={() => { setIsPlaying(false); setPlayheadFrame(f => Math.min(totalFrames - 1, f + FPS)); }} className="p-1.5 hover:bg-neutral-700 rounded" title="Step forward 1s"><FastForward size={15} className="text-neutral-300" /></button>
              <button onClick={() => { setPlayheadFrame(totalFrames - 1); setIsPlaying(false); }} className="p-1.5 hover:bg-neutral-700 rounded" title="Go to end"><SkipForward size={15} className="text-neutral-300" /></button>
              <div className="flex items-center gap-1 ml-2 border-l border-neutral-700 pl-2">
                <button onClick={() => setInPoint(playheadFrame)} className="px-2 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded text-yellow-400" title="Set In Point (I)">I</button>
                <button onClick={() => setOutPoint(playheadFrame)} className="px-2 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded text-yellow-400" title="Set Out Point (O)">O</button>
                {(inPoint !== null || outPoint !== null) && (
                  <button onClick={() => { setInPoint(null); setOutPoint(null); }} className="px-2 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-400">Clear</button>
                )}
              </div>
            </div>
          </div>

          {/* Clip Inspector */}
          <div className="flex-1 overflow-y-auto" style={{ display: activePanel === 'inspector' ? 'block' : 'none' }}>
            {selectedClip ? (
              <div className="p-4 space-y-4">
                {selectedClip.imageUrl && (
                  <div className="rounded-lg overflow-hidden border border-neutral-700 aspect-video bg-black">
                    <img src={selectedClip.imageUrl} alt={selectedClip.label} className="w-full h-full object-cover" />
                  </div>
                )}
                <div>
                  <p className="text-xs text-neutral-500 mb-0.5">Name</p>
                  <p className="text-sm text-white font-medium">{selectedClip.label}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ['Start', framesToTimecode(selectedClip.startFrame)],
                    ['End', framesToTimecode(selectedClip.startFrame + (selectedClip.outPoint - selectedClip.inPoint))],
                    ['Duration', framesToTimecode(selectedClip.outPoint - selectedClip.inPoint)],
                    ['Track', tracks.find(t => t.id === selectedClip.trackId)?.name ?? selectedClip.trackId],
                    ['In Point', framesToTimecode(selectedClip.inPoint)],
                    ['Out Point', framesToTimecode(selectedClip.outPoint)],
                    ['Source Duration', framesToTimecode(selectedClip.durationFrames)],
                  ].map(([label, val]) => (
                    <div key={label}>
                      <p className="text-xs text-neutral-500 mb-0.5">{label}</p>
                      <p className="text-xs text-neutral-300 font-mono">{val}</p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {selectedClip.imageUrl && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/50 text-blue-300 border border-blue-800/50">Image</span>}
                  {selectedClip.videoUrl && <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/50 text-green-300 border border-green-800/50">Video</span>}
                  {!selectedClip.imageUrl && !selectedClip.videoUrl && <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-500">No media</span>}
                </div>
                <div className="space-y-1.5 pt-2 border-t border-neutral-800">
                  <button onClick={() => splitClip(selectedClip.id)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs"><Scissors size={12} /> Split at playhead</button>
                  <button onClick={() => duplicateClip(selectedClip.id)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs"><RefreshCw size={12} /> Duplicate</button>
                  <button onClick={() => rippleDeleteClip(selectedClip.id)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-950/50 hover:bg-orange-900/50 text-orange-400 text-xs"><Trash2 size={12} /> Ripple Delete (Shift+Del)</button>
                  <button onClick={() => deleteClip(selectedClip.id)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-red-950/50 hover:bg-red-900/50 text-red-400 text-xs"><Trash2 size={12} /> Delete clip</button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-neutral-700 p-6 text-center">
                <Film size={32} strokeWidth={1} className="mb-2" />
                <p className="text-sm">No clip selected</p>
                <p className="text-xs mt-2 text-neutral-600">Click a clip on the timeline to inspect it, or insert one from the Source Monitor.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          TOOLBAR
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-900 border-t border-b border-neutral-800 flex-shrink-0">
        <div className="flex items-center gap-1">
          <button onClick={() => setZoom(z => Math.max(0.1, z / 1.25))} className="p-1 hover:bg-neutral-700 rounded" title="Zoom out (-)"><ZoomOut size={13} className="text-neutral-400" /></button>
          <span className="text-xs text-neutral-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(8, z * 1.25))} className="p-1 hover:bg-neutral-700 rounded" title="Zoom in (+)"><ZoomIn size={13} className="text-neutral-400" /></button>
          <button onClick={() => setZoom(1)} className="px-2 py-0.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-400 ml-1">Fit</button>
        </div>
        <div className="w-px h-4 bg-neutral-700 mx-1" />
        <div className="flex items-center gap-1">
          <span className="text-xs text-neutral-600 mr-1">Add track:</span>
          <button onClick={() => addTrack('video')} className="flex items-center gap-1 px-2 py-0.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-300"><Film size={11} /> Video</button>
          <button onClick={() => addTrack('audio')} className="flex items-center gap-1 px-2 py-0.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-300"><Music size={11} /> Audio</button>
          <button onClick={() => addTrack('overlay')} className="flex items-center gap-1 px-2 py-0.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-300"><Layers size={11} /> Overlay</button>
        </div>
        <div className="flex-1" />
        <button
          onClick={handleExport}
          disabled={clips.length === 0 || isExporting}
          className="flex items-center gap-1.5 px-3 py-1 text-xs bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed rounded text-white font-medium transition-colors"
          title="Export Edit Decision List (EDL)"
        >
          <Download size={12} /> {isExporting ? 'Exporting...' : 'Export EDL'}
        </button>
        <div className="w-px h-4 bg-neutral-700 mx-1" />
        <span className="text-xs text-neutral-600">Space: Play · I/O: In/Out · +/-: Zoom · Arrows: Step · Del: Delete · Shift+Del: Ripple</span>
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
                      <div
                        key={clip.id}
                        className={`absolute top-1 rounded-md overflow-hidden border-2 transition-shadow group ${selectedClipId === clip.id ? 'z-10 shadow-lg' : ''} ${clip.locked ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'}`}
                        style={{
                          left: clip.startFrame * pxPerFrame,
                          width: clipWidthPx,
                          height: track.height - 8,
                          backgroundColor: clip.color + '30',
                          borderColor: selectedClipId === clip.id ? clip.color : 'transparent',
                        }}
                        onMouseDown={e => handleClipMouseDown(e, clip)}
                        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, clipId: clip.id }); }}
                      >
                        {/* Left trim handle */}
                        {!clip.locked && (
                          <div
                            className="absolute left-0 top-0 bottom-0 z-20 cursor-col-resize opacity-0 group-hover:opacity-100 transition-opacity flex items-center"
                            style={{ width: TRIM_HANDLE_WIDTH }}
                            onMouseDown={e => handleTrimMouseDown(e, clip, 'left')}
                          >
                            <div className="w-1 h-8 bg-white/60 rounded-full mx-auto" />
                          </div>
                        )}

                        {/* Right trim handle */}
                        {!clip.locked && (
                          <div
                            className="absolute right-0 top-0 bottom-0 z-20 cursor-col-resize opacity-0 group-hover:opacity-100 transition-opacity flex items-center"
                            style={{ width: TRIM_HANDLE_WIDTH }}
                            onMouseDown={e => handleTrimMouseDown(e, clip, 'right')}
                          >
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
                        {(clip.inPoint > 0 || clip.outPoint < clip.durationFrames) && (
                          <div className="absolute top-1 left-1.5 flex items-center gap-0.5">
                            <GripVertical size={8} className="text-yellow-400" />
                          </div>
                        )}
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
      <div className="flex items-center gap-4 px-3 py-1 bg-neutral-900 border-t border-neutral-800 flex-shrink-0 text-xs text-neutral-500">
        <span>{clips.length} clips on timeline</span>
        <span>{sourceItems.length} source clips</span>
        <span>{tracks.length} tracks</span>
        <span>Duration: {framesToTimecode(totalFrames)}</span>
        <span>Zoom: {Math.round(zoom * 100)}%</span>
        <span>{FPS} fps</span>
        {selectedClip && <span className="text-neutral-400">Selected: <span className="text-white">{selectedClip.label}</span> · {((selectedClip.outPoint - selectedClip.inPoint) / FPS).toFixed(2)}s</span>}
        <div className="flex-1" />
        <span className="text-neutral-600">Double-click source to insert · Drag clip edges to trim · Shift+Del: Ripple Delete</span>
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
