import { DateTime, Duration } from 'luxon';

function formatUptime(startedAt, zone) {
  const start = DateTime.fromISO(startedAt, { zone });
  if (!start.isValid) {
    return 'tempo desconhecido';
  }

  const duration = Duration.fromMillis(DateTime.now().setZone(zone).diff(start).milliseconds).shiftTo('hours', 'minutes', 'seconds');
  const hours = Math.floor(duration.hours);
  const minutes = Math.floor(duration.minutes);
  const seconds = Math.floor(duration.seconds);

  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }

  if (minutes > 0) {
    return `${minutes}min ${seconds}s`;
  }

  return `${seconds}s`;
}

class SystemModule {
  constructor({ getStatus, zone = process.env.TIMEZONE || 'America/Sao_Paulo' } = {}) {
    this.getStatus = getStatus;
    this.zone = zone;
  }

  async handle(intent) {
    if (intent.type === 'time') {
      const now = DateTime.now().setZone(this.zone);
      return {
        ok: true,
        text: `Agora sao ${now.toFormat('HH:mm')}.`,
        data: {
          iso: now.toISO(),
          timezone: this.zone
        }
      };
    }

    const status = this.getStatus();
    const uptime = formatUptime(status.startedAt, this.zone);
    const wake = status.wakeLoop?.running ? 'ativo' : 'parado';
    const scheduler = status.scheduler?.running ? 'ativo' : 'parado';
    const microphone = status.microphone?.available ? 'disponivel' : 'indisponivel';
    const database = status.database?.ok ? 'online' : 'degradado';
    const connectivity = status.offlineMode ? 'offline' : 'online';

    return {
      ok: true,
      text: `Sistema online ha ${uptime}. Conectividade ${connectivity}, banco ${database}, wake loop ${wake}, scheduler ${scheduler}, microfone ${microphone}.`,
      data: status
    };
  }
}

export { SystemModule };
