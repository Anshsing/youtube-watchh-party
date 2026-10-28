/**
 * core/RoleManager.js
 *
 * The role-based permission engine.
 *
 * This module is the single authoritative source for answering "can this role
 * do this action?" — all permission checks across the codebase funnel through
 * here. It is a pure module (no I/O, no side effects) and is fully testable
 * in isolation.
 *
 * Role hierarchy (highest → lowest authority):
 *   host (4) > moderator (3) > participant (2) > viewer (1)
 *
 * Permission matrix:
 *   Action          | host | moderator | participant | viewer
 *   ─────────────── | ─────| ──────────| ────────────| ──────
 *   play            |  ✅  |    ✅     |     ❌      |   ❌
 *   pause           |  ✅  |    ✅     |     ❌      |   ❌
 *   seek            |  ✅  |    ✅     |     ❌      |   ❌
 *   change_video    |  ✅  |    ✅     |     ❌      |   ❌
 *   assign_role     |  ✅  |    ❌     |     ❌      |   ❌
 *   kick            |  ✅  |    ❌     |     ❌      |   ❌
 *   transfer_host   |  ✅  |    ❌     |     ❌      |   ❌
 */

'use strict';

const {
  ROLES,
  ROLE_LEVELS,
  PERMISSIONS,
  ASSIGNABLE_ROLES,
} = require('../config/constants');

// ─── Core permission check ────────────────────────────────────────────────────

/**
 * Returns true if the given role is allowed to perform the specified action.
 *
 * @param {string} role        - The participant's current role
 * @param {string} permission  - A PERMISSIONS key (e.g. 'PLAY', 'KICK')
 * @returns {boolean}
 *
 * @example
 *   hasPermission('moderator', 'PLAY')   // true
 *   hasPermission('moderator', 'KICK')   // false
 *   hasPermission('host', 'ASSIGN_ROLE') // true
 */
function hasPermission(role, permission) {
  const allowed = PERMISSIONS[permission];
  if (!Array.isArray(allowed)) return false;
  return allowed.includes(role);
}

// ─── Role comparisons ─────────────────────────────────────────────────────────

/**
 * Returns true if role1 has strictly higher authority than role2.
 * Useful for preventing lower-privilege roles from acting on higher ones.
 *
 * @param {string} role1
 * @param {string} role2
 * @returns {boolean}
 *
 * @example
 *   isHigherThan('host', 'moderator')   // true
 *   isHigherThan('moderator', 'host')   // false
 *   isHigherThan('moderator', 'moderator') // false
 */
function isHigherThan(role1, role2) {
  return (ROLE_LEVELS[role1] ?? 0) > (ROLE_LEVELS[role2] ?? 0);
}

/**
 * Returns true if role1 has equal or higher authority than role2.
 *
 * @param {string} role1
 * @param {string} role2
 * @returns {boolean}
 */
function isHigherOrEqual(role1, role2) {
  return (ROLE_LEVELS[role1] ?? 0) >= (ROLE_LEVELS[role2] ?? 0);
}

/**
 * Returns the numeric authority level for a role.
 * Higher = more privilege.
 *
 * @param {string} role
 * @returns {number}
 */
function getRoleLevel(role) {
  return ROLE_LEVELS[role] ?? 0;
}

// ─── Role validation ──────────────────────────────────────────────────────────

/**
 * Returns true if the role string is a valid, known role.
 *
 * @param {string} role
 * @returns {boolean}
 */
function isValidRole(role) {
  return Object.values(ROLES).includes(role);
}

/**
 * Returns true if the role can be manually assigned by a host.
 * 'host' is excluded — it is only set via createRoom() or transferHost().
 *
 * @param {string} role
 * @returns {boolean}
 */
function isAssignable(role) {
  return ASSIGNABLE_ROLES.includes(role);
}

// ─── Display helpers ──────────────────────────────────────────────────────────

/**
 * Returns a display-friendly label for a role.
 *
 * @param {string} role
 * @returns {string}
 */
function getRoleLabel(role) {
  const labels = {
    [ROLES.HOST]:        'Host',
    [ROLES.MODERATOR]:   'Moderator',
    [ROLES.PARTICIPANT]: 'Participant',
    [ROLES.VIEWER]:      'Viewer',
  };
  return labels[role] ?? role;
}

/**
 * Returns all permissions granted to a role as an array of permission keys.
 *
 * @param {string} role
 * @returns {string[]}
 *
 * @example
 *   getGrantedPermissions('moderator')
 *   // ['PLAY', 'PAUSE', 'SEEK', 'CHANGE_VIDEO']
 */
function getGrantedPermissions(role) {
  return Object.entries(PERMISSIONS)
    .filter(([, allowedRoles]) => allowedRoles.includes(role))
    .map(([key]) => key);
}

module.exports = {
  hasPermission,
  isHigherThan,
  isHigherOrEqual,
  getRoleLevel,
  isValidRole,
  isAssignable,
  getRoleLabel,
  getGrantedPermissions,
  // Re-export constants for convenience
  ROLES,
  ASSIGNABLE_ROLES,
};
