/**
 * middleware/permissions.js
 *
 * Higher-order function that wraps a handler with a permission guard.
 * This keeps permission checks out of business-logic handlers, following
 * the single-responsibility principle.
 *
 * Usage:
 *   const handlePlay = withPermission('PLAY', (ws, room, participant, payload) => {
 *     // Only reached if participant.role has PLAY permission
 *   });
 *
 * The wrapped function has the same signature as a raw handler:
 *   (ws, room, participant, payload) => void
 */

'use strict';

const { hasPermission, getRoleLabel } = require('../core/RoleManager');
const { sendError } = require('../utils/ws');

/**
 * Wraps a handler function with a role-based permission guard.
 * If the participant's role lacks the required permission, an error is sent
 * and the inner handler is never called.
 *
 * @param {string}   permissionKey - A PERMISSIONS key from constants (e.g. 'PLAY', 'KICK')
 * @param {Function} handler       - The actual business logic: (ws, room, participant, payload) => void
 * @returns {Function}             - A guarded function with the same signature
 */
function withPermission(permissionKey, handler) {
  return function guardedHandler(ws, room, participant, payload) {
    if (!hasPermission(participant.role, permissionKey)) {
      const roleLabel = getRoleLabel(participant.role);
      sendError(
        ws,
        `Permission denied: "${roleLabel}" cannot perform "${permissionKey.toLowerCase()}".`
      );
      return;
    }
    handler(ws, room, participant, payload);
  };
}

module.exports = { withPermission };
