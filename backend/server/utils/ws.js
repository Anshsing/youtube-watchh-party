/**
 * utils/ws.js
 *
 * Thin helpers for sending typed JSON messages over WebSocket connections.
 * All handlers use these instead of calling ws.send() directly, which keeps
 * message formatting consistent across the entire codebase.
 */

'use strict';

const WS_OPEN = 1; // WebSocket.OPEN constant

/**
 * Sends a typed JSON message to a single client.
 * Silently no-ops if the socket is not in OPEN state.
 *
 * @param {import('ws').WebSocket} ws
 * @param {string} type    - One of SERVER_EVENTS
 * @param {object} [payload={}]
 */
function send(ws, type, payload = {}) {
  if (ws.readyState === WS_OPEN) {
    ws.send(JSON.stringify({ type, payload }));
  }
}

/**
 * Sends a standardised error event back to the originating client.
 *
 * @param {import('ws').WebSocket} ws
 * @param {string} message - Human-readable error description
 */
function sendError(ws, message) {
  send(ws, 'error', { message });
}

/**
 * Broadcasts a typed JSON message to every open connection in a room,
 * optionally excluding one user (the sender, or a just-kicked user).
 *
 * @param {object} room            - Room object from RoomManager
 * @param {string} type            - One of SERVER_EVENTS
 * @param {object} [payload={}]
 * @param {string|null} [excludeUserId=null]
 */
function broadcast(room, type, payload = {}, excludeUserId = null) {
  const json = JSON.stringify({ type, payload });
  for (const [userId, participant] of room.participants) {
    if (userId === excludeUserId) continue;
    if (participant.ws.readyState === WS_OPEN) {
      participant.ws.send(json);
    }
  }
}

module.exports = { send, sendError, broadcast };
