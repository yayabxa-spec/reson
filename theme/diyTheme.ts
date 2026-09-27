/**
 * v0.61.1-diy：RE:SON DIY Theme 系统（实验分支）
 *
 * 定位：给已验收的 Liquid Glass（v0.60.12/382 收官基线）提供"不同的颜色输入"，
 * 核心管线（GlassEffectView/AGSL/BackdropSourceView/RenderNode/镜片/装饰/弹簧/手势）
 * 全部冻结，本文件只产出"颜色配置"与"颜色组合"。
 *
 * 两层配置：
 *   普通调色：page/surface/text/icon/glass/tab/environment 语义分组
 *   高级 DIY：tokens 直接覆盖任意 ThemeColor 键（最高优先级逃生口）
 *
 * 两个独立旋钮（刻意分离）：
 *   environment.*  = 玻璃后面的世界（经 BackdropSource 采样进入折射）
 *   glass.*        = 玻璃表面材质（经 surfaceColor prop 混合）
 *
 * 路由 key 统一：index / contacts / discover / me
 */
import type { ThemeColor } from "./light";

/** 总开关：false 时 resolveDIYTheme 恒返回 undefined，行为与 v0.60.13 完全一致 */
export const GLASS_DIY_ENABLED = true;

export interface DIYUiConfig {
  pageBackground?: string; // → surfaceContainerLow
  header?: string;         // → fillColor
  card?: string;           // → surfaceContainerLowest
  cardSecondary?: string;  // → surfaceContainer
  divider?: string;        // → line1
  textPrimary?: string;    // → onSurface
  textSecondary?: string;  // → onSurfaceVariant（与 icon.secondary 共享 token）
  textTertiary?: string;   // → text3
  iconAccent?: string;     // → primary
  iconSecondary?: string;  // → onSurfaceVariant（与 text.secondary 共享 token）
  accent?: string;         // → primary
}

export interface DIYGlassConfig {
  /** 玻璃基础色（默认 FAFAFA@0.4） */
  base?: string;
  /** Tint 色（独立旋钮，可与 environment 完全不同） */
  tint?: string;
  /** Tint 强度 0~1 */
  tintAlpha?: number;
}

export interface DIYTabConfig {
  selectedIcon?: string;
  selectedText?: string;
  /** 配置接口已就位，默认不渲染（Phase C 再实现选中胶囊视觉） */
  selectedBackground?: string;
  unselectedIcon?: string;
  unselectedText?: string;
}

export interface DIYEnvironmentConfig {
  background?: string;
  blob1?: string;
  blob2?: string;
  blob3?: string;
  /** 光斑整体强度 0~1（默认 0.45） */
  blobOpacity?: number;
}

export interface DIYPageTheme {
  page?: { background?: string; header?: string };
  surface?: { card?: string; cardSecondary?: string; divider?: string };
  text?: { primary?: string; secondary?: string; tertiary?: string };
  icon?: { accent?: string; secondary?: string };
  glass?: DIYGlassConfig;
  tab?: DIYTabConfig;
  environment?: DIYEnvironmentConfig;
  /** 高级覆盖：任意 ThemeColor 键，最后合并（最高优先级） */
  tokens?: Partial<ThemeColor>;
}

export type DIYThemeConfig = Record<string, DIYPageTheme>;

/** 唯一编辑点：想改某个页面的颜色，只改这里对应的一段 */
export const DIY_THEMES: DIYThemeConfig = {
  index: {
    page: { background: "#F5F7FF", header: "#EEF2FF" },
    surface: { card: "#FFFFFF" },
    glass: { base: "rgba(250, 250, 250, 0.4)", tint: "#7EA7FF", tintAlpha: 0.06 },
    tab: { selectedIcon: "#4A7FB5", selectedText: "#4A7FB5" },
    environment: {
      background: "#F5F7FF",
      blob1: "rgba(143,184,255,0.5)",
      blob2: "rgba(184,160,255,0.42)",
      blob3: "rgba(125,224,208,0.4)",
      blobOpacity: 0.45,
    },
  },
  contacts: {
    page: { background: "#EFFAF5", header: "#F2FBF7" },
    glass: { base: "rgba(250, 250, 250, 0.4)", tint: "#68D391", tintAlpha: 0.07 },
    tab: { selectedIcon: "#2F9E77", selectedText: "#2F9E77" },
    environment: {
      background: "#EFFAF5",
      blob1: "rgba(127,216,192,0.5)",
      blob2: "rgba(168,232,216,0.45)",
      blob3: "rgba(207,245,234,0.4)",
      blobOpacity: 0.45,
    },
  },
  discover: {
    page: { background: "#F6F2FF", header: "#F7F3FF" },
    glass: { base: "rgba(250, 250, 250, 0.4)", tint: "#B98CFF", tintAlpha: 0.07 },
    tab: { selectedIcon: "#7B42D8", selectedText: "#7B42D8" },
    environment: {
      background: "#F6F2FF",
      blob1: "rgba(183,159,255,0.5)",
      blob2: "rgba(208,191,255,0.45)",
      blob3: "rgba(240,180,220,0.4)",
      blobOpacity: 0.45,
    },
  },
  me: {
    page: { background: "#FFF6EC", header: "#FFF8EF" },
    glass: { base: "rgba(250, 250, 250, 0.4)", tint: "#F0B429", tintAlpha: 0.06 },
    tab: { selectedIcon: "#C77E1F", selectedText: "#C77E1F" },
    environment: {
      background: "#FFF6EC",
      blob1: "rgba(255,196,138,0.5)",
      blob2: "rgba(255,217,176,0.45)",
      blob3: "rgba(255,237,214,0.4)",
      blobOpacity: 0.45,
    },
  },
};

