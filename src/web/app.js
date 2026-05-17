const statusPill     = document.querySelector('#status-pill');
const statusText     = document.querySelector('#status-text');
const feed           = document.querySelector('#feed');
const feedEmpty      = document.querySelector('#feed-empty');
const commandInput   = document.querySelector('#command-input');
const sendButton     = document.querySelector('#send-button');
const voiceButton    = document.querySelector('#voice-button');
const memoryOpenBtn     = document.querySelector('#memory-open-btn');
const memoryCloseBtn    = document.querySelector('#memory-close-btn');
const memoryDrawer      = document.querySelector('#memory-drawer');
const drawerBackdrop    = document.querySelector('#drawer-backdrop');
const memoryBadge       = document.querySelector('#memory-badge');
const memoryLoading     = document.querySelector('#memory-loading');
const memoryList        = document.querySelector('#memory-list');
const memoryEmpty       = document.querySelector('#memory-empty');
const memoryAddForm     = document.querySelector('#memory-add-form');
const memoryAddInput    = document.querySelector('#memory-add-input');
const memoryKind        = document.querySelector('#memory-kind');

const remindersOpenBtn  = document.querySelector('#reminders-open-btn');
const remindersCloseBtn = document.querySelector('#reminders-close-btn');
const remindersDrawer   = document.querySelector('#reminders-drawer');
const remindersBadge    = document.querySelector('#reminders-badge');
const remindersLoading  = document.querySelector('#reminders-loading');
const reminderList      = document.querySelector('#reminder-list');
const remindersEmpty    = document.querySelector('#reminders-empty');

const settingsOpenBtn   = document.querySelector('#settings-open-btn');
const settingsCloseBtn  = document.querySelector('#settings-close-btn');
const settingsDrawer    = document.querySelector('#settings-drawer');
const cfgTokenInput     = document.querySelector('#cfg-token-input');
const cfgTokenToggle    = document.querySelector('#cfg-token-toggle');
const cfgEyeShow        = document.querySelector('#cfg-eye-show');
const cfgEyeHide        = document.querySelector('#cfg-eye-hide');
const cfgTokenSave      = document.querySelector('#cfg-token-save');
const cfgTokenClear     = document.querySelector('#cfg-token-clear');
const cfgTokenFeedback  = document.querySelector('#cfg-token-feedback');
const cfgTestJarvis     = document.querySelector('#cfg-test-jarvis');
const cfgTestOllama     = document.querySelector('#cfg-test-ollama');
const cfgTestHa         = document.querySelector('#cfg-test-ha');
const cfgDotJarvis      = document.querySelector('#cfg-dot-jarvis');
const cfgDotOllama      = document.querySelector('#cfg-dot-ollama');
const cfgDotHa          = document.querySelector('#cfg-dot-ha');
const cfgDetailJarvis   = document.querySelector('#cfg-test-jarvis-detail');
const cfgDetailOllama   = document.querySelector('#cfg-test-ollama-detail');
const cfgDetailHa       = document.querySelector('#cfg-test-ha-detail');
const cfgInfoDb         = document.querySelector('#cfg-info-db');
const cfgInfoAi         = document.querySelector('#cfg-info-ai');
const cfgInfoTts        = document.querySelector('#cfg-info-tts');
const cfgInfoOffline    = document.querySelector('#cfg-info-offline');
const cfgInfoNode       = document.querySelector('#cfg-info-node');
const cfgClearChat      = document.querySelector('#cfg-clear-chat');

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

/* ── DRAWER SHARED ──────────────────────────────────────── */

function closeAllDrawers() {
  for (const drawer of [memoryDrawer, remindersDrawer, settingsDrawer]) {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
  }
  drawerBackdrop.classList.remove('open');
  document.body.style.overflow = '';
}

function openDrawer(drawer, onOpen) {
  closeAllDrawers();
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  drawerBackdrop.classList.add('open');
  document.body.style.overflow = 'hidden';
  onOpen?.();
}

/* ── MEMORY DRAWER ──────────────────────────────────────── */

function openMemoryDrawer()  { openDrawer(memoryDrawer, fetchMemory); }
function closeMemoryDrawer() { closeAllDrawers(); }

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

