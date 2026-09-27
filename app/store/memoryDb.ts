import * as SQLite from "expo-sqlite";
import AsyncStorage from "../utils/storage";
import type { MemoryEntry } from "./memory";

// Expo SDK 57: async SQLite API
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync("wc_memory.db");
  }
  return dbPromise;
}

type SqlValue = string | number | null;

function exec<T = any>(
  sql: string,
  args: SqlValue[] = []
): Promise<T[]> {
  return getDb().then((db) => db.getAllAsync<T>(sql, args));
}

let initPromise: Promise<void> | null = null;

async function migrateFromAsyncStorage() {
  try {
    const count = await exec<{ n: number }>(
      "SELECT COUNT(*) AS n FROM memories"
    );
    if (count[0]?.n && count[0].n > 0) return;
    let raw = await AsyncStorage.getItem("wc_local_memories_v2");
    if (!raw) raw = await AsyncStorage.getItem("wc_local_memories_v1");
    if (!raw) return;
    const map = JSON.parse(raw);
    if (!map || typeof map !== "object") return;
    const entries: MemoryEntry[] = [];
    for (const roleId of Object.keys(map)) {
      const list = map[roleId];
      if (!Array.isArray(list)) continue;
      for (const m of list) {
        if (!m?.id || m.content == null) continue;
        entries.push({
          id: String(m.id),
          roleId,
          content: String(m.content),
          createdAt: Number(m.createdAt) || Date.now(),
          source: m.source === "manual" ? "manual" : "auto",
          pinned: !!m.pinned,
        });
      }
    }
    for (const e of entries) {
      await exec(
        "INSERT OR IGNORE INTO memories (id, role_id, content, created_at, source, pinned) VALUES (?,?,?,?,?,?)",
        [e.id, e.roleId, e.content, e.createdAt, e.source, e.pinned ? 1 : 0]
      );
    }
  } catch {}
}

export function ensureDbInit(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      await exec(
        "CREATE TABLE IF NOT EXISTS memories (" +
          "id TEXT PRIMARY KEY NOT NULL, " +
          "role_id TEXT NOT NULL, " +
          "content TEXT NOT NULL, " +
          "created_at INTEGER NOT NULL, " +
          "source TEXT NOT NULL DEFAULT 'auto', " +
          "pinned INTEGER NOT NULL DEFAULT 0, " +
          "type TEXT NOT NULL DEFAULT 'fact', " +
          "occurred_at INTEGER, " +
          "importance INTEGER NOT NULL DEFAULT 3, " +
          "archived INTEGER NOT NULL DEFAULT 0, " +
          "last_recalled_at INTEGER, " +
          "superseded INTEGER NOT NULL DEFAULT 0, " +
          "due_at INTEGER, " +
          "reminded INTEGER NOT NULL DEFAULT 0, " +
          "source_msg_ids TEXT)"
      );
      // 老库迁移：补新列
      try {
        const cols = await exec<{ name: string }>(
          "PRAGMA table_info(memories)"
        );
        const names = new Set(cols.map((c) => c.name));
        if (!names.has("type")) {
          await exec("ALTER TABLE memories ADD COLUMN type TEXT NOT NULL DEFAULT 'fact'");
        }
        if (!names.has("occurred_at")) {
          await exec("ALTER TABLE memories ADD COLUMN occurred_at INTEGER");
        }
        if (!names.has("importance")) {
          await exec(
            "ALTER TABLE memories ADD COLUMN importance INTEGER NOT NULL DEFAULT 3"
          );
        }
        if (!names.has("archived")) {
          await exec(
            "ALTER TABLE memories ADD COLUMN archived INTEGER NOT NULL DEFAULT 0"
          );
        }
        if (!names.has("last_recalled_at")) {
          await exec("ALTER TABLE memories ADD COLUMN last_recalled_at INTEGER");
        }
        if (!names.has("superseded")) {
          await exec(
            "ALTER TABLE memories ADD COLUMN superseded INTEGER NOT NULL DEFAULT 0"
          );
        }
        if (!names.has("due_at")) {
          await exec("ALTER TABLE memories ADD COLUMN due_at INTEGER");
        }
        if (!names.has("reminded")) {
          await exec(
            "ALTER TABLE memories ADD COLUMN reminded INTEGER NOT NULL DEFAULT 0"
          );
        }
        if (!names.has("source_msg_ids")) {
          await exec("ALTER TABLE memories ADD COLUMN source_msg_ids TEXT");
        }
      } catch {}
      await exec(
        "CREATE INDEX IF NOT EXISTS idx_memories_role ON memories(role_id)"
      );
      await exec(
        "CREATE TABLE IF NOT EXISTS memory_embeddings (" +
          "mem_id TEXT PRIMARY KEY NOT NULL, " +
          "role_id TEXT NOT NULL, " +
          "vector TEXT NOT NULL)"
      );
      await exec(
        "CREATE INDEX IF NOT EXISTS idx_mem_emb_role ON memory_embeddings(role_id)"
      );
      await exec(
        "CREATE TABLE IF NOT EXISTS memory_embeddings_local (" +
          "mem_id TEXT PRIMARY KEY NOT NULL, " +
          "role_id TEXT NOT NULL, " +
          "vector TEXT NOT NULL)"
      );
      await exec(
        "CREATE INDEX IF NOT EXISTS idx_mem_emb_local_role ON memory_embeddings_local(role_id)"
      );
      await migrateFromAsyncStorage();
    })().catch(() => {
      initPromise = null;
    });
  }
  return initPromise;
}

