import Constants from "expo-constants";
import { Dimensions, NativeModules, Platform } from "react-native";
import { brand, modelName } from "expo-device";
import * as FileSystem from "expo-file-system/legacy";
import JSZip from "jszip";
import AsyncStorage from "../utils/storage";
import { readLogs } from "../utils/logCollector";
import { readConversationsRaw, readMessages } from "./localChat";
import { exportAppDbSnapshot } from "./appDb";
import { exportMemoryDbSnapshot } from "./memoryDb";
import { exportKbDbSnapshot } from "./kbDb";
import { isAllFilesAccessGranted } from "../utils/keepAlive";
import { binaryToBase64, encryptReson } from "./exportCrypto";
import { logEvent } from "../utils/logCollector";

// 原生写入模块（绕过 expo-file-system 对不存在路径的 canWrite 误判）
const ExportNative = NativeModules.ResonExportModule as
  | {
      writePublicExportFile?: (
        fileName: string,
        base64: string
      ) => Promise<string>;
    }
  | undefined;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function nowText(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function deviceText(): string {
  const d = Dimensions.get("window");
  return `${brand || ""} ${modelName || ""} | Android ${
    Platform.Version
  } | 分辨率 ${d.width}x${d.height}`;
}

export function exportFileName(): string {
  const d = new Date();
  return `RESON_Export_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(
    d.getDate()
  )}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.reson`;
}

/** 全量导出分区（每个区块独立成文件，方便按需读取） */
async function buildExportParts(): Promise<Record<string, string>> {
  // 头部
  const meta = [
    "================================================",
    "RE:SON 全量日志导出",
    `时间：${nowText()}`,
    `版本：${Constants.expoConfig?.version || "?"}`,
    `设备：${deviceText()}`,
    "================================================",
  ].join("\n");

  // 运行日志
  const log = await readLogs();

  // 全量 AsyncStorage 状态
  let state = "";
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) =>
      k.startsWith("wc_")
    );
    const lines: string[] = [];
    for (const k of keys.sort()) {
      const raw = await AsyncStorage.getItem(k);
      lines.push(`--- ${k} ---`);
      lines.push(raw ?? "(null)");
    }
    state = lines.join("\n");
  } catch (e: any) {
    state = "读取失败：" + (e?.message || e);
  }

  // SQLite 快照
  let dbApp = "";
  let dbMemory = "";
  let dbKb = "";
  try {
    dbApp = await exportAppDbSnapshot();
  } catch (e: any) {
    dbApp = "appDb 导出失败：" + (e?.message || e);
  }
  try {
    dbMemory = await exportMemoryDbSnapshot();
  } catch (e: any) {
    dbMemory = "memoryDb 导出失败：" + (e?.message || e);
  }
  try {
    dbKb = await exportKbDbSnapshot();
  } catch (e: any) {
    dbKb = "kbDb 导出失败：" + (e?.message || e);
  }

  // 人类可读聊天记录 + AI 思考流水
  let chat = "";
  try {
    const convos = await readConversationsRaw();
    const lines: string[] = [];
    for (const c of convos) {
      lines.push("");
      lines.push(`== 会话：${c.title || c.id} (${c.id}) ==`);
      const msgs = await readMessages(c.id);
      for (const m of msgs) {
        const who =
          m.role === "user" ? "用户" : m.senderName || c.roleName || "角色";
        const time = new Date(m.createdAt).toLocaleString("zh-CN", {
          hour12: false,
        });
        const tag = m.audio ? "[语音] " : "";
        if (m.thinking) {
          lines.push(`[${time}] ${who} · 思考：`);
          lines.push(m.thinking.slice(0, 4000));
        }
        lines.push(`[${time}] ${who}：${tag}${m.content}`);
        if (m.replyTo) {
          lines.push(`    (引用：${m.replyTo.content.slice(0, 100)})`);
        }
      }
    }
    chat = lines.join("\n");
  } catch (e: any) {
    chat = "聊天记录导出失败：" + (e?.message || e);
  }

  return { meta, log, state, dbApp, dbMemory, dbKb, chat };
}

/** 组装全量导出 zip（分区文件，DEFLATE 压缩），返回 base64 */
export async function buildExportZip(): Promise<string> {
  const parts = await buildExportParts();
  const zip = new JSZip();
  zip.file("meta.txt", parts.meta);
  zip.file("log.txt", parts.log);
  zip.file("state.json", parts.state);
  zip.file("db_app.json", parts.dbApp);
  zip.file("db_memory.json", parts.dbMemory);
  zip.file("db_kb.json", parts.dbKb);
  zip.file("chat.txt", parts.chat);
  return await zip.generateAsync({
    type: "base64",
    compression: "DEFLATE",
  });
}

/** 保存导出文件：zip(base64) 加密为 .reson，优先写公共目录，失败/未授权退回 App 私有目录 */
export async function saveExportToDownload(zipBase64: string): Promise<string> {
  const bin = encryptReson(zipBase64);
  const granted = await isAllFilesAccessGranted().catch(() => false);
  logEvent("EXPORT", `allFilesAccessGranted=${granted}`);
  const fileName = exportFileName();
  if (granted) {
    if (ExportNative?.writePublicExportFile) {
      try {
        const abs = await ExportNative.writePublicExportFile(
          fileName,
          binaryToBase64(bin)
        );
        logEvent("EXPORT", `wrote public: ${abs}`);
        return abs;
      } catch (e: any) {
        logEvent("EXPORT", `public write failed: ${e?.message || e}`);
      }
    }
  }
  const docUri = `${FileSystem.documentDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(docUri, binaryToBase64(bin), {
    encoding: FileSystem.EncodingType.Base64,
  });
  return docUri;
}
