/**
 * 海豚 AI TTS-Online 二次元语音合成（角色音色自动匹配 + 合成）
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import * as FileSystem from "expo-file-system/legacy";

const TTSON_API = "https://api.ttson.cn";
const TOKEN_KEY = "ttson_api_token";
// v2：新增 rawTags（原始标签），区分"原神"/"新原神星铁"批次，避免日配/英配声线被误匹配
const VOICES_CACHE_KEY = "ttson_voices_v2";
// 会话内内存缓存：避免每次聚焦页面都重新读/解析 400KB 音色清单
let voicesMemoryCache: TtsonVoice[] | null = null;
const CACHE_TTL = 24 * 3600 * 1000;
// 密钥由用户自行在设置中配置，不再内置明文
const BUILTIN_TOKEN = "";

/** 把 TTS 临时链接下载到应用本地目录，避免链接过期/流式导致无法播放或拿不到时长 */
export async function persistVoiceAudio(
  url: string,
  msgId: string
): Promise<string | null> {
  try {
    const dest = `${FileSystem.documentDirectory}voice-${msgId}.wav`;
    const res = await FileSystem.downloadAsync(url, dest);
    if (res.status >= 200 && res.status < 300) {
      return res.uri || dest;
    }
  } catch {}
  return null;
}

/**
 * 原神角色 → 官方中配声优名（来源 gi.yatta.moe / Project Amber 角色数据）。
 * 平台音色清单里同一角色同时存在中配/日配/英配多套声线（且都标成 zh-CN），
 * 匹配时必须优先"角色名+中配声优名"同时出现的条目，否则会绑到日配声优
 * （佐藤利奈/高桥李依/佐仓绫音等），合成出来就是日语音频。
 */
export const GENSHIN_CN_CV: Record<string, string> = {
  "七七": "宴宁",
  "丝柯克": "谢莹",
  "优菈": "子音",
  "达达利亚": "鱼冻",
  "迪卢克·莱艮芬德": "马洋",
  "迪奥娜": "诺亚",
  "迪希雅": "陈雨",
  "那维莱特": "桑毓泽",
  "重云": "kinsen",
  "钟离": "彭博",
  "闲云": "秦紫翼",
  "阿蕾奇诺": "黄莺",
  "克洛琳德": "赵涵雨",
  "阿贝多": "Mace",
  "雷泽": "周帅",
  "雷电将军": "菊花花",
  "香菱": "小N",
  "魈": "kinsen",
  "鹿野院平藏": "林景",
  "八重神子": "杜冥鸦",
  "凝光": "杜冥鸦",
  "刻晴": "谢莹",
  "北斗": "唐雅菁",
  "千织": "陈阳",
  "卡维": "刘三木",
  "丽莎": "钟可",
  "卡齐娜": "静宸",
  "可莉": "花玲",
  "嘉明": "谢莹",
  "坎蒂丝": "张琦",
  "基尼奇": "斑马&弭洋",
  "夏沃蕾": "潘丹妮",
  "夏洛蒂": "阮从青",
  "久岐忍": "杨凝",
  "多莉": "王晓彤",
  "夜兰": "徐慧",
  "妮露": "紫苏九月",
  "娜维娅": "小敢",
  "安柏": "蔡书瑾",
  "宵宫": "金娜",
  "九条裟罗": "杨梦露",
  "希格雯": "赵爽",
  "希诺宁": "弭洋",
  "托马": "张沛",
  "提纳里": "莫然",
  "早柚": "Sakula小舞",
  "林尼": "锦鲤",
  "枫原万叶": "斑马",
  "柯莱": "秦文静",
  "云堇": "贺文潇&杨扬",
  "流浪者": "鹿喑",
  "温迪": "喵酱",
  "烟绯": "苏子芜",
  "五郎": "杨昕燃",
  "玛拉妮": "王晓彤",
  "玛薇卡": "李晔",
  "珊瑚宫心海": "龟娘",
  "珐露珊": "阎萌萌",
  "班尼特": "穆雪婷",
  "琳妮特": "可可味",
  "瑶瑶": "刘颐诺",
  "甘雨": "林簌",
  "申鹤": "秦紫翼",
  "白术": "秦且歌&王晓彤",
  "砂糖": "小敢",
  "神里绫人": "赵路",
  "神里绫华": "小N",
  "米卡": "邓宥希",
  "纳西妲": "花玲",
  "绮良良": "孙艳琦",
  "罗莎莉亚": "张安琪",
  "胡桃": "陶典",
  "艾尔海森": "杨超然",
  "芭芭拉": "宋媛媛",
  "茜特菈莉": "柳知萧",
  "荒泷一斗": "刘照坤",
  "莫娜": "陈婷婷",
  "莱依拉": "侯小菲",
  "莱欧斯利": "刘北辰",
  "菲米尼": "锦鲤",
  "菲谢尔": "Mace&赵悦程",
  "芙宁娜·德·枫丹": "钱琛",
  "行秋": "唐雅菁",
  "诺艾尔": "宴宁",
  "赛索斯": "李兰陵",
  "赛诺": "李轻扬",
  "辛焱": "王雅欣",
};

