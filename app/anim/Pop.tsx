import React, { memo, useEffect, useState } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { springs } from './motion';

/** 入场方向：浮层从哪个方向"弹进来"（对应触发点所在方向） */
export type PopFrom = 'center' | 'top' | 'bottom' | 'left' | 'right';

/** 各方向隐藏时的初始偏移（px） */
const FROM_OFFSET: Record<PopFrom, { x: number; y: number }> = {
  center: { x: 0, y: 6 },
  top: { x: 0, y: -10 },
  bottom: { x: 0, y: 10 },
  left: { x: -10, y: 0 },
  right: { x: 10, y: 0 },
};

type PopProps = {
  /** false 时播退出动画并卸载；true 时从初始状态弹入 */
  visible: boolean;
  from?: PopFrom;
  /** 弹入初始缩放 */
  fromScale?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

/**
 * 浮层弹出动画：scale + 方向位移 + 淡入的 spring 弹出，关闭时反向缩小淡出后卸载。
 * 用于长按菜单、右上角 + 菜单等"从触发点长出来"的浮层。
 * 用法：父组件保持挂载 <Pop visible={menuVisible}>...</Pop>，不要自己 return null。
 */
const Pop = memo((props: PopProps) => {
  const { visible, from = 'center', fromScale = 0.85, style, children } = props;
  const progress = useSharedValue(visible ? 1 : 0); // 0 隐藏 → 1 显示
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.value = withSpring(1, springs.gentle);
    } else {
      progress.value = withTiming(0, { duration: 140 }, (finished) => {
        if (finished) runOnJS(setMounted)(false);
      });
    }
  }, [visible, progress]);

  const animatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const off = FROM_OFFSET[from];
    return {
      opacity: p,
      transform: [
        { translateX: (1 - p) * off.x },
        { translateY: (1 - p) * off.y },
        { scale: fromScale + (1 - fromScale) * p },
      ],
    };
  }, [from, fromScale]);

  if (!mounted) return null;
  return (
    <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>
  );
});

export default Pop;
