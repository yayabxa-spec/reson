import AsyncStorage from "../utils/storage";

export type ThemeMode = "system" | "light" | "dark";

const FONT_KEY = "wc_font_scale_v1";
const THEME_KEY = "wc_theme_mode_v1";

let fontScale = 1;
let themeMode: ThemeMode = "light";
let ready = false;
const subs = new Set<() => void>();

function notify() {
  subs.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
}

export async function loadAppearance() {
  if (ready) return;
  try {
    const f = await AsyncStorage.getItem(FONT_KEY);
    if (f != null) fontScale = Math.min(1.6, Math.max(0.8, parseFloat(f) || 1));
    const t = await AsyncStorage.getItem(THEME_KEY);
    // 深色模式暂时禁用：只接受浅色，其余一律按浅色处理
    if (t === "light") themeMode = "light";
  } catch {}
  ready = true;
  notify();
}

export function getFontScale(): number {
  return fontScale;
}

export function setFontScale(v: number) {
  fontScale = v;
  AsyncStorage.setItem(FONT_KEY, String(v)).catch(() => {});
  notify();
}

export function getThemeMode(): ThemeMode {
  return themeMode;
}

export function setThemeMode(mode: ThemeMode) {
  themeMode = mode;
  AsyncStorage.setItem(THEME_KEY, mode).catch(() => {});
  notify();
}

export function subscribeAppearance(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}
