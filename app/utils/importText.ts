import * as FileSystem from "expo-file-system/legacy";
import JSZip from "jszip";

const TEXT_EXTS = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "html",
  "htm",
  "xml",
  "csv",
  "yml",
  "yaml",
  "log",
  "ini",
  "cfg",
  "conf",
  "rtf",
  "text",
  "js",
  "ts",
  "jsx",
  "tsx",
]);

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#10;/g, "\n");
}

/** 从 docx 的 document.xml 提取纯文本（段落之间换行） */
export function extractDocxText(xml: string): string {
  const blocks = xml.split(/<\/w:p>/);
  return blocks
    .map((block) => {
      const parts: string[] = [];
      const re = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(block))) {
        parts.push(decodeXmlEntities(m[1]));
      }
      return parts.join("");
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 读取导入文件内容：
 * docx 解压提取文本，其余常见文本格式按 UTF-8 读取。
 * 支持 txt / md / json / html / xml / csv / yml / log / rtf 等。
 */
export async function readImportFile(
  uri: string,
  fileName: string
): Promise<string> {
  const ext = (fileName.split(".").pop() || "").toLowerCase();
  if (ext === "docx") {
    const b64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const zip = await JSZip.loadAsync(b64, { base64: true });
    const doc = zip.file("word/document.xml");
    if (!doc) throw new Error("无效的 Word 文档");
    const xml = await doc.async("string");
    return extractDocxText(xml);
  }
  if (!TEXT_EXTS.has(ext)) {
    // 未知扩展名仍尝试按文本读取；二进制文件会在这里失败
  }
  return FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
}
