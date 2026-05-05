import express from 'express';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { logger } from './core/logger.mjs';

const webDir = join(dirname(fileURLToPath(import.meta.url)), 'web');

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function apiTokenConfigured() {
  return Boolean(process.env.JARVIS_API_TOKEN);
}

function tokenFromRequest(req) {
  const headerToken = req.get('x-jarvis-token');
  const authorization = req.get('authorization') || '';
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : '';
  return headerToken || bearer;
}

function requireApiToken(req, res, next) {
  if (!apiTokenConfigured()) {
    next();
    return;
  }

  if (tokenFromRequest(req) === process.env.JARVIS_API_TOKEN) {
    next();
    return;
  }

  res.status(401).json({
    ok: false,
    error: 'Token de API invalido ou ausente.'
  });
}

function commandText(req) {
  const text = String(req.body?.text || '').trim();
  if (text.length > 4000) {
    const error = new Error('Comando excede 4000 caracteres.');
    error.statusCode = 413;
    throw error;
  }

  return text;
}

function createApp({
  pipeline,
  memoryService,
  reminderService,
  getStatus,
  voiceListener,
  metricsService,
  auditService
} = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', process.env.TRUST_PROXY === 'true');

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"]
      }
    }
  }));

  app.use(rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
    max: Number(process.env.RATE_LIMIT_MAX || 120),
    standardHeaders: true,
    legacyHeaders: false
  }));

  app.use((req, res, next) => {
    const requestId = randomUUID();
    const startedAt = process.hrtime.bigint();
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const route = req.route?.path || req.baseUrl || req.path;
      metricsService?.observeHttp({
        method: req.method,
        route,
        statusCode: res.statusCode,
        durationMs
      });

      if (res.statusCode >= 400) {
        logger.warn('http', 'Requisicao terminou com erro.', {
          requestId,
          method: req.method,
          path: req.originalUrl,
          statusCode: res.statusCode,
          durationMs: Math.round(durationMs)
        });
      }
    });

    next();
  });

  app.use(express.json({ limit: '1mb' }));
  app.use(express.static(webDir));

  app.get('/health', (req, res) => {
    res.json({
      ok: true,
      service: 'jarvis',
      status: 'online',
      at: new Date().toISOString()
    });
  });

  app.get('/ready', (req, res) => {
    const status = getStatus();
    const ready = Boolean(status.online && status.database?.ok);
    res.status(ready ? 200 : 503).json({
      ok: ready,
      status: ready ? 'ready' : 'degraded',
      database: status.database,
      wakeLoop: status.wakeLoop,
      scheduler: status.scheduler,
      at: new Date().toISOString()
    });
  });

  app.use(['/status', '/jarvis', '/jarvis/listen', '/memory', '/reminders', '/events', '/metrics'], requireApiToken);

  app.get('/status', (req, res) => {
    res.json(getStatus());
  });

  app.get('/metrics', (req, res) => {
    res.type('text/plain').send(metricsService.toPrometheus({ status: getStatus() }));
  });

  app.get('/events', (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
    res.json({
      ok: true,
      events: auditService?.recent({ limit }) || []
    });
  });

  app.post('/jarvis', asyncRoute(async (req, res) => {
    const text = commandText(req);
    const speak = req.body?.speak !== false;
    const response = await pipeline.handleText(text, {
      source: 'http',
      speak
    });

    res.status(response.ok ? 200 : 400).json(response);
  }));

  app.post('/jarvis/listen', asyncRoute(async (req, res) => {
    const simulatedText = commandText(req);

    if (simulatedText) {
      const response = await pipeline.handleText(simulatedText, {
        source: 'web-simulated-voice',
        speak: req.body?.speak !== false
      });
      res.status(response.ok ? 200 : 400).json(response);
      return;
    }

    const durationSeconds = Math.min(Math.max(Number(req.body?.durationSeconds || 6), 1), 30);
    const transcript = await voiceListener.listenOnce({
      durationSeconds,
      prefix: 'manual'
    });

    if (!transcript.text) {
      res.status(422).json({
        ok: false,
        text: 'Nao consegui transcrever o audio.',
        audioPath: transcript.audioPath
      });
      return;
    }

    const response = await pipeline.handleText(transcript.text, {
      source: 'http-listen',
      speak: req.body?.speak !== false,
      rawAudioPath: transcript.audioPath
    });

    res.status(response.ok ? 200 : 400).json(response);
  }));

  app.get('/memory', asyncRoute(async (req, res) => {
    res.json(await memoryService.getMemory());
  }));

  app.post('/memory', asyncRoute(async (req, res) => {
    const kind = String(req.body?.kind || 'notes');
    const text = commandText(req);

    if (!text) {
      res.status(400).json({
        ok: false,
        error: 'Campo text e obrigatorio.'
      });
      return;
    }

    const item = await memoryService.addItem(kind, text);
    res.status(201).json({
      ok: true,
      item
    });
  }));

  app.get('/reminders', asyncRoute(async (req, res) => {
    res.json(await reminderService.listReminders());
  }));

  app.use((error, req, res, next) => {
    logger.error('http', 'Erro nao tratado na API.', error);
    res.status(error.statusCode || 500).json({
      ok: false,
      error: error.statusCode ? error.message : 'Erro interno, sistema continua online.',
      requestId: req.requestId
    });
  });

  return app;
}

export { createApp };
