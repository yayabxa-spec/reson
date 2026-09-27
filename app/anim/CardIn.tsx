import React, { memo, useEffect } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
} from 'react-native-reanimated';
import { springs, PERSPECTIVE } from './motion';

type CardInProps = {
  /** 错落入场延迟（毫秒），列表里按 index 递增 */
  delay?: number;
  /** 3D 翻入的起始角度（度），0 关闭翻转只保留上浮 */
  angle?: number;
  /** 起始下沉距离（px） */
  offsetY?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

/**
 * 卡片 3D 入场：带透视的 rotateX 翻平 + 下沉上浮 + 淡入。
 * 用于朋友圈动态卡片、发现页入口卡、资料页分区等。
 * 只动 transform/opacity，不触发重排。
 */
const CardIn = memo((props: CardInProps) => {
  const { delay = 0, angle = 6, offsetY = 18, style, children } = props;
  const progress = useSharedValue(0); // 0 隐藏 → 1 显示

  useEffect(() => {
    progress.value = withDelay(delay, withSpring(1, springs.gentle));
  }, [delay, progress]);

  const animatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: p,
      transform: [
        { perspective: PERSPECTIVE },
        { rotateX: `${(1 - p) * angle}deg` },
        { translateY: (1 - p) * offsetY },
      ],
    };
  }, [angle, offsetY]);

  return (
    <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>
  );
});

export default CardIn;
