// 基于 pinyin 库（pinyin-web 构建）生成角色名搜索键：
// 原名 | 拼音首字母（可莉 -> kl）| 完整拼音（可莉 -> keli）
// @ts-ignore
import { pinyin } from "pinyin/lib/pinyin-web.js";

type PinyinRow = string[];

export function buildRoleSearchKey(name: string): string {
  const low = (name || "").toLocaleLowerCase();
  try {
    const initials = (pinyin(name, {
      style: 4, // FIRST_LETTER
      toneType: "none",
      type: "array",
    }) as PinyinRow[])
      .map((row) => (row && row[0]) || "")
      .join("")
      .toLocaleLowerCase();
    const full = (pinyin(name, {
      style: 0, // NORMAL
      toneType: "none",
      type: "array",
    }) as PinyinRow[])
      .map((row) => (row && row[0]) || "")
      .join("")
      .toLocaleLowerCase();
    return low + "|" + initials + "|" + full;
  } catch {
    return low;
  }
}
