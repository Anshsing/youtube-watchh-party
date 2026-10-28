/**
 * routes/api.js
 *
 * Express HTTP REST routes for server diagnostics and room inspection.
 * These are debug/admin endpoints — not part of the real-time WS protocol.
 *
 * All routes are mounted at /api in index.js.
 */

'use strict';

const { Router } = require('express');
const RoomManager = require('../core/RoomManager');

const router = Router();

/**
 * GET /api/health
 *
 * Liveness probe. Returns current server stats.
 * Useful for uptime monitoring and load balancer health checks.
 *
 * Response: { status, rooms, participants, uptime, timestamp }
 */
router.get('/health', (_req, res) => {
  res.json({
    status:       'ok',
    rooms:        RoomManager.getRoomCount(),
    participants: RoomManager.getTotalParticipants(),
    uptime:       Math.floor(process.uptime()),
    timestamp:    Date.now(),
  });
});

/**
 * GET /api/stats
 *
 * Returns global server statistics.
 *
 * Response: { rooms, participants, uptime }
 */
router.get('/stats', (_req, res) => {
  res.json({
    rooms:        RoomManager.getRoomCount(),
    participants: RoomManager.getTotalParticipants(),
    uptime:       Math.floor(process.uptime()),
  });
});

/**
 * GET /api/rooms/:code
 *
 * Returns a public (no WebSocket refs) snapshot of a room.
 * Useful for inspecting room state during development/debugging.
 *
 * Response: PublicRoomState | 404
 */
router.get('/rooms/:code', (req, res) => {
  const code    = req.params.code.toUpperCase();
  const summary = RoomManager.getRoomSummary(code);
  if (!summary) {
    return res.status(404).json({ error: `Room "${code}" not found.` });
  }
  res.json(summary);
});

module.exports = router;
