import AsyncStorage from "../utils/storage";
import * as FileSystem from "expo-file-system/legacy";
import CryptoJS from "crypto-js";
import eventBus from "../utils/eventBus";
import {
  exportMemoryDbSnapshot,
  importMemoryDbSnapshot,
} from "./memoryDb";
import { exportKbDbSnapshot, importKbDbSnapshot } from "./kbDb";
import { exportAppDbSnapshot, importAppDbSnapshot } from "./appDb";

export interface BackupPayload {
  app: "wc";
  kind: "wc-backup";
  version: number;
  createdAt: number;
  data: Record<string, string>;
}

export interface BackupOptions {
  includeKeys: boolean;
  password: string;
}

export interface RestoreOptions {
  mergeChats: boolean;
  password: string;
}

const ENC_PREFIX = "__ENC__";

// 包含 API Key 的存储键：备份 KEY 时用 AES 加密，不备份时清空
function keyPaths(): { key: string; extract: (v: any) => string[]; apply: (v: any, vals: string[]) => void }[] {
  return [
    {
      // 当前模型管理实际使用的供应商存储（含用户 API Key）
      key: "wc_local_providers_v1",
      extract: (v) => (Array.isArray(v) ? v.map((p: any) => p?.apiKey || "") : []),
      apply: (v, vals) => {
        if (Array.isArray(v)) {
          v.forEach((p: any, i: number) => {
            if (vals[i] != null) p.apiKey = vals[i];
          });
        }
      },
    },
    {
      key: "wc_local_ai_configs_v3",
      extract: (v) => (Array.isArray(v) ? v.map((c: any) => c?.apiKey || "") : []),
      apply: (v, vals) => {
        if (Array.isArray(v)) {
          v.forEach((c: any, i: number) => {
            if (vals[i] != null) c.apiKey = vals[i];
          });
        }
      },
    },
    {
      key: "wc_local_rag_settings_v1",
      extract: (v) => [v?.embedding?.apiKey || "", v?.rerank?.apiKey || "", v?.webSearchKey || ""],
      apply: (v, vals) => {
        if (!v) return;
        if (v.embedding) v.embedding.apiKey = vals[0] || "";
        if (v.rerank) v.rerank.apiKey = vals[1] || "";
        v.webSearchKey = vals[2] || "";
      },
    },
  ];
}

/** 备份内容里是否包含加密的 KEY（用于还原时提示输入密码） */
export function hasEncryptedKeys(payloadText: string): boolean {
  try {
    const payload = JSON.parse(payloadText);
    const data = payload?.data || {};
    for (const kp of keyPaths()) {
      const raw = data[kp.key];
      if (!raw) continue;
      const obj = JSON.parse(raw);
      const vals = kp.extract(obj);
      if (vals.some((v) => v && v.startsWith(ENC_PREFIX))) return true;
    }
  } catch {}
  return false;
}

function encryptText(text: string, password: string): string {
  return ENC_PREFIX + CryptoJS.AES.encrypt(text, password).toString();
}

function decryptText(text: string, password: string): string {
  if (!text.startsWith(ENC_PREFIX)) return text;
  const bytes = CryptoJS.AES.decrypt(text.slice(ENC_PREFIX.length), password);
  const plain = bytes.toString(CryptoJS.enc.Utf8);
  if (!plain) throw new Error("密码错误，无法解密备份中的 KEY");
  return plain;
}

/** 收集全部本地数据为备份负载 */
export async function collectBackupPayload(
  opts: BackupOptions
): Promise<BackupPayload> {
  // 未设置密码不得备份密钥，避免密钥明文进入备份文件
  if (opts.includeKeys && !opts.password) {
    throw new Error("备份 KEY 需先设置备份密码");
  }
  const keys = (await AsyncStorage.getAllKeys()).filter((k) =>
    k.startsWith("wc_")
  );
  const data: Record<string, string> = {};
  for (const key of keys) {
    const raw = await AsyncStorage.getItem(key);
    if (raw != null) data[key] = raw;
  }

  for (const kp of keyPaths()) {
    const raw = data[kp.key];
    if (!raw) continue;
    try {
      const obj = JSON.parse(raw);
      const vals = kp.extract(obj);
      const handled = opts.includeKeys
        ? vals.map((v) =>
            v && opts.password ? encryptText(v, opts.password) : v
          )
        : vals.map(() => "");
      kp.apply(obj, handled);
      data[kp.key] = JSON.stringify(obj);
    } catch {}
  }

  // 附加 SQLite 数据（记忆库 + 知识库），与 AsyncStorage 一起打包
  try {
    data["wc_sqlite_memories"] = await exportMemoryDbSnapshot();
  } catch {}
  try {
    data["wc_sqlite_kb"] = await exportKbDbSnapshot();
  } catch {}
  // 聊天消息 + 角色卡（主数据 SQLite 库）
  try {
    data["wc_sqlite_app"] = await exportAppDbSnapshot();
  } catch {}

  return {
    app: "wc",
    kind: "wc-backup",
    version: 4,
    createdAt: Date.now(),
    data,
  };
}

