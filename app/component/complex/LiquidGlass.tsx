/**
 * 液态玻璃包装层（glass 皮肤专用）
 *
 * - 仅 skinId === "glass" 时渲染玻璃效果；其他皮肤原样渲染普通 View，
 *   保证 wechat/clean 皮肤视觉与交互完全不变。
 * - 降级链：API 33+ → LiquidGlassView（AGSL 折射）；
 *   API 31–32 → expo-blur 磨砂；API <31 或模块加载失败 → 半透明面板。
 * - glass 皮肤的 tint/highlight 参数来自 theme/skins.ts 的 skin.glass。
 */
import React, { useMemo } from "react";
import { Platform, StyleSheet, View, type ViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../../theme/useTheme";

// 懒加载玻璃库：模块缺失/初始化失败时不阻塞 App
let LiquidGlassViewImpl: any = null;
let libLoadAttempted = false;
function loadLiquidGlassLib() {
  if (libLoadAttempted) return LiquidGlassViewImpl;
  libLoadAttempted = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    LiquidGlassViewImpl =
      require("react-native-liquid-glassmorphism").LiquidGlassView;
  } catch {
    LiquidGlassViewImpl = null;
  }
  return LiquidGlassViewImpl;
}

function androidSdkInt(): number {
  return Platform.OS === "android" ? Number(Platform.Version) || 0 : 99;
}

export interface GlassSurfaceProps extends ViewProps {
  /** 普通皮肤下的兜底背景色（可选） */
  fallbackBackgroundColor?: string;
  /** 玻璃变体：regular 磨砂 / clear 通透 */
  variant?: "regular" | "clear";
  /** 库内调校预设（对齐 Kyant0/Backdrop 的材质思路） */
  preset?: "navigationBar" | "floatingTabBar" | "cardOverMedia" | "crystal";
  /** 玻璃圆角（胶囊形传高度一半）；0 = 直角全宽 */
  borderRadius?: number;
  /** 液体体积感（折射/透镜深度缩放，>1 更强） */
  thickness?: number;
  /** 显式模糊半径（dp）：0≈纯折射无模糊；不传用预设默认 */
  blurRadius?: number;
  /** 覆盖皮肤默认 tint（如指示器的黑 7% 表面） */
  tintOverride?: string;
  /** 玻璃后面内容为纯色时折射不可见，可加清晰度底板（0-1）。Backdrop
   * 配方中此值必须很小，否则折射感被雾面压死 */
  legibilityFloor?: number;
  children?: React.ReactNode;
}

/** 通用玻璃表面：非 glass 皮肤 = 普通 View */
export const GlassSurface = ({
  fallbackBackgroundColor,
  variant = "clear",
  preset,
  borderRadius = 0,
  thickness,
  blurRadius,
  tintOverride,
  legibilityFloor,
  style,
  children,
  ...rest
}: GlassSurfaceProps) => {
  const { skinId, skin } = useTheme();
  const isGlass = skinId === "glass";

  const content = useMemo(() => {
    if (!isGlass) {
      return (
        <View style={[style, fallbackBackgroundColor
          ? { backgroundColor: fallbackBackgroundColor }
          : null]} {...rest}>
          {children}
        </View>
      );
    }
    const Lib = loadLiquidGlassLib();
    const sdk = androidSdkInt();
    const tint = tintOverride ?? skin.glass?.tint;
    if (Lib && Platform.OS === "android" && sdk >= 31) {
      // 对齐 Backdrop 官方配方：轻 blur + 边缘透镜折射为主角，
      // tint 只做很薄的表面层；preset 负责厚度/rim 等材质参数
      return (
        <Lib
          preset={preset}
          variant={variant}
          tintColor={tint}
          borderRadius={borderRadius}
          thickness={thickness}
          blurRadius={blurRadius}
          legibilityFloor={legibilityFloor}
          refraction
          style={style}
          {...rest}
        >
          {children}
        </Lib>
      );
    }
    if (Lib && Platform.OS !== "android") {
      // iOS 原生玻璃（当前项目仅构建 Android，留作扩展）
      return (
        <Lib variant={variant} tintColor={tint} borderRadius={borderRadius} style={style} {...rest}>
          {children}
        </Lib>
      );
    }
    // 降级：expo-blur 磨砂 → 半透明面板
    if (Platform.OS === "android" && sdk >= 31) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { BlurView } = require("expo-blur");
        return (
          // Android 上需启用实验性 BlurView 才有真实模糊，否则只是半透明
          <BlurView
            intensity={50}
            tint="light"
            experimentalBlurMethod="dimezisBlurView"
            style={style}
            {...rest}
          >
            {children}
          </BlurView>
        );
      } catch {}
    }
    return (
      <View
        style={[
          style,
          {
            backgroundColor: fallbackBackgroundColor || "rgba(255,255,255,0.72)",
            borderColor: "rgba(255,255,255,0.5)",
            borderWidth: StyleSheet.hairlineWidth,
          },
        ]}
        {...rest}
      >
        {children}
      </View>
    );
  }, [isGlass, skin.glass?.tint, tintOverride, variant, preset, borderRadius, thickness, blurRadius, legibilityFloor, style, children, fallbackBackgroundColor]);

  return content;
};