memoryOpenBtn.addEventListener('click', openMemoryDrawer);
memoryCloseBtn.addEventListener('click', closeMemoryDrawer);
drawerBackdrop.addEventListener('click', closeAllDrawers);

memoryAddForm.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const text = memoryAddInput.value.trim();
  if (!text) { memoryAddInput.focus(); return; }
  addMemoryItem(text, memoryKind.value);
});

/* ── REMINDERS DRAWER ───────────────────────────────────── */

function openRemindersDrawer()  { openDrawer(remindersDrawer, fetchReminders); }
function closeRemindersDrawer() { closeAllDrawers(); }

function reminderStatus(item) {
  if (item.executed) return 'done';
  if (!item.dueAt)   return 'pending';
  return new Date(item.dueAt) < new Date() ? 'overdue' : 'pending';
}

function formatReminderDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const today    = new Date(); today.setHours(0,0,0,0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const day = new Date(d); day.setHours(0,0,0,0);
    const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    if (day.getTime() === today.getTime())    return `Hoje às ${time}`;
    if (day.getTime() === tomorrow.getTime()) return `Amanhã às ${time}`;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ` às ${time}`;
  } catch { return ''; }
}

const STATUS_ICONS = {
  pending: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  overdue: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  done:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
};

const STATUS_LABELS = { pending: 'Pendente', overdue: 'Atrasado', done: 'Concluído' };

function renderReminders(items) {
  reminderList.innerHTML = '';

  const pending = items.filter(r => !r.executed);
  const done    = items.filter(r =>  r.executed);
  const sorted  = [...pending.sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt)), ...done];

  if (sorted.length === 0) {
    remindersEmpty.hidden = false;
    remindersBadge.hidden = true;
    return;
  }

  remindersEmpty.hidden = true;
  const pendingCount = pending.length;
  if (pendingCount > 0) {
    remindersBadge.textContent = pendingCount > 99 ? '99+' : String(pendingCount);
    remindersBadge.hidden = false;
  } else {
    remindersBadge.hidden = true;
  }

  for (const item of sorted) {
    const status = reminderStatus(item);
    const li = document.createElement('li');
    li.className = `reminder-item ${status}`;

    const iconWrap = document.createElement('div');
    iconWrap.className = 'reminder-status-icon';
    iconWrap.innerHTML = STATUS_ICONS[status];

    const body = document.createElement('div');
    body.className = 'reminder-body';

    const textEl = document.createElement('span');
    textEl.className = 'reminder-text';
    textEl.textContent = item.text || '';

    const meta = document.createElement('div');
    meta.className = 'reminder-meta';

    if (item.dueAt) {
      const due = document.createElement('span');
      due.className = 'reminder-due';
      due.textContent = formatReminderDate(item.dueAt);
      meta.append(due);
    }

    const tag = document.createElement('span');
    tag.className = 'reminder-tag';
    tag.textContent = STATUS_LABELS[status];
    meta.append(tag);

    body.append(textEl, meta);
    li.append(iconWrap, body);
    reminderList.append(li);
  }
}

async function fetchReminders() {
  remindersLoading.hidden = false;
  remindersEmpty.hidden   = true;
  reminderList.innerHTML  = '';

  try {
    const res  = await jarvisFetch('/reminders');
    const data = await res.json();
    const items = Array.isArray(data) ? data : (data.reminders || []);
    renderReminders(items);
  } catch {
    remindersEmpty.textContent = 'Erro ao carregar lembretes.';
    remindersEmpty.hidden = false;
  } finally {
    remindersLoading.hidden = true;
  }
}

remindersOpenBtn.addEventListener('click', openRemindersDrawer);
remindersCloseBtn.addEventListener('click', closeRemindersDrawer);

/* ── SETTINGS DRAWER ────────────────────────────────────── */

function openSettingsDrawer() {
  openDrawer(settingsDrawer, loadSettingsDrawer);
}

function loadSettingsDrawer() {
  const saved = localStorage.getItem('jarvis_api_token') || '';
  cfgTokenInput.value = saved;
  cfgTokenFeedback.textContent = saved ? 'Token carregado do armazenamento local.' : '';
  cfgTokenFeedback.className   = saved ? 'cfg-feedback ok' : 'cfg-feedback';
  loadSystemInfo();
}

