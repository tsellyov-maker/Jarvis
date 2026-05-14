import dotenv from 'dotenv';
import http from 'node:http';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DateTime } from 'luxon';
import { WebSocketServer } from 'ws';

import { createApp } from './app.mjs';
import { logger } from './core/logger.mjs';
import { eventBus } from './core/eventBus.mjs';
import { Interpreter } from './core/interpreter.mjs';
import { Brain } from './core/brain.mjs';
import { Pipeline } from './core/pipeline.mjs';

import { ConversationModule } from './modules/conversation.module.mjs';
import { VoiceModule } from './modules/voice.module.mjs';
import { LightModule } from './modules/light.module.mjs';
import { ReminderModule } from './modules/reminder.module.mjs';
import { MemoryModule } from './modules/memory.module.mjs';
import { SystemModule } from './modules/system.module.mjs';

import { AiService } from './services/ai.service.mjs';
import { OllamaService } from './services/ollama.service.mjs';
import { FishAudioService } from './services/fishAudio.service.mjs';
import { TtsService } from './services/tts.service.mjs';
import { SttService } from './services/stt.service.mjs';
import { MicrophoneService } from './services/microphone.service.mjs';
import { AudioPlayerService } from './services/audioPlayer.service.mjs';
import { WakeWordService } from './services/wakeWord.service.mjs';
import { HomeAssistantService } from './services/homeAssistant.service.mjs';
import { MemoryService } from './services/memory.service.mjs';
import { ReminderService } from './services/reminder.service.mjs';
import { SchedulerService } from './services/scheduler.service.mjs';
import { DatabaseService } from './services/database.service.mjs';
import { MetricsService } from './services/metrics.service.mjs';
import { AuditService } from './services/audit.service.mjs';
import { NetworkService } from './services/network.service.mjs';
import { LocalTtsService } from './services/localTts.service.mjs';

import { VoiceListener } from './voice/listener.mjs';
import { WakeLoop } from './voice/wakeLoop.mjs';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.', override: false });

const srcDir = dirname(fileURLToPath(import.meta.url));
const zone = process.env.TIMEZONE || 'America/Sao_Paulo';
const port = Number(process.env.PORT || 3000);
const host = '0.0.0.0';

function envEnabled(name) {
  return ['true', '1', 'yes', 'on', 'enabled'].includes(
    String(process.env[name] || '').trim().toLowerCase()
  );
}

const voiceListenerEnabled = envEnabled('VOICE_LISTENER_ENABLED');
const wakeLoopEnabled = envEnabled('WAKE_LOOP_ENABLED');

const status = {
  online: false,
  startedAt: DateTime.now().setZone(zone).toISO(),
  lastCommand: null,
  lastResponse: null,
  lastEvent: null,
  services: {}
};

function publicStatus({
  scheduler,
  wakeLoop,
  voiceListener,
  microphoneService,
  audioPlayerService,
  fishAudioService,
  ttsService,
  aiService,
  databaseService,
  metricsService,
  homeAssistantService,
  networkService
} = {}) {
  return {
    ...status,
    scheduler: scheduler?.getStatus?.() || null,
    wakeLoop: wakeLoop?.getStatus?.() || null,
    voiceListener: voiceListener?.getStatus?.() || null,
    microphone: {
      available: microphoneService?.isAvailable?.() || false
    },
    audio: {
      playback: audioPlayerService?.playback ?? false,
      player: audioPlayerService?.getPlayer?.() || null
    },
    tts: ttsService?.getStatus?.() || {
      provider: process.env.TTS_PROVIDER || 'fish_audio',
      remoteConfigured: fishAudioService?.configured || false
    },
    network: networkService?.getStatus?.() || null,
    offlineMode: networkService?.isOffline?.() || false,
    ai: {
      provider: aiService?.provider || process.env.AI_PROVIDER || 'ollama',
      commandModel: aiService?.commandModel || process.env.OLLAMA_MODEL_COMMAND || 'llama3.1',
      chatModel: aiService?.chatModel || process.env.OLLAMA_MODEL_CHAT || 'mixtral',
      fallbackModel: aiService?.fallbackModel || process.env.OLLAMA_MODEL_FALLBACK || 'llama3.1'
    },
    database: databaseService?.health?.() || null,
    homeAssistant: {
      configured: homeAssistantService?.configured || false,
      lightEntity: process.env.HA_LIGHT_ENTITY || 'light.luz_quarto'
    },
    security: {
      apiTokenRequired: Boolean(process.env.JARVIS_API_TOKEN),
      bindHost: host
    },
    metrics: metricsService?.snapshot?.() || null,
    process: {
      pid: process.pid,
      node: process.version,
      platform: process.platform,
      memory: process.memoryUsage()
    }
  };
}

