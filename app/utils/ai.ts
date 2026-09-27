import {
  isConvertTopSystemEnabled,
  isThinkingEnabled,
} from "../store/aiOptions";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  // 支持纯文本 string 或 vision 格式的 content 数组（图片 + 文字混合）
  content: string | Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  >;
  tool_call_id?: string;
  tool_calls?: {
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }[];
}

/** 带超时的 fetch：防止网关挂起时请求永久卡住 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 120_000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export interface AIConfig {
  id?: string;
  apiDomain: string;
  apiDomains?: string[]; // 备用接口地址（主域名失败时逐个重试）
  apiKey: string;
  model: string;
  name?: string; // 配置显示名
  provider?: "deepseek" | "siliconflow" | "custom"; // 服务商预设
  visionModel?: string; // 辅助视觉模型（图片识别）
  audioModel?: string; // 辅助听觉模型（语音转文字）
}

/** 测试连接：请求 /models */
export async function testConnection(
  config: AIConfig,
  extraDomains?: string[]
): Promise<string> {
  const domains = [config.apiDomain, ...(extraDomains || [])];
  let lastErr = "";
  for (const d of domains) {
    try {
      const url = d.replace(/\/+$/, "") + "/models";
      const res = await fetchWithTimeout(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
      }, 30_000);
      if (!res.ok) {
        lastErr = `连接失败：HTTP ${res.status} ${await safeText(res)}`;
        continue;
      }
      const data = await res.json();
      const models = data?.data;
      if (Array.isArray(models) && models.length) {
        return `连接成功，可用模型 ${models.length} 个`;
      }
      return "连接成功";
    } catch (e: any) {
      lastErr = e?.message || "连接失败";
    }
  }
  throw new Error(lastErr || "连接失败");
}

/** 获取可用模型列表（/models） */
export async function fetchModels(
  config: AIConfig,
  extraDomains?: string[]
): Promise<{ models: string[]; domain: string }> {
  const domains = [config.apiDomain, ...(extraDomains || [])];
  const seen = new Set<string>();
  const result: string[] = [];
  let usedDomain = "";
  let lastErr = "";
  for (const d of domains) {
    try {
      const url = d.replace(/\/+$/, "") + "/models";
      const res = await fetchWithTimeout(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
      }, 30_000);
      if (!res.ok) {
        lastErr = `HTTP ${res.status}`;
        continue;
      }
      const data = await res.json();
      const list = data?.data;
      if (Array.isArray(list) && list.length && !usedDomain) {
        usedDomain = d;
      }
      if (Array.isArray(list)) {
        for (const m of list) {
          const id = typeof m === "string" ? m : m?.id;
          if (id && !seen.has(id)) {
            seen.add(id);
            result.push(id);
          }
        }
      }
    } catch (e: any) {
      lastErr = e?.message || "";
    }
  }
  if (!result.length && lastErr) {
    throw new Error(`获取模型列表失败：${lastErr}`);
  }
  return { models: result, domain: usedDomain || config.apiDomain };
}

export interface CapabilityResult {
  text: boolean;
  image: boolean;
  video: boolean;
  audio: boolean;
  stt: boolean;
  tts: boolean;
}

