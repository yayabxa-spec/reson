import {
  readRagSettings,
  ensureMemoriesEmbedded,
  type MemoryEntry,
} from "./memory";
import { embedLocalBatch } from "../utils/localEmbed";
import {
  ensureDbInit,
  sqlReadMemories,
  sqlReadLocalEmbeddings,
  sqlUpsertLocalEmbeddings,
} from "./memoryDb";
import {
  ensureKbInit,
  sqlListKbs,
  sqlReadChunks,
  sqlReadKbLocalEmbeddings,
  sqlUpsertKbLocalEmbeddings,
} from "./kbDb";
import { embedKbChunks } from "./knowledge";

const BATCH = 50;
const yieldJs = () => new Promise((r) => setTimeout(r, 0));

/** 后台空闲预计算向量：本地（记忆+知识库）优先，云端已配置则补齐云端向量 */
export async function precomputeVectors(): Promise<void> {
  try {
    await ensureDbInit();
    await ensureKbInit();
    const settings = await readRagSettings();

    // ---- 本地向量（离线、免费）----
    const all = await sqlReadMemories();
    const byRole = new Map<string, MemoryEntry[]>();
    for (const m of all) {
      const list = byRole.get(m.roleId) || [];
      list.push(m);
      byRole.set(m.roleId, list);
    }
    for (const [roleId, entries] of byRole) {
      const cache = await sqlReadLocalEmbeddings(roleId);
      const missing = entries.filter((m) => !cache[m.id]);
      for (let i = 0; i < missing.length; i += BATCH) {
        const part = missing.slice(i, i + BATCH);
        const vecs = await embedLocalBatch(part.map((m) => m.content));
        await sqlUpsertLocalEmbeddings(
          roleId,
          part.map((m, j) => ({ memId: m.id, vector: vecs[j] || [] }))
        );
        await yieldJs();
      }
    }

    const kbs = await sqlListKbs();
    const kbIds = kbs.map((k) => k.id);
    if (kbIds.length) {
      const chunks = await sqlReadChunks(kbIds, 5000);
      const cache = await sqlReadKbLocalEmbeddings(kbIds);
      const missing = chunks.filter((c) => !cache[c.id]);
      for (let i = 0; i < missing.length; i += BATCH) {
        const part = missing.slice(i, i + BATCH);
        const vecs = await embedLocalBatch(part.map((c) => c.content));
        await sqlUpsertKbLocalEmbeddings(
          part.map((c, j) => ({
            chunkId: c.id,
            kbId: c.kbId,
            vector: vecs[j] || [],
          }))
        );
        await yieldJs();
      }
    }

    // ---- 云端向量（配置了 key 才做）----
    if (settings.embedding.apiKey) {
      for (const [roleId, entries] of byRole) {
        try {
          await ensureMemoriesEmbedded(roleId, entries, settings.embedding);
        } catch {}
      }
      if (kbIds.length) {
        try {
          await embedKbChunks(kbIds, await sqlReadChunks(kbIds, 5000));
        } catch {}
      }
    }
  } catch {}
}