import React, {
  useState,
  useContext,
  createContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { Appearance, AppState } from "react-native";
import * as light from "./light";
import { buildTheme, type ThemeColor } from "./light";
import {
  cleanOverridesFromScheme,
  getSkin,
  type SkinConfig,
  type SkinId,
} from "./skins";
import {
  getActiveSkinId,
  getDynamicScheme,
  loadSkin,
  loadDynamicScheme,
  loadThemeSource,
  setActiveSkinId,
  subscribeSkin,
  SKIN_FIXED,
} from "./skinState";
import {
  getThemeMode,
  loadAppearance,
  setThemeMode as persistThemeMode,
  subscribeAppearance,
  ThemeMode,
} from "../app/store/appearance";
import { resolveDIYTheme, type ResolvedDIYTheme } from "./diyTheme";
export type TThemeType = {
  themeColor: ThemeColor;
  text: typeof light.text;
  color: typeof light.color;
  bg: typeof light.bg;
  border: typeof light.border;
};

export type TThemeName = "dark" | "light";
const getCommonStyle = (theme: TThemeType["themeColor"]) => {
  if (!theme) {
    console.log("theme is ll getCommonStyle");
    return {};
  }
  return {
    commonBorderBottom: {
      borderBottomColor: theme.fillColor,
      borderBottomWidth: 2,
    },
  };
};
// Types
export interface ThemeContextInterface extends TThemeType {
  setTheme: (value: TThemeType) => void;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  skinId: SkinId;
  skin: SkinConfig;
  skinFixed: boolean;
  setSkinId: (id: SkinId) => void;
  commentStyle: ReturnType<typeof getCommonStyle>;
}

// Context
const ThemeContext = createContext({} as ThemeContextInterface);

// v0.61.1-diy：页面级 DIY token 覆盖上下文（嵌套在 ThemeProvider 内使用，
// null = 无覆盖，useTheme 自动回落到外层主题）
const DIYThemeContext = createContext<{
  themeColor: ThemeColor;
  text: TThemeType["text"];
  color: TThemeType["color"];
  bg: TThemeType["bg"];
  border: TThemeType["border"];
} | null>(null);

/**
 * 页面级 DIY Theme Provider：把 resolveDIYTheme(route).tokens 合并进当前
 * themeColor 下发——页面内所有既有 useTheme() 消费者（ChatList/卡片/文字…）
 * 自动获得该页覆盖色，无需改它们的取色逻辑。
 */
export const DIYThemeProvider = ({
  route,
  children,
}: {
  route: string;
  children: ReactNode;
}) => {
  const outer = useContext(ThemeContext);
  const resolved = useMemo(() => resolveDIYTheme(route), [route]);
  const value = useMemo(() => {
    if (!resolved) return null;
    const merged: ThemeColor = { ...outer.themeColor, ...resolved.tokens };
    return { themeColor: merged, ...buildTheme(merged) };
  }, [outer.themeColor, resolved]);
  return <DIYThemeContext.Provider value={value}>{children}</DIYThemeContext.Provider>;
};

/** 读取当前 route 的 DIY 切片（glass/tab/environment），供 Provider 外的消费者使用 */
export const useDIYTheme = (route: string): ResolvedDIYTheme | undefined =>
  useMemo(() => resolveDIYTheme(route), [route]);

// Provider to be used in index/App/or top of any parent
export const ThemeProvider = ({ children }: any): JSX.Element => {
  const [skinId, setSkinIdState] = useState<SkinId>(getActiveSkinId());
  const [themeMode, setThemeModeState] = useState<ThemeMode>(getThemeMode());
  const [dynamicScheme, setDynamicScheme] = useState(getDynamicScheme());

  // 读取用户主题源（预设/跟随系统）+ 动态取色；失败则保持固定色板
  useEffect(() => {
    loadThemeSource()
      .then(() => loadDynamicScheme())
      .then(() => setDynamicScheme(getDynamicScheme()));
    return subscribeSkin(() => {
      setSkinIdState(getActiveSkinId());
      // 皮肤/主题源变化时强制重读系统取色并刷新
      loadDynamicScheme(true).then(() =>
        setDynamicScheme(getDynamicScheme())
      );
    });
  }, []);

  // 切回前台时重新读取系统取色，换主题/壁纸后能立刻生效
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        loadDynamicScheme(true).then(() =>
          setDynamicScheme(getDynamicScheme())
        );
      }
    });
    return () => sub.remove();
  }, []);

  const composePalette = () => {
    const base = getSkin(skinId).overrides;
    const overrides =
      skinId === "clean" && dynamicScheme
        ? cleanOverridesFromScheme(dynamicScheme)
        : base;
    const palette = { ...light.themeColor, ...overrides };
    if (skinId === "clean" && dynamicScheme) {
      Object.assign(palette, dynamicScheme);
    }
    return palette;
  };

  const [theme, setTheme] = useState<TThemeType>(() => {
    const palette = composePalette();
    return { themeColor: palette, ...buildTheme(palette) };
  });

  useEffect(() => {
    loadSkin().then(() => setSkinIdState(getActiveSkinId()));
    return subscribeSkin(() => setSkinIdState(getActiveSkinId()));
  }, []);

  useEffect(() => {
    loadAppearance().then(() => setThemeModeState(getThemeMode()));
    return subscribeAppearance(() => setThemeModeState(getThemeMode()));
  }, []);

  useEffect(() => {
    const resolve = () => {
      // 深色模式暂时禁用：始终使用浅色主题；但保留皮肤覆盖色
      const palette = composePalette();
      setTheme({ themeColor: palette, ...buildTheme(palette) });
    };
    resolve();
    const sub = Appearance.addChangeListener(() => resolve());
    return () => sub.remove();
  }, [themeMode, skinId, dynamicScheme]);

  return (
    <ThemeContext.Provider
      value={{
        ...theme,
        setTheme,
        themeMode,
        setThemeMode: (m) => persistThemeMode(m),
        skinId,
        skin: getSkin(skinId),
        skinFixed: SKIN_FIXED,
        setSkinId: (id) => setActiveSkinId(id),
        commentStyle: getCommonStyle(theme.themeColor),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

// useTheme hook for easy access to theme and setTheme
export const useTheme = () => {
  const state = useContext(ThemeContext);
  // v0.61.1-diy：页面级 DIY 覆盖优先（DIYThemeProvider 内时生效）
  const diyOverride = useContext(DIYThemeContext);
  const { setTheme, ...themes } = state;
  const eff = diyOverride ?? themes;
  // 深色模式暂时禁用：固定返回浅色
  const themeName: TThemeName = "light";
  const setThemeName = (t: TThemeName) => state.setThemeMode(t);
  const toggleTheme = (t: TThemeName) => {
    state.setThemeMode(t);
  };

  return {
    ...eff,
    themeName,
    setThemeName,
    toggleTheme,
    skinId: themes.skinId,
    skin: themes.skin,
    skinFixed: themes.skinFixed,
    setSkinId: themes.setSkinId,
    commonStyle: getCommonStyle(eff.themeColor),
  };
};

export const useText = () => {
  const { text } = useTheme();
  return text;
};

export const useColor = () => {
  const { color } = useTheme();
  return color;
};

export const useBackground = () => {
  const { bg } = useTheme();
  return bg;
};
