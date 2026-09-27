import { File, Paths } from "expo-file-system";

// ============================================================
// 全局日志采集器：hook console + 业务事件 → 追加写入
// document/reson_log.txt，单文件 5MB 上限，写满保留最新 5MB（循环覆盖）。
// 不按时间清理、不限制条数；导出时读取该文件。
// ============================================================

const LOG_NAME = "reson_log.txt";
const MAX_BYTES = 5 * 1024 * 1024;

let inited = false;
let pending: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function safe(v: unknown): string {
  try {
    return typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function fmt(level: string, args: unknown[]): string {
  const ts = new Date().toLocaleString("zh-CN", { hour12: false });
  const body = args.map((a) => (typeof a === "string" ? a : safe(a))).join(" ");
  return `[${ts}] [${level}] ${body}\n`;
}

function getLogFile(): File {
  return new File(Paths.document, LOG_NAME);
}

async function flush(): Promise<void> {
  if (!pending.length) return;
  const chunk = pending.join("");
  pending = [];
  try {
    const f = getLogFile();
    if (!f.exists) f.create({ overwrite: true, intermediates: true });
    f.write(chunk, { append: true });
    if (f.size > MAX_BYTES) {
      const all = await f.text();
      f.write(all.slice(all.length - MAX_BYTES));
    }
  } catch {}
}

function push(level: string, args: unknown[]): void {
  pending.push(fmt(level, args));
  if (pending.length >= 25) {
    flush().catch(() => {});
  } else if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush().catch(() => {});
    }, 1000);
  }
}

/** 业务事件（结构化日志，与 console 同一条流水） */
export function logEvent(tag: string, msg: string): void {
  push("EVT", [`${tag} ${msg}`]);
}

/** 读取全部日志（用于导出） */
export async function readLogs(): Promise<string> {
  try {
    await flush();
    const f = getLogFile();
    if (!f.exists) return "";
    return await f.text();
  } catch {
    return "";
  }
}

/** App 启动时调用一次：hook console + 全局未捕获错误 */
export function initLogCollector(): void {
  if (inited) return;
  inited = true;
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;
  const origInfo = console.info;
  console.log = (...a) => {
    origLog(...a);
    push("LOG", a);
  };
  console.info = (...a) => {
    origInfo(...a);
    push("INF", a);
  };
  console.warn = (...a) => {
    origWarn(...a);
    push("WRN", a);
  };
  console.error = (...a) => {
    origError(...a);
    push("ERR", a);
  };
  const onUnhandled = (e: any) => {
    const reason = e?.reason ?? e?.error ?? e;
    push("FATAL", [
      reason?.message || String(reason),
      reason?.stack || "",
    ]);
  };
  (globalThis as any).addEventListener?.("unhandledrejection", onUnhandled);
  (globalThis as any).addEventListener?.("error", onUnhandled);
}
