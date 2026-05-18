import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import { logger } from '../core/logger.mjs';

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..');

function defaultMemoryPath() {
  const dataDir = process.env.DATA_DIR || join(srcDir, 'data');
  return join(dataDir, 'memory.json');
}

const DEFAULT_MEMORY = {
  notes: [],
  facts: [],
  preferences: [],
  history: []
};

class MemoryService {
  constructor({ databaseService = null, filePath = process.env.MEMORY_PATH || defaultMemoryPath() } = {}) {
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
      await this.writeMemory(DEFAULT_MEMORY);
    }
  }

  normalizeMemory(memory) {
    return {
      notes: Array.isArray(memory?.notes) ? memory.notes : [],
      facts: Array.isArray(memory?.facts) ? memory.facts : [],
      preferences: Array.isArray(memory?.preferences) ? memory.preferences : [],
      history: Array.isArray(memory?.history) ? memory.history : []
    };
  }

  async getMemory() {
    if (this.databaseService) {
      const db = this.databaseService.connection();
      const items = db.prepare(`
        SELECT id, kind, text, created_at
        FROM memory_items
        ORDER BY created_at ASC
      `).all();
      const history = db.prepare(`
        SELECT id, source, input, intent, response, audio_path, created_at
        FROM (
          SELECT id, source, input, intent, response, audio_path, created_at
          FROM conversation_history
          ORDER BY created_at DESC
          LIMIT 100
        )
        ORDER BY created_at ASC
      `).all();

      return {
        notes: items.filter((item) => item.kind === 'notes').map((item) => this.mapMemoryRow(item)),
        facts: items.filter((item) => item.kind === 'facts').map((item) => this.mapMemoryRow(item)),
        preferences: items.filter((item) => item.kind === 'preferences').map((item) => this.mapMemoryRow(item)),
        history: history.map((item) => ({
          id: item.id,
          source: item.source,
          input: item.input,
          intent: item.intent,
          response: item.response,
          audioPath: item.audio_path,
          createdAt: item.created_at
        }))
      };
    }

    await this.ensureFile();

    try {
      const data = JSON.parse(await readFile(this.filePath, 'utf8'));
      return this.normalizeMemory(data);
    } catch (error) {
      logger.error('memory', 'Falha ao ler memoria; retornando memoria vazia.', error);
      return { ...DEFAULT_MEMORY };
    }
  }

  async writeMemory(memory) {
    await mkdir(dirname(this.filePath), { recursive: true });
    const normalized = this.normalizeMemory(memory);
    const tmpPath = `${this.filePath}.tmp`;
    await writeFile(tmpPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
    await rename(tmpPath, this.filePath);
    return normalized;
  }

  async addItem(kind, text) {
    if (this.databaseService) {
      const targetKind = ['notes', 'facts', 'preferences'].includes(kind) ? kind : 'notes';
      const item = {
        id: randomUUID(),
        kind: targetKind,
        text,
        createdAt: DateTime.now().setZone(process.env.TIMEZONE || 'America/Sao_Paulo').toISO()
      };

      this.databaseService.connection().prepare(`
        INSERT INTO memory_items (id, kind, text, metadata_json, created_at)
        VALUES (@id, @kind, @text, '{}', @createdAt)
      `).run(item);

      return {
        id: item.id,
        text: item.text,
        createdAt: item.createdAt
      };
    }

    const memory = await this.getMemory();
    const targetKind = Object.hasOwn(memory, kind) ? kind : 'notes';
    const item = {
      id: randomUUID(),
      text,
      createdAt: DateTime.now().setZone(process.env.TIMEZONE || 'America/Sao_Paulo').toISO()
    };

    memory[targetKind].push(item);
    await this.writeMemory(memory);
    return item;
  }

  async listItems(kind = 'notes') {
    if (this.databaseService) {
      const targetKind = ['notes', 'facts', 'preferences'].includes(kind) ? kind : 'notes';
      return this.databaseService.connection().prepare(`
        SELECT id, kind, text, created_at
        FROM memory_items
        WHERE kind = ?
        ORDER BY created_at ASC
      `).all(targetKind).map((item) => this.mapMemoryRow(item));
    }

    const memory = await this.getMemory();
    const targetKind = Object.hasOwn(memory, kind) ? kind : 'notes';
    return memory[targetKind];
  }

  async addHistory(entry) {
    if (this.databaseService) {
      const db = this.databaseService.connection();
      db.prepare(`
        INSERT INTO conversation_history (id, source, input, intent, response, audio_path, created_at)
        VALUES (@id, @source, @input, @intent, @response, @audioPath, @createdAt)
      `).run({
        id: randomUUID(),
        source: String(entry.source || 'unknown'),
        input: String(entry.input || ''),
        intent: String(entry.intent || 'unknown'),
        response: String(entry.response || ''),
        audioPath: entry.audioPath || null,
        createdAt: DateTime.now().setZone(process.env.TIMEZONE || 'America/Sao_Paulo').toISO()
      });

      db.prepare(`
        DELETE FROM conversation_history
        WHERE id NOT IN (
          SELECT id FROM conversation_history
          ORDER BY created_at DESC
          LIMIT 500
        )
      `).run();
      return;
    }

    const memory = await this.getMemory();
    memory.history.push({
      id: randomUUID(),
      ...entry,
      createdAt: DateTime.now().setZone(process.env.TIMEZONE || 'America/Sao_Paulo').toISO()
    });

    memory.history = memory.history.slice(-100);
    await this.writeMemory(memory);
  }

  mapMemoryRow(row) {
    return {
      id: row.id,
      text: row.text,
      createdAt: row.created_at
    };
  }

  async migrateJsonToDatabase() {
    const db = this.databaseService.connection();
    const existing = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM memory_items) AS memoryCount,
        (SELECT COUNT(*) FROM conversation_history) AS historyCount
    `).get();

    if (existing.memoryCount > 0 || existing.historyCount > 0) {
      return;
    }

    let memory;
    try {
      memory = this.normalizeMemory(JSON.parse(await readFile(this.filePath, 'utf8')));
    } catch {
      return;
    }

    const insertItem = db.prepare(`
      INSERT OR IGNORE INTO memory_items (id, kind, text, metadata_json, created_at)
      VALUES (@id, @kind, @text, '{}', @createdAt)
    `);
    const insertHistory = db.prepare(`
      INSERT OR IGNORE INTO conversation_history (id, source, input, intent, response, audio_path, created_at)
      VALUES (@id, @source, @input, @intent, @response, @audioPath, @createdAt)
    `);

    const migrate = db.transaction(() => {
      for (const kind of ['notes', 'facts', 'preferences']) {
        for (const item of memory[kind]) {
          if (!item?.text) {
            continue;
          }

          insertItem.run({
            id: item.id || randomUUID(),
            kind,
            text: item.text,
            createdAt: item.createdAt || DateTime.now().setZone(process.env.TIMEZONE || 'America/Sao_Paulo').toISO()
          });
        }
      }

      for (const item of memory.history) {
        if (!item?.input && !item?.response) {
          continue;
        }

        insertHistory.run({
          id: item.id || randomUUID(),
          source: String(item.source || 'migration'),
          input: String(item.input || ''),
          intent: String(item.intent || 'unknown'),
          response: String(item.response || ''),
          audioPath: item.audioPath || null,
          createdAt: item.createdAt || DateTime.now().setZone(process.env.TIMEZONE || 'America/Sao_Paulo').toISO()
        });
      }
    });

    migrate();
    logger.info('memory', 'Memoria JSON migrada para SQLite quando aplicavel.');
  }
}

export { MemoryService, DEFAULT_MEMORY };
