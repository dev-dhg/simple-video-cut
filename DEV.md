# Developer Guide

## Architecture
- **Web First Approach**: The application interface relies on `@ffmpeg/ffmpeg` for web operations. The FFmpeg interactions are abstracted in `src/lib/ffmpegRunner.ts` to allow easy injection of standard Node `child_process.exec` calls in an Electron host environment.
- **Region Cropping**: To provide a snappy UX, the video region cropper is implemented as a bounding box strictly absolutely positioned over the native HTML5 `<video>` element. These coordinates map aspect-ratio independently to actual intrinsic video dimensions before FFmpeg execution.
- **State Management**: Important entities include:
  - `activeSegments`: Array of `{id, start, end, selected, label}`
  - `mediaUri`: Local blob or file reference to the source video.
  - `cropCoordinates`: `{x, y, w, h}` native mapping.
- **CSS Strategy**: We employ scoping local component styling inside `/src/components/MyComponent/index.css`. Tailwind CSS and other utility frameworks are strictly excluded. 

## FFmpeg Arguments Breakdown
When executing cuts, operations fall into two types:
- **Direct copy**: `ffmpeg -i input.mp4 -ss <START> -to <END> -c:v copy -c:a copy output.mp4`
- **Region Cropping** (requires re-encoding): `ffmpeg -i input.mp4 -ss <START> -to <END> -vf "crop=W:H:X:Y" -c:a copy output.mp4`
