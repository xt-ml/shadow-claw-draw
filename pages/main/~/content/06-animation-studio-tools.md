---
title: "Animation Studio Tools & Export"
created: "2026-11-23T12:00:00Z"
updated: "2026-11-23T12:40:00Z"
slug: "animation-studio-tools"
---

## Animation Studio Tools & Export

**Page 3 — Animation Studio (`/main/animation/`)** hosts `<scdraw-animation-workbench>`, uniting **Vector Animation** (SVG keyframe tweening, Inkscape-inspired Bezier path morphing, SMIL/CSS Animated SVG) and **Bitmap Animation** (multi-layer pixel frames, GIMP-inspired perceptual quantization/dithering & delta optimization, APNG, and GIFWorks-ported screen/webcam capture & clip trimming).

---

### Core Workflows

1. **Vector Keyframe & Cel Animation**:
   - Draw shapes or paths on Frame 1 using all 13 Vector tools (`<scdraw-vector-canvas>`).
   - Duplicate a frame (`Dup`), move/rotate/recolor elements (or reshape Bezier nodes), and click **Tween +4** (or call `scdraw_animation_tween` with `steps`, `easing`, and optional curved `trajectoryPath`) to auto-generate interpolated frames.
   - Toggle **Onion** (`O` shortcut) to inspect previous and next frame ghosts while animating.
2. **Bitmap Frame-by-Frame & Capture Animation**:
   - Switch **Mode** to **Bitmap Anim** (or capture a screen/webcam clip in the **Capture** tab with Start Delay `0–30s` and Timer `0–30s`).
   - Paint on multi-layer raster frames with `<scdraw-bitmap-canvas>`, scrub the horizontal filmstrip, edit per-frame millisecond delays (`20–10000ms`), and trim unwanted frames using the **`[In … Out]`** range sliders (**Trim Range**).
   - Run **Optimize** / **Unopt** (ported from GIMP `animation-optimize.c`) to diff bounding boxes and coalesce delta frames.
3. **Cross-Studio Bridge**:
   - Click **Send to Anim** in Vector Studio or Bitmap Studio (`scdraw_animation_capture_studio`) to append your current artwork as a timeline frame.
   - Click **Rasterize → Bitmap** (`scdraw_animation_rasterize_to_bitmap`) to convert a Vector animation into editable Bitmap frames.
   - Drop `.gif`, `.apng`, `.png`, `.svg`, `.webm`, or `.mp4` files directly onto the stage to import frames offline.

---

### Export Formats & Engines

- **GIF (`.gif`) — Offline Native GIMP Engine (Default)**:
  - **Quantization (`scdraw-quantize.js`)**: Perceptual CIE L\*a\*b\* box-cut palette (`2–256` colors, default `200`) with transparent index reservation.
  - **Dithering**: `bayer` (deterministic 8×8 positional dither — minimizes static-region shimmer), `floyd-steinberg`, `floyd-steinberg-low-bleed`, or `none`.
  - **Delta Optimization (`scdraw-gif-optimize.js`)**: Crops changed bounding boxes with `combine` disposal and automatically promotes preceding frames to `replace` on opaque-to-transparent transitions.
  - **Optional CDN Accelerators**: Choose `gifski` (`gifski-wasm@2.2.0`) for cross-frame temporal dithering or set **Gifsicle Lossy** (`> 0`, `gifsicle-wasm-browser@1.5.19`) for lossy `--lossy` + `--resize-touch` post-compression.
- **APNG (`.apng`)**: Pure-JS lossless 32-bit RGBA (`acTL` / `fcTL` / `IDAT` / `fdAT`) muxer & demuxer (`scdraw-apng-codec.js`).
- **Animated SVG (`.svg`)**: SMIL (`<animate>`, `<animateTransform>`) or CSS `@keyframes` output with round-trip metadata (`scdraw-anim-svg.js`).
- **WebM / MP4 & PNG Sprite Sheet**: Native `MediaRecorder` WebM (offline, with optional Web Audio muxing), optional `@ffmpeg/ffmpeg` MP4 transcoding (`libx264` + `aac` audio muxing), and PNG Sprite Sheet + JSON atlas packing.
- **Output Resolution & Quality**: Choose `source`, `360p`, `480p`, `720p`, `1080p`, `square-512`, `square-1080`, or `custom` (`outputWidth` × `outputHeight`), tune `quality` (`1–100`, mapped to FFmpeg CRF and WebM target bitrate), toggle `Include Audio Track`, and set `Audio Bitrate` (`64–320 kbps`).

