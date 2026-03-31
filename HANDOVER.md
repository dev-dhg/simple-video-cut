# Handover Notes for AI Agents

## Current State
- React + Vite template targeting TypeScript.
- **NO TAILWIND**, **NO STYLED-COMPONENTS**. Vanilla `<Component>/index.css` scopes are used.
- FFMpeg is abstracted through `ffmpegRunner.ts` to support optional user-provided system binaries for native path fallback.
- The `.llc` save integration uses `json5`.

## Known Challenges
- HTML5 Video does not natively perform frame-accurate seeking seamlessly. Do your best to sync `video.currentTime` and preview accurately.
- Re-encoding large videos in browser WASM is slow. Make sure we provide clear loading UI. 

## Next Steps for Agents
1. Make sure `ffmpegRunner.ts` logic verifies if `copy` or `re-encode` works properly. (e.g. `ffmpeg` rejects `-vf crop` combined with `-c:v copy`).
2. Implement UI following modern, premium aesthetic design (glassmorphism/deep dark mode) mapped via `src/index.css` tokens.
