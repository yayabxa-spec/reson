/**
 * 清理模型输出里的富文本/HTML 残留，
 * 例如 <span class="emoji">🧸</span> 会变成 🧸。
 * 注意：本函数只用于聊天文本显示与存储，
 * 不要用它处理 <proactive:N> / <search:...> 等内部指令（会先被解析再清理）。
 */
export function cleanChatText(text: string): string {
  if (!text) return text;
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<\/?[a-zA-Z][^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) =>
      String.fromCharCode(parseInt(h, 16))
    )
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
