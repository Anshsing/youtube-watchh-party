# 🎬 WatchParty — YouTube Watch Together

Watch YouTube videos in perfect real-time sync with friends. Create a room, share the code, and enjoy together.

## Features

- **Real-time sync** — Play, pause, seek, and video changes sync across all clients
- **Room-based** — Create or join rooms with 6-character codes
- **Role system** — Host, Moderator, Participant, Viewer roles with granular permissions
- **Drift correction** — Accounts for network latency to keep everyone in sync
- **Auto host promotion** — If the host leaves, the next person is promoted automatically
- **Premium UI** — Glassmorphic dark design with smooth animations

## Architecture

```
Youtube_Watch_party/
├── backend/          → Node.js + Express + WebSocket server (deploy to Render)
│   ├── server/
│   │   ├── config/   → Constants & role definitions
│   │   ├── core/     → RoomManager, RoleManager
│   │   ├── handlers/ → room, sync, role WebSocket handlers
│   │   ├── middleware/→ Permission guards
│   │   ├── routes/   → REST API (/api/health, /api/stats)
│   │   ├── utils/    → Logger, WS helpers
│   │   ├── wsRouter.js
│   │   └── index.js  → Entry point
│   ├── package.json
│   └── render.yaml   → Render blueprint
│
└── frontend/         → Static HTML/CSS/JS (deploy to Vercel)
    ├── css/main.css  → Design system
    ├── js/
    │   ├── config.js → ⚠️ Set your Render backend URL here
    │   ├── socket.js → WebSocket client
    │   ├── player.js → YouTube IFrame API wrapper
    │   ├── landing.js→ Landing page controller
    │   └── room.js   → Room controller
    ├── index.html    → Landing page
    ├── room.html     → Room page
    └── vercel.json   → Vercel config
```

## Local Development

```bash
# 1. Install backend dependencies
cd backend
npm install

# 2. Start the server (serves frontend too at localhost:3000)
npm run dev

# 3. Open http://localhost:3000
```

## Deployment (Free Tier)

### Step 1: Deploy Backend to Render

1. Push your code to GitHub
2. Go to [render.com](https://render.com) → **New** → **Web Service**
3. Connect your GitHub repo
4. Set **Root Directory** to `backend`
5. **Build Command:** `npm install`
6. **Start Command:** `npm start`
7. Choose **Free** plan
8. Add environment variables:
   - `NODE_ENV` = `production`
   - `CORS_ORIGIN` = `https://your-app.vercel.app` (set after Vercel deploy)
9. Deploy — note your URL: `https://your-app.onrender.com`

### Step 2: Deploy Frontend to Vercel

1. Go to [vercel.com](https://vercel.com) → **New Project**
2. Import your GitHub repo
3. Set **Root Directory** to `frontend`
4. **Framework Preset:** Other
5. **Build Command:** _(leave empty — static files, no build)_
6. **Output Directory:** `.`
7. Deploy — note your URL: `https://your-app.vercel.app`

### Step 3: Connect Them

1. **Frontend → Backend:** Edit `frontend/js/config.js`:
   ```js
   WS_URL: 'wss://your-app.onrender.com'
   ```
   Redeploy frontend.

2. **Backend → Frontend (CORS):** In Render dashboard, set:
   ```
   CORS_ORIGIN = https://your-app.vercel.app
   ```

### ⚠️ Render Free Tier Notes

- Free services **spin down after 15 minutes of inactivity**
- First connection after idle takes ~30-60 seconds (cold start)
- WebSockets are fully supported on Render free tier

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/health` | Liveness probe with stats |
| `GET /api/stats` | Room count + participant count |
| `GET /api/rooms/:code` | Public room state snapshot |

## WebSocket Protocol

| Client → Server | Description |
|---|---|
| `create` | Create a new room |
| `join` | Join an existing room |
| `play` | Start playback |
| `pause` | Pause playback |
| `seek` | Seek to position |
| `change_video` | Load a new YouTube video |
| `assign_role` | Change a user's role (host only) |
| `kick` | Remove a user (host only) |
| `transfer_host` | Transfer host to another user |

## License

MIT
