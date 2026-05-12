# MotionBoard

A collaborative canvas tool for reviewing motion assets (GIFs and MP4s) — like Figma, but purpose-built for motion review.

## Features (Phase 1 MVP)

- **Accounts** — sign up, log in, persistent sessions
- **Boards** — create, manage, and open canvas boards
- **Canvas** — upload GIF/MP4, they autoplay on the canvas
- **Text overlays** — add draggable, resizable, fully editable text on top of motion assets
- **Properties panel** — font family, size, color, bold/italic/underline, alignment, opacity, position
- **Sharing** — invite collaborators by email with Owner / Editor / Commenter / Viewer roles
- **Comments** — pin threaded comments to any canvas position, resolve or reply
- **Export** — export the current canvas frame as PNG

## Tech stack

| Layer | Tech |
|-------|------|
| Frontend | React 18 + TypeScript + Vite |
| Canvas | Fabric.js v5 |
| GIF animation | gifler (CDN) |
| Video playback | HTML5 `<video>` → fabric.Image |
| State | Zustand |
| Styling | Tailwind CSS |
| Backend | Express 4 + TypeScript |
| Database | SQLite (better-sqlite3) |
| Auth | JWT (30-day tokens) |
| File storage | Local `backend/uploads/` |

## Setup

### Prerequisites
- Node.js 18+
- npm 9+

### Install

```bash
# From the project root
npm install
cd backend && npm install
cd ../frontend && npm install
```

### Run (development)

Open two terminals:

**Terminal 1 — Backend**
```bash
cd backend
npm run dev
# API running at http://localhost:3001
```

**Terminal 2 — Frontend**
```bash
cd frontend
npm run dev
# App running at http://localhost:5173
```

Then open http://localhost:5173 and create an account.

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `V` | Select tool |
| `H` | Hand / Pan tool |
| `T` | Text tool (click canvas to place) |
| `C` | Comment tool (click canvas to pin) |
| `Esc` | Back to Select |
| `Scroll` | Zoom in/out |

## Uploading media

1. Open a board
2. Click the **Upload** button (↑) in the toolbar
3. Select a `.gif`, `.mp4`, or `.webm` file
4. The asset appears on the canvas and autoplays

## Adding text overlays

1. Press `T` or click the Text tool
2. Click anywhere on the canvas
3. Type your text — it's immediately editable
4. Use the Properties panel (right sidebar) to change font, size, color, alignment

## Sharing

1. Click **Share** (top right, owners only)
2. Enter a collaborator's email and choose their role
3. If they have an account, they're added immediately
4. If not, an invite link is generated — share it with them

## Project structure

```
motionboard/
├── backend/
│   ├── src/index.ts      # All API routes
│   ├── data/             # SQLite database (auto-created)
│   └── uploads/          # Uploaded media files (auto-created)
└── frontend/
    └── src/
        ├── pages/        # Login, Signup, Dashboard, Board, AcceptInvite
        ├── components/
        │   ├── canvas/   # CanvasEditor, Toolbar, PropertiesPanel
        │   ├── ShareModal.tsx
        │   └── CommentsPanel.tsx
        ├── stores/       # Zustand auth store
        ├── lib/api.ts    # Axios API client
        └── types/        # Shared TypeScript types
```

## Roadmap

- **Phase 2** — Frame system (Instagram/Story/etc. presets), custom dimensions, layout proportions
- **Phase 3** — Animated GIF/MP4 export with text overlays baked in (ffmpeg.wasm)
- **Phase 4** — Real-time collaboration via WebSockets, live cursors