export interface ResolvedDIYTheme {
  route: string;
  /** 合并后的 token 覆盖（供嵌套 ThemeProvider 下发） */
  tokens: Partial<ThemeColor>;
  /** 语义页级配置（Header 等在 PageSource 外的消费者使用） */
  page?: { background?: string; header?: string };
  glass: { base: string; tint?: string; tintAlpha: number };
  tab: DIYTabConfig;
  /** resolve 后已填默认值，全部必填 */
  environment: {
    background: string;
    blob1: string;
    blob2: string;
    blob3: string;
    blobOpacity: number;
  };
}

/** 语义名 → ThemeColor token 映射 */
const SEMANTIC_TOKEN_MAP: Array<[keyof DIYUiConfig, keyof ThemeColor]> = [
  ["pageBackground", "surfaceContainerLow"],
  ["header", "fillColor"],
  ["card", "surfaceContainerLowest"],
  ["cardSecondary", "surfaceContainer"],
  ["divider", "line1"],
  ["textPrimary", "onSurface"],
  ["textSecondary", "onSurfaceVariant"],
  ["textTertiary", "text3"],
  ["iconAccent", "primary"],
  ["iconSecondary", "onSurfaceVariant"],
  ["accent", "primary"],
];

/** 颜色字符串 → {r,g,b,a}；支持 #RGB/#RRGGBB/#AARRGGBB/rgba() */
export function parseColor(s: string): { r: number; g: number; b: number; a: number } | null {
  const str = s.trim();
  let m = str.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (m) {
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 };
  }
  m = str.match(/^#([0-9a-fA-F]{3,8})$/);
  if (m) {
    const h = m[1];
    if (h.length === 3) {
      return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16), a: 1 };
    }
    if (h.length === 6) {
      return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
    }
    if (h.length === 8) {
      return { r: parseInt(h.slice(2, 4), 16), g: parseInt(h.slice(4, 6), 16), b: parseInt(h.slice(6, 8), 16), a: parseInt(h.slice(0, 2), 16) / 255 };
    }
  }
  return null;
}

/**
 * 把 tint 以指定强度叠在 base 上，返回最终 rgba 字符串（玻璃表面组合）。
 * base/tint 任一不可解析、或 alpha<=0 时原样返回 base。
 */
export function blendRgba(base: string, tint: string, tintAlpha?: number): string {
  const ta = tintAlpha === undefined ? 0.06 : tintAlpha;
  const b = parseColor(base);
  const t = parseColor(tint);
  if (!b || !t || ta <= 0) return base;
  const oa = ta + b.a * (1 - ta);
  if (oa <= 0) return base;
  const r = Math.round((t.r * ta + b.r * b.a * (1 - ta)) / oa);
  const g = Math.round((t.g * ta + b.g * b.a * (1 - ta)) / oa);
  const bl = Math.round((t.b * ta + b.b * b.a * (1 - ta)) / oa);
  return `rgba(${r}, ${g}, ${bl}, ${oa.toFixed(3)})`;
}

/** 解析指定路由的 DIY 主题；总开关关闭 / 无配置时返回 undefined（精确回退稳定行为） */
export function resolveDIYTheme(route: string): ResolvedDIYTheme | undefined {
  if (!GLASS_DIY_ENABLED) return undefined;
  const cfg = DIY_THEMES[route];
  if (!cfg) return undefined;

  const tokens: Partial<ThemeColor> = {};
  const ui: DIYUiConfig = {
    ...(cfg.page?.background !== undefined ? { pageBackground: cfg.page.background } : {}),
    ...(cfg.page?.header !== undefined ? { header: cfg.page.header } : {}),
    ...(cfg.surface?.card !== undefined ? { card: cfg.surface.card } : {}),
    ...(cfg.surface?.cardSecondary !== undefined ? { cardSecondary: cfg.surface.cardSecondary } : {}),
    ...(cfg.surface?.divider !== undefined ? { divider: cfg.surface.divider } : {}),
    ...(cfg.text?.primary !== undefined ? { textPrimary: cfg.text.primary } : {}),
    ...(cfg.text?.secondary !== undefined ? { textSecondary: cfg.text.secondary } : {}),
    ...(cfg.text?.tertiary !== undefined ? { textTertiary: cfg.text.tertiary } : {}),
    ...(cfg.icon?.accent !== undefined ? { iconAccent: cfg.icon.accent } : {}),
    ...(cfg.icon?.secondary !== undefined ? { iconSecondary: cfg.icon.secondary } : {}),
  };
  for (const [semantic, tokenKey] of SEMANTIC_TOKEN_MAP) {
    const v = ui[semantic];
    if (v !== undefined) {
      (tokens as Record<string, string>)[tokenKey] = v;
    }
  }
  Object.assign(tokens, cfg.tokens);

  return {
    route,
    tokens,
    page: cfg.page,
    glass: {
      base: cfg.glass?.base ?? "rgba(250, 250, 250, 0.4)",
      tint: cfg.glass?.tint,
      tintAlpha: cfg.glass?.tintAlpha ?? 0.06,
    },
    tab: cfg.tab ?? {},
    environment: {
      background: cfg.environment?.background ?? cfg.page?.background ?? "#F5F7FF",
      blob1: cfg.environment?.blob1 ?? "rgba(143,184,255,0.5)",
      blob2: cfg.environment?.blob2 ?? "rgba(184,160,255,0.42)",
      blob3: cfg.environment?.blob3 ?? "rgba(125,224,208,0.4)",
      blobOpacity: cfg.environment?.blobOpacity ?? 0.45,
    },
  };
}
