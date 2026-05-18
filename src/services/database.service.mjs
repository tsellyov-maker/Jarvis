import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { DateTime } from 'luxon';
import { logger } from '../core/logger.mjs';

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..');

function nowIso() {
  return DateTime.now().setZone(process.env.TIMEZONE || 'America/Sao_Paulo').toISO();
}

function defaultDbPath() {
  const dataDir = process.env.DATA_DIR || join(srcDir, 'data');
  return join(dataDir, 'jarvis.sqlite');
}

class DatabaseService {
  constructor({ filePath = process.env.DB_PATH || defaultDbPath() } = {}) {
    this.filePath = resolve(filePath);
    this.db = null;
    this.initializedAt = null;
  }

  async initialize() {
    await mkdir(dirname(this.filePath), { recursive: true });
    this.db = new Database(this.filePath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    this.migrate();
    this.initializedAt = nowIso();
    logger.info('database', 'SQLite inicializado.', { filePath: this.filePath });
  }

  migrate() {
    this.assertOpen();
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS memory_items (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('notes', 'facts', 'preferences')),
        text TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_memory_items_kind_created
        ON memory_items (kind, created_at);

      CREATE TABLE IF NOT EXISTS conversation_history (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        input TEXT NOT NULL,
        intent TEXT NOT NULL,
        response TEXT NOT NULL,
        audio_path TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_conversation_history_created
        ON conversation_history (created_at);

      CREATE TABLE IF NOT EXISTS reminders (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        due_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        executed INTEGER NOT NULL DEFAULT 0,
        executed_at TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );

      CREATE INDEX IF NOT EXISTS idx_reminders_pending_due
        ON reminders (executed, due_at);

      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_audit_events_created
        ON audit_events (created_at);

      CREATE TABLE IF NOT EXISTS runtime_kv (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    const applied = this.db.prepare('SELECT 1 FROM schema_migrations WHERE name = ?').get('001_initial_schema');
    if (!applied) {
      this.db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run('001_initial_schema', nowIso());
    }
  }

  assertOpen() {
    if (!this.db) {
      throw new Error('Banco de dados nao inicializado.');
    }
  }

  connection() {
    this.assertOpen();
    return this.db;
  }

  health() {
    try {
      this.assertOpen();
      const result = this.db.prepare('SELECT 1 AS ok').get();
      return {
        ok: result?.ok === 1,
        path: this.filePath,
        initializedAt: this.initializedAt
      };
    } catch (error) {
      return {
        ok: false,
        path: this.filePath,
        initializedAt: this.initializedAt,
        error: error.message
      };
    }
  }

  insertAuditEvent({ id, type, payload, createdAt = nowIso() }) {
    this.assertOpen();
    this.db.prepare(`
      INSERT INTO audit_events (id, type, payload_json, created_at)
      VALUES (@id, @type, @payloadJson, @createdAt)
    `).run({
      id,
      type,
      payloadJson: JSON.stringify(payload ?? {}),
      createdAt
    });
  }

  listAuditEvents({ limit = 50 } = {}) {
    this.assertOpen();
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    return this.db.prepare(`
      SELECT id, type, payload_json, created_at
      FROM audit_events
      ORDER BY created_at DESC
      LIMIT ?
    `).all(safeLimit).map((row) => ({
      id: row.id,
      type: row.type,
      payload: JSON.parse(row.payload_json || '{}'),
      createdAt: row.created_at
    }));
  }

  close() {
    if (!this.db) {
      return;
    }

    this.db.close();
    this.db = null;
    logger.info('database', 'Conexao SQLite encerrada.');
  }
}

export { DatabaseService };
