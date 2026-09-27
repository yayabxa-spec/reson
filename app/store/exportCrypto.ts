import * as forge from "node-forge";
import CryptoJS from "crypto-js";
import * as ExpoCrypto from "expo-crypto";

// Hermes 没有原生 crypto，两个库都要接入 expo-crypto 的真实熵源：
// 1) crypto-js 的 WordArray.random 在模块加载时就把 global.crypto 捕获进闭包
//    （core.js 里 cryptoSecureRandomInt），之后再补 globalThis.crypto 它看不到，
//    仍会抛 "Native crypto module could not be used to get secure random number."。
//    所以直接替换 WordArray.random 本身，绕过闭包捕获。
// 2) node-forge 的 RSA-OAEP 填充需要随机数，seedFileSync 是在调用时才读取的，
//    直接注入即可。
(CryptoJS.lib.WordArray as any).random = function (nBytes: number) {
  const words: number[] = [];
  for (let i = 0; i < nBytes; i += 4) {
    const b = ExpoCrypto.getRandomValues(new Uint8Array(4));
    words.push(((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) | 0);
  }
  return CryptoJS.lib.WordArray.create(words, nBytes);
};
// 同时给 forge 的随机数生成器接入同一熵源
try {
  (forge as any).random.seedFileSync = (needed: number) => {
    const bytes = ExpoCrypto.getRandomValues(new Uint8Array(needed));
    return String.fromCharCode.apply(null, Array.from(bytes));
  };
} catch {}

// ============================================================
// 导出文件加密（.reson 专用格式）
// 混合加密：AES-256-CBC 加密大 payload + RSA-2048-OAEP(SHA-256)
// 加密会话密钥。App 只内置公钥，私钥在开发者电脑上（见
// kai/work/reson-keys/，PC 端 decrypt-reson.js 解密）。
//
// 文件布局（二进制）：
//   magic "RESONEXP1" (8B) | version(1B)=1 | encKeyLen(2B BE)=256
//   | RSA-OAEP(会话密钥 256B) | IV(16B) | HMAC-SHA256(32B)
//   | AES-256-CBC 密文（PKCS7，明文为 zip 二进制）
// HMAC key = 会话密钥，data = IV || 密文。
// ============================================================

const MAGIC = "RESONEXP1";
const VERSION = 1;

// 公钥由 openssl 生成（reson_public.pem），仅用于加密；私钥不进入 App
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvxRsMLI76oiaLh42iP+w
pNogxRFkLSVx21dRfEoEBYSHcbSwGI47cd94oPaZ2DYyFcDNPDrZzOo4edhhginW
G/0n2I9e/NzYghx/jXLfDZTWYYLjRDOrcGkRbv6vdzXn7Vysva+wVZjeEn0yUTNz
ncWeoKmTMBR5NcVvepWXaI3DwrZaW6W8My47cbDYN0S+0RVws6V7g5DKWuVfqFUD
hiKLGPo+MKVyUN6bau3bNlzfbywZF5ZRgYh3YZvLESehEGqGvg35T9FZMlcWzObg
aeUUOjL0UHc9a6m+JFuqZ7JdD5yRtRhT0jrZ83iqxmrNiXEkuAdjyDcRyQFY6Ohe
vwIDAQAB
-----END PUBLIC KEY-----`;

function hexToLatin1(hex: string): string {
  let out = "";
  for (let i = 0; i < hex.length; i += 2) {
    out += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
  }
  return out;
}

/** 把导出 zip（base64）加密为 .reson 二进制（返回 latin1 二进制字符串） */
export function encryptReson(base64Zip: string): string {
  // 1) 随机会话密钥 + IV
  const aesKey = CryptoJS.lib.WordArray.random(32);
  const iv = CryptoJS.lib.WordArray.random(16);

  // 2) AES-256-CBC 加密 zip 字节（base64 → WordArray，保持二进制不变）
  const payload = CryptoJS.enc.Base64.parse(base64Zip);
  const encrypted = CryptoJS.AES.encrypt(payload, aesKey, { iv });
  const cipherHex = encrypted.ciphertext.toString(CryptoJS.enc.Hex);

  // 3) HMAC-SHA256(key=会话密钥, data=IV||密文)
  const hmacHex = CryptoJS.HmacSHA256(
    CryptoJS.enc.Hex.parse(
      iv.toString(CryptoJS.enc.Hex) + cipherHex
    ),
    aesKey
  ).toString(CryptoJS.enc.Hex);

  // 4) RSA-OAEP-SHA256 加密会话密钥（node-forge）
  const pub = forge.pki.publicKeyFromPem(PUBLIC_KEY_PEM);
  const encKey = pub.encrypt(
    hexToLatin1(aesKey.toString(CryptoJS.enc.Hex)),
    "RSA-OAEP",
    { md: forge.md.sha256.create() }
  );
  if (encKey.length !== 256) {
    throw new Error("RSA 加密结果长度异常");
  }

  // 5) 拼装二进制
  const parts: string[] = [];
  parts.push(MAGIC);
  parts.push(String.fromCharCode(VERSION));
  parts.push(String.fromCharCode((256 >> 8) & 0xff, 256 & 0xff));
  parts.push(encKey);
  parts.push(hexToLatin1(iv.toString(CryptoJS.enc.Hex)));
  parts.push(hexToLatin1(hmacHex));
  parts.push(hexToLatin1(cipherHex));
  return parts.join("");
}

/** 二进制字符串 → base64（供 FileSystem 以 Base64 编码写文件） */
export function binaryToBase64(bin: string): string {
  if (typeof btoa === "function") return btoa(bin);
  // Hermes 下无 btoa 时兜底
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bin.length; i += 3) {
    const b1 = bin.charCodeAt(i);
    const b2 = i + 1 < bin.length ? bin.charCodeAt(i + 1) : 0;
    const b3 = i + 2 < bin.length ? bin.charCodeAt(i + 2) : 0;
    out += chars[b1 >> 2];
    out += chars[((b1 & 3) << 4) | (b2 >> 4)];
    out += i + 1 < bin.length ? chars[((b2 & 15) << 2) | (b3 >> 6)] : "=";
    out += i + 2 < bin.length ? chars[b3 & 63] : "=";
  }
  return out;
}
