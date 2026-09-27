import { embedLocal, embedLocalBatch } from "../utils/localEmbed";
import { cosineSimilarity } from "./memory";
import type { RoleBackgroundItem } from "./builtin/types";

// 角色内知识检索：只检索该角色自己的 background（不进全局知识库）。
// 向量按角色缓存（内存），首次检索会现算，之后秒回。

const cache = new Map<
  string,
  { item: RoleBackgroundItem; vec: number[] }[]
>();

/** 按查询从角色 background 中检索 Top-N 条，返回格式化注入块（空串表示无） */
export async function retrieveRoleBackground(
  roleId: string,
  items: RoleBackgroundItem[],
  query: string,
  topN = 4
): Promise<string> {
  if (!items?.length || !query.trim()) return "";
  let vecs = cache.get(roleId);
  if (!vecs || vecs.length !== items.length) {
    const texts = items.map((i) => i.title + "。" + i.content);
    const vs = await embedLocalBatch(texts);
    vecs = items.map((item, i) => ({ item, vec: vs[i] || [] }));
    cache.set(roleId, vecs);
    if (cache.size > 200) cache.clear();
  }
  const qv = await embedLocal(query);
  const scored = vecs
    .map((v) => ({ v, s: cosineSimilarity(qv, v.vec) }))
    .filter((x) => x.s > 0.2)
    .sort((a, b) => b.s - a.s)
    .slice(0, topN);
  if (!scored.length) return "";
  const lines = scored.map(({ v }) => {
    const t = v.item.title || "资料";
    const c =
      v.item.content.length > 200
        ? v.item.content.slice(0, 200) + "…"
        : v.item.content;
    return `- ${t}：${c}`;
  });
  return `\n\n【角色详细资料（按需检索）】\n${lines.join("\n")}\n（上述资料仅在与当前话题相关时自然地使用，不要机械罗列。）`;
}