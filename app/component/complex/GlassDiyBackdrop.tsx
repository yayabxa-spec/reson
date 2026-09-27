/**
 * v0.61.1-diy：DIY Environment Layer 渲染器（"玻璃后面的世界"）
 *
 * 架构（用户裁决的 DIY 两层原则之 Layer ①）：
 *   放在各 tab 页 PageSource 内部、页面内容之下 → dock 玻璃采样的就是这个
 *   彩色世界本身 → 折射/模糊/色散/镜片参数零改动，颜色来自被折射的内容。
 *   颜色来源 = DIY_THEMES[route].environment（theme/diyTheme.ts），不再写死。
 *
 * 组成：
 *   - 底色：environment.background
 *   - 3 个大型柔光斑（嵌套同心圆近似软边），Reanimated 慢速漂移（UI 线程）
 *
 * 性能：漂移使页面源逐帧重录，量级与列表滚动相同。
 * 关闭：GLASS_DIY_ENABLED=false 或该路由无 environment 配置 → 不渲染任何内容。
 */
import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { resolveDIYTheme } from "../../../theme/diyTheme";

/** 单个柔光斑：同心圆叠出软边（层数=同心圆数量，外层最淡最大；intensity=整体强度） */
function SoftBlob({
  size,
  color,
  intensity = 1,
  layers = 6,
  style,
}: {
  size: number;
  color: string;
  intensity?: number;
  layers?: number;
  style?: any;
}) {
  const rings = useMemo(() => {
    const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    const r = m ? +m[1] : 127, g = m ? +m[2] : 184, b = m ? +m[3] : 255;
    const a = m && m[4] ? +m[4] : 0.5;
    return Array.from({ length: layers }, (_, i) => {
      const inset = (i * size) / (layers * 2.4);
      const layerAlpha = a * intensity * (1 - i / (layers + 0.6));
      return { inset, color: `rgba(${r},${g},${b},${layerAlpha.toFixed(3)})` };
    });
  }, [color, size, intensity, layers]);
  return (
    <View style={[{ position: "absolute", width: size, height: size }, style]}>
      {rings.map((ring, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            top: ring.inset,
            left: ring.inset,
            right: ring.inset,
            bottom: ring.inset,
            borderRadius: 9999,
            backgroundColor: ring.color,
          }}
        />
      ))}
    </View>
  );
}

export const GlassDiyBackdrop = ({ route }: { route: string }) => {
  const env = useMemo(() => resolveDIYTheme(route)?.environment, [route]);
  const opacity = env?.blobOpacity ?? 0.45;

  const drift1 = useAnimatedStyle(() => ({
    transform: [
      { translateX: withRepeat(withSequence(withTiming(46, { duration: 9000, easing: Easing.inOut(Easing.sin) }), withTiming(-38, { duration: 9000, easing: Easing.inOut(Easing.sin) })), -1, true) },
      { translateY: withRepeat(withSequence(withTiming(-30, { duration: 13000, easing: Easing.inOut(Easing.sin) }), withTiming(36, { duration: 13000, easing: Easing.inOut(Easing.sin) })), -1, true) },
    ],
  }));
  const drift2 = useAnimatedStyle(() => ({
    transform: [
      { translateX: withRepeat(withSequence(withTiming(-52, { duration: 11000, easing: Easing.inOut(Easing.sin) }), withTiming(40, { duration: 11000, easing: Easing.inOut(Easing.sin) })), -1, true) },
      { translateY: withRepeat(withSequence(withTiming(42, { duration: 15000, easing: Easing.inOut(Easing.sin) }), withTiming(-34, { duration: 15000, easing: Easing.inOut(Easing.sin) })), -1, true) },
    ],
  }));
  const drift3 = useAnimatedStyle(() => ({
    transform: [
      { translateX: withRepeat(withSequence(withTiming(30, { duration: 14000, easing: Easing.inOut(Easing.sin) }), withTiming(-46, { duration: 14000, easing: Easing.inOut(Easing.sin) })), -1, true) },
      { translateY: withRepeat(withSequence(withTiming(-44, { duration: 10000, easing: Easing.inOut(Easing.sin) }), withTiming(30, { duration: 10000, easing: Easing.inOut(Easing.sin) })), -1, true) },
    ],
  }));

  if (!env) return null;

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: env.background }]}
    >
      <Animated.View style={[{ position: "absolute", top: -60, left: -80 }, drift1]}>
        <SoftBlob size={520} color={env.blob1} intensity={opacity} />
      </Animated.View>
      <Animated.View style={[{ position: "absolute", top: 180, right: -110 }, drift2]}>
        <SoftBlob size={620} color={env.blob2} intensity={opacity} />
      </Animated.View>
      <Animated.View style={[{ position: "absolute", bottom: -140, left: 60 }, drift3]}>
        <SoftBlob size={560} color={env.blob3} intensity={opacity} />
      </Animated.View>
    </View>
  );
};
