const statusPill     = document.querySelector('#status-pill');
const statusText     = document.querySelector('#status-text');
const feed           = document.querySelector('#feed');
const feedEmpty      = document.querySelector('#feed-empty');
const commandInput   = document.querySelector('#command-input');
const sendButton     = document.querySelector('#send-button');
const voiceButton    = document.querySelector('#voice-button');
const memoryOpenBtn  = document.querySelector('#memory-open-btn');
const memoryCloseBtn = document.querySelector('#memory-close-btn');
const memoryDrawer   = document.querySelector('#memory-drawer');
const drawerBackdrop = document.querySelector('#drawer-backdrop');
const memoryBadge    = document.querySelector('#memory-badge');
const memoryLoading  = document.querySelector('#memory-loading');
const memoryList     = document.querySelector('#memory-list');
const memoryEmpty    = document.querySelector('#memory-empty');
const memoryAddForm  = document.querySelector('#memory-add-form');
const memoryAddInput = document.querySelector('#memory-add-input');
const memoryKind     = document.querySelector('#memory-kind');

let typingEl = null;
let isSending = false;

/* ── AUTH ───────────────────────────────────────────────── */

function authHeaders() {
  const token = localStorage.getItem('jarvis_api_token');
  return token ? { 'X-Jarvis-Token': token } : {};
}

async function jarvisFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), ...authHeaders() }
  });

  if (res.status === 401) {
    const token = window.prompt('Token da API Jarvis:');
    if (token) {
      localStorage.setItem('jarvis_api_token', token);
      return jarvisFetch(url, options);
    }
  }

  return res;
}

/* ── STATUS ─────────────────────────────────────────────── */

function setOnline(online) {
  statusPill.className = 'status-pill ' + (online ? 'online' : 'offline');
  statusText.textContent = online ? 'online' : 'offline';
}

/* ── FEED HELPERS ───────────────────────────────────────── */

function hideFeedEmpty() {
  if (feedEmpty) feedEmpty.style.display = 'none';
}

function now() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function addBubble(text, role, opts = {}) {
  hideFeedEmpty();

  const wrap  = document.createElement('div');
  wrap.className = `bubble-wrap ${role}`;

  const label = document.createElement('span');
  label.className = 'bubble-label';
  label.textContent = role === 'user' ? 'Você' : 'Jarvis';

  const bubble = document.createElement('div');
  bubble.className = `bubble ${role}${opts.error ? ' error' : ''}`;
  bubble.textContent = text;

  const time = document.createElement('span');
  time.className = 'bubble-time';
  time.textContent = now();

  wrap.append(label, bubble, time);
  feed.append(wrap);
  scrollFeed();
  return wrap;
}

function showTyping() {
  hideFeedEmpty();
  const wrap = document.createElement('div');
  wrap.className = 'bubble-wrap ai';

  const label = document.createElement('span');
  label.className = 'bubble-label';
  label.textContent = 'Jarvis';

  const bubble = document.createElement('div');
  bubble.className = 'bubble ai typing';
  bubble.innerHTML = '<span></span><span></span><span></span>';

  wrap.append(label, bubble);
  feed.append(wrap);
  scrollFeed();
  typingEl = wrap;
}

function removeTyping() {
  if (typingEl) {
    typingEl.remove();
    typingEl = null;
  }
}

function scrollFeed() {
  feed.scrollTop = feed.scrollHeight;
}

/* ── SEND ───────────────────────────────────────────────── */

async function sendCommand(simulatedVoice = false) {
  if (isSending) return;
  const text = commandInput.value.trim();
  if (!text) { commandInput.focus(); return; }

  isSending = true;
  commandInput.value = '';
  commandInput.disabled = true;
  setVoiceLoading(true);

  addBubble(text, 'user');
  showTyping();

  const endpoint = simulatedVoice ? '/jarvis/listen' : '/jarvis';

  try {
    const res  = await jarvisFetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, speak: true, simulated: simulatedVoice })
    });

    const data = await res.json();
    removeTyping();
    addBubble(data.text || 'Sem resposta.', 'ai', { error: !data.ok });
  } catch {
    removeTyping();
    addBubble('Erro ao conectar com Jarvis.', 'ai', { error: true });
  } finally {
    isSending = false;
    commandInput.disabled = false;
    commandInput.focus();
    setVoiceLoading(false);
  }
}

/* ── MEMORY DRAWER ──────────────────────────────────────── */

function openDrawer() {
  memoryDrawer.classList.add('open');
  memoryDrawer.setAttribute('aria-hidden', 'false');
  drawerBackdrop.classList.add('open');
  document.body.style.overflow = 'hidden';
  fetchMemory();
}

