import React, { useCallback, useState, type ReactNode } from "react";
import { Dimensions, RefreshControl, RefreshControlProps, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import {
  Canvas,
  Circle,
  Group,
  ImageFilter,
  RoundedRect,
  Skia,
  TileMode,
} from "@shopify/react-native-skia";
import { springs } from "./motion";

/**
 * 液态下拉刷新（v2 · 原生 RefreshControl 方案）：
 * - 下拉手势交给系统原生 RefreshControl（100% 可靠，不再与列表滚动手势仲裁搏斗）
 * - 液面 + 液滴（Skia 元球）在"刷新中"阶段播放：松手后液面垂下、液滴绕环旋转，完成后收起
 * - 原生小圈用主题色着色，与液态动画同色不违和
 *
 * 用法（render prop，把 refreshControl 挂到列表上）：
 *   <LiquidRefresh onRefresh={reload} color={themeColor.primary}>
 *     {(refreshControl) => <FlatList refreshControl={refreshControl} ... />}
 *   </LiquidRefresh>
 */

const SCREEN_W = Dimensions.get("window").width;
const SHEET_MAX = 54;
const DROP_R = 8;
/** 元球融合滤镜：先模糊再用 alpha 对比度把边缘"粘"起来 */
const GOOEY_FILTER = Skia.ImageFilter.MakeCompose(
  Skia.ImageFilter.MakeBlur(7, 7, TileMode.Decal, null),
  Skia.ImageFilter.MakeColorFilter(
    Skia.ColorFilter.MakeMatrix([
      1, 0, 0, 0, 0,
      0, 1, 0, 0, 0,
      0, 0, 1, 0, 0,
      0, 0, 0, 24, -12,
    ]),
    null
  )
);

type LiquidRefreshProps = {
  onRefresh?: () => Promise<void> | void;
  /** 液体颜色（建议传主题色） */
  color?: string;
  style?: StyleProp<ViewStyle>;
  children: (refreshControl: React.ReactElement<RefreshControlProps>) => ReactNode;
};

const LiquidRefresh = ({
  onRefresh,
  color = "#576B95",
  style,
  children,
}: LiquidRefreshProps) => {
  const [pullToRefresh, setPullToRefresh] = useState(false);
  const refreshing = useSharedValue(0);
  const phase = useSharedValue(0);

  const runRefresh = useCallback(() => {
    Promise.resolve(onRefresh?.())
      .catch(() => {})
      .finally(() => {
        setPullToRefresh(false);
        cancelAnimation(phase);
        refreshing.value = withTiming(0, { duration: 220 });
      });
  }, [onRefresh, refreshing, phase]);

  const onNativeRefresh = useCallback(() => {
    setPullToRefresh(true);
    cancelAnimation(phase);
    refreshing.value = 1;
    phase.value = 0;
    phase.value = withRepeat(
      withTiming(Math.PI * 2, { duration: 1200 }),
      -1,
      false
    );
    runRefresh();
  }, [runRefresh, refreshing, phase]);

  // 液面：刷新中垂到满格；结束回弹收起
  const sheetH = useDerivedValue(() =>
    refreshing.value === 1
      ? 4 + SHEET_MAX
      : withSpring(4, springs.gentle)
  );
  const rectH = useDerivedValue(() => sheetH.value + 20);
  // 液滴：刷新时绕环旋转
  const dropX = useDerivedValue(() =>
    refreshing.value === 1 ? Math.sin(phase.value) * 30 : 0
  );
  const dropY = useDerivedValue(() => {
    if (refreshing.value === 1) return sheetH.value + 24 + Math.cos(phase.value) * 10;
    return withSpring(sheetH.value + 14, springs.gentle);
  });
  const dropR = useDerivedValue(() =>
    refreshing.value === 1 ? DROP_R : withSpring(0, springs.snappy)
  );
  // 整层可见度：未刷新时完全透明
  const layerOpacity = useDerivedValue(() =>
    refreshing.value === 1 ? withTiming(1, { duration: 180 }) : withTiming(0, { duration: 220 })
  );
  const dropCX = useDerivedValue(() => SCREEN_W / 2 + dropX.value);

  const refreshControl = (
    <RefreshControl
      refreshing={pullToRefresh}
      onRefresh={onNativeRefresh}
      tintColor={color}
      colors={[color]}
      progressBackgroundColor="#ffffff"
      progressViewOffset={0}
    />
  );

  return (
    <View style={[{ flex: 1 }, style]}>
      {/* 液态指示层：只在刷新中可见；盖在列表上方，从屏幕顶端垂下来 */}
      <Canvas pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 10 }]}>
        <Group opacity={layerOpacity}>
          <ImageFilter filter={GOOEY_FILTER}>
            <RoundedRect
              x={-20}
              y={-24}
              width={SCREEN_W + 40}
              height={rectH}
              r={14}
              color={color}
            />
            <Circle cx={SCREEN_W / 2} cy={sheetH} r={12} color={color} />
            <Circle cx={dropCX} cy={dropY} r={dropR} color={color} />
          </ImageFilter>
        </Group>
      </Canvas>
      {children(refreshControl)}
    </View>
  );
};

export default LiquidRefresh;
