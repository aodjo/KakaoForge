import { DatabaseSync } from 'node:sqlite';
import { KAKAO_SECONDARY_SCHEMA_INDEXES, KAKAO_SECONDARY_SCHEMA_TABLES } from './kakao-schema-secondary';

function normalizeSql(sql: string) {
  return sql.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
}

export class KakaoSecondaryDb {
  dbPath: string;
  db: DatabaseSync;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.db = new DatabaseSync(dbPath);
    try {
      this.db.exec('PRAGMA journal_mode=WAL');
      this.db.exec('PRAGMA synchronous=NORMAL');
      this.db.exec('PRAGMA temp_store=MEMORY');
      this.initSchema();
      this.validateSchema();
    } catch (err) {
      try {
        this.db.close();
      } catch {
        // ignore
      }
      throw err;
    }
  }

  initSchema() {
    for (const sql of KAKAO_SECONDARY_SCHEMA_TABLES) {
      try {
        this.db.exec(normalizeSql(sql));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/already exists/i.test(message)) {
          continue;
        }
        throw err;
      }
    }
    for (const sql of KAKAO_SECONDARY_SCHEMA_INDEXES) {
      try {
        this.db.exec(normalizeSql(sql));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/already exists/i.test(message)) {
          continue;
        }
        throw err;
      }
    }
  }

  validateSchema() {
    const rows = this.db.prepare("PRAGMA table_info('friends')").all();
    const names = new Set(rows.map((row: any) => String(row.name)));
    const required = ['id', 'name', 'phone_number'];
    const missing = required.filter((name) => !names.has(name));
    if (missing.length > 0) {
      throw new Error(`secondary schema mismatch: friends missing ${missing.join(', ')}`);
    }
  }

  close() {
    this.db.close();
  }
}
