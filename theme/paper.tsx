import React from "react";
import { useMemo } from "react";
import { MD3LightTheme, PaperProvider } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "./useTheme";

/**
 * react-native-paper 主题桥：
 * 把 App 运行时主题（基础令牌 + 皮肤覆盖 + Monet 动态取色）实时映射成
 * Paper 的 MD3 主题，并统一图标渲染到 @expo/vector-icons。
 */
export function buildPaperTheme(
  palette: Record<string, string | undefined>
) {
  const base = MD3LightTheme.colors;
  const get = (k: string, fb: string) => palette[k] || fb;
  return {
    ...MD3LightTheme,
    version: 3 as const,
    roundness: 8,
    colors: {
      ...base,
      primary: get("primary", base.primary),
      onPrimary: get("onPrimary", base.onPrimary),
      primaryContainer: get("primaryContainer", base.primaryContainer),
      onPrimaryContainer: get("onPrimaryContainer", base.onPrimaryContainer),
      secondary: get("secondary", base.secondary),
      onSecondary: get("onSecondary", base.onSecondary),
      secondaryContainer: get("secondaryContainer", base.secondaryContainer),
      onSecondaryContainer: get(
        "onSecondaryContainer",
        base.onSecondaryContainer
      ),
      tertiary: get("tertiary", base.tertiary),
      onTertiary: get("onTertiary", base.onTertiary),
      tertiaryContainer: get("tertiaryContainer", base.tertiaryContainer),
      onTertiaryContainer: get(
        "onTertiaryContainer",
        base.onTertiaryContainer
      ),
      error: get("error", base.error),
      onError: get("onError", base.onError),
      errorContainer: get("errorContainer", base.errorContainer),
      onErrorContainer: get("onErrorContainer", base.onErrorContainer),
      background: get("background", get("fillColor", base.background)),
      onBackground: get("onBackground", base.onBackground),
      surface: get("surface", get("white", base.surface)),
      onSurface: get("onSurface", get("text5", base.onSurface)),
      surfaceVariant: get("surfaceVariant", base.surfaceVariant),
      onSurfaceVariant: get(
        "onSurfaceVariant",
        get("text3", base.onSurfaceVariant)
      ),
      outline: get("outline", base.outline),
      outlineVariant: get("outlineVariant", get("line2", base.outlineVariant)),
      inverseSurface: get("inverseSurface", base.inverseSurface),
      inverseOnSurface: get("inverseOnSurface", base.inverseOnSurface),
      inversePrimary: get("inversePrimary", base.inversePrimary),
      shadow: get("shadow", base.shadow),
      scrim: get("scrim", base.scrim),
      surfaceDisabled:
        (get("surfaceVariant", base.surfaceVariant) || "") + "66",
      onSurfaceDisabled: (get("onSurface", base.onSurface) || "") + "38",
      backdrop: get("scrim", base.scrim) || "#000000",
    },
  };
}

/** PaperProvider 桥组件：放在 AppThemeProvider 内部，跟随皮肤/Monet 实时刷新 */
export function PaperThemeBridge({
  children,
}: {
  children: React.ReactNode;
}) {
  const { themeColor } = useTheme();
  const theme = useMemo(
    () => buildPaperTheme(themeColor as unknown as Record<string, string>),
    [themeColor]
  );
  const settings = useMemo(
    () => ({
      icon: (props: any) => {
        const { name, color, size, direction } = props;
        return (
          <MaterialCommunityIcons
            name={name}
            color={color}
            size={size}
            style={
              direction === "rtl"
                ? { transform: [{ scaleX: -1 }] }
                : undefined
            }
          />
        );
      },
    }),
    []
  );
  return (
    <PaperProvider theme={theme} settings={settings}>
      {children}
    </PaperProvider>
  );
}
