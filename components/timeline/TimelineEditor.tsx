import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Project, Shot, Scene } from '../../types';
import {
  Play, Pause, SkipBack, SkipForward, ZoomIn, ZoomOut,
  Scissors, Lock, Unlock, Eye, EyeOff, Plus, Trash2,
  Volume2, VolumeX, Film, Music, Layers, ChevronLeft,
  ChevronRight, Maximize2, Download, RefreshCw, FastForward, Rewind
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface TimelineClip {
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

interface TimelineEditorProps {
  project: Project;
  onUpdateProject: (project: Project) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const FPS = 30;
const DEFAULT_SHOT_DURATION = 150; // 5 seconds at 30fps
const TRACK_HEADER_WIDTH = 180;
const RULER_HEIGHT = 28;
const SHOT_COLORS = [
  '#dc2626', '#ea580c', '#ca8a04', '#16a34a',
  '#0891b2', '#7c3aed', '#db2777', '#475569',
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function framesToTimecode(frames: number, fps: number): string {
  const totalSeconds = Math.floor(frames / fps);
  const f = frames % fps;
  const s = totalSeconds % 60;
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
}

function buildInitialClips(project: Project): { clips: TimelineClip[]; totalFrames: number } {
  const clips: TimelineClip[] = [];
  let cursor = 0;
  let colorIdx = 0;

  for (const scene of project.scenes ?? []) {
    for (const shot of scene.shots ?? []) {
      const dur = shot.videoUrl ? DEFAULT_SHOT_DURATION : DEFAULT_SHOT_DURATION;
      clips.push({
        id: `clip-${shot.id}`,
        shotId: shot.id,
        sceneId: scene.id,
        trackId: 'v1',
        startFrame: cursor,
        durationFrames: dur,
        label: `${scene.name} · Shot ${shot.number}`,
        color: SHOT_COLORS[colorIdx % SHOT_COLORS.length],
        imageUrl: shot.imageUrl,
        videoUrl: shot.videoUrl,
        locked: false,
        muted: false,
      });
      cursor += dur;
      colorIdx++;
    }
  }

  return { clips, totalFrames: Math.max(cursor + DEFAULT_SHOT_DURATION * 2, FPS * 60) };
}

const DEFAULT_TRACKS: TimelineTrack[] = [
  { id: 'v1', name: 'Video 1', type: 'video', locked: false, muted: false, visible: true, color: '#dc2626', height: 72 },
  { id: 'v2', name: 'Video 2', type: 'video', locked: false, muted: false, visible: true, color: '#ea580c', height: 72 },
  { id: 'a1', name: 'Audio 1', type: 'audio', locked: false, muted: false, visible: true, color: '#16a34a', height: 48 },
  { id: 'a2', name: 'Audio 2', type: 'audio', locked: false, muted: false, visible: true, color: '#0891b2', height: 48 },
  { id: 'ol', name: 'Overlays', type: 'overlay', locked: false, muted: false, visible: true, color: '#7c3aed', height: 40 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export const TimelineEditor: React.FC<TimelineEditorProps> = ({ project, onUpdateProject }) => {
  const { clips: initialClips, totalFrames: initialTotal } = useMemo(() => buildInitialClips(project), [project.scenes]);

  const [tracks, setTracks] = useState<TimelineTrack[]>(DEFAULT_TRACKS);
  const [clips, setClips] = useState<TimelineClip[]>(initialClips);
  const [totalFrames, setTotalFrames] = useState(initialTotal);
  const [playheadFrame, setPlayheadFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [inPoint, setInPoint] = useState<number | null>(null);
  const [outPoint, setOutPoint] = useState<number | null>(null);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [isDraggingClip, setIsDraggingClip] = useState<{ clipId: string; offsetFrames: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; clipId: string } | null>(null);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const tracksScrollRef = useRef<HTMLDivElement>(null);
  const rulerScrollRef = useRef<HTMLDivElement>(null);

  // Sync clips when project changes (new shots added)
  useEffect(() => {
    const { clips: newClips, totalFrames: newTotal } = buildInitialClips(project);
    setClips(prev => {
      // Merge: keep existing clips with their positions, add new ones
      const existingIds = new Set(prev.map(c => c.shotId));
      const brandNew = newClips.filter(c => !existingIds.has(c.shotId));
      // Update imageUrl/videoUrl for existing clips
      const updated = prev.map(c => {
        const fresh = newClips.find(nc => nc.shotId === c.shotId);
        return fresh ? { ...c, imageUrl: fresh.imageUrl, videoUrl: fresh.videoUrl, label: fresh.label } : c;
      });
      return [...updated, ...brandNew];
    });
    setTotalFrames(t => Math.max(t, newTotal));
  }, [project.scenes]);

  // Playback
  useEffect(() => {
    if (isPlaying) {
      playIntervalRef.current = setInterval(() => {
        setPlayheadFrame(f => {
          if (f >= totalFrames - 1) {
            setIsPlaying(false);
            return 0;
          }
          return f + 1;
        });
      }, 1000 / FPS);
    } else {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    }
    return () => { if (playIntervalRef.current) clearInterval(playIntervalRef.current); };
  }, [isPlaying, totalFrames]);

  // Sync video element to playhead
  useEffect(() => {
    const clip = getClipAtPlayhead();
    if (clip?.videoUrl && videoRef.current) {
      const clipTime = (playheadFrame - clip.startFrame) / FPS;
      if (Math.abs(videoRef.current.currentTime - clipTime) > 0.1) {
        videoRef.current.currentTime = clipTime;
      }
      if (isPlaying && videoRef.current.paused) {
        videoRef.current.play().catch(() => {});
      } else if (!isPlaying && !videoRef.current.paused) {
        videoRef.current.pause();
      }
    }
  }, [playheadFrame, isPlaying]);

  // Sync ruler scroll with tracks scroll
  useEffect(() => {
    const tracks = tracksScrollRef.current;
    const ruler = rulerScrollRef.current;
    if (!tracks || !ruler) return;
    const onTracksScroll = () => { ruler.scrollLeft = tracks.scrollLeft; };
    const onRulerScroll = () => { tracks.scrollLeft = ruler.scrollLeft; };
    tracks.addEventListener('scroll', onTracksScroll);
    ruler.addEventListener('scroll', onRulerScroll);
    return () => {
      tracks.removeEventListener('scroll', onTracksScroll);
      ruler.removeEventListener('scroll', onRulerScroll);
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === ' ') { e.preventDefault(); setIsPlaying(v => !v); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); setPlayheadFrame(f => Math.max(0, f - (e.shiftKey ? FPS : 1))); }
      if (e.key === 'ArrowRight') { e.preventDefault(); setPlayheadFrame(f => Math.min(totalFrames - 1, f + (e.shiftKey ? FPS : 1))); }
      if (e.key === '+' || e.key === '=') setZoom(z => Math.min(8, z * 1.25));
      if (e.key === '-') setZoom(z => Math.max(0.25, z / 1.25));
      if (e.key === 'i') setInPoint(playheadFrame);
      if (e.key === 'o') setOutPoint(playheadFrame);
      if (e.key === 'Escape') { setSelectedClipId(null); setContextMenu(null); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [totalFrames, playheadFrame]);

  // ── Derived state ────────────────────────────────────────────────────────

  const pxPerFrame = zoom * 2; // base: 2px per frame at zoom=1

  const getClipAtPlayhead = useCallback((): TimelineClip | null => {
    return clips.find(c => {
      const track = tracks.find(t => t.id === c.trackId);
      if (!track?.visible || c.muted) return false;
      return playheadFrame >= c.startFrame && playheadFrame < c.startFrame + c.durationFrames;
    }) ?? null;
  }, [clips, tracks, playheadFrame]);

  const currentClip = getClipAtPlayhead();
  const selectedClip = clips.find(c => c.id === selectedClipId) ?? null;

  // ── Ruler rendering ──────────────────────────────────────────────────────

  const rulerMarks = useMemo(() => {
    const marks: { frame: number; label: string; major: boolean }[] = [];
    // Determine interval based on zoom
    const minPxBetweenMarks = 60;
    const framesPerMark = Math.max(1, Math.ceil(minPxBetweenMarks / pxPerFrame / FPS) * FPS);
    for (let f = 0; f <= totalFrames; f += framesPerMark) {
      const totalSec = Math.floor(f / FPS);
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      marks.push({
        frame: f,
        label: `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
        major: true,
      });
    }
    return marks;
  }, [totalFrames, pxPerFrame]);

  // ── Playhead drag ────────────────────────────────────────────────────────

  const handleRulerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    setIsDraggingPlayhead(true);
    setIsPlaying(false);
    const rect = e.currentTarget.getBoundingClientRect();
    const scrollLeft = rulerScrollRef.current?.scrollLeft ?? 0;
    const x = e.clientX - rect.left + scrollLeft - TRACK_HEADER_WIDTH;
    setPlayheadFrame(Math.max(0, Math.min(totalFrames - 1, Math.round(x / pxPerFrame))));
  };

  useEffect(() => {
    if (!isDraggingPlayhead) return;
    const onMove = (e: MouseEvent) => {
      const ruler = rulerRef.current;
      if (!ruler) return;
      const rect = ruler.getBoundingClientRect();
      const scrollLeft = rulerScrollRef.current?.scrollLeft ?? 0;
      const x = e.clientX - rect.left + scrollLeft - TRACK_HEADER_WIDTH;
      setPlayheadFrame(Math.max(0, Math.min(totalFrames - 1, Math.round(x / pxPerFrame))));
    };
    const onUp = () => setIsDraggingPlayhead(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isDraggingPlayhead, pxPerFrame, totalFrames]);

  // ── Clip drag ────────────────────────────────────────────────────────────

  const handleClipMouseDown = (e: React.MouseEvent, clip: TimelineClip) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setSelectedClipId(clip.id);
    if (clip.locked) return;
    const offsetPx = e.clientX - (clip.startFrame * pxPerFrame);
    setIsDraggingClip({ clipId: clip.id, offsetFrames: Math.round(offsetPx / pxPerFrame) });
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

  // ── Context menu ─────────────────────────────────────────────────────────

  const handleClipContextMenu = (e: React.MouseEvent, clipId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, clipId });
  };

  const deleteClip = (clipId: string) => {
    setClips(prev => prev.filter(c => c.id !== clipId));
    setContextMenu(null);
  };

  const duplicateClip = (clipId: string) => {
    const clip = clips.find(c => c.id === clipId);
    if (!clip) return;
    const newClip: TimelineClip = {
      ...clip,
      id: crypto.randomUUID(),
      startFrame: clip.startFrame + clip.durationFrames,
    };
    setClips(prev => [...prev, newClip]);
    setContextMenu(null);
  };

  const splitClip = (clipId: string) => {
    const clip = clips.find(c => c.id === clipId);
    if (!clip || playheadFrame <= clip.startFrame || playheadFrame >= clip.startFrame + clip.durationFrames) return;
    const splitPoint = playheadFrame - clip.startFrame;
    const left: TimelineClip = { ...clip, durationFrames: splitPoint };
    const right: TimelineClip = { ...clip, id: crypto.randomUUID(), startFrame: playheadFrame, durationFrames: clip.durationFrames - splitPoint };
    setClips(prev => prev.map(c => c.id === clipId ? left : c).concat(right));
    setContextMenu(null);
  };

  // ── Track controls ────────────────────────────────────────────────────────

  const toggleTrackProp = (trackId: string, prop: 'locked' | 'muted' | 'visible') => {
    setTracks(prev => prev.map(t => t.id === trackId ? { ...t, [prop]: !t[prop] } : t));
  };

  const addTrack = (type: 'video' | 'audio' | 'overlay') => {
    const count = tracks.filter(t => t.type === type).length + 1;
    const colors = { video: '#dc2626', audio: '#16a34a', overlay: '#7c3aed' };
    const heights = { video: 72, audio: 48, overlay: 40 };
    const prefixes = { video: 'Video', audio: 'Audio', overlay: 'Overlay' };
    setTracks(prev => [...prev, {
      id: crypto.randomUUID(),
      name: `${prefixes[type]} ${count}`,
      type,
      locked: false,
      muted: false,
      visible: true,
      color: colors[type],
      height: heights[type],
    }]);
  };

  const deleteTrack = (trackId: string) => {
    if (tracks.length <= 1) return;
    setTracks(prev => prev.filter(t => t.id !== trackId));
    setClips(prev => prev.filter(c => c.trackId !== trackId));
  };

  // ── Playhead pixel position ───────────────────────────────────────────────

  const playheadPx = playheadFrame * pxPerFrame;

  // ── Total timeline width ──────────────────────────────────────────────────

  const timelineWidth = totalFrames * pxPerFrame;

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
          TOP ROW: Program Monitor + Inspector
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-row flex-shrink-0" style={{ height: '45%', minHeight: 280 }}>

        {/* ── Program Monitor ── */}
        <div className="flex-1 flex flex-col bg-black border-r border-neutral-800 min-w-0">
          {/* Monitor header */}
          <div className="flex items-center justify-between px-3 py-1.5 bg-neutral-900 border-b border-neutral-800 flex-shrink-0">
            <span className="text-xs text-neutral-400 font-medium uppercase tracking-wider">Program Monitor</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-500">
                {currentClip ? currentClip.label : 'No clip at playhead'}
              </span>
              <button className="p-1 hover:bg-neutral-700 rounded" title="Fullscreen">
                <Maximize2 size={12} className="text-neutral-500" />
              </button>
            </div>
          </div>

          {/* Monitor screen */}
          <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
            {currentClip?.videoUrl ? (
              <video
                ref={videoRef}
                src={currentClip.videoUrl}
                className="max-w-full max-h-full object-contain"
                muted={isMuted}
                style={{ volume } as React.CSSProperties}
                playsInline
              />
            ) : currentClip?.imageUrl ? (
              <img
                src={currentClip.imageUrl}
                alt={currentClip.label}
                className="max-w-full max-h-full object-contain"
                draggable={false}
              />
            ) : (
              <div className="flex flex-col items-center gap-3 text-neutral-700">
                <Film size={48} strokeWidth={1} />
                <span className="text-sm">
                  {clips.length === 0
                    ? 'No clips on timeline — generate shots in the Storyboard tab'
                    : 'Move playhead over a clip to preview'}
                </span>
              </div>
            )}

            {/* Timecode burn-in */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/70 px-3 py-1 rounded font-mono text-sm text-white tracking-widest">
              {framesToTimecode(playheadFrame, FPS)}
            </div>

            {/* In/Out point overlays */}
            {inPoint !== null && (
              <div className="absolute top-2 left-2 bg-yellow-600/80 text-white text-xs px-2 py-0.5 rounded font-mono">
                IN: {framesToTimecode(inPoint, FPS)}
              </div>
            )}
            {outPoint !== null && (
              <div className="absolute top-2 right-2 bg-yellow-600/80 text-white text-xs px-2 py-0.5 rounded font-mono">
                OUT: {framesToTimecode(outPoint, FPS)}
              </div>
            )}
          </div>

          {/* Transport controls */}
          <div className="flex items-center justify-center gap-2 px-4 py-2 bg-neutral-900 border-t border-neutral-800 flex-shrink-0">
            {/* Volume */}
            <div className="flex items-center gap-1 mr-2">
              <button onClick={() => setIsMuted(v => !v)} className="p-1 hover:bg-neutral-700 rounded">
                {isMuted ? <VolumeX size={14} className="text-neutral-400" /> : <Volume2 size={14} className="text-neutral-400" />}
              </button>
              <input
                type="range" min={0} max={1} step={0.05} value={isMuted ? 0 : volume}
                onChange={e => { setVolume(Number(e.target.value)); setIsMuted(false); }}
                className="w-16 h-1 accent-red-600"
              />
            </div>

            <button onClick={() => { setPlayheadFrame(0); setIsPlaying(false); }} className="p-1.5 hover:bg-neutral-700 rounded" title="Go to start">
              <SkipBack size={16} className="text-neutral-300" />
            </button>
            <button onClick={() => setPlayheadFrame(f => Math.max(0, f - FPS))} className="p-1.5 hover:bg-neutral-700 rounded" title="Step back 1s">
              <Rewind size={16} className="text-neutral-300" />
            </button>
            <button
              onClick={() => setIsPlaying(v => !v)}
              className="p-2.5 bg-red-600 hover:bg-red-500 rounded-full shadow-lg shadow-red-900/50 transition-colors"
              title="Play/Pause (Space)"
            >
              {isPlaying ? <Pause size={18} className="text-white" fill="white" /> : <Play size={18} className="text-white" fill="white" />}
            </button>
            <button onClick={() => setPlayheadFrame(f => Math.min(totalFrames - 1, f + FPS))} className="p-1.5 hover:bg-neutral-700 rounded" title="Step forward 1s">
              <FastForward size={16} className="text-neutral-300" />
            </button>
            <button onClick={() => { setPlayheadFrame(totalFrames - 1); setIsPlaying(false); }} className="p-1.5 hover:bg-neutral-700 rounded" title="Go to end">
              <SkipForward size={16} className="text-neutral-300" />
            </button>

            {/* In/Out point buttons */}
            <div className="flex items-center gap-1 ml-2 border-l border-neutral-700 pl-2">
              <button onClick={() => setInPoint(playheadFrame)} className="px-2 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded text-yellow-400" title="Set In Point (I)">I</button>
              <button onClick={() => setOutPoint(playheadFrame)} className="px-2 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded text-yellow-400" title="Set Out Point (O)">O</button>
              {(inPoint !== null || outPoint !== null) && (
                <button onClick={() => { setInPoint(null); setOutPoint(null); }} className="px-2 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-400">Clear</button>
              )}
            </div>
          </div>
        </div>

        {/* ── Clip Inspector ── */}
        <div className="w-64 flex-shrink-0 flex flex-col bg-neutral-900 border-l border-neutral-800">
          <div className="px-3 py-1.5 bg-neutral-900 border-b border-neutral-800 flex-shrink-0">
            <span className="text-xs text-neutral-400 font-medium uppercase tracking-wider">Clip Inspector</span>
          </div>

          {selectedClip ? (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {/* Thumbnail */}
              {selectedClip.imageUrl && (
                <div className="rounded-lg overflow-hidden border border-neutral-700 aspect-video bg-black">
                  <img src={selectedClip.imageUrl} alt={selectedClip.label} className="w-full h-full object-cover" />
                </div>
              )}
              {selectedClip.videoUrl && !selectedClip.imageUrl && (
                <div className="rounded-lg overflow-hidden border border-neutral-700 aspect-video bg-black flex items-center justify-center">
                  <Film size={24} className="text-neutral-600" />
                </div>
              )}

              {/* Clip info */}
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-neutral-500 mb-0.5">Name</p>
                  <p className="text-sm text-white font-medium">{selectedClip.label}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-neutral-500 mb-0.5">Start</p>
                    <p className="text-xs text-neutral-300 font-mono">{framesToTimecode(selectedClip.startFrame, FPS)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500 mb-0.5">End</p>
                    <p className="text-xs text-neutral-300 font-mono">{framesToTimecode(selectedClip.startFrame + selectedClip.durationFrames, FPS)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500 mb-0.5">Duration</p>
                    <p className="text-xs text-neutral-300 font-mono">{framesToTimecode(selectedClip.durationFrames, FPS)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500 mb-0.5">Track</p>
                    <p className="text-xs text-neutral-300">{tracks.find(t => t.id === selectedClip.trackId)?.name ?? selectedClip.trackId}</p>
                  </div>
                </div>

                {/* Media badges */}
                <div className="flex gap-1.5 flex-wrap">
                  {selectedClip.imageUrl && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/50 text-blue-300 border border-blue-800/50">🖼 Image</span>
                  )}
                  {selectedClip.videoUrl && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/50 text-green-300 border border-green-800/50">🎬 Video</span>
                  )}
                  {!selectedClip.imageUrl && !selectedClip.videoUrl && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-500">No media</span>
                  )}
                </div>

                {/* Quick actions */}
                <div className="space-y-1.5 pt-1 border-t border-neutral-800">
                  <button
                    onClick={() => splitClip(selectedClip.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs transition-colors"
                  >
                    <Scissors size={12} /> Split at playhead
                  </button>
                  <button
                    onClick={() => duplicateClip(selectedClip.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs transition-colors"
                  >
                    <RefreshCw size={12} /> Duplicate
                  </button>
                  <button
                    onClick={() => toggleTrackProp(selectedClip.trackId, 'locked')}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs transition-colors"
                  >
                    <Lock size={12} /> {selectedClip.locked ? 'Unlock' : 'Lock'} clip
                  </button>
                  <button
                    onClick={() => deleteClip(selectedClip.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg bg-red-950/50 hover:bg-red-900/50 text-red-400 text-xs transition-colors"
                  >
                    <Trash2 size={12} /> Delete clip
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-neutral-700 p-4 text-center">
              <Film size={32} strokeWidth={1} className="mb-2" />
              <p className="text-xs">Click a clip to inspect it</p>
              <p className="text-xs mt-3 text-neutral-600">Tip: Generate shots in the Storyboard tab, then come back here to edit your timeline.</p>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          TOOLBAR
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-900 border-t border-b border-neutral-800 flex-shrink-0">
        {/* Zoom */}
        <div className="flex items-center gap-1">
          <button onClick={() => setZoom(z => Math.max(0.25, z / 1.25))} className="p-1 hover:bg-neutral-700 rounded" title="Zoom out (-)">
            <ZoomOut size={14} className="text-neutral-400" />
          </button>
          <span className="text-xs text-neutral-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(8, z * 1.25))} className="p-1 hover:bg-neutral-700 rounded" title="Zoom in (+)">
            <ZoomIn size={14} className="text-neutral-400" />
          </button>
          <button onClick={() => setZoom(1)} className="px-2 py-0.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-400 ml-1">Fit</button>
        </div>

        <div className="w-px h-4 bg-neutral-700 mx-1" />

        {/* Add tracks */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-neutral-600 mr-1">Add:</span>
          <button onClick={() => addTrack('video')} className="flex items-center gap-1 px-2 py-0.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-300">
            <Film size={11} /> Video
          </button>
          <button onClick={() => addTrack('audio')} className="flex items-center gap-1 px-2 py-0.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-300">
            <Music size={11} /> Audio
          </button>
          <button onClick={() => addTrack('overlay')} className="flex items-center gap-1 px-2 py-0.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-300">
            <Layers size={11} /> Overlay
          </button>
        </div>

        <div className="flex-1" />

        {/* Keyboard hints */}
        <div className="flex items-center gap-3 text-neutral-600 text-xs">
          <span>Space: Play/Pause</span>
          <span>I/O: In/Out</span>
          <span>←→: Step</span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          TIMELINE: Ruler + Tracks
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

        {/* Ruler row */}
        <div className="flex flex-shrink-0" style={{ height: RULER_HEIGHT }}>
          {/* Track header spacer */}
          <div className="flex-shrink-0 bg-neutral-900 border-r border-b border-neutral-800" style={{ width: TRACK_HEADER_WIDTH }}>
            <div className="h-full flex items-center px-2">
              <span className="text-xs text-neutral-600 font-mono">{framesToTimecode(playheadFrame, FPS)}</span>
            </div>
          </div>
          {/* Ruler scroll area */}
          <div
            ref={rulerScrollRef}
            className="flex-1 overflow-x-hidden border-b border-neutral-800 bg-neutral-900 relative cursor-col-resize"
            style={{ height: RULER_HEIGHT }}
          >
            <div
              ref={rulerRef}
              style={{ width: timelineWidth, height: RULER_HEIGHT, position: 'relative' }}
              onMouseDown={handleRulerMouseDown}
            >
              {/* Ruler marks */}
              {rulerMarks.map(mark => (
                <div
                  key={mark.frame}
                  className="absolute top-0 flex flex-col items-center"
                  style={{ left: mark.frame * pxPerFrame }}
                >
                  <div className="w-px bg-neutral-600" style={{ height: 8 }} />
                  <span className="text-neutral-500 font-mono" style={{ fontSize: 9, marginTop: 2, whiteSpace: 'nowrap' }}>{mark.label}</span>
                </div>
              ))}

              {/* In/Out point markers on ruler */}
              {inPoint !== null && (
                <div className="absolute top-0 bottom-0 w-px bg-yellow-500/60" style={{ left: inPoint * pxPerFrame }}>
                  <div className="absolute top-0 left-0 w-2 h-2 bg-yellow-500" style={{ clipPath: 'polygon(0 0, 100% 0, 0 100%)' }} />
                </div>
              )}
              {outPoint !== null && (
                <div className="absolute top-0 bottom-0 w-px bg-yellow-500/60" style={{ left: outPoint * pxPerFrame }}>
                  <div className="absolute top-0 right-0 w-2 h-2 bg-yellow-500" style={{ clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }} />
                </div>
              )}

              {/* Playhead on ruler */}
              <div
                className="absolute top-0 bottom-0 z-20 pointer-events-none"
                style={{ left: playheadPx }}
              >
                <div className="w-3 h-3 bg-red-500 rounded-sm" style={{ marginLeft: -6, clipPath: 'polygon(50% 100%, 0 0, 100% 0)' }} />
                <div className="w-px bg-red-500 absolute top-3 bottom-0 left-1/2 -translate-x-1/2" />
              </div>
            </div>
          </div>
        </div>

        {/* Tracks area */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Track headers */}
          <div
            className="flex-shrink-0 flex flex-col bg-neutral-900 border-r border-neutral-800 overflow-y-auto"
            style={{ width: TRACK_HEADER_WIDTH }}
          >
            {tracks.map(track => (
              <div
                key={track.id}
                className="flex-shrink-0 flex items-center gap-1 px-2 border-b border-neutral-800"
                style={{ height: track.height, borderLeft: `3px solid ${track.color}` }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-neutral-300 font-medium truncate">{track.name}</p>
                  <p className="text-xs text-neutral-600 capitalize">{track.type}</p>
                </div>
                <div className="flex items-center gap-0.5">
                  <button onClick={() => toggleTrackProp(track.id, 'muted')} className="p-0.5 hover:bg-neutral-700 rounded" title="Mute">
                    {track.muted ? <VolumeX size={11} className="text-yellow-400" /> : <Volume2 size={11} className="text-neutral-500" />}
                  </button>
                  <button onClick={() => toggleTrackProp(track.id, 'visible')} className="p-0.5 hover:bg-neutral-700 rounded" title="Hide">
                    {track.visible ? <Eye size={11} className="text-neutral-500" /> : <EyeOff size={11} className="text-yellow-400" />}
                  </button>
                  <button onClick={() => toggleTrackProp(track.id, 'locked')} className="p-0.5 hover:bg-neutral-700 rounded" title="Lock">
                    {track.locked ? <Lock size={11} className="text-yellow-400" /> : <Unlock size={11} className="text-neutral-500" />}
                  </button>
                  <button onClick={() => deleteTrack(track.id)} className="p-0.5 hover:bg-neutral-700 rounded" title="Delete track">
                    <Trash2 size={11} className="text-neutral-600 hover:text-red-400" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Tracks scroll area */}
          <div
            ref={tracksScrollRef}
            className="flex-1 overflow-auto relative"
            style={{ cursor: isDraggingClip ? 'grabbing' : 'default' }}
          >
            <div style={{ width: timelineWidth, position: 'relative' }}>
              {/* Track lanes */}
              {tracks.map(track => (
                <div
                  key={track.id}
                  className="relative border-b border-neutral-800"
                  style={{ height: track.height, opacity: track.visible ? 1 : 0.3 }}
                >
                  {/* Track background stripes */}
                  <div className="absolute inset-0 bg-neutral-900" />
                  <div className="absolute inset-0" style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 59px, rgba(255,255,255,0.02) 59px, rgba(255,255,255,0.02) 60px)' }} />

                  {/* Clips on this track */}
                  {clips
                    .filter(c => c.trackId === track.id)
                    .map(clip => (
                      <div
                        key={clip.id}
                        className={`absolute top-1 rounded-md overflow-hidden border-2 transition-shadow cursor-grab active:cursor-grabbing ${
                          selectedClipId === clip.id
                            ? 'border-white shadow-lg shadow-white/10 z-10'
                            : 'border-transparent hover:border-white/30'
                        } ${clip.locked ? 'cursor-not-allowed' : ''}`}
                        style={{
                          left: clip.startFrame * pxPerFrame,
                          width: Math.max(clip.durationFrames * pxPerFrame - 2, 4),
                          height: track.height - 8,
                          backgroundColor: clip.color + '33',
                          borderColor: selectedClipId === clip.id ? clip.color : undefined,
                        }}
                        onMouseDown={e => handleClipMouseDown(e, clip)}
                        onContextMenu={e => handleClipContextMenu(e, clip.id)}
                      >
                        {/* Clip thumbnail */}
                        {clip.imageUrl && clip.durationFrames * pxPerFrame > 40 && (
                          <div className="absolute inset-0 opacity-40">
                            <img src={clip.imageUrl} alt="" className="w-full h-full object-cover" draggable={false} />
                          </div>
                        )}

                        {/* Clip color bar */}
                        <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: clip.color }} />

                        {/* Clip label */}
                        {clip.durationFrames * pxPerFrame > 60 && (
                          <div className="absolute bottom-0 left-0 right-0 px-1.5 py-0.5 bg-black/60">
                            <p className="text-xs text-white font-medium truncate" style={{ fontSize: 10 }}>{clip.label}</p>
                          </div>
                        )}

                        {/* Video indicator */}
                        {clip.videoUrl && (
                          <div className="absolute top-1.5 right-1.5">
                            <Film size={10} className="text-green-400" />
                          </div>
                        )}

                        {/* Lock indicator */}
                        {clip.locked && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                            <Lock size={12} className="text-yellow-400" />
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              ))}

              {/* Playhead line across all tracks */}
              <div
                className="absolute top-0 bottom-0 z-20 pointer-events-none"
                style={{ left: playheadPx, width: 1, backgroundColor: '#ef4444', boxShadow: '0 0 4px #ef4444' }}
              />

              {/* In/Out point shading */}
              {inPoint !== null && outPoint !== null && inPoint < outPoint && (
                <div
                  className="absolute top-0 bottom-0 bg-yellow-500/10 border-x border-yellow-500/30 pointer-events-none z-10"
                  style={{ left: inPoint * pxPerFrame, width: (outPoint - inPoint) * pxPerFrame }}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          STATUS BAR
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="flex items-center gap-4 px-3 py-1 bg-neutral-900 border-t border-neutral-800 flex-shrink-0 text-xs text-neutral-500">
        <span>{clips.length} clips</span>
        <span>{tracks.length} tracks</span>
        <span>Duration: {framesToTimecode(totalFrames, FPS)}</span>
        <span>Zoom: {Math.round(zoom * 100)}%</span>
        <span>{FPS} fps</span>
        {selectedClip && <span className="text-neutral-400">Selected: <span className="text-white">{selectedClip.label}</span></span>}
        <div className="flex-1" />
        <span className="text-neutral-600">Space: Play · I/O: In/Out · +/-: Zoom · ←→: Step</span>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl py-1 min-w-36"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <button onClick={() => splitClip(contextMenu.clipId)} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-700 text-sm text-neutral-200">
            <Scissors size={13} /> Split at playhead
          </button>
          <button onClick={() => duplicateClip(contextMenu.clipId)} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-700 text-sm text-neutral-200">
            <RefreshCw size={13} /> Duplicate
          </button>
          <div className="border-t border-neutral-700 my-1" />
          <button onClick={() => deleteClip(contextMenu.clipId)} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-red-900/50 text-sm text-red-400">
            <Trash2 size={13} /> Delete
          </button>
        </div>
      )}
    </div>
  );
};
