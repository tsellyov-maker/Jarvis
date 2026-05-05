import { DateTime } from 'luxon';

const LEVEL_TO_CONSOLE = {
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error'
};

const LEVEL_WEIGHT = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

class Logger {
  constructor({
    zone = process.env.TIMEZONE || 'America/Sao_Paulo',
    level = process.env.LOG_LEVEL || 'info',
    format = process.env.LOG_FORMAT || 'text'
  } = {}) {
    this.zone = zone;
    this.level = level;
    this.format = format;
  }

  formatMeta(meta) {
    if (meta === undefined || meta === null) {
      return '';
    }

    if (meta instanceof Error) {
      return ` ${JSON.stringify({ name: meta.name, message: meta.message, stack: meta.stack })}`;
    }

    if (typeof meta === 'string') {
      return ` ${meta}`;
    }

    try {
      return ` ${JSON.stringify(meta)}`;
    } catch {
      return ` ${String(meta)}`;
    }
  }

  write(level, scope, message, meta) {
    if ((LEVEL_WEIGHT[level] || 20) < (LEVEL_WEIGHT[this.level] || 20)) {
      return;
    }

    const ts = DateTime.now().setZone(this.zone).toFormat('yyyy-LL-dd HH:mm:ss');
    const line = this.format === 'json'
      ? JSON.stringify({
          timestamp: DateTime.now().setZone(this.zone).toISO(),
          level,
          scope,
          message,
          meta: meta instanceof Error ? {
            name: meta.name,
            message: meta.message,
            stack: meta.stack
          } : meta ?? null
        })
      : `[${ts}] [${level.toUpperCase()}] [${scope}] ${message}${this.formatMeta(meta)}`;
    const method = LEVEL_TO_CONSOLE[level] || 'log';
    console[method](line);
  }

  debug(scope, message, meta) {
    this.write('debug', scope, message, meta);
  }

  info(scope, message, meta) {
    this.write('info', scope, message, meta);
  }

  warn(scope, message, meta) {
    this.write('warn', scope, message, meta);
  }

  error(scope, message, meta) {
    this.write('error', scope, message, meta);
  }
}

export const logger = new Logger();
export { Logger };