async function ensureRuntimeDirs() {
  await Promise.all([
    mkdir(join(srcDir, 'data'), { recursive: true }),
    mkdir(join(srcDir, 'audio', 'input'), { recursive: true }),
    mkdir(join(srcDir, 'audio', 'output'), { recursive: true })
  ]);
}

async function listenWithPortFallback(server, desiredPort, bindHost) {
  const maxAttempts = 20;
  const allowFallback = process.env.ENABLE_PORT_FALLBACK !== 'false';

  for (let attempt = 0; attempt < (allowFallback ? maxAttempts : 1); attempt += 1) {
    const candidatePort = desiredPort + attempt;

    try {
      await new Promise((resolve, reject) => {
        const onListening = () => {
          server.off('error', onError);
          resolve();
        };

        const onError = (error) => {
          server.off('listening', onListening);
          reject(error);
        };

        server.once('listening', onListening);
        server.once('error', onError);
        server.listen(candidatePort, bindHost);
      });

      return candidatePort;
    } catch (error) {
      if (error.code !== 'EADDRINUSE' || attempt === maxAttempts - 1) {
        throw error;
      }

      logger.warn('server', `Porta ${candidatePort} em uso; tentando ${candidatePort + 1}.`);
    }
  }

  throw new Error('Nao foi possivel encontrar porta livre para o servidor.');
}

