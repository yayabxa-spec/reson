import AsyncStorage from "../utils/storage";
import { atom, useRecoilState } from "recoil";
import { useCallback } from "react";
import type { AIConfig } from "../utils/ai";

export type ModelCategory = "text" | "image" | "voice";

export const CATEGORY_LABELS: Record<ModelCategory, string> = {
  text: "文本",
  image: "图像",
  voice: "语音",
};

export const CATEGORIES: ModelCategory[] = ["text", "image", "voice"];

export const CAP_LABELS_ALL: {
  key: keyof ProviderModel["capabilities"];
  label: string;
}[] = [
  { key: "text", label: "文本" },
  { key: "image", label: "图片" },
  { key: "video", label: "视频" },
  { key: "audio", label: "音频" },
  { key: "stt", label: "转文字" },
  { key: "tts", label: "转声音" },
];

export interface ProviderModel {
  id: string;
  name: string;
  capabilities: {
    text: boolean;
    image: boolean;
    video: boolean;
    audio: boolean;
    stt: boolean;
    tts: boolean;
  };
}

/** 各类供应商下的能力勾选项（外层三大类不变，内部细分） */
export const CATEGORY_CAPS: Record<
  ModelCategory,
  { key: keyof ProviderModel["capabilities"]; label: string }[]
> = {
  text: [{ key: "text", label: "文本" }],
  image: [
    { key: "image", label: "图片" },
    { key: "video", label: "视频" },
  ],
  voice: [
    { key: "stt", label: "转文字" },
    { key: "tts", label: "转声音" },
  ],
};

export interface Provider {
  id: string;
  name: string; // 供应商显示名
  consoleUrl?: string; // 控制台网址
  apiDomain: string;
  apiDomains?: string[];
  apiKey: string;
  models: ProviderModel[];
}

export interface RoleModelBindings {
  text?: string; // ProviderModel.id
  image?: string;
  voice?: string;
}

const PROVIDER_KEY = "wc_local_providers_v1";


/** 快捷供应商预设（api.txt） */
export const PRESET_PROVIDERS: {
  name: string;
  apiDomain: string;
  consoleUrl: string;
  apiDomains?: string[];
  note?: string;
}[] = [
  { name: "DeepSeek", apiDomain: "https://api.deepseek.com", consoleUrl: "https://platform.deepseek.com/sign_in" },
  {
    name: "Xiaomi Mimo",
    apiDomain: "https://api.xiaomimimo.com/v1",
    consoleUrl: "https://platform.xiaomimimo.com/",
    apiDomains: [
      "https://api.xiaomimimo.com/v1",
      "https://token-plan-cn.xiaomimimo.com/v1",
    ],
    note: "订阅套餐密钥为 tp- 开头，自动使用 token-plan 地址",
  },
  { name: "Kimi", apiDomain: "https://api.moonshot.cn/v1", consoleUrl: "https://platform.kimi.com/console/account" },
  {
    name: "智谱",
    apiDomain: "https://open.bigmodel.cn/api/coding/paas/v4",
    consoleUrl: "https://bigmodel.cn/console/overview",
  },
  { name: "MiniMAX", apiDomain: "https://api.minimaxi.com/v1", consoleUrl: "https://account.minimaxi.com/unified-login" },
  {
    name: "火山方舟",
    apiDomain: "https://ark.cn-beijing.volces.com/api/v3/responses",
    consoleUrl: "https://console.volcengine.com/ark/region:cn-beijing",
  },
  {
    name: "硅基流动",
    apiDomain: "https://api.siliconflow.cn/v1",
    consoleUrl: "https://account.siliconflow.cn/zh/login",
    note: "平台模型很多，获取列表后按需勾选",
  },
];

