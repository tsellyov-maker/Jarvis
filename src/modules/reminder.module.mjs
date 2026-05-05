import { DateTime } from 'luxon';

class ReminderModule {
  constructor({ reminderService, zone = process.env.TIMEZONE || 'America/Sao_Paulo' } = {}) {
    this.reminderService = reminderService;
    this.zone = zone;
  }

  async handle(intent) {
    if (intent.type === 'reminder_list') {
      const reminders = await this.reminderService.listReminders();
      const pending = reminders.filter((reminder) => !reminder.executed);

      if (pending.length === 0) {
        return {
          ok: true,
          text: 'Voce nao tem lembretes pendentes.',
          data: { reminders }
        };
      }

      const list = pending
        .slice(0, 5)
        .map((reminder) => {
          const due = DateTime.fromISO(reminder.dueAt, { zone: this.zone }).toFormat('dd/LL HH:mm');
          return `${reminder.text} em ${due}`;
        })
        .join('; ');

      return {
        ok: true,
        text: `Seus proximos lembretes: ${list}.`,
        data: { reminders }
      };
    }

    const reminderText = String(intent.parameters?.text || '').trim();
    const dueAt = intent.parameters?.dueAt || null;

    if (!reminderText || !dueAt) {
      return {
        ok: false,
        text: 'Posso criar o lembrete, mas preciso de uma hora clara. Por exemplo: lembre-me de beber agua as 15:30.',
        data: { parameters: intent.parameters }
      };
    }

    const reminder = await this.reminderService.addReminder({
      text: reminderText,
      dueAt
    });
    const due = DateTime.fromISO(reminder.dueAt, { zone: this.zone }).toFormat("dd/LL 'as' HH:mm");

    return {
      ok: true,
      text: `Combinado. Vou lembrar voce de ${reminder.text} em ${due}.`,
      data: { reminder }
    };
  }
}

export { ReminderModule };
