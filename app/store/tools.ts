import { readRagSettings } from "./memory";
import { retrieveMemories } from "./memory";
import { retrieveKnowledgeBlock } from "./knowledge";
import { webSearch, formatWebSearchResults } from "./webSearch";
import { sqlReadMessages } from "./appDb";

export interface AppTool {
  name: string;
  description: string;
  parameters: any;
  execute: (args: any) => Promise<string>;
}

function toolSchema(
  name: string,
  description: string,
  properties: Record<string, any>,
  required: string[]
) {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: {
        type: "object",
        properties,
        required,
      },
    },
  };
}

/** 按当前设置构建可用工具（供 Function Calling 使用） */
export async function buildAppTools(
  roleId?: string,
  convoId?: string
): Promise<{ tools: any[]; executors: Map<string, (a: any) => Promise<string>> }> {
  const settings = await readRagSettings();
  const tools: any[] = [];
  const executors = new Map<string, (a: any) => Promise<string>>();

  if (settings.enabled && roleId) {
    tools.push(
      toolSchema(
        "search_memory",
        "搜索该角色的长期记忆库，查找用户偏好、历史事件、人物关系等（用于回忆很久以前的事）",
        { query: { type: "string", description: "要搜索的关键内容" } },
        ["query"]
      )
    );
    executors.set("search_memory", async (args) => {
      const mems = await retrieveMemories(roleId, String(args?.query || ""), {
        topK: 5,
        full: true,
      });
      if (!mems.length) return "记忆库中没有相关内容";
      return mems
        .map((m) => `${m.pinned ? "[置顶] " : ""}${m.content}`)
        .join("\n");
    });
  }

  if (settings.kbEnabled && roleId) {
    tools.push(
      toolSchema(
        "search_knowledge",
        "检索角色绑定的知识库（世界观、角色背景、设定文档等）",
        { query: { type: "string", description: "要检索的内容" } },
        ["query"]
      )
    );
    executors.set("search_knowledge", async (args) => {
      const block = await retrieveKnowledgeBlock(
        roleId,
        String(args?.query || "")
      );
      return block || "知识库中没有相关内容";
    });
  }

  if (convoId) {
    tools.push(
      toolSchema(
        "search_history",
        "搜索当前聊天记录中的历史消息（超出最近 20 条的部分），用于回忆你们很久以前聊过什么、当时的细节",
        { query: { type: "string", description: "要回忆的关键内容" } },
        ["query"]
      )
    );
    executors.set("search_history", async (args) => {
      const q = String(args?.query || "").trim();
      if (!q) return "查询内容为空";
      const msgs = await sqlReadMessages(convoId);
      const hits = msgs.filter(
        (m) =>
          m.role !== "system" &&
          (m.content || "").includes(q) &&
          !m.thinking
      );
      if (!hits.length) return "历史消息中没有相关内容";
      // 命中消息带时间与前后各一条上下文，最多 5 组
      const groups: string[] = [];
      for (const h of hits.slice(-5)) {
        const idx = msgs.findIndex((m) => m.id === h.id);
        const t = new Date(h.createdAt).toLocaleDateString("zh-CN");
        const prev = idx > 0 ? msgs[idx - 1] : null;
        const next = idx < msgs.length - 1 ? msgs[idx + 1] : null;
        const who = (m: any) =>
          m.role === "user" ? "用户" : m.senderName || "角色";
        const lines = [`[${t}] ${who(h)}：${h.content.slice(0, 200)}`];
        if (prev && prev.role !== "system") {
          lines.unshift(`  上文 ${who(prev)}：${prev.content.slice(0, 120)}`);
        }
        if (next && next.role !== "system") {
          lines.push(`  下文 ${who(next)}：${next.content.slice(0, 120)}`);
        }
        groups.push(lines.join("\n"));
      }
      return groups.join("\n\n---\n\n");
    });
  }

  if (settings.webSearchEnabled && settings.webSearchKey) {
    tools.push(
      toolSchema(
        "web_search",
        "联网搜索最新信息（实时新闻、百科、网络资料等）",
        {
          query: { type: "string", description: "搜索关键词" },
          max_results: {
            type: "number",
            description: "返回结果数量，默认 5",
          },
        },
        ["query"]
      )
    );
    executors.set("web_search", async (args) => {
      const results = await webSearch(String(args?.query || ""), {
        topK: Math.min(10, Math.max(1, Number(args?.max_results) || 5)),
      });
      const text = formatWebSearchResults(results);
      return text || "没有搜索到结果";
    });
  }

  return { tools, executors };
}
