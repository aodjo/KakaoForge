import { DatabaseSync } from 'node:sqlite';
import { KAKAO_SCHEMA_INDEXES, KAKAO_SCHEMA_TABLES } from './kakao-schema';

function normalizeSql(sql: string) {
  return sql.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
}

function toDbValue(value: any): any {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : null;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'string') {
    if (!value) return null;
    if (/^-?\d+$/.test(value)) {
      try {
        return BigInt(value);
      } catch {
        return value;
      }
    }
    return value;
  }
  if (typeof value === 'object' && typeof value.toString === 'function') {
    return toDbValue(value.toString());
  }
  return null;
}

function toDbText(value: any): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export type StoredChatLog = {
  logId: number | string;
  chatId: number | string;
  userId: number | string;
  type?: number;
  message?: string;
  attachment?: string | null;
  createdAt?: number;
  deletedAt?: number;
  clientMsgId?: number | string;
  prevId?: number | string;
  referer?: number;
  supplement?: string | null;
  v?: string | null;
  threadId?: number | string;
};

export class KakaoDb {
  dbPath: string;
  db: DatabaseSync;

  private _insertChatLogStmt;
  private _insertChatRoomStmt;
  private _updateChatRoomStmt;
  private _insertThreadStmt;
  private _updateThreadStmt;
  private _selectChatLogsByUserStmt;
  private _selectChatLogStmt;
  private _selectLatestLogIdStmt;
  private _selectOldestLogIdStmt;
  private _selectChatRoomStmt;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode=WAL');
    this.db.exec('PRAGMA synchronous=NORMAL');
    this.db.exec('PRAGMA temp_store=MEMORY');
    this.initSchema();
    this.prepare();
  }

  initSchema() {
    for (const sql of KAKAO_SCHEMA_TABLES) {
      this.db.exec(normalizeSql(sql));
    }
    for (const sql of KAKAO_SCHEMA_INDEXES) {
      this.db.exec(normalizeSql(sql));
    }
  }

  prepare() {
    this._insertChatLogStmt = this.db.prepare(
      'INSERT OR IGNORE INTO chat_logs (id, type, chat_id, user_id, message, attachment, created_at, deleted_at, client_message_id, prev_id, referer, supplement, v) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    this._insertChatRoomStmt = this.db.prepare('INSERT OR IGNORE INTO chat_rooms (id) VALUES (?)');
    this._updateChatRoomStmt = this.db.prepare(
      'UPDATE chat_rooms SET last_log_id = ?, last_message = ?, last_updated_at = ?, last_chat_log_type = ?, link_id = COALESCE(?, link_id) WHERE id = ?'
    );
    this._insertThreadStmt = this.db.prepare(
      'INSERT OR IGNORE INTO chat_threads (chat_id, thread_id, last_chat_log_id, last_read_log_id, last_display_log_id, mentioned_chat_log_id, new_chat_log_id, has_mention, has_new, is_participating, count, v) VALUES (?, ?, ?, 0, ?, NULL, ?, 0, 1, 1, 0, NULL)'
    );
    this._updateThreadStmt = this.db.prepare(
      'UPDATE chat_threads SET last_chat_log_id = ?, last_display_log_id = ?, new_chat_log_id = ?, has_new = 1 WHERE chat_id = ? AND thread_id = ?'
    );
    this._selectChatLogsByUserStmt = this.db.prepare(
      'SELECT * FROM chat_logs WHERE chat_id = ? AND user_id = ? AND (? = 0 OR id > ?) AND (? = 0 OR id <= ?) ORDER BY id DESC LIMIT ?'
    );
    this._selectChatRoomStmt = this.db.prepare('SELECT * FROM chat_rooms WHERE id = ? LIMIT 1');
    this._selectChatLogStmt = this.db.prepare('SELECT * FROM chat_logs WHERE chat_id = ? AND id = ? LIMIT 1');
    this._selectLatestLogIdStmt = this.db.prepare('SELECT MAX(id) AS max_id FROM chat_logs WHERE chat_id = ?');
    this._selectOldestLogIdStmt = this.db.prepare('SELECT MIN(id) AS min_id FROM chat_logs WHERE chat_id = ?');
  }

  close() {
    this.db.close();
  }

  storeChatLog(
    log: StoredChatLog,
    opts: {
      lastMessage?: string;
      openLinkId?: number | string;
      updateRoom?: boolean;
      updateThread?: boolean;
    } = {}
  ) {
    const chatId = toDbValue(log.chatId);
    const logId = toDbValue(log.logId);
    if (!chatId || !logId) return;

    const type = typeof log.type === 'number' ? log.type : null;
    const userId = toDbValue(log.userId);
    const message = log.message ?? null;
    const attachment = toDbText(log.attachment);
    const createdAt = typeof log.createdAt === 'number' ? log.createdAt : 0;
    const deletedAt = typeof log.deletedAt === 'number' ? log.deletedAt : 0;
    const clientMsgId = toDbValue(log.clientMsgId);
    const prevId = toDbValue(log.prevId);
    const referer = typeof log.referer === 'number' ? log.referer : null;
    const supplement = log.supplement ?? null;
    const v = log.v ?? null;

    this._insertChatLogStmt.run(
      logId,
      type,
      chatId,
      userId,
      message,
      attachment,
      createdAt,
      deletedAt,
      clientMsgId,
      prevId,
      referer,
      supplement,
      v
    );

    this._insertChatRoomStmt.run(chatId);
    if (opts.updateRoom !== false) {
      const lastMessage = opts.lastMessage ?? message ?? attachment ?? '';
      const linkId = opts.openLinkId !== undefined ? toDbValue(opts.openLinkId) : null;
      this._updateChatRoomStmt.run(logId, lastMessage, createdAt || 0, type ?? 1, linkId, chatId);
    }

    const threadId = toDbValue(log.threadId);
    if (threadId && opts.updateThread !== false) {
      this._insertThreadStmt.run(chatId, threadId, logId, logId, logId);
      this._updateThreadStmt.run(logId, logId, logId, chatId, threadId);
    }
  }

  getChatLogsByUser(chatId: number | string, userId: number | string, opts: { since?: number | string; max?: number | string; limit?: number } = {}) {
    const chatIdValue = toDbValue(chatId);
    const userIdValue = toDbValue(userId);
    if (!chatIdValue || !userIdValue) return [];
    const since = toDbValue(opts.since ?? 0) ?? 0;
    const max = toDbValue(opts.max ?? 0) ?? 0;
    const limit = typeof opts.limit === 'number' ? opts.limit : 50;
    return this._selectChatLogsByUserStmt.all(chatIdValue, userIdValue, since, since, max, max, limit);
  }

  getChatLog(chatId: number | string, logId: number | string) {
    const chatIdValue = toDbValue(chatId);
    const logIdValue = toDbValue(logId);
    if (!chatIdValue || !logIdValue) return null;
    return this._selectChatLogStmt.get(chatIdValue, logIdValue);
  }

  getLatestChatLogId(chatId: number | string) {
    const chatIdValue = toDbValue(chatId);
    if (!chatIdValue) return 0;
    const row = this._selectLatestLogIdStmt.get(chatIdValue);
    return row?.max_id ?? 0;
  }

  getOldestChatLogId(chatId: number | string) {
    const chatIdValue = toDbValue(chatId);
    if (!chatIdValue) return 0;
    const row = this._selectOldestLogIdStmt.get(chatIdValue);
    return row?.min_id ?? 0;
  }

  getChatRoom(chatId: number | string) {
    const chatIdValue = toDbValue(chatId);
    if (!chatIdValue) return null;
    return this._selectChatRoomStmt.get(chatIdValue);
  }
}
