/**
 * wsRouter.js
 *
 * WebSocket message router and disconnect handler.
 *
 * This module is the single entry point for all incoming WebSocket messages.
 * It validates session state, resolves room/participant context, and delegates
 * to the appropriate domain handler (room, sync, or role).
 *
 * ─── Routing Table ────────────────────────────────────────────────────────────
 *
 *  Pre-session (no room required):
 *    create        → roomHandlers.handleCreate
 *    join          → roomHandlers.handleJoin
 *
 *  Sync (requires room session, permission: host | moderator):
 *    play          → syncHandlers.handlePlay
 *    pause         → syncHandlers.handlePause
 *    seek          → syncHandlers.handleSeek
 *    change_video  → syncHandlers.handleChangeVideo
 *
 *  Role management (requires room session, permission: host only):
 *    assign_role   → roleHandlers.handleAssignRole
 *    kick          → roleHandlers.handleKick
 *    transfer_host → roleHandlers.handleTransferHost
 *
 *  Utility:
 *    ping          → { type: 'pong', payload: { serverTime } }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const RoomManager = require('./core/RoomManager');
const { send, sendError, broadcast } = require('./utils/ws');
const { CLIENT_EVENTS, SERVER_EVENTS } = require('./config/constants');
const logger = require('./utils/logger');

// Domain handlers
const { handleCreate, handleJoin }           = require('./handlers/roomHandlers');
const { handlePlay, handlePause, handleSeek, handleChangeVideo } = require('./handlers/syncHandlers');
const { handleAssignRole, handleKick, handleTransferHost }       = require('./handlers/roleHandlers');

// ─── Route ────────────────────────────────────────────────────────────────────

/**
 * Entry point called by the WebSocket 'message' event in index.js.
 * Parses the message type and delegates to the correct handler.
 *
 * Pre-session messages (create, join) are handled without room context.
 * All other messages require an active room session (userId + roomCode set on ws).
 *
 * @param {import('ws').WebSocket}       ws      - The sending socket
 * @param {{ type: string, payload: * }} message - Already-parsed JSON object
 */
function route(ws, message) {
  const { type, payload = {} } = message;

  // ── Pre-session handlers (no room required) ──────────────────────────────
  if (type === CLIENT_EVENTS.CREATE) return handleCreate(ws, payload);
  if (type === CLIENT_EVENTS.JOIN)   return handleJoin(ws, payload);

  // ── Session guard — all remaining messages require an active room ────────
  if (!ws.userId || !ws.roomCode) {
    return sendError(ws, 'You must create or join a room before sending this message.');
  }

  const room = RoomManager.getRoom(ws.roomCode);
  if (!room) return sendError(ws, 'Your room no longer exists.');

  const participant = RoomManager.getParticipant(ws.roomCode, ws.userId);
  if (!participant)  return sendError(ws, 'Participant session not found.');

  // ── Dispatch ─────────────────────────────────────────────────────────────
  switch (type) {
    // Playback sync
    case CLIENT_EVENTS.PLAY:         return handlePlay(ws, room, participant, payload);
    case CLIENT_EVENTS.PAUSE:        return handlePause(ws, room, participant, payload);
    case CLIENT_EVENTS.SEEK:         return handleSeek(ws, room, participant, payload);
    case CLIENT_EVENTS.CHANGE_VIDEO: return handleChangeVideo(ws, room, participant, payload);

    // Role management
    case CLIENT_EVENTS.ASSIGN_ROLE:   return handleAssignRole(ws, room, participant, payload);
    case CLIENT_EVENTS.KICK:          return handleKick(ws, room, participant, payload);
    case CLIENT_EVENTS.TRANSFER_HOST: return handleTransferHost(ws, room, participant, payload);

    // Utility
    case CLIENT_EVENTS.PING:
      return send(ws, SERVER_EVENTS.PONG, { serverTime: Date.now() });

    default:
      logger.warn('wsRouter', `Unknown message type: "${type}"  userId=${ws.userId}`);
      sendError(ws, `Unknown message type: "${type}"`);
  }
}

// ─── Disconnect ───────────────────────────────────────────────────────────────

/**
 * Called when a WebSocket connection closes — clean or otherwise.
 * Removes the participant from their room and notifies remaining members.
 *
 * Handles automatic host promotion when the host disconnects:
 *  - leaveRoom() promotes the next-oldest participant
 *  - We broadcast host_transferred so all clients update their UI
 *
 * @param {import('ws').WebSocket} ws
 */
function handleDisconnect(ws) {
  if (!ws.userId || !ws.roomCode) return; // Connection closed before joining a room

  const result = RoomManager.leaveRoom(ws.roomCode, ws.userId);

  // Room was destroyed (no participants left) — nothing to broadcast
  if (!result || result.destroyed) return;

  const updatedRoom = RoomManager.getRoom(ws.roomCode);
  if (!updatedRoom) return;

  // Notify remaining participants that someone left
  broadcast(updatedRoom, SERVER_EVENTS.USER_LEFT, {
    userId: result.leftUserId,
    reason: 'disconnected',
  });

  // Announce automatic host promotion if it happened
  if (result.newHostId) {
    broadcast(updatedRoom, SERVER_EVENTS.HOST_TRANSFERRED, {
      fromUserId: result.leftUserId,
      toUserId:   result.newHostId,
      toName:     result.newHostName,
      reason:     'host_disconnected',
    });
  }
}

module.exports = { route, handleDisconnect };