/** 一键测试模型能力：按大类自动探测 */
export async function testModelCapabilities(
  config: AIConfig,
  modelId: string,
  extraDomains?: string[]
): Promise<CapabilityResult> {
  const domains = [config.apiDomain, ...(extraDomains || [])];
  const headers = {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
  };
  const result: CapabilityResult = {
    text: false,
    image: false,
    video: false,
    audio: false,
    stt: false,
    tts: false,
  };

  const id = modelId.toLocaleLowerCase();

  const pixel =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const wavB64 =
    "UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YSADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

  const tryAll = async (build: (base: string) => { path: string; body: any }) => {
    for (const d of domains) {
      try {
        const base = d.replace(/\/+$/, "");
        const { path, body } = build(base);
        const r = await fetchWithTimeout(base + path, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        }, 30_000);
        if (r.ok) return { status: r.status, text: "" };
        if (r.status === 400) return { status: 400, text: await r.text() };
      } catch {}
    }
    return { status: -1, text: "" };
  };

  // 1. 文本生成（任一地址成功即支持）
  if (
    (await tryAll((base) => ({
      path: "/chat/completions",
      body: {
        model: modelId,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 5,
      },
    }))).status === 200
  ) {
    result.text = true;
  }

  // 2. 图片（图片输入 → 文生图兜底）
  const vision = await tryAll((base) => ({
    path: "/chat/completions",
    body: {
      model: modelId,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "what is this" },
            { type: "image_url", image_url: { url: pixel } },
          ],
        },
      ],
      max_tokens: 5,
    },
  }));
  if (vision.status === 200) result.image = true;
  if (!result.image) {
    const gen = await tryAll((base) => ({
      path: "/images/generations",
      body: {
        model: modelId,
        prompt: "a red apple",
        n: 1,
        size: "256x256",
      },
    }));
    if (gen.status === 200) result.image = true;
  }

  // 2.5 音频理解
  const audio = await tryAll((base) => ({
    path: "/chat/completions",
    body: {
      model: modelId,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "what" },
            {
              type: "input_audio",
              input_audio: { data: wavB64, format: "wav" },
            },
          ],
        },
      ],
      max_tokens: 5,
    },
  }));
  if (audio.status === 200) result.audio = true;

  // 2.6 视频理解
  const video = await tryAll((base) => ({
    path: "/chat/completions",
    body: {
      model: modelId,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "what" },
            {
              type: "video_url",
              video_url: { url: "https://example.com/v.mp4" },
            },
          ],
        },
      ],
      max_tokens: 5,
    },
  }));
  if (video.status === 200) {
    result.video = true;
  } else if (video.status === 400) {
    const t = video.text;
    if (
      /media|download|process/i.test(t) &&
      !/unsupported|not support|invalid type|not allowed|unexpected type|expected one of/i.test(
        t
      )
    ) {
      result.video = true;
    }
  }

  // 3. 转声音（TTS）
  const tts = await tryAll((base) => ({
    path: "/audio/speech",
    body: { model: modelId, input: "hi", voice: "alloy" },
  }));
  if (tts.status === 200) result.tts = true;

  // 4. 转文字（STT）：端点存在即标记（404 = 端点不存在，其他状态 = 存在）
  for (const d of domains) {
    try {
      const r = await fetchWithTimeout(
        d.replace(/\/+$/, "") + "/audio/transcriptions",
        {
        method: "POST",
        headers,
        body: JSON.stringify({ model: modelId }),
        },
        30_000
      );
      if (r.status !== 404) {
        result.stt = true;
        break;
      }
    } catch {}
  }

  // 名字兜底
  if (!result.tts && /(tts|voice|speech|audio|voiceclone|voicedesign)/.test(id))
    result.tts = true;
  if (!result.stt && /(asr|transcri|whisper)/.test(id)) result.stt = true;
  if (!result.video && /(video|vision|vl|omni)/.test(id)) result.video = true;
  if (!result.audio && /(audio|omni)/.test(id)) result.audio = true;

  return result;
}

