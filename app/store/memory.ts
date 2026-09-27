import AsyncStorage from "../utils/storage";
import { atom, useRecoilState } from "recoil";
import { chatCompletion, fetchWithTimeout, AIConfig } from "../utils/ai";
import { readProfile } from "./profile";
import {
  fillTemplate,
  PROMPT_DEFAULTS,
  resolvePrompt,
} from "./promptEditing";
import {
  ensureDbInit,
  sqlClearMemories,
  sqlDeleteMemory,
  sqlDeleteMemoriesBySourceMsgIds,
  sqlInsertMemory,
  sqlReadEmbeddings,
  sqlReadMemories,
  sqlUpdatePinned,
  sqlUpsertEmbeddings,
  sqlClearAllEmbeddings,
  sqlReadLocalEmbeddings,
  sqlUpsertLocalEmbeddings,
  sqlReadDuePromises,
  sqlMarkPromiseReminded,
  sqlArchiveStaleMemories,
  sqlUnarchiveMemory,
  sqlSetSuperseded,
  sqlTouchRecalled,
  sqlUpdateMemoryContent,
} from "./memoryDb";
import { sqlClearAllKbEmbeddings } from "./kbDb";
import { embedLocal, embedLocalBatch } from "../utils/localEmbed";

export interface MemoryEntry {
  id: string;
  roleId: string;
  content: string;
  createdAt: number;
  source: "auto" | "manual";
  pinned?: boolean;
  /** 记忆类型：preference(用户偏好) / event(事件) / relation(关系) / fact(事实) / life(角色生活) / core(长期档案) */
  type?: string;
  /** 事件发生时间（毫秒），与入库时间分开，便于时间线回溯 */
  occurredAt?: number;
  /** 重要度 1~5：5=约定/核心/里程碑，4=重大事件/强偏好，3=普通，2=随口，1=琐碎 */
  importance?: number;
  /** 已归档（遗忘机制：低价值+久未召回） */
  archived?: boolean;
  /** 上次被检索召回的时间 */
  lastRecalledAt?: number;
  /** 被更新的记忆覆盖 */
  superseded?: boolean;
  /** 约定到期时间（promise 记忆） */
  dueAt?: number;
  /** 约定到期是否已提醒过 */
  reminded?: boolean;
  /** 来源消息 id（溯源用） */
  sourceMsgIds?: string[];
}

export interface RagEmbeddingConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface RagSettings {
  enabled: boolean; // 记忆总开关
  mode: "auto" | "rag" | "local"; // auto = 云端优先、断网/未配置自动切本地；rag = 云端；local = 本地语义向量（BGE）
  windowDays: number; // 时间衰减窗口（超过窗口的记忆逐渐降权，0 = 不衰减）
  topK: number; // 最终注入条数
  threshold: number; // 本地模式相似度门控
  providerName?: string;
  consoleUrl?: string; // 控制台网址（自定义供应商可填）
  embedding: RagEmbeddingConfig;
  rerankEnabled: boolean;
  rerank: RagEmbeddingConfig;
  // 知识库检索参数（复用同一套 Embedding/Rerank 配置）
  kbEnabled: boolean;
  kbThreshold: number;
  kbTopK: number;
  kbMaxTokens: number;
  // 联网搜索（Web Search）
  webSearchEnabled: boolean;
  webSearchProvider: "tavily" | "bocha" | "brave";
  webSearchKey: string;
  webSearchTopK: number;
  // 角色主动发消息
  proactiveEnabled: boolean;
  proactiveNightSilence: boolean;
  proactiveFrequency: "low" | "normal" | "high";
  // 记忆提取敏感度：low=只记重要(≥4)，medium=普通(≥3)，high=全记
  memorySensitivity: "low" | "medium" | "high";
  // 世界线天气（角色主动消息可感知用户所在城市天气）
  weatherEnabled: boolean;
  weatherBaseUrl: string;
  weatherCity: string; // 空 = IP 自动定位
  weatherLocMode: "auto" | "gps" | "manual"; // 定位方式
}


export const DEFAULT_RAG_SETTINGS: RagSettings = {
  enabled: true,
  mode: "auto",
  windowDays: 7,
  topK: 5,
  threshold: 0.32,
  embedding: {
    baseUrl: "https://integrate.api.nvidia.com/v1",
    apiKey: "",
    model: "nvidia/nv-embed-v1",
  },
  rerankEnabled: true,
  rerank: {
    baseUrl: "https://ai.api.nvidia.com/v1/retrieval/nvidia/reranking",
    apiKey: "",
    model: "nv-rerank-qa-mistral-4b:1",
  },
  kbEnabled: true,
  kbThreshold: 0.6,
  kbTopK: 5,
  kbMaxTokens: 2000,
  webSearchEnabled: false,
  webSearchProvider: "tavily",
  webSearchKey: "",
  webSearchTopK: 5,
  proactiveEnabled: true,
  proactiveNightSilence: false,
  proactiveFrequency: "normal",
  memorySensitivity: "medium",
  weatherEnabled: true,
  weatherBaseUrl: "https://uapis.cn/api/v1/misc/weather",
  weatherCity: "",
  weatherLocMode: "auto",
};

