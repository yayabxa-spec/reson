/**
 * 皮肤注册表
 * - wechat: 自用版（微信风格）
 * - clean:  合规/对外版（中性清爽风格）
 *
 * 主题色只做“覆盖”：未列出的颜色沿用 base palette（theme/light.ts）。
 * 运行时可切换（个人版），合规构建时通过 EXPO_PUBLIC_APP_SKIN=clean 固定。
 */
export type SkinId = "wechat" | "clean" | "glass";

export interface SkinOverrides {
  /** 强调色：选中态 / 主按钮 / 链接等 */
  primary: string;
  /** 品牌主色（与 primary 通常一致） */
  brand1: string;
  /** 自己发出的消息气泡 */
  brand2: string;
  /** 品牌浅色（选中背景等） */
  brandLight: string;
  /** 顶栏 / 页面底色 */
  fillColor: string;
  bg3: string;
  /** 链接 / 分区标题蓝 */
  textBlue: string;
  // ---- 可选：M3 语义映射（clean 皮肤使用） ----
  text3?: string;
  line1?: string;
  line2?: string;
  danger5?: string;
  iconBlue?: string;
  iconYellow?: string;
  bg2?: string;
}

export interface SkinConfig {
  id: SkinId;
  /** 展示名 */
  label: string;
  /** 覆盖到 base 主题上的颜色 */
  overrides: SkinOverrides;
  /** 布局风格（dock/菜单等组件按皮肤切换渲染） */
  layout: {
    dock: "wechat" | "material" | "glass";
    plusMenu: "wechat" | "material";
    switchControl: "wechat" | "material";
    dialog: "wechat" | "material";
    button: "wechat" | "material";
  };
  /** 玻璃皮肤专用参数（其他皮肤不使用） */
  glass?: {
    /** 玻璃面板的浅色调（rgba，带透明度） */
    tint: string;
    /** 边缘高光 */
    highlight: string;
  };
  /** 界面文案（对外版用中性叫法） */
  labels: {
    chats: string;
    contacts: string;
    discover: string;
    me: string;
    moments: string;
    scan: string;
    newChat: string;
    addFriend: string;
  };
}

export const SKINS: Record<SkinId, SkinConfig> = {
  wechat: {
    id: "wechat",
    label: "微信风格",
    overrides: {
      primary: "#07C160",
      brand1: "#07C160",
      brand2: "#94ea68",
      brandLight: "#DEFAF5",
      fillColor: "rgb(237,237,237)",
      bg3: "#EDEDED",
      textBlue: "#576B95",
    },
    layout: {
      dock: "wechat",
      plusMenu: "wechat",
      switchControl: "wechat",
      dialog: "wechat",
      button: "wechat",
    },
    labels: {
      chats: "首页",
      contacts: "通讯录",
      discover: "发现",
      me: "我",
      moments: "朋友圈",
      scan: "扫一扫",
      newChat: "发起群聊",
      addFriend: "添加朋友",
    },
  },
  clean: {
    id: "clean",
    label: "清爽风格",
    overrides: {
      // Monet/M3 生成色板：#5B67F1 → TONAL_SPOT
      primary: "#555a92",
      brand1: "#555a92",
      brand2: "#e0e0ff", // primaryContainer（自己发的气泡）
      brandLight: "#e1e0f9", // secondaryContainer（选中药丸/高亮）
      fillColor: "#f5f2fa", // surfaceContainerLow
      bg3: "#f5f2fa",
      textBlue: "#555a92",
      text3: "#46464f", // onSurfaceVariant
      line1: "#efedf4", // surfaceContainer
      line2: "#e4e1e9", // surfaceContainerHighest
      danger5: "#ba1a1a", // error
      iconBlue: "#5c5d72", // secondary
      iconYellow: "#78536b", // tertiary
      bg2: "#f5f2fa",
    },
    layout: {
      dock: "material",
      plusMenu: "material",
      switchControl: "material",
      dialog: "material",
      button: "material",
    },
    labels: {
      chats: "首页",
      contacts: "联系人",
      discover: "探索",
      me: "我的",
      moments: "好友动态",
      scan: "扫一扫",
      newChat: "发起群聊",
      addFriend: "添加朋友",
    },
  },
  glass: {
    id: "glass",
    label: "玻璃风格",
    // 注意：overrides 全部为不透明色（fillColor 等被大量页面当纯色背景消费）；
    // 半透明只出现在玻璃组件的 glass.tint，不进全局 palette，避免透底问题
    overrides: {
      primary: "#4A7FB5",
      brand1: "#4A7FB5",
      brand2: "#BFD9F2", // 自己发的消息气泡
      brandLight: "#E3EEF8",
      fillColor: "#F2F5F9",
      bg3: "#F2F5F9",
      textBlue: "#4A7FB5",
      text3: "#5B6470",
      line1: "#E8ECF2",
      line2: "#DCE2EA",
      danger5: "#BA1A1A",
      iconBlue: "#5C6B7A",
      iconYellow: "#7A6553",
      bg2: "#F2F5F9",
    },
    layout: {
      dock: "glass",
      plusMenu: "material",
      switchControl: "material",
      dialog: "material",
      button: "material",
    },
    glass: {
      // Catalog 截图配方：dock 极通透（壁纸清晰透过），选中项是灰色磨砂胶囊
      tint: "rgba(255, 255, 255, 0.12)",
      highlight: "rgba(255, 255, 255, 0.55)",
    },
    labels: {
      chats: "首页",
      contacts: "联系人",
      discover: "探索",
      me: "我的",
      moments: "好友动态",
      scan: "扫一扫",
      newChat: "发起群聊",
      addFriend: "添加朋友",
    },
  },
};

export function getSkin(id: SkinId): SkinConfig {
  return SKINS[id] ?? SKINS.wechat;
}

export function isSkinId(v: string | undefined | null): v is SkinId {
  return v === "wechat" || v === "clean" || v === "glass";
}

/** 把 M3 色板 token 映射到主题语义色（clean 皮肤使用） */
export function cleanOverridesFromScheme(
  scheme: Record<string, string>
): SkinOverrides {
  return {
    primary: scheme.primary,
    brand1: scheme.primary,
    brand2: scheme.primaryContainer,
    brandLight: scheme.secondaryContainer,
    fillColor: scheme.surfaceContainerLow,
    bg3: scheme.surfaceContainerLow,
    textBlue: scheme.primary,
    text3: scheme.onSurfaceVariant,
    line1: scheme.surfaceContainer,
    line2: scheme.surfaceContainerHighest,
    danger5: scheme.error,
    iconBlue: scheme.secondary,
    iconYellow: scheme.tertiary,
    bg2: scheme.surfaceContainerLow,
  };
}
