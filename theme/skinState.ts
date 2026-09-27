import AsyncStorage from "@react-native-async-storage/async-storage";
import { isSkinId, type SkinId } from "./skins";
import {
  generateM3Scheme,
  getSystemAccentColor,
  type M3Scheme,
} from "../lib/m3Dynamic";

const SKIN_KEY = "wc_skin_v1";
const THEME_SOURCE_KEY = "wc_theme_source_v1";

/**
 * 构建时固定皮肤：
 * - EXPO_PUBLIC_APP_SKIN=clean  -> 合规构建默认（且可被 EXPO_PUBLIC_APP_SKIN_FIXED=1 锁定）
 * - 未设置 -> 自用版默认微信风格，运行时可切换
 */
const BUILD_SKIN: SkinId = isSkinId(process.env.EXPO_PUBLIC_APP_SKIN)
  ? (process.env.EXPO_PUBLIC_APP_SKIN as SkinId)
  : "wechat";

/** 合规构建时是否禁止切换回微信皮肤 */
export const SKIN_FIXED = process.env.EXPO_PUBLIC_APP_SKIN_FIXED === "1";

let skinId: SkinId = BUILD_SKIN;
let ready = false;
let dynamicScheme: M3Scheme | null = null;
let themeSource: ThemeSource = { mode: "system" };
const subs = new Set<() => void>();

export interface ThemeSource {
  mode: "system" | "preset";
  color?: string;
}

function notify() {
  subs.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
}

export function getBuildSkin(): SkinId {
  return BUILD_SKIN;
}

export function getActiveSkinId(): SkinId {
  return skinId;
}

/** 系统动态取色生成的 M3 色板（Android 12+），拿不到时为 null */
export function getDynamicScheme(): M3Scheme | null {
  return dynamicScheme;
}

export function getThemeSource(): ThemeSource {
  return themeSource;
}

export async function loadThemeSource() {
  try {
    const v = await AsyncStorage.getItem(THEME_SOURCE_KEY);
    if (v) {
      const parsed = JSON.parse(v);
      if (
        parsed?.mode === "preset" &&
        /^#[0-9a-fA-F]{6}$/.test(parsed.color || "")
      ) {
        themeSource = { mode: "preset", color: parsed.color.toUpperCase() };
      } else {
        themeSource = { mode: "system" };
      }
    }
  } catch {}
}

export function setThemeSource(source: ThemeSource) {
  themeSource =
    source.mode === "preset" && /^#[0-9a-fA-F]{6}$/.test(source.color || "")
      ? { mode: "preset", color: source.color!.toUpperCase() }
      : { mode: "system" };
  AsyncStorage.setItem(THEME_SOURCE_KEY, JSON.stringify(themeSource)).catch(
    () => {}
  );
  notify();
}

/**
 * 尝试读取系统动态色并生成色板；失败保持现状（回退固定色板）。
 * force=true 时强制重新读取（例如切回前台时刷新主题取色）。
 */
export async function loadDynamicScheme(force = false) {
  if (dynamicScheme && !force) return;
  try {
    let source: string | null = null;
    if (themeSource.mode === "preset" && themeSource.color) {
      source = themeSource.color;
    } else {
      source = await getSystemAccentColor();
    }
    if (source) {
      const next = generateM3Scheme(source).light;
      // 颜色确实变化才更新并通知，避免无意义重绘
      if (!dynamicScheme || dynamicScheme.primary !== next.primary) {
        dynamicScheme = next;
        notify();
      }
    }
  } catch {
    notify();
  }
}

/** 合规构建（clean）下禁止玻璃皮肤：既不能被存储值恢复，也不能运行时切换 */
function glassBlocked(): boolean {
  return BUILD_SKIN === "clean";
}

/** 皮肤值是否可被采用（合规构建时过滤掉 glass） */
function adoptableSkin(v: string | undefined | null): v is SkinId {
  return isSkinId(v) && !(v === "glass" && glassBlocked());
}

export async function loadSkin() {
  if (ready || SKIN_FIXED) return;
  try {
    const v = await AsyncStorage.getItem(SKIN_KEY);
    if (adoptableSkin(v)) skinId = v;
  } catch {}
  ready = true;
  notify();
}

export function setActiveSkinId(id: SkinId) {
  if (SKIN_FIXED || (id === "glass" && glassBlocked()) || !isSkinId(id)) return;
  skinId = id;
  AsyncStorage.setItem(SKIN_KEY, id).catch(() => {});
  notify();
}

export function subscribeSkin(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}