export interface RagPreset {
  name: string;
  consoleUrl: string;
  embeddingConsole: string;
  rerankConsole: string;
  embedding: RagEmbeddingConfig;
  rerank: RagEmbeddingConfig;
  rerankEnabled: boolean;
}

/** 记忆检索快捷预设 */
export const RAG_PRESETS: RagPreset[] = [
  {
    name: "NVIDIA",
    consoleUrl: "https://build.nvidia.com/settings/api-keys",
    embeddingConsole: "https://build.nvidia.com/settings/api-keys",
    rerankConsole: "https://build.nvidia.com/settings/api-keys",
    embedding: {
      baseUrl: "https://integrate.api.nvidia.com/v1",
      apiKey: "",
      model: "nvidia/nv-embed-v1",
    },
    rerank: {
      baseUrl: "https://ai.api.nvidia.com/v1/retrieval/nvidia/reranking",
      apiKey: "",
      model: "nv-rerank-qa-mistral-4b:1",
    },
    rerankEnabled: true,
  },
];

const RAG_SETTINGS_KEY = "wc_local_rag_settings_v1";
const EXTRACT_COUNT_KEY = "wc_local_memory_extract_count_v1";
const EMBED_MODEL_KEY = "wc_local_embed_model_v1";

const memoriesState = atom<{ [roleId: string]: MemoryEntry[] }>({
  key: "localMemories",
  default: {},
});

// ---------------- 设置 ----------------

export async function readRagSettings(): Promise<RagSettings> {
  try {
    const raw = await AsyncStorage.getItem(RAG_SETTINGS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      const merged: RagSettings = {
        ...DEFAULT_RAG_SETTINGS,
        ...s,
        embedding: { ...DEFAULT_RAG_SETTINGS.embedding, ...(s.embedding || {}) },
        rerank: { ...DEFAULT_RAG_SETTINGS.rerank, ...(s.rerank || {}) },
      };      // 地址统一为 /nvidia/reranking
      if (
        merged.rerank.baseUrl.includes("/nvidia/rerank") &&
        !merged.rerank.baseUrl.includes("/reranking")
      ) {
        merged.rerank.baseUrl = merged.rerank.baseUrl.replace(
          /\/nvidia\/rerank$/,
          "/nvidia/reranking"
        );
      }
      return merged;
    }
  } catch {}
  return { ...DEFAULT_RAG_SETTINGS };
}

export async function saveRagSettings(s: RagSettings) {
  await AsyncStorage.setItem(RAG_SETTINGS_KEY, JSON.stringify(s));
}

// ---------------- 字符集合相似度（去重用，非检索模式） ----------------

/** 字符集合相似度（轻量模糊匹配） */
export function textSimilarity(a: string, b: string): number {
  const sa = new Set(a.replace(/\s+/g, ""));
  const sb = new Set(b.replace(/\s+/g, ""));
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  sa.forEach((c) => {
    if (sb.has(c)) inter++;
  });
  const union = sa.size + sb.size - inter;
  let score = union ? inter / union : 0;
  const short = a.length <= b.length ? a : b;
  if (short && b.includes(a)) score += 0.25;
  if (short && a.includes(b)) score += 0.25;
  return Math.min(1, score);
}

// ---------------- Embedding / Rerank 引擎 ----------------

export async function embedTexts(
  cfg: RagEmbeddingConfig,
  texts: string[]
): Promise<number[][]> {
  const base = cfg.baseUrl.replace(/\/+$/, "");
  const res = await fetchWithTimeout(base + "/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: cfg.model, input: texts }),
  }, 120_000);
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Embedding 请求失败：HTTP ${res.status} ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const list = data?.data;
  if (!Array.isArray(list)) throw new Error("Embedding 返回格式异常");
  return list.map((x: any) => x?.embedding || []);
}

export interface RerankHit {
  index: number;
  score: number;
}

export async function rerankPassages(
  cfg: RagEmbeddingConfig,
  query: string,
  passages: string[],
  topN: number
): Promise<RerankHit[]> {
  const url = cfg.baseUrl.replace(/\/+$/, "");
  // NVIDIA 格式：query/passages 为 {text}，返回 rankings
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: cfg.model,
      query: { text: query },
      passages: passages.map((p) => ({ text: p })),
    }),
  }, 120_000);
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Rerank 请求失败：HTTP ${res.status} ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  let ranked = data?.rankings;
  if (!Array.isArray(ranked)) {
    // 兼容其它供应商格式
    ranked = data?.ranked_passages || data?.results || [];
  }
  const hits: RerankHit[] = ranked
    .map((r: any, i: number) => ({
      index: typeof r?.index === "number" ? r.index : i,
      score: r?.score ?? r?.relevance_score ?? r?.logit ?? 0,
    }))
    .sort((a: RerankHit, b: RerankHit) => b.score - a.score);
  return hits.slice(0, topN);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || !a.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * embedding 模型身份一致性：不同模型的向量不能混算相似度（向量空间不同）。
 * 检测到 baseUrl/model 变化时，清空记忆与知识库的向量缓存，下次按新模型重建。
 */