/** 读取时补齐 capabilities 字段 */
export function normalizeProvider(p: Provider): Provider {
  return {
    ...p,
    apiDomains: p.apiDomains && p.apiDomains.length
      ? p.apiDomains.includes(p.apiDomain)
        ? p.apiDomains
        : [p.apiDomain, ...p.apiDomains]
      : [p.apiDomain],
    models: (p.models || []).map((m) => ({
      id: m.id,
      name: m.name || m.id,
      capabilities: {
        text: m.capabilities?.text ?? true,
        image: m.capabilities?.image ?? false,
        video: m.capabilities?.video ?? false,
        audio: m.capabilities?.audio ?? false,
        // stt/tts 未配置时沿用 voice 标记
        stt: m.capabilities?.stt ?? !!(
          m.capabilities as { voice?: boolean } | undefined
        )?.voice,
        tts: m.capabilities?.tts ?? !!(
          m.capabilities as { voice?: boolean } | undefined
        )?.voice,
      },
    })),
  };
}

const providersState = atom<Provider[]>({
  key: "aiProviders",
  default: [],
});

export async function readProvidersRaw(): Promise<Provider[]> {
  try {
    const raw = await AsyncStorage.getItem(PROVIDER_KEY);
    return raw ? JSON.parse(raw).map(normalizeProvider) : [];
  } catch {
    return [];
  }
}

async function writeProvidersRaw(list: Provider[]) {
  await AsyncStorage.setItem(PROVIDER_KEY, JSON.stringify(list));
}

export async function ensureProvidersSeeded(): Promise<Provider[]> {
  return readProvidersRaw();
}

export async function addProvider(p: Provider): Promise<Provider> {
  const list = await readProvidersRaw();
  const item = { ...p, id: p.id || "p-" + Date.now() };
  await writeProvidersRaw([...list, item]);
  return item;
}

export async function updateProvider(
  providerId: string,
  patch: Partial<Provider>
) {
  const list = await readProvidersRaw();
  const next = list.map((p) =>
    p.id === providerId ? { ...p, ...patch } : p
  );
  await writeProvidersRaw(next);
}

export async function deleteProvider(providerId: string) {
  const list = await readProvidersRaw();
  await writeProvidersRaw(list.filter((p) => p.id !== providerId));
}

/** 根据角色绑定的模型解析出可用的 AI 配置 */
export async function resolveRoleConfig(
  bindings: RoleModelBindings | undefined,
  key: ModelCategory = "text"
): Promise<AIConfig | null> {
  const providers = await readProvidersRaw();
  const modelId = bindings?.[key];
  if (modelId) {
    const p = providers.find((x) =>
      x.models.some((m) => m.id === modelId)
    );
    if (p) {
      return {
        apiDomain: p.apiDomain,
        apiDomains: p.apiDomains,
        apiKey: p.apiKey,
        model: modelId,
        provider: "custom",
      };
    }
    // 角色明确绑定了模型，但供应商/模型已不存在：不静默换成别的模型
    return null;
  }
  // fallback：该大类第一个供应商的第一个模型
  const first = providers.find((x) => x.models.length);
  if (first) {
    const m =
      first.models.find((mm) =>
        key === "text"
          ? mm.capabilities.text
          : key === "image"
          ? mm.capabilities.image ||
            mm.capabilities.video ||
            mm.capabilities.audio
          : mm.capabilities.stt || mm.capabilities.tts
      ) || first.models[0];
    return {
      apiDomain: first.apiDomain,
      apiDomains: first.apiDomains,
      apiKey: first.apiKey,
      model: m.id,
      provider: "custom",
    };
  }
  return null;
}

export const useProviders = () => {
  const [providers, setProviders] = useRecoilState(providersState);

  const loadProviders = useCallback(async (): Promise<Provider[]> => {
    const list = await ensureProvidersSeeded();
    setProviders(list);
    return list;
  }, []);

  const refresh = useCallback(() => loadProviders(), [loadProviders]);

  return {
    providers,
    setProviders,
    loadProviders,
    refresh,
  };
};
