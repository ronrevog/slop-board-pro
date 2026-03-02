import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Project, Shot, Scene } from '../../types';
import {
  Play, Pause, SkipBack, SkipForward, ZoomIn, ZoomOut,
  Scissors, Lock, Unlock, Eye, EyeOff, Plus, Trash2,
  ChevronRight, ChevronDown, Film, Music, Layers, Volume2, VolumeX,
  Move, Copy, AlignLeft, AlignCenter, AlignRight
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
  zoom: number; // pixels per frame
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
const RULER_HEIGHT = 28;
const TRACK_HEADER_WIDTH = 180;

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

  const totalFrames = Math.max(cursor + DEFAULT_SHOT_DURATION * 2, 1800); // at least 60s at 30fps

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
// Sub-components
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
    className="flex items-center gap-1 px-2 border-b border-neutral-800 bg-neutral-900 select-none"
    style={{ height: track.collapsed ? 32 : track.height, minHeight: 32 }}
  >
    <button onClick={onToggleCollapse} className="text-neutral-500 hover:text-white transition-colors flex-shrink-0">
      {track.collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
    </button>
    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: track.color }} />
    <span className="text-xs text-neutral-300 font-medium flex-1 truncate ml-1">{track.name}</span>
    <div className="flex items-center gap-0.5 flex-shrink-0">
      <button
        onClick={onToggleLock}
        className={`p-0.5 rounded transition-colors ${track.locked ? 'text-yellow-400' : 'text-neutral-600 hover:text-neutral-300'}`}
        title={track.locked ? 'Unlock' : 'Lock'}
      >
        {track.locked ? <Lock size={10} /> : <Unlock size={10} />}
      </button>
      <button
        onClick={onToggleMute}
        className={`p-0.5 rounded transition-colors ${track.muted ? 'text-red-400' : 'text-neutral-600 hover:text-neutral-300'}`}
        title={track.muted ? 'Unmute' : 'Mute'}
      >
        {track.muted ? <VolumeX size={10} /> : <Volume2 size={10} />}
      </button>
      <button
        onClick={onToggleVisible}
        className={`p-0.5 rounded transition-colors ${!track.visible ? 'text-neutral-600' : 'text-neutral-400 hover:text-white'}`}
        title={track.visible ? 'Hide' : 'Show'}
      >
        {track.visible ? <Eye size={10} /> : <EyeOff size={10} />}
      </button>
      <button
        onClick={onDelete}
        className="p-0.5 rounded text-neutral-700 hover:text-red-400 transition-colors"
        title="Delete track"
      >
        <Trash2 size={10} />
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
  const timelineBodyRef = useRef<HTMLDivElement>(null);
  const playIntervalRef = useRef<number | null>(null);

  // Rebuild timeline when project shots change
  useEffect(() => {
    setTl(prev => {
      const newTl = buildInitialTimeline(project);
      // Preserve track settings
      const trackMap = new Map(prev.tracks.map(t => [t.id, t]));
      return {
        ...newTl,
        tracks: newTl.tracks.map(t => trackMap.get(t.id) ?? t),
        zoom: prev.zoom,
        playheadFrame: prev.playheadFrame,
      };
    });
  }, [project.scenes]);

  // Playback
  useEffect(() => {
    if (tl.isPlaying) {
      playIntervalRef.current = window.setInterval(() => {
        setTl(prev => {
          const next = prev.playheadFrame + 1;
          if (next >= prev.totalFrames) {
            return { ...prev, playheadFrame: 0, isPlaying: false };
          }
          return { ...prev, playheadFrame: next };
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

  const pxPerFrame = tl.zoom;
  const totalWidth = tl.totalFrames * pxPerFrame;

  // ── Ruler ──────────────────────────────────────────────────────────────────

  const renderRuler = () => {
    const marks: React.ReactNode[] = [];
    const step = Math.max(1, Math.round(tl.fps / tl.zoom / 2)); // adaptive step
    for (let f = 0; f <= tl.totalFrames; f += step) {
      const x = f * pxPerFrame;
      const isMajor = f % (tl.fps * 5) === 0;
      marks.push(
        <div
          key={f}
          className="absolute top-0 flex flex-col items-center"
          style={{ left: x, transform: 'translateX(-50%)' }}
        >
          <div className={`bg-neutral-500 ${isMajor ? 'h-3 w-px' : 'h-1.5 w-px'}`} />
          {isMajor && (
            <span className="text-neutral-500 text-[9px] mt-0.5 whitespace-nowrap">
              {framesToTimecode(f, tl.fps)}
            </span>
          )}
        </div>
      );
    }
    return marks;
  };

  // ── Clip rendering ─────────────────────────────────────────────────────────

  const handleClipMouseDown = useCallback((
    e: React.MouseEvent,
    clipId: string,
    mode: 'move' | 'trim-left' | 'trim-right'
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const clip = tl.clips.find(c => c.id === clipId);
    if (!clip || clip.locked) return;

    setTl(prev => ({
      ...prev,
      selectedClipIds: e.shiftKey
        ? prev.selectedClipIds.includes(clipId)
          ? prev.selectedClipIds.filter(id => id !== clipId)
          : [...prev.selectedClipIds, clipId]
        : [clipId],
    }));

    setDragState({
      clipId,
      startX: e.clientX,
      originalStart: clip.startFrame,
      mode,
    });
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

  const handleMouseUp = useCallback(() => {
    setDragState(null);
  }, []);

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (!timelineBodyRef.current) return;
    const rect = timelineBodyRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + (timelineBodyRef.current.scrollLeft ?? 0);
    const frame = Math.round(x / pxPerFrame);
    setTl(prev => ({ ...prev, playheadFrame: Math.max(0, Math.min(frame, prev.totalFrames)) }));
  };

  const handleClipContextMenu = (e: React.MouseEvent, clipId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, clipId });
  };

  const deleteClip = (clipId: string) => {
    setTl(prev => ({
      ...prev,
      clips: prev.clips.filter(c => c.id !== clipId),
      selectedClipIds: prev.selectedClipIds.filter(id => id !== clipId),
    }));
    setContextMenu(null);
  };

  const duplicateClip = (clipId: string) => {
    const clip = tl.clips.find(c => c.id === clipId);
    if (!clip) return;
    const newClip: TimelineClip = {
      ...clip,
      id: crypto.randomUUID(),
      startFrame: clip.startFrame + clip.durationFrames + 5,
    };
    setTl(prev => ({ ...prev, clips: [...prev.clips, newClip] }));
    setContextMenu(null);
  };

  const splitClip = (clipId: string) => {
    const clip = tl.clips.find(c => c.id === clipId);
    if (!clip) return;
    const splitPoint = tl.playheadFrame;
    if (splitPoint <= clip.startFrame || splitPoint >= clip.startFrame + clip.durationFrames) return;

    const leftDuration = splitPoint - clip.startFrame;
    const rightDuration = clip.durationFrames - leftDuration;

    const leftClip: TimelineClip = { ...clip, durationFrames: leftDuration };
    const rightClip: TimelineClip = {
      ...clip,
      id: crypto.randomUUID(),
      startFrame: splitPoint,
      durationFrames: rightDuration,
    };

    setTl(prev => ({
      ...prev,
      clips: prev.clips.map(c => c.id === clipId ? leftClip : c).concat(rightClip),
    }));
    setContextMenu(null);
  };

  // ── Track management ───────────────────────────────────────────────────────

  const addTrack = (type: 'video' | 'audio' | 'overlay') => {
    const count = tl.tracks.filter(t => t.type === type).length + 1;
    const colors = { video: '#dc2626', audio: '#16a34a', overlay: '#7c3aed' };
    const heights = { video: 72, audio: 48, overlay: 40 };
    const newTrack: TimelineTrack = {
      id: crypto.randomUUID(),
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${count}`,
      type,
      locked: false,
      muted: false,
      visible: true,
      collapsed: false,
      color: colors[type],
      height: heights[type],
    };
    setTl(prev => ({ ...prev, tracks: [...prev.tracks, newTrack] }));
  };

  const updateTrack = (trackId: string, patch: Partial<TimelineTrack>) => {
    setTl(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => t.id === trackId ? { ...t, ...patch } : t),
    }));
  };

  const deleteTrack = (trackId: string) => {
    setTl(prev => ({
      ...prev,
      tracks: prev.tracks.filter(t => t.id !== trackId),
      clips: prev.clips.filter(c => c.trackId !== trackId),
    }));
  };

  // ── Playback controls ──────────────────────────────────────────────────────

  const togglePlay = () => setTl(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
  const goToStart = () => setTl(prev => ({ ...prev, playheadFrame: 0, isPlaying: false }));
  const goToEnd = () => setTl(prev => ({ ...prev, playheadFrame: prev.totalFrames, isPlaying: false }));
  const stepBack = () => setTl(prev => ({ ...prev, playheadFrame: Math.max(0, prev.playheadFrame - 1) }));
  const stepForward = () => setTl(prev => ({ ...prev, playheadFrame: Math.min(prev.totalFrames, prev.playheadFrame + 1) }));

  const zoomIn = () => setTl(prev => ({ ...prev, zoom: Math.min(prev.zoom * 1.5, 8) }));
  const zoomOut = () => setTl(prev => ({ ...prev, zoom: Math.max(prev.zoom / 1.5, 0.05) }));

  // ── Preview frame ──────────────────────────────────────────────────────────

  const currentClip = tl.clips
    .filter(c => c.startFrame <= tl.playheadFrame && c.startFrame + c.durationFrames > tl.playheadFrame)
    .sort((a, b) => {
      const ta = tl.tracks.findIndex(t => t.id === a.trackId);
      const tb = tl.tracks.findIndex(t => t.id === b.trackId);
      return ta - tb;
    })[0];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col bg-neutral-950 text-white select-none h-full"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={() => contextMenu && setContextMenu(null)}
    >
      {/* Top toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-neutral-900 border-b border-neutral-800 flex-shrink-0">
        {/* Transport */}
        <div className="flex items-center gap-1 border-r border-neutral-700 pr-3 mr-1">
          <button onClick={goToStart} className="p-1.5 hover:bg-neutral-700 rounded transition-colors" title="Go to start">
            <SkipBack size={14} />
          </button>
          <button onClick={stepBack} className="p-1.5 hover:bg-neutral-700 rounded transition-colors" title="Step back">
            <SkipBack size={12} />
          </button>
          <button
            onClick={togglePlay}
            className="p-1.5 bg-red-600 hover:bg-red-500 rounded transition-colors"
            title={tl.isPlaying ? 'Pause' : 'Play'}
          >
            {tl.isPlaying ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button onClick={stepForward} className="p-1.5 hover:bg-neutral-700 rounded transition-colors" title="Step forward">
            <SkipForward size={12} />
          </button>
          <button onClick={goToEnd} className="p-1.5 hover:bg-neutral-700 rounded transition-colors" title="Go to end">
            <SkipForward size={14} />
          </button>
        </div>

        {/* Timecode display */}
        <div className="font-mono text-sm text-green-400 bg-neutral-800 px-3 py-1 rounded border border-neutral-700 min-w-[120px] text-center">
          {framesToTimecode(tl.playheadFrame, tl.fps)}
        </div>

        <div className="text-xs text-neutral-500 ml-1">{tl.fps} fps</div>

        <div className="flex-1" />

        {/* Zoom */}
        <div className="flex items-center gap-1 border-l border-neutral-700 pl-3">
          <button onClick={zoomOut} className="p-1.5 hover:bg-neutral-700 rounded transition-colors" title="Zoom out">
            <ZoomOut size={14} />
          </button>
          <div className="text-xs text-neutral-400 w-12 text-center">{Math.round(tl.zoom * 100)}%</div>
          <button onClick={zoomIn} className="p-1.5 hover:bg-neutral-700 rounded transition-colors" title="Zoom in">
            <ZoomIn size={14} />
          </button>
        </div>

        {/* Add track buttons */}
        <div className="flex items-center gap-1 border-l border-neutral-700 pl-3">
          <button
            onClick={() => addTrack('video')}
            className="flex items-center gap-1 text-xs bg-neutral-800 hover:bg-neutral-700 px-2 py-1 rounded border border-neutral-700 transition-colors"
            title="Add video track"
          >
            <Film size={11} /> <span>Video</span>
          </button>
          <button
            onClick={() => addTrack('audio')}
            className="flex items-center gap-1 text-xs bg-neutral-800 hover:bg-neutral-700 px-2 py-1 rounded border border-neutral-700 transition-colors"
            title="Add audio track"
          >
            <Music size={11} /> <span>Audio</span>
          </button>
          <button
            onClick={() => addTrack('overlay')}
            className="flex items-center gap-1 text-xs bg-neutral-800 hover:bg-neutral-700 px-2 py-1 rounded border border-neutral-700 transition-colors"
            title="Add overlay track"
          >
            <Layers size={11} /> <span>Overlay</span>
          </button>
        </div>
      </div>

      {/* Main area: preview + timeline */}
      <div className="flex flex-1 min-h-0">
        {/* Preview monitor */}
        <div className="w-64 flex-shrink-0 bg-black border-r border-neutral-800 flex flex-col">
          <div className="flex-1 flex items-center justify-center bg-neutral-950 relative overflow-hidden">
            {currentClip?.imageUrl ? (
              <img
                src={currentClip.imageUrl}
                alt="Preview"
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-neutral-700">
                <Film size={32} />
                <span className="text-xs">No frame at playhead</span>
              </div>
            )}
            {/* Timecode overlay */}
            <div className="absolute bottom-2 left-2 font-mono text-xs text-green-400 bg-black/70 px-2 py-0.5 rounded">
              {framesToTimecode(tl.playheadFrame, tl.fps)}
            </div>
          </div>
          {/* Clip info */}
          <div className="px-3 py-2 border-t border-neutral-800 bg-neutral-900">
            <div className="text-xs text-neutral-400 truncate">
              {currentClip ? currentClip.label : 'No clip at playhead'}
            </div>
            <div className="text-xs text-neutral-600 mt-0.5">
              {tl.selectedClipIds.length > 0
                ? `${tl.selectedClipIds.length} clip(s) selected`
                : 'Click clip to select'}
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Ruler row */}
          <div className="flex flex-shrink-0 border-b border-neutral-800" style={{ height: RULER_HEIGHT }}>
            {/* Track header spacer */}
            <div
              className="flex-shrink-0 bg-neutral-900 border-r border-neutral-800 flex items-center px-2"
              style={{ width: TRACK_HEADER_WIDTH }}
            >
              <span className="text-xs text-neutral-600">TIMELINE</span>
            </div>
            {/* Ruler */}
            <div
              className="flex-1 overflow-hidden relative bg-neutral-900 cursor-pointer"
              onClick={handleTimelineClick}
            >
              <div className="relative h-full" style={{ width: totalWidth }}>
                {renderRuler()}
                {/* In/Out points */}
                {tl.inPoint !== null && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-yellow-400"
                    style={{ left: tl.inPoint * pxPerFrame }}
                  />
                )}
                {tl.outPoint !== null && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-yellow-400"
                    style={{ left: tl.outPoint * pxPerFrame }}
                  />
                )}
                {/* Playhead on ruler */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
                  style={{ left: tl.playheadFrame * pxPerFrame }}
                >
                  <div className="w-3 h-3 bg-red-500 absolute -top-0 left-1/2 -translate-x-1/2 rotate-45" />
                </div>
              </div>
            </div>
          </div>

          {/* Tracks */}
          <div
            ref={timelineBodyRef}
            className="flex-1 overflow-auto"
            style={{ scrollbarWidth: 'thin', scrollbarColor: '#404040 #1a1a1a' }}
          >
            {tl.tracks.map(track => {
              const trackClips = tl.clips.filter(c => c.trackId === track.id);
              const trackHeight = track.collapsed ? 32 : track.height;

              return (
                <div key={track.id} className="flex border-b border-neutral-800" style={{ height: trackHeight }}>
                  {/* Track header */}
                  <div className="flex-shrink-0" style={{ width: TRACK_HEADER_WIDTH }}>
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
                    className={`flex-1 relative overflow-hidden ${track.muted || !track.visible ? 'opacity-40' : ''}`}
                    style={{
                      width: totalWidth,
                      background: track.type === 'video'
                        ? 'repeating-linear-gradient(90deg, #111 0px, #111 1px, transparent 1px, transparent 30px)'
                        : track.type === 'audio'
                        ? 'repeating-linear-gradient(90deg, #0a1a0a 0px, #0a1a0a 1px, transparent 1px, transparent 30px)'
                        : 'repeating-linear-gradient(90deg, #0d0a1a 0px, #0d0a1a 1px, transparent 1px, transparent 30px)',
                    }}
                  >
                    {/* Clips */}
                    {!track.collapsed && trackClips.map(clip => {
                      const isSelected = tl.selectedClipIds.includes(clip.id);
                      const clipWidth = Math.max(clip.durationFrames * pxPerFrame, 20);

                      return (
                        <div
                          key={clip.id}
                          className={`absolute top-1 bottom-1 rounded overflow-hidden cursor-grab active:cursor-grabbing border transition-all ${
                            isSelected
                              ? 'border-white shadow-lg shadow-white/20 z-20'
                              : 'border-transparent hover:border-white/30 z-10'
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
                              className="absolute inset-0 w-full h-full object-cover opacity-40"
                              draggable={false}
                            />
                          )}

                          {/* Label */}
                          <div className="relative z-10 px-1.5 py-0.5 flex items-center gap-1 h-full">
                            <span className="text-white text-[10px] font-medium truncate leading-tight">
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

            {/* Empty state */}
            {tl.tracks.length === 0 && (
              <div className="flex items-center justify-center h-32 text-neutral-600 text-sm">
                No tracks. Add a video or audio track above.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-4 px-3 py-1.5 bg-neutral-900 border-t border-neutral-800 text-xs text-neutral-500 flex-shrink-0">
        <span>{tl.clips.length} clips</span>
        <span>{tl.tracks.length} tracks</span>
        <span>Duration: {framesToTimecode(tl.totalFrames, tl.fps)}</span>
        <span>Zoom: {Math.round(tl.zoom * 100)}%</span>
        {tl.selectedClipIds.length > 0 && (
          <span className="text-white">{tl.selectedClipIds.length} selected</span>
        )}
        <div className="flex-1" />
        <span className="text-neutral-600">Right-click clips for options · Drag to move · Drag edges to trim</span>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-neutral-800 border border-neutral-600 rounded-lg shadow-xl py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => splitClip(contextMenu.clipId)}
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-neutral-700 flex items-center gap-2"
          >
            <Scissors size={12} /> Split at playhead
          </button>
          <button
            onClick={() => duplicateClip(contextMenu.clipId)}
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-neutral-700 flex items-center gap-2"
          >
            <Copy size={12} /> Duplicate clip
          </button>
          <div className="border-t border-neutral-700 my-1" />
          <button
            onClick={() => {
              const clip = tl.clips.find(c => c.id === contextMenu.clipId);
              if (clip) updateTrack(clip.trackId, {});
              setTl(prev => ({
                ...prev,
                clips: prev.clips.map(c =>
                  c.id === contextMenu.clipId ? { ...c, locked: !c.locked } : c
                ),
              }));
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-neutral-700 flex items-center gap-2"
          >
            <Lock size={12} /> Toggle lock
          </button>
          <div className="border-t border-neutral-700 my-1" />
          <button
            onClick={() => deleteClip(contextMenu.clipId)}
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-red-900 text-red-400 flex items-center gap-2"
          >
            <Trash2 size={12} /> Delete clip
          </button>
        </div>
      )}
    </div>
  );
};

export default TimelineEditor;
