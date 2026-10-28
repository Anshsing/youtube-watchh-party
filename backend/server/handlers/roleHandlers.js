/**
 * handlers/roleHandlers.js
 *
 * Handles role management and participant control WebSocket messages:
 *   assign_role   — Host assigns a role to another participant
 *   kick          — Host removes a participant from the room
 *   transfer_host — Host voluntarily transfers ownership to another participant
 *
 * All handlers are wrapped with withPermission() — only host-role sockets
 * can trigger these actions. Others receive a permission-denied error.
 */

'use strict';

const RoomManager = require('../core/RoomManager');
const { send, sendError, broadcast } = require('../utils/ws');
const { withPermission } = require('../middleware/permissions');
const { isAssignable, getRoleLabel } = require('../core/RoleManager');
const { SERVER_EVENTS, ASSIGNABLE_ROLES, WS_CODES } = require('../config/constants');
const logger = require('../utils/logger');

/**
 * Handles: { type: 'assign_role', payload: { userId, role } }
 * Permission: ASSIGN_ROLE (host only)
 *
 * Assignable roles: moderator | participant | viewer
 * The 'host' role is NOT assignable here; use transfer_host instead.
 *
 * Broadcasting role_assigned to ALL room members (not just host + target)
 * allows all clients to update their participant list UI.
 */
const handleAssignRole = withPermission('ASSIGN_ROLE', (ws, room, _participant, payload) => {
  const { userId: targetId, role: newRole } = payload ?? {};

  if (!targetId) return sendError(ws, 'payload.userId is required.');
  if (targetId === ws.userId) return sendError(ws, 'You cannot change your own role.');

  if (!isAssignable(newRole)) {
    return sendError(
      ws,
      `Invalid role "${newRole}". Assignable roles: ${ASSIGNABLE_ROLES.join(', ')}.`
    );
  }

  const target = RoomManager.getParticipant(ws.roomCode, targetId);
  if (!target) return sendError(ws, 'Target user not found in this room.');

  const success = RoomManager.assignRole(ws.roomCode, targetId, newRole);
  if (!success) return sendError(ws, 'Failed to assign role. Please try again.');

  broadcast(room, SERVER_EVENTS.ROLE_ASSIGNED, {
    userId:     targetId,
    name:       target.name,
    role:       newRole,
    assignedBy: ws.userId,
  });

  logger.info('RoleHandler', `Role assigned  user="${target.name}" → ${newRole}  by=${ws.userId}`);
});

/**
 * Handles: { type: 'kick', payload: { userId } }
 * Permission: KICK (host only)
 *
 * Kick flow:
 *  1. Send 'kicked' event directly to the target (before close, so they know why)
 *  2. Broadcast 'user_left' with reason='kicked' to all other participants
 *  3. Force-close the target's WebSocket with the KICKED close code
 *  4. The target's 'close' event triggers handleDisconnect in wsRouter,
 *     which calls leaveRoom() — we skip the normal user_left broadcast there
 *     by the fact that the room already got it here.
 *
 * NOTE: The disconnect handler will fire again for the kicked user; the
 * broadcast(user_left) there is redundant but harmless since it excludes
 * any subsequent duplicate userId sends.
 */
const handleKick = withPermission('KICK', (ws, room, _participant, payload) => {
  const { userId: targetId } = payload ?? {};

  if (!targetId)              return sendError(ws, 'payload.userId is required.');
  if (targetId === ws.userId) return sendError(ws, 'You cannot kick yourself.');

  const target = RoomManager.getParticipant(ws.roomCode, targetId);
  if (!target) return sendError(ws, 'Target user not found in this room.');

  // Inform the kicked user before terminating their connection
  send(target.ws, SERVER_EVENTS.KICKED, { by: ws.userId });

  // Notify all remaining room members
  broadcast(room, SERVER_EVENTS.USER_LEFT, { userId: targetId, reason: 'kicked' }, targetId);

  // Force disconnect with a custom close code
  target.ws.close(WS_CODES.KICKED, 'Kicked from room');

  logger.info('RoleHandler', `Kicked  user="${target.name}" (${targetId})  by=${ws.userId}`);
});

/**
 * Handles: { type: 'transfer_host', payload: { userId } }
 * Permission: TRANSFER_HOST (host only)
 *
 * Transfers host ownership. The old host becomes a participant.
 * Broadcasts host_transferred to ALL room members so every client
 * can update its UI (e.g. show/hide playback controls).
 */
const handleTransferHost = withPermission('TRANSFER_HOST', (ws, room, _participant, payload) => {
  const { userId: newHostId } = payload ?? {};

  if (!newHostId)              return sendError(ws, 'payload.userId is required.');
  if (newHostId === ws.userId) return sendError(ws, 'You are already the host.');

  const newHost = RoomManager.getParticipant(ws.roomCode, newHostId);
  if (!newHost) return sendError(ws, 'Target user not found in this room.');

  const success = RoomManager.transferHost(ws.roomCode, ws.userId, newHostId);
  if (!success) return sendError(ws, 'Host transfer failed. Please try again.');

  broadcast(room, SERVER_EVENTS.HOST_TRANSFERRED, {
    fromUserId: ws.userId,
    toUserId:   newHostId,
    toName:     newHost.name,
  });

  logger.info('RoleHandler', `Host transferred  from=${ws.userId}  to="${newHost.name}" (${newHostId})`);
});

module.exports = { handleAssignRole, handleKick, handleTransferHost };
