import * as SQLite from "expo-sqlite";
import AsyncStorage from "../utils/storage";

// ============================================================
// 主数据 SQLite 库（wc_app.db）：
// - 聊天消息（可无限增长，避免 AsyncStorage KV 全量读写的技术债）
// - 角色卡（几百张卡按 id 查询，不再整 key 全量解析）
// AsyncStorage 仅保留会话索引、未读、设置等小数据。
// ============================================================

export interface AppMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  audio?: string;
  thinking?: string;
  /** 图片本地 URI 数组（用户发送 / AI 生图），JSON 存 images 列 */
  images?: string[];
  createdAt: number;
  senderName?: string;
  replyTo?: { content: string; senderName?: string };
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync("wc_app.db");
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

export function ensureAppDbInit(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      await exec(
        "CREATE TABLE IF NOT EXISTS messages (" +
          "convo_id TEXT NOT NULL, " +
          "id TEXT NOT NULL, " +
          "role TEXT NOT NULL, " +
          "content TEXT NOT NULL, " +
          "audio TEXT, " +
          "thinking TEXT, " +
          "created_at INTEGER NOT NULL, " +
          "sender_name TEXT, " +
          "reply_to TEXT, " +
          "PRIMARY KEY (convo_id, id))"
      );
      // 旧库迁移：补 audio 列（已存在则忽略）
      try {
        await exec("ALTER TABLE messages ADD COLUMN audio TEXT");
      } catch {}
      try {
        await exec("ALTER TABLE messages ADD COLUMN thinking TEXT");
      } catch {}
      // 清理历史上由模型结尾标记产生的空白气泡（无音频且内容为空）
      await exec(
        "DELETE FROM messages WHERE (TRIM(COALESCE(content,'')) = '' AND (audio IS NULL OR audio = ''))"
      );
      await exec(
        "CREATE INDEX IF NOT EXISTS idx_msg_convo ON messages(convo_id, created_at)"
      );
      await exec(
        "CREATE TABLE IF NOT EXISTS roles (" +
          "id TEXT PRIMARY KEY NOT NULL, " +
          "name TEXT NOT NULL DEFAULT '', " +
          "avatar TEXT NOT NULL DEFAULT '', " +
          "persona TEXT NOT NULL DEFAULT '', " +
          "greeting TEXT NOT NULL DEFAULT '', " +
          "call_name TEXT, " +
          "pat_reply TEXT, " +
          "remark TEXT, " +
          "starred INTEGER NOT NULL DEFAULT 0, " +
          "pending_greeting TEXT, " +
          "region TEXT NOT NULL DEFAULT '', " +
          "story_state TEXT, " +
          "bio TEXT, " +
          "examples TEXT, " +
          "background TEXT, " +
          "temperature REAL, " +
          "context_rounds INTEGER, " +
          "model_ids TEXT, " +
          "voice TEXT, " +
          "voice_rate TEXT, " +
          "is_system INTEGER NOT NULL DEFAULT 0, " +
          "status TEXT NOT NULL DEFAULT 'none', " +
          "added_at INTEGER)"
      );
      // 旧库迁移：补 voice 列（已存在则忽略）
      try {
        await exec("ALTER TABLE roles ADD COLUMN voice TEXT");
      } catch {}
      try {
        await exec("ALTER TABLE roles ADD COLUMN voice_rate TEXT");
      } catch {}
      await exec("CREATE INDEX IF NOT EXISTS idx_roles_status ON roles(status)");
      // 消息图片列：AI 生图/用户图片的本地 URI 数组（JSON），修复图片重启丢失
      try {
        await exec("ALTER TABLE messages ADD COLUMN images TEXT");
      } catch {}
      // 好感度/情绪：每角色一行
      await exec(
        "CREATE TABLE IF NOT EXISTS role_state (" +
          "role_id TEXT PRIMARY KEY NOT NULL, " +
          "affection INTEGER NOT NULL DEFAULT 50, " +
          "mood TEXT NOT NULL DEFAULT '', " +
          "updated_at INTEGER NOT NULL DEFAULT 0)"
      );
      // 角色相册
      await exec(
        "CREATE TABLE IF NOT EXISTS role_photos (" +
          "id TEXT PRIMARY KEY NOT NULL, " +
          "role_id TEXT NOT NULL, " +
          "uri TEXT NOT NULL, " +
          "caption TEXT, " +
          "created_at INTEGER NOT NULL)"
      );
      await exec(
        "CREATE INDEX IF NOT EXISTS idx_role_photos ON role_photos(role_id, created_at DESC)"
      );
      await exec(
        "CREATE TABLE IF NOT EXISTS moments (" +
          "id TEXT PRIMARY KEY NOT NULL, " +
          "data TEXT NOT NULL, " +
          "created_at INTEGER NOT NULL)"
      );
      await exec(
        "CREATE INDEX IF NOT EXISTS idx_moments_created ON moments(created_at DESC)"
      );
      await exec(
        "CREATE TABLE IF NOT EXISTS usage_daily (" +
          "date TEXT NOT NULL, " +
          "model TEXT NOT NULL, " +
          "role_id TEXT NOT NULL DEFAULT '', " +
          "scene TEXT NOT NULL DEFAULT '', " +
          "prompt_tokens INTEGER NOT NULL DEFAULT 0, " +
          "completion_tokens INTEGER NOT NULL DEFAULT 0, " +
          "cached_tokens INTEGER NOT NULL DEFAULT 0, " +
          "calls INTEGER NOT NULL DEFAULT 0, " +
          "PRIMARY KEY (date, model, role_id, scene))"
      );
      // 旧版 usage 表没有 role_id/scene 列：直接重建（测试数据，不保留旧统计）
      try {
        const cols = await exec<{ name: string }>(
          "PRAGMA table_info(usage_daily)"
        );
        const names = new Set(cols.map((c) => c.name));
        if (!names.has("role_id")) {
          await exec("DROP TABLE usage_daily");
          await exec(
            "CREATE TABLE usage_daily (" +
              "date TEXT NOT NULL, " +
              "model TEXT NOT NULL, " +
              "role_id TEXT NOT NULL DEFAULT '', " +
              "scene TEXT NOT NULL DEFAULT '', " +
              "prompt_tokens INTEGER NOT NULL DEFAULT 0, " +
              "completion_tokens INTEGER NOT NULL DEFAULT 0, " +
              "cached_tokens INTEGER NOT NULL DEFAULT 0, " +
              "calls INTEGER NOT NULL DEFAULT 0, " +
              "PRIMARY KEY (date, model, role_id, scene))"
          );
        }
      } catch {}
      // 清理迁移前的旧 AsyncStorage 数据（消息 + 角色分片），不留兼容死代码
      try {
        await AsyncStorage.removeItem("wc_local_messages");
        await AsyncStorage.removeItem("wc_local_roles_v2");
        await AsyncStorage.removeItem("wc_local_roles_v1");
        for (let i = 0; i < 12; i++) {
          await AsyncStorage.removeItem("wc_local_roles_v2_p" + i);
        }
        for (let i = 0; i < 6; i++) {
          await AsyncStorage.removeItem("wc_local_roles_v1_p" + i);
        }
      } catch {}
      // 清理旧会话索引里冗余的角色人设大字段（一次性；新会话不再写入）
      try {
        const raw = await AsyncStorage.getItem("wc_local_conversations");
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) {
            let changed = false;
            const next = list.map((c: any) => {
              if (
                !c?.rolePersona &&
                !c?.roleStoryState &&
                !c?.roleBackground &&
                !c?.roleExamples &&
                !c?.roleTemperature &&
                !c?.roleContextRounds &&
                !c?.roleModelIds
              ) {
                return c;
              }
              changed = true;
              const {
                rolePersona,
                roleStoryState,
                roleBackground,
                roleExamples,
                roleTemperature,
                roleContextRounds,
                roleModelIds,
                ...rest
              } = c;
              return rest;
            });
            if (changed) {
              await AsyncStorage.setItem(
                "wc_local_conversations",
                JSON.stringify(next)
              );
            }
          }
        }
      } catch {}
    })().catch(() => {
      initPromise = null;
    });
  }
  return initPromise;
}

