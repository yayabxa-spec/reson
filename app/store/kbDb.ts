import * as SQLite from "expo-sqlite";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync("wc_kb.db");
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

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  chunkCount: number;
  docCount: number;
}

export interface KbDocument {
  id: string;
  kbId: string;
  name: string;
  size: number;
  chunkCount: number;
  createdAt: number;
}

export interface KbChunk {
  id: string;
  kbId: string;
  content: string;
  chunkIndex: number;
  sourceFile: string;
  createdAt: number;
}

let initPromise: Promise<void> | null = null;

export function ensureKbInit(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      await exec(
        "CREATE TABLE IF NOT EXISTS knowledge_bases (" +
          "id TEXT PRIMARY KEY NOT NULL, " +
          "name TEXT NOT NULL, " +
          "description TEXT NOT NULL DEFAULT '', " +
          "created_at INTEGER NOT NULL, " +
          "updated_at INTEGER NOT NULL DEFAULT 0)"
      );
      // 缺少 updated_at 列时补充
      try {
        await exec("ALTER TABLE knowledge_bases ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0");
      } catch {}
      await exec(
        "CREATE TABLE IF NOT EXISTS kb_documents (" +
          "id TEXT PRIMARY KEY NOT NULL, " +
          "kb_id TEXT NOT NULL, " +
          "name TEXT NOT NULL, " +
          "size INTEGER NOT NULL DEFAULT 0, " +
          "chunk_count INTEGER NOT NULL DEFAULT 0, " +
          "created_at INTEGER NOT NULL)"
      );
      await exec(
        "CREATE INDEX IF NOT EXISTS idx_kb_docs_kb ON kb_documents(kb_id)"
      );
      await exec(
        "CREATE TABLE IF NOT EXISTS kb_chunks (" +
          "id TEXT PRIMARY KEY NOT NULL, " +
          "kb_id TEXT NOT NULL, " +
          "content TEXT NOT NULL, " +
          "chunk_index INTEGER NOT NULL DEFAULT 0, " +
          "source_file TEXT NOT NULL DEFAULT '', " +
          "created_at INTEGER NOT NULL)"
      );
      await exec(
        "CREATE INDEX IF NOT EXISTS idx_kb_chunks_kb ON kb_chunks(kb_id)"
      );
      await exec(
        "CREATE TABLE IF NOT EXISTS kb_embeddings (" +
          "chunk_id TEXT PRIMARY KEY NOT NULL, " +
          "kb_id TEXT NOT NULL, " +
          "vector TEXT NOT NULL)"
      );
      await exec(
        "CREATE INDEX IF NOT EXISTS idx_kb_emb_kb ON kb_embeddings(kb_id)"
      );
      await exec(
        "CREATE TABLE IF NOT EXISTS kb_embeddings_local (" +
          "chunk_id TEXT PRIMARY KEY NOT NULL, " +
          "kb_id TEXT NOT NULL, " +
          "vector TEXT NOT NULL)"
      );
      await exec(
        "CREATE INDEX IF NOT EXISTS idx_kb_emb_local_kb ON kb_embeddings_local(kb_id)"
      );
      await exec(
        "CREATE TABLE IF NOT EXISTS role_kb_bindings (" +
          "role_id TEXT NOT NULL, " +
          "kb_id TEXT NOT NULL, " +
          "PRIMARY KEY (role_id, kb_id))"
      );
    })().catch(() => {
      initPromise = null;
    });
  }
  return initPromise;
}

export async function sqlListKbs(): Promise<KnowledgeBase[]> {
  await ensureKbInit();
  const rows = await exec(
    "SELECT kb.id, kb.name, kb.description, kb.created_at, " +
      "(SELECT COALESCE(MAX(updated_at), created_at) FROM knowledge_bases k2 WHERE k2.id = kb.id) AS updated_at, " +
      "(SELECT COUNT(*) FROM kb_documents d WHERE d.kb_id = kb.id) AS doc_count, " +
      "(SELECT COUNT(*) FROM kb_chunks c WHERE c.kb_id = kb.id) AS chunk_count " +
      "FROM knowledge_bases kb ORDER BY kb.created_at DESC"
  );
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    description: String(r.description || ""),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at || r.created_at),
    chunkCount: Number(r.chunk_count || 0),
    docCount: Number(r.doc_count || 0),
  }));
}