function rowToEntry(r: any): MemoryEntry {
  return {
    id: String(r.id),
    roleId: String(r.role_id),
    content: String(r.content),
    createdAt: Number(r.created_at),
    source: r.source === "manual" ? "manual" : "auto",
    pinned: !!r.pinned,
    type: r.type || "fact",
    occurredAt: r.occurred_at ? Number(r.occurred_at) : undefined,
    importance: r.importance == null ? 3 : Number(r.importance),
    archived: !!r.archived,
    lastRecalledAt: r.last_recalled_at
      ? Number(r.last_recalled_at)
      : undefined,
    superseded: !!r.superseded,
    dueAt: r.due_at ? Number(r.due_at) : undefined,
    reminded: !!r.reminded,
    sourceMsgIds: r.source_msg_ids
      ? (() => {
          try {
            const v = JSON.parse(r.source_msg_ids);
            return Array.isArray(v) ? v : undefined;
          } catch {
            return undefined;
          }
        })()
      : undefined,
  };
}

export async function sqlReadMemories(
  roleId?: string
): Promise<MemoryEntry[]> {
  await ensureDbInit();
  const rows = roleId
    ? await exec(
        "SELECT * FROM memories WHERE role_id = ? AND archived = 0 AND superseded = 0 ORDER BY created_at DESC",
        [roleId]
      )
    : await exec(
        "SELECT * FROM memories WHERE archived = 0 AND superseded = 0 ORDER BY created_at DESC"
      );
  return rows.map(rowToEntry);
}

/** 读取已归档/被覆盖的记忆（管理页查看用） */
export async function sqlReadHiddenMemories(
  roleId: string
): Promise<MemoryEntry[]> {
  await ensureDbInit();
  const rows = await exec(
    "SELECT * FROM memories WHERE role_id = ? AND (archived = 1 OR superseded = 1) ORDER BY created_at DESC",
    [roleId]
  );
  return rows.map(rowToEntry);
}

/** 检索命中时更新记忆的最近召回时间（供遗忘判定） */
export async function sqlTouchRecalled(memIds: string[], ts: number) {
  await ensureDbInit();
  for (const id of memIds) {
    await exec("UPDATE memories SET last_recalled_at = ? WHERE id = ?", [
      ts,
      id,
    ]);
  }
}

