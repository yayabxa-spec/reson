import { NativeModules } from "react-native";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mcu: any = require("./mcuBundle");

const ROLES = [
  "primary",
  "onPrimary",
  "primaryContainer",
  "onPrimaryContainer",
  "secondary",
  "onSecondary",
  "secondaryContainer",
  "onSecondaryContainer",
  "tertiary",
  "onTertiary",
  "tertiaryContainer",
  "onTertiaryContainer",
  "error",
  "onError",
  "errorContainer",
  "onErrorContainer",
  "background",
  "onBackground",
  "surface",
  "onSurface",
  "surfaceVariant",
  "onSurfaceVariant",
  "surfaceDim",
  "surfaceBright",
  "surfaceContainerLowest",
  "surfaceContainerLow",
  "surfaceContainer",
  "surfaceContainerHigh",
  "surfaceContainerHighest",
  "outline",
  "outlineVariant",
  "inverseSurface",
  "inverseOnSurface",
  "inversePrimary",
  "shadow",
  "scrim",
];

export interface M3Scheme {
  [key: string]: string;
}

/** 用 Google material-color-utilities 从源色生成 M3 亮/暗两套色板 */
export function generateM3Scheme(sourceHex: string): {
  light: M3Scheme;
  dark: M3Scheme;
} {
  const { SchemeTonalSpot, Hct, argbFromHex, hexFromArgb } = mcu as any;
  if (!SchemeTonalSpot || !Hct) {
    throw new Error("mcu bundle not loaded");
  }
  const source = Hct.fromInt(argbFromHex(sourceHex));
  const build = (dark: boolean): M3Scheme => {
    const s = new SchemeTonalSpot(source, dark, 0);
    const out: M3Scheme = {};
    for (const n of ROLES) {
      try {
        out[n] = hexFromArgb(s.colors[n](s).getArgb(s));
      } catch {}
    }
    return out;
  };
  return { light: build(false), dark: build(true) };
}

/**
 * 读取系统动态取色（Android 12+ Monet）：返回 accent1_600 的 hex，
 * 不支持/失败时返回 null（由调用方回退固定色板）。
 */
export async function getSystemAccentColor(): Promise<string | null> {
  try {
    const mod = (NativeModules as any).DynamicColorModule;
    if (!mod?.getSystemAccentColor) return null;
    const hex = await mod.getSystemAccentColor();
    return typeof hex === "string" && /^#[0-9a-fA-F]{6}$/.test(hex)
      ? hex.toUpperCase()
      : null;
  } catch {
    return null;
  }
}