// ---------------- 消息 ----------------

function rowToMessage(r: any): AppMessage {
  const m: AppMessage = {
    id: String(r.id),
    role: r.role === "system" ? "system" : r.role === "user" ? "user" : "assistant",
    content: String(r.content),
    createdAt: Number(r.created_at),
  };
  if (r.audio) m.audio = String(r.audio);
  if (r.thinking) m.thinking = String(r.thinking);
  if (r.images) {
    try {
      const v = JSON.parse(String(r.images));
      if (Array.isArray(v) && v.length) m.images = v.map(String);
    } catch {}
  }
  if (r.sender_name) m.senderName = String(r.sender_name);
  if (r.reply_to) {
    try {
      m.replyTo = JSON.parse(r.reply_to);
    } catch {}
  }
  return m;
}

export async function sqlReadMessages(convoId: string): Promise<AppMessage[]> {
  await ensureAppDbInit();
  const rows = await exec(
    "SELECT * FROM messages WHERE convo_id = ? ORDER BY created_at ASC",
    [convoId]
  );
  return rows.map(rowToMessage);
}

/** 按会话分组读取全部消息（仅备份/存储统计等低频场景使用） */
export async function sqlReadAllMessagesMap(): Promise<
  Record<string, AppMessage[]>
> {
  await ensureAppDbInit();
  const rows = await exec(
    "SELECT * FROM messages ORDER BY convo_id, created_at ASC"
  );
  const map: Record<string, AppMessage[]> = {};
  for (const r of rows) {
    const cid = String(r.convo_id);
    if (!map[cid]) map[cid] = [];
    map[cid].push(rowToMessage(r));
  }
  return map;
}

