import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import { logger } from '../core/logger.mjs';

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..');

function defaultRemindersPath() {
  const dataDir = process.env.DATA_DIR || join(srcDir, 'data');
  return join(dataDir, 'reminders.json');
}

class ReminderService {
  constructor({ databaseService = null, filePath = process.env.REMINDERS_PATH || defaultRemindersPath() } = {}) {
    this.databaseService = databaseService;
    this.filePath = filePath;
  }

  async ensureStorage() {
    if (this.databaseService) {
      await this.migrateJsonToDatabase();
      return;
    }

    await this.ensureFile();
  }

  async ensureFile() {
    if (this.databaseService) {
      await this.ensureStorage();
      return;
    }

    await mkdir(dirname(this.filePath), { recursive: true });

    try {
      await readFile(this.filePath, 'utf8');
    } catch {
      await this.writeReminders([]);
    }
  }

  normalizeReminders(reminders) {
    return Array.isArray(reminders) ? reminders : [];
  }

  async listReminders() {
    if (this.databaseService) {
      return this.databaseService.connection().prepare(`
        SELECT id, text, due_at, created_at, executed, executed_at
        FROM reminders
        ORDER BY due_at ASC, created_at ASC
      `).all().map((row) => this.mapReminderRow(row));
    }

    await this.ensureFile();

    try {
      return this.normalizeReminders(JSON.parse(await readFile(this.filePath, 'utf8')));
    } catch (error) {
      logger.error('reminders', 'Falha ao ler lembretes; retornando lista vazia.', error);
      return [];
    }
  }

  async writeReminders(reminders) {
    await mkdir(dirname(this.filePath), { recursive: true });
    const normalized = this.normalizeReminders(reminders);
    const tmpPath = `${this.filePath}.tmp`;
    await writeFile(tmpPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
    await rename(tmpPath, this.filePath);
    return normalized;
  }

  async addReminder({ text, dueAt }) {
    if (this.databaseService) {
      const reminder = {
        id: randomUUID(),
        text,
        dueAt,
        createdAt: DateTime.now().setZone(process.env.TIMEZONE || 'America/Sao_Paulo').toISO(),
        executed: false,
        executedAt: null
      };

      this.databaseService.connection().prepare(`
        INSERT INTO reminders (id, text, due_at, created_at, executed, executed_at, metadata_json)
        VALUES (@id, @text, @dueAt, @createdAt, 0, NULL, '{}')
      `).run(reminder);

      return reminder;
    }

    const reminders = await this.listReminders();
    const reminder = {
      id: randomUUID(),
      text,
      dueAt,
      createdAt: DateTime.now().setZone(process.env.TIMEZONE || 'America/Sao_Paulo').toISO(),
      executed: false,
      executedAt: null
    };

    reminders.push(reminder);
    await this.writeReminders(reminders);
    return reminder;
  }

  async dueReminders(now = DateTime.now().setZone(process.env.TIMEZONE || 'America/Sao_Paulo')) {
    if (this.databaseService) {
      return this.databaseService.connection().prepare(`
        SELECT id, text, due_at, created_at, executed, executed_at
        FROM reminders
        WHERE executed = 0 AND due_at <= ?
        ORDER BY due_at ASC
      `).all(now.toISO()).map((row) => this.mapReminderRow(row));
    }

    const reminders = await this.listReminders();
    return reminders.filter((reminder) => {
      if (reminder.executed || !reminder.dueAt) {
        return false;
      }

      const dueAt = DateTime.fromISO(reminder.dueAt, { zone: process.env.TIMEZONE || 'America/Sao_Paulo' });
      return dueAt.isValid && dueAt <= now;
    });
  }

  async markExecuted(id) {
    if (this.databaseService) {
      const now = DateTime.now().setZone(process.env.TIMEZONE || 'America/Sao_Paulo').toISO();
      const db = this.databaseService.connection();
      db.prepare(`
        UPDATE reminders
        SET executed = 1, executed_at = ?
        WHERE id = ?
      `).run(now, id);

      const row = db.prepare(`
        SELECT id, text, due_at, created_at, executed, executed_at
        FROM reminders
        WHERE id = ?
      `).get(id);

      return row ? this.mapReminderRow(row) : null;
    }

    const reminders = await this.listReminders();
    const now = DateTime.now().setZone(process.env.TIMEZONE || 'America/Sao_Paulo').toISO();
    const updated = reminders.map((reminder) => reminder.id === id
      ? {
          ...reminder,
          executed: true,
          executedAt: now
        }
      : reminder);

    await this.writeReminders(updated);
    return updated.find((reminder) => reminder.id === id) || null;
  }

  mapReminderRow(row) {
    return {
      id: row.id,
      text: row.text,
      dueAt: row.due_at,
      createdAt: row.created_at,
      executed: Boolean(row.executed),
      executedAt: row.executed_at
    };
  }

  async migrateJsonToDatabase() {
    const db = this.databaseService.connection();
    const existing = db.prepare('SELECT COUNT(*) AS count FROM reminders').get();
    if (existing.count > 0) {
      return;
    }

    let reminders;
    try {
      reminders = this.normalizeReminders(JSON.parse(await readFile(this.filePath, 'utf8')));
    } catch {
      return;
    }

    const insert = db.prepare(`
      INSERT OR IGNORE INTO reminders (id, text, due_at, created_at, executed, executed_at, metadata_json)
      VALUES (@id, @text, @dueAt, @createdAt, @executed, @executedAt, '{}')
    `);

    const migrate = db.transaction(() => {
      for (const reminder of reminders) {
        if (!reminder?.text || !reminder?.dueAt) {
          continue;
        }

        insert.run({
          id: reminder.id || randomUUID(),
          text: reminder.text,
          dueAt: reminder.dueAt,
          createdAt: reminder.createdAt || DateTime.now().setZone(process.env.TIMEZONE || 'America/Sao_Paulo').toISO(),
          executed: reminder.executed ? 1 : 0,
          executedAt: reminder.executedAt || null
        });
      }
    });

    migrate();
    logger.info('reminders', 'Lembretes JSON migrados para SQLite quando aplicavel.');
  }
}

export { ReminderService };
