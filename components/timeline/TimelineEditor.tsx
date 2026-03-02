import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Project, Shot, Scene } from '../../types';
import {
  Play, Pause, SkipBack, SkipForward, ZoomIn, ZoomOut,
  Scissors, Lock, Unlock, Eye, EyeOff, Plus, Trash2,
  ChevronRight, ChevronDown, Film, Music, Layers, Volume2, VolumeX,
  Copy, Monitor, Info, Maximize2
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
  collapsed: boolean;
  color: string;
  height: number;
}

interface TimelineState {
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  playheadFrame: number;
  totalFrames: number;
  fps: number;
  zoom: number;
  isPlaying: boolean;
  selectedClipIds: string[];
  inPoint: number | null;
  outPoint: number | null;
}

interface TimelineEditorProps {
  project: Project;
  onUpdateProject: (project: Project) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const SHOT_COLORS = [
  '#dc2626', '#ea580c', '#ca8a04', '#16a34a',
  '#0891b2', '#7c3aed', '#db2777', '#475569',
];

const DEFAULT_SHOT_DURATION = 150; // 5 seconds at 30fps
const RULER_HEIGHT = 30;
const TRACK_HEADER_WIDTH = 200;

function framesToTimecode(frames: number, fps: number): string {
  const totalSeconds = Math.floor(frames / fps);
  const f = frames % fps;
  const s = totalSeconds % 60;
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
}

function buildInitialTimeline(project: Project): TimelineState {
  const tracks: TimelineTrack[] = [
    { id: 'v1', name: 'Video 1', type: 'video', locked: false, muted: false, visible: true, collapsed: false, color: '#dc2626', height: 72 },
    { id: 'v2', name: 'Video 2', type: 'video', locked: false, muted: false, visible: true, collapsed: false, color: '#ea580c', height: 72 },
    { id: 'a1', name: 'Audio 1', type: 'audio', locked: false, muted: false, visible: true, collapsed: false, color: '#16a34a', height: 48 },
    { id: 'a2', name: 'Audio 2', type: 'audio', locked: false, muted: false, visible: true, collapsed: false, color: '#0891b2', height: 48 },
    { id: 'ol', name: 'Overlays', type: 'overlay', locked: false, muted: false, visible: true, collapsed: false, color: '#7c3aed', height: 40 },
  ];

  const clips: TimelineClip[] = [];
  let cursor = 0;
  let colorIdx = 0;

  for (const scene of project.scenes ?? []) {
    for (const shot of scene.shots ?? []) {
      clips.push({
        id: `clip-${shot.id}`,
        shotId: shot.id,
        sceneId: scene.id,
        trackId: 'v1',
        startFrame: cursor,
        durationFrames: DEFAULT_SHOT_DURATION,
        label: `${scene.name} · Shot ${shot.number}`,
        color: SHOT_COLORS[colorIdx % SHOT_COLORS.length],
        imageUrl: shot.imageUrl,
        locked: false,
        muted: false,
      });
      cursor += DEFAULT_SHOT_DURATION + 5;
      colorIdx++;
    }
  }

  const totalFrames = Math.max(cursor + DEFAULT_SHOT_DURATION * 2, 1800);

  return {
    tracks,
    clips,
    playheadFrame: 0,
    totalFrames,
    fps: 30,
    zoom: 0.5,
    isPlaying: false,
    selectedClipIds: [],
    inPoint: null,
    outPoint: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Track Header Sub-component
// ─────────────────────────────────────────────────────────────────────────────

const TrackHeader: React.FC<{
  track: TimelineTrack;
  onToggleLock: () => void;
  onToggleMute: () => void;
  onToggleVisible: () => void;
  onToggleCollapse: () => void;
  onDelete: () => void;
}> = ({ track, onToggleLock, onToggleMute, onToggleVisible, onToggleCollapse, onDelete }) => (
  <div
    className="flex items-center gap-1.5 px-2 border-b border-neutral-800 bg-neutral-900 select-none"
    style={{ height: track.collapsed ? 32 : track.height, minHeight: 32 }}
  >
    <button onClick={onToggleCollapse} className="text-neutral-500 hover:text-white transition-colors flex-shrink-0">
      {track.collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
    </button>
    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: track.color }} />
    <span className="text-xs text-neutral-200 font-medium flex-1 truncate">{track.name}</span>
    <div className="flex items-center gap-0.5 flex-shrink-0">
      <button
        onClick={onToggleLock}
        className={`p-1 rounded transition-colors ${track.locked ? 'text-yellow-400' : 'text-neutral-600 hover:text-neutral-300'}`}
        title={track.locked ? 'Unlock' : 'Lock'}
      >
        {track.locked ? <Lock size={11} /> : <Unlock size={11} />}
      </button>
      <button
        onClick={onToggleMute}
        className={`p-1 rounded transition-colors ${track.muted ? 'text-red-400' : 'text-neutral-600 hover:text-neutral-300'}`}
        title={track.muted ? 'Unmute' : 'Mute'}
      >
        {track.muted ? <VolumeX size={11} /> : <Volume2 size={11} />}
      </button>
      <button
        onClick={onToggleVisible}
        className={`p-1 rounded transition-colors ${!track.visible ? 'text-neutral-700' : 'text-neutral-400 hover:text-white'}`}
        title={track.visible ? 'Hide' : 'Show'}
      >
        {track.visible ? <Eye size={11} /> : <EyeOff size={11} />}
      </button>
      <button
        onClick={onDelete}
        className="p-1 rounded text-neutral-700 hover:text-red-400 transition-colors"
        title="Delete track"
      >
        <Trash2 size={11} />
      </button>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export const TimelineEditor: React.FC<TimelineEditorProps> = ({ project, onUpdateProject }) => {
  const [tl, setTl] = useState<TimelineState>(() => buildInitialTimeline(project));
  const [dragState, setDragState] = useState<{
    clipId: string;
    startX: number;
    originalStart: number;
    mode: 'move' | 'trim-left' | 'trim-right';
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; clipId: string } | null>(null);
  const [monitorFullscreen, setMonitorFullscreen] = useState(false);
  const timelineBodyRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const playIntervalRef = useRef<number | null>(null);

  // Sync clips when project shots change
  useEffect(() => {
    setTl(prev => {
      const newState = buildInitialTimeline(project);
      return {
        ...newState,
        zoom: prev.zoom,
        playheadFrame: prev.playheadFrame,
        tracks: prev.tracks,
      };
    });
  }, [project.scenes]);

  // Playback interval
  useEffect(() => {
    if (tl.isPlaying) {
      playIntervalRef.current = window.setInterval(() => {
        setTl(prev => {
          if (prev.playheadFrame >= prev.totalFrames) {
            return { ...prev, isPlaying: false, playheadFrame: 0 };
          }
          return { ...prev, playheadFrame: prev.playheadFrame + 1 };
        });
      }, 1000 / tl.fps);
    } else {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
    }
    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, [tl.isPlaying, tl.fps]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === ' ') { e.preventDefault(); togglePlay(); }
      if (e.key === '+' || e.key === '=') zoomIn();
      if (e.key === '-') zoomOut();
      if (e.key === 'ArrowLeft') stepBack();
      if (e.key === 'ArrowRight') stepForward();
      if (e.key === 'Home') goToStart();
      if (e.key === 'End') goToEnd();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const pxPerFrame = tl.zoom * 10;
  const totalWidth = tl.totalFrames * pxPerFrame;

  // Ruler rendering
  const renderRuler = () => {
    const marks = [];
    const minPixelsBetweenMarks = 60;
    const framesPerMark = Math.ceil(minPixelsBetweenMarks / pxPerFrame / tl.fps) * tl.fps;
    for (let f = 0; f <= tl.totalFrames; f += framesPerMark) {
      marks.push(
        <div
          key={f}
          className="absolute top-0 flex flex-col items-start"
          style={{ left: f * pxPerFrame }}
        >
          <div className="h-full w-px bg-neutral-600" />
          <span className="text-[9px] text-neutral-500 ml-1 absolute top-1 whitespace-nowrap">
            {framesToTimecode(f, tl.fps)}
          </span>
        </div>
      );
    }
    return marks;
  };

  // Drag handlers
  const handleClipMouseDown = useCallback((e: React.MouseEvent, clipId: string, mode: 'move' | 'trim-left' | 'trim-right') => {
    e.stopPropagation();
    const clip = tl.clips.find(c => c.id === clipId);
    if (!clip || clip.locked) return;
    setDragState({ clipId, startX: e.clientX, originalStart: clip.startFrame, mode });
    setTl(prev => ({ ...prev, selectedClipIds: [clipId] }));
  }, [tl.clips]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragState) return;
    const dx = e.clientX - dragState.startX;
    const frameDelta = Math.round(dx / pxPerFrame);
    setTl(prev => ({
      ...prev,
      clips: prev.clips.map(c => {
        if (c.id !== dragState.clipId) return c;
        if (dragState.mode === 'move') {
          return { ...c, startFrame: Math.max(0, dragState.originalStart + frameDelta) };
        }
        if (dragState.mode === 'trim-left') {
          const newStart = Math.max(0, dragState.originalStart + frameDelta);
          const diff = newStart - c.startFrame;
          return { ...c, startFrame: newStart, durationFrames: Math.max(15, c.durationFrames - diff) };
        }
        if (dragState.mode === 'trim-right') {
          return { ...c, durationFrames: Math.max(15, c.durationFrames + frameDelta) };
        }
        return c;
      }),
    }));
  }, [dragState, pxPerFrame]);

  const handleMouseUp = useCallback(() => setDragState(null), []);

  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + (e.currentTarget.scrollLeft ?? 0);
    const frame = Math.round(x / pxPerFrame);
    setTl(prev => ({ ...prev, playheadFrame: Math.max(0, Math.min(frame, prev.totalFrames)) }));
  };

  const handleTrackBodyClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragState) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const scrollLeft = timelineBodyRef.current?.scrollLeft ?? 0;
    const x = e.clientX - rect.left + scrollLeft;
    const frame = Math.round(x / pxPerFrame);
    setTl(prev => ({ ...prev, playheadFrame: Math.max(0, Math.min(frame, prev.totalFrames)) }));
  };

  const handleClipContextMenu = (e: React.MouseEvent, clipId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, clipId });
  };

  const deleteClip = (clipId: string) => {
    setTl(prev => ({ ...prev, clips: prev.clips.filter(c => c.id !== clipId), selectedClipIds: [] }));
    setContextMenu(null);
  };

  const duplicateClip = (clipId: string) => {
    const clip = tl.clips.find(c => c.id === clipId);
    if (!clip) return;
    setTl(prev => ({ ...prev, clips: [...prev.clips, { ...clip, id: crypto.randomUUID(), startFrame: clip.startFrame + clip.durationFrames + 5 }] }));
    setContextMenu(null);
  };

  const splitClip = (clipId: string) => {
    const clip = tl.clips.find(c => c.id === clipId);
    if (!clip) return;
    const sp = tl.playheadFrame;
    if (sp <= clip.startFrame || sp >= clip.startFrame + clip.durationFrames) return;
    const left = { ...clip, durationFrames: sp - clip.startFrame };
    const right = { ...clip, id: crypto.randomUUID(), startFrame: sp, durationFrames: clip.durationFrames - (sp - clip.startFrame) };
    setTl(prev => ({ ...prev, clips: prev.clips.map(c => c.id === clipId ? left : c).concat(right) }));
    setContextMenu(null);
  };

  const addTrack = (type: 'video' | 'audio' | 'overlay') => {
    const count = tl.tracks.filter(t => t.type === type).length + 1;
    const colors = { video: '#dc2626', audio: '#16a34a', overlay: '#7c3aed' };
    const heights = { video: 72, audio: 48, overlay: 40 };
    setTl(prev => ({
      ...prev,
      tracks: [...prev.tracks, {
        id: crypto.randomUUID(),
        name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${count}`,
        type, locked: false, muted: false, visible: true, collapsed: false,
        color: colors[type], height: heights[type],
      }],
    }));
  };

  const updateTrack = (trackId: string, patch: Partial<TimelineTrack>) => {
    setTl(prev => ({ ...prev, tracks: prev.tracks.map(t => t.id === trackId ? { ...t, ...patch } : t) }));
  };

  const deleteTrack = (trackId: string) => {
    setTl(prev => ({ ...prev, tracks: prev.tracks.filter(t => t.id !== trackId), clips: prev.clips.filter(c => c.trackId !== trackId) }));
  };

  const togglePlay = () => setTl(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
  const goToStart = () => setTl(prev => ({ ...prev, playheadFrame: 0, isPlaying: false }));
  const goToEnd = () => setTl(prev => ({ ...prev, playheadFrame: prev.totalFrames, isPlaying: false }));
  const stepBack = () => setTl(prev => ({ ...prev, playheadFrame: Math.max(0, prev.playheadFrame - 1) }));
  const stepForward = () => setTl(prev => ({ ...prev, playheadFrame: Math.min(prev.totalFrames, prev.playheadFrame + 1) }));
  const zoomIn = () => setTl(prev => ({ ...prev, zoom: Math.min(prev.zoom * 1.5, 8) }));
  const zoomOut = () => setTl(prev => ({ ...prev, zoom: Math.max(prev.zoom / 1.5, 0.05) }));

  // Current frame image
  const currentClip = tl.clips
    .filter(c => {
      const track = tl.tracks.find(t => t.id === c.trackId);
      return track?.visible && !track?.muted && c.startFrame <= tl.playheadFrame && c.startFrame + c.durationFrames > tl.playheadFrame;
    })
    .sort((a, b) => tl.tracks.findIndex(t => t.id === a.trackId) - tl.tracks.findIndex(t => t.id === b.trackId))[0];

  const selectedClip = tl.selectedClipIds.length === 1
    ? tl.clips.find(c => c.id === tl.selectedClipIds[0])
    : null;

  // Sync timeline scroll with ruler scroll
  const syncScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (rulerRef.current) {
      rulerRef.current.scrollLeft = (e.target as HTMLDivElement).scrollLeft;
    }
  };

  return (
    <div
      className="flex flex-col bg-neutral-950 text-white select-none h-full overflow-hidden"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={() => contextMenu && setContextMenu(null)}
    >
      {/* ── TOP SECTION: Program Monitor + Inspector ── */}
      <div className="flex flex-shrink-0 border-b-2 border-neutral-800" style={{ height: '42%', minHeight: 260 }}>

        {/* Program Monitor */}
        <div className="flex-1 flex flex-col bg-black min-w-0 border-r border-neutral-800">
          {/* Monitor header */}
          <div className="flex items-center justify-between px-3 py-1.5 bg-neutral-900 border-b border-neutral-800 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Monitor size={13} className="text-neutral-400" />
              <span className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">Program Monitor</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-green-400 bg-black px-2 py-0.5 rounded border border-neutral-700">
                {framesToTimecode(tl.playheadFrame, tl.fps)}
              </span>
              <button
                onClick={() => setMonitorFullscreen(v => !v)}
                className="p-1 text-neutral-500 hover:text-white transition-colors rounded"
                title="Toggle fullscreen monitor"
              >
                <Maximize2 size={12} />
              </button>
            </div>
          </div>

          {/* Monitor screen */}
          <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
            {currentClip?.imageUrl ? (
              <img
                src={currentClip.imageUrl}
                alt="Program Monitor"
                className="max-w-full max-h-full object-contain"
                style={{ imageRendering: 'auto' }}
                draggable={false}
              />
            ) : (
              <div className="flex flex-col items-center gap-3 text-neutral-700">
                <Film size={48} strokeWidth={1} />
                <div className="text-center">
                  <div className="text-sm font-medium text-neutral-600">No frame at playhead</div>
                  <div className="text-xs text-neutral-700 mt-1">
                    {tl.clips.length === 0
                      ? 'Add shots to your storyboard to see them here'
                      : 'Move the playhead over a clip to preview it'}
                  </div>
                </div>
              </div>
            )}

            {/* Safe area overlay (subtle) */}
            <div className="absolute inset-0 pointer-events-none" style={{
              boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.03)'
            }} />

            {/* Timecode burn-in */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 font-mono text-xs text-white/70 bg-black/60 px-3 py-1 rounded tracking-widest">
              {framesToTimecode(tl.playheadFrame, tl.fps)}
            </div>

            {/* Clip label */}
            {currentClip && (
              <div className="absolute top-3 left-3 text-xs text-white/60 bg-black/50 px-2 py-0.5 rounded">
                {currentClip.label}
              </div>
            )}
          </div>

          {/* Transport controls */}
          <div className="flex items-center justify-center gap-1 px-4 py-2 bg-neutral-900 border-t border-neutral-800 flex-shrink-0">
            <button onClick={goToStart} className="p-2 hover:bg-neutral-700 rounded transition-colors text-neutral-300" title="Go to start (Home)">
              <SkipBack size={16} />
            </button>
            <button onClick={stepBack} className="p-2 hover:bg-neutral-700 rounded transition-colors text-neutral-300" title="Step back (←)">
              <SkipBack size={13} />
            </button>
            <button
              onClick={togglePlay}
              className="p-2.5 bg-red-600 hover:bg-red-500 rounded-full transition-colors mx-2 shadow-lg shadow-red-900/40"
              title={tl.isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {tl.isPlaying ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button onClick={stepForward} className="p-2 hover:bg-neutral-700 rounded transition-colors text-neutral-300" title="Step forward (→)">
              <SkipForward size={13} />
            </button>
            <button onClick={goToEnd} className="p-2 hover:bg-neutral-700 rounded transition-colors text-neutral-300" title="Go to end (End)">
              <SkipForward size={16} />
            </button>
          </div>
        </div>

        {/* Inspector Panel */}
        <div className="w-64 flex-shrink-0 flex flex-col bg-neutral-900 border-l border-neutral-800">
          {/* Inspector header */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-850 border-b border-neutral-800 flex-shrink-0">
            <Info size={13} className="text-neutral-400" />
            <span className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">Clip Inspector</span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {selectedClip ? (
              <>
                {/* Thumbnail */}
                {selectedClip.imageUrl && (
                  <div className="w-full aspect-video bg-black rounded overflow-hidden border border-neutral-700">
                    <img src={selectedClip.imageUrl} alt="" className="w-full h-full object-contain" />
                  </div>
                )}

                {/* Clip info */}
                <div className="space-y-2">
                  <div>
                    <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">Clip Name</div>
                    <div className="text-sm text-white font-medium">{selectedClip.label}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">Start</div>
                      <div className="text-xs text-neutral-300 font-mono">{framesToTimecode(selectedClip.startFrame, tl.fps)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">Duration</div>
                      <div className="text-xs text-neutral-300 font-mono">{framesToTimecode(selectedClip.durationFrames, tl.fps)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">End</div>
                      <div className="text-xs text-neutral-300 font-mono">{framesToTimecode(selectedClip.startFrame + selectedClip.durationFrames, tl.fps)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">Track</div>
                      <div className="text-xs text-neutral-300">{tl.tracks.find(t => t.id === selectedClip.trackId)?.name ?? '—'}</div>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">Status</div>
                    <div className="flex gap-1.5">
                      {selectedClip.locked && <span className="text-[10px] bg-yellow-900/40 text-yellow-400 px-1.5 py-0.5 rounded">Locked</span>}
                      {selectedClip.muted && <span className="text-[10px] bg-red-900/40 text-red-400 px-1.5 py-0.5 rounded">Muted</span>}
                      {!selectedClip.locked && !selectedClip.muted && <span className="text-[10px] bg-green-900/40 text-green-400 px-1.5 py-0.5 rounded">Active</span>}
                    </div>
                  </div>
                </div>

                {/* Quick actions */}
                <div className="space-y-1.5 pt-2 border-t border-neutral-800">
                  <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-2">Actions</div>
                  <button
                    onClick={() => splitClip(selectedClip.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 rounded transition-colors"
                  >
                    <Scissors size={11} /> Split at playhead
                  </button>
                  <button
                    onClick={() => duplicateClip(selectedClip.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 rounded transition-colors"
                  >
                    <Copy size={11} /> Duplicate
                  </button>
                  <button
                    onClick={() => setTl(prev => ({ ...prev, clips: prev.clips.map(c => c.id === selectedClip.id ? { ...c, locked: !c.locked } : c) }))}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 rounded transition-colors"
                  >
                    {selectedClip.locked ? <Unlock size={11} /> : <Lock size={11} />}
                    {selectedClip.locked ? 'Unlock' : 'Lock'}
                  </button>
                  <button
                    onClick={() => deleteClip(selectedClip.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-red-400 hover:bg-red-900/20 rounded transition-colors"
                  >
                    <Trash2 size={11} /> Delete clip
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center py-8">
                <Film size={28} className="text-neutral-700 mb-3" strokeWidth={1} />
                <div className="text-xs text-neutral-600">Click a clip to inspect it</div>
              </div>
            )}
          </div>

          {/* Project stats */}
          <div className="px-3 py-2 border-t border-neutral-800 bg-neutral-950 flex-shrink-0">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <div className="text-[10px] text-neutral-600">Clips: <span className="text-neutral-400">{tl.clips.length}</span></div>
              <div className="text-[10px] text-neutral-600">Tracks: <span className="text-neutral-400">{tl.tracks.length}</span></div>
              <div className="text-[10px] text-neutral-600">Duration: <span className="text-neutral-400 font-mono">{framesToTimecode(tl.totalFrames, tl.fps)}</span></div>
              <div className="text-[10px] text-neutral-600">FPS: <span className="text-neutral-400">{tl.fps}</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* ── BOTTOM SECTION: Timeline ── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

        {/* Timeline toolbar */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-900 border-b border-neutral-800 flex-shrink-0">
          {/* Zoom */}
          <div className="flex items-center gap-1">
            <button onClick={zoomOut} className="p-1 hover:bg-neutral-700 rounded transition-colors text-neutral-400" title="Zoom out (-)">
              <ZoomOut size={13} />
            </button>
            <div className="text-xs text-neutral-500 w-10 text-center">{Math.round(tl.zoom * 100)}%</div>
            <button onClick={zoomIn} className="p-1 hover:bg-neutral-700 rounded transition-colors text-neutral-400" title="Zoom in (+)">
              <ZoomIn size={13} />
            </button>
          </div>

          <div className="w-px h-4 bg-neutral-700 mx-1" />

          {/* Add track */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-neutral-600 uppercase tracking-wider mr-1">Add Track:</span>
            <button onClick={() => addTrack('video')} className="flex items-center gap-1 text-[11px] bg-neutral-800 hover:bg-neutral-700 px-2 py-0.5 rounded border border-neutral-700 transition-colors text-neutral-300" title="Add video track">
              <Film size={10} /> Video
            </button>
            <button onClick={() => addTrack('audio')} className="flex items-center gap-1 text-[11px] bg-neutral-800 hover:bg-neutral-700 px-2 py-0.5 rounded border border-neutral-700 transition-colors text-neutral-300" title="Add audio track">
              <Music size={10} /> Audio
            </button>
            <button onClick={() => addTrack('overlay')} className="flex items-center gap-1 text-[11px] bg-neutral-800 hover:bg-neutral-700 px-2 py-0.5 rounded border border-neutral-700 transition-colors text-neutral-300" title="Add overlay track">
              <Layers size={10} /> Overlay
            </button>
          </div>

          <div className="flex-1" />
          <span className="text-[10px] text-neutral-600 hidden md:block">Space: play/pause · ←→: step · +−: zoom · Right-click clip for options</span>
        </div>

        {/* Ruler row */}
        <div className="flex flex-shrink-0 border-b border-neutral-800" style={{ height: RULER_HEIGHT }}>
          <div className="flex-shrink-0 bg-neutral-900 border-r border-neutral-800 flex items-center px-3" style={{ width: TRACK_HEADER_WIDTH }}>
            <span className="text-[10px] text-neutral-600 uppercase tracking-widest font-medium">Timeline</span>
          </div>
          <div
            ref={rulerRef}
            className="flex-1 overflow-hidden relative bg-neutral-900 cursor-pointer"
            style={{ overflowX: 'hidden' }}
            onClick={handleRulerClick}
          >
            <div className="relative h-full" style={{ width: totalWidth }}>
              {renderRuler()}
              {tl.inPoint !== null && (
                <div className="absolute top-0 bottom-0 w-0.5 bg-yellow-400 z-10" style={{ left: tl.inPoint * pxPerFrame }} />
              )}
              {tl.outPoint !== null && (
                <div className="absolute top-0 bottom-0 w-0.5 bg-yellow-400 z-10" style={{ left: tl.outPoint * pxPerFrame }} />
              )}
              <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none" style={{ left: tl.playheadFrame * pxPerFrame }}>
                <div className="w-3 h-3 bg-red-500 absolute -top-0 left-1/2 -translate-x-1/2 rotate-45 shadow-lg" />
              </div>
            </div>
          </div>
        </div>

        {/* Tracks area */}
        <div
          ref={timelineBodyRef}
          className="flex-1 overflow-auto"
          style={{ scrollbarWidth: 'thin', scrollbarColor: '#404040 #1a1a1a' }}
          onScroll={syncScroll}
        >
          {tl.tracks.map(track => {
            const trackClips = tl.clips.filter(c => c.trackId === track.id);
            const trackHeight = track.collapsed ? 32 : track.height;

            return (
              <div key={track.id} className="flex border-b border-neutral-800" style={{ height: trackHeight }}>
                {/* Track header */}
                <div className="flex-shrink-0 sticky left-0 z-20" style={{ width: TRACK_HEADER_WIDTH }}>
                  <TrackHeader
                    track={track}
                    onToggleLock={() => updateTrack(track.id, { locked: !track.locked })}
                    onToggleMute={() => updateTrack(track.id, { muted: !track.muted })}
                    onToggleVisible={() => updateTrack(track.id, { visible: !track.visible })}
                    onToggleCollapse={() => updateTrack(track.id, { collapsed: !track.collapsed })}
                    onDelete={() => deleteTrack(track.id)}
                  />
                </div>

                {/* Track body */}
                <div
                  className={`relative overflow-hidden ${track.muted || !track.visible ? 'opacity-30' : ''}`}
                  style={{
                    width: totalWidth,
                    minWidth: '100%',
                    background: track.type === 'video'
                      ? 'repeating-linear-gradient(90deg, #111 0px, #111 1px, transparent 1px, transparent 30px)'
                      : track.type === 'audio'
                      ? 'repeating-linear-gradient(90deg, #0a1a0a 0px, #0a1a0a 1px, transparent 1px, transparent 30px)'
                      : 'repeating-linear-gradient(90deg, #0d0a1a 0px, #0d0a1a 1px, transparent 1px, transparent 30px)',
                  }}
                  onClick={handleTrackBodyClick}
                >
                  {/* Clips */}
                  {!track.collapsed && trackClips.map(clip => {
                    const isSelected = tl.selectedClipIds.includes(clip.id);
                    const clipWidth = Math.max(clip.durationFrames * pxPerFrame, 20);

                    return (
                      <div
                        key={clip.id}
                        className={`absolute top-1 bottom-1 rounded overflow-hidden cursor-grab active:cursor-grabbing border-2 transition-shadow ${
                          isSelected
                            ? 'border-white shadow-lg shadow-white/20 z-20'
                            : 'border-transparent hover:border-white/40 z-10'
                        } ${clip.locked ? 'cursor-not-allowed' : ''}`}
                        style={{
                          left: clip.startFrame * pxPerFrame,
                          width: clipWidth,
                          backgroundColor: clip.color + 'cc',
                        }}
                        onMouseDown={e => handleClipMouseDown(e, clip.id, 'move')}
                        onContextMenu={e => handleClipContextMenu(e, clip.id)}
                      >
                        {/* Thumbnail */}
                        {clip.imageUrl && clipWidth > 40 && (
                          <img
                            src={clip.imageUrl}
                            alt=""
                            className="absolute inset-0 w-full h-full object-cover opacity-35"
                            draggable={false}
                          />
                        )}
                        {/* Label */}
                        <div className="relative z-10 px-1.5 py-0.5 flex items-center gap-1 h-full">
                          <span className="text-white text-[10px] font-semibold truncate leading-tight drop-shadow">
                            {clip.label}
                          </span>
                          {clip.locked && <Lock size={8} className="text-yellow-300 flex-shrink-0" />}
                        </div>
                        {/* Trim handles */}
                        <div
                          className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 transition-colors z-20"
                          onMouseDown={e => { e.stopPropagation(); handleClipMouseDown(e, clip.id, 'trim-left'); }}
                        />
                        <div
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 transition-colors z-20"
                          onMouseDown={e => { e.stopPropagation(); handleClipMouseDown(e, clip.id, 'trim-right'); }}
                        />
                      </div>
                    );
                  })}

                  {/* Playhead line */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-30 pointer-events-none"
                    style={{ left: tl.playheadFrame * pxPerFrame }}
                  />
                </div>
              </div>
            );
          })}

          {tl.tracks.length === 0 && (
            <div className="flex items-center justify-center h-24 text-neutral-600 text-sm">
              No tracks. Add a video or audio track above.
            </div>
          )}
        </div>

        {/* Status bar */}
        <div className="flex items-center gap-4 px-3 py-1 bg-neutral-900 border-t border-neutral-800 text-[10px] text-neutral-500 flex-shrink-0">
          <span>{tl.clips.length} clips</span>
          <span>{tl.tracks.length} tracks</span>
          <span>Duration: {framesToTimecode(tl.totalFrames, tl.fps)}</span>
          <span>Zoom: {Math.round(tl.zoom * 100)}%</span>
          {tl.selectedClipIds.length > 0 && <span className="text-white">{tl.selectedClipIds.length} selected</span>}
          <div className="flex-1" />
          <span className="text-neutral-700">Drag clips to move · Drag edges to trim · Right-click for options</span>
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-neutral-800 border border-neutral-600 rounded-lg shadow-2xl py-1 min-w-[170px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button onClick={() => splitClip(contextMenu.clipId)} className="w-full text-left px-3 py-1.5 text-sm hover:bg-neutral-700 flex items-center gap-2 text-neutral-200">
            <Scissors size={12} /> Split at playhead
          </button>
          <button onClick={() => duplicateClip(contextMenu.clipId)} className="w-full text-left px-3 py-1.5 text-sm hover:bg-neutral-700 flex items-center gap-2 text-neutral-200">
            <Copy size={12} /> Duplicate clip
          </button>
          <div className="border-t border-neutral-700 my-1" />
          <button
            onClick={() => {
              setTl(prev => ({ ...prev, clips: prev.clips.map(c => c.id === contextMenu.clipId ? { ...c, locked: !c.locked } : c) }));
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-neutral-700 flex items-center gap-2 text-neutral-200"
          >
            <Lock size={12} /> Toggle lock
          </button>
          <div className="border-t border-neutral-700 my-1" />
          <button onClick={() => deleteClip(contextMenu.clipId)} className="w-full text-left px-3 py-1.5 text-sm hover:bg-red-900/40 text-red-400 flex items-center gap-2">
            <Trash2 size={12} /> Delete clip
          </button>
        </div>
      )}
    </div>
  );
};

export default TimelineEditor;
