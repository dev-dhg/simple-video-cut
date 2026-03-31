import React, { useRef, useState } from 'react';
import { useAppStore } from '../../store';
import { Settings, Video, Download, Save, Upload, Trash2, Play, Pause } from 'lucide-react';
import { saveProject, parseProject } from '../../lib/projectParser';
import { runFFmpegExport } from '../../lib/ffmpegRunner';
import { formatTimeCode } from '../../lib/formatters';
import './index.css';

const Sidebar: React.FC = () => {
  const state = useAppStore();
  const { 
    mediaUri, setMediaUri, fileName,
    videoDuration, setVideoDuration, fps, setFps,
    copyMode, setCopyMode,
    removeAudio, setRemoveAudio,
    videoCodec, setVideoCodec,
    customFfmpegPath, setCustomFfmpegPath,
    customFfmpegArgs, setCustomFfmpegArgs,
    mergeCuts, setMergeCuts,
    segments, setSegments,
    activeSegmentIndex, setActiveSegmentIndex,
    reorderSegments, removeSegment, updateSegment,
    setCurrentTime, setIsPlaying, setPlayUntil,
    isCropEnabled, setIsCropEnabled, cropRect, setCropRect, intrinsicCropRect,
    videoWidth, videoHeight, setVideoDimensions,
    isPlaying, playUntil,
    availableEncoders, setAvailableEncoders,
    addToast
  } = state;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const isElectron = navigator.userAgent.toLowerCase().indexOf(' electron/') > -1;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
       const url = URL.createObjectURL(file);
       // In Electron, we use webUtils to get the real path for native FFmpeg
       const path = isElectron ? window.electronAPI.getPathForFile(file) : url;
       setMediaUri(path, file.name, segments.length > 0);
    }
  };

  const handleNativeOpen = async () => {
    if (!isElectron) return;
    const result = await window.electronAPI.invoke('show-open-dialog', {
      properties: ['openFile'],
      filters: [{ name: 'Videos', extensions: ['mp4', 'mkv', 'avi', 'mov'] }]
    });
    
    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      const fileName = filePath.split(/[\\/]/).pop();
      setMediaUri(filePath, fileName, segments.length > 0);
    }
  };

  const handleProjectLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
          const data = parseProject(ev.target?.result as string);
          setSegments(data.segments);
          if (data.videoDuration) setVideoDuration(data.videoDuration);
          if (data.fps) setFps(data.fps);
          if (data.isCropEnabled !== undefined) setIsCropEnabled(data.isCropEnabled);
          if (data.cropRect !== undefined) setCropRect(data.cropRect, data.intrinsicCropRect);
          if (data.videoWidth && data.videoHeight) setVideoDimensions(data.videoWidth, data.videoHeight);
          
          if (data.mediaUri && isElectron) {
            setMediaUri(data.mediaUri, data.fileName, true);
          }
          
          addToast("Project loaded successfully", "success");
      } catch(err) {
          console.error(err);
          addToast("Invalid project format", "error");
      }
    };
    reader.readAsText(file);
  };

  const handleExport = async () => {
    setIsExporting(true);
    setProgress(0);
    try {
      const blob = await runFFmpegExport(state, (p) => setProgress(p), console.log);
      
      if (isElectron) {
        const result = await window.electronAPI.invoke('show-save-dialog', {
          defaultPath: `exported_${fileName || 'video.mp4'}`,
          filters: [{ name: 'Video', extensions: ['mp4'] }]
        });
        if (!result.canceled && result.filePath) {
          const arrayBuffer = await blob.arrayBuffer();
          await window.electronAPI.invoke('fs-write-file', { 
            filePath: result.filePath, 
            data: arrayBuffer 
          });
          setProgress(1);
          addToast("Export finished successfully!", "success");
        }
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `exported_${fileName || 'video.mp4'}`;
        a.click();
      }
    } catch(err: any) {
      console.error(err);
      addToast(err.message || 'Export failed', "error");
    } finally {
      setIsExporting(false);
    }
  };

  const handleDragStart = (e: React.DragEvent, i: number) => {
    setDraggedIdx(i);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    setDragOverIdx(i);
  };
  const handleDragLeave = () => {
    setDragOverIdx(null);
  };
  const handleDrop = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    setDragOverIdx(null);
    if (draggedIdx !== null && draggedIdx !== i) {
       reorderSegments(draggedIdx, i);
    }
    setDraggedIdx(null);
  };

  const handleRename = (i: number, currentName: string) => {
     const newName = prompt("Rename segment:", currentName);
     if (newName && newName.trim()) {
        updateSegment(i, { name: newName.trim() });
     }
  };

  React.useEffect(() => {
    if (isElectron) {
      window.electronAPI.invoke('get-ffmpeg-encoders', customFfmpegPath)
        .then(setAvailableEncoders)
        .catch(console.error);
    }
  }, [isElectron, customFfmpegPath, setAvailableEncoders]);

  return (
    <div className="sidebar-wrapper">
      <div className="sidebar-header">
        <Video size={24} className="icon-accent" />
        <h2>Simple Cut</h2>
      </div>

      <div className="sidebar-scrollable">
        <div className="section glass-panel">
          <h3>Media Details</h3>
          <input type="file" accept="video/*" className="hidden-input video-file-input" ref={fileInputRef} onChange={handleFileChange} />
          <input type="file" accept=".llc,.json" className="hidden-input llc-file-input" ref={projectInputRef} onChange={handleProjectLoad} />
          
          <div className="flex-row" style={{ gap: '0.5rem' }}>
             <button className="primary-btn fluid load-video-btn" onClick={() => isElectron ? handleNativeOpen() : fileInputRef.current?.click()}>
                Open Media...
             </button>
          </div>
          <div className="flex-row" style={{ gap: '0.5rem', marginTop: '0.5rem' }}>
             <button className="tool-btn load-llc-btn" onClick={() => projectInputRef.current?.click()}>
               <Upload size={14}/> Load Project
             </button>
             <button className="tool-btn save-llc-btn" onClick={() => saveProject(fileName || 'project', segments, videoDuration, fps, isCropEnabled, cropRect, intrinsicCropRect, videoWidth, videoHeight, mediaUri || undefined)} disabled={!mediaUri}>
               <Save size={14}/> Save Project
             </button>
          </div>
          
          {fileName && (
            <div className="file-info-badge">
               Loaded: <strong>{fileName}</strong>
            </div>
          )}
        </div>

        <div className="section settings-panel glass-panel">
          <h3 className="flex-row"><Settings size={16} /> Export Settings</h3>
          
          <label className="checkbox-label" title="Fast stream copy. Disables region cropping!">
            <input type="checkbox" checked={copyMode} onChange={(e) => setCopyMode(e.target.checked)} />
            Direct Stream Copy (-c:v copy)
          </label>
          <label className="checkbox-label">
            <input type="checkbox" checked={removeAudio} onChange={(e) => setRemoveAudio(e.target.checked)} />
            Remove Audio Track
          </label>
          <label className="checkbox-label">
            <input type="checkbox" checked={mergeCuts} onChange={(e) => setMergeCuts(e.target.checked)} />
            Merge Cuts (Single Output)
          </label>
          
          {!copyMode && (
            <div className="input-group">
              <label>Video Codec:</label>
              <select value={videoCodec} onChange={(e) => setVideoCodec(e.target.value)} className="styled-input">
                {availableEncoders.map(enc => (
                  <option key={enc.name} value={enc.name}>{enc.name} ({enc.description})</option>
                ))}
              </select>
            </div>
          )}

          {isElectron && (
            <>
              <div className="input-group">
                <label>Custom FFmpeg path (blank = system):</label>
                <input type="text" placeholder="C:\ffmpeg\bin\ffmpeg.exe" value={customFfmpegPath} onChange={(e) => setCustomFfmpegPath(e.target.value)} className="styled-input custom-ffmpeg-input"/>
              </div>
              <div className="input-group">
                <label>Custom Export Args:</label>
                <input type="text" placeholder="-preset ultrafast -crf 20" value={customFfmpegArgs} onChange={(e) => setCustomFfmpegArgs(e.target.value)} className="styled-input custom-ffmpeg-input"/>
              </div>
            </>
          )}
        </div>

        <div className="section glass-panel segments-panel">
          <h3>Cut Segments ({segments.length})</h3>
          <div className="segments-list">
            {segments.map((seg, i) => (
               <div key={i} 
                    draggable
                    onDragStart={e => handleDragStart(e, i)}
                    onDragOver={e => handleDragOver(e, i)}
                    onDragLeave={handleDragLeave}
                    onDrop={e => handleDrop(e, i)}
                    className={`segment-card ${activeSegmentIndex === i ? 'active-card' : ''} ${draggedIdx === i ? 'dragging' : ''} ${dragOverIdx === i ? 'drag-over' : ''}`}
                    onClick={() => setActiveSegmentIndex(i)}>
                 <div className="seg-top-row">
                   <span className="seg-index" onDoubleClick={() => handleRename(i, seg.name)} title="Double-click to rename">
                     {seg.name || `Cut #${i+1}`}
                   </span>
                   <div className="seg-times">
                      {formatTimeCode(Math.max(0, seg.start))} <span className="time-sep-text">—</span> {formatTimeCode(Math.max(0, seg.end))}
                   </div>
                 </div>
                 <div className="segment-actions">
                   <button className="secondary-btn-sidebar" onClick={(e) => { 
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
                     {isPlaying && playUntil === seg.end ? <><Pause size={12}/> Pause</> : <><Play size={12}/> Play</>}
                   </button>
                   <button className="del-btn-sidebar" onClick={(e) => { e.stopPropagation(); removeSegment(i); }} title="Delete Segment">
                     <Trash2 size={12}/> Delete
                   </button>
                 </div>
               </div>
            ))}
            {segments.length === 0 && <p className="muted-text">No segments cut yet.</p>}
          </div>
        </div>
      </div>

      <div className="section export-section">
         <button className="export-btn fluid glow" onClick={handleExport} disabled={segments.length === 0 || !mediaUri || isExporting}>
           {isExporting ? `Exporting (${(progress * 100).toFixed(0)}%)...` : <><Download size={18} /> Execute Export</>}
         </button>
      </div>
    </div>
  );
};

export default Sidebar;
