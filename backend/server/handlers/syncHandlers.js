/**
 * handlers/syncHandlers.js
 *
 * Handles playback synchronization WebSocket messages:
 *   play         — Start playback at a given position
 *   pause        — Pause playback at a given position
 *   seek         — Jump to a specific position (preserves playing state)
 *   change_video — Load a new YouTube video (resets position to 0, paused)
 *
 * All handlers are wrapped with withPermission() so they only execute if
 * the sender's role is allowed. Permission failures are handled automatically.
 *
 * Sync event payload sent to ALL clients (including sender):
 *   {
 *     action:     'play' | 'pause' | 'seek' | 'change_video'
 *     position:   number   — seconds from start
 *     playing:    boolean
 *     videoId?:   string   — only on change_video
 *     serverTime: number   — Unix ms when server processed the event
 *                            Clients use this for drift correction:
 *                            clientPosition = position + (Date.now() - serverTime) / 1000
 *   }
 */

'use strict';

const RoomManager = require('../core/RoomManager');
const { broadcast, sendError } = require('../utils/ws');
const { withPermission } = require('../middleware/permissions');
const { SERVER_EVENTS } = require('../config/constants');

/**
 * Handles: { type: 'play', payload: { position } }
 * Permission: PLAY (host | moderator)
 */
const handlePlay = withPermission('PLAY', (ws, room, _participant, payload) => {
  const position = typeof payload?.position === 'number' ? payload.position : 0;
  const state    = RoomManager.updateVideoState(ws.roomCode, { playing: true, position });

  broadcast(room, SERVER_EVENTS.SYNC, {
    action:     'play',
    position:   state.position,
    playing:    true,
    serverTime: state.updatedAt,
  });
});

/**
 * Handles: { type: 'pause', payload: { position } }
 * Permission: PAUSE (host | moderator)
 */
const handlePause = withPermission('PAUSE', (ws, room, _participant, payload) => {
  const position = typeof payload?.position === 'number' ? payload.position : 0;
  const state    = RoomManager.updateVideoState(ws.roomCode, { playing: false, position });

  broadcast(room, SERVER_EVENTS.SYNC, {
    action:     'pause',
    position:   state.position,
    playing:    false,
    serverTime: state.updatedAt,
  });
});

/**
 * Handles: { type: 'seek', payload: { position } }
 * Permission: SEEK (host | moderator)
 *
 * Seek does NOT change the playing flag — it only moves the cursor.
 * Clients receive the current playing state in the sync payload.
 */
const handleSeek = withPermission('SEEK', (ws, room, _participant, payload) => {
  if (typeof payload?.position !== 'number') {
    return sendError(ws, 'payload.position (number) is required for seek.');
  }
  const state = RoomManager.updateVideoState(ws.roomCode, { position: payload.position });

  broadcast(room, SERVER_EVENTS.SYNC, {
    action:     'seek',
    position:   state.position,
    playing:    state.playing,
    serverTime: state.updatedAt,
  });
});

/**
 * Handles: { type: 'change_video', payload: { videoId } }
 * Permission: CHANGE_VIDEO (host | moderator)
 *
 * videoId must be the 11-character YouTube video ID, NOT a full URL.
 * The client is responsible for extracting the ID before sending.
 * Position resets to 0 and playing resets to false on video change.
 */
const handleChangeVideo = withPermission('CHANGE_VIDEO', (ws, room, _participant, payload) => {
  const videoId = payload?.videoId?.trim();
  if (!videoId) return sendError(ws, 'payload.videoId (YouTube video ID) is required.');

  const state = RoomManager.updateVideoState(ws.roomCode, {
    videoId,
    position: 0,
    playing:  false,
  });

  broadcast(room, SERVER_EVENTS.SYNC, {
    action:     'change_video',
    videoId:    state.videoId,
    position:   0,
    playing:    false,
    serverTime: state.updatedAt,
  });
});

module.exports = { handlePlay, handlePause, handleSeek, handleChangeVideo };
