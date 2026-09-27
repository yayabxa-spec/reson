import React, { useCallback, type ReactNode } from "react";
import { StyleProp, ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { useFocusEffect } from "expo-router";
import { springs } from "./motion";

/**
 * tab 页切换过渡：每次页面获得焦点时，内容淡入 + 轻微上移（自然衔接，不抢戏）。
 * 包在四个 tab 页根节点上使用。
 */
const TabFadeIn = ({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) => {
  const progress = useSharedValue(0); // 0 刚进入 → 1 落定
  useFocusEffect(
    useCallback(() => {
      progress.value = 0;
      progress.value = withSpring(1, springs.gentle);
    }, [progress])
  );
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.4 + 0.6 * progress.value,
    transform: [{ translateY: (1 - progress.value) * 10 }],
  }));
  return (
    <Animated.View style={[{ flex: 1 }, style, animatedStyle]}>
      {children}
    </Animated.View>
  );
};

export default TabFadeIn;
