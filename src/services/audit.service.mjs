import { randomUUID } from 'node:crypto';
import { logger } from '../core/logger.mjs';

class AuditService {
  constructor({ databaseService } = {}) {
    this.databaseService = databaseService;
  }

  record(event) {
    if (!this.databaseService) {
      return;
    }

    try {
      this.databaseService.insertAuditEvent({
        id: randomUUID(),
        type: event.type,
        payload: this.sanitizePayload(event),
        createdAt: event.at
      });
    } catch (error) {
      logger.warn('audit', 'Falha ao persistir evento de auditoria.', error);
    }
  }

  recent({ limit = 50 } = {}) {
    if (!this.databaseService) {
      return [];
    }

    try {
      return this.databaseService.listAuditEvents({ limit });
    } catch (error) {
      logger.warn('audit', 'Falha ao listar eventos de auditoria.', error);
      return [];
    }
  }

  sanitizePayload(event) {
    const payload = event.payload || {};

    if (event.type === 'jarvis:command') {
      return {
        text: payload.text,
        source: payload.source,
        rawAudioPath: payload.rawAudioPath || null
      };
    }

    if (event.type === 'jarvis:response') {
      return {
        ok: payload.ok,
        text: payload.text,
        intent: payload.intent?.type || payload.intent || null,
        source: payload.source,
        audioPath: payload.audioPath || null,
        createdAt: payload.createdAt
      };
    }

    if (event.type === 'reminder:fired') {
      return {
        reminderId: payload.reminder?.id,
        text: payload.reminder?.text,
        dueAt: payload.reminder?.dueAt,
        executedAt: payload.reminder?.executedAt
      };
    }

    return payload;
  }
}

export { AuditService };