/** 读取加密存储的 token */
export async function getToken(): Promise<string> {
  try {
    const stored = await SecureStore.getItemAsync(TOKEN_KEY);
    if (stored) return stored;
    // 首次使用：内置密钥写入系统安全存储（Keystore/Keychain 加密）
    await SecureStore.setItemAsync(TOKEN_KEY, BUILTIN_TOKEN);
    return BUILTIN_TOKEN;
  } catch {
    return BUILTIN_TOKEN;
  }
}

/** 加密保存 token（Android Keystore / iOS Keychain） */
export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token.trim());
}

export interface TtsonVoice {
  voice_id: number;
  voice_name: string;
  language: string;
  gender: string;
  tags: string[];
  /** 平台原始标签（fixTags 之前），用于区分"原神"/"新原神星铁"批次 */
  rawTags?: string[];
}

function fixTags(tags: string[], name: string): string[] {
  const out: string[] = [];
  for (const t of tags) {
    if (t === "新原神星铁") {
      if (/星穹铁道|星铁|崩坏/.test(name)) out.push("星铁");
      else if (/原神/.test(name)) out.push("原神");
      else {
        out.push("原神");
        out.push("星铁");
      }
    } else {
      out.push(t);
    }
  }
  return out;
}

async function readCache(): Promise<{ at: number; data: TtsonVoice[] } | null> {
  try {
    const s = await AsyncStorage.getItem(VOICES_CACHE_KEY);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

/** 拉取并缓存音色清单 */
export async function fetchVoices(force = false): Promise<TtsonVoice[]> {
  if (!force && voicesMemoryCache) return voicesMemoryCache;
  const cache = await readCache();
  if (!force && cache && Date.now() - cache.at < CACHE_TTL) {
    voicesMemoryCache = cache.data;
    return cache.data;
  }
  const r = await fetch(`${TTSON_API}/flashsummary/voices?language=zh-CN&tag_id=1`);
  const j = await r.json();
  const voices: TtsonVoice[] = ((j as any).data || []).map((v: any) => ({
    voice_id: v.id ?? v.voice_id,
    voice_name: v.voice_name || "",
    language: v.language || "",
    gender: v.gender || "",
    rawTags: (v.tags || []).map((t: any) => t.tag_name || ""),
    tags: fixTags(
      (v.tags || []).map((t: any) => t.tag_name || ""),
      v.voice_name || ""
    ),
  }));
  await AsyncStorage.setItem(VOICES_CACHE_KEY, JSON.stringify({ at: Date.now(), data: voices }));
  voicesMemoryCache = voices;
  return voices;
}

function norm(s: string): string {
  return (s || "").toLowerCase().replace(/[\s|｜（）()\[\]【】·,，、]/g, "");
}

function bigramSim(a: string, b: string): number {
  if (!a || !b) return 0;
  const g = (s: string) => {
    const out = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
    return out;
  };
  const A = g(a);
  const B = g(b);
  let inter = 0;
  A.forEach((x) => {
    if (B.has(x)) inter++;
  });
  return (2 * inter) / (A.size + B.size || 1);
}

export interface VoiceMatch {
  voice: TtsonVoice;
  score: number;
  matchType: string;
}

/** 情绪关键词（与 ttson 音色变体后缀对应） */
const EMOTION_KEYS = [
  "自然",
  "开心",
  "难过",
  "生气",
  "委屈",
  "温柔",
  "旁白",
  "撒娇",
  "冷漠",
  "兴奋",
  "可爱",
  "严肃",
  "疲惫",
  "困倦",
  "惊讶",
  "害羞",
  "低沉",
  "害怕",
  "紧张",
  "中立",
  "演讲",
];

/** 按角色名收集情绪音色变体：{ 情绪 -> voice_id } */
export function buildVoiceVariants(
  baseName: string,
  voices: TtsonVoice[]
): Record<string, number> {
  const base = norm(baseName);
  const out: Record<string, number> = {};
  for (const v of voices) {
    const n = norm(v.voice_name.split("|")[0]);
    if (!n.startsWith(base)) continue;
    const rest = n.slice(base.length);
    for (const emo of EMOTION_KEYS) {
      if (rest.includes(emo) && out[emo] === undefined) {
        out[emo] = v.voice_id;
      }
    }
  }
  return out;
}

/** 根据 LLM 情绪标签解析实际合成音色 id */
export function resolveVoiceForEmotion(
  roleVoice: { voiceId: number; variants?: Record<string, number> },
  emotion?: string
): number {
  if (!emotion) return roleVoice.voiceId;
  const key = emotion.trim();
  if (roleVoice.variants && roleVoice.variants[key]) {
    return roleVoice.variants[key];
  }
  // 容错：委屈 -> 难过，兴奋/开心 互通
  const alias: Record<string, string> = {
    委屈: "难过",
    伤心: "难过",
    哭泣: "难过",
    兴奋: "开心",
    高兴: "开心",
  };
  const a = alias[key];
  if (a && roleVoice.variants && roleVoice.variants[a]) {
    return roleVoice.variants[a];
  }
  return roleVoice.voiceId;
}

/** 按角色名匹配音色 */
export function matchVoice(name: string, voices: TtsonVoice[], topK = 6): VoiceMatch[] {
  const n = norm(name);
  if (!n) return [];
  const scored: VoiceMatch[] = [];
  for (const v of voices) {
    const vn = norm(v.voice_name);
    let s = 0;
    let m = "";
    if (vn === n) {
      s = 100;
      m = "exact";
    } else if (vn.includes(n)) {
      s = 80;
      m = "contains";
    } else {
      const first = norm(v.voice_name.split("|")[0]);
      if (first.includes(n)) {
        s = 75;
        m = "first";
      } else {
        const ratio = bigramSim(n, first);
        if (ratio > 0.5) {
          s = Math.round(ratio * 70);
          m = "fuzzy";
        }
      }
    }
    if (s > 0) scored.push({ voice: v, score: s, matchType: m });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/** 合成语音，返回可播放的音频 URL */
export async function synthTTS(voiceId: number, text: string): Promise<string> {
  const token = await getToken();
  if (!token) throw new Error("未配置 TTS 密钥");
  const r = await fetch(`${TTSON_API}/flashsummary/tts?token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      voice_id: voiceId,
      text,
      to_lang: "ZH",
      format: "wav",
      speed_factor: 1,
      pitch_factor: 0,
      volume_change_dB: 0,
      emotion: 1,
    }),
  });
  const j = await r.json();
  if (j.code !== 200 || !j.voice_path) {
    throw new Error(j.detail || "合成失败");
  }
  return `${j.url}:${j.port}/flashsummary/retrieveFileData?voice_audio_path=${j.voice_path}&stream=true&token=${token}`;
}