export async function ensureEmbeddingModelConsistent(
  cfg: RagEmbeddingConfig
) {
  const fp = (cfg.baseUrl || "").replace(/\/+$/, "") + "|" + (cfg.model || "");
  const stored = await AsyncStorage.getItem(EMBED_MODEL_KEY);
  if (stored && stored !== fp) {
    try {
      await sqlClearAllEmbeddings();
    } catch {}
    try {
      await sqlClearAllKbEmbeddings();
    } catch {}
  }
  await AsyncStorage.setItem(EMBED_MODEL_KEY, fp);
}

/** 为缺少向量的记忆条目补算 embedding 并缓存；未配置则返回 null */
export async function ensureMemoriesEmbedded(
  roleId: string,
  entries: MemoryEntry[],
  cfg: RagEmbeddingConfig
): Promise<{ [memId: string]: number[] } | null> {
  if (!cfg.apiKey) return null;
  await ensureEmbeddingModelConsistent(cfg);
  const cache = await sqlReadEmbeddings(roleId);
  const missing = entries.filter((m) => !cache[m.id]);
  if (missing.length) {
    try {
      // 分批嵌入，避免一次请求过大
      const BATCH = 100;
      for (let i = 0; i < missing.length; i += BATCH) {
        const chunk = missing.slice(i, i + BATCH);
        const vectors = await embedTexts(
          cfg,
          chunk.map((m) => m.content)
        );
        await sqlUpsertEmbeddings(
          roleId,
          chunk.map((m, j) => ({ memId: m.id, vector: vectors[j] || [] }))
        );
        chunk.forEach((m, j) => {
          cache[m.id] = vectors[j] || [];
        });
      }
    } catch {
      // 嵌入失败时返回已有缓存
    }
  }
  return cache;
}

/** 测试 Embedding 连接，返回向量维度 */
export async function testEmbedding(
  cfg: RagEmbeddingConfig
): Promise<number> {
  const vec = await embedTexts(cfg, ["测试"]);
  return (vec[0] || []).length;
}

/** 测试 Rerank 连接 */
export async function testRerank(
  cfg: RagEmbeddingConfig
): Promise<void> {
  await rerankPassages(cfg, "测试", ["测试内容"], 1);
}

// ---------------- 检索（RAG 主流程 + 本地兜底） ----------------

/** 时间衰减：超过窗口的记忆逐渐降权，0 = 不衰减 */
function decayFactor(createdAt: number, windowDays: number): number {
  if (!windowDays || windowDays <= 0) return 1;
  const days = (Date.now() - createdAt) / 86400000;
  return Math.pow(0.85, days / windowDays);
}

/** 重要度加权：1→0.8，3→1.0，5→1.2 */
function importanceFactor(m: MemoryEntry): number {
  const imp = m.importance == null ? 3 : m.importance;
  return 0.7 + imp * 0.1;
}

/** 时间衰减：置顶或 importance≥4 的重要记忆不过期 */
function effectiveDecay(
  m: MemoryEntry,
  useDecay: boolean,
  windowDays: number
): number {
  if (!useDecay) return 1;
  if (m.pinned || (m.importance ?? 3) >= 4) return 1;
  return decayFactor(m.createdAt, windowDays);
}

/** 约定定向召回：用户提到计划/约定类词时，promise 记忆加权 */
const PROMISE_HINTS = [
  "下次",
  "约定",
  "答应",
  "说好",
  "周末",
  "明天",
  "后天",
  "下周",
  "计划",
  "一起",
  "到时候",
  "回头",
  "约好",
];
function promiseBoost(m: MemoryEntry, query: string): number {
  if (m.type === "promise" && PROMISE_HINTS.some((w) => query.includes(w))) {
    return 1.3;
  }
  return 1;
}

