const statusPill = document.querySelector('#status-pill');
const statusText = document.querySelector('#status-text');
const wakeWord = document.querySelector('#wake-word');
const microphone = document.querySelector('#microphone');
const scheduler = document.querySelector('#scheduler');
const database = document.querySelector('#database');
const ai = document.querySelector('#ai');
const requests = document.querySelector('#requests');
const offlineMode = document.querySelector('#offline-mode');
const lastCommand = document.querySelector('#last-command');
const lastResponse = document.querySelector('#last-response');
const commandInput = document.querySelector('#command-input');
const sendButton = document.querySelector('#send-button');
const speakButton = document.querySelector('#speak-button');
const refreshEvents = document.querySelector('#refresh-events');
const eventsList = document.querySelector('#events-list');

function authHeaders() {
  const token = localStorage.getItem('jarvis_api_token');
  return token ? { 'X-Jarvis-Token': token } : {};
}

async function jarvisFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...authHeaders()
    }
  });

  if (response.status === 401) {
    const token = window.prompt('Token da API Jarvis');
    if (token) {
      localStorage.setItem('jarvis_api_token', token);
      return jarvisFetch(url, options);
    }
  }

  return response;
}

function setOnline(online) {
  statusPill.classList.toggle('online', online);
  statusPill.classList.toggle('offline', !online);
  statusText.textContent = online ? 'online' : 'offline';
}

function updateStatus(status) {
  if (!status) {
    setOnline(false);
    return;
  }

  setOnline(Boolean(status.online));
  wakeWord.textContent = status.wakeLoop?.wakeWord || 'jarvis';
  microphone.textContent = status.microphone?.available ? 'disponível' : 'indisponível';
  scheduler.textContent = status.scheduler?.running ? 'ativo' : 'parado';
  database.textContent = status.database?.ok ? 'online' : 'degradado';
  ai.textContent = status.ai?.chatModel || 'offline';
  requests.textContent = String(status.metrics?.http?.samples || 0);
  offlineMode.textContent = status.offlineMode ? 'ativo' : 'não';
  lastCommand.textContent = status.lastCommand?.text || 'Ainda não recebi comandos.';
  lastResponse.textContent = status.lastResponse?.text || 'Aguardando atividade.';
}

async function fetchStatus() {
  try {
    const response = await jarvisFetch('/status');
    updateStatus(await response.json());
  } catch {
    setOnline(false);
  }
}

function renderEvents(events) {
  eventsList.innerHTML = '';

  for (const event of events.slice(0, 12)) {
    const item = document.createElement('li');
    const title = document.createElement('strong');
    const meta = document.createElement('span');
    title.textContent = event.type;
    meta.textContent = event.createdAt || event.at || '';
    item.append(title, meta);
    eventsList.append(item);
  }

  if (events.length === 0) {
    const item = document.createElement('li');
    item.textContent = 'Sem eventos registrados ainda.';
    eventsList.append(item);
  }
}

async function fetchEvents() {
  try {
    const response = await jarvisFetch('/events?limit=12');
    const data = await response.json();
    renderEvents(data.events || []);
  } catch {
    renderEvents([]);
  }
}

async function sendCommand({ simulatedVoice = false } = {}) {
  const text = commandInput.value.trim();
  if (!text) {
    commandInput.focus();
    return;
  }

  const endpoint = simulatedVoice ? '/jarvis/listen' : '/jarvis';
  const response = await jarvisFetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text,
      speak: true,
      simulated: simulatedVoice
    })
  });

  const data = await response.json();
  lastCommand.textContent = text;
  lastResponse.textContent = data.text || 'Sem resposta.';
  commandInput.value = '';
  commandInput.focus();
  fetchEvents();
}

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const token = localStorage.getItem('jarvis_api_token');
  const query = token ? `?token=${encodeURIComponent(token)}` : '';
  const socket = new WebSocket(`${protocol}//${window.location.host}/ws${query}`);

  socket.addEventListener('open', () => {
    setOnline(true);
  });

  socket.addEventListener('message', (event) => {
    try {
      const message = JSON.parse(event.data);
      updateStatus(message.status);
      if (message.event) {
        fetchEvents();
      }
    } catch {
      fetchStatus();
    }
  });

  socket.addEventListener('close', () => {
    setOnline(false);
    setTimeout(connectWebSocket, 2000);
  });

  socket.addEventListener('error', () => {
    setOnline(false);
  });
}

sendButton.addEventListener('click', () => sendCommand());
speakButton.addEventListener('click', () => sendCommand({ simulatedVoice: true }));
refreshEvents.addEventListener('click', fetchEvents);
commandInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    sendCommand();
  }
});

fetchStatus();
fetchEvents();
connectWebSocket();
