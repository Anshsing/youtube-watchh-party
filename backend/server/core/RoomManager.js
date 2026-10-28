/**
 * core/RoomManager.js
 *
 * In-memory room state store. The single source of truth for:
 *  - Room lifecycle: create, join, leave, destroy
 *  - Participant tracking: role, WebSocket reference, display name
 *  - Video state: current video, playback position, playing flag
 *
 * ─── Data Shapes ─────────────────────────────────────────────────────────────
 *
 *  Room {
 *    code:         string            — 6-char alphanumeric (e.g. 'AB12XZ')
 *    hostId:       string            — userId of the current host
 *    participants: Map<userId, Participant>
 *    videoState:   VideoState
 *    createdAt:    number            — Unix ms
 *  }
 *
 *  Participant {
 *    ws:   WebSocket
 *    name: string
 *    role: 'host' | 'moderator' | 'participant' | 'viewer'
 *  }
 *
 *  VideoState {
 *    videoId:   string | null   — YouTube video ID (11 chars)
 *    position:  number          — seconds from start
 *    playing:   boolean
 *    updatedAt: number          — Unix ms (when state last changed)
 *  }
 *
 *  PublicRoomState {
 *    code:         string
 *    hostId:       string
 *    participants: Array<{ userId, name, role }>
 *    videoState:   VideoState   — (no ws references)
 *  }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const crypto = require('crypto');
const logger = require('../utils/logger');
const { ROLES, ROOM_CODE_LENGTH } = require('../config/constants');

/** @type {Map<string, Room>} Master room registry. */
const rooms = new Map();

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Generates a unique uppercase alphanumeric room code of length ROOM_CODE_LENGTH.
 * Retries until a code not already in use is found.
 *
 * @returns {string}
 */
function generateRoomCode() {
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  do {
    code = Array.from(
      { length: ROOM_CODE_LENGTH },
      () => CHARS[Math.floor(Math.random() * CHARS.length)]
    ).join('');
  } while (rooms.has(code));
  return code;
}

/**
 * Returns a cryptographically random UUID v4 for participant IDs.
 * @returns {string}
 */
function generateUserId() {
  return crypto.randomUUID();
}

/**
 * Builds a serializable snapshot of room state — safe to send to clients.
 * Strips all WebSocket references.
 *
 * @param {Room} room
 * @returns {PublicRoomState}
 */