---

### Topbar, Full Screen Mode & Mobile Layout

- **Primary Actions**: `Vector` | `Bitmap` | `Animation` switcher, `Play` / `Pause`, `Undo`, `Redo`, `Save` (writes `animation.scdraw-anim.json` to OPFS), **Full Screen** (`#scdraw-anim-fullscreen`), and panel toggles (`Tools`, `Timeline`, `Layers`, `Export`).
- **Secondary Bar (`More ▾` on mobile/tablet, always open at `>= 1024px`)**: `Mode` (`Vector Anim` / `Bitmap Anim`), `New`, `Import Media`, and `Rasterize → Bitmap` (visible in Vector Anim mode).
- **Mobile Layout (`< 640px`)**: Switches between `Stage | Timeline | Layers | Export` tabs (with `Export` / `Capture` sub-tabs in the right pane) above `<scdraw-statusbar>`.

---

### Timeline, Capture & Limits

- **Timeline (`<scdraw-timeline>`)**: Defaults to `800×600` (`Vector Anim`) or `512×512` (`Bitmap Anim`) at `1–60` FPS (`12 fps` / `83 ms` default), `0.25×`–`4×` speed multipliers, `Loop` / `Once` / `Ping-Pong` playback modes, up to `MAX_ANIMATION_FRAMES = 500`, and separate undo/redo stacks (`MAX_HISTORY = 100` for Vector Anim, `MAX_ANIMATION_BITMAP_HISTORY = 25` for Bitmap Anim).
- **Capture & Clip (`<scdraw-capture-panel>`)**: Provides `Screen`, `Webcam`, and standalone `Mic Only` capture, **Audio Input** (`No Audio`, `Microphone`, `System / Tab Audio`, `Mic + System Audio`), **Microphone** device selection, **Capture Res** (`source`, `480p`, `720p`, `1080p`), `Record`, `Stop`, `PiP`, `Start Delay` (`0–30s`, default `3s`), `Max Timer` (`0–30s`, default `5s`), `Extract FPS` (`1–30`, default `12`), `Max Width` (`64–1920`, default `512`), `Extract Clip → Frames` (auto-attaching captured audio), and `Load Audio` / `Clear Audio` for standalone or imported audio tracks.

---

### Keyboard Shortcuts

- **`Space`**: Play / Pause
- **`,` / `.`**: Previous / Next frame
- **`Home` / `End`**: First / Last frame
- **`O`**: Toggle Onion Skinning
- **`Escape`**: Exit Full Screen mode
- **`Alt + ArrowLeft` / `Alt + ArrowRight`** (on focused frame card): Reorder frame
- **`Ctrl/Cmd + Z` / `Ctrl/Cmd + Shift + Z`**: Undo / Redo

---

### Declarative WebMCP Automation

Agents can author, tween, trim, capture, and export animations programmatically with all 10 animation tools:
`scdraw_new_animation`, `scdraw_get_animation_status`, `scdraw_animation_manage_frame`, `scdraw_animation_tween`, `scdraw_animation_trim`, `scdraw_animation_playback`, `scdraw_animation_capture_studio`, `scdraw_animation_rasterize_to_bitmap`, `scdraw_export_animated_svg`, and `scdraw_export_animation`.

---

## See Also

- [Architecture & Declarative WebMCP Tools](02-architecture-and-tools.md) (`/main/architecture/`) — System architecture and all 36 `scdraw_*` WebMCP tools
- [Vector Studio Tools & Pen Editing](03-vector-studio-tools.md) (`/main/vector-studio-tools/`) — Vector tools & Bezier editing
- [Bitmap Studio Tools & Pixel Painting](04-bitmap-studio-tools.md) (`/main/bitmap-studio-tools/`) — Raster painting, layers & filters
- [Porting & Upstream Attribution](05-porting-and-attribution.md) (`/main/porting-and-attribution/`) — GIMP, Inkscape, GIFWorks, and codec provenance