/** 归档：importance 不高于 maxImp 且 created_at 早于 olderThan 的记忆 */
export async function sqlArchiveStaleMemories(
  olderThan: number,
  maxImp: number
): Promise<number> {
  await ensureDbInit();
  const rows = await exec<{ id: string }>(
    "SELECT id FROM memories WHERE archived = 0 AND superseded = 0 AND pinned = 0 AND importance <= ? AND created_at < ?",
    [maxImp, olderThan]
  );
  let n = 0;
  for (const r of rows) {
    await exec("UPDATE memories SET archived = 1 WHERE id = ?", [
      String(r.id),
    ]);
    n++;
  }
  return n;
}

export async function sqlUnarchiveMemory(memId: string) {
  await ensureDbInit();
  await exec("UPDATE memories SET archived = 0 WHERE id = ?", [memId]);
}

/** 标记某条记忆被新记忆覆盖 */
export async function sqlSetSuperseded(memId: string) {
  await ensureDbInit();
  await exec("UPDATE memories SET superseded = 1 WHERE id = ?", [memId]);
}

/** 写入去重：更新已有条目的内容/重要度/到期时间（不新建），作废旧向量缓存 */
export async function sqlUpdateMemoryContent(
  memId: string,
  content: string,
  importance?: number,
  dueAt?: number
) {
  await ensureDbInit();
  await exec(
    "UPDATE memories SET content = ?, importance = COALESCE(?, importance), due_at = COALESCE(?, due_at) WHERE id = ?",
    [content, importance ?? null, dueAt ?? null, memId]
  );
  await exec("DELETE FROM memory_embeddings WHERE mem_id = ?", [memId]);
  await exec("DELETE FROM memory_embeddings_local WHERE mem_id = ?", [memId]);
}

/** 查询到期待提醒的约定记忆（due_at 已到且未提醒） */
export async function sqlReadDuePromises(
  now: number
): Promise<MemoryEntry[]> {
  await ensureDbInit();
  const rows = await exec(
    "SELECT * FROM memories WHERE type = 'promise' AND due_at IS NOT NULL AND due_at <= ? AND reminded = 0 AND archived = 0 AND superseded = 0",
    [now]
  );
  return rows.map(rowToEntry);
}

export async function sqlMarkPromiseReminded(memId: string) {
  await ensureDbInit();
  await exec("UPDATE memories SET reminded = 1 WHERE id = ?", [memId]);
}

/** 按类型读取记忆（SQL 层过滤，避免全量读后再 JS 过滤） */
export async function sqlReadMemoriesByType(
  roleId: string,
  type: string,
  limit = 8
): Promise<MemoryEntry[]> {
  await ensureDbInit();
  const rows = await exec(
    "SELECT * FROM memories WHERE role_id = ? AND type = ? ORDER BY created_at DESC LIMIT ?",
    [roleId, type, limit]
  );
  return rows.map(rowToEntry);
}

export async function sqlInsertMemory(e: MemoryEntry) {
  await ensureDbInit();
  await exec(
    "INSERT OR REPLACE INTO memories (id, role_id, content, created_at, source, pinned, type, occurred_at, importance, archived, last_recalled_at, superseded, due_at, reminded, source_msg_ids) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [
      e.id,
      e.roleId,
      e.content,
      e.createdAt,
      e.source,
      e.pinned ? 1 : 0,
      e.type || "fact",
      e.occurredAt ?? null,
      e.importance == null ? 3 : e.importance,
      e.archived ? 1 : 0,
      e.lastRecalledAt ?? null,
      e.superseded ? 1 : 0,
      e.dueAt ?? null,
      e.reminded ? 1 : 0,
      e.sourceMsgIds?.length ? JSON.stringify(e.sourceMsgIds) : null,
    ]
  );
  // 内容可能变化，作废旧向量缓存
  await exec("DELETE FROM memory_embeddings WHERE mem_id = ?", [e.id]);
  await exec("DELETE FROM memory_embeddings_local WHERE mem_id = ?", [e.id]);
}

