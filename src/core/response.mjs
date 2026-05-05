import { DateTime } from 'luxon';

export function createJarvisResponse({
  ok = true,
  text = '',
  intent = null,
  source = 'system',
  data = null,
  audioPath = null,
  error = null
} = {}) {
  return {
    ok,
    text,
    intent,
    source,
    data,
    audioPath,
    error: error
      ? {
          name: error.name || 'Error',
          message: error.message || String(error)
        }
      : null,
    createdAt: DateTime.now().setZone(process.env.TIMEZONE || 'America/Sao_Paulo').toISO()
  };
}

export function createErrorResponse(error, { text = 'Tive um problema ao processar isso.', source = 'system' } = {}) {
  return createJarvisResponse({
    ok: false,
    text,
    source,
    error
  });
}