function buildPublicState(room) {
  return {
    code:   room.code,
    hostId: room.hostId,
    participants: Array.from(room.participants.entries()).map(([id, p]) => ({
      userId: id,
      name:   p.name,
      role:   p.role,
    })),
    videoState: { ...room.videoState },
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Creates a new room and assigns the calling socket as host.
 *
 * @param {import('ws').WebSocket} ws  - Host's WebSocket connection
 * @param {string}                 userName
 * @returns {{ userId: string, role: string, code: string, roomState: PublicRoomState }}
 */
function createRoom(ws, userName) {
  const code   = generateRoomCode();
  const userId = generateUserId();

  /** @type {Room} */
  const room = {
    code,
    hostId: userId,
    participants: new Map([[userId, { ws, name: userName, role: ROLES.HOST }]]),
    videoState: {
      videoId:   null,
      position:  0,
      playing:   false,
      updatedAt: Date.now(),
    },
    createdAt: Date.now(),
  };

  rooms.set(code, room);

  // Attach session info to the socket for O(1) lookups on message/close
  ws.userId   = userId;
  ws.roomCode = code;

  logger.info('RoomManager', `Room created  code=${code}  host="${userName}" (${userId})`);
  return { userId, role: ROLES.HOST, code, roomState: buildPublicState(room) };
}

/**
 * Adds a participant to an existing room.
 * The new participant is given the 'participant' role by default.
 *
 * @param {import('ws').WebSocket} ws
 * @param {string}                 roomCode
 * @param {string}                 userName
 * @returns {{ userId, role, code, roomState } | { error: string }}
 */
function joinRoom(ws, roomCode, userName) {
  const room = rooms.get(roomCode);
  if (!room) {
    return { error: `Room "${roomCode}" not found. Check the code and try again.` };
  }

  const userId = generateUserId();
  room.participants.set(userId, { ws, name: userName, role: ROLES.PARTICIPANT });

  ws.userId   = userId;
  ws.roomCode = roomCode;

  logger.info('RoomManager', `User joined   code=${roomCode}  user="${userName}" (${userId})`);
  return { userId, role: ROLES.PARTICIPANT, code: roomCode, roomState: buildPublicState(room) };
}

/**
 * Removes a participant from their room, handling two special cases:
 *  1. Room is now empty → destroy it.
 *  2. The host left → promote the next oldest participant to host.
 *
 * @param {string} roomCode
 * @param {string} userId
 * @returns {{
 *   leftUserId: string,
 *   destroyed?:  boolean,
 *   newHostId?:  string,
 *   newHostName?: string,
 * } | null}
 */
function leaveRoom(roomCode, userId) {
  const room = rooms.get(roomCode);
  if (!room) return null;

  const leaving = room.participants.get(userId);
  room.participants.delete(userId);

  logger.info('RoomManager', `User left     code=${roomCode}  user="${leaving?.name ?? 'unknown'}" (${userId})`);

  // Empty room — destroy it
  if (room.participants.size === 0) {
    rooms.delete(roomCode);
    logger.info('RoomManager', `Room destroyed  code=${roomCode}  (empty)`);
    return { leftUserId: userId, destroyed: true };
  }

  // Host left — promote the next participant in insertion order
  if (room.hostId === userId) {
    const [newHostId, newHost] = room.participants.entries().next().value;
    room.hostId  = newHostId;
    newHost.role = ROLES.HOST;
    logger.info('RoomManager', `Host promoted  code=${roomCode}  new host="${newHost.name}" (${newHostId})`);
    return { leftUserId: userId, newHostId, newHostName: newHost.name };
  }

  return { leftUserId: userId };
}

// ─── Getters ──────────────────────────────────────────────────────────────────

/**
 * Retrieves a room by code. Returns undefined if not found.
 * @param {string} roomCode
 * @returns {Room | undefined}
 */
function getRoom(roomCode) {
  return rooms.get(roomCode);
}

/**
 * Retrieves a single participant from a room.
 * @param {string} roomCode
 * @param {string} userId
 * @returns {Participant | undefined}
 */
function getParticipant(roomCode, userId) {
  return rooms.get(roomCode)?.participants.get(userId);
}

// ─── Mutators ─────────────────────────────────────────────────────────────────

/**
 * Merges a partial update into the room's video state and stamps updatedAt.
 *
 * @param {string}              roomCode
 * @param {Partial<VideoState>} patch
 * @returns {VideoState | null}  Updated (cloned) video state, or null if room not found.
 */
function updateVideoState(roomCode, patch) {
  const room = rooms.get(roomCode);
  if (!room) return null;
  Object.assign(room.videoState, patch, { updatedAt: Date.now() });
  return { ...room.videoState };
}

/**
 * Changes a participant's role.
 * Does NOT allow setting 'host' — use transferHost() for that.
 *
 * @param {string} roomCode
 * @param {string} targetUserId
 * @param {'moderator'|'participant'|'viewer'} newRole
 * @returns {boolean}  true on success, false if room/user not found.
 */
function assignRole(roomCode, targetUserId, newRole) {
  const room = rooms.get(roomCode);
  if (!room) return false;
  const participant = room.participants.get(targetUserId);
  if (!participant) return false;
  participant.role = newRole;
  return true;
}

/**
 * Transfers host ownership from currentHostId to newHostId.
 * Old host is demoted to 'participant'. New host is promoted to 'host'.
 *
 * @param {string} roomCode
 * @param {string} currentHostId
 * @param {string} newHostId
 * @returns {boolean}
 */
function transferHost(roomCode, currentHostId, newHostId) {
  const room = rooms.get(roomCode);
  if (!room || room.hostId !== currentHostId) return false;

  const oldHost = room.participants.get(currentHostId);
  const newHost = room.participants.get(newHostId);
  if (!oldHost || !newHost) return false;

  oldHost.role = ROLES.PARTICIPANT;
  newHost.role = ROLES.HOST;
  room.hostId  = newHostId;

  logger.info('RoomManager', `Host transferred  code=${roomCode}  from=${currentHostId}  to=${newHostId}`);
  return true;
}

// ─── Debug / stats ────────────────────────────────────────────────────────────

/**
 * Returns a public (no WS refs) snapshot of a room for HTTP API / debugging.
 * @param {string} roomCode
 * @returns {PublicRoomState | null}
 */
function getRoomSummary(roomCode) {
  const room = rooms.get(roomCode);
  return room ? buildPublicState(room) : null;
}

/** @returns {number} Total number of active rooms. */
function getRoomCount() {
  return rooms.size;
}

/** @returns {number} Total connected participants across all rooms. */
function getTotalParticipants() {
  let total = 0;
  for (const room of rooms.values()) total += room.participants.size;
  return total;
}

module.exports = {
  createRoom,
  joinRoom,
  leaveRoom,
  getRoom,
  getParticipant,
  updateVideoState,
  assignRole,
  transferHost,
  getRoomSummary,
  getRoomCount,
  getTotalParticipants,
};
