import { DateTime } from 'luxon';

function labelKey(labels = {}) {
  const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) {
    return '';
  }

  return entries.map(([key, value]) => `${key}=${String(value)}`).join(',');
}

function prometheusLabels(labels = {}) {
  const entries = Object.entries(labels);
  if (entries.length === 0) {
    return '';
  }

  const body = entries
    .map(([key, value]) => `${key}="${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
    .join(',');
  return `{${body}}`;
}

class MetricsService {
  constructor({ zone = process.env.TIMEZONE || 'America/Sao_Paulo' } = {}) {
    this.zone = zone;
    this.startedAt = DateTime.now().setZone(zone);
    this.counters = new Map();
    this.httpDurations = [];
    this.pipelineDurations = [];
  }

  increment(name, labels = {}, amount = 1) {
    const key = `${name}|${labelKey(labels)}`;
    const current = this.counters.get(key) || {
      name,
      labels,
      value: 0
    };

    current.value += amount;
    this.counters.set(key, current);
  }

  observeHttp({ method, route, statusCode, durationMs }) {
    this.increment('jarvis_http_requests_total', {
      method,
      route,
      status: statusCode
    });
    this.httpDurations.push(Number(durationMs) || 0);
    this.httpDurations = this.httpDurations.slice(-500);
  }

  observePipeline({ source, intent, ok, durationMs }) {
    this.increment('jarvis_pipeline_requests_total', {
      source,
      intent,
      ok: ok ? 'true' : 'false'
    });

    if (!ok) {
      this.increment('jarvis_pipeline_errors_total', { source, intent });
    }

    this.pipelineDurations.push(Number(durationMs) || 0);
    this.pipelineDurations = this.pipelineDurations.slice(-500);
  }

  average(values) {
    if (values.length === 0) {
      return 0;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  snapshot() {
    return {
      startedAt: this.startedAt.toISO(),
      uptimeSeconds: Math.floor(DateTime.now().setZone(this.zone).diff(this.startedAt).as('seconds')),
      counters: Array.from(this.counters.values()),
      http: {
        samples: this.httpDurations.length,
        averageMs: Math.round(this.average(this.httpDurations))
      },
      pipeline: {
        samples: this.pipelineDurations.length,
        averageMs: Math.round(this.average(this.pipelineDurations))
      }
    };
  }

  toPrometheus({ status = {} } = {}) {
    const lines = [
      '# HELP jarvis_uptime_seconds Seconds since Jarvis process started.',
      '# TYPE jarvis_uptime_seconds gauge',
      `jarvis_uptime_seconds ${this.snapshot().uptimeSeconds}`,
      '# HELP jarvis_online Whether Jarvis process is online.',
      '# TYPE jarvis_online gauge',
      `jarvis_online ${status.online ? 1 : 0}`,
      '# HELP jarvis_wake_loop_running Whether wake loop is running.',
      '# TYPE jarvis_wake_loop_running gauge',
      `jarvis_wake_loop_running ${status.wakeLoop?.running ? 1 : 0}`,
      '# HELP jarvis_scheduler_running Whether scheduler is running.',
      '# TYPE jarvis_scheduler_running gauge',
      `jarvis_scheduler_running ${status.scheduler?.running ? 1 : 0}`,
      '# HELP jarvis_database_ok Whether SQLite health check is passing.',
      '# TYPE jarvis_database_ok gauge',
      `jarvis_database_ok ${status.database?.ok ? 1 : 0}`,
      '# HELP jarvis_offline_mode Whether Jarvis is currently in offline mode.',
      '# TYPE jarvis_offline_mode gauge',
      `jarvis_offline_mode ${status.offlineMode ? 1 : 0}`,
      '# HELP jarvis_internet_online Whether internet connectivity check is passing.',
      '# TYPE jarvis_internet_online gauge',
      `jarvis_internet_online ${status.network?.internetOnline ? 1 : 0}`,
      '# HELP jarvis_http_request_duration_average_ms Rolling average HTTP request duration.',
      '# TYPE jarvis_http_request_duration_average_ms gauge',
      `jarvis_http_request_duration_average_ms ${Math.round(this.average(this.httpDurations))}`,
      '# HELP jarvis_pipeline_duration_average_ms Rolling average command pipeline duration.',
      '# TYPE jarvis_pipeline_duration_average_ms gauge',
      `jarvis_pipeline_duration_average_ms ${Math.round(this.average(this.pipelineDurations))}`
    ];

    for (const counter of this.counters.values()) {
      lines.push(`# TYPE ${counter.name} counter`);
      lines.push(`${counter.name}${prometheusLabels(counter.labels)} ${counter.value}`);
    }

    return `${lines.join('\n')}\n`;
  }
}

export { MetricsService };
