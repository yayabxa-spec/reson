import { InferenceSession, Tensor } from "onnxruntime-react-native";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import { NativeModules } from "react-native";

// 本地语义向量：BGE-small-zh-v1.5 (fp32) via ONNX Runtime
// 模型资源在打包时用 XZ 极限压缩（约 43MB），首次使用时由原生模块解压到缓存。

const DIM = 512;
const MAX_LEN = 512;
const CLS = 101;
const SEP = 102;
const UNK = 100;

// ---------- 模型 / 词表 / 会话缓存 ----------
let session: InferenceSession | null = null;
let sessionLoading: Promise<InferenceSession> | null = null;
let vocab: Map<string, number> | null = null;
let vocabLoading: Promise<Map<string, number>> | null = null;

const XZ_MODEL = require("../../assets/models/bge_fp32.onnx.xz");
const VOCAB_ASSET = require("../../assets/models/vocab.txt");

function stripFileUri(uri: string): string {
  return uri.replace(/^file:\/\//, "");
}

/** 调用原生 DecompressModule 解压 .xz 到目标路径 */
async function decompressXz(srcUri: string, destUri: string): Promise<string> {
  const mod = NativeModules.DecompressModule;
  if (!mod || typeof mod.decompressXz !== "function") {
    throw new Error("DecompressModule 不可用");
  }
  const src = stripFileUri(srcUri);
  const dest = stripFileUri(destUri);
  return mod.decompressXz(src, dest);
}

async function loadVocab(): Promise<Map<string, number>> {
  if (vocab) return vocab;
  if (vocabLoading) return vocabLoading;
  vocabLoading = (async () => {
    const asset = Asset.fromModule(VOCAB_ASSET);
    await asset.downloadAsync();
    const uri = asset.localUri || asset.uri;
    const text = await FileSystem.readAsStringAsync(uri, { encoding: "utf8" });
    const map = new Map<string, number>();
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i];
      if (t) map.set(t, i);
    }
    vocab = map;
    return map;
  })();
  return vocabLoading;
}

async function loadSession(): Promise<InferenceSession> {
  if (session) return session;
  if (sessionLoading) return sessionLoading;
  sessionLoading = (async () => {
    const asset = Asset.fromModule(XZ_MODEL);
    await asset.downloadAsync();
    const xzUri = asset.localUri || asset.uri;
    const onnxPath = FileSystem.cacheDirectory + "bge_fp32.onnx";
    const resolved = await decompressXz(xzUri, onnxPath);
    const s = await InferenceSession.create(resolved);
    session = s;
    return s;
  })();
  return sessionLoading;
}

// ---------- BERT WordPiece 分词 ----------
function isChineseChar(cp: number): boolean {
  return (
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x20000 && cp <= 0x2a6df) ||
    (cp >= 0x2a700 && cp <= 0x2b73f) ||
    (cp >= 0x2b740 && cp <= 0x2b81f) ||
    (cp >= 0x2b820 && cp <= 0x2ceaf) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0x2f800 && cp <= 0x2fa1f)
  );
}

function isPunctuation(ch: string): boolean {
  const cp = ch.codePointAt(0) || 0;
  if (
    (cp >= 33 && cp <= 47) ||
    (cp >= 58 && cp <= 64) ||
    (cp >= 91 && cp <= 96) ||
    (cp >= 123 && cp <= 126)
  ) {
    return true;
  }
  // 常见中文 / 全角标点
  return /[\u3000-\u303f\uff00-\uffef\u2018\u2019\u201c\u201d\u2026\u2014\u2015\u00b7\u00d7]/.test(ch);
}

function isControl(ch: string): boolean {
  return /[\x00-\x1f\x7f]/.test(ch);
}

function basicTokenize(text: string): string[] {
  let cleaned = "";
  for (const ch of text) {
    if (isControl(ch)) continue;
    cleaned += ch;
  }
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  let spaced = "";
  for (const ch of cleaned) {
    if (isChineseChar(ch.codePointAt(0) || 0)) {
      spaced += " " + ch + " ";
    } else {
      spaced += ch;
    }
  }

  const rawTokens = spaced.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (const tok of rawTokens) {
    let buf = "";
    for (const ch of tok) {
      if (isPunctuation(ch)) {
        if (buf) {
          out.push(buf);
          buf = "";
        }
        out.push(ch);
      } else {
        buf += ch;
      }
    }
    if (buf) out.push(buf);
  }
  return out;
}

