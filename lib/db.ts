import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { getConfig } from "@/lib/config";

type DatabaseCache = {
  db?: DatabaseSync;
};

const globalCache = globalThis as typeof globalThis & DatabaseCache;

function initializeDatabase(db: DatabaseSync) {
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
}

export function getDb() {
  if (!globalCache.db) {
    const { dbPath } = getConfig();

    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    const db = new DatabaseSync(dbPath);
    initializeDatabase(db);
    globalCache.db = db;
  }

  return globalCache.db;
}

export function createSession(sessionId: string, expiresAt: number) {
  const db = getDb();
  const now = Date.now();

  db.prepare(
    `
      INSERT INTO sessions (id, expires_at, created_at)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        expires_at = excluded.expires_at,
        created_at = excluded.created_at
    `,
  ).run(sessionId, expiresAt, now);

  db.prepare(`DELETE FROM sessions WHERE expires_at <= ?`).run(now);
}

export function findSession(sessionId: string) {
  const db = getDb();

  const row = db
    .prepare(`SELECT id, expires_at AS expiresAt, created_at AS createdAt FROM sessions WHERE id = ?`)
    .get(sessionId) as
    | {
        id: string;
        expiresAt: number;
        createdAt: number;
      }
    | undefined;

  if (!row) {
    return null;
  }

  if (row.expiresAt <= Date.now()) {
    deleteSession(sessionId);
    return null;
  }

  return row;
}

export function deleteSession(sessionId: string) {
  getDb().prepare(`DELETE FROM sessions WHERE id = ?`).run(sessionId);
}
