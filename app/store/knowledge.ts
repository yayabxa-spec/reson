import {
  embedTexts,
  rerankPassages,
  cosineSimilarity,
  readRagSettings,
  ensureEmbeddingModelConsistent,
} from "./memory";
import { embedLocal, embedLocalBatch } from "../utils/localEmbed";
import {
  KnowledgeBase,
  KbChunk,
  KbDocument,
  ensureKbInit,
  sqlAddChunks,
  sqlAddDocument,
  sqlCreateKb,
  sqlDeleteDocument,
  sqlDeleteKb,
  sqlListKbs,
  sqlListDocuments,
  sqlListRoleKbIds,
  sqlReadChunks,
  sqlReadKbEmbeddings,
  sqlReadKbLocalEmbeddings,
  sqlTouchKb,
  sqlUpdateDocChunkCount,
  sqlUpsertKbEmbeddings,
  sqlUpsertKbLocalEmbeddings,
} from "./kbDb";

// 递归分块：chunk 500 字、块间重叠 100 字（参考 AstrBot / LangChain）
const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 100;
const SEPARATORS = ["\n\n", "\n", "。", "，", ". ", ", ", " ", ""];

function splitWithSep(text: string, sep: string): string[] {
  if (sep === "") return Array.from(text);
  const pieces = text.split(sep);
  // 除最后一段外，把分隔符补回去
  return pieces.map((p, i) =>
    i < pieces.length - 1 ? p + sep : p
  );
}

function recursiveSplit(
  text: string,
  chunkSize: number,
  sepIdx: number
): string[] {
  if (text.length <= chunkSize) return [text];
  if (sepIdx >= SEPARATORS.length) {
    const parts: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      parts.push(text.slice(i, i + chunkSize));
    }
    return parts;
  }
  const sep = SEPARATORS[sepIdx];
  const pieces = splitWithSep(text, sep);
  if (pieces.length <= 1) {
    return recursiveSplit(text, chunkSize, sepIdx + 1);
  }
  const merged: string[] = [];
  let cur = "";
  for (const p of pieces) {
    const candidate = cur ? cur + p : p;
    if (!cur || candidate.length <= chunkSize) {
      cur = candidate;
    } else {
      merged.push(cur);
      cur = p;
    }
  }
  if (cur) merged.push(cur);
  const out: string[] = [];
  for (const m of merged) {
    if (m.length > chunkSize) out.push(...recursiveSplit(m, chunkSize, sepIdx + 1));
    else out.push(m);
  }
  return out;
}

