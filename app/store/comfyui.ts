import AsyncStorage from "../utils/storage";
import * as FileSystem from "expo-file-system/legacy";

/**
 * ComfyUI 自动生图（移植自邻舍.EXE 的思路，REST 精简版）：
 * - 默认关闭；用户在设置里填服务器地址 + API 格式 workflow JSON 后开启
 * - 流程：POST /prompt 提交 → 轮询 /history/{id} → downloadAsync /view 落盘
 * - 提示词节点：用户可指定节点 ID，留空则自动探测（第一个 text 为纯文本的 CLIPTextEncode）
 */

export interface ComfySettings {
  enabled: boolean;
  url: string; // 如 http://192.168.31.100:8188
  workflowJson: string; // ComfyUI "Export (API)" 导出的 JSON
  promptNodeId: string; // 正向提示词节点 ID，空 = 自动探测
  qualitySuffix: string; // 画质后缀，拼在画面描述后
  autoAlbum: boolean; // 生图成功自动入角色相册
}

const COMFY_KEY = "wc_comfyui_v1";

export const DEFAULT_COMFY_SETTINGS: ComfySettings = {
  enabled: false,
  url: "",
  workflowJson: "",
  promptNodeId: "",
  qualitySuffix: "masterpiece, best quality, detailed",
  autoAlbum: true,
};

export async function readComfySettings(): Promise<ComfySettings> {
  try {
    const raw = await AsyncStorage.getItem(COMFY_KEY);
    if (!raw) return { ...DEFAULT_COMFY_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_COMFY_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_COMFY_SETTINGS };
  }
}

export async function saveComfySettings(s: ComfySettings) {
  await AsyncStorage.setItem(COMFY_KEY, JSON.stringify(s));
}

function normalizeBase(url: string): string {
  return (url || "").trim().replace(/\/+$/, "");
}

