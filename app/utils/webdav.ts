export interface WebDavConfig {
  host: string;
  user: string;
  pass: string;
}

export interface WebDavItem {
  href: string;
  name: string;
  collection: boolean;
  size?: number;
}

export const WEBDAV_PRESETS: {
  id: string;
  label: string;
  host: string;
  hint?: string;
}[] = [
  { id: "custom", label: "自定义", host: "" },
  { id: "jianguoyun", label: "坚果云", host: "https://dav.jianguoyun.com/dav" },
  {
    id: "fnos",
    label: "飞牛",
    host: "",
    hint: "只需填写 FN Connect ID，地址会自动生成：https://dav.<ID>.fnos.net:443",
  },
  {
    id: "cstcloud",
    label: "数据胶囊",
    host: "https://data.cstcloud.cn/dav",
    hint: "需先在 data.cstcloud.cn 完成实名制，并在「客户端访问」内添加 WebDAV 账号后才能使用",
  },
  {
    id: "123pan",
    label: "123云盘",
    host: "https://webdav.123pan.cn/webdav",
    hint: "在官网「工具中心 → 第三方挂载」添加应用后生成密码",
  },
];

export function resolveHost(presetId: string, host: string, fnosId: string): string {
  if (presetId === "fnos") {
    const id = fnosId.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    return id ? `https://dav.${id}.fnos.net:443` : "";
  }
  return host.trim().replace(/\/+$/, "");
}

const B64_TABLE =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Hermes 没有 btoa，手写 UTF-8 安全的 Base64 */
function toBase64(str: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) {
      bytes.push(c);
    } else if (c < 0x800) {
      bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const lo = str.charCodeAt(i + 1);
      const cp = 0x10000 + ((c - 0xd800) << 10) + (lo - 0xdc00);
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 63),
        0x80 | ((cp >> 6) & 63),
        0x80 | (cp & 63)
      );
      i++;
    } else {
      bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
  }
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64_TABLE[b0 >> 2];
    out += B64_TABLE[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64_TABLE[((b1 & 15) << 2) | (b2 >> 6)] : "=";
    out += i + 2 < bytes.length ? B64_TABLE[b2 & 63] : "=";
  }
  return out;
}

function auth(c: WebDavConfig): string {
  return "Basic " + toBase64(`${c.user}:${c.pass}`);
}

function joinPath(base: string, path: string): string {
  const b = base.replace(/\/+$/, "");
  const p = path.replace(/^\/+/, "");
  return b + "/" + p;
}

function buildUrl(host: string, path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  if (path.startsWith("/")) {
    const m = host.match(/^(https?:\/\/[^/]+)/);
    return m ? m[1] + path : joinPath(host, path);
  }
  return joinPath(host, path);
}

export async function webdavTest(c: WebDavConfig): Promise<boolean> {
  if (!c.host) throw new Error("请填写主机地址");
  const res = await fetch(c.host, {
    method: "PROPFIND",
    headers: { Authorization: auth(c), Depth: "0" },
  });
  if (res.status === 401 || res.status === 403) throw new Error("账号或密码错误");
  if (res.status >= 400) throw new Error("连接失败（HTTP " + res.status + "）");
  return true;
}

export async function webdavList(
  c: WebDavConfig,
  path: string
): Promise<WebDavItem[]> {
  const url = buildUrl(c.host, path);
  const res = await fetch(url, {
    method: "PROPFIND",
    headers: { Authorization: auth(c), Depth: "1" },
    body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getcontentlength/><d:getlastmodified/></d:prop></d:propfind>',
  });
  if (res.status === 401 || res.status === 403) throw new Error("账号或密码错误");
  if (res.status === 404) return [];
  if (res.status >= 400) throw new Error("列目录失败（HTTP " + res.status + "）");
  const xml = await res.text();
  const items: WebDavItem[] = [];
  const responseRe = /<d:response>([\s\S]*?)<\/d:response>/g;
  let m: RegExpExecArray | null;
  while ((m = responseRe.exec(xml)) != null) {
    const block = m[1];
    const hrefM = block.match(/<d:href>([\s\S]*?)<\/d:href>/);
    if (!hrefM) continue;
    const href = hrefM[1].trim();
    const name = decodeURIComponent(href.split("/").filter(Boolean).pop() || href);
    const isCol = /<d:collection\s*\/>/.test(block);
    const sizeM = block.match(/<d:getcontentlength>(\d+)<\/d:getcontentlength>/);
    items.push({
      href,
      name,
      collection: isCol,
      size: sizeM ? parseInt(sizeM[1], 10) : undefined,
    });
  }
  return items.filter((it) => it.name !== "");
}

export async function webdavMkcol(c: WebDavConfig, path: string): Promise<void> {
  const url = buildUrl(c.host, path);
  const res = await fetch(url, {
    method: "MKCOL",
    headers: { Authorization: auth(c) },
  });
  if (res.status !== 201 && res.status !== 405 && res.status !== 200) {
    throw new Error("创建目录失败（HTTP " + res.status + "）");
  }
}

export async function webdavPut(
  c: WebDavConfig,
  path: string,
  content: string
): Promise<void> {
  const url = buildUrl(c.host, path);
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: auth(c),
      "Content-Type": "application/json",
    },
    body: content,
  });
  if (res.status >= 400) throw new Error("上传失败（HTTP " + res.status + "）");
}

export async function webdavGet(
  c: WebDavConfig,
  path: string
): Promise<string> {
  const url = buildUrl(c.host, path);
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: auth(c) },
  });
  if (res.status >= 400) throw new Error("下载失败（HTTP " + res.status + "）");
  return res.text();
}