export async function retrieveMemories(
  roleId: string,
  query: string,
  opts?: { topK?: number; threshold?: number; full?: boolean }
): Promise<MemoryEntry[]> {
  const settings = await readRagSettings();
  if (!settings.enabled) return [];
  await ensureDbInit();
  const all = await sqlReadMemories(roleId);
  if (!all.length) return [];
  const topK = opts?.topK || settings.topK || 5;
  const threshold = opts?.threshold ?? settings.threshold;
  const useDecay = !opts?.full;

  const pinned = all.filter((m) => m.pinned);
  const rest = all.filter((m) => !m.pinned);
  const timeHint = parseTimeHint(query);

  // RAG 模式（配置了 embedding key 时）
  if ((settings.mode === "rag" || settings.mode === "auto") && settings.embedding.apiKey) {
    try {
      const cache = await ensureMemoriesEmbedded(
        roleId,
        rest,
        settings.embedding
      );
      if (cache) {
        const qv = (await embedTexts(settings.embedding, [query]))[0] || [];
        const scored = rest
          .map((m) => ({
            m,
            score:
              cosineSimilarity(qv, cache[m.id] || []) *
              effectiveDecay(m, useDecay, settings.windowDays) *
              importanceFactor(m) *
              promiseBoost(m, query),
          }))
          // 与本地模式一致：低于相关性门槛的记忆不注入
          .filter((x) => x.score >= threshold)
          .sort((a, b) => b.score - a.score);
        // 关键词 + 时间精排：只对向量候选池计算，避免全量记忆匹配
        const pool = scored.slice(0, Math.max(20, topK * 4));
        const merged = pool
          .map((x) => ({
            m: x.m,
            score:
              x.score * 0.65 +
              keywordScore(query, x.m.content) * 0.35 +
              timeBoost(x.m, timeHint),
          }))
          .sort((a, b) => b.score - a.score);
        let chosen = merged.map((x) => x.m);
        if (settings.rerankEnabled && settings.rerank.apiKey && chosen.length) {
          try {
            const hits = await rerankPassages(
              settings.rerank,
              query,
              chosen.map((m) => m.content),
              topK
            );
            chosen = hits
              .map((h) => merged[h.index]?.m)
              .filter((m): m is MemoryEntry => !!m);
          } catch {
            chosen = merged.slice(0, topK).map((x) => x.m);
          }
        } else {
          chosen = merged.slice(0, topK).map((x) => x.m);
        }
        const result = [...pinned, ...chosen].slice(0, 30);
        if (result.length) {
          sqlTouchRecalled(
            result.map((m) => m.id),
            Date.now()
          ).catch(() => {});
        }
        return result;
      }
    } catch {
      // RAG 失败回退本地
    }
  }

  // 本地语义向量（落库缓存，缺的才现算）：BGE 模型 + 余弦，带时间衰减
  const qv = await embedLocal(query);
  const cache = await sqlReadLocalEmbeddings(roleId);
  const missing = rest.filter((m) => !cache[m.id]);
  if (missing.length) {
    const vecs = await embedLocalBatch(missing.map((m) => m.content));
    await sqlUpsertLocalEmbeddings(
      roleId,
      missing.map((m, i) => ({ memId: m.id, vector: vecs[i] || [] }))
    );
    missing.forEach((m, i) => {
      cache[m.id] = vecs[i] || [];
    });
  }
  const scored = rest
    .map((m) => {
      const s =
        cosineSimilarity(qv, cache[m.id] || []) *
        effectiveDecay(m, useDecay, settings.windowDays) *
        importanceFactor(m) *
        promiseBoost(m, query);
      return { m, score: s };
    })
    .filter((x) => x.score >= threshold)
    .sort((a, b) => b.score - a.score);
  // 关键词 + 时间精排：只对向量候选池计算
  const pool = scored.slice(0, Math.max(20, topK * 4));
  const merged = pool
    .map((x) => ({
      m: x.m,
      score:
        x.score * 0.65 +
        keywordScore(query, x.m.content) * 0.35 +
        timeBoost(x.m, timeHint),
    }))
    .sort((a, b) => b.score - a.score);
  const result = [...pinned, ...merged.slice(0, topK).map((x) => x.m)].slice(
    0,
    30
  );
  if (result.length) {
    sqlTouchRecalled(
      result.map((m) => m.id),
      Date.now()
    ).catch(() => {});
  }
  return result;
}

/** 把记忆条目格式化为注入块（爱语风格） */
export function formatMemoriesBlock(entries: MemoryEntry[]): string {
  if (!entries.length) return "";
  const lines = entries.slice(0, 30).map((m) => {
    const d = new Date(m.createdAt);
    const date = `${d.getMonth() + 1}月${d.getDate()}日`;
    const tag = m.pinned
      ? "[置顶] "
      : (m.importance ?? 3) >= 4
      ? "[重要] "
      : "";
    const typeTag = m.type === "promise" ? "[约定] " : m.type === "precious" ? "[回忆] " : "";
    return `${tag}${typeTag}${date} ${m.content}`;
  });
  return `\n\n【当前记忆库内容】\n${lines.join("\n")}`;
}

// ---------------- 多路召回（关键词 / 时间 / 向量合并） ----------------

/** 关键词重叠分（0~1）：query 的连续双字在记忆内容中的命中比例 */
function keywordScore(query: string, content: string): number {
  const q = (query || "").replace(/\s+/g, "").slice(0, 50);
  if (q.length < 2) return 0;
  const grams = new Set<string>();
  for (let i = 0; i < q.length - 1; i++) grams.add(q.slice(i, i + 2));
  if (!grams.size) return 0;
  let hit = 0;
  for (const g of grams) if (content.includes(g)) hit++;
  return hit / grams.size;
}

/** 时间提示解析：返回目标时间窗 [start, end)，无则 null */
function parseTimeHint(query: string): [number, number] | null {
  const now = new Date();
  const dayMs = 86400000;
  const sod = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const q = query || "";
  if (/昨天/.test(q)) return [sod(now) - dayMs, sod(now)];
  if (/前天/.test(q)) return [sod(now) - 2 * dayMs, sod(now) - dayMs];
  if (/上周|上个星期/.test(q)) {
    return [sod(now) - 7 * dayMs, sod(now) - 6 * dayMs];
  }
  if (/上个月|上月/.test(q)) {
    const a = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const b = new Date(now.getFullYear(), now.getMonth(), 1);
    return [a.getTime(), b.getTime()];
  }
  if (/去年/.test(q)) {
    const a = new Date(now.getFullYear() - 1, 0, 1);
    const b = new Date(now.getFullYear(), 0, 1);
    return [a.getTime(), b.getTime()];
  }
  const m = q.match(/(\d{1,2})月(\d{1,2})日/);
  if (m) {
    const mm = parseInt(m[1], 10);
    const dd = parseInt(m[2], 10);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      let t = new Date(now.getFullYear(), mm - 1, dd).getTime();
      if (t > Date.now()) t = new Date(now.getFullYear() - 1, mm - 1, dd).getTime();
      return [t, t + dayMs];
    }
  }
  return null;
}

