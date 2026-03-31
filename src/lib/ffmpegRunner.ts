import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { useAppStore } from '../store';
import type { AppState } from '../store';

declare global {
  interface Window {
    electronAPI: {
      invoke: (channel: string, data?: any) => Promise<any>;
      on: (channel: string, func: (...args: any[]) => void) => void;
      off: (channel: string, func: (...args: any[]) => void) => void;
      getPathForFile: (file: File) => string;
    }
  }
}

const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;

let ffmpeg: FFmpeg | null = null;

export const ensureFFmpegLoaded = async (onLog?: (msg: string) => void) => {
  if (ffmpeg) return ffmpeg;
  ffmpeg = new FFmpeg();
  
  if (onLog) {
    ffmpeg.on('log', ({ message }) => onLog(message));
  }
  
  await ffmpeg.load({
    // We rely on standard unpkg fetch mechanism for vite dev
  });
  return ffmpeg;
};

const runNativeFFmpegExport = async (
  state: AppState,
  onProgress: (ratio: number) => void,
  onLog: (msg: string) => void
): Promise<Blob> => {
  onLog("Initializing native FFmpeg export...");
  
  const inputPath = state.mediaUri!; 
  const tempPath = await window.electronAPI.invoke('get-temp-path');
  const outputNames: string[] = [];
  
  const logHandler = (_event: any, msg: string) => onLog(msg);
  window.electronAPI.on('ffmpeg-log', logHandler);

  try {
    let currentSegmentIdx = 0;
    const progressHandler = (_event: any, timeStr: string) => {
      const parts = timeStr.split(':');
      if (parts.length < 3) return;
      const seconds = (+parts[0]) * 3600 + (+parts[1]) * 60 + (+parts[2]);
      const seg = state.segments[currentSegmentIdx];
      if (seg) {
        const duration = seg.end - seg.start;
        const segmentRatio = (seconds) / duration;
        const overall = (currentSegmentIdx + Math.min(1, Math.max(0, segmentRatio))) / state.segments.length;
        onProgress(overall);
      }
    };
    window.electronAPI.on('ffmpeg-progress-raw', progressHandler);

    for (let i = 0; i < state.segments.length; i++) {
        currentSegmentIdx = i;
        const seg = state.segments[i];
        const outPath = `${tempPath}/cut_${Date.now()}_${i}.mp4`;
        outputNames.push(outPath);

        // Reverting seek logic to -to (end timestamp) per user preference
        let args = [
          '-ss', String(seg.start), 
          '-i', inputPath, 
          '-to', String(seg.end - seg.start)
        ];
        
        if (state.removeAudio) args.push('-an');

        if (state.copyMode) {
          args.push('-c:v', 'copy');
          if (!state.removeAudio) args.push('-c:a', 'copy');
        } else {
          // Native preset removed, relying on custom args or FFmpeg defaults
          args.push('-c:v', state.videoCodec || 'libx264');
          if (state.customFfmpegArgs) {
             const custom = state.customFfmpegArgs.split(' ').filter(f => f.trim() !== '');
             args.push(...custom);
          }
          if (state.cropRect && state.cropRect.w > 5 && state.cropRect.h > 5) {
            const targetRect = state.intrinsicCropRect || state.cropRect;
            args.push('-vf', `crop=${Math.round(targetRect.w)}:${Math.round(targetRect.h)}:${Math.round(targetRect.x)}:${Math.round(targetRect.y)}`);
          }
        }
        args.push(outPath);

        onLog(`Processing segment ${i+1}/${state.segments.length}...`);
        await window.electronAPI.invoke('run-ffmpeg', { ffmpegPath: state.customFfmpegPath, args });
    }

    let finalOutputPath = outputNames[0];
    if (state.mergeCuts && outputNames.length > 1) {
      onLog("Merging segments...");
      const listPath = `${tempPath}/list_${Date.now()}.txt`;
      const listContent = outputNames.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
      await window.electronAPI.invoke('fs-write-file', { filePath: listPath, data: listContent });
      
      const mergedPath = `${tempPath}/merged_${Date.now()}.mp4`;
      await window.electronAPI.invoke('run-ffmpeg', { 
        ffmpegPath: state.customFfmpegPath, 
        args: ['-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', mergedPath] 
      });
      finalOutputPath = mergedPath;
    }

    onLog("Reading final output...");
    const data = await window.electronAPI.invoke('fs-read-file', finalOutputPath);
    
    // Cleanup temp files
    outputNames.forEach(p => window.electronAPI.invoke('fs-unlink', p));
    if (state.mergeCuts && outputNames.length > 1) {
        // cleanup list and merged
    }

    return new Blob([data], { type: 'video/mp4' });

  } finally {
    window.electronAPI.off('ffmpeg-log', logHandler);
  }
};

function sanitizeWasmCodec(codec: string): string {
  const hardwareEncoders = ['nvenc', 'amf', 'vaapi', 'qsv', 'mfx', 'omx', 'cuda', 'vulkan', 'dxva'];
  if (hardwareEncoders.some(enc => codec.toLowerCase().includes(enc))) {
    console.warn(`Hardware encoder '${codec}' not available in WASM. Falling back to libx264.`);
    return 'libx264';
  }
  return codec || 'libx264';
}

