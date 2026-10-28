'use strict';

const express  = require('express');
const http     = require('http');
const path     = require('path');
const { WebSocketServer } = require('ws');

const { route, handleDisconnect } = require('./wsRouter');
const apiRouter   = require('./routes/api');
const RoomManager = require('./core/RoomManager');
const logger      = require('./utils/logger');
const { HEARTBEAT_INTERVAL_MS, DEFAULT_PORT } = require('./config/constants');

const app    = express();
const server = http.createServer(app);

// Trust Render's proxy so req.ip and secure connections work correctly
app.set('trust proxy', 1);

app.use(express.json());

// CORS — frontend and backend share the same origin so this mainly
// helps when hitting the API directly from dev tools or monitoring.
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (_req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Serve the frontend — same server handles both HTTP and WebSocket
app.use(express.static(path.join(__dirname, '../../frontend')));

// REST API
app.use('/api', apiRouter);

// Catch-all 404 for unknown API routes
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── WebSocket ────────────────────────────────────────────────────────────────

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  logger.info('WS', `Client connected  ip=${ip}  total=${wss.clients.size}`);

  ws.userId   = null;
  ws.roomCode = null;
  ws.isAlive  = true;

  ws.on('message', (data) => {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      ws.send(JSON.stringify({ type: 'error', payload: { message: 'Message must be valid JSON.' } }));
      return;
    }

    if (typeof message.type !== 'string') {
      ws.send(JSON.stringify({ type: 'error', payload: { message: 'Message must include a "type" field.' } }));
      return;
    }

    route(ws, message);
  });

  ws.on('close', (code) => {
    logger.info('WS', `Client disconnected  userId=${ws.userId ?? 'n/a'}  code=${code}`);
    handleDisconnect(ws);
  });

  ws.on('error', (err) => {
    // Log but don't crash — socket errors are expected (dropped connections, etc.)
    logger.warn('WS', `Socket error  userId=${ws.userId ?? 'n/a'}  ${err.message}`);
  });

  ws.on('pong', () => { ws.isAlive = true; });
});

// Heartbeat — ping every client and drop ones that don't respond
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      logger.warn('WS', `Dropping dead connection  userId=${ws.userId ?? 'n/a'}`);
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL_MS);

wss.on('close', () => clearInterval(heartbeat));

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT) || DEFAULT_PORT;

server.listen(PORT, () => {
  logger.info('Server', `Listening on port ${PORT}`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`\n  🎬  WatchParty running at http://localhost:${PORT}\n`);
  }
});
