import JSON5 from 'json5';
import type { Segment } from '../store';

export const saveProject = (
  fileName: string, 
  segments: Segment[], 
  videoDuration: number, 
  fps: number,
  isCropEnabled?: boolean,
  cropRect?: any,
  intrinsicCropRect?: any,
  videoWidth?: number,
  videoHeight?: number,
  mediaUri?: string
) => {
  const payload = {
    simpecutProject: true,
    version: 1,
    mediaFileName: fileName,
    mediaUri,
    videoDuration,
    fps,
    isCropEnabled,
    cropRect,
    intrinsicCropRect,
    videoWidth,
    videoHeight,
    cutSegments: segments.map(seg => ({
      start: seg.start,
      end: seg.end,
      name: seg.name || '',
      selected: seg.selected
    }))
  };

  // Convert to standard JSON for our own saves
  const str = JSON.stringify(payload, null, 2);
  const blob = new Blob([str], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName}.simpecut.json`; // Slightly more distinctive extension
  a.click();
  URL.revokeObjectURL(url);
};

export const parseProject = (content: string): { 
  fileName: string, 
  segments: Segment[], 
  videoDuration?: number, 
  fps?: number,
  isCropEnabled?: boolean,
  cropRect?: any,
  intrinsicCropRect?: any,
  videoWidth?: number,
  videoHeight?: number,
  mediaUri?: string
} => {
  // Use json5 to handle losslesscut's unquoted literal formatting
  const data = JSON5.parse(content);
  
  if (!data.simpecutProject && data.version !== 2) {
      throw new Error("Unsupported project file format");
  }

  return {
      fileName: data.mediaFileName || 'unknown.mp4',
      mediaUri: data.mediaUri || null,
      videoDuration: data.videoDuration,
      fps: data.fps,
      isCropEnabled: !!data.isCropEnabled,
      cropRect: data.cropRect || null,
      intrinsicCropRect: data.intrinsicCropRect || null,
      videoWidth: data.videoWidth || 0,
      videoHeight: data.videoHeight || 0,
      segments: (data.cutSegments || []).map((seg: any) => ({
          start: Number(seg.start),
          end: Number(seg.end),
          name: seg.name || '',
          selected: seg.selected !== undefined ? !!seg.selected : true
      }))
  };
};
