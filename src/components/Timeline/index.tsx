import React, { useRef, useState, useEffect } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useAppStore } from '../../store';
import { Trash2, Maximize, ArrowLeftToLine, ArrowRightToLine, Plus, Magnet, Play, Pause } from 'lucide-react';
import { formatTimeCode, parseTimeCode } from '../../lib/formatters';
import './index.css';

const TimeInput = ({ value, onChange }: { value: number, onChange: (val: number) => void }) => {
  const [localVal, setLocalVal] = useState(formatTimeCode(value));

  useEffect(() => {
    setLocalVal(formatTimeCode(value));
  }, [value]);

  const handleBlur = () => {
    const newSec = parseTimeCode(localVal);
    onChange(newSec);
    setLocalVal(formatTimeCode(newSec));
  };

  return (
    <input
      type="text"
      className="timecode-input"
      value={localVal}
      onChange={e => setLocalVal(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
};

const Timeline: React.FC = () => {
  const {
    videoDuration, currentTime, setCurrentTime,
    segments, addSegment, removeSegment, updateSegment,
    isCropEnabled, setIsCropEnabled, cropRect,
    activeSegmentIndex, setActiveSegmentIndex,
    snapEnabled, setSnapEnabled,
    fps,
    zoomLevel, setZoomLevel,
    isPlaying, setIsPlaying, playUntil, setPlayUntil
  } = useAppStore();

  const timelineRef = useRef<HTMLDivElement>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);

  const activeSegment = activeSegmentIndex !== null && activeSegmentIndex < segments.length
    ? segments[activeSegmentIndex]
    : null;

  const getScrubTime = (e: ReactMouseEvent | globalThis.MouseEvent | PointerEvent) => {
    if (!timelineRef.current || videoDuration <= 0) return 0;
    const innerTrack = timelineRef.current.querySelector('.timeline-track-inner');
    if (!innerTrack) return 0;
    const rect = innerTrack.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    let time = (x / rect.width) * videoDuration;
    
    if (snapEnabled) {
      time = Math.round(time * 4) / 4;
    }
    return Math.min(videoDuration, Math.max(0, time));
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    // If the user clicked the scrollbar or outside the inner track, ignore
    if (e.target !== e.currentTarget && !(e.currentTarget.querySelector('.timeline-track-inner')?.contains(e.target as Node))) {
        return;
    }
    setIsScrubbing(true);
    setCurrentTime(getScrubTime(e));
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isScrubbing) {
      setCurrentTime(getScrubTime(e));
    }
  };

  const handlePointerUp = () => {
    setIsScrubbing(false);
  };

  const setSegmentStart = () => {
    let time = currentTime;
    if (snapEnabled) time = Math.round(time * 4) / 4;
    
    if (activeSegmentIndex === null) {
      addSegment({ start: time, end: videoDuration, name: '', selected: true });
      return;
    }
    updateSegment(activeSegmentIndex, { start: time, end: Math.max(time, activeSegment!.end) });
  };

  const setSegmentEnd = () => {
    let time = currentTime;
    if (snapEnabled) time = Math.round(time * 4) / 4;

    if (activeSegmentIndex === null) {
      addSegment({ start: 0, end: time, name: '', selected: true });
      return;
    }
    updateSegment(activeSegmentIndex, { end: time, start: Math.min(time, activeSegment!.start) });
  };

  const createSegment = () => {
    addSegment({ start: currentTime, end: Math.min(currentTime + 5, videoDuration), name: '', selected: true });
  }

  const handleTimeChange = (field: 'start' | 'end', num: number) => {
    if (activeSegmentIndex === null) return;
    updateSegment(activeSegmentIndex, { [field]: num });
  };

  // --- Segments Dragging Logic ---
  const pointerState = useRef({ isDragging: false, mode: 'move', idx: -1, startX: 0, initialStart: 0, initialEnd: 0 });

  const handleSegPointerDown = (e: React.PointerEvent, idx: number, mode: 'move' | 'resize-start' | 'resize-end' = 'move') => {
    e.stopPropagation();
    setActiveSegmentIndex(idx);
    pointerState.current = {
      isDragging: true,
      mode,
      idx: idx,
      startX: e.clientX,
      initialStart: segments[idx].start,
      initialEnd: segments[idx].end
    };
    window.addEventListener('pointermove', handleSegPointerMove);
    window.addEventListener('pointerup', handleSegPointerUp);
  };

  const handleSegPointerMove = (e: PointerEvent) => {
    if (!pointerState.current.isDragging || !timelineRef.current) return;
    const { mode, idx, startX, initialStart, initialEnd } = pointerState.current;
    // ... calculate deltaSec ...
    const rect = timelineRef.current.getBoundingClientRect();
    const pxPerSec = rect.width / videoDuration;

    let deltaSec = (e.clientX - startX) / pxPerSec;
    const stateEnabled = useAppStore.getState().snapEnabled;

    if (mode === 'move') {
      if (stateEnabled) {
        let snappedStart = Math.round((initialStart + deltaSec) * 4) / 4;
        deltaSec = snappedStart - initialStart;
      }

      let newStart = initialStart + deltaSec;
      let newEnd = initialEnd + deltaSec;

      if (newStart < 0) {
        newEnd -= newStart;
        newStart = 0;
      }
      if (newEnd > videoDuration) {
        newStart -= (newEnd - videoDuration);
        newEnd = videoDuration;
      }

      useAppStore.getState().updateSegment(idx, { start: newStart, end: newEnd });
    } else if (mode === 'resize-start') {
      let newStart = initialStart + deltaSec;
      if (stateEnabled) newStart = Math.round(newStart * 4) / 4;
      newStart = Math.max(0, Math.min(newStart, initialEnd - 0.1));
      useAppStore.getState().updateSegment(idx, { start: newStart });
    } else if (mode === 'resize-end') {
      let newEnd = initialEnd + deltaSec;
      if (stateEnabled) newEnd = Math.round(newEnd * 4) / 4;
      newEnd = Math.max(initialStart + 0.1, Math.min(newEnd, videoDuration));
      useAppStore.getState().updateSegment(idx, { end: newEnd });
      
      // Dynamic Playback Stop Update
      const s = useAppStore.getState();
      if (s.isPlaying && s.playUntil !== null && idx === s.activeSegmentIndex) {
        if (newEnd <= s.currentTime) {
           s.setIsPlaying(false);
           s.setPlayUntil(null);
        } else {
           s.setPlayUntil(newEnd);
        }
      }
    }
  };

  const handleSegPointerUp = () => {
    if (!pointerState.current.isDragging) return;
    const { idx, mode } = pointerState.current;
    pointerState.current.isDragging = false;
    window.removeEventListener('pointermove', handleSegPointerMove);
    window.removeEventListener('pointerup', handleSegPointerUp);

    const segsCopy = [...useAppStore.getState().segments];
    if (!segsCopy[idx]) return;

    // Only logically reorder automatically on 'move' past adjacent nodes
    if (mode === 'move') {
      const moved = segsCopy[idx];
      if (idx > 0 && moved.start < segsCopy[idx - 1].start) {
        useAppStore.getState().reorderSegments(idx, idx - 1);
      } else if (idx < segsCopy.length - 1 && moved.start > segsCopy[idx + 1].start) {
        useAppStore.getState().reorderSegments(idx, idx + 1);
      }
    }
  };


  const gridMarkers = [];
  let currentMinorStep = 0.25;

  if (videoDuration > 0) {
    // Progressive grid step calculation for performance/clarity
    let majorStep = 1; // Default
    if (videoDuration > 3600) majorStep = 300;     // 5 min for 1h+
    else if (videoDuration > 1800) majorStep = 60; // 1 min for 30m+
    else if (videoDuration > 600) majorStep = 30;  // 30s for 10m+
    else if (videoDuration > 300) majorStep = 10;  // 10s for 5m+
    else if (videoDuration > 60) majorStep = 5;    // 5s for 1m+

    const zoomFactor = zoomLevel / 100;
    majorStep = majorStep / Math.max(1, Math.floor(zoomFactor / 2));
    
    currentMinorStep = majorStep / 4;
    const totalSteps = Math.ceil(videoDuration / currentMinorStep);

    for (let i = 0; i <= totalSteps; i++) {
      const isMajor = i % 4 === 0;
      const time = i * currentMinorStep;
      const left = (time / videoDuration) * 100;

      if (left <= 100) {
        gridMarkers.push(
          <div key={i} className={`grid-marker ${isMajor ? 'major' : 'minor'}`} style={{ left: `${left}%` }}>
            {isMajor && <span className="grid-time-label">{Math.floor(time)}s</span>}
          </div>
        );
      }
    }
  }

  return (
    <div className="timeline-wrapper">
      <div className="timeline-toolbar">
        <div className="toolbar-group">
          <button className={`tool-btn ${isCropEnabled ? 'active-tool' : ''}`} onClick={() => setIsCropEnabled(!isCropEnabled)}>
            <Maximize size={16} /> {isCropEnabled ? 'Disable Crop' : 'Crop Area'}
          </button>
          <button className={`tool-btn ${snapEnabled ? 'active-tool' : ''}`} onClick={() => setSnapEnabled(!snapEnabled)} title="Snap to 250ms grids">
            <Magnet size={16} /> Snap
          </button>
        </div>
        <div className="toolbar-group">
          <button className="tool-btn" onClick={setSegmentStart} disabled={videoDuration === 0}>
            <ArrowLeftToLine size={16} /> Set Start
          </button>
          {activeSegment && (
            <div className="segment-inputs">
              <TimeInput value={activeSegment.start} onChange={v => handleTimeChange('start', v)} />
              <hr className="time-sep" />
              <TimeInput value={activeSegment.end} onChange={v => handleTimeChange('end', v)} />
            </div>
          )}
          <button className="tool-btn" onClick={setSegmentEnd} disabled={videoDuration === 0}>
            <ArrowRightToLine size={16} /> Set End
          </button>
          <button className="tool-btn" onClick={createSegment} disabled={videoDuration === 0}>
            <Plus size={16} /> New Fragment
          </button>
        </div>
      </div>

      <div
        className="track-container"
        ref={timelineRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <div className="timeline-track-inner" style={{ width: `${zoomLevel}%`, position: 'relative', height: '100%', minWidth: '100%' }}>
          {gridMarkers}
          <div className="grid-centerline" />

        {videoDuration === 0 && <span className="empty-text">Load a video to view timeline</span>}

        <div className="segments-track">
          {segments.map((seg, i) => {
            const left = videoDuration > 0 ? (seg.start / videoDuration) * 100 : 0;
            const width = videoDuration > 0 ? ((seg.end - seg.start) / videoDuration) * 100 : 0;

            return (
              <div key={i} className={`segment-block ${activeSegmentIndex === i ? 'selected' : ''}`}
                style={{ left: `${left}%`, width: `${width}%` }}
                onPointerDown={(e) => handleSegPointerDown(e, i, 'move')}>
                <div className="resize-handle left" onPointerDown={(e) => handleSegPointerDown(e, i, 'resize-start')} />
                <span className="seg-label"
                  title="Double click to rename"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    const newName = prompt("Rename segment:", seg.name || `Cut #${i + 1}`);
                    if (newName && newName.trim()) {
                      updateSegment(i, { name: newName.trim() });
                    }
                  }}>
                  {seg.name || `Cut #${i + 1}`}
                </span>
                <div className="segment-hover-actions">
                  <button className="hover-action-btn play-btn" onPointerDown={(e) => {
                    e.stopPropagation();
                    if (isPlaying && playUntil === seg.end) {
                      setIsPlaying(false);
                      setPlayUntil(null);
                    } else {
                      setCurrentTime(seg.start);
                      setPlayUntil(seg.end);
                      setIsPlaying(true);
                    }
                  }} title={isPlaying && playUntil === seg.end ? "Pause Segment" : "Play Segment"}>
                    {isPlaying && playUntil === seg.end ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                  <button className="hover-action-btn del-btn" onPointerDown={(e) => { e.stopPropagation(); removeSegment(i); }} title="Delete Segment">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="resize-handle right" onPointerDown={(e) => handleSegPointerDown(e, i, 'resize-end')} />
              </div>
            )
          })}
        </div>

          <div className="playhead-indicator"
            style={{
              left: `${videoDuration > 0 ? (currentTime / videoDuration) * 100 : 0}%`,
              display: videoDuration > 0 ? 'block' : 'none'
            }}>
            <div className="playhead-line" />
            <div className="playhead-head" />
          </div>
        </div>
      </div>

      <div className="timeline-status-bar">
        <div className="status-left">
          <div className="fps-control" title="You can find your video FPS using ffprobe -v error -select_streams v -of default=noprint_wrappers=1:nokey=1 -show_entries stream=r_frame_rate video.mp4">
            <label>FPS:</label>
            <input type="number"
              value={fps}
              onChange={e => useAppStore.getState().setFps(parseInt(e.target.value) || 25)}
              className="fps-input" />
          </div>

          <div className="zoom-controls">
            <label>Zoom:</label>
            <button className="zoom-btn" onClick={() => setZoomLevel(zoomLevel - 10)}>-</button>
            <input 
              type="number" 
              value={zoomLevel} 
              onChange={e => setZoomLevel(parseInt(e.target.value) || 100)} 
              className="zoom-input"
            />
            <button className="zoom-btn" onClick={() => setZoomLevel(zoomLevel + 10)}>+</button>
            <button className="zoom-btn reset" onClick={() => setZoomLevel(100)}>Reset</button>
          </div>

          <div className="interval-display">
            Interval: {videoDuration > 0 ? (currentMinorStep * 1000).toFixed(0) : 0}ms
          </div>

          {isCropEnabled && cropRect && (
            <div className="crop-info">
              Crop: {Math.round(cropRect.x)}:{Math.round(cropRect.y)} @ {Math.round(cropRect.w)}x{Math.round(cropRect.h)}
            </div>
          )}
        </div>
        <div className="time-display">
          {formatTimeCode(currentTime)} / {formatTimeCode(videoDuration)}
          <span className="frame-count" style={{ marginLeft: '1rem' }}>
            ({Math.floor(currentTime * fps)} / {Math.floor(videoDuration * fps)}f)
          </span>
        </div>
      </div>
    </div>
  );
};

export default Timeline;