export async function sqlAppendMessage(convoId: string, msg: AppMessage) {
  await ensureAppDbInit();
  await exec(
    "INSERT OR REPLACE INTO messages (convo_id, id, role, content, audio, thinking, images, created_at, sender_name, reply_to) VALUES (?,?,?,?,?,?,?,?,?,?)",
    [
      convoId,
      msg.id,
      msg.role,
      msg.content,
      msg.audio ?? null,
      msg.thinking ?? null,
      msg.images?.length ? JSON.stringify(msg.images) : null,
      msg.createdAt,
      msg.senderName ?? null,
      msg.replyTo ? JSON.stringify(msg.replyTo) : null,
    ]
  );
}

/** 更新单条消息的图片列表（AI 生图完成后回填） */
export async function sqlUpdateMessageImages(
  convoId: string,
  msgId: string,
  images: string[]
) {
  await ensureAppDbInit();
  await exec("UPDATE messages SET images = ? WHERE convo_id = ? AND id = ?", [
    JSON.stringify(images),
    convoId,
    msgId,
  ]);
}

/** 更新单条消息的文本内容（生图失败回填提示等） */
export async function sqlUpdateMessageContent(
  convoId: string,
  msgId: string,
  content: string
) {
  await ensureAppDbInit();
  await exec("UPDATE messages SET content = ? WHERE convo_id = ? AND id = ?", [
    content,
    convoId,
    msgId,
  ]);
}

export async function sqlDeleteConvoMessages(convoId: string) {
  await ensureAppDbInit();
  await exec("DELETE FROM messages WHERE convo_id = ?", [convoId]);
}

/** 删除单条消息（撤回用），仅影响该会话内该条 */
export async function sqlDeleteMessage(convoId: string, msgId: string) {
  await ensureAppDbInit();
  await exec("DELETE FROM messages WHERE convo_id = ? AND id = ?", [
    convoId,
    msgId,
  ]);
}

// ---------------- 角色好感度 / 情绪 ----------------

export interface RoleState {
  affection: number; // 0~100
  mood: string; // 空表示未记录
  updatedAt: number; // 最近一次状态更新时间（冷却衰减用）
}

export async function sqlReadRoleState(roleId: string): Promise<RoleState> {
  await ensureAppDbInit();
  const rows = await exec<{ affection: number; mood: string; updated_at: number }>(
    "SELECT affection, mood, updated_at FROM role_state WHERE role_id = ?",
    [roleId]
  );
  if (!rows.length) return { affection: 50, mood: "", updatedAt: 0 };
  return {
    affection: Math.max(0, Math.min(100, Number(rows[0].affection) || 0)),
    mood: String(rows[0].mood || ""),
    updatedAt: Number(rows[0].updated_at) || 0,
  };
}

export async function sqlWriteRoleState(
  roleId: string,
  affection: number,
  mood: string
) {
  await ensureAppDbInit();
  const clamped = Math.max(0, Math.min(100, Math.round(affection)));
  await exec(
    "INSERT OR REPLACE INTO role_state (role_id, affection, mood, updated_at) VALUES (?,?,?,?)",
    [roleId, clamped, mood || "", Date.now()]
  );
}

