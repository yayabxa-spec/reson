import { readRagSettings } from "./memory";

export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
}

/** 联网搜索（多供应商抽象：Tavily / Bocha / Brave） */
export async function webSearch(
  query: string,
  opts?: {
    provider?: "tavily" | "bocha" | "brave";
    apiKey?: string;
    topK?: number;
  }
): Promise<WebSearchResult[]> {
  const settings = await readRagSettings();
  const provider = opts?.provider || settings.webSearchProvider;
  const apiKey = opts?.apiKey || settings.webSearchKey;
  const topK = opts?.topK || settings.webSearchTopK || 5;
  if (!apiKey) return [];

  if (provider === "tavily") {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: topK,
        search_depth: "basic",
      }),
    });
    if (!res.ok) throw new Error(`Tavily 请求失败：HTTP ${res.status}`);
    const data = await res.json();
    return (data?.results || []).map((r: any) => ({
      title: r?.title || "",
      url: r?.url || "",
      content: r?.content || "",
    }));
  }

  if (provider === "bocha") {
    const res = await fetch("https://api.bochaai.com/v1/web-search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query, count: topK }),
    });
    if (!res.ok) throw new Error(`Bocha 请求失败：HTTP ${res.status}`);
    const data = await res.json();
    return (data?.data?.webpages || []).map((r: any) => ({
      title: r?.title || "",
      url: r?.url || "",
      content: r?.summary || r?.content || "",
    }));
  }

  // brave
  const url =
    "https://api.search.brave.com/res/v1/web/search?q=" +
    encodeURIComponent(query) +
    "&count=" +
    topK;
  const res = await fetch(url, {
    headers: { "X-Subscription-Token": apiKey },
  });
  if (!res.ok) throw new Error(`Brave 请求失败：HTTP ${res.status}`);
  const data = await res.json();
  return (data?.web?.results || []).map((r: any) => ({
    title: r?.title || "",
    url: r?.url || "",
    content: r?.description || "",
  }));
}

export function formatWebSearchResults(
  results: WebSearchResult[]
): string {
  if (!results.length) return "";
  return results
    .map(
      (r, i) =>
        `${i + 1}. ${r.title || "无标题"}\n   ${r.content || "无摘要"}\n   ${r.url}`
    )
    .join("\n");
}
