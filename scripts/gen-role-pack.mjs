// 生成 App 角色内容包：
// 1) data/cards/*.rolecard.json → 剥离 plotSources → app-cards.json（参考）
// 2) gzip(level 9) → C:/wc2/assets/roles/rolecards_v1.json.gz（App 运行时解压种子）
// 3) 桌面 120 张角色头像 → assets/avatars/avatar_01..120.png（ASCII 文件名）
// 4) 重建 roleAvatars.ts 角色名 → 头像 require 映射
// 用法：node gen-role-pack.mjs
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
} from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)));
const cardsDir =
  "C:/Users/A3149/Documents/Codex/2026-08-04/kai/work/role-card-studio/data/cards";
const avatarDir = "C:/Users/A3149/Desktop/角色头像";
const outJson =
  "C:/Users/A3149/Documents/Codex/2026-08-04/kai/work/role-card-studio/data/export-app/app-cards.json";
const wc2 = "C:/wc2";
const outGz = join(wc2, "assets", "roles", "rolecards_v1.json.gz");
const avatarOutDir = join(wc2, "assets", "avatars");
const avatarMapFile = join(wc2, "app", "store", "roleAvatars.ts");

// 显示名归一：源卡保留全名，App 显示玩家习惯名（新增类似情况在此加一行）
const NAME_FIX = {
  "凯亚·亚尔伯里奇": "凯亚",
};

// 语音频率（角色性格驱动）：often=活泼/元气/小孩，rare=沉稳/高冷/忙碌，默认 sometimes
const VOICE_RATE = {
  "可莉": "often",
  "派蒙": "often",
  "胡桃": "often",
  "宵宫": "often",
  "安柏": "often",
  "诺艾尔": "often",
  "早柚": "often",
  "瑶瑶": "often",
  "纳西妲": "often",
  "迪奥娜": "often",
  "芭芭拉": "often",
  "香菱": "often",
  "烟绯": "often",
  "绮良良": "often",
  "琳妮特": "often",
  "多莉": "often",
  "辛焱": "often",
  "五郎": "often",
  "卡维": "often",
  "流浪者": "often",
  "甘雨": "rare",
  "钟离": "rare",
  "凝光": "rare",
  "刻晴": "rare",
  "雷电将军": "rare",
  "申鹤": "rare",
  "魈": "rare",
  "优菈": "rare",
  "迪卢克": "rare",
  "凯亚": "rare",
  "重云": "rare",
  "神里绫人": "rare",
  "那维莱特": "rare",
  "莱欧斯利": "rare",
  "艾尔海森": "rare",
  "赛诺": "rare",
  "白术": "rare",
  "阿贝多": "rare",
};

const files = readdirSync(cardsDir)
  .filter((f) => f.endsWith(".rolecard.json"))
  .sort((a, b) => a.localeCompare(b, "zh"));

const cards = [];
for (const f of files) {
  const raw = JSON.parse(readFileSync(join(cardsDir, f), "utf8"));
  const name = NAME_FIX[raw.name] || raw.name;
  cards.push({
    name,
    work: raw.work || "原神",
    region: raw.region || "",
    bio: (raw.summary || "").trim(),
    callName: raw.callName,
    birthday: raw.birthday || "",
    persona: raw.persona || "",
    storyState: raw.storyState || "",
    voiceRate: VOICE_RATE[name] || "sometimes",
    background: (raw.background || []).map((b) => ({
      title: b.title || "",
      content: b.content || "",
      tags: Array.isArray(b.tags) ? b.tags : [],
    })),
  });
}

const dup = cards
  .map((c) => c.name)
  .filter((n, i, a) => a.indexOf(n) !== i);
if (dup.length) throw new Error("角色名重复: " + dup.join(","));
if (!cards.length) throw new Error("没有读到任何角色卡: " + cardsDir);

const json = JSON.stringify(cards);
writeFileSync(outJson, json, "utf8");
mkdirSync(join(wc2, "assets", "roles"), { recursive: true });
writeFileSync(outGz, gzipSync(json, { level: 9 }));

// 头像：按角色名匹配（凯亚已归一，与 凯亚.png 对齐）
const fileByName = {};
for (const p of readdirSync(avatarDir)) {
  if (p.endsWith(".png")) fileByName[basename(p, ".png")] = p;
}
const missing = cards.filter((c) => !fileByName[c.name]).map((c) => c.name);
if (missing.length) throw new Error("缺头像: " + missing.join(","));

const lines = [];
cards.forEach((c, i) => {
  const n = String(i + 1).padStart(2, "0");
  copyFileSync(join(avatarDir, fileByName[c.name]), join(avatarOutDir, `avatar_${n}.png`));
  lines.push(`  ${JSON.stringify(c.name)}: require("../../assets/avatars/avatar_${n}.png"),`);
});
writeFileSync(
  avatarMapFile,
  "// 由 gen-role-pack.mjs 自动生成，勿手改；同步 120 张头像（ASCII 文件名避免 Metro 中文资源名冲突）\n" +
    "export const GENSHIN_AVATARS: Record<string, any> = {\n" +
    lines.join("\n") +
    "\n};\n",
  "utf8"
);

console.log(
  `角色包: ${cards.length} 张; JSON ${(json.length / 1024 / 1024).toFixed(2)}MB; gzip ${(
    readFileSync(outGz).length / 1024 / 1024
  ).toFixed(2)}MB`
);
console.log(`头像: ${Object.keys(fileByName).length} 张 → ${avatarOutDir}`);
console.log(`映射: ${avatarMapFile}`);