/** 底部 Tab 栏玻璃背景（配合 tabBarBackground 使用，absolute 填充胶囊） */
export const GlassTabBarBackground = ({ borderRadius = 0 }: { borderRadius?: number }) => {
  const { skin } = useTheme();
  return (
    <GlassSurface
      fallbackBackgroundColor="rgba(250, 250, 250, 0.82)"
      preset="floatingTabBar"
      variant="clear"
      borderRadius={borderRadius}
      thickness={2.4}
      legibilityFloor={0.08}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      {/* 边缘高光线，模拟玻璃受光（Catalog 的 Highlight/rim 近似） */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: borderRadius > 0 ? 24 : 0,
          right: borderRadius > 0 ? 24 : 0,
          height: StyleSheet.hairlineWidth,
          borderRadius: StyleSheet.hairlineWidth,
          backgroundColor: skin.glass?.highlight || "rgba(255,255,255,0.55)",
        }}
      />
    </GlassSurface>
  );
};

/** 聊天输入栏玻璃容器（悬浮胶囊条，对齐 Catalog 的悬浮玻璃样式） */
export const GlassInputBar = ({ children }: { children: React.ReactNode }) => {
  const { skin } = useTheme();
  return (
    <GlassSurface
      fallbackBackgroundColor="rgba(250, 250, 250, 0.86)"
      preset="floatingTabBar"
      variant="clear"
      borderRadius={24}
      thickness={2}
      legibilityFloor={0.12}
      style={{
        marginHorizontal: 8,
        marginBottom: 6,
        borderRadius: 24,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          position: "absolute",
          top: 2,
          left: 24,
          right: 24,
          height: StyleSheet.hairlineWidth,
          borderRadius: StyleSheet.hairlineWidth,
          backgroundColor: skin.glass?.highlight || "rgba(255,255,255,0.55)",
        }}
      />
      {children}
    </GlassSurface>
  );
};

/** glass 皮肤下内容需避开悬浮胶囊 dock 的底部 padding；其他皮肤返回 0 */
export function useGlassDockPadding(): number {
  const { skinId } = useTheme();
  const insets = useSafeAreaInsets();
  if (skinId !== "glass") return 0;
  // dock 高 64 + 距屏底 22 + 安全区 + 余量
  return 92 + insets.bottom;
}

/** glass 皮肤下内容需避开透明 Header 的顶部 padding；其他皮肤返回 0。
 * Header 玻璃已按需求移除（恢复原生 Header），恒返回 0 */
export function useGlassHeaderPadding(): number {
  return 0;
}
