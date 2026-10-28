/**
 * js/config.js
 *
 * WatchParty Frontend Configuration
 *
 * ─── Deployment (Vercel frontend + Render backend) ────────────────────────────
 *
 *  After deploying the backend to Render, set WS_URL below to:
 *    'wss://your-app-name.onrender.com'
 *
 *  LOCAL DEVELOPMENT (default):
 *    Leave WS_URL as null — auto-connects to ws://localhost:3000
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

const WATCH_PARTY_CONFIG = {
  /**
   * Backend WebSocket URL.
   *
   * ⚠️  CHANGE THIS before deploying to Vercel:
   *     'wss://your-render-backend-name.onrender.com'
   *
   * null = auto-detect from window.location (local dev only).
   * @type {string|null}
   */
  WS_URL: null,
};