export async function sqlCreateKb(
  kb: {
    id: string;
    name: string;
    description: string;
    createdAt: number;
  }
) {
  await ensureKbInit();
  await exec(
    "INSERT OR REPLACE INTO knowledge_bases (id, name, description, created_at, updated_at) VALUES (?,?,?,?,?)",
    [kb.id, kb.name, kb.description, kb.createdAt, kb.createdAt]
  );
}

export async function sqlTouchKb(kbId: string) {
  await ensureKbInit();
  await exec("UPDATE knowledge_bases SET updated_at = ? WHERE id = ?", [
    Date.now(),
    kbId,
  ]);
}

export async function sqlDeleteKb(kbId: string) {
  await ensureKbInit();
  await exec("DELETE FROM knowledge_bases WHERE id = ?", [kbId]);
  await exec("DELETE FROM kb_chunks WHERE kb_id = ?", [kbId]);
  await exec("DELETE FROM kb_embeddings WHERE kb_id = ?", [kbId]);
  await exec("DELETE FROM kb_embeddings_local WHERE kb_id = ?", [kbId]);
  await exec("DELETE FROM role_kb_bindings WHERE kb_id = ?", [kbId]);
  await exec("DELETE FROM kb_documents WHERE kb_id = ?", [kbId]);
}

export async function sqlClearAllKbEmbeddings() {
  await ensureKbInit();
  await exec("DELETE FROM kb_embeddings");
}

export async function sqlClearAllKbLocalEmbeddings() {
  await ensureKbInit();
  await exec("DELETE FROM kb_embeddings_local");
}

export async function sqlAddDocument(doc: KbDocument) {
  await ensureKbInit();
  await exec(
    "INSERT OR REPLACE INTO kb_documents (id, kb_id, name, size, chunk_count, created_at) VALUES (?,?,?,?,?,?)",
    [doc.id, doc.kbId, doc.name, doc.size, doc.chunkCount, doc.createdAt]
  );
}

export async function sqlListDocuments(kbId: string): Promise<KbDocument[]> {
  await ensureKbInit();
  const rows = await exec(
    "SELECT * FROM kb_documents WHERE kb_id = ? ORDER BY created_at DESC",
    [kbId]
  );
  return rows.map((r) => ({
    id: String(r.id),
    kbId: String(r.kb_id),
    name: String(r.name),
    size: Number(r.size || 0),
    chunkCount: Number(r.chunk_count || 0),
    createdAt: Number(r.created_at),
  }));
}

export async function sqlUpdateDocChunkCount(docId: string, count: number) {
  await ensureKbInit();
  await exec("UPDATE kb_documents SET chunk_count = ? WHERE id = ?", [
    count,
    docId,
  ]);
}

export async function sqlDeleteDocument(kbId: string, docId: string) {
  await ensureKbInit();
  // 删除该文档对应的分块与向量（按 source_file 匹配）
  const doc = (
    await exec("SELECT name FROM kb_documents WHERE id = ?", [docId])
  )[0];
  if (doc) {
    const chunks = await exec(
      "SELECT id FROM kb_chunks WHERE kb_id = ? AND source_file = ?",
      [kbId, String(doc.name)]
    );
    for (const c of chunks) {
      await exec("DELETE FROM kb_embeddings WHERE chunk_id = ?", [
        String(c.id),
      ]);
      await exec("DELETE FROM kb_embeddings_local WHERE chunk_id = ?", [
        String(c.id),
      ]);
    }
    await exec("DELETE FROM kb_chunks WHERE kb_id = ? AND source_file = ?", [
      kbId,
      String(doc.name),
    ]);
  }
  await exec("DELETE FROM kb_documents WHERE id = ?", [docId]);
  await sqlTouchKb(kbId);
}

export async function sqlAddChunks(chunks: KbChunk[]) {
  await ensureKbInit();
  for (const c of chunks) {
    await exec(
      "INSERT OR REPLACE INTO kb_chunks (id, kb_id, content, chunk_index, source_file, created_at) VALUES (?,?,?,?,?,?)",
      [c.id, c.kbId, c.content, c.chunkIndex, c.sourceFile, c.createdAt]
    );
  }
}

