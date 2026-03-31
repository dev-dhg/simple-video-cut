import React, { useRef, useState, useEffect } from 'react';
import type { MouseEvent } from 'react';
import { useAppStore } from '../../store';
import { Upload, FileVideo, FilePlus } from 'lucide-react';
import { parseProject } from '../../lib/projectParser';
import './index.css';

const VideoPlayer: React.FC = () => {
  const { 
    mediaUri, setMediaUri, fileName,
    setVideoDimensions,
    setVideoDuration, setFps,
    setSegments,
    cropRect, setCropRect, isCropEnabled,
    setCurrentTime, currentTime,
    isPlaying, setIsPlaying,
    isMuted,
    playUntil, setPlayUntil
  } = useAppStore();

  const isElectron = typeof window !== 'undefined' && (window as any).electronAPI !== undefined;

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const calculateIntrinsicCrop = (uiRect: {x: number, y: number, w: number, h: number}) => {
    if (!videoRef.current || !containerRef.current) return null;
    const video = videoRef.current;
    const container = containerRef.current;
    
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;

    const cw = container.clientWidth;
    const ch = container.clientHeight;

    const vRatio = vw / vh;
    const cRatio = cw / ch;

    let rw, rh, ox, oy;
    if (cRatio > vRatio) {
       rh = ch;
       rw = ch * vRatio;
       ox = (cw - rw) / 2;
       oy = 0;
    } else {
       rw = cw;
       rh = cw / vRatio;
       ox = 0;
       oy = (ch - rh) / 2;
    }

    const mappedX = (uiRect.x - ox) * (vw / rw);
    const mappedY = (uiRect.y - oy) * (vh / rh);
    const mappedW = (uiRect.w) * (vw / rw);
    const mappedH = (uiRect.h) * (vh / rh);

    // clamp to intrinsic bounds
    let finalX = Math.max(0, mappedX);
    let finalY = Math.max(0, mappedY);
    let finalW = Math.max(0, Math.min(mappedW, vw - finalX));
    let finalH = Math.max(0, Math.min(mappedH, vh - finalY));

    return { 
       x: Math.round(finalX), 
       y: Math.round(finalY), 
       w: Math.round(finalW), 
       h: Math.round(finalH) 
    };
  };

  const [interactionMode, setInteractionMode] = useState<'idle' | 'draw' | 'move' | 'resize-br' | 'resize-r' | 'resize-b'>('idle');
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [moveOffset, setMoveOffset] = useState({ x: 0, y: 0 });
  const [initialRect, setInitialRect] = useState(cropRect);
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleTimeUpdate = () => {
    if (videoRef.current && interactionMode === 'idle') {
      const current = videoRef.current.currentTime;
      setCurrentTime(current);
      
      // We don't check playUntil here because we want it to be perfectly reactive in an effect
    }
  };

  // Dedicated effect for stopping playback at segment end
  useEffect(() => {
    if (!isPlaying || playUntil === null || !videoRef.current) return;

    const checkTime = () => {
       if (videoRef.current && videoRef.current.currentTime >= playUntil) {
          setIsPlaying(false);
          setPlayUntil(null);
       }
    };

    const interval = setInterval(checkTime, 10); // High frequency check for accuracy
    return () => clearInterval(interval);
  }, [isPlaying, playUntil, setIsPlaying, setPlayUntil]);

  useEffect(() => {
    if (videoRef.current && Math.abs(videoRef.current.currentTime - currentTime) > 0.3) {
      videoRef.current.currentTime = currentTime;
    }
  }, [currentTime]);

  useEffect(() => {
    if (videoRef.current) {
       if (isPlaying) {
         videoRef.current.play().catch(() => setIsPlaying(false));
       } else {
         videoRef.current.pause();
       }
    }
  }, [isPlaying]);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setVideoDuration(videoRef.current.duration);
      setVideoDimensions(videoRef.current.videoWidth, videoRef.current.videoHeight);
    }
  };

  const getContainerOffset = (e: MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const isInsideCrop = (pos: { x: number, y: number }) => {
    if (!cropRect) return false;
    return pos.x >= cropRect.x && pos.x <= cropRect.x + cropRect.w &&
           pos.y >= cropRect.y && pos.y <= cropRect.y + cropRect.h;
  };

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !mediaUri || !isCropEnabled) return;
    
    const pos = getContainerOffset(e);
    if (cropRect && (cropRect.w > 5 || cropRect.h > 0)) {
       const isBR = Math.abs(pos.x - (cropRect.x + cropRect.w)) < 15 && Math.abs(pos.y - (cropRect.y + cropRect.h)) < 15;
       const isR = Math.abs(pos.x - (cropRect.x + cropRect.w)) < 15;
       const isB = Math.abs(pos.y - (cropRect.y + cropRect.h)) < 15;

       if (isBR) { setInteractionMode('resize-br'); setInitialRect(cropRect); setStartPos(pos); return; }
       if (isR) { setInteractionMode('resize-r'); setInitialRect(cropRect); setStartPos(pos); return; }
       if (isB) { setInteractionMode('resize-b'); setInitialRect(cropRect); setStartPos(pos); return; }

       if (isInsideCrop(pos)) {
          setInteractionMode('move');
          setMoveOffset({ x: pos.x - cropRect.x, y: pos.y - cropRect.y });
          return;
       }
    }
    
    setInteractionMode('draw');
    setStartPos(pos);
    setCropRect({ x: pos.x, y: pos.y, w: 0, h: 0 });
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (interactionMode === 'idle' || !mediaUri) return;
    const pos = getContainerOffset(e);

    if (interactionMode === 'draw') {
      const nr = {
        x: Math.min(startPos.x, pos.x),
        y: Math.min(startPos.y, pos.y),
        w: Math.abs(pos.x - startPos.x),
        h: Math.abs(pos.y - startPos.y)
      };
      updateOverlayStyle(nr);
    } else if (interactionMode === 'move' && cropRect && overlayRef.current) {
        const nr = { ...cropRect, x: pos.x - moveOffset.x, y: pos.y - moveOffset.y };
        updateOverlayStyle(nr);
    } else if (interactionMode.startsWith('resize') && initialRect && overlayRef.current) {
        const nr = { ...initialRect };
        if (interactionMode.includes('r')) nr.w = Math.max(10, initialRect.w + (pos.x - startPos.x));
        if (interactionMode.includes('b')) nr.h = Math.max(10, initialRect.h + (pos.y - startPos.y));
        updateOverlayStyle(nr);
    }
  };

  const updateOverlayStyle = (nr: {x: number, y: number, w: number, h: number}) => {
    if (!overlayRef.current) return;
    const s = overlayRef.current.style;
    s.left = `${nr.x}px`;
    s.top = `${nr.y}px`;
    s.width = `${nr.w}px`;
    s.height = `${nr.h}px`;
    s.display = 'block';
  };

  const handleMouseUp = () => {
    if (interactionMode !== 'idle' && overlayRef.current) {
      const style = overlayRef.current.style;
      const newRect = {
        x: parseFloat(style.left),
        y: parseFloat(style.top),
        w: parseFloat(style.width),
        h: parseFloat(style.height)
      };
      const intrinsic = calculateIntrinsicCrop(newRect);
      setCropRect(newRect, intrinsic);
    }
    setInteractionMode('idle');
  };

  const clearCrop = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setCropRect(null);
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;

    if (file.type.startsWith('video/')) {
       // In Electron, we use webUtils to get the real path for native FFmpeg
       const path = isElectron ? window.electronAPI.getPathForFile(file) : URL.createObjectURL(file);
       setMediaUri(path, file.name);
    } else if (file.name.endsWith('.json') || file.name.endsWith('.llc')) {
       const reader = new FileReader();
       reader.onload = (ev) => {
         try {
           const data = parseProject(ev.target?.result as string);
           setSegments(data.segments);
           if (data.videoDuration) setVideoDuration(data.videoDuration);
           if (data.fps) setFps(data.fps);
         } catch(e) { alert("Invalid project file"); }
       };
       reader.readAsText(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
     e.preventDefault();
     e.dataTransfer.dropEffect = 'copy';
  };

  return (
    <div className="video-player-container">
      <div className={`video-player-wrapper ${isCropEnabled ? 'crop-mode' : ''} ${!mediaUri ? 'empty' : ''}`}
           ref={containerRef}
           onMouseDown={handleMouseDown} 
           onMouseMove={handleMouseMove} 
           onMouseUp={handleMouseUp} 
           onMouseLeave={handleMouseUp}
           onDragOver={handleDragOver}
           onDrop={handleFileDrop}
      >
        {mediaUri ? (
          <video 
            ref={videoRef}
            src={mediaUri} 
            className="styled-video"
            muted={isMuted}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onClick={() => { if(!isCropEnabled) setIsPlaying(!isPlaying); }}
          />
        ) : (
          <div className="placeholder drag-drop-zone" onClick={() => document.querySelector<HTMLInputElement>('.video-file-input')?.click()}>
            <div className="drop-icon-stack">
              <FileVideo size={48} className="icon-main"/>
              <div className="badge-plus"><FilePlus size={20}/></div>
            </div>
            <p>Drop Video or Project Here</p>
            <span className="subtitle">or click to browse...</span>
            {fileName && !mediaUri && (
               <div className="missing-video-alert glass-panel">
                 <Upload size={16}/> <strong>Project Loaded:</strong> Please load the matching video <em>{fileName}</em> to enable the timeline.
               </div>
            )}
          </div>
        )}

        {isCropEnabled && (
          <div 
            className="crop-overlay" 
            ref={overlayRef}
            style={cropRect ? {
              left: cropRect.x,
              top: cropRect.y,
              width: cropRect.w,
              height: cropRect.h,
              display: (cropRect.w > 5 || cropRect.h > 5) ? 'block' : 'none'
            } : { display: 'none' }}
          >
            <button className="crop-clear-btn" onMouseDown={(e) => clearCrop(e as unknown as React.MouseEvent<HTMLButtonElement>)}>×</button>
            <div className="crop-resize-handle br" />
            <div className="crop-resize-handle r" />
            <div className="crop-resize-handle b" />
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoPlayer;