// ---------------- 角色相册 ----------------

export interface RolePhoto {
  id: string;
  roleId: string;
  uri: string;
  caption?: string;
  createdAt: number;
}

export async function sqlReadRolePhotos(roleId: string): Promise<RolePhoto[]> {
  await ensureAppDbInit();
  const rows = await exec<any>(
    "SELECT * FROM role_photos WHERE role_id = ? ORDER BY created_at DESC",
    [roleId]
  );
  return rows.map((r) => ({
    id: String(r.id),
    roleId: String(r.role_id),
    uri: String(r.uri),
    caption: r.caption ? String(r.caption) : undefined,
    createdAt: Number(r.created_at),
  }));
}

export async function sqlAddRolePhoto(
  roleId: string,
  uri: string,
  caption?: string
) {
  await ensureAppDbInit();
  await exec(
    "INSERT OR REPLACE INTO role_photos (id, role_id, uri, caption, created_at) VALUES (?,?,?,?,?)",
    ["ph" + Date.now() + Math.floor(Math.random() * 1000), roleId, uri, caption ?? null, Date.now()]
  );
}

export async function sqlDeleteRolePhoto(id: string) {
  await ensureAppDbInit();
  await exec("DELETE FROM role_photos WHERE id = ?", [id]);
}

export async function sqlDeleteAllMessages() {
  await ensureAppDbInit();
  await exec("DELETE FROM messages");
}

export async function sqlCountMessages(): Promise<number> {
  await ensureAppDbInit();
  const rows = await exec<{ n: number }>(
    "SELECT COUNT(*) AS n FROM messages"
  );
  return rows[0]?.n || 0;
}

/** 消息内容总字节数（存储统计用） */
export async function sqlSumMessageBytes(): Promise<number> {
  await ensureAppDbInit();
  const rows = await exec<{ n: number }>(
    "SELECT COALESCE(SUM(LENGTH(content)), 0) AS n FROM messages"
  );
  return rows[0]?.n || 0;
}

// ---------------- 角色卡 ----------------

export interface AppRoleRow {
  id: string;
  name: string;
  avatar: string;
  persona: string;
  greeting: string;
  callName?: any;
  patReply?: string;
  remark?: string;
  starred?: boolean;
  pendingGreeting?: string;
  region: string;
  storyState?: string;
  bio?: string;
  examples?: any;
  background?: any;
  temperature?: number;
  contextRounds?: number;
  modelIds?: any;
  voice?: any;
  voiceRate?: "rare" | "sometimes" | "often";
  isSystem?: boolean;
  status: "none" | "requesting" | "done";
  addedAt?: number;
}

function rowToRole(r: any): AppRoleRow {
  const role: AppRoleRow = {
    id: String(r.id),
    name: String(r.name || ""),
    avatar: String(r.avatar || ""),
    persona: String(r.persona || ""),
    greeting: String(r.greeting || ""),
    region: String(r.region || ""),
    status: r.status === "done" ? "done" : r.status === "requesting" ? "requesting" : "none",
    starred: !!r.starred,
    isSystem: !!r.is_system,
  };
  if (r.call_name) {
    try {
      role.callName = JSON.parse(r.call_name);
    } catch {
      role.callName = r.call_name;
    }
  }
  if (r.pat_reply != null) role.patReply = String(r.pat_reply);
  if (r.remark != null) role.remark = String(r.remark);
  if (r.pending_greeting != null) {
    role.pendingGreeting = String(r.pending_greeting);
  }
  if (r.story_state != null) role.storyState = String(r.story_state);
  if (r.bio != null) role.bio = String(r.bio);
  if (r.examples) {
    try {
      role.examples = JSON.parse(r.examples);
    } catch {}
  }
  if (r.background) {
    try {
      role.background = JSON.parse(r.background);
    } catch {}
  }
  if (r.temperature != null) role.temperature = Number(r.temperature);
  if (r.context_rounds != null) role.contextRounds = Number(r.context_rounds);
  if (r.model_ids) {
    try {
      role.modelIds = JSON.parse(r.model_ids);
    } catch {}
  }
  if (r.voice) {
    try {
      role.voice = JSON.parse(r.voice);
    } catch {}
  }
  if (r.voice_rate != null) role.voiceRate = r.voice_rate;
  if (r.added_at != null) role.addedAt = Number(r.added_at);
  return role;
}

