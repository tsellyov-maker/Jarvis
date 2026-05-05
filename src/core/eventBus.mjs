import { EventEmitter } from 'node:events';
import { DateTime } from 'luxon';

class JarvisEventBus extends EventEmitter {
  emitEvent(type, payload = {}) {
    const event = {
      type,
      payload,
      at: DateTime.now().setZone(process.env.TIMEZONE || 'America/Sao_Paulo').toISO()
    };

    this.emit(type, event);
    this.emit('*', event);
    return event;
  }
}

export const eventBus = new JarvisEventBus();
export { JarvisEventBus };
