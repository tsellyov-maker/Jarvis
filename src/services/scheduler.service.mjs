import { logger } from '../core/logger.mjs';
import { eventBus } from '../core/eventBus.mjs';

class SchedulerService {
  constructor({
    reminderService,
    ttsService,
    intervalMs = 30000
  } = {}) {
    this.reminderService = reminderService;
    this.ttsService = ttsService;
    this.intervalMs = intervalMs;
    this.timer = null;
    this.running = false;
    this.ticking = false;
    this.lastTickAt = null;
  }

  start() {
    if (this.running) {
      return;
    }

    this.running = true;
    this.timer = setInterval(() => {
      this.tick();
    }, this.intervalMs);
    this.timer.unref?.();
    logger.info('scheduler', 'Scheduler iniciado.', { intervalMs: this.intervalMs });
    this.tick();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.running = false;
    logger.info('scheduler', 'Scheduler parado.');
  }

  async tick() {
    if (this.ticking) {
      return;
    }

    this.ticking = true;
    this.lastTickAt = new Date().toISOString();

    try {
      const due = await this.reminderService.dueReminders();
      for (const reminder of due) {
        logger.info('scheduler', 'Disparando lembrete.', { id: reminder.id, text: reminder.text });
        await this.ttsService.speak(`Lembrete: ${reminder.text}`);
        const updated = await this.reminderService.markExecuted(reminder.id);
        eventBus.emitEvent('reminder:fired', { reminder: updated });
      }
    } catch (error) {
      logger.error('scheduler', 'Erro no tick do scheduler.', error);
    } finally {
      this.ticking = false;
    }
  }

  getStatus() {
    return {
      running: this.running,
      intervalMs: this.intervalMs,
      lastTickAt: this.lastTickAt
    };
  }
}

export { SchedulerService };