/** 非流式聊天补全 */
export async function chatCompletion(
  config: AIConfig,
  messages: ChatMessage[],
  options?: {
  temperature?: number;
  maxTokens?: number;
  noThinking?: boolean;
  /** 捕获模型输出的思考链（<think>…</think> 或 reasoning_content），供落库/导出 */
  onThinking?: (text: string) => void;
  roleId?: string;
  scene?: string;
  }
): Promise<string> {
  const domains = [config.apiDomain, ...(config.apiDomains || [])];
  // 兼容模式：把 system 消息转成 user（部分模型/网关不接受 system 角色）
  const convertTop = await isConvertTopSystemEnabled();
  const msgs = convertTop
    ? messages.map((m) =>
        m.role === "system" ? { ...m, role: "user" as const } : m
      )
    : messages;
  // 思考链：调用点显式 noThinking，或全局未开启思考时一律禁用
  const thinkingEnabled = await isThinkingEnabled();
  const noThinking = !!options?.noThinking || !thinkingEnabled;
  let lastErr = "";
  for (const d of domains) {
    let res: Response;
    try {
      const url = d.replace(/\/+$/, "") + "/chat/completions";
      const bodyObj: Record<string, any> = {
        model: config.model,
        messages: msgs,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 2048,
        stream: false,
      };
      if (noThinking) {
        bodyObj.thinking = { type: "disabled" };
      }
      res = await fetchWithTimeout(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bodyObj),
      }, 120_000);
    } catch (e: any) {
      lastErr = e?.message || "网络请求失败";
      continue;
    }
    if (!res.ok) {
      lastErr = `请求失败：HTTP ${res.status} ${await safeText(res)}`;
      continue;
    }
    const data = await res.json();
    // 成本统计：记录本次 token 消耗（按天+模型聚合，静默失败不影响主流程）
    try {
      const u = data?.usage;
      if (u && (u.prompt_tokens != null || u.completion_tokens != null)) {
        const { sqlRecordUsage } = await import("../store/appDb");
        const cached =
          u?.prompt_tokens_details?.cached_tokens ?? u?.cached_tokens ?? 0;
        sqlRecordUsage(
          config.model,
          u.prompt_tokens || 0,
          u.completion_tokens || 0,
          cached,
          options?.roleId || "",
          options?.scene || ""
        ).catch(() => {});
      }
    } catch {}
    let content: string = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      const reasoning: string = data?.choices?.[0]?.message?.reasoning_content;
      // 思考型模型（如小米 MiMo）默认把所有输出放 reasoning_content、正文为空。
      // 绝不能把思考内容当正式回复发出去——自动用「关闭思考」重试一次拿正文。
      if (reasoning && !options?.noThinking) {
        options?.onThinking?.(String(reasoning || "").trim());
        try {
          const retry = await chatCompletion(config, messages, {
            ...options,
            noThinking: true,
          });
          return retry;
        } catch {
          // 重试失败（如模型不支持该参数），继续走报错
        }
      }
      throw new Error("AI 返回内容为空，请检查模型名称是否正确");
    }
    // 去掉部分模型的 <think> 推理过程，只保留正式回复
    const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
    if (thinkMatch && thinkMatch[1]?.trim()) {
      options?.onThinking?.(thinkMatch[1].trim());
    }
    content = content.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim();
    if (!content) {
      throw new Error("AI 只返回了推理内容，请更换模型重试");
    }
    return content;
  }
  throw new Error(lastErr || "请求失败");
}

export interface ToolCallInfo {
  id: string;
  name: string;
  arguments: string;
}

export interface BalanceInfo {
  currency: string;
  total: string;
  available: string;
}

/**
 * 查询供应商账户余额（实时）：
 * - DeepSeek：GET /user/balance（官方支持）
 * - 硅基流动：GET /v1/user/info（官方支持）
 * - 智谱：尝试 /api/paas/v4/balance（失败视为不支持）
 * 其余平台返回 null（无公开余额接口）。
 */
export async function fetchProviderBalance(
  apiDomain: string,
  apiKey: string
): Promise<BalanceInfo | null> {
  const domain = (apiDomain || "").toLowerCase();
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  };
  try {
    if (domain.includes("deepseek.com")) {
      const res = await fetchWithTimeout(
        "https://api.deepseek.com/user/balance",
        { method: "GET", headers },
        20_000
      );
      if (!res.ok) return null;
      const data = await res.json();
      const b = data?.balance_infos?.[0];
      if (!b) return null;
      return {
        currency: b.currency || "CNY",
        total: String(b.total_balance ?? ""),
        available: String(b.topped_up_balance ?? b.granted_balance ?? ""),
      };
    }
    if (domain.includes("siliconflow.cn")) {
      const res = await fetchWithTimeout(
        "https://api.siliconflow.cn/v1/user/info",
        { method: "GET", headers },
        20_000
      );
      if (!res.ok) return null;
      const data = await res.json();
      if (data?.total_balance == null && data?.balance == null) return null;
      return {
        currency: "CNY",
        total: String(data?.total_balance ?? data?.balance ?? ""),
        available: String(data?.balance ?? ""),
      };
    }
    if (domain.includes("bigmodel.cn")) {
      const res = await fetchWithTimeout(
        "https://open.bigmodel.cn/api/paas/v4/balance",
        { method: "GET", headers },
        20_000
      );
      if (!res.ok) return null;
      const data = await res.json();
      const b = data?.data?.balance || data?.balance;
      if (b == null) return null;
      return {
        currency: "CNY",
        total: String(b),
        available: String(b),
      };
    }
  } catch {
    return null;
  }
  return null;
}

