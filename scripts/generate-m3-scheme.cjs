/**
 * 用 Google material-color-utilities 生成 M3 色板（Monet 取色）。
 * 用法：
 *   node scripts/generate-m3-scheme.cjs                 # 默认源色 #5B67F1，输出到 stdout
 *   node scripts/generate-m3-scheme.cjs <源色hex>       # 例如 #6750A4
 *   node scripts/generate-m3-scheme.cjs #5B67F1 --write  # 直接覆写 theme/m3Scheme.ts
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const esbuild = require("esbuild");

const sourceHex = (process.argv[2] || "#5B67F1").replace(/^#/, "");
const writeFile = process.argv.includes("--write");

// material-color-utilities 是纯 ESM 且内部无扩展名导入，Node 直接 require 会失败，
// 先用 esbuild 打成 CJS 再加载。
const tmp = path.join(os.tmpdir(), "mcu-bundle-" + Date.now() + ".cjs");
esbuild.buildSync({
  entryPoints: [require.resolve("@material/material-color-utilities")],
  bundle: true,
  format: "cjs",
  platform: "node",
  outfile: tmp,
});

const {
  SchemeTonalSpot,
  Hct,
  argbFromHex,
  hexFromArgb,
} = require(tmp);

const ROLES = [
  "primary", "onPrimary", "primaryContainer", "onPrimaryContainer",
  "secondary", "onSecondary", "secondaryContainer", "onSecondaryContainer",
  "tertiary", "onTertiary", "tertiaryContainer", "onTertiaryContainer",
  "error", "onError", "errorContainer", "onErrorContainer",
  "background", "onBackground", "surface", "onSurface",
  "surfaceVariant", "onSurfaceVariant", "surfaceDim", "surfaceBright",
  "surfaceContainerLowest", "surfaceContainerLow", "surfaceContainer",
  "surfaceContainerHigh", "surfaceContainerHighest",
  "outline", "outlineVariant", "inverseSurface", "inverseOnSurface",
  "inversePrimary", "shadow", "scrim",
];

function schemeFor(dark) {
  const s = new SchemeTonalSpot(
    Hct.fromInt(argbFromHex("#" + sourceHex)),
    dark,
    0
  );
  const out = {};
  for (const n of ROLES) out[n] = hexFromArgb(s.colors[n](s).getArgb(s));
  return out;
}

const light = schemeFor(false);
const dark = schemeFor(true);

function renderBody(name, obj) {
  return (
    "export const " +
    name +
    " = {\n" +
    ROLES.map((k) => `  ${k}: "${obj[k]}",`).join("\n") +
    "\n};\n"
  );
}

const out =
  "/**\n" +
  " * Material 3 色板（Monet / material-color-utilities 生成）\n" +
  ` * 源色：#${sourceHex}，TONAL_SPOT 变体\n` +
  " * 生成命令：node scripts/generate-m3-scheme.cjs #" +
  sourceHex +
  " --write\n" +
  " * 该文件为生成产物，勿手改。\n" +
  " */\n" +
  renderBody("m3Light", light) +
  "\n" +
  renderBody("m3Dark", dark);

fs.unlinkSync(tmp);

if (writeFile) {
  const target = path.join(__dirname, "..", "theme", "m3Scheme.ts");
  fs.writeFileSync(target, out, "utf8");
  console.log("written", target);
} else {
  process.stdout.write(out);
}