function wordPiece(token: string, vocabMap: Map<string, number>): string[] {
  if (token.length > 100) return ["[UNK]"];
  const sub: string[] = [];
  let bad = false;
  let start = 0;
  while (start < token.length) {
    let end = token.length;
    let cur = "";
    while (start < end) {
      let cand = token.slice(start, end);
      if (start > 0) cand = "##" + cand;
      if (vocabMap.has(cand)) {
        cur = cand;
        break;
      }
      end -= 1;
    }
    if (!cur) {
      bad = true;
      break;
    }
    sub.push(cur);
    start = end;
  }
  return bad ? ["[UNK]"] : sub;
}

function tokenize(text: string, vocabMap: Map<string, number>): number[] {
  const ids: number[] = [CLS];
  const basic = basicTokenize(text);
  for (const tok of basic) {
    for (const sub of wordPiece(tok, vocabMap)) {
      if (ids.length >= MAX_LEN - 1) break;
      ids.push(vocabMap.get(sub) ?? UNK);
    }
    if (ids.length >= MAX_LEN - 1) break;
  }
  ids.push(SEP);
  return ids;
}

// ---------- 推理 ----------
async function runEmbedding(texts: string[]): Promise<number[][]> {
  const vocabMap = await loadVocab();
  const s = await loadSession();

  const tokenized = texts.map((t) => tokenize(t, vocabMap));
  const maxLen = Math.max(1, ...tokenized.map((t) => t.length));
  const batch = texts.length;

  const ids = new BigInt64Array(batch * maxLen);
  const mask = new BigInt64Array(batch * maxLen);
  const ttids = new BigInt64Array(batch * maxLen);

  for (let i = 0; i < batch; i++) {
    const toks = tokenized[i];
    for (let j = 0; j < toks.length; j++) {
      const idx = i * maxLen + j;
      ids[idx] = BigInt(toks[j]);
      mask[idx] = BigInt(1);
    }
  }

  const feeds = {
    input_ids: new Tensor("int64", ids, [batch, maxLen]),
    attention_mask: new Tensor("int64", mask, [batch, maxLen]),
    token_type_ids: new Tensor("int64", ttids, [batch, maxLen]),
  };
  const outputs = await s.run(feeds);
  const lh = outputs.last_hidden_state;
  if (!lh) throw new Error("模型输出缺少 last_hidden_state");

  const data = lh.data as Float32Array;
  const result: number[][] = [];
  for (let i = 0; i < batch; i++) {
    const base = i * maxLen * DIM;
    const vec = new Array<number>(DIM);
    let norm = 0;
    for (let d = 0; d < DIM; d++) {
      const v = data[base + d] || 0;
      vec[d] = v;
      norm += v * v;
    }
    norm = Math.sqrt(norm) || 1;
    for (let d = 0; d < DIM; d++) vec[d] = vec[d] / norm;
    result.push(vec);
  }
  return result;
}

// ---------- 字符 n-gram 兜底（模型不可用时） ----------
const NDIM = 1024;
const ngramCache = new Map<string, number[]>();

function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function embedNgram(text: string): number[] {
  const t = String(text || "").toLowerCase().replace(/\s+/g, "");
  if (!t) return new Array(NDIM).fill(0);
  const hit = ngramCache.get(t);
  if (hit) return hit;
  const vec = new Array(NDIM).fill(0);
  const bump = (k: number, w: number) => {
    vec[k % NDIM] += w;
  };
  for (let i = 0; i < t.length; i++) bump(hashStr(t[i]), 1);
  for (let i = 0; i < t.length - 1; i++) bump(hashStr(t.slice(i, i + 2)), 2);
  for (let i = 0; i < t.length - 2; i++) bump(hashStr(t.slice(i, i + 3)), 3);
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < NDIM; i++) vec[i] = vec[i] / norm;
  if (ngramCache.size > 3000) ngramCache.clear();
  ngramCache.set(t, vec);
  return vec;
}

/** 计算本地向量（优先 BGE 语义向量，失败回退字符 n-gram） */
export async function embedLocal(text: string): Promise<number[]> {
  return (await embedLocalBatch([text]))[0];
}

export async function embedLocalBatch(texts: string[]): Promise<number[][]> {
  try {
    return await runEmbedding(texts);
  } catch {
    return texts.map((t) => embedNgram(t));
  }
}

/** 预热模型（可选，避免首次检索卡顿） */
export async function warmupLocalEmbed(): Promise<void> {
  try {
    await loadSession();
  } catch {
    // 忽略预热失败
  }
}