export async function sqlReadRoles(): Promise<AppRoleRow[]> {
  await ensureAppDbInit();
  const rows = await exec("SELECT * FROM roles ORDER BY id ASC");
  return rows.map(rowToRole);
}

export async function sqlReadRole(roleId: string): Promise<AppRoleRow | null> {
  await ensureAppDbInit();
  const rows = await exec("SELECT * FROM roles WHERE id = ?", [roleId]);
  return rows.length ? rowToRole(rows[0]) : null;
}

export async function sqlWriteRoles(list: AppRoleRow[]) {
  await ensureAppDbInit();
  await exec("DELETE FROM roles");
  for (const r of list) {
    await exec(
      "INSERT OR REPLACE INTO roles (" +
        "id, name, avatar, persona, greeting, call_name, pat_reply, remark, " +
        "starred, pending_greeting, region, story_state, bio, examples, background, " +
        "temperature, context_rounds, model_ids, voice, voice_rate, is_system, status, added_at" +
        ") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [
        r.id,
        r.name || "",
        r.avatar || "",
        r.persona || "",
        r.greeting || "",
        r.callName != null ? JSON.stringify(r.callName) : null,
        r.patReply ?? null,
        r.remark ?? null,
        r.starred ? 1 : 0,
        r.pendingGreeting ?? null,
        r.region || "",
        r.storyState ?? null,
        r.bio ?? null,
        r.examples ? JSON.stringify(r.examples) : null,
        r.background ? JSON.stringify(r.background) : null,
        r.temperature ?? null,
        r.contextRounds ?? null,
        r.modelIds ? JSON.stringify(r.modelIds) : null,
        r.voice ? JSON.stringify(r.voice) : null,
        r.voiceRate ?? null,
        r.isSystem ? 1 : 0,
        r.status || "none",
        r.addedAt ?? null,
      ]
    );
  }
}

export async function sqlCountRoles(): Promise<number> {
  await ensureAppDbInit();
  const rows = await exec<{ n: number }>("SELECT COUNT(*) AS n FROM roles");
  return rows[0]?.n || 0;
}

// ---------------- 好友动态 ----------------

export async function sqlReadAllMoments<T = any>(): Promise<T[]> {
  await ensureAppDbInit();
  const rows = await exec(
    "SELECT data FROM moments ORDER BY created_at DESC"
  );
  const out: T[] = [];
  for (const r of rows) {
    try {
      out.push(JSON.parse(r.data));
    } catch {}
  }
  return out;
}

export async function sqlWriteMoment(m: any) {
  await ensureAppDbInit();
  await exec(
    "INSERT OR REPLACE INTO moments (id, data, created_at) VALUES (?,?,?)",
    [String(m.id), JSON.stringify(m), Number(m.createdAt) || Date.now()]
  );
}

export async function sqlDeleteMoment(id: string) {
  await ensureAppDbInit();
  await exec("DELETE FROM moments WHERE id = ?", [id]);
}

// ---------------- Token 统计 ----------------

/** 记录一次调用的 token 消耗（按天+模型+角色+场景聚合） */
export async function sqlRecordUsage(
  model: string,
  promptTokens: number,
  completionTokens: number,
  cachedTokens: number,
  roleId: string,
  scene: string
) {
  await ensureAppDbInit();
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
  await exec(
    "INSERT INTO usage_daily (date, model, role_id, scene, prompt_tokens, completion_tokens, cached_tokens, calls) VALUES (?,?,?,?,?,?,?,1) " +
      "ON CONFLICT(date, model, role_id, scene) DO UPDATE SET " +
      "prompt_tokens = prompt_tokens + excluded.prompt_tokens, " +
      "completion_tokens = completion_tokens + excluded.completion_tokens, " +
      "cached_tokens = cached_tokens + excluded.cached_tokens, " +
      "calls = calls + 1",
    [
      date,
      model,
      roleId || "",
      scene || "",
      Math.max(0, Math.round(promptTokens) || 0),
      Math.max(0, Math.round(completionTokens) || 0),
      Math.max(0, Math.round(cachedTokens) || 0),
    ]
  );
}

export interface UsageRow {
  date: string;
  model: string;
  roleId: string;
  scene: string;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  calls: number;
}