export const runFFmpegExport = async (
  state: AppState,
  onProgress: (ratio: number) => void,
  onLog: (msg: string) => void
): Promise<Blob> => {
  if (isElectron) {
    try {
      return await runNativeFFmpegExport(state, onProgress, onLog);
    } catch (err) {
      console.error("Native FFmpeg failed, falling back to WASM:", err);
      useAppStore.getState().addToast("Native FFmpeg failed. Falling back to browser-based WASM export...", "warning");
      onLog("WARNING: Native FFmpeg failed. Falling back to browser-based WASM export...");
    }
  }

  return await runWasmFFmpegExport(state, onProgress, onLog);
};

export async function runWasmFFmpegExport(
  state: AppState,
  onProgress: (ratio: number) => void,
  onLog: (msg: string) => void
): Promise<Blob> {
  if (state.segments.length === 0) {
    throw new Error("No segments to export.");
  }

  if (!state.mediaUri) {
    throw new Error("No media file loaded.");
  }

  const ff = await ensureFFmpegLoaded(onLog);
  const inputName = 'input.mp4';
  
  let currentSegmentIdx = 0;
  const progressHandler = ({ progress, time }: { progress: number, time: number }) => {
    let segmentRatio = progress;
    if (typeof progress !== 'number' || isNaN(progress)) {
      if (typeof time === 'number' && state.segments[currentSegmentIdx]) {
        const seg = state.segments[currentSegmentIdx];
        const duration = seg.end - seg.start;
        segmentRatio = (time / 1000000) / duration;
      } else {
        segmentRatio = 0;
      }
    }
    
    const overall = (currentSegmentIdx + Math.min(1, Math.max(0, segmentRatio))) / state.segments.length;
    onProgress(overall);
  };
  ff.on('progress', progressHandler);

  try {
    onLog("Loading file into memory...");
    await ff.writeFile(inputName, await fetchFile(state.mediaUri));

    const argsList: string[][] = [];
    const outputNames: string[] = [];

    for (let i = 0; i < state.segments.length; i++) {
        const seg = state.segments[i];
        const outName = `cut_${i}.mp4`;
        outputNames.push(outName);

        // Reverting seek logic to -to (end timestamp) per user preference
        let args = [
          '-ss', String(seg.start), 
          '-i', inputName, 
          '-to', String(seg.end - seg.start) 
        ];
        
        if (state.removeAudio) {
          args.push('-an');
        }

        if (state.copyMode) {
          if (state.cropRect && state.cropRect.w > 5 && state.cropRect.h > 5) {
            throw new Error("Cannot use Crop region together with Direct Stream Copy. Please uncheck Direct Stream Copy.");
          }
          args.push('-c:v', 'copy');
          if (!state.removeAudio) args.push('-c:a', 'copy');
        } else {
          const wasmCodec = sanitizeWasmCodec(state.videoCodec);
          // Keeping -preset ultrafast for browser (WASM) runner as requested
          args.push('-c:v', wasmCodec, '-preset', 'ultrafast');
          
          if (state.cropRect && state.cropRect.w > 5 && state.cropRect.h > 5) {
            const targetRect = state.intrinsicCropRect || state.cropRect;
            const w = Math.round(targetRect.w);
            const h = Math.round(targetRect.h);
            const x = Math.round(targetRect.x);
            const y = Math.round(targetRect.y);
            args.push('-vf', `crop=${w}:${h}:${x}:${y}`);
          }
        }

        args.push(outName);
        argsList.push(args);
    }

    for (let i = 0; i < argsList.length; i++) {
        currentSegmentIdx = i;
        onLog(`Processing segment ${i+1}/${argsList.length}...`);
        const status = await ff.exec(argsList[i]);
        if (status !== 0) {
           throw new Error(`FFmpeg segment process failed with code ${status}. Check console for details.`);
        }
    }

    let finalOutput = outputNames[0];

    if (state.mergeCuts && outputNames.length > 1) {
        onLog("Merging segments...");
        let listContent = '';
        for (const name of outputNames) {
          listContent += `file '${name}'\n`;
        }
        await ff.writeFile('list.txt', listContent);
        const status = await ff.exec(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'final.mp4']);
        if (status !== 0) {
           throw new Error(`FFmpeg merge process failed with code ${status}.`);
        }
        finalOutput = 'final.mp4';
    }

    onLog("Finalizing output...");
    try {
        const data = await ff.readFile(finalOutput);
        return new Blob([data as any], { type: 'video/mp4' });
    } catch (e) {
        throw new Error(`Failed to read output file ${finalOutput}. The export may have failed silently.`);
    }
  } finally {
    try {
        ff.off('progress', progressHandler);
    } catch (e) {}

    // Cleanup FS
    try {
        await ff.deleteFile(inputName);
        // Clean up any potential files
        const list = await (ff as any).listDir('/'); 
        for (const f of (list || [])) {
            if (f.name.startsWith('cut_') || f.name === 'list.txt' || f.name === 'final.mp4') {
                await ff.deleteFile(f.name);
            }
        }
    } catch (e) {}
  }
}