/** 解析 workflow JSON；兼容 API 格式 {id:{class_type,inputs}}，取 nodes 数组则转简易 API 形态 */
export function parseWorkflow(json: string): Record<string, any> | null {
  try {
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === "object") {
      if (parsed.nodes && Array.isArray(parsed.nodes)) {
        // GUI 格式：转成 {id:{class_type,inputs}}（inputs 只含 widget 值，连线信息丢弃）
        const out: Record<string, any> = {};
        const idMap = new Map<number, string>();
        for (const n of parsed.nodes) {
          const key = String(n.id);
          idMap.set(n.id, key);
          out[key] = { class_type: n.type, inputs: {} };
        }
        for (const n of parsed.nodes) {
          const key = idMap.get(n.id);
          if (!key) continue;
          for (const v of n.inputs || []) {
            if (v.widget !== undefined) {
              out[key].inputs[v.name] = v.widget;
            }
          }
        }
        return out;
      }
      // API 格式
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (v && typeof v === "object" && (v as any).class_type) {
          out[k] = v;
        }
      }
      return Object.keys(out).length ? out : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 自动探测正向提示词节点：API workflow 里第一个 text 为纯文本（非连线）的
 * CLIPTextEncode / CLIPTextEncodeSDXL 类节点。
 */
export function detectPromptNode(wf: Record<string, any>): string | null {
  const candidates: string[] = [];
  for (const [id, node] of Object.entries(wf)) {
    const ct = String(node?.class_type || "");
    if (!ct.toLowerCase().includes("cliptextencode")) continue;
    const text = node?.inputs?.text;
    if (typeof text === "string" && text.trim()) candidates.push(id);
  }
  // 优先取内容最短的那个（通常是质量词以外的正向提示词），否则取第一个
  candidates.sort((a, b) => {
    const la = String(wf[a]?.inputs?.text || "").length;
    const lb = String(wf[b]?.inputs?.text || "").length;
    return la - lb;
  });
  return candidates[0] || null;
}

export interface ComfyGenResult {
  ok: boolean;
  uri?: string; // 本地文件 URI
  error?: string;
}

/**
 * 生成一张图。prompt 为最终正向提示词（画面描述 + 角色外貌 + 画质后缀由调用方拼好）。
 */
export async function generateComfyImage(
  settings: ComfySettings,
  prompt: string
): Promise<ComfyGenResult> {
  const base = normalizeBase(settings.url);
  const wf = parseWorkflow(settings.workflowJson);
  if (!base) return { ok: false, error: "未填写 ComfyUI 服务器地址" };
  if (!wf) return { ok: false, error: "workflow JSON 无效（请用 ComfyUI 导出）" };

  const nodeId = settings.promptNodeId || detectPromptNode(wf);
  if (!nodeId || !wf[nodeId]) {
    return { ok: false, error: "未找到提示词节点，请在设置里手动填写节点 ID" };
  }
  wf[nodeId].inputs.text = prompt;

  let promptId = "";
  try {
    const res = await fetch(`${base}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: wf, client_id: "wc2-" + Date.now() }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `提交失败 HTTP ${res.status} ${text.slice(0, 120)}` };
    }
    const data = await res.json();
    promptId = data?.prompt_id || "";
  } catch (e: any) {
    return { ok: false, error: "连不上 ComfyUI：" + (e?.message || e) };
  }
  if (!promptId) return { ok: false, error: "ComfyUI 未返回 prompt_id" };

  // 轮询 history（最长 3 分钟）
  let outputs: any = null;
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    try {
      const res = await fetch(`${base}/history/${promptId}`);
      if (!res.ok) continue;
      const data = await res.json();
      const entry = data?.[promptId];
      if (entry?.outputs && Object.keys(entry.outputs).length) {
        outputs = entry.outputs;
        break;
      }
      if (entry?.status?.status_str === "error") {
        return { ok: false, error: "ComfyUI 执行出错（检查 workflow 与模型）" };
      }
    } catch { /* 网络抖动继续轮询 */ }
  }
  if (!outputs) return { ok: false, error: "生成超时（3 分钟），请检查 ComfyUI 队列" };

  // 取第一个图片输出
  let imgMeta: { filename: string; subfolder?: string; type?: string } | null = null;
  for (const nodeOut of Object.values<any>(outputs)) {
    const imgs = nodeOut?.images;
    if (Array.isArray(imgs) && imgs.length) {
      const pick = imgs.find((im: any) => im?.type === "output") || imgs[0];
      if (pick?.filename) {
        imgMeta = { filename: pick.filename, subfolder: pick.subfolder, type: pick.type };
        break;
      }
    }
  }
  if (!imgMeta) return { ok: false, error: "输出里没有图片节点" };

  // 下载到应用目录
  const ext = (imgMeta.filename.split(".").pop() || "png").toLowerCase();
  const localPath = `${FileSystem.documentDirectory}comfy-${Date.now()}.${ext}`;
  const qs = `filename=${encodeURIComponent(imgMeta.filename)}&subfolder=${encodeURIComponent(
    imgMeta.subfolder || ""
  )}&type=${encodeURIComponent(imgMeta.type || "output")}`;
  try {
    const result = await FileSystem.downloadAsync(`${base}/view?${qs}`, localPath);
    if (result.status !== 200) return { ok: false, error: `下载图片失败 HTTP ${result.status}` };
    return { ok: true, uri: result.uri };
  } catch (e: any) {
    return { ok: false, error: "下载图片失败：" + (e?.message || e) };
  }
}

/** 设置页的连通性测试：GET /system_stats */
export async function testComfyConnection(
  url: string
): Promise<{ ok: boolean; info?: string; error?: string }> {
  const base = normalizeBase(url);
  if (!base) return { ok: false, error: "请先填写服务器地址" };
  try {
    const res = await fetch(`${base}/system_stats`, { method: "GET" });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    const comfy = data?.system?.comfyui_version || "unknown";
    const queue = data?.queue?.running != null ? `${data.queue.running} running / ${data.queue.pending} pending` : "";
    return { ok: true, info: `ComfyUI ${comfy}${queue ? " · 队列 " + queue : ""}` };
  } catch (e: any) {
    return { ok: false, error: "连不上：" + (e?.message || e) };
  }
}