/** 读取指定日期范围（含）的 Token 统计 */
export async function sqlReadUsage(
  fromDate: string,
  toDate: string
): Promise<UsageRow[]> {
  await ensureAppDbInit();
  const rows = await exec(
    "SELECT * FROM usage_daily WHERE date >= ? AND date <= ? ORDER BY date DESC",
    [fromDate, toDate]
  );
  return rows.map((r) => ({
    date: String(r.date),
    model: String(r.model),
    roleId: String(r.role_id || ""),
    scene: String(r.scene || ""),
    promptTokens: Number(r.prompt_tokens || 0),
    completionTokens: Number(r.completion_tokens || 0),
    cachedTokens: Number(r.cached_tokens || 0),
    calls: Number(r.calls || 0),
  }));
}

export async function sqlClearUsage() {
  await ensureAppDbInit();
  await exec("DELETE FROM usage_daily");
}

/** 角色字段内容总字节数（存储统计用） */
export async function sqlSumRoleBytes(): Promise<number> {
  await ensureAppDbInit();
  const rows = await exec<{ n: number }>(
    "SELECT COALESCE(SUM(LENGTH(persona) + LENGTH(background) + LENGTH(examples) + LENGTH(name) + LENGTH(bio)), 0) AS n FROM roles"
  );
  return rows[0]?.n || 0;
}

// ---------------- 备份快照 ----------------

export async function exportAppDbSnapshot(): Promise<string> {
  await ensureAppDbInit();
  const messages = await exec("SELECT * FROM messages");
  // 内置角色随包固定，不占导出体积；只导出用户自定义角色（完整资料）
  const roles = await exec("SELECT * FROM roles WHERE is_system = 0");
  // 内置角色只留 id→name 映射，方便把消息 convo_id 对回角色
  const builtinRoles = await exec(
    "SELECT id, name FROM roles WHERE is_system = 1"
  );
  return JSON.stringify({ messages, roles, builtinRoles });
}

export async function importAppDbSnapshot(
  json: string,
  merge: boolean
): Promise<void> {
  await ensureAppDbInit();
  let snap: any;
  try {
    snap = JSON.parse(json);
  } catch {
    throw new Error("聊天与角色备份数据格式错误");
  }
  const messages: any[] = Array.isArray(snap?.messages) ? snap.messages : [];
  const roles: any[] = Array.isArray(snap?.roles) ? snap.roles : [];
  if (!merge) {
    await exec("DELETE FROM messages");
    await exec("DELETE FROM roles");
  }
  for (const r of messages) {
    if (!r?.id || !r?.convo_id) continue;
    await exec(
      "INSERT OR REPLACE INTO messages (convo_id, id, role, content, audio, created_at, sender_name, reply_to) VALUES (?,?,?,?,?,?,?,?)",
      [
        String(r.convo_id),
        String(r.id),
        String(r.role || "assistant"),
        String(r.content ?? ""),
        r.audio == null ? null : String(r.audio),
        r.created_at == null ? Date.now() : Number(r.created_at),
        r.sender_name == null ? null : String(r.sender_name),
        r.reply_to == null ? null : String(r.reply_to),
      ]
    );
  }
  for (const r of roles) {
    if (!r?.id) continue;
    await exec(
      "INSERT OR REPLACE INTO roles (" +
        "id, name, avatar, persona, greeting, call_name, pat_reply, remark, " +
        "starred, pending_greeting, region, story_state, bio, examples, background, " +
        "temperature, context_rounds, model_ids, is_system, status, added_at" +
        ") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [
        String(r.id),
        String(r.name ?? ""),
        String(r.avatar ?? ""),
        String(r.persona ?? ""),
        String(r.greeting ?? ""),
        r.call_name == null ? null : String(r.call_name),
        r.pat_reply == null ? null : String(r.pat_reply),
        r.remark == null ? null : String(r.remark),
        r.starred ? 1 : 0,
        r.pending_greeting == null ? null : String(r.pending_greeting),
        String(r.region ?? ""),
        r.story_state == null ? null : String(r.story_state),
        r.bio == null ? null : String(r.bio),
        r.examples == null ? null : String(r.examples),
        r.background == null ? null : String(r.background),
        r.temperature == null ? null : Number(r.temperature),
        r.context_rounds == null ? null : Number(r.context_rounds),
        r.model_ids == null ? null : String(r.model_ids),
        r.is_system ? 1 : 0,
        String(r.status || "none"),
        r.added_at == null ? null : Number(r.added_at),
      ]
    );
  }
}
