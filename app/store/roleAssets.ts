import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import { inflate } from "pako";
import type { BuiltinRoleData } from "./builtin/types";

// ============================================================
// 内置角色内容包加载器：rolecards_v1.json.gz（gzip 资产）
// 首次需要时解压一次并缓存，之后直接返回；数据源由 gen-role-pack.mjs 生成。
// 以后知识库等内容包复用同一模式：Asset → 读字节 → inflate → JSON.parse。
// ============================================================

let cache: BuiltinRoleData[] | null = null;
let loading: Promise<BuiltinRoleData[]> | null = null;

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function loadBuiltinRoles(): Promise<BuiltinRoleData[]> {
  if (cache) return cache;
  if (loading) return loading;
  loading = (async () => {
    const asset = Asset.fromModule(
      require("../../assets/roles/rolecards_v1.json.gz")
    );
    await asset.downloadAsync();
    const uri = asset.localUri || asset.uri;
    const b64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const text = inflate(base64ToBytes(b64), { to: "string" });
    cache = JSON.parse(text) as BuiltinRoleData[];
    return cache;
  })();
  return loading;
}