export async function sqlUpdatePinned(memId: string, pinned: boolean) {
  await ensureDbInit();
  await exec("UPDATE memories SET pinned = ? WHERE id = ?", [
    pinned ? 1 : 0,
    memId,
  ]);
}

export async function sqlDeleteMemory(memId: string) {
  await ensureDbInit();
  await exec("DELETE FROM memories WHERE id = ?", [memId]);
  await exec("DELETE FROM memory_embeddings WHERE mem_id = ?", [memId]);
  await exec("DELETE FROM memory_embeddings_local WHERE mem_id = ?", [memId]);
}

/**
 * 删除来源消息命中给定 msgIds 的记忆（撤回消息时"彻底遗忘"用）。
 * source_msg_ids 存的是 JSON 数组文本，用 LIKE '%"id"%' 匹配；
 * 同时清掉对应向量，避免检索到已撤回内容。
 */
export async function sqlDeleteMemoriesBySourceMsgIds(
  roleId: string,
  msgIds: string[]
): Promise<number> {
  await ensureDbInit();
  const safe = msgIds.filter((x) => /^[A-Za-z0-9_\-]{1,64}$/.test(x));
  if (!safe.length) return 0;
  const conds = safe.map(() => 'source_msg_ids LIKE ?').join(" OR ");
  const params = safe.map((id) => `%"${id}"%`);
  const rows = await exec<{ id: string }>(
    `SELECT id FROM memories WHERE role_id = ? AND (${conds})`,
    [roleId, ...params]
  );
  for (const r of rows) {
    await exec("DELETE FROM memory_embeddings WHERE mem_id = ?", [r.id]);
    await exec("DELETE FROM memory_embeddings_local WHERE mem_id = ?", [r.id]);
  }
  await exec(
    `DELETE FROM memories WHERE role_id = ? AND (${conds})`,
    [roleId, ...params]
  );
  return rows.length;
}

export async function sqlClearMemories(roleId: string) {
  await ensureDbInit();
  await exec("DELETE FROM memories WHERE role_id = ?", [roleId]);
  await exec("DELETE FROM memory_embeddings WHERE role_id = ?", [roleId]);
  await exec("DELETE FROM memory_embeddings_local WHERE role_id = ?", [roleId]);
}

export async function sqlClearAllEmbeddings() {
  await ensureDbInit();
  await exec("DELETE FROM memory_embeddings");
}

export async function sqlReadEmbeddings(
  roleId?: string
): Promise<{ [memId: string]: number[] }> {
  await ensureDbInit();
  const rows = roleId
    ? await exec(
        "SELECT mem_id, vector FROM memory_embeddings WHERE role_id = ?",
        [roleId]
      )
    : await exec("SELECT mem_id, vector FROM memory_embeddings");
  const out: { [memId: string]: number[] } = {};
  for (const r of rows) {
    try {
      const v = JSON.parse(r.vector);
      if (Array.isArray(v)) out[String(r.mem_id)] = v;
    } catch {}
  }
  return out;
}

export async function sqlUpsertEmbeddings(
  roleId: string,
  vectors: { memId: string; vector: number[] }[]
) {
  await ensureDbInit();
  for (const v of vectors) {
    await exec(
      "INSERT OR REPLACE INTO memory_embeddings (mem_id, role_id, vector) VALUES (?,?,?)",
      [v.memId, roleId, JSON.stringify(v.vector)]
    );
  }
}

export async function sqlClearAllLocalEmbeddings() {
  await ensureDbInit();
  await exec("DELETE FROM memory_embeddings_local");
}