/** 文本分块：递归按中文标点/段落切分，块间带重叠（参考 AstrBot） */
export function chunkText(
  text: string,
  chunkSize = CHUNK_SIZE,
  overlap = CHUNK_OVERLAP
): string[] {
  const cleaned = (text || "").replace(/\r\n/g, "\n").trim();
  if (!cleaned) return [];
  if (cleaned.length <= chunkSize) return [cleaned];
  const splits = recursiveSplit(cleaned, chunkSize, 0);
  const chunks: string[] = [];
  let current = "";
  for (const s of splits) {
    const trimmed = s.trim();
    if (!trimmed) continue;
    if (!current) {
      current = trimmed;
      continue;
    }
    if ((current + trimmed).length <= chunkSize) {
      current += trimmed;
      continue;
    }
    chunks.push(current);
    const tail = current.slice(-overlap);
    current = tail ? tail + "\n" + trimmed : trimmed;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

// ---------------- BM25 稀疏检索（轻量 JS 实现，参考 AstrBot 的 FTS5/BM25） ----------------

const STOPWORDS = new Set([
  "的", "了", "是", "在", "我", "你", "他", "她", "它", "这", "那",
  "和", "与", "就", "都", "而", "及", "着", "或", "一个", "没有", "我们", "你们",
]);

function tokenizeText(text: string): string[] {
  const tokens: string[] = [];
  const cjk = /[\u4e00-\u9fa5]/;
  const latin = /[a-zA-Z0-9]+/;
  let i = 0;
  const t = text.toLowerCase();
  while (i < t.length) {
    const ch = t[i];
    if (cjk.test(ch)) {
      if (!STOPWORDS.has(ch)) tokens.push(ch);
      i++;
    } else {
      const m = t.slice(i).match(latin);
      if (m && m.index === 0) {
        tokens.push(m[0]);
        i += m[0].length;
      } else {
        i++;
      }
    }
  }
  return tokens;
}

function bm25Scores(
  query: string,
  chunks: { id: string; content: string }[],
  k1 = 1.5,
  b = 0.75
): Map<string, number> {
  const qTokens = tokenizeText(query);
  if (!qTokens.length) return new Map();
  const n = chunks.length;
  const avgdl =
    chunks.reduce((sum, c) => sum + Math.max(1, c.content.length), 0) / Math.max(1, n);
  const df = new Map<string, number>();
  const tf = new Map<string, Map<string, number>>();
  for (const c of chunks) {
    const tokens = tokenizeText(c.content);
    const local = new Map<string, number>();
    for (const tk of tokens) {
      local.set(tk, (local.get(tk) || 0) + 1);
      df.set(tk, (df.get(tk) || 0) + 1);
    }
    tf.set(c.id, local);
  }
  const scores = new Map<string, number>();
  for (const c of chunks) {
    const local = tf.get(c.id)!;
    const dl = Math.max(1, c.content.length);
    let score = 0;
    for (const tk of qTokens) {
      const f = local.get(tk) || 0;
      if (!f) continue;
      const d = df.get(tk) || 0;
      const idf = Math.log(1 + (n - d + 0.5) / (d + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + b * (dl / avgdl))));
    }
    scores.set(c.id, score);
  }
  return scores;
}

interface ScoredChunk {
  chunk: KbChunk;
  dense: number;
  sparse: number;
  fused: number;
}

/** 混合评分：dense（Embedding）+ sparse（BM25），按知识库组 min-max 归一化后加权融合 */
function fuseScores(
  chunks: KbChunk[],
  denseMap: { [id: string]: number },
  sparseMap: Map<string, number>,
  denseWeight = 0.9
): ScoredChunk[] {
  const groupNorm = (values: { id: string; v: number }[]): Map<string, number> => {
    const out = new Map<string, number>();
    if (!values.length) return out;
    // 一次遍历求 min/max，避免对每个元素重复扫描整个数组（O(n²)）
    let min = Infinity;
    let max = -Infinity;
    for (const x of values) {
      if (x.v < min) min = x.v;
      if (x.v > max) max = x.v;
    }
    const range = max - min;
    for (const x of values) {
      out.set(x.id, range ? (x.v - min) / range : 1);
    }
    return out;
  };
  const groups = new Map<string, { id: string; v: number }[]>();
  for (const c of chunks) {
    const arr = groups.get(c.kbId) || [];
    arr.push({ id: c.id, v: denseMap[c.id] ?? 0 });
    groups.set(c.kbId, arr);
  }
  const denseNorm = new Map<string, number>();
  for (const arr of groups.values()) {
    for (const [id, v] of groupNorm(arr)) denseNorm.set(id, v);
  }
  const sparseGroups = new Map<string, { id: string; v: number }[]>();
  for (const c of chunks) {
    const arr = sparseGroups.get(c.kbId) || [];
    arr.push({ id: c.id, v: sparseMap.get(c.id) ?? 0 });
    sparseGroups.set(c.kbId, arr);
  }
  const sparseNorm = new Map<string, number>();
  for (const arr of sparseGroups.values()) {
    for (const [id, v] of groupNorm(arr)) sparseNorm.set(id, v);
  }
  return chunks
    .map((c) => ({
      chunk: c,
      dense: denseMap[c.id] ?? 0,
      sparse: sparseMap.get(c.id) ?? 0,
      fused:
        denseWeight * (denseNorm.get(c.id) ?? 0) +
        (1 - denseWeight) * (sparseNorm.get(c.id) ?? 0),
    }))
    .sort((a, b) => b.fused - a.fused || b.dense - a.dense);
}

/** 每篇来源文档只保留融合分最高的一个分块 */
function dedupePerDocument(scored: ScoredChunk[]): ScoredChunk[] {
  const seen = new Set<string>();
  const out: ScoredChunk[] = [];
  for (const s of scored) {
    const key = s.chunk.kbId + "|" + s.chunk.sourceFile;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/** 创建知识库（仅基本信息，文档随后上传） */
export async function createKnowledgeBase(input: {
  name: string;
  description?: string;
}): Promise<KnowledgeBase> {
  await ensureKbInit();
  const kb: KnowledgeBase = {
    id: "kb-" + Date.now(),
    name: input.name.trim() || "未命名知识库",
    description: (input.description || "").trim(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    chunkCount: 0,
    docCount: 0,
  };
  await sqlCreateKb(kb);
  return kb;
}

/** 向知识库上传一个文档：分块 + 向量化 */
export async function uploadDocumentToKb(
  kbId: string,
  input: { name: string; size?: number; text: string }
): Promise<KbDocument> {
  await ensureKbInit();
  const chunks = chunkText(input.text);
  const doc: KbDocument = {
    id: "doc-" + Date.now(),
    kbId,
    name: input.name || "未命名文档",
    size: input.size || input.text.length,
    chunkCount: chunks.length,
    createdAt: Date.now(),
  };
  await sqlAddDocument(doc);
  const rows: KbChunk[] = [];
  if (chunks.length) {
    const now = Date.now();
    chunks.forEach((c, i) => {
      rows.push({
        id: doc.id + "-c" + i,
        kbId,
        content: c,
        chunkIndex: i,
        sourceFile: doc.name,
        createdAt: now,
      });
    });
    await sqlAddChunks(rows);
  }
  await sqlUpdateDocChunkCount(doc.id, chunks.length);
  await sqlTouchKb(kbId);
  // 后台嵌入向量
  const settings = await readRagSettings();
  if (settings.embedding.apiKey && rows.length) {
    await embedKbChunks([kbId], rows);
  }
  return doc;
}

/** 模拟检索：在单个知识库内搜索，返回带分数的结果 */
export async function searchKnowledge(
  kbId: string,
  query: string,
  topK = 5
): Promise<{ content: string; score: number }[]> {
  if (!query.trim()) return [];
  const chunks = await sqlReadChunks([kbId], 5000);
  if (!chunks.length) return [];
  const settings = await readRagSettings();
  const sparseMap = bm25Scores(query, chunks);
  if (settings.embedding.apiKey) {
    try {
      await embedKbChunks([kbId], chunks);
      const cache = await sqlReadKbEmbeddings([kbId]);
      const qv = (await embedTexts(settings.embedding, [query]))[0] || [];
      const denseMap: { [id: string]: number } = {};
      for (const c of chunks) {
        denseMap[c.id] = cosineSimilarity(qv, cache[c.id] || []);
      }
      const fused = dedupePerDocument(fuseScores(chunks, denseMap, sparseMap));
      return fused.slice(0, topK).map((x) => ({
        content: x.chunk.content,
        score: x.fused,
      }));
    } catch {}
  }
  const fallback = chunks
    .map((c) => ({ c, s: sparseMap.get(c.id) || 0 }))
    .sort((a, b) => b.s - a.s)
    .slice(0, topK);
  return fallback.map((x) => ({ content: x.c.content, score: x.s }));
}

/** 为知识库分块补算向量（分批） */
export async function embedKbChunks(
  kbIds: string[],
  chunks: KbChunk[]
) {
  const settings = await readRagSettings();
  if (!settings.embedding.apiKey || !chunks.length) return;
  await ensureEmbeddingModelConsistent(settings.embedding);
  const cache = await sqlReadKbEmbeddings(kbIds);
  const missing = chunks.filter((c) => !cache[c.id]);
  if (!missing.length) return;
  const BATCH = 100;
  try {
    for (let i = 0; i < missing.length; i += BATCH) {
      const part = missing.slice(i, i + BATCH);
      const vectors = await embedTexts(
        settings.embedding,
        part.map((c) => c.content)
      );
      await sqlUpsertKbEmbeddings(
        part.map((c, j) => ({
          chunkId: c.id,
          kbId: c.kbId,
          vector: vectors[j] || [],
        }))
      );
    }
  } catch {}
}

/** 按角色绑定的知识库检索，返回 [Knowledge] 注入块（空字符串表示无可注入内容） */
export async function retrieveKnowledgeBlock(
  roleId: string,
  query: string
): Promise<string> {
  const settings = await readRagSettings();
  if (!settings.kbEnabled || !query.trim()) return "";
  const kbIds = await sqlListRoleKbIds(roleId);
  if (!kbIds.length) return "";
  const chunks = await sqlReadChunks(kbIds, 5000);
  if (!chunks.length) return "";
  const topK = settings.kbTopK || 5;
  const threshold = settings.kbThreshold ?? 0.6;

  // 稀疏检索（BM25）参与融合
  const sparseMap = bm25Scores(query, chunks);
  let chosen: KbChunk[] = [];
  if (settings.embedding.apiKey) {
    try {
      await embedKbChunks(kbIds, chunks);
      const cache = await sqlReadKbEmbeddings(kbIds);
      const qv = (await embedTexts(settings.embedding, [query]))[0] || [];
      const denseMap: { [id: string]: number } = {};
      const gated = chunks.filter((c) => {
        const s = cosineSimilarity(qv, cache[c.id] || []);
        denseMap[c.id] = s;
        return s >= threshold;
      });
      if (gated.length) {
        const fused = dedupePerDocument(fuseScores(gated, denseMap, sparseMap));
        const pool = fused.slice(0, Math.max(20, topK * 4)).map((x) => x.chunk);
        if (settings.rerankEnabled && settings.rerank.apiKey && pool.length) {
          try {
            const hits = await rerankPassages(
              settings.rerank,
              query,
              pool.map((c) => c.content),
              topK
            );
            chosen = hits
              .map((h) => pool[h.index])
              .filter((c): c is KbChunk => !!c);
          } catch {
            chosen = pool.slice(0, topK);
          }
        } else {
          chosen = pool.slice(0, topK);
        }
      }
    } catch {}
  }

  if (!chosen.length) {
    // 离线兜底：BM25 筛候选池（top 200）→ 本地 BGE 语义向量余弦精排
    const pool = chunks
      .map((c) => ({ c, s: sparseMap.get(c.id) || 0 }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 200);
    const qv = await embedLocal(query);
    const cache = await sqlReadKbLocalEmbeddings(kbIds);
    const missing = pool.filter((x) => !cache[x.c.id]);
    if (missing.length) {
      const vecs = await embedLocalBatch(missing.map((x) => x.c.content));
      await sqlUpsertKbLocalEmbeddings(
        missing.map((x, i) => ({
          chunkId: x.c.id,
          kbId: x.c.kbId,
          vector: vecs[i] || [],
        }))
      );
      missing.forEach((x, i) => {
        cache[x.c.id] = vecs[i] || [];
      });
    }
    const scored = pool
      .map((x) => ({
        c: x.c,
        dense: cosineSimilarity(qv, cache[x.c.id] || []),
        sparse: x.s,
      }))
      .filter((x) => x.dense >= threshold)
      .sort((a, b) => b.dense - a.dense);
    chosen = dedupePerDocument(
      scored.map((x) => ({
        chunk: x.c,
        dense: x.dense,
        sparse: x.sparse,
        fused: x.dense,
      }))
    )
      .slice(0, topK)
      .map((x) => x.chunk);
  }
  if (!chosen.length) return "";

  const kbNames = new Map<string, string>();
  const kbs = await sqlListKbs();
  for (const kb of kbs) kbNames.set(kb.id, kb.name);

  const maxChars = settings.kbMaxTokens * 3;
  let total = 0;
  const lines: string[] = [];
  for (const c of chosen) {
    const label = kbNames.get(c.kbId) || "知识库";
    const line = `[${label}] ${c.content}`;
    if (total + line.length > maxChars && lines.length) break;
    lines.push(line);
    total += line.length;
  }
  if (!lines.length) return "";
  return `\n\n[Knowledge]\n${lines.join("\n")}`;
}

export {
  sqlListKbs as listKnowledgeBases,
  sqlDeleteKb as deleteKnowledgeBase,
  sqlListDocuments as listDocuments,
  sqlDeleteDocument as deleteDocument,
  sqlListRoleKbIds as listRoleKbIds,
};
