import React, { memo, useState, forwardRef, useCallback, useMemo } from 'react';
import { Pressable, GestureResponderEvent, ViewStyle, StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import throttle from 'lodash-es/throttle';
import { springs } from '../../../anim/motion';
import type { TouchableOpacityProps } from './type';

// 底库统一的按压缩放比例：2%，克制不夸张
const PRESS_SCALE_TO = 0.98;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const TouchableOpacity = forwardRef<View, TouchableOpacityProps>((props, ref) => {
  const {
    onPress,
    onPressIn,
    onPressOut,
    throttleTime = 0,
    throttleOptions = { leading: true, trailing: false },
    backgroundColor,
    activeBackgroundColor,
    style,
    activeOpacity = 1,
    noScale = false,
    ...rest
  } = props;
  const [active, setActive] = useState<boolean>(false);
  const pressed = useSharedValue(0); // 0 未按下 → 1 按下

  const handlePress = useCallback(
    throttle((e: GestureResponderEvent) => onPress?.(e), throttleTime, throttleOptions),
    []
  );
  const handlePressIn = useCallback((event: GestureResponderEvent) => {
    setActive(true);
    if (!noScale) pressed.value = withTiming(1, { duration: 100 });
    onPressIn?.(event);
  }, [noScale, pressed]);
  const handlePressOut = useCallback((event: GestureResponderEvent) => {
    setActive(false);
    if (!noScale) pressed.value = withSpring(0, springs.snappy);
    onPressOut?.(event);
  }, [noScale, pressed]);

  const backgroundStyle = useMemo<ViewStyle>(() => {
    if (active && activeBackgroundColor) {
      return { opacity: activeOpacity, backgroundColor: activeBackgroundColor };
    }

    if (active) {
      return { opacity: activeOpacity };
    }

    if (backgroundColor) {
      return { backgroundColor };
    }

    return {};
  }, [active, backgroundColor, activeBackgroundColor]);

  const scaleStyle = useAnimatedStyle(() => {
    if (noScale) return {};
    return { transform: [{ scale: 1 - pressed.value * (1 - PRESS_SCALE_TO) }] };
  }, [noScale]);

  return (
    <AnimatedPressable
      {...rest}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      ref={ref}
      style={[style, backgroundStyle, scaleStyle]}
    />
  );
});

TouchableOpacity.displayName = 'TouchableOpacity';

export default memo(TouchableOpacity);