/** 时间窗内给高加成（0.6），窗外不加 */
function timeBoost(m: MemoryEntry, hint: [number, number] | null): number {
  if (!hint) return 0;
  const at = m.occurredAt || m.createdAt;
  return at >= hint[0] && at < hint[1] ? 0.6 : 0;
}

// ---------------- L2 长期档案 / L3 编年史 ----------------

/** 读取角色的长期档案（type=core，常驻注入用） */
export async function getCoreProfile(roleId: string): Promise<MemoryEntry[]> {
  await ensureDbInit();
  const all = await sqlReadMemories(roleId);
  return all.filter((m) => m.type === "core").slice(0, 8);
}

/** 长期档案注入块：常驻于聊天/主动消息，让角色始终记得用户的核心信息 */
export function formatCoreBlock(entries: MemoryEntry[]): string {
  if (!entries.length) return "";
  const lines = entries.slice(0, 8).map((m) => `- ${m.content}`);
  return `\n\n【你对用户的长期了解（始终记得）】\n${lines.join(
    "\n"
  )}`;
}

const CORE_UPDATE_KEY = "wc_core_profile_updated"; // roleId -> 上次更新时的提取轮数
const CORE_UPDATE_INTERVAL = 30; // 每 30 轮对话更新一次长期档案
const CHRON_KEY = "wc_chronology_built"; // roleId -> 上次编年史轮数
const CHRON_INTERVAL = 50; // 每 50 轮生成/更新一次编年史
const CONSOLIDATE_KEY = "wc_memory_consolidated"; // roleId -> 上次巩固轮数
const CONSOLIDATE_INTERVAL = 30; // 每 30 轮巩固一次（合并相似记忆）

/** 生成/更新角色的长期档案（L2）：从记忆提炼用户偏好、关系、重大事件 */
async function buildCoreProfile(
  roleId: string,
  roleName: string,
  config: AIConfig
): Promise<void> {
  const all = await sqlReadMemories(roleId);
  const pool = all
    .filter((m) => m.type !== "core" && m.type !== "chronology")
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 40);
  if (!pool.length) return;
  const text = pool
    .map((m) => `${m.content}`)
    .join("\n");
  const prompt = fillTemplate(
    await resolvePrompt("memoryLongTerm", PROMPT_DEFAULTS.memoryLongTerm),
    { 角色名: roleName }
  );
  try {
    const reply = await chatCompletion(
      config,
      [{ role: "user", content: prompt + "\n\n记忆条目：\n" + text }],
      { temperature: 0.3, maxTokens: 800, roleId, scene: "记忆整理" }
    );
    const cleaned = reply
      .replace(/<think>[\s\S]*?<\/think>/g, "")
      .replace(/```json|```/g, "")
      .trim();
    const s = cleaned.indexOf("[");
    const e = cleaned.lastIndexOf("]");
    if (s < 0 || e <= s) return;
    const arr = JSON.parse(cleaned.slice(s, e + 1));
    if (!Array.isArray(arr)) return;
    const items = arr
      .map((x: any) => (x && x.content ? String(x.content).trim() : ""))
      .filter(Boolean)
      .slice(0, 6);
    if (!items.length) return;
    // 替换旧档案
    for (const m of all.filter((x) => x.type === "core")) {
      await sqlDeleteMemory(m.id);
    }
    for (const c of items) {
      await appendMemory(roleId, c, "auto", { type: "core" });
    }
  } catch {
    // 失败跳过，下轮再试
  }
}

/** 生成/更新编年史（L3）：把事件/角色生活记忆压成时间线 */
async function buildChronology(
  roleId: string,
  roleName: string,
  config: AIConfig
): Promise<void> {
  const all = await sqlReadMemories(roleId);
  const pool = all
    .filter((m) => m.type === "event" || m.type === "life")
    .sort((a, b) => (a.occurredAt || a.createdAt) - (b.occurredAt || b.createdAt))
    .slice(-60);
  if (!pool.length) return;
  const text = pool
    .map(
      (m) =>
        `${new Date(m.occurredAt || m.createdAt).toLocaleDateString("zh-CN")} ${m.content}`
    )
    .join("\n");
  const prompt = fillTemplate(
    await resolvePrompt("memoryChronicle", PROMPT_DEFAULTS.memoryChronicle),
    { 角色名: roleName }
  );
  try {
    const reply = await chatCompletion(
      config,
      [{ role: "user", content: prompt + "\n\n记录：\n" + text }],
      { temperature: 0.3, maxTokens: 600, roleId, scene: "记忆整理" }
    );
    const content = (reply || "")
      .replace(/<think>[\s\S]*?<\/think>/g, "")
      .trim()
      .slice(0, 500);
    if (content.length < 30) return;
    // 替换旧编年史
    for (const m of all.filter((x) => x.type === "chronology")) {
      await sqlDeleteMemory(m.id);
    }
    await appendMemory(roleId, content, "auto", { type: "chronology" });
  } catch {}
}

