/**
 * js/socket.js
 *
 * Typed WebSocket client with an event-emitter interface.
 *
 * Usage:
 *   const socket = new WatchPartySocket('ws://localhost:3000');
 *   socket.on('sync', payload => { ... });
 *   await socket.connect();
 *   socket.send('play', { position: 42.5 });
 */

'use strict';

class WatchPartySocket {
  /** @param {string} url - WebSocket server URL (ws:// or wss://) */
  constructor(url) {
    this.url       = url;
    this.ws        = null;
    this._handlers = {};  // type → callback[]
  }

  // ─── Connection ────────────────────────────────────────────────────────────

  /**
   * Opens the WebSocket connection.
   * @returns {Promise<WatchPartySocket>}
   */
  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.onopen    = () => resolve(this);
      this.ws.onerror   = () => reject(new Error('WebSocket connection failed'));

      this.ws.onmessage = ({ data }) => {
        let msg;
        try { msg = JSON.parse(data); } catch { return; }
        (this._handlers[msg.type] || []).forEach(fn => fn(msg.payload));
        (this._handlers['*']      || []).forEach(fn => fn(msg));
      };

      this.ws.onclose = (e) => {
        (this._handlers['close'] || []).forEach(fn => fn(e));
      };
    });
  }

  disconnect() { this.ws?.close(); }

  // ─── Messaging ─────────────────────────────────────────────────────────────

  /**
   * Sends a typed message to the server.
   * @param {string} type
   * @param {object} [payload={}]
   */
  send(type, payload = {}) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    } else {
      console.warn('[Socket] Cannot send — not connected:', type);
    }
  }

  // ─── Event Emitter ─────────────────────────────────────────────────────────

  /**
   * Registers a handler for a message type.
   * Use '*' to receive every message.
   * Returns `this` for chaining.
   *
   * @param {string}   type
   * @param {Function} callback
   * @returns {WatchPartySocket}
   */
  on(type, callback) {
    (this._handlers[type] ??= []).push(callback);
    return this;
  }

  off(type, callback) {
    if (this._handlers[type])
      this._handlers[type] = this._handlers[type].filter(fn => fn !== callback);
    return this;
  }

  get connected() { return this.ws?.readyState === WebSocket.OPEN; }
}