export async function sqlReadLocalEmbeddings(
  roleId?: string
): Promise<{ [memId: string]: number[] }> {
  await ensureDbInit();
  const rows = roleId
    ? await exec(
        "SELECT mem_id, vector FROM memory_embeddings_local WHERE role_id = ?",
        [roleId]
      )
    : await exec("SELECT mem_id, vector FROM memory_embeddings_local");
  const out: { [memId: string]: number[] } = {};
  for (const r of rows) {
    try {
      const v = JSON.parse(r.vector);
      if (Array.isArray(v)) out[String(r.mem_id)] = v;
    } catch {}
  }
  return out;
}

export async function sqlUpsertLocalEmbeddings(
  roleId: string,
  vectors: { memId: string; vector: number[] }[]
) {
  await ensureDbInit();
  for (const v of vectors) {
    await exec(
      "INSERT OR REPLACE INTO memory_embeddings_local (mem_id, role_id, vector) VALUES (?,?,?)",
      [v.memId, roleId, JSON.stringify(v.vector)]
    );
  }
}

/** 导出记忆库全部数据为 JSON 快照（用于备份） */
export async function exportMemoryDbSnapshot(): Promise<string> {
  await ensureDbInit();
  const memories = await exec(
    "SELECT id, role_id, content, created_at, source, pinned FROM memories"
  );
  const embeddings = await exec(
    "SELECT mem_id, role_id, vector FROM memory_embeddings"
  );
  const localEmbeddings = await exec(
    "SELECT mem_id, role_id, vector FROM memory_embeddings_local"
  );
  return JSON.stringify({ memories, embeddings, localEmbeddings });
}

/** 从 JSON 快照恢复记忆库；merge=true 时按 id 合并（保留本地已有数据） */
export async function importMemoryDbSnapshot(
  json: string,
  merge: boolean
): Promise<void> {
  await ensureDbInit();
  let snap: any;
  try {
    snap = JSON.parse(json);
  } catch {
    throw new Error("记忆库备份数据格式错误");
  }
  const memories: any[] = Array.isArray(snap?.memories)
    ? snap.memories
    : [];
  const embeddings: any[] = Array.isArray(snap?.embeddings)
    ? snap.embeddings
    : [];
  const localEmbeddings: any[] = Array.isArray(snap?.localEmbeddings)
    ? snap.localEmbeddings
    : [];
  if (!merge) {
    await exec("DELETE FROM memories");
    await exec("DELETE FROM memory_embeddings");
    await exec("DELETE FROM memory_embeddings_local");
  }
  for (const r of memories) {
    if (!r?.id || r.content == null) continue;
    await exec(
      "INSERT OR REPLACE INTO memories (id, role_id, content, created_at, source, pinned, type, occurred_at, importance, archived, last_recalled_at, superseded, due_at, reminded, source_msg_ids) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [
        String(r.id),
        String(r.role_id ?? ""),
        String(r.content),
        r.created_at == null ? Date.now() : Number(r.created_at),
        r.source === "manual" ? "manual" : "auto",
        r.pinned ? 1 : 0,
        String(r.type || "fact"),
        r.occurred_at == null ? null : Number(r.occurred_at),
        r.importance == null ? 3 : Number(r.importance),
        r.archived ? 1 : 0,
        r.last_recalled_at == null ? null : Number(r.last_recalled_at),
        r.superseded ? 1 : 0,
        r.due_at == null ? null : Number(r.due_at),
        r.reminded ? 1 : 0,
        r.source_msg_ids == null ? null : String(r.source_msg_ids),
      ]
    );
  }
  for (const r of embeddings) {
    if (!r?.mem_id) continue;
    await exec(
      "INSERT OR REPLACE INTO memory_embeddings (mem_id, role_id, vector) VALUES (?,?,?)",
      [String(r.mem_id), String(r.role_id ?? ""), String(r.vector ?? "")]
    );
  }
  for (const r of localEmbeddings) {
    if (!r?.mem_id) continue;
    await exec(
      "INSERT OR REPLACE INTO memory_embeddings_local (mem_id, role_id, vector) VALUES (?,?,?)",
      [String(r.mem_id), String(r.role_id ?? ""), String(r.vector ?? "")]
    );
  }
}
