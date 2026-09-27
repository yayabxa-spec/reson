/**
 * 玻璃滑块（glass 皮肤专用）
 *
 * 复刻 Backdrop Catalog 的 GlassSlider 教程：
 * - 细圆角轨道（强调色）
 * - 悬浮玻璃拇指（胶囊），Pan 拖动，折射轨道与背后内容
 * - 受控 value（0..1），拖动结束回传 onChange
 */
import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { GlassSurface } from "./LiquidGlass";

const TRACK_H = 6;
const THUMB_W = 56;
const THUMB_H = 32;

const clamp = (v: number, lo: number, hi: number) => {
  "worklet";
  return v < lo ? lo : v > hi ? hi : v;
};

export const GlassSlider = ({
  value,
  onChange,
  accent,
}: {
  /** 0..1 受控值 */
  value: number;
  /** 拖动结束时回传 0..1 */
  onChange: (v: number) => void;
  /** 轨道颜色 */
  accent: string;
}) => {
  const [trackW, setTrackW] = useState(0);
  const tx = useSharedValue(0);
  const dragging = useSharedValue(false);
  // 玻璃双档：静止毛玻璃（磨砂）/ 拖拽折射（state 驱动原生 props）
  const [isDragging, setIsDragging] = useState(false);

  const maxTx = Math.max(0, trackW - THUMB_W);

  useEffect(() => {
    tx.value = withSpring(clamp(value, 0, 1) * maxTx, { damping: 18 });
  }, [value, maxTx, tx]);

  const onChangeJS = (v: number) => onChange(v);
  const setDraggingJS = (v: boolean) => setIsDragging(v);

  const startTx = useSharedValue(0);
  const pan = Gesture.Pan()
    .onStart(() => {
      startTx.value = tx.value;
      dragging.value = true;
      runOnJS(setDraggingJS)(true);
    })
    .onUpdate((e) => {
      tx.value = clamp(startTx.value + e.translationX, 0, maxTx);
    })
    .onEnd(() => {
      dragging.value = false;
      const v = maxTx > 0 ? tx.value / maxTx : 0;
      runOnJS(setDraggingJS)(false);
      runOnJS(onChangeJS)(v);
    });

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { scale: withSpring(dragging.value ? 1.08 : 1, { damping: 18 }) },
    ],
  }));

  // 拖拽自发光光斑
  const glowStyle = useAnimatedStyle(() => ({
    opacity: withTiming(dragging.value ? 1 : 0, { duration: 200 }),
  }));

  return (
    <View
      style={{
        height: THUMB_H,
        justifyContent: "center",
      }}
      onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
    >
      {/* 轨道 */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          height: TRACK_H,
          borderRadius: TRACK_H / 2,
          backgroundColor: accent,
          opacity: 0.9,
        }}
      />
      {/* 玻璃拇指：静止毛玻璃磨砂（显式大模糊半径）/ 拖拽切换为纯折射液态玻璃 */}
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            {
              position: "absolute",
              left: 0,
              width: THUMB_W,
              height: THUMB_H,
            },
            thumbStyle,
          ]}
        >
          <View
            pointerEvents="none"
            style={{
              ...StyleSheet.absoluteFill,
              borderRadius: THUMB_H / 2,
              overflow: "hidden",
            }}
          >
            <GlassSurface
              fallbackBackgroundColor="rgba(250, 250, 250, 0.7)"
              preset="floatingTabBar"
              variant={isDragging ? "clear" : "regular"}
              borderRadius={THUMB_H / 2}
              thickness={isDragging ? 2.5 : 0.5}
              blurRadius={isDragging ? 0.01 : 14}
              legibilityFloor={0}
              style={StyleSheet.absoluteFill}
            />
            {/* 拖拽自发光光斑（拇指中心） */}
            <Animated.View
              pointerEvents="none"
              style={[
                {
                  position: "absolute",
                  top: THUMB_H / 2 - 45,
                  left: THUMB_W / 2 - 45,
                  width: 90,
                  height: 90,
                  borderRadius: 45,
                  backgroundColor: "rgba(255, 255, 255, 0.5)",
                },
                glowStyle,
              ]}
            />
          </View>
          {/* 受光边缘 */}
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 1.5,
              left: 12,
              right: 12,
              height: StyleSheet.hairlineWidth,
              borderRadius: StyleSheet.hairlineWidth,
              backgroundColor: "rgba(255,255,255,0.6)",
            }}
          />
        </Animated.View>
      </GestureDetector>
    </View>
  );
};
