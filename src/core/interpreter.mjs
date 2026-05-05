import { DateTime } from 'luxon';
import { logger } from './logger.mjs';

const ALLOWED_INTENTS = new Set([
  'light_on',
  'light_off',
  'scene',
  'memory_add',
  'memory_list',
  'reminder_create',
  'reminder_list',
  'time',
  'system_status',
  'conversation'
]);

function normalizeText(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function stripJarvisPrefix(text) {
  return String(text || '').replace(/^\s*jarvis[:,]?\s*/i, '').trim();
}

function extractAfterRegex(text, regex) {
  const match = String(text || '').match(regex);
  return match && match[1] ? match[1].trim() : '';
}

function parseReminderDueAt(rawTime, zone) {
  const now = DateTime.now().setZone(zone);
  const original = String(rawTime || '').trim();
  const normalized = normalizeText(original);

  if (!normalized) {
    return null;
  }

  const relative = normalized.match(/(?:em\s+)?(\d+)\s*(segundo|segundos|minuto|minutos|hora|horas|dia|dias)\b/);
  if (relative) {
    const amount = Number(relative[1]);
    const unitWord = relative[2];
    const unit =
      unitWord.startsWith('segundo') ? 'seconds' :
      unitWord.startsWith('minuto') ? 'minutes' :
      unitWord.startsWith('hora') ? 'hours' :
      'days';

    return now.plus({ [unit]: amount }).toISO();
  }

  let base = now;
  const hasTomorrow = normalized.includes('amanha');
  const hasToday = normalized.includes('hoje');

  if (hasTomorrow) {
    base = base.plus({ days: 1 });
  }

  const dateMatch = original.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (dateMatch) {
    const day = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    let year = dateMatch[3] ? Number(dateMatch[3]) : now.year;

    if (year < 100) {
      year += 2000;
    }

    const date = DateTime.fromObject({ year, month, day }, { zone });
    if (date.isValid) {
      base = date;
    }
  }

  const timeMatch = original.match(/\b(\d{1,2})(?::|h)(\d{2})?\b|\b(\d{1,2})\s*(?:horas|hora)\b/i);
  if (!timeMatch) {
    return null;
  }

  const hour = Number(timeMatch[1] || timeMatch[3]);
  const minute = Number(timeMatch[2] || 0);
  const due = base.set({ hour, minute, second: 0, millisecond: 0 });

  if (!due.isValid) {
    return null;
  }

  if (!hasTomorrow && !hasToday && !dateMatch && due <= now) {
    return due.plus({ days: 1 }).toISO();
  }

  return due.toISO();
}

function parseReminder(text, zone) {
  const clean = stripJarvisPrefix(text);
  const match = clean.match(/lembre(?:-me)?\s+de\s+(.+?)(?:\s+(?:as|às|para|em)\s+(.+))?$/i);

  if (!match) {
    return null;
  }

  const reminderText = (match[1] || '').trim();
  const timeText = (match[2] || '').trim();

  return {
    text: reminderText,
    timeText,
    dueAt: parseReminderDueAt(timeText, zone)
  };
}

function sanitizeAiIntent(intent) {
  if (!intent || typeof intent !== 'object') {
    return null;
  }

  const type = String(intent.type || '').trim();
  if (!ALLOWED_INTENTS.has(type)) {
    return null;
  }

  return {
    type,
    confidence: Number(intent.confidence || 0),
    parameters: intent.parameters && typeof intent.parameters === 'object' ? intent.parameters : {},
    source: 'ai-command-classifier'
  };
}

class Interpreter {
  constructor({ aiService, zone = process.env.TIMEZONE || 'America/Sao_Paulo' } = {}) {
    this.aiService = aiService;
    this.zone = zone;
  }

  async interpret(text) {
    const original = String(text || '').trim();
    const clean = stripJarvisPrefix(original);
    const normalized = normalizeText(clean);

    if (!normalized) {
      return {
        type: 'conversation',
        confidence: 0,
        parameters: {},
        source: 'empty'
      };
    }

    const deterministic = this.interpretDeterministic(clean, normalized);
    if (deterministic) {
      return deterministic;
    }

    if (this.aiService) {
      try {
        const aiIntent = sanitizeAiIntent(await this.aiService.classifyCommand(clean));
        if (aiIntent && aiIntent.confidence >= 0.65 && aiIntent.type !== 'conversation') {
          return aiIntent;
        }
      } catch (error) {
        logger.warn('interpreter', 'Classificacao por IA falhou; usando conversa como fallback.', error);
      }
    }

    return {
      type: 'conversation',
      confidence: 0.5,
      parameters: {},
      source: 'fallback'
    };
  }

  interpretDeterministic(clean, normalized) {
    if (normalized.includes('luz do quarto') && /(ligar|liga|acender|acenda)/.test(normalized)) {
      return {
        type: 'light_on',
        confidence: 1,
        parameters: { room: 'quarto' },
        source: 'rule'
      };
    }

    if (normalized.includes('luz do quarto') && /(desligar|desliga|apagar|apague)/.test(normalized)) {
      return {
        type: 'light_off',
        confidence: 1,
        parameters: { room: 'quarto' },
        source: 'rule'
      };
    }

    for (const scene of ['cinema', 'relaxar', 'foco', 'noturno']) {
      if (normalized.includes(`modo ${scene}`)) {
        return {
          type: 'scene',
          confidence: 1,
          parameters: { scene },
          source: 'rule'
        };
      }
    }

    const note = extractAfterRegex(clean, /^(?:anotar|anote|registre|guarde)\s+que\s+(.+)$/i);
    if (note) {
      return {
        type: 'memory_add',
        confidence: 1,
        parameters: { kind: 'notes', text: note },
        source: 'rule'
      };
    }

    if (/(listar notas|liste notas|minhas notas|mostrar notas|mostre minhas notas)/.test(normalized)) {
      return {
        type: 'memory_list',
        confidence: 1,
        parameters: { kind: 'notes' },
        source: 'rule'
      };
    }

    if (normalized.startsWith('lembre-me de') || normalized.startsWith('lembre de')) {
      const reminder = parseReminder(clean, this.zone);
      return {
        type: 'reminder_create',
        confidence: 1,
        parameters: reminder || { text: clean, dueAt: null },
        source: 'rule'
      };
    }

    if (/(listar lembretes|meus lembretes|quais lembretes|mostrar lembretes)/.test(normalized)) {
      return {
        type: 'reminder_list',
        confidence: 1,
        parameters: {},
        source: 'rule'
      };
    }

    if (/(que horas sao|hora atual|horario atual|me diga as horas)/.test(normalized)) {
      return {
        type: 'time',
        confidence: 1,
        parameters: {},
        source: 'rule'
      };
    }

    if (/(status do sistema|diagnostico do sistema|como esta o sistema|estado do sistema)/.test(normalized)) {
      return {
        type: 'system_status',
        confidence: 1,
        parameters: {},
        source: 'rule'
      };
    }

    return null;
  }
}

export { Interpreter, normalizeText, parseReminderDueAt };
