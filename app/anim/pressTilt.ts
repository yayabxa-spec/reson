import { useCallback } from "react";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { springs, durations, PERSPECTIVE } from "./motion";

/**
 * 气泡按压 3D 倾斜驱动：按下时轻微绕 Y 轴翻转 + 缩小，松手 spring 回正。
 * tiltDeg 带方向：左气泡传正值（向右倾），右气泡传负值（向左倾），
 * 视觉上像气泡被手指"按"得微微翘起，配合长按弹出菜单更跟手。
 */
export function usePressTilt(scaleTo = 0.97, tiltDeg = 5) {
  const pressed = useSharedValue(0); // 0 未按下 → 1 按下
  const style = useAnimatedStyle(
    () => ({
      transform: [
        { perspective: PERSPECTIVE },
        { rotateY: `${pressed.value * tiltDeg}deg` },
        { scale: 1 + pressed.value * (scaleTo - 1) },
      ],
    }),
    [tiltDeg, scaleTo]
  );
  const onPressIn = useCallback(() => {
    pressed.value = withTiming(1, { duration: durations.fast });
  }, [pressed]);
  const onPressOut = useCallback(() => {
    pressed.value = withSpring(0, springs.snappy);
  }, [pressed]);
  return { style, onPressIn, onPressOut };
}
