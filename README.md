# 🎬 WatchParty

Watch YouTube videos in real-time sync with friends. Create a room, share the code, and enjoy together.
Live at : https://youtube-watch-party-8h3r.onrender.com/

## Features

- **Real-time sync** — Play, pause, seek, and video changes sync across all clients instantly
- **Room codes** — Create or join rooms with 6-character codes
- **Role system** — Host, Moderator, Participant, Viewer with different permissions
- **Drift correction** — Accounts for network latency to keep everyone in sync
- **Auto host promotion** — If the host leaves, the next person is automatically promoted
- **Single deployment** — Frontend and backend served from the same Render instance

## Project Structure

```
Youtube_Watch_party/
├── backend/                  ← Node.js server (deployed to Render)
│   ├── server/
│   │   ├── config/           → Role definitions, constants
│   │   ├── core/             → RoomManager, RoleManager
│   │   ├── handlers/         → room, sync, role WebSocket handlers
│   │   ├── middleware/       → Permission guards
│   │   ├── routes/           → REST API (/api/health, /api/stats)
│   │   ├── utils/            → Logger, WS send/broadcast helpers
│   │   ├── wsRouter.js       → Routes incoming WS messages to handlers
│   │   └── index.js          → Entry point — HTTP + WebSocket + static serving
│   ├── .env.example
│   ├── package.json
│   └── render.yaml           → Render deployment blueprint
│
└── frontend/                 ← Static files served by the backend
    ├── css/main.css          → Design system
    ├── js/
    │   ├── config.js         → Frontend config (WS_URL — leave as null)
    │   ├── socket.js         → WebSocket client
    │   ├── player.js         → YouTube IFrame API wrapper
    │   ├── landing.js        → Landing page controller
    │   └── room.js           → Room controller
    ├── index.html            → Landing page
    └── room.html             → Room page
```

## Local Development

```bash
cd backend
npm install
npm run dev
```

Then open **http://localhost:3000**.

The server serves the `frontend/` folder as static files, so both the UI and WebSocket run on the same port — no separate frontend server needed.

## Deployment (Render — free tier)

Everything deploys from a single Render Web Service. The Express server handles HTTP, WebSocket, and serves the frontend static files all on one URL.

### Steps

1. **Push your repo to GitHub**

2. **Create a Web Service on [render.com](https://render.com)**
   - Connect your GitHub repo
   - **Root Directory:** `backend`
   - **Build Command:** `npm install --production`
   - **Start Command:** `npm start`
   - **Plan:** Free

3. **That's it.** Your app will be live at `https://your-app.onrender.com`

> **Note:** Render free tier spins down after 15 minutes of inactivity. The first request after idle takes ~30–60 seconds to wake up. WebSockets are fully supported.

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/health` | Server liveness + stats |
| `GET /api/stats` | Room and participant counts |
| `GET /api/rooms/:code` | Public room state (for debugging) |

## WebSocket Events

| Client → Server | Description |
|---|---|
| `create` | Create a new room (caller becomes host) |
| `join` | Join an existing room by code |
| `play` | Start playback at position |
| `pause` | Pause at position |
| `seek` | Seek to position |
| `change_video` | Load a new YouTube video |
| `assign_role` | Change a participant's role (host only) |
| `kick` | Remove a participant (host only) |
| `transfer_host` | Hand off host to another participant |
