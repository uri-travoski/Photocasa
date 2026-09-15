# Photocasa (v1.1)

**Photocasa** is a modern, 100% offline, privacy-first desktop photo library, non-destructive photo editor, and collage maker inspired by **Google Picasa**. Built with **Tauri v2**, **Rust**, **React 19**, **TypeScript**, and **Tailwind CSS v4**.

---

## Features

- **Folder Monitoring & Instant Library**: Fast background indexing of local photo collections using SQLite and multi-threaded thumbnail generation.
- **Non-Destructive Photo Editing**:
  - **Tuning**: Live exposure, contrast, highlights tone curve, shadows recovery, and saturation sliders.
  - **Basic Fixes**: "Auto Improve" one-click dynamic range enhancement, straightening (-45° to +45°), and interactive aspect-ratio crop (`1:1`, `4x6`, `5x7`, `8x10`, `4:3`, `16:9`, `Freeform`) with portrait/landscape rotation.
  - **Effects**: Black & White film, Sepia tone, Golden Hour Warmth, and Vignette.
  - **Annotations**: Draggable, customizable text overlays and directional arrows.
- **Collage Studio**:
  - **Picture Pile**: Freeform draggable and rotatable photos with Polaroid borders and straight/shadow controls.
  - **Mosaic Grid**: Responsive grid layout with transparent background option, cell swapping, per-photo zoom (50%–250%), and direct-manipulation photo framing and panning.
  - Sidebar Text and Arrow tools matching photo editor mode.
- **Privacy First**: 100% offline, no tracking, no cloud uploads, zero telemetry.

---

## Running with Docker Compose (In-Browser Desktop)

Photocasa is packaged as an in-browser streaming Linux desktop container powered by KasmVNC/Webtop. This allows running Photocasa anywhere—including **Dockhand**, **CasaOS**, **Portainer**, **Unraid**, or any server with Docker installed.

### Quick Start

1. Create a `docker-compose.yml` file:

```yaml
services:
  photocasa:
    image: ghcr.io/uri-travoski/photocasa:1.1
    container_name: photocasa
    restart: unless-stopped
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=Etc/UTC
      - TITLE=Photocasa
    volumes:
      # Persistent app data (SQLite database, thumbnails, settings)
      - ./config:/config
      # Your photos directory
      - /path/to/your/photos:/photos
    ports:
      # In-browser web desktop access
      - "3000:3000"
    shm_size: "1gb"
```

2. Start the container:

```bash
docker compose up -d
```

3. Open your browser and navigate to:

```text
http://localhost:3000
```
*(or `http://<server-ip>:3000`)*

---

## Native Desktop Development & Build

### Prerequisites
- Node.js (v20+) & `pnpm`
- Rust (v1.77.2+) & Cargo
- System dependencies (Linux): `libwebkit2gtk-4.1-dev`, `build-essential`, `curl`, `wget`, `file`, `libxdo-dev`, `libssl-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`

### Development
```bash
# Install frontend dependencies
pnpm install

# Run Vite frontend and Tauri native window with hot-reloading
pnpm tauri dev
```

### Production Build
```bash
pnpm tauri build
```
The compiled binary and packages (`.deb`, `.AppImage`) will be generated under `src-tauri/target/release/bundle/`.

---

## License
MIT License.

