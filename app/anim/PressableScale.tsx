import React, { memo, useCallback } from 'react';
import {
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { springs, durations } from './motion';
import { hapticLight } from '../utils/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * 给已有触摸组件做按压缩放驱动（无法替换组件时用）：
 * 拿到 style 挂到内层 Animated.View，onPressIn/onPressOut 接到现有组件上。
 */
export function usePressScaleDriver(scaleTo: number = 0.97) {
  const pressed = useSharedValue(0); // 0 未按下 → 1 按下
  const style = useAnimatedStyle(
    () => ({
      transform: [{ scale: 1 + pressed.value * (scaleTo - 1) }],
    }),
    [scaleTo]
  );
  const onPressIn = useCallback(() => {
    pressed.value = withTiming(1, { duration: durations.fast });
  }, []);
  const onPressOut = useCallback(() => {
    pressed.value = withSpring(0, springs.snappy);
  }, []);
  return { style, onPressIn, onPressOut };
}

type PressableScaleProps = Omit<PressableProps, 'style'> & {
  /** 按下缩到的比例，默认 0.97（列表行可用 0.98） */
  scaleTo?: number;
  /** 触发 onPress 时是否轻触觉（放在确认触发而非按下，滑开误触不震） */
  haptic?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * 弹性按压组件：按下轻微缩小、松手 spring 回弹。
 * 用于 tab 图标、列表行、朋友圈按钮等需要"物理手感"的地方。
 */
const PressableScale = memo((props: PressableScaleProps) => {
  const {
    scaleTo = 0.97,
    haptic = false,
    onPress,
    onPressIn,
    onPressOut,
    style,
    children,
    ...rest
  } = props;
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(
    () => ({
      transform: [{ scale: 1 + pressed.value * (scaleTo - 1) }],
    }),
    [scaleTo]
  );

  const handlePressIn = useCallback(
    (e: Parameters<NonNullable<PressableProps['onPressIn']>>[0]) => {
      pressed.value = withTiming(1, { duration: durations.fast });
      onPressIn?.(e);
    },
    [onPressIn]
  );
  const handlePressOut = useCallback(
    (e: Parameters<NonNullable<PressableProps['onPressOut']>>[0]) => {
      pressed.value = withSpring(0, springs.snappy);
      onPressOut?.(e);
    },
    [onPressOut]
  );
  const handlePress = useCallback(
    (e: Parameters<NonNullable<PressableProps['onPress']>>[0]) => {
      if (haptic) hapticLight();
      onPress?.(e);
    },
    [haptic, onPress]
  );

  return (
    <AnimatedPressable
      {...rest}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
});

export default PressableScale;