export async function sqlReadChunks(
  kbIds: string[],
  limit = 5000
): Promise<KbChunk[]> {
  await ensureKbInit();
  if (!kbIds.length) return [];
  const marks = kbIds.map(() => "?").join(",");
  const rows = await exec(
    `SELECT * FROM kb_chunks WHERE kb_id IN (${marks}) ORDER BY kb_id, chunk_index LIMIT ?`,
    [...kbIds, limit]
  );
  return rows.map((r) => ({
    id: String(r.id),
    kbId: String(r.kb_id),
    content: String(r.content),
    chunkIndex: Number(r.chunk_index),
    sourceFile: String(r.source_file || ""),
    createdAt: Number(r.created_at),
  }));
}

export async function sqlReadKbEmbeddings(
  kbIds: string[]
): Promise<{ [chunkId: string]: number[] }> {
  await ensureKbInit();
  if (!kbIds.length) return {};
  const marks = kbIds.map(() => "?").join(",");
  const rows = await exec(
    `SELECT chunk_id, vector FROM kb_embeddings WHERE kb_id IN (${marks})`,
    kbIds
  );
  const out: { [chunkId: string]: number[] } = {};
  for (const r of rows) {
    try {
      const v = JSON.parse(r.vector);
      if (Array.isArray(v)) out[String(r.chunk_id)] = v;
    } catch {}
  }
  return out;
}

export async function sqlUpsertKbEmbeddings(
  vectors: { chunkId: string; kbId: string; vector: number[] }[]
) {
  await ensureKbInit();
  for (const v of vectors) {
    await exec(
      "INSERT OR REPLACE INTO kb_embeddings (chunk_id, kb_id, vector) VALUES (?,?,?)",
      [v.chunkId, v.kbId, JSON.stringify(v.vector)]
    );
  }
}

export async function sqlReadKbLocalEmbeddings(
  kbIds: string[]
): Promise<{ [chunkId: string]: number[] }> {
  await ensureKbInit();
  if (!kbIds.length) return {};
  const marks = kbIds.map(() => "?").join(",");
  const rows = await exec(
    `SELECT chunk_id, vector FROM kb_embeddings_local WHERE kb_id IN (${marks})`,
    kbIds
  );
  const out: { [chunkId: string]: number[] } = {};
  for (const r of rows) {
    try {
      const v = JSON.parse(r.vector);
      if (Array.isArray(v)) out[String(r.chunk_id)] = v;
    } catch {}
  }
  return out;
}

export async function sqlUpsertKbLocalEmbeddings(
  vectors: { chunkId: string; kbId: string; vector: number[] }[]
) {
  await ensureKbInit();
  for (const v of vectors) {
    await exec(
      "INSERT OR REPLACE INTO kb_embeddings_local (chunk_id, kb_id, vector) VALUES (?,?,?)",
      [v.chunkId, v.kbId, JSON.stringify(v.vector)]
    );
  }
}

export async function sqlBindRoleKb(roleId: string, kbId: string) {
  await ensureKbInit();
  await exec(
    "INSERT OR REPLACE INTO role_kb_bindings (role_id, kb_id) VALUES (?,?)",
    [roleId, kbId]
  );
}

export async function sqlUnbindRoleKb(roleId: string, kbId: string) {
  await ensureKbInit();
  await exec(
    "DELETE FROM role_kb_bindings WHERE role_id = ? AND kb_id = ?",
    [roleId, kbId]
  );
}

export async function sqlListRoleKbIds(roleId: string): Promise<string[]> {
  await ensureKbInit();
  const rows = await exec(
    "SELECT kb_id FROM role_kb_bindings WHERE role_id = ?",
    [roleId]
  );
  return rows.map((r) => String(r.kb_id));
}

/** 导出知识库全部数据为 JSON 快照（用于备份） */
export async function exportKbDbSnapshot(): Promise<string> {
  await ensureKbInit();
  const kbs = await exec("SELECT * FROM knowledge_bases");
  const docs = await exec("SELECT * FROM kb_documents");
  const chunks = await exec("SELECT * FROM kb_chunks");
  const embeddings = await exec("SELECT * FROM kb_embeddings");
  const localEmbeddings = await exec("SELECT * FROM kb_embeddings_local");
  const bindings = await exec("SELECT * FROM role_kb_bindings");
  return JSON.stringify({ kbs, docs, chunks, embeddings, localEmbeddings, bindings });
}

