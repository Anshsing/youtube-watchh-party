/**
 * handlers/roomHandlers.js
 *
 * Handles room lifecycle WebSocket messages:
 *   create  — Create a new room; caller becomes host
 *   join    — Join an existing room by code
 */

'use strict';

const RoomManager = require('../core/RoomManager');
const { send, sendError, broadcast } = require('../utils/ws');
const { SERVER_EVENTS } = require('../config/constants');
const logger = require('../utils/logger');

/**
 * Handles: { type: 'create', payload: { userName } }
 *
 * Creates a new room, assigns the sender as host, and responds with
 * the full room state so the client can render the initial UI.
 *
 * @param {import('ws').WebSocket} ws
 * @param {object} payload
 */
function handleCreate(ws, payload) {
  const userName = payload?.userName?.trim();
  if (!userName) {
    return sendError(ws, 'userName is required to create a room.');
  }

  const result = RoomManager.createRoom(ws, userName);
  send(ws, SERVER_EVENTS.CREATED, result);
  logger.debug('RoomHandler', `create → room=${result.code}`);
}

/**
 * Handles: { type: 'join', payload: { roomCode, userName } }
 *
 * Adds the sender to the specified room as a participant and:
 *  - Sends them a 'joined' event with full room state (for sync on entry)
 *  - Broadcasts a 'user_joined' event to all existing participants
 *
 * @param {import('ws').WebSocket} ws
 * @param {object} payload
 */
function handleJoin(ws, payload) {
  const roomCode = payload?.roomCode?.trim()?.toUpperCase();
  const userName = payload?.userName?.trim();

  if (!roomCode) return sendError(ws, 'roomCode is required.');
  if (!userName) return sendError(ws, 'userName is required.');

  const result = RoomManager.joinRoom(ws, roomCode, userName);
  if (result.error) return sendError(ws, result.error);

  // Confirm join and provide full room state so the client can sync immediately
  send(ws, SERVER_EVENTS.JOINED, result);

  // Announce new arrival to everyone already in the room (excluding the joiner)
  const room = RoomManager.getRoom(result.code);
  broadcast(
    room,
    SERVER_EVENTS.USER_JOINED,
    { userId: result.userId, name: userName, role: result.role },
    result.userId
  );

  logger.debug('RoomHandler', `join → room=${result.code}  user="${userName}"`);
}

module.exports = { handleCreate, handleJoin };
