'use strict';

/**
 * landing.js — Landing page controller
 *
 * Handles:
 *  - Tab switching between "Create Room" and "Join Room"
 *  - Name + code validation
 *  - Storing username in sessionStorage before redirecting
 *  - Showing a "kicked" notice when redirected from a room
 */

document.addEventListener('DOMContentLoaded', () => {

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const nameInput   = document.getElementById('name-input');
  const nameError   = document.getElementById('name-error');
  const tabCreate   = document.getElementById('tab-create');
  const tabJoin     = document.getElementById('tab-join');
  const createBtn   = document.getElementById('create-btn');
  const joinSection = document.getElementById('join-section');
  const codeInput   = document.getElementById('code-input');
  const joinBtn     = document.getElementById('join-btn');
  const codeError   = document.getElementById('code-error');
  const kickedMsg   = document.getElementById('kicked-msg');

  // ── Show kicked notice ────────────────────────────────────────────────────
  if (new URLSearchParams(location.search).get('kicked') === '1') {
    kickedMsg?.classList.remove('hidden');
  }

  // ── Pre-fill name if returning user ──────────────────────────────────────
  const savedName = sessionStorage.getItem('wpName');
  if (savedName) nameInput.value = savedName;

  // ── Tab switching ─────────────────────────────────────────────────────────
  let activeTab = 'create';

  tabCreate.addEventListener('click', () => switchTab('create'));
  tabJoin.addEventListener('click',   () => switchTab('join'));

  function switchTab(tab) {
    activeTab = tab;
    tabCreate.classList.toggle('active', tab === 'create');
    tabJoin.classList.toggle('active',   tab === 'join');
    joinSection.classList.toggle('hidden', tab === 'create');
    if (tab === 'join') setTimeout(() => codeInput.focus(), 40);
    else                setTimeout(() => nameInput.focus(),  40);
    hideErr(codeError);
  }

  // ── Validation ────────────────────────────────────────────────────────────
  function validateName() {
    const n = nameInput.value.trim();
    if (!n)           return showErr(nameError, 'Please enter your display name.'),   null;
    if (n.length < 2) return showErr(nameError, 'Name must be at least 2 characters.'), null;
    if (n.length > 30)return showErr(nameError, 'Name is too long (max 30 characters).'), null;
    hideErr(nameError);
    return n;
  }

  function validateCode() {
    const c = codeInput.value.trim().toUpperCase();
    if (!c)                    return showErr(codeError, 'Please enter a room code.'),  null;
    if (!/^[A-Z0-9]{6}$/.test(c)) return showErr(codeError, 'Code must be 6 letters / numbers.'), null;
    hideErr(codeError);
    return c;
  }

  function showErr(el, msg) { el.textContent = msg; el.classList.add('visible'); }
  function hideErr(el)      { el.classList.remove('visible'); }

  // ── Create room ───────────────────────────────────────────────────────────
  createBtn.addEventListener('click', () => {
    const name = validateName();
    if (!name) return;
    sessionStorage.setItem('wpName', name);
    window.location.href = '/room.html?action=create';
  });

  // ── Join room ─────────────────────────────────────────────────────────────
  function doJoin() {
    const name = validateName();
    if (!name) return;
    const code = validateCode();
    if (!code) return;
    sessionStorage.setItem('wpName', name);
    window.location.href = `/room.html?code=${code}`;
  }

  joinBtn.addEventListener('click', doJoin);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  nameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') activeTab === 'create' ? createBtn.click() : (switchTab('join'));
  });
  codeInput.addEventListener('keydown', e => { if (e.key === 'Enter') doJoin(); });

  // Auto uppercase code input
  codeInput.addEventListener('input', () => {
    const pos = codeInput.selectionStart;
    codeInput.value = codeInput.value.toUpperCase();
    codeInput.setSelectionRange(pos, pos);
  });

  // ── Focus ─────────────────────────────────────────────────────────────────
  nameInput.focus();
  nameInput.select();
});
