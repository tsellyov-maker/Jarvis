const statusPill   = document.querySelector('#status-pill');
const statusText   = document.querySelector('#status-text');
const feed         = document.querySelector('#feed');
const feedEmpty    = document.querySelector('#feed-empty');
const commandInput = document.querySelector('#command-input');
const sendButton   = document.querySelector('#send-button');
const voiceButton  = document.querySelector('#voice-button');

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