/**
 * 记忆巩固：把本质相同/高度相似的多条记忆合并成一条更概括的记忆，
 * 提升 importance 并删除被合并的旧条目（反复经历 → 稳定偏好的模拟）。
 */
async function consolidateMemories(
  roleId: string,
  roleName: string,
  config: AIConfig
): Promise<void> {
  const all = await sqlReadMemories(roleId);
  const pool = all
    .filter(
      (m) =>
        m.type !== "core" &&
        m.type !== "chronology" &&
        !m.archived &&
        !m.superseded
    )
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-60);
  if (pool.length < 8) return;
  const text = pool
    .map(
      (m, i) =>
        `[${i}] [${m.type}] (重要度${m.importance ?? 3}) ${m.content}`
    )
    .join("\n");
  const prompt = fillTemplate(
    await resolvePrompt(
      "memoryConsolidate",
      PROMPT_DEFAULTS.memoryConsolidate
    ),
    { 角色名: roleName }
  );
  try {
    const reply = await chatCompletion(
      config,
      [{ role: "user", content: prompt + "\n\n记忆条目：\n" + text }],
      { temperature: 0.3, maxTokens: 800, roleId, scene: "记忆整理" }
    );
    const cleaned = (reply || "")
      .replace(/<think>[\s\S]*?<\/think>/g, "")
      .replace(/```json|```/g, "")
      .trim();
    const s = cleaned.indexOf("[");
    const e = cleaned.lastIndexOf("]");
    if (s < 0 || e <= s) return;
    const arr = JSON.parse(cleaned.slice(s, e + 1));
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      if (!item?.content || !Array.isArray(item.indices) || !item.indices.length)
        continue;
      const content = String(item.content).trim();
      if (!content) continue;
      const indices = item.indices
        .map((x: any) => Number(x))
        .filter((x: number) => Number.isInteger(x) && x >= 0 && x < pool.length);
      if (indices.length < 2) continue;
      const type = [
        "preference",
        "event",
        "relation",
        "fact",
        "life",
        "promise",
        "precious",
      ].includes(String(item.type || ""))
        ? String(item.type)
        : "fact";
      const imp = Math.max(
        1,
        Math.min(5, Math.round(Number(item.importance)) || 3)
      );
      const mergedIds = indices.map((i: number) => pool[i].id);
      // 写升华记忆
      await appendMemory(roleId, content, "auto", {
        type,
        importance: Math.max(imp, 3),
        occurredAt: Date.now(),
      });
      // 删除被合并的旧条目
      for (const id of mergedIds) {
        await sqlDeleteMemory(id);
      }
    }
  } catch {}
}

/** 遗忘归档：importance≤2 且超过 90 天未创建的低价值记忆 → 归档（可恢复） */
export async function archiveStaleMemories(): Promise<number> {
  try {
    return await sqlArchiveStaleMemories(
      Date.now() - 90 * 86400000,
      2
    );
  } catch {
    return 0;
  }
}

/** 约定到期检查：due_at 已到且未提醒的 promise 记忆（供世界线导演调用） */
export async function checkDuePromises(
  now = Date.now()
): Promise<MemoryEntry[]> {
  try {
    return await sqlReadDuePromises(now);
  } catch {
    return [];
  }
}

/** 约定到期提醒：把到期的 promise 记忆安排成角色主动消息（世界线调度调用） */
export async function dispatchPromiseReminders(): Promise<void> {
  try {
    const due = await checkDuePromises();
    if (!due.length) return;
    // 按角色分组：同一角色同时到期的多条约定（多为记忆冗余变体）只发一条
    const byRole: Record<string, MemoryEntry[]> = {};
    for (const m of due) {
      if (!m.roleId) continue;
      (byRole[m.roleId] = byRole[m.roleId] || []).push(m);
    }
    for (const [roleId, list] of Object.entries(byRole)) {
      try {
        const { scheduleProactive } = await import("./proactive");
        const friends = await (await import("./worldline")).getFriendRoles();
        const f = friends.find((x) => x.id === roleId);
        const name = f ? f.remark || f.name : "角色";
        const convoId = "role-" + roleId;

        // 对话冷却：会话 10 分钟内有任何消息（用户或角色）就顺延本轮，
        // 避免提醒紧跟聊天回复连发（本轮不标记 reminded，下轮再检查）
        try {
          const { readMessages } = await import("./localChat");
          const msgs = await readMessages(convoId);
          const last = msgs[msgs.length - 1];
          if (last && Date.now() - last.createdAt < 10 * 60 * 1000) {
            continue;
          }
        } catch {}

        // 取最早到期的一条作为代表；同角色其余到期项一并标记已提醒，
        // 避免记忆冗余产生的多条近似提醒轮番轰炸
        const pick = [...list].sort(
          (a, b) => (a.dueAt || 0) - (b.dueAt || 0)
        )[0];
        for (const other of list) {
          await sqlMarkPromiseReminded(other.id);
        }
        await scheduleProactive(
          convoId,
          0,
          name,
          `对了，${pick.content}`,
          true
        );
      } catch {}
    }
  } catch {}
}

