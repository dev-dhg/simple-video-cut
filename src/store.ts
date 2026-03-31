import { create } from 'zustand';

export interface Segment {
  start: number;
  end: number;
  name: string;
  selected: boolean;
}

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'warning' | 'error';
}

export interface AppState {
  mediaUri: string | null;
  fileName: string | null;
  videoWidth: number;
  videoHeight: number;
  videoDuration: number;
  currentTime: number;
  segments: Segment[];
  
  // Player state
  isPlaying: boolean;
  isMuted: boolean;
  zoomLevel: number;
  playUntil: number | null;
  
  // FFmpeg config options
  copyMode: boolean; // if true, it uses -c:v copy
  removeAudio: boolean;
  videoCodec: string; 
  customFfmpegPath: string; // for electron
  availableEncoders: { name: string; description: string }[];
  mergeCuts: boolean;
  customFfmpegArgs: string; 
  
  // Toasts
  toasts: Toast[];

  // Region crop definition
  isCropEnabled: boolean;
  cropRect: { x: number, y: number, w: number, h: number } | null;
  intrinsicCropRect: { x: number, y: number, w: number, h: number } | null;

  activeSegmentIndex: number | null;
  
  snapEnabled: boolean;
  fps: number;

  // Actions
  setMediaUri: (uri: string | null, name?: string, keepSegments?: boolean) => void;
  setVideoDimensions: (width: number, height: number) => void;
  setVideoDuration: (sec: number) => void;
  setCurrentTime: (sec: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setIsMuted: (muted: boolean) => void;
  setZoomLevel: (val: number) => void;
  setPlayUntil: (time: number | null) => void;
  setSegments: (segments: Segment[]) => void;
  addSegment: (segment: Segment) => void;
  removeSegment: (index: number) => void;
  updateSegment: (index: number, segment: Partial<Segment>) => void;
  setActiveSegmentIndex: (index: number | null) => void;
  reorderSegments: (fromIndex: number, toIndex: number) => void;
  
  setSnapEnabled: (val: boolean) => void;
  setFps: (val: number) => void;
  
  setCopyMode: (val: boolean) => void;
  setRemoveAudio: (val: boolean) => void;
  setVideoCodec: (val: string) => void;
  setCustomFfmpegPath: (val: string) => void;
  setAvailableEncoders: (encoders: { name: string; description: string }[]) => void;
  setMergeCuts: (val: boolean) => void;
  setCustomFfmpegArgs: (val: string) => void;
  setIsCropEnabled: (val: boolean) => void;
  setCropRect: (rect: AppState['cropRect'], intrinsicRect?: AppState['intrinsicCropRect']) => void;
  
  addToast: (message: string, type?: Toast['type']) => void;
  removeToast: (id: string) => void;
}

const savedFfmpegPath = localStorage.getItem('customFfmpegPath') || '';
const savedFfmpegArgs = localStorage.getItem('customFfmpegArgs') || '';

export const useAppStore = create<AppState>((set) => ({
  mediaUri: null,
  fileName: null,
  videoWidth: 0,
  videoHeight: 0,
  videoDuration: 0,
  currentTime: 0,
  segments: [],
  
  isPlaying: false,
  isMuted: false,
  zoomLevel: 100,
  playUntil: null,
  
  copyMode: true, 
  removeAudio: false,
  videoCodec: 'libx264',
  customFfmpegPath: savedFfmpegPath,
  availableEncoders: [
    { name: 'libx264', description: 'H.264 (Default)' },
    { name: 'libx265', description: 'HEVC (Default)' },
    { name: 'libvpx-vp9', description: 'VP9 (Default)' }
  ],
  mergeCuts: true,
  customFfmpegArgs: savedFfmpegArgs,
  
  toasts: [],

  isCropEnabled: false,
  cropRect: null,
  intrinsicCropRect: null,

  activeSegmentIndex: null,
  snapEnabled: false,
  fps: 25,

  setMediaUri: (uri, name, keepSegments = false) => set((state) => ({ 
    mediaUri: uri, 
    fileName: name || null, 
    segments: keepSegments ? state.segments : [], 
    activeSegmentIndex: keepSegments ? state.activeSegmentIndex : null, 
    zoomLevel: 100, 
    videoWidth: 0, 
    videoHeight: 0 
  })),
  setVideoDimensions: (width, height) => set({ videoWidth: width, videoHeight: height }),
  setVideoDuration: (duration) => set({ videoDuration: duration }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setIsPlaying: (playing) => set((state) => ({ isPlaying: playing, playUntil: playing ? state.playUntil : null })),
  setIsMuted: (muted) => set({ isMuted: muted }),
  setZoomLevel: (val) => set({ zoomLevel: Math.max(10, Math.min(2000, val)) }),
  setPlayUntil: (time) => set({ playUntil: time }),
  setSegments: (segments) => set({ segments, activeSegmentIndex: segments.length > 0 ? 0 : null }),
  addSegment: (segment) => set((state) => ({ 
      segments: [...state.segments, { ...segment, name: segment.name || `Cut #${state.segments.length + 1}` }],
      activeSegmentIndex: state.segments.length 
  })),
  removeSegment: (index) => set((state) => {
      const remaining = state.segments.filter((_, i) => i !== index);
      let newActive = state.activeSegmentIndex;
      if (newActive === index) newActive = remaining.length > 0 ? 0 : null;
      else if (newActive !== null && newActive > index) newActive -= 1;
      return { segments: remaining, activeSegmentIndex: newActive };
  }),
  updateSegment: (index, segment) => set((state) => {
    const newSegments = [...state.segments];
    newSegments[index] = { ...newSegments[index], ...segment };
    return { segments: newSegments };
  }),
  reorderSegments: (fromIndex, toIndex) => set((state) => {
    const newSegments = [...state.segments];
    const [moved] = newSegments.splice(fromIndex, 1);
    newSegments.splice(toIndex, 0, moved);
    let newActive = state.activeSegmentIndex;
    if (newActive === fromIndex) newActive = toIndex;
    else if (newActive !== null) {
      if (fromIndex < newActive && toIndex >= newActive) newActive -= 1;
      else if (fromIndex > newActive && toIndex <= newActive) newActive += 1;
    }
    return { segments: newSegments, activeSegmentIndex: newActive };
  }),
  setActiveSegmentIndex: (index) => set({ activeSegmentIndex: index }),
  
  setSnapEnabled: (val) => set({ snapEnabled: val }),
  setFps: (val) => set({ fps: val }),
  setCopyMode: (val) => set({ copyMode: val }),
  setRemoveAudio: (val) => set({ removeAudio: val }),
  setVideoCodec: (val) => set({ videoCodec: val }),
  setCustomFfmpegPath: (val) => {
     localStorage.setItem('customFfmpegPath', val);
     set({ customFfmpegPath: val });
  },
  setAvailableEncoders: (encoders) => set(() => {
    // Merge with defaults to ensure we always have something
    const defaults = [
      { name: 'libx264', description: 'H.264 (Default)' },
      { name: 'libx265', description: 'HEVC (Default)' },
      { name: 'libvpx-vp9', description: 'VP9 (Default)' }
    ];
    // Filter out defaults that are already in the system encoders to avoid duplicates
    const filteredEncoders = encoders.filter(e => !defaults.some(d => d.name === e.name));
    return { availableEncoders: [...defaults, ...filteredEncoders] };
  }),
  setMergeCuts: (val) => set({ mergeCuts: val }),
  setCustomFfmpegArgs: (val) => {
     localStorage.setItem('customFfmpegArgs', val);
     set({ customFfmpegArgs: val });
  },
  setIsCropEnabled: (val) => set((state) => ({ 
    isCropEnabled: val, 
    cropRect: null, 
    intrinsicCropRect: null,
    copyMode: val ? false : state.copyMode
  })),
  setCropRect: (rect, intrinsicRect) => set((state) => ({ 
    cropRect: rect, 
    intrinsicCropRect: intrinsicRect || null,
    copyMode: rect ? false : state.copyMode
  })),

  addToast: (message, type = 'success') => set((state) => ({
    toasts: [...state.toasts, { id: Math.random().toString(36).substr(2, 9), message, type }]
  })),
  removeToast: (id) => set((state) => ({
    toasts: state.toasts.filter(t => t.id !== id)
  })),
}));