async function main() {
  await ensureRuntimeDirs();

  const databaseService = new DatabaseService();
  await databaseService.initialize();
  const metricsService = new MetricsService({ zone });
  const auditService = new AuditService({ databaseService });
  const networkService = new NetworkService();
  await networkService.start();

  const memoryService = new MemoryService({ databaseService });
  const reminderService = new ReminderService({ databaseService });
  await memoryService.ensureStorage();
  await reminderService.ensureStorage();

  const ollamaService = new OllamaService();
  const aiService = new AiService({ ollamaService });
  const fishAudioService = new FishAudioService();
  const audioPlayerService = new AudioPlayerService();
  const localTtsService = new LocalTtsService();
  const ttsService = new TtsService({
    fishAudioService,
    audioPlayerService,
    localTtsService,
    networkService
  });
  const sttService = new SttService();
  const microphoneService = new MicrophoneService();
  const wakeWordService = new WakeWordService();
  const homeAssistantService = new HomeAssistantService();

  const voiceModule = new VoiceModule({ ttsService });
  const conversationModule = new ConversationModule({ aiService, memoryService });
  const lightModule = new LightModule({ homeAssistantService });
  const memoryModule = new MemoryModule({ memoryService });
  const reminderModule = new ReminderModule({ reminderService, zone });

  let scheduler;
  let wakeLoop;
  let voiceListener;
  let pipeline;

  const getStatus = () => publicStatus({
    scheduler,
    wakeLoop,
    voiceListener,
    microphoneService,
    audioPlayerService,
    fishAudioService,
    ttsService,
    aiService,
    databaseService,
    metricsService,
    homeAssistantService,
    networkService
  });

  const systemModule = new SystemModule({ getStatus, zone });
  const interpreter = new Interpreter({ aiService, zone });
  const brain = new Brain({
    conversationModule,
    lightModule,
    memoryModule,
    reminderModule,
    systemModule,
    voiceModule
  });

  pipeline = new Pipeline({
    interpreter,
    brain,
    ttsService,
    memoryService,
    metricsService
  });

  voiceListener = new VoiceListener({
    microphoneService,
    sttService
  });

  wakeLoop = new WakeLoop({
    microphoneService,
    sttService,
    wakeWordService,
    voiceListener,
    voiceModule,
    pipeline
  });

  scheduler = new SchedulerService({
    reminderService,
    ttsService,
    intervalMs: 30000
  });

  const app = createApp({
    pipeline,
    memoryService,
    reminderService,
    getStatus,
    voiceListener,
    metricsService,
    auditService
  });
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });
  const wsHeartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (socket.isAlive === false) {
        socket.terminate();
        continue;
      }

      socket.isAlive = false;
      socket.ping();
    }
  }, 30000);
  wsHeartbeat.unref?.();

  wss.on('error', (error) => {
    logger.warn('websocket', 'Evento de erro no WebSocket.', error);
  });

  function broadcast(message) {
    const payload = JSON.stringify(message);
    for (const client of wss.clients) {
      if (client.readyState === 1) {
        client.send(payload);
      }
    }
  }

  eventBus.on('*', (event) => {
    status.lastEvent = event;
    auditService.record(event);
    metricsService.increment('jarvis_events_total', { type: event.type });

    if (event.type === 'reminder:fired') {
      metricsService.increment('jarvis_reminders_fired_total');
    }

    if (event.type === 'jarvis:command') {
      status.lastCommand = {
        text: event.payload.text,
        source: event.payload.source,
        at: event.at
      };
    }

    if (event.type === 'jarvis:response') {
      status.lastResponse = {
        text: event.payload.text,
        ok: event.payload.ok,
        audioPath: event.payload.audioPath,
        at: event.at
      };
    }

    broadcast({
      type: 'event',
      event,
      status: getStatus()
    });
  });

  wss.on('connection', (socket, request) => {
    if (process.env.JARVIS_API_TOKEN) {
      const url = new URL(request.url, `http://${request.headers.host || host}`);
      const token = url.searchParams.get('token');
      if (token !== process.env.JARVIS_API_TOKEN) {
        socket.close(1008, 'Token invalido');
        return;
      }
    }

    socket.isAlive = true;
    socket.on('pong', () => {
      socket.isAlive = true;
    });

    socket.send(JSON.stringify({
      type: 'status',
      status: getStatus()
    }));
  });

  const actualPort = await listenWithPortFallback(server, port, host);
  status.online = true;
  status.port = actualPort;
  status.host = host;
  status.url = `http://${host === '0.0.0.0' ? 'localhost' : host}:${actualPort}`;
  logger.info('server', `Jarvis online em ${status.url}`);
  logger.info('server', 'Servidor pronto. Voz local depende de VOICE_LISTENER_ENABLED=true e WAKE_LOOP_ENABLED=true.');
  scheduler.start();

  if (voiceListenerEnabled || wakeLoopEnabled) {
    voiceListener.start();
  } else {
    logger.info('server', 'Voice listener desativado por padrão.');
  }

  if (wakeLoopEnabled) {
    wakeLoop.start();
  } else {
    logger.info('server', 'Wake loop desativado por padrão.');
  }

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info('server', `Recebido ${signal}. Encerrando com cuidado.`);
    status.online = false;
    scheduler.stop();
    await wakeLoop.stop();
    voiceListener.stop();
    networkService.stop();
    clearInterval(wsHeartbeat);
    wss.close();
    server.close(() => {
      databaseService.close();
      logger.info('server', 'Servidor encerrado.');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error('process', 'Promise rejeitada sem tratamento.', reason instanceof Error ? reason : { reason });
    metricsService.increment('jarvis_process_errors_total', { type: 'unhandled_rejection' });
  });
  process.on('uncaughtException', (error) => {
    logger.error('process', 'Excecao nao capturada.', error);
    metricsService.increment('jarvis_process_errors_total', { type: 'uncaught_exception' });
  });
}

main().catch((error) => {
  logger.error('server', 'Falha fatal na inicializacao.', error);
  process.exitCode = 1;
});