export function backupFileName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `RESON备份_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(
    d.getDate()
  )}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.json`;
}

/** 本地备份：写入 SAF 目录 */
export async function saveLocalBackup(
  dirUri: string,
  payload: BackupPayload
): Promise<string> {
  const name = backupFileName();
  const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
    dirUri,
    name,
    "application/json"
  );
  await FileSystem.StorageAccessFramework.writeAsStringAsync(
    fileUri,
    JSON.stringify(payload)
  );
  return fileUri;
}

/** 解析并还原备份 JSON */
export async function restoreFromPayload(
  text: string,
  opts: RestoreOptions
): Promise<void> {
  let payload: BackupPayload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("备份文件格式错误");
  }
  if (payload.kind !== "wc-backup") {
    throw new Error("不是本应用的备份文件");
  }

  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload.data || {})) {
    data[k] = v;
  }

  // SQLite 快照单独恢复，不写入 AsyncStorage
  const memSnapshot = data["wc_sqlite_memories"];
  const kbSnapshot = data["wc_sqlite_kb"];
  const appSnapshot = data["wc_sqlite_app"];
  delete data["wc_sqlite_memories"];
  delete data["wc_sqlite_kb"];
  delete data["wc_sqlite_app"];

  // 解密 KEY（如备份时加密过）
  if (opts.password) {
    for (const kp of keyPaths()) {
      const raw = data[kp.key];
      if (!raw) continue;
      try {
        const obj = JSON.parse(raw);
        const vals = kp.extract(obj);
        kp.apply(
          obj,
          vals.map((v) => (v ? decryptText(v, opts.password) : v))
        );
        data[kp.key] = JSON.stringify(obj);
      } catch (e: any) {
        if (e?.message) throw e;
      }
    }
  } else {
    for (const kp of keyPaths()) {
      const raw = data[kp.key];
      if (!raw) continue;
      try {
        const obj = JSON.parse(raw);
        const vals = kp.extract(obj);
        // 未输入密码：跳过密钥（清空），仅恢复无加密的部分
        kp.apply(
          obj,
          vals.map(() => "")
        );
        data[kp.key] = JSON.stringify(obj);
      } catch (e: any) {
        if (e?.message) throw e;
      }
    }
  }

  if (opts.mergeChats) {
    await mergeChatData(data);
  } else {
    await AsyncStorage.multiSet(Object.entries(data));
  }

  // 记忆库 / 知识库：跟随“合并”开关（合并 = 按 id 合并；覆盖 = 先清空再写入）
  if (memSnapshot) {
    await importMemoryDbSnapshot(memSnapshot, opts.mergeChats);
  }
  if (kbSnapshot) {
    await importKbDbSnapshot(kbSnapshot, opts.mergeChats);
  }
  // 聊天消息 + 角色卡
  if (appSnapshot) {
    await importAppDbSnapshot(appSnapshot, opts.mergeChats);
  }
}

/** 合并聊天记录（会话按 id 去重；消息/角色由 importAppDbSnapshot 按主键合并） */
async function mergeChatData(data: Record<string, string>) {
  const convKey = "wc_local_conversations";
  const existing = await AsyncStorage.multiGet([convKey]);
  const existConvos: any[] = existing[0][1] ? JSON.parse(existing[0][1]) : [];

  try {
    const backupConvos: any[] = JSON.parse(data[convKey] || "[]");
    const mergedConvos = [...existConvos];
    for (const c of backupConvos) {
      if (!mergedConvos.some((x) => x.id === c.id)) mergedConvos.push(c);
    }
    data[convKey] = JSON.stringify(mergedConvos);
  } catch {}

  await AsyncStorage.multiSet(Object.entries(data));
}

/** 还原后通知各模块刷新（列表/未读等） */
export async function refreshAfterRestore() {
  eventBus.emit("local-chat-updated", "restore");
  eventBus.emit("unread-updated");
}