/** 在自动提取后调用：按轮数水位决定是否更新 L2 / 生成 L3 */
export async function maintainLongTermMemory(
  roleId: string,
  roleName: string,
  config: AIConfig,
  total: number
): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CORE_UPDATE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    const lastCore = map[roleId] || 0;
    const raw2 = await AsyncStorage.getItem(CHRON_KEY);
    const map2 = raw2 ? JSON.parse(raw2) : {};
    const lastChron = map2[roleId] || 0;
    if (total - lastCore >= CORE_UPDATE_INTERVAL) {
      await buildCoreProfile(roleId, roleName, config);
      map[roleId] = total;
      await AsyncStorage.setItem(CORE_UPDATE_KEY, JSON.stringify(map));
    }
    if (total - lastChron >= CHRON_INTERVAL) {
      await buildChronology(roleId, roleName, config);
      map2[roleId] = total;
      await AsyncStorage.setItem(CHRON_KEY, JSON.stringify(map2));
    }
    // 记忆巩固：每 30 轮合并相似记忆
    const raw3 = await AsyncStorage.getItem(CONSOLIDATE_KEY);
    const map3 = raw3 ? JSON.parse(raw3) : {};
    const lastConsolidate = map3[roleId] || 0;
    if (total - lastConsolidate >= CONSOLIDATE_INTERVAL) {
      await consolidateMemories(roleId, roleName, config);
      map3[roleId] = total;
      await AsyncStorage.setItem(CONSOLIDATE_KEY, JSON.stringify(map3));
    }
  } catch {}
}

// ---------------- 记忆增删改（SQLite） ----------------

export async function appendMemory(
  roleId: string,
  content: string,
  source: "auto" | "manual" = "auto",
  opts?: {
    type?: string;
    occurredAt?: number;
    importance?: number;
    dueAt?: number;
    sourceMsgIds?: string[];
  }
): Promise<boolean> {
  const t = content.trim();
  if (!t) return false;
  const list = await sqlReadMemories(roleId);
  // 写入去重：与已有记忆高度相似（>0.75）时更新旧条目而非新建，
  // 避免同一事实的措辞变体在 consolidate 跑之前堆积污染检索结果
  let merged = false;
  for (const m of list) {
    if (textSimilarity(t, m.content) > 0.75) {
      // 取更长的内容（信息量更大），重要度/到期时间取更高值
      const better = t.length > m.content.length ? t : m.content;
      await sqlUpdateMemoryContent(
        m.id,
        better,
        (opts?.importance ?? 3) > (m.importance ?? 3)
          ? opts?.importance
          : undefined,
        opts?.dueAt
      );
      merged = true;
      break; // 只合并到最相似的一条，避免一条新记忆吞掉多条旧记忆
    }
  }
  if (merged) return true;
  // 冲突覆盖：新记忆重要（≥4）且与旧记忆同主题高度相似 → 旧记忆标记被覆盖
  if ((opts?.importance ?? 3) >= 4) {
    const newType = opts?.type || "fact";
    for (const m of list) {
      if ((m.type || "fact") !== newType) continue;
      const sim = textSimilarity(t, m.content);
      if (sim > 0.5 && sim < 0.9) {
        await sqlSetSuperseded(m.id).catch(() => {});
      }
    }
  }
  await sqlInsertMemory({
    id: "mem-" + Date.now() + Math.floor(Math.random() * 1000),
    roleId,
    content: t,
    createdAt: Date.now(),
    source,
    pinned: false,
    type: opts?.type || "fact",
    occurredAt: opts?.occurredAt,
    importance:
      opts?.importance == null
        ? 3
        : Math.max(1, Math.min(5, Math.round(opts.importance))),
    dueAt: opts?.dueAt,
    sourceMsgIds: opts?.sourceMsgIds,
  });
  return true;
}

export async function setMemoryPinned(
  roleId: string,
  memId: string,
  pinned: boolean
) {
  await sqlUpdatePinned(memId, pinned);
}

export async function deleteMemory(roleId: string, memId: string) {
  await sqlDeleteMemory(memId);
}

/** 撤回消息时的"彻底遗忘"：删除来源消息命中 msgIds 的该角色记忆 */
export async function deleteMemoriesBySourceMsgIds(
  roleId: string,
  msgIds: string[]
): Promise<number> {
  if (!roleId || !msgIds?.length) return 0;
  return sqlDeleteMemoriesBySourceMsgIds(roleId, msgIds);
}

export async function clearMemories(roleId: string) {
  await sqlClearMemories(roleId);
}

// ---------------- 自动提取 ----------------

export async function extractMemoriesFromConversation(
  config: AIConfig,
  roleId: string,
  roleName: string,
  messages: {
    id?: string;
    role: string;
    content: string;
    senderName?: string;
  }[]
): Promise<
  {
    content: string;
    type: string;
    importance: number;
    dueAt?: number;
    sourceMsgIds?: string[];
  }[]