/** 从 JSON 快照恢复知识库；merge=true 时按主键合并（保留本地已有数据） */
export async function importKbDbSnapshot(
  json: string,
  merge: boolean
): Promise<void> {
  await ensureKbInit();
  let snap: any;
  try {
    snap = JSON.parse(json);
  } catch {
    throw new Error("知识库备份数据格式错误");
  }
  const kbs: any[] = Array.isArray(snap?.kbs) ? snap.kbs : [];
  const docs: any[] = Array.isArray(snap?.docs) ? snap.docs : [];
  const chunks: any[] = Array.isArray(snap?.chunks) ? snap.chunks : [];
  const embeddings: any[] = Array.isArray(snap?.embeddings)
    ? snap.embeddings
    : [];
  const localEmbeddings: any[] = Array.isArray(snap?.localEmbeddings)
    ? snap.localEmbeddings
    : [];
  const bindings: any[] = Array.isArray(snap?.bindings) ? snap.bindings : [];
  if (!merge) {
    await exec("DELETE FROM role_kb_bindings");
    await exec("DELETE FROM kb_embeddings");
    await exec("DELETE FROM kb_embeddings_local");
    await exec("DELETE FROM kb_chunks");
    await exec("DELETE FROM kb_documents");
    await exec("DELETE FROM knowledge_bases");
  }
  for (const r of kbs) {
    if (!r?.id) continue;
    await exec(
      "INSERT OR REPLACE INTO knowledge_bases (id, name, description, created_at, updated_at) VALUES (?,?,?,?,?)",
      [
        String(r.id),
        String(r.name ?? ""),
        String(r.description ?? ""),
        r.created_at == null ? Date.now() : Number(r.created_at),
        r.updated_at == null
          ? r.created_at == null
            ? Date.now()
            : Number(r.created_at)
          : Number(r.updated_at),
      ]
    );
  }
  for (const r of docs) {
    if (!r?.id) continue;
    await exec(
      "INSERT OR REPLACE INTO kb_documents (id, kb_id, name, size, chunk_count, created_at) VALUES (?,?,?,?,?,?)",
      [
        String(r.id),
        String(r.kb_id ?? ""),
        String(r.name ?? ""),
        Number(r.size || 0),
        Number(r.chunk_count || 0),
        r.created_at == null ? Date.now() : Number(r.created_at),
      ]
    );
  }
  for (const r of chunks) {
    if (!r?.id) continue;
    await exec(
      "INSERT OR REPLACE INTO kb_chunks (id, kb_id, content, chunk_index, source_file, created_at) VALUES (?,?,?,?,?,?)",
      [
        String(r.id),
        String(r.kb_id ?? ""),
        String(r.content ?? ""),
        Number(r.chunk_index || 0),
        String(r.source_file ?? ""),
        r.created_at == null ? Date.now() : Number(r.created_at),
      ]
    );
  }
  for (const r of embeddings) {
    if (!r?.chunk_id) continue;
    await exec(
      "INSERT OR REPLACE INTO kb_embeddings (chunk_id, kb_id, vector) VALUES (?,?,?)",
      [
        String(r.chunk_id),
        String(r.kb_id ?? ""),
        String(r.vector ?? ""),
      ]
    );
  }
  for (const r of localEmbeddings) {
    if (!r?.chunk_id) continue;
    await exec(
      "INSERT OR REPLACE INTO kb_embeddings_local (chunk_id, kb_id, vector) VALUES (?,?,?)",
      [
        String(r.chunk_id),
        String(r.kb_id ?? ""),
        String(r.vector ?? ""),
      ]
    );
  }
  for (const r of bindings) {
    if (!r?.role_id || !r?.kb_id) continue;
    await exec(
      "INSERT OR REPLACE INTO role_kb_bindings (role_id, kb_id) VALUES (?,?)",
      [String(r.role_id), String(r.kb_id)]
    );
  }
}