/** 支持工具（Function Calling）的补全：返回正文与工具调用列表 */
export async function chatCompletionWithTools(
  config: AIConfig,
  messages: ChatMessage[],
  tools: any[],
  options?: {
    temperature?: number;
    maxTokens?: number;
    onThinking?: (text: string) => void;
    roleId?: string;
    scene?: string;
  }
): Promise<{ content: string; toolCalls: ToolCallInfo[] }> {
  const domains = [config.apiDomain, ...(config.apiDomains || [])];
  const convertTop = await isConvertTopSystemEnabled();
  const msgs = convertTop
    ? messages.map((m) =>
        m.role === "system" ? { ...m, role: "user" as const } : m
      )
    : messages;
  const thinkingEnabled = await isThinkingEnabled();
  let lastErr = "";
  for (const d of domains) {
    let res: Response;
    try {
      const url = d.replace(/\/+$/, "") + "/chat/completions";
      res = await fetchWithTimeout(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.model,
          messages: msgs,
          tools,
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 2048,
          stream: false,
          ...(thinkingEnabled ? {} : { thinking: { type: "disabled" } }),
        }),
      }, 120_000);
    } catch (e: any) {
      lastErr = e?.message || "网络请求失败";
      continue;
    }
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      lastErr = `请求失败：HTTP ${res.status} ${t.slice(0, 200)}`;
      continue;
    }
    const data = await res.json();
    // 成本统计（工具调用路径同样记录）
    try {
      const u = data?.usage;
      if (u && (u.prompt_tokens != null || u.completion_tokens != null)) {
        const { sqlRecordUsage } = await import("../store/appDb");
        const cached =
          u?.prompt_tokens_details?.cached_tokens ?? u?.cached_tokens ?? 0;
        sqlRecordUsage(
          config.model,
          u.prompt_tokens || 0,
          u.completion_tokens || 0,
          cached,
          options?.roleId || "",
          options?.scene || ""
        ).catch(() => {});
      }
    } catch {}
    const message = data?.choices?.[0]?.message;
    const rawCalls = message?.tool_calls || [];
    const toolCalls: ToolCallInfo[] = rawCalls
      .map((tc: any) => ({
        id: String(tc?.id || ""),
        name: String(tc?.function?.name || ""),
        arguments: String(tc?.function?.arguments || "{}"),
      }))
      .filter((t: ToolCallInfo) => t.name);
    let content: string = message?.content || "";
    if (typeof content !== "string") content = "";
    const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
    if (thinkMatch && thinkMatch[1]?.trim()) {
      options?.onThinking?.(thinkMatch[1].trim());
    }
    content = content.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim();
    return { content, toolCalls };
  }
  throw new Error(lastErr || "请求失败");
}

/** AI 优化角色卡的某个字段（人设/开场白/示例对话） */
export async function optimizeRoleText(
  config: AIConfig,
  fieldName: string,
  content: string,
  roleName: string
): Promise<string> {
  const prompt = `你是一个专业的中文角色扮演角色卡优化助手。请优化以下角色卡中的「${fieldName}」字段。

角色名：${roleName}
当前内容：
${content}

要求：
1. 保持原有设定和风格，不要改变角色核心人设；
2. 让表达更生动、更有画面感、更符合角色扮演场景；
3. ${fieldName === "开场白" ? "开场白要自然、有代入感，能立刻把用户拉进角色氛围。" : fieldName === "示例对话" ? "示例对话要展示角色的典型说话方式和互动风格。" : "人设要具体：包含性格、背景、说话风格、口头禅等。"}
4. 只返回优化后的内容本身，不要任何解释、标题或 <think> 标签。`;

  return chatCompletion(config, [{ role: "user", content: prompt }], {
    temperature: 0.8,
    maxTokens: 1024,
    scene: "角色卡优化",
  });
}

async function safeText(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text.slice(0, 300);
  } catch {
    return "";
  }
}