function closeDrawer() {
  memoryDrawer.classList.remove('open');
  memoryDrawer.setAttribute('aria-hidden', 'true');
  drawerBackdrop.classList.remove('open');
  document.body.style.overflow = '';
}

function updateBadge(count) {
  if (count > 0) {
    memoryBadge.textContent = count > 99 ? '99+' : String(count);
    memoryBadge.hidden = false;
  } else {
    memoryBadge.hidden = true;
  }
}

function formatMemoryDate(val) {
  if (!val) return '';
  try {
    const d = new Date(val);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function kindLabel(kind) {
  const map = { notes: 'Nota', task: 'Tarefa', reminder: 'Lembrete', fact: 'Fato' };
  return map[kind] || kind;
}

function renderMemory(items) {
  memoryList.innerHTML = '';

  if (!items || items.length === 0) {
    memoryEmpty.hidden = false;
    updateBadge(0);
    return;
  }

  memoryEmpty.hidden = true;
  updateBadge(items.length);

  for (const item of items) {
    const li = document.createElement('li');
    li.className = 'memory-item';

    const kindEl = document.createElement('span');
    kindEl.className = 'memory-item-kind';
    kindEl.textContent = kindLabel(item.kind || item.type || 'notes');

    const textEl = document.createElement('span');
    textEl.className = 'memory-item-text';
    textEl.textContent = item.text || item.content || '';

    const timeEl = document.createElement('span');
    timeEl.className = 'memory-item-time';
    timeEl.textContent = formatMemoryDate(item.createdAt || item.created_at || item.at);

    li.append(kindEl, textEl, timeEl);
    memoryList.append(li);
  }
}

async function fetchMemory() {
  memoryLoading.hidden = false;
  memoryEmpty.hidden = true;
  memoryList.innerHTML = '';

  try {
    const res  = await jarvisFetch('/memory');
    const data = await res.json();
    const items = Array.isArray(data) ? data : (data.items || data.memory || []);
    renderMemory(items);
  } catch {
    memoryEmpty.textContent = 'Erro ao carregar memória.';
    memoryEmpty.hidden = false;
  } finally {
    memoryLoading.hidden = true;
  }
}

async function addMemoryItem(text, kind) {
  const btn = memoryAddForm.querySelector('.btn-memory-add');
  btn.disabled = true;

  try {
    const res  = await jarvisFetch('/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, kind })
    });

    if (res.ok) {
      memoryAddInput.value = '';
      await fetchMemory();
    }
  } finally {
    btn.disabled = false;
    memoryAddInput.focus();
  }
}

memoryOpenBtn.addEventListener('click', openDrawer);
memoryCloseBtn.addEventListener('click', closeDrawer);
drawerBackdrop.addEventListener('click', closeDrawer);

memoryAddForm.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const text = memoryAddInput.value.trim();
  if (!text) { memoryAddInput.focus(); return; }
  addMemoryItem(text, memoryKind.value);
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && memoryDrawer.classList.contains('open')) closeDrawer();
});

/* ── VOICE BUTTON STATE ─────────────────────────────────── */

function setVoiceLoading(on) {
  voiceButton.classList.toggle('loading', on);
  voiceButton.disabled = on;
}

/* ── WEBSOCKET ──────────────────────────────────────────── */

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const token    = localStorage.getItem('jarvis_api_token');
  const query    = token ? `?token=${encodeURIComponent(token)}` : '';
  const ws       = new WebSocket(`${protocol}//${window.location.host}/ws${query}`);

  ws.addEventListener('open',    () => setOnline(true));
  ws.addEventListener('close',   () => { setOnline(false); setTimeout(connectWebSocket, 2500); });
  ws.addEventListener('error',   () => setOnline(false));

  ws.addEventListener('message', (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.status) setOnline(Boolean(msg.status.online));
    } catch { /* ignore */ }
  });
}

/* ── EVENTS ─────────────────────────────────────────────── */

sendButton.addEventListener('click', () => sendCommand(false));

voiceButton.addEventListener('click', () => {
  if (isSending) return;
  const text = commandInput.value.trim();
  if (text) {
    sendCommand(true);
  } else {
    commandInput.focus();
    commandInput.placeholder = 'Digite para simular voz…';
    setTimeout(() => { commandInput.placeholder = 'Digite um comando…'; }, 2000);
  }
});

commandInput.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && !ev.shiftKey) {
    ev.preventDefault();
    sendCommand(false);
  }
});

/* ── INIT ───────────────────────────────────────────────── */

async function fetchInitialStatus() {
  try {
    const res  = await jarvisFetch('/status');
    const data = await res.json();
    setOnline(Boolean(data.online));
  } catch {
    setOnline(false);
  }
}

fetchInitialStatus();
connectWebSocket();