> {
  let userName = "用户";
  try {
    const p = await readProfile();
    userName = p.name || "用户";
  } catch {}
  const recentMsgs = messages
    .filter((m) => m.role !== "system")
    .slice(-40);
  const recent = recentMsgs
    .map(
      (m) =>
        `${m.role === "user" ? "用户" : m.senderName || roleName}：${m.content}`
    )
    .join("\n");
  if (!recent.trim()) return [];
  const now = new Date();
  const nowText = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${String(
    now.getHours()
  ).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const prompt = fillTemplate(
    await resolvePrompt("memoryExtract", PROMPT_DEFAULTS.memoryExtract),
    {
      时间: nowText,
      角色名: roleName,
      用户名: userName,
      对话: recent,
    }
  );
  const reply = await chatCompletion(
    config,
    [{ role: "user", content: prompt }],
    { temperature: 0.3, maxTokens: 800, roleId, scene: "记忆提取" }
  );
  const cleaned = reply
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/```json|```/g, "")
    .trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  try {
    const arr = JSON.parse(cleaned.slice(start, end + 1));
    // 溯源：提取结果关联触发对话的最近消息 id
    const srcIds = recentMsgs
      .filter((m) => m.id)
      .slice(-10)
      .map((m) => String(m.id));
    return Array.isArray(arr)
      ? arr
          .map((x: any) => {
            const content = x && x.content ? String(x.content).trim() : "";
            if (!content) return null;
            const t = String(x.type || "").trim();
            const valid = [
              "preference",
              "event",
              "relation",
              "fact",
              "life",
              "promise",
              "precious",
            ];
            const imp = Math.round(Number(x.importance));
            const item: {
              content: string;
              type: string;
              importance: number;
              dueAt?: number;
              sourceMsgIds?: string[];
            } = {
              content,
              type: valid.includes(t) ? t : "fact",
              importance: imp >= 1 && imp <= 5 ? imp : 3,
            };
            const due = parseDueAt(x.due_at);
            if (due) item.dueAt = due;
            if (srcIds.length) item.sourceMsgIds = srcIds;
            return item;
          })
          .filter(
            (
              x
            ): x is {
              content: string;
              type: string;
              importance: number;
              dueAt?: number;
              sourceMsgIds?: string[];
            } => !!x
          )
      : [];
  } catch {
    return [];
  }
}

/** 解析约定到期时间："2026-08-22" / "2026-08-22 10:00" → 时间戳；失败返回 undefined */
function parseDueAt(v: any): number | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  if (!s) return undefined;
  const t = Date.parse(s);
  return isNaN(t) ? undefined : t;
}

/** 轮数达到阈值时自动提取记忆（每 8 轮一次） */
export async function maybeAutoExtract(
  roleId: string,
  roleName: string,
  config: AIConfig,
  messages: { role: string; content: string }[],
  totalAll?: number
): Promise<void> {
  // 用会话累计消息数作为水位，而不是“最近 20 条窗口”的条数，
  // 否则对话超过 20 条后 total 恒为窗口大小，自动提取会永久停止。
  const total =
    totalAll ?? messages.filter((m) => m.role !== "system").length;
  if (total < 8) return;
  let last = 0;
  try {
    const raw = await AsyncStorage.getItem(EXTRACT_COUNT_KEY);
    const map = raw ? JSON.parse(raw) : {};
    last = map[roleId] || 0;
    if (total - last < 8) return;
  } catch {
    return;
  }
  try {
    // 只喂上次水位之后的新消息，避免重复提取
    const fresh = messages
      .filter((m) => m.role !== "system")
      .slice(-(total - last));
    const items = await extractMemoriesFromConversation(
      config,
      roleId,
      roleName,
      fresh
    );
    // 敏感度过滤：low=只记重要(≥4)，medium=≥3，high=全记
    const settings = await readRagSettings();
    const minImp =
      settings.memorySensitivity === "low"
        ? 4
        : settings.memorySensitivity === "high"
        ? 1
        : 3;
    for (const c of items) {
      if (c.importance < minImp) continue;
      await appendMemory(roleId, c.content, "auto", {
        type: c.type,
        occurredAt: Date.now(),
        importance: c.importance,
        dueAt: c.dueAt,
        sourceMsgIds: c.sourceMsgIds,
      });
    }
    // L2 长期档案 / L3 编年史：按轮数水位维护
    await maintainLongTermMemory(roleId, roleName, config, total);
  } catch {}
  try {
    const raw = await AsyncStorage.getItem(EXTRACT_COUNT_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[roleId] = total;
    await AsyncStorage.setItem(EXTRACT_COUNT_KEY, JSON.stringify(map));
  } catch {}
}

// ---------------- React hooks ----------------

export const useMemories = () => {
  const [memoriesMap, setMemoriesMap] = useRecoilState(memoriesState);

  const loadMemories = async (roleId: string): Promise<MemoryEntry[]> => {
    const list = (await sqlReadMemories(roleId)).sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return b.createdAt - a.createdAt;
    });
    setMemoriesMap((pre) => ({ ...pre, [roleId]: list }));
    return list;
  };

  return {
    memoriesMap,
    loadMemories,
  };
};
