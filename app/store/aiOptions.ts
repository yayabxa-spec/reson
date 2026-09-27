import AsyncStorage from "../utils/storage";
import eventBus from "../utils/eventBus";

// ============================================================
// AI 对话选项：
// - thinkingEnabled：允许模型输出思考链（默认关 = 禁思考，保证发消息不串味；
//   开启后 ai.ts 仍有"正文为空自动关思考重试"兜底，思考不会被当正文发出）
// - convertTopSystem：兼容模式，把 system 消息转成 user 消息
//   （部分模型/网关不接受 system 角色，参考爱语 key_compatibility_convert_top_system）
// ============================================================

export interface AiOptions {
  thinkingEnabled: boolean;
  convertTopSystem: boolean;
}

const KEY = "wc_local_ai_options_v1";

const DEFAULT_OPTIONS: AiOptions = {
  thinkingEnabled: false,
  convertTopSystem: false,
};

let cache: AiOptions | null = null;

export async function readAiOptions(): Promise<AiOptions> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw
      ? { ...DEFAULT_OPTIONS, ...JSON.parse(raw) }
      : { ...DEFAULT_OPTIONS };
  } catch {
    cache = { ...DEFAULT_OPTIONS };
  }
  return cache as AiOptions;
}

export async function saveAiOptions(opts: AiOptions): Promise<void> {
  cache = { ...opts };
  await AsyncStorage.setItem(KEY, JSON.stringify(cache));
  eventBus.emit("ai-options-updated");
}

/** 供 ai.ts 快速判断：是否允许思考链（无缓存时异步读一次） */
export async function isThinkingEnabled(): Promise<boolean> {
  const opts = await readAiOptions();
  return opts.thinkingEnabled;
}

/** 供 ai.ts 快速判断：是否启用 system 转 user 兼容 */
export async function isConvertTopSystemEnabled(): Promise<boolean> {
  const opts = await readAiOptions();
  return opts.convertTopSystem;
}
