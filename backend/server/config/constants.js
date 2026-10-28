/**
 * config/constants.js
 *
 * Single source of truth for all application-wide constants.
 * Import from here instead of using raw strings anywhere in the codebase.
 */

'use strict';

// ─── Roles ────────────────────────────────────────────────────────────────────

/**
 * All valid participant roles.
 * - host:        Auto-assigned to the room creator. Full control.
 * - moderator:   Assigned by host. Can control playback.
 * - participant: Default for joiners. Watch-only.
 * - viewer:      Alias for participant. Semantically "read-only" viewer.
 */
const ROLES = Object.freeze({
  HOST:        'host',
  MODERATOR:   'moderator',
  PARTICIPANT: 'participant',
  VIEWER:      'viewer',
});

/**
 * Authority hierarchy. Higher number = more privilege.
 * Used to compare role authority (e.g. a moderator cannot kick a host).
 */
const ROLE_LEVELS = Object.freeze({
  [ROLES.HOST]:        4,
  [ROLES.MODERATOR]:   3,
  [ROLES.PARTICIPANT]: 2,
  [ROLES.VIEWER]:      1,
});

/**
 * Roles that the host can manually assign.
 * 'host' is excluded — it is only set via createRoom() or transferHost().
 */
const ASSIGNABLE_ROLES = Object.freeze([
  ROLES.MODERATOR,
  ROLES.PARTICIPANT,
  ROLES.VIEWER,
]);

// ─── Permissions ──────────────────────────────────────────────────────────────

/**
 * Permission → allowed roles mapping.
 * Every action that requires a privilege check has an entry here.
 */
const PERMISSIONS = Object.freeze({
  PLAY:          [ROLES.HOST, ROLES.MODERATOR],
  PAUSE:         [ROLES.HOST, ROLES.MODERATOR],
  SEEK:          [ROLES.HOST, ROLES.MODERATOR],
  CHANGE_VIDEO:  [ROLES.HOST, ROLES.MODERATOR],
  ASSIGN_ROLE:   [ROLES.HOST],
  KICK:          [ROLES.HOST],
  TRANSFER_HOST: [ROLES.HOST],
});

// ─── WebSocket Event Types ────────────────────────────────────────────────────

/** Messages the client sends TO the server. */
const CLIENT_EVENTS = Object.freeze({
  CREATE:        'create',
  JOIN:          'join',
  PLAY:          'play',
  PAUSE:         'pause',
  SEEK:          'seek',
  CHANGE_VIDEO:  'change_video',
  ASSIGN_ROLE:   'assign_role',
  KICK:          'kick',
  TRANSFER_HOST: 'transfer_host',
  PING:          'ping',
});

/** Messages the server sends TO clients. */
const SERVER_EVENTS = Object.freeze({
  CREATED:          'created',
  JOINED:           'joined',
  SYNC:             'sync',
  USER_JOINED:      'user_joined',
  USER_LEFT:        'user_left',
  ROLE_ASSIGNED:    'role_assigned',
  HOST_TRANSFERRED: 'host_transferred',
  KICKED:           'kicked',
  PONG:             'pong',
  ERROR:            'error',
});

// ─── WebSocket Close Codes ────────────────────────────────────────────────────

const WS_CODES = Object.freeze({
  NORMAL: 1000,  // Clean close
  KICKED: 4001,  // Kicked by host (custom application code)
});

// ─── Misc ─────────────────────────────────────────────────────────────────────

const ROOM_CODE_LENGTH = 6;
const HEARTBEAT_INTERVAL_MS = 30_000;
const DEFAULT_PORT = 3000;

module.exports = {
  ROLES,
  ROLE_LEVELS,
  ASSIGNABLE_ROLES,
  PERMISSIONS,
  CLIENT_EVENTS,
  SERVER_EVENTS,
  WS_CODES,
  ROOM_CODE_LENGTH,
  HEARTBEAT_INTERVAL_MS,
  DEFAULT_PORT,
};