/* token visibility toggle */
cfgTokenToggle.addEventListener('click', () => {
  const isHidden = cfgTokenInput.type === 'password';
  cfgTokenInput.type  = isHidden ? 'text' : 'password';
  cfgEyeShow.hidden   = isHidden;
  cfgEyeHide.hidden   = !isHidden;
});

/* save token */
cfgTokenSave.addEventListener('click', () => {
  const val = cfgTokenInput.value.trim();
  if (!val) {
    cfgTokenFeedback.textContent = 'Digite um token antes de salvar.';
    cfgTokenFeedback.className = 'cfg-feedback err';
    return;
  }
  localStorage.setItem('jarvis_api_token', val);
  cfgTokenFeedback.textContent = 'Token salvo com sucesso.';
  cfgTokenFeedback.className   = 'cfg-feedback ok';
});

/* clear token */
cfgTokenClear.addEventListener('click', () => {
  localStorage.removeItem('jarvis_api_token');
  cfgTokenInput.value = '';
  cfgTokenFeedback.textContent = 'Token removido.';
  cfgTokenFeedback.className   = 'cfg-feedback';
});

/* test helpers */
function setTestState(dot, detail, state, text) {
  dot.className = `cfg-status-dot${state ? ' ' + state : ''}`;
  detail.textContent = text;
}

async function runTest(btn, dot, detail, testFn) {
  btn.disabled = true;
  setTestState(dot, detail, 'spin', 'Verificando…');
  try {
    await testFn(dot, detail);
  } catch {
    setTestState(dot, detail, 'err', 'Erro de rede.');
  } finally {
    btn.disabled = false;
  }
}

/* test Jarvis server */
cfgTestJarvis.addEventListener('click', () =>
  runTest(cfgTestJarvis, cfgDotJarvis, cfgDetailJarvis, async (dot, detail) => {
    const res  = await fetch('/health');
    const data = await res.json();
    const ok   = res.ok && data.ok;
    setTestState(dot, detail, ok ? 'ok' : 'err', ok ? `${data.service} — online` : 'Servidor não respondeu.');
  })
);

/* test Ollama via /status */
cfgTestOllama.addEventListener('click', () =>
  runTest(cfgTestOllama, cfgDotOllama, cfgDetailOllama, async (dot, detail) => {
    const res  = await jarvisFetch('/status');
    const data = await res.json();
    const ai   = data.ai || {};
    const ok   = Boolean(data.online);
    setTestState(dot, detail, ok ? 'ok' : 'err',
      ok ? `${ai.chatModel || ai.commandModel || 'modelo desconhecido'}` : 'Offline ou não configurado.');
  })
);

/* test Home Assistant via /status */
cfgTestHa.addEventListener('click', () =>
  runTest(cfgTestHa, cfgDotHa, cfgDetailHa, async (dot, detail) => {
    const res  = await jarvisFetch('/status');
    const data = await res.json();
    const ha   = data.homeAssistant || {};
    const ok   = Boolean(ha.configured);
    setTestState(dot, detail, ok ? 'ok' : 'err',
      ok ? `Entidade: ${ha.lightEntity || '—'}` : 'HA_URL / HA_TOKEN não configurados.');
  })
);

/* system info */
async function loadSystemInfo() {
  try {
    const res  = await jarvisFetch('/status');
    if (!res.ok) return;
    const d = await res.json();
    cfgInfoDb.textContent      = d.database?.ok ? 'Online' : 'Degradado';
    cfgInfoAi.textContent      = d.ai?.chatModel || d.ai?.provider || '—';
    cfgInfoTts.textContent     = d.tts?.provider || '—';
    cfgInfoOffline.textContent = d.offlineMode ? 'Ativo' : 'Não';
    cfgInfoNode.textContent    = d.process?.node || '—';
  } catch { /* ignore */ }
}

/* clear chat */
cfgClearChat.addEventListener('click', () => {
  feed.innerHTML = '';
  feed.appendChild(feedEmpty);
  feedEmpty.style.display = '';
  closeAllDrawers();
});

settingsOpenBtn.addEventListener('click', openSettingsDrawer);
settingsCloseBtn.addEventListener('click', closeAllDrawers);

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') closeAllDrawers();
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
