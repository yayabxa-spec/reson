/**
 * 原生 backdrop 组件（Android 专属，Kotlin 实现在
 * android/app/src/main/java/com/reson/chat/backdrop/）：
 * - BackdropSource：把 RN 子视图录制为命名背景层（声明式离屏图层）
 * - GlassEffect：按 sources 引用合成背景层并套用
 *   vibrancy ⇒ blur ⇒ lens(AGSL 折射/色散) 效果链（Kyant0/Backdrop 管线移植）
 * 非 Android 平台渲染普通 View 兜底。
 */
import React from "react";
import { Platform, requireNativeComponent, View } from "react-native";

/** rgba()/#RGB/#RRGGBB → Color.parseColor 兼容的 #AARRGGBB */
export function toArgb(color?: string): string | undefined {
  if (!color) return undefined;
  const c = color.trim();
  const rgba = c.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/
  );
  if (rgba) {
    const r = Number(rgba[1]).toString(16).padStart(2, "0");
    const g = Number(rgba[2]).toString(16).padStart(2, "0");
    const b = Number(rgba[3]).toString(16).padStart(2, "0");
    const a = Math.round((rgba[4] ? Number(rgba[4]) : 1) * 255)
      .toString(16)
      .padStart(2, "0");
    return `#${a}${r}${g}${b}`.toUpperCase();
  }
  if (c.startsWith("#")) {
    if (c.length === 4) {
      const r = c[1], g = c[2], b = c[3];
      return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
    }
    if (c.length === 7) return `#FF${c.slice(1)}`.toUpperCase();
    if (c.length === 9) return c.toUpperCase();
  }
  return c;
}

export interface BackdropSourceProps {
  sourceId: string;
  active?: boolean;
  /** true = 内容只录制进背景层、不上屏（等价源码 alpha(0f)+layerBackdrop 隐藏层） */
  captureOnly?: boolean;
  /** v0.60.12：标准 Android 无障碍 prop 透传（隐藏副本用 no-hide-descendants，
   *  等价官方 Row#2 clearAndSetSemantics{}）；经 ...rest 转发到原生视图 */
  importantForAccessibility?: string;
  style?: any;
  children?: React.ReactNode;
  pointerEvents?: "auto" | "none" | "box-none" | "box-only";
}

export interface GlassEffectProps {
  /** 引用的背景层 id 列表（等价 combinedBackdrop） */
  sources: string[];
  cornerRadius?: number;
  blurRadius?: number;
  /** lens(高度, 数量)——单位 dp，与源码 lens(refractionHeight, refractionAmount) 对应 */
  lensHeight?: number;
  lensAmount?: number;
  chromatic?: boolean;
  vibrancy?: boolean;
  /** true = 折射恒开（dock 的 lens(24dp,24dp) 恒定）；false = 随 pressed 进度淡入 */
  lensAlwaysOn?: boolean;
  pressed?: boolean;
  surfaceColor?: string;
  pressedSurfaceColor?: string;
  /**
   * v0.60.6：官方 drawBackdrop 的三个修饰层（逐字参数，无自由度）：
   * - highlight: Highlight.Default（0.5dp stroke + DefaultHighlightShader，blend=Plus）
   * - shadow: Shadow.Default（radius 24dp / offset (0,4dp) / Black 10%）
   * - innerShadow: InnerShadow（radius=8dp×progress / offset (0,radius) / Black 15%）
   * alpha：lensAlwaysOn=true（dock）恒 1（官方默认参数）；否则 = pressProgress（官方 copy(alpha=progress)）
   */
  highlight?: boolean;
  shadow?: boolean;
  innerShadow?: boolean;
  /** v0.60.8：官方 catalog/utils/InteractiveHighlight（LiquidBottomTabs）：
   *  surface 之上的白 8%×progress 全场提亮 + AGSL 径向光斑（位置=胶囊中心+panelOffset） */
  interactiveHighlight?: boolean;
  /** 手势活跃信号（onStart true / endDrag false，抬起瞬间回弹 spring 0.5/300） */
  highlightPressed?: boolean;
  /** 本视图作为位置锚点暴露给其他 GlassEffect（镜片 → effectId="lens"） */
  effectId?: string;
  /** 读取的锚点 id（dock / Row#2 玻璃 → "lens"） */
  highlightAnchor?: string;
  /** 官方 (value+0.5)×tabW 与 cx 的差 = INNER_PAD(4dp) */
  highlightAnchorInset?: number;
  style?: any;
  children?: React.ReactNode;
  pointerEvents?: "auto" | "none" | "box-none" | "box-only";
}

const isAndroid = Platform.OS === "android" && Platform.Version >= 29;

const NativeSource = isAndroid
  ? (requireNativeComponent("BackdropSourceView") as any)
  : null;

const NativeEffect = isAndroid
  ? (requireNativeComponent("GlassEffectView") as any)
  : null;

export const BackdropSource = (props: BackdropSourceProps) => {
  const { sourceId, active, captureOnly, style, children, pointerEvents, ...rest } = props;
  if (!NativeSource) {
    return (
      <View style={style} pointerEvents={pointerEvents}>
        {children}
      </View>
    );
  }
  return (
    <NativeSource
      sourceId={sourceId}
      active={active ? true : false}
      captureOnly={captureOnly ? true : false}
      style={style}
      pointerEvents={pointerEvents}
      {...rest}
    >
      {children}
    </NativeSource>
  );
};

/** 页面背景源包装：enabled=false 时不产生任何额外节点（clean/wechat 皮肤零开销） */
export const PageSource = ({
  enabled,
  sourceId,
  active,
  style,
  children,
}: {
  enabled: boolean;
  sourceId: string;
  active?: boolean;
  style?: any;
  children: React.ReactNode;
}) => {
  if (!enabled) return <>{children}</>;
  return (
    <BackdropSource sourceId={sourceId} active={active} style={style ?? { flex: 1 }}>
      {children}
    </BackdropSource>
  );
};

export const GlassEffect = (props: GlassEffectProps) => {
  const {
    sources,
    cornerRadius = 0,
    blurRadius = 0,
    lensHeight = 0,
    lensAmount = 0,
    chromatic = false,
    vibrancy = false,
    lensAlwaysOn = false,
    pressed = false,
    surfaceColor,
    pressedSurfaceColor,
    highlight = false,
    shadow = false,
    innerShadow = false,
    interactiveHighlight = false,
    highlightPressed = false,
    effectId,
    highlightAnchor,
    highlightAnchorInset,
    style,
    children,
    pointerEvents,
    ...rest
  } = props;
  if (!NativeEffect) {
    return (
      <View style={style} pointerEvents={pointerEvents}>
        {children}
      </View>
    );
  }
  return (
    <NativeEffect
      sources={sources}
      cornerRadius={cornerRadius}
      blurRadius={blurRadius}
      lensHeight={lensHeight}
      lensAmount={lensAmount}
      chromatic={chromatic}
      vibrancy={vibrancy}
      lensAlwaysOn={lensAlwaysOn}
      pressed={pressed}
      surfaceColor={toArgb(surfaceColor)}
      pressedSurfaceColor={toArgb(pressedSurfaceColor)}
      highlight={highlight}
      shadow={shadow}
      innerShadow={innerShadow}
      interactiveHighlight={interactiveHighlight}
      highlightPressed={highlightPressed}
      effectId={effectId}
      highlightAnchor={highlightAnchor}
      highlightAnchorInset={highlightAnchorInset}
      style={style}
      pointerEvents={pointerEvents}
      {...rest}
    >
      {children}
    </NativeEffect>
  );
};
