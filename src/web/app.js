/* ── Jarvis Web Client ───────────────────────────────────── */

(function() {
  'use strict';

  /* config */
  const API_BASE = '';
  const TOKEN_KEY = 'jarvis_api_token';

  /* state */
  let authToken = localStorage.getItem(TOKEN_KEY) || '';
  let ws = null;
  let wsReconnectDelay = 1000;
  let wsReconnectTimer = null;
  let isRecording = false;
  let recognition = null;
  let audioCtx = null;

  /* DOM refs */
  const chat = document.getElementById('chat');
  const welcome = document.getElementById('welcome');
  const input = document.getElementById('input');
  const sendBtn = document.getElementById('send');
  const micBtn = document.getElementById('mic');
  const micHint = document.getElementById('mic-hint');
  const typing = document.getElementById('typing');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const configModal = document.getElementById('config-modal');
  const configBtn = document.getElementById('config-btn');
  const closeConfigBtn = document.getElementById('close-config');
  const tokenInput = document.getElementById('token-input');
  const saveTokenBtn = document.getElementById('save-token');
  const clearTokenBtn = document.getElementById('clear-token');

  /* ── HTTP ──────────────────────────────────────────────── */

  function apiHeaders() {
    const h = { 'Content-Type': 'application/json' };
    if (authToken) h['X-Jarvis-Token'] = authToken;
    return h;
  }

  async function apiPost(path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify(body)
    });
    if (res.status === 401) {
      throw new Error('Token inválido ou ausente.');
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    return res.json();
  }

  async function apiGet(path) {
    const headers = {};
    if (authToken) headers['X-Jarvis-Token'] = authToken;
    const res = await fetch(`${API_BASE}${path}`, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  /* ── Chat UI ─────────────────────────────────────────── */

  function addMessage(text, sender, opts = {}) {
    if (welcome && welcome.parentNode) {
      welcome.remove();
    }

    const msg = document.createElement('div');
    msg.className = `msg ${sender}`;

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    if (opts.error) bubble.classList.add('error');
    bubble.textContent = text;
    msg.appendChild(bubble);

    if (opts.audioPath) {
      const audioWrap = document.createElement('div');
      audioWrap.className = 'msg-audio';

      const playBtn = document.createElement('button');
      playBtn.className = 'btn-play icon-btn';
      playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
      playBtn.title = 'Tocar áudio';

      const url = normalizeAudioUrl(opts.audioPath);
      if (url) {
        playBtn.addEventListener('click', () => playAudio(url));
      } else {
        playBtn.disabled = true;
        playBtn.title = 'Áudio indisponível (backend não serve arquivos)';
      }
      audioWrap.appendChild(playBtn);
      msg.appendChild(audioWrap);
    }

    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    meta.textContent = formatTime(new Date());
    msg.appendChild(meta);

    chat.appendChild(msg);
    scrollToBottom();
    return msg;
  }

  function normalizeAudioUrl(path) {
    if (!path) return null;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    // Se o backend retornar caminho absoluto do filesystem, não temos como acessar
    // a menos que a pasta audio seja servida via static. Por segurança, só aceitamos
    // paths relativos que comecem com /audio/ ou / (e assumimos o mesmo host).
    if (path.startsWith('/audio/') || path.startsWith('/')) {
      return `${window.location.origin}${path}`;
    }
    return null;
  }

  function showTyping() {
    typing.hidden = false;
    scrollToBottom();
  }

  function hideTyping() {
    typing.hidden = true;
  }

  function scrollToBottom() {
    chat.scrollTop = chat.scrollHeight;
  }

  function formatTime(d) {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  /* ── Send / Receive ─────────────────────────────────── */

  async function sendText(text) {
    const clean = text.trim();
    if (!clean) return;

    input.value = '';
    addMessage(clean, 'user');
    showTyping();

    try {
      const data = await apiPost('/jarvis', { text: clean, speak: false });
      hideTyping();
      addMessage(data.text || 'Sem resposta.', 'ai', {
        error: !data.ok,
        audioPath: data.audioPath
      });
    } catch (err) {
      hideTyping();
      addMessage(err.message || 'Erro de conexão.', 'ai', { error: true });
    }
  }

  /* ── Audio Playback ───────────────────────────────────── */

  function playAudio(url) {
    const audio = new Audio(url);
    audio.play().catch((err) => {
      console.warn('[Jarvis] playAudio falhou:', err.name, err.message);
    });
  }

  /* ── Speech Recognition ─────────────────────────────────── */

  function initSpeechRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      micBtn.hidden = true;
      return false;
    }

    recognition = new SR();
    recognition.lang = 'pt-BR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      isRecording = true;
      micBtn.classList.add('recording');
      micHint.hidden = false;
    };

    recognition.onend = () => {
      isRecording = false;
      micBtn.classList.remove('recording');
      micHint.hidden = true;
    };

    recognition.onresult = (ev) => {
      const transcript = ev.results[0][0].transcript;
      if (transcript) sendText(transcript);
    };

    recognition.onerror = () => {
      isRecording = false;
      micBtn.classList.remove('recording');
      micHint.hidden = true;
    };

    return true;
  }

  function toggleMic() {
    if (!recognition) return;
    if (isRecording) {
      recognition.stop();
    } else {
      try { recognition.start(); } catch { /* já iniciado */ }
    }
  }

  /* ── Status / Health ──────────────────────────────────── */

  async function updateStatus() {
    setStatus('connecting', 'Conectando...');
    try {
      let data;
      try {
        data = await apiGet('/status');
      } catch {
        data = await apiGet('/health');
      }
      const online = data && (data.ok || data.online || data.status === 'online');
      setStatus(online ? 'online' : 'offline', online ? 'Online' : 'Offline');
    } catch {
      setStatus('offline', 'Offline');
    }
  }

  function setStatus(state, label) {
    statusDot.className = `status-dot ${state}`;
    statusText.textContent = label;
  }

  /* ── WebSocket ────────────────────────────────────────── */

  function connectWebSocket() {
    if (wsReconnectTimer) clearTimeout(wsReconnectTimer);

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const tokenParam = authToken ? `?token=${encodeURIComponent(authToken)}` : '';
    const url = `${proto}//${window.location.host}/ws${tokenParam}`;

    try {
      ws = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      wsReconnectDelay = 1000;
      setStatus('online', 'Online (WS)');
    };

    ws.onmessage = (ev) => {
      try {
        const payload = JSON.parse(ev.data);
        if (payload.type === 'status') {
          const st = payload.status || {};
          const online = st.online || st.status === 'online';
          setStatus(online ? 'online' : 'offline', online ? 'Online (WS)' : 'Offline');
        }
        if (payload.type === 'event' && payload.event) {
          handleWsEvent(payload.event);
        }
      } catch { /* ignore malformed */ }
    };

    ws.onclose = () => {
      setStatus('offline', 'Offline');
      scheduleReconnect();
    };

    ws.onerror = () => {
      // Silencioso — fallback HTTP continua funcionando
    };
  }

  function scheduleReconnect() {
    wsReconnectTimer = setTimeout(() => {
      wsReconnectDelay = Math.min(wsReconnectDelay * 2, 30000);
      connectWebSocket();
    }, wsReconnectDelay);
  }

  function handleWsEvent(event) {
    if (event.type === 'jarvis:response') {
      hideTyping();
      const p = event.payload || {};
      addMessage(p.text || 'Sem resposta.', 'ai', {
        error: !p.ok,
        audioPath: p.audioPath
      });
    }
    if (event.type === 'reminder:fired') {
      const r = event.payload?.reminder || {};
      addMessage(`Lembrete: ${r.text || ''}`, 'ai');
    }
  }

  /* ── Config Modal ─────────────────────────────────────── */

  function openConfig() {
    tokenInput.value = authToken;
    configModal.hidden = false;
  }

  function closeConfig() {
    configModal.hidden = true;
  }

  function saveToken() {
    authToken = tokenInput.value.trim();
    if (authToken) {
      localStorage.setItem(TOKEN_KEY, authToken);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
    closeConfig();
    // Reconecta WS com novo token
    if (ws) { ws.close(); }
    connectWebSocket();
  }

  function clearToken() {
    authToken = '';
    localStorage.removeItem(TOKEN_KEY);
    tokenInput.value = '';
  }

  /* ── Event Listeners ───────────────────────────────────── */

  sendBtn.addEventListener('click', () => sendText(input.value));

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendText(input.value);
    }
  });

  micBtn.addEventListener('click', toggleMic);

  configBtn.addEventListener('click', openConfig);
  closeConfigBtn.addEventListener('click', closeConfig);
  saveTokenBtn.addEventListener('click', saveToken);
  clearTokenBtn.addEventListener('click', clearToken);

  configModal.querySelector('.modal-backdrop').addEventListener('click', closeConfig);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !configModal.hidden) {
      closeConfig();
    }
  });

  /* ── Init ─────────────────────────────────────────────── */

  function init() {
    initSpeechRecognition();
    updateStatus();
    connectWebSocket();
    setInterval(updateStatus, 30000);
    input.focus();
  }

  init();
})();
