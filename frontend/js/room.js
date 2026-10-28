'use strict';

// ─── State ────────────────────────────────────────────────────────────────────

const state = {
  userId:       null,
  role:         null,
  roomCode:     null,
  userName:     null,
  participants: new Map(),
  playerReady:  false,
  pendingSync:  null,
  seekDragging: false,
};

let socket     = null;
let ytPlayer   = null;
let ctxTarget  = null;
let progressId = null;

// DOM element references — populated in init()
const el = {};

// ─── Permission helpers ───────────────────────────────────────────────────────

const canControl = () => state.role === 'host' || state.role === 'moderator';
const isHost     = () => state.role === 'host';

// ─── Utilities ────────────────────────────────────────────────────────────────

function fmt(sec) {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function extractVideoId(str) {
  str = (str || '').trim();
  // Raw 11-char ID passed directly
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) return str;
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = str.match(re);
    if (m) return m[1];
  }
  return null;
}

function initials(name) {
  return name.trim().slice(0, 2).toUpperCase();
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function toast(msg, type = 'info', ms = 3500) {
  const icons = { success: '✅', error: '❌', info: '💬', warning: '⚠️' };
  const div = document.createElement('div');
  div.className = `toast toast-${type}`;
  div.innerHTML = `
    <span class="toast-icon">${icons[type] ?? '💬'}</span>
    <span class="toast-message">${esc(msg)}</span>
  `;
  el.toastContainer.appendChild(div);
  setTimeout(() => {
    div.classList.add('hide');
    setTimeout(() => div.remove(), 320);
  }, ms);
}

// ─── Connection status ────────────────────────────────────────────────────────

function setConnStatus(status) {
  el.connDot.className = `status-dot status-${status}`;
  const labels = { connected: 'Connected', connecting: 'Connecting…', disconnected: 'Disconnected' };
  el.connDot.title = labels[status] || status;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  // Cache DOM refs
  el.toastContainer   = document.getElementById('toast-container');
  el.connDot          = document.getElementById('conn-dot');
  el.roomCodeBtn      = document.getElementById('room-code-btn');
  el.roomCodeText     = document.getElementById('room-code-text');
  el.viewerCount      = document.getElementById('viewer-count');
  el.myRoleBadge      = document.getElementById('my-role-badge');
  el.playerOuter      = document.getElementById('player-outer');
  el.playerLoading    = document.getElementById('player-loading');
  el.noVideo          = document.getElementById('no-video');
  el.noVideoHint      = document.getElementById('no-video-hint');
  el.playerOverlay    = document.getElementById('player-overlay');
  el.videoUrlSection  = document.getElementById('video-url-section');
  el.videoUrlInput    = document.getElementById('video-url-input');
  el.loadVideoBtn     = document.getElementById('load-video-btn');
  el.playBtn          = document.getElementById('play-btn');
  el.pauseBtn         = document.getElementById('pause-btn');
  el.seekBar          = document.getElementById('seek-bar');
  el.currentTime      = document.getElementById('current-time');
  el.totalTime        = document.getElementById('total-time');
  el.viewerNotice     = document.getElementById('viewer-notice');
  el.participantsList = document.getElementById('participants-list');
  el.participantCount = document.getElementById('participant-count');
  el.ctxMenu          = document.getElementById('ctx-menu');
  el.ctxName          = document.getElementById('ctx-name');

  // Read URL params
  const params   = new URLSearchParams(location.search);
  const action   = params.get('action');
  const codeParam = params.get('code')?.trim().toUpperCase();

  // Name is stored by the landing page before redirecting here
  state.userName = sessionStorage.getItem('wpName');
  if (!state.userName) {
    // If someone navigates directly to /room.html without going via landing,
    // send them back so they can enter their name.
    window.location.href = codeParam ? `/?code=${codeParam}` : '/';
    return;
  }

  // Determine what we're doing before connecting
  const isCreating = action === 'create';
  const isJoining  = !isCreating && !!codeParam;

  if (!isCreating && !isJoining) {
    window.location.href = '/';
    return;
  }

  // Initialise the YouTube player early — it loads an async script so
  // starting it now means it'll likely be ready by the time we need it.
  ytPlayer = new YouTubePlayer({
    containerId: 'yt-player',
    onReady:  onPlayerReady,
    onPlay:   onPlayerPlay,
    onPause:  onPlayerPause,
  });
  ytPlayer.init();

  // Connect WebSocket
  const wsUrl =
    (typeof WATCH_PARTY_CONFIG !== 'undefined' && WATCH_PARTY_CONFIG.WS_URL) ||
    `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;

  setConnStatus('connecting');
  socket = new WatchPartySocket(wsUrl);

  socket
    .on('created',          onCreated)
    .on('joined',           onJoined)
    .on('sync',             onSync)
    .on('user_joined',      onUserJoined)
    .on('user_left',        onUserLeft)
    .on('role_assigned',    onRoleAssigned)
    .on('host_transferred', onHostTransferred)
    .on('kicked',           onKicked)
    .on('error',            onServerError)
    .on('close',            onDisconnected);

  try {
    await socket.connect();
    setConnStatus('connected');
  } catch {
    setConnStatus('disconnected');
    toast('Could not connect to the server. Please try again.', 'error', 7000);
    return;
  }

  // Send the first message
  if (isCreating) {
    socket.send('create', { userName: state.userName });
  } else {
    socket.send('join', { roomCode: codeParam, userName: state.userName });
  }

  setupUIEvents();

  // Update the seek bar 4 times per second while playing
  progressId = setInterval(updateProgress, 250);
}

// ─── Server event handlers ────────────────────────────────────────────────────

function onCreated(payload) {
  state.userId   = payload.userId;
  state.role     = payload.role;
  state.roomCode = payload.code;

  // Update the URL so the room code is visible and shareable
  const url = new URL(location.href);
  url.searchParams.set('code', payload.code);
  url.searchParams.delete('action');
  history.replaceState({}, '', url);

  applyRoomState(payload.roomState);
  toast('Room created! Share the code to invite friends 🎉', 'success');
}

function onJoined(payload) {
  state.userId   = payload.userId;
  state.role     = payload.role;
  state.roomCode = payload.code;
  applyRoomState(payload.roomState);
  toast(`Joined room ${payload.code}`, 'success');
}

// Apply a full room snapshot — used on create/join to build initial UI
function applyRoomState(rs) {
  state.participants.clear();
  (rs.participants || []).forEach(p => {
    state.participants.set(p.userId, { name: p.name, role: p.role });
  });

  updateRoomCode(rs.code);
  updateRoleUI();
  renderParticipants();

  // If a video was already playing when we joined, queue a sync
  const { videoId, position, playing, updatedAt } = rs.videoState || {};
  if (videoId) {
    const syncPayload = {
      action: 'change_video',
      videoId,
      position: position || 0,
      playing:  !!playing,
      serverTime: updatedAt,
    };
    if (state.playerReady) applySync(syncPayload);
    else state.pendingSync = syncPayload;
  }
}

function onSync(payload) {
  if (state.playerReady) applySync(payload);
  else state.pendingSync = payload;
}

function onUserJoined(payload) {
  state.participants.set(payload.userId, { name: payload.name, role: payload.role });
  renderParticipants();
  toast(`${payload.name} joined the room`, 'info');
}

function onUserLeft(payload) {
  const p = state.participants.get(payload.userId);
  if (p) toast(`${p.name} left the room`, 'info');
  state.participants.delete(payload.userId);
  renderParticipants();
}

function onRoleAssigned(payload) {
  const p = state.participants.get(payload.userId);
  if (p) p.role = payload.role;

  if (payload.userId === state.userId) {
    state.role = payload.role;
    updateRoleUI();
    toast(`Your role is now: ${payload.role}`, 'info');
  } else {
    toast(`${p?.name ?? 'Someone'} is now a ${payload.role}`, 'info');
  }
  renderParticipants();
}

function onHostTransferred(payload) {
  const fromP = state.participants.get(payload.fromUserId);
  const toP   = state.participants.get(payload.toUserId);
  if (fromP) fromP.role = 'participant';
  if (toP)   toP.role   = 'host';

  if (payload.toUserId === state.userId) {
    state.role = 'host';
    updateRoleUI();
    toast('You are now the host! 👑', 'success');
  } else if (payload.fromUserId === state.userId) {
    state.role = 'participant';
    updateRoleUI();
    const reason = payload.reason === 'host_disconnected' ? ' (previous host left)' : '';
    toast(`${payload.toName ?? toP?.name ?? 'Someone'} is now the host${reason}`, 'info');
  } else {
    toast(`${payload.toName ?? toP?.name ?? 'Someone'} is now the host`, 'info');
  }
  renderParticipants();
}

function onKicked() {
  clearInterval(progressId);
  toast('You have been removed from this room.', 'error', 5000);
  setTimeout(() => { window.location.href = '/?kicked=1'; }, 2500);
}

function onServerError(payload) {
  toast(payload?.message ?? 'Something went wrong', 'error');
}

function onDisconnected() {
  setConnStatus('disconnected');
  toast('Disconnected from server', 'error');
}

// ─── YouTube player callbacks ─────────────────────────────────────────────────

function onPlayerReady() {
  state.playerReady = true;
  el.playerLoading.classList.add('hidden');
  if (state.pendingSync) {
    applySync(state.pendingSync);
    state.pendingSync = null;
  }
}

function onPlayerPlay(currentTime) {
  if (canControl()) socket.send('play', { position: currentTime });
}

function onPlayerPause(currentTime) {
  if (canControl()) socket.send('pause', { position: currentTime });
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

function applySync(payload) {
  const { action, videoId, position = 0, playing, serverTime } = payload;

  // Drift correction: if the video should be playing, account for
  // the time that passed while this message was in transit
  let targetPos = position;
  if (playing && serverTime) {
    targetPos = position + (Date.now() - serverTime) / 1000;
  }

  switch (action) {
    case 'change_video':
      el.noVideo.classList.add('hidden');
      ytPlayer.loadVideo(videoId);
      setTimeout(() => {
        if (playing) { ytPlayer.seekTo(targetPos); ytPlayer.play(); }
        else         { ytPlayer.seekTo(position); }
      }, 1200);
      break;

    case 'play':
      if (!ytPlayer.hasVideo()) { state.pendingSync = payload; return; }
      ytPlayer.seekTo(targetPos);
      ytPlayer.play();
      break;

    case 'pause':
      if (!ytPlayer.hasVideo()) return;
      ytPlayer.seekTo(position);
      ytPlayer.pause();
      break;

    case 'seek':
      if (!ytPlayer.hasVideo()) return;
      ytPlayer.seekTo(targetPos);
      break;
  }
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function updateProgress() {
  if (!state.playerReady || state.seekDragging) return;
  const cur = ytPlayer.getCurrentTime();
  const dur = ytPlayer.getDuration();
  if (!isFinite(cur) || !isFinite(dur) || dur <= 0) return;

  el.seekBar.max   = dur;
  el.seekBar.value = cur;
  el.currentTime.textContent = fmt(cur);
  el.totalTime.textContent   = fmt(dur);
}

// ─── UI events ────────────────────────────────────────────────────────────────

function setupUIEvents() {
  // Copy invite link to clipboard
  el.roomCodeBtn.addEventListener('click', () => {
    const link = `${location.origin}/room.html?code=${state.roomCode}`;
    navigator.clipboard?.writeText(link)
      .then(() => toast('Room link copied!', 'success'))
      .catch(() => toast(`Share this code: ${state.roomCode}`, 'info'));
  });

  // Load video
  el.loadVideoBtn.addEventListener('click', loadVideo);
  el.videoUrlInput.addEventListener('keydown', e => { if (e.key === 'Enter') loadVideo(); });

  // Playback controls
  el.playBtn.addEventListener('click', () => {
    if (!canControl()) return;
    socket.send('play', { position: ytPlayer.getCurrentTime() });
  });
  el.pauseBtn.addEventListener('click', () => {
    if (!canControl()) return;
    socket.send('pause', { position: ytPlayer.getCurrentTime() });
  });

  // Seek bar
  const startSeek = () => { state.seekDragging = true; };
  el.seekBar.addEventListener('mousedown',  startSeek);
  el.seekBar.addEventListener('touchstart', startSeek, { passive: true });

  el.seekBar.addEventListener('input', () => {
    el.currentTime.textContent = fmt(parseFloat(el.seekBar.value));
  });

  const endSeek = () => {
    if (!state.seekDragging) return;
    state.seekDragging = false;
    if (canControl()) {
      socket.send('seek', { position: parseFloat(el.seekBar.value) });
    }
  };
  el.seekBar.addEventListener('mouseup',  endSeek);
  el.seekBar.addEventListener('touchend', endSeek);

  // Close context menu on outside click
  document.addEventListener('click', e => {
    if (!el.ctxMenu.contains(e.target)) closeCtxMenu();
  });

  // Context menu actions
  document.getElementById('ctx-mod').addEventListener('click',    () => doCtxAction('assign_role', { role: 'moderator' }));
  document.getElementById('ctx-part').addEventListener('click',   () => doCtxAction('assign_role', { role: 'participant' }));
  document.getElementById('ctx-viewer').addEventListener('click', () => doCtxAction('assign_role', { role: 'viewer' }));
  document.getElementById('ctx-host').addEventListener('click',   () => doCtxAction('transfer_host', {}));
  document.getElementById('ctx-kick').addEventListener('click',   () => doCtxAction('kick', {}));
}

function doCtxAction(type, extra) {
  if (!ctxTarget) return;
  socket.send(type, { userId: ctxTarget, ...extra });
  closeCtxMenu();
}

function loadVideo() {
  const raw = el.videoUrlInput.value.trim();
  const id  = extractVideoId(raw);
  if (!id) {
    toast('Paste a valid YouTube URL or video ID', 'error');
    return;
  }
  socket.send('change_video', { videoId: id });
  el.videoUrlInput.value = '';
}

// ─── Context menu ─────────────────────────────────────────────────────────────

function showCtxMenu(userId, participant, anchorEl) {
  ctxTarget = userId;
  el.ctxName.textContent = participant.name;
  el.ctxMenu.classList.remove('hidden');

  // Position next to the clicked item, flip if it would go off-screen
  const rect = anchorEl.getBoundingClientRect();
  const mw = 195, mh = 210;
  let top  = rect.top;
  let left = rect.right + 8;
  if (left + mw > window.innerWidth)  left = rect.left - mw - 8;
  if (top  + mh > window.innerHeight) top  = window.innerHeight - mh - 8;
  el.ctxMenu.style.top  = `${Math.max(8, top)}px`;
  el.ctxMenu.style.left = `${Math.max(8, left)}px`;

  // Hide role options that are already the target's current role
  const r = participant.role;
  document.getElementById('ctx-mod').style.display    = r === 'moderator'  ? 'none' : 'flex';
  document.getElementById('ctx-part').style.display   = r === 'participant' ? 'none' : 'flex';
  document.getElementById('ctx-viewer').style.display = r === 'viewer'      ? 'none' : 'flex';
}

function closeCtxMenu() {
  el.ctxMenu.classList.add('hidden');
  ctxTarget = null;
}

// ─── UI rendering ─────────────────────────────────────────────────────────────

function updateRoomCode(code) {
  el.roomCodeText.textContent = code;
  document.title = `WatchParty · ${code}`;
}

function updateRoleUI() {
  const r    = state.role || 'participant';
  const ctrl = canControl();

  el.myRoleBadge.className   = `badge badge-${r}`;
  el.myRoleBadge.textContent = r.charAt(0).toUpperCase() + r.slice(1);

  el.videoUrlSection.classList.toggle('hidden', !ctrl);
  el.playBtn.disabled  = !ctrl;
  el.pauseBtn.disabled = !ctrl;
  el.seekBar.disabled  = !ctrl;
  el.viewerNotice.classList.toggle('hidden', ctrl);

  // Overlay blocks viewer from clicking inside the player
  el.playerOverlay.classList.toggle('block-input', !ctrl);

  if (el.noVideoHint) {
    el.noVideoHint.textContent = ctrl
      ? 'Paste a YouTube URL in the bar below to get started.'
      : 'Waiting for the host to load a video…';
  }
}

function renderParticipants() {
  const count = state.participants.size;
  el.participantCount.textContent = count;
  el.viewerCount.innerHTML = `<span class="vc-dot"></span>${count} watching`;
  el.participantsList.innerHTML = '';

  // Sort: host first, then mods, then participants, then viewers
  const order = { host: 0, moderator: 1, participant: 2, viewer: 3 };
  const sorted = [...state.participants.entries()].sort(
    ([, a], [, b]) => (order[a.role] ?? 2) - (order[b.role] ?? 2)
  );

  for (const [uid, p] of sorted) {
    el.participantsList.appendChild(buildParticipantEl(uid, p, uid === state.userId));
  }
}

function buildParticipantEl(uid, p, isMe) {
  const div       = document.createElement('div');
  const clickable = isHost() && !isMe;

  div.className   = ['participant-item', isMe ? 'me' : '', clickable ? 'clickable' : '', 'new-item']
    .filter(Boolean).join(' ');
  div.dataset.uid = uid;
  div.setAttribute('role', 'listitem');

  const roleLabels = {
    host: '👑 Host', moderator: '🛡 Mod', participant: 'Member', viewer: '👁 Viewer',
  };

  div.innerHTML = `
    <div class="p-avatar av-${p.role}" aria-hidden="true">${initials(p.name)}</div>
    <div class="p-info">
      <div class="p-name">${esc(p.name)}${isMe ? '<span class="you-tag">(you)</span>' : ''}</div>
    </div>
    <span class="badge badge-${p.role}">${roleLabels[p.role] || p.role}</span>
  `;

  if (clickable) {
    div.addEventListener('click', e => {
      e.stopPropagation();
      showCtxMenu(uid, p, div);
    });
  }
  return div;
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
