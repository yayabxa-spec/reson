import { memo, useEffect, useRef } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../../theme/useTheme";

/**
 * 双风格开关：
 * - wechat 皮肤：微信风格（绿色轨道 + 白色滑块）
 * - clean 皮肤：参考原生样式 —— 开启=主色轨道+白色滑块带对勾，
 *   关闭=浅灰轨道带描边+灰色滑块带叉号
 */
const WeChatSwitch = memo(
  ({
    value,
    onValueChange,
    disabled = false,
    style,
  }: {
    value: boolean;
    onValueChange: (v: boolean) => void;
    disabled?: boolean;
    style?: ViewStyle;
  }) => {
    const { themeColor, skin } = useTheme();
    const anim = useRef(new Animated.Value(value ? 1 : 0)).current;
    const material = skin.layout.switchControl === "material";

    useEffect(() => {
      Animated.timing(anim, {
        toValue: value ? 1 : 0,
        duration: 160,
        useNativeDriver: false,
      }).start();
    }, [value, anim]);

    const translateX = anim.interpolate({
      inputRange: [0, 1],
      // 轨道 52 - 左右边框 2 - 左右内边距 2 = 可用 48，滑块 26 → 最大行程 22
      outputRange: material ? [0, 22] : [0, 21],
    });
    const trackColor = anim.interpolate({
      inputRange: [0, 1],
      outputRange: material
        ? [themeColor.surfaceContainerHighest, themeColor.primary]
        : ["#E6E6E6", themeColor.primary],
    });
    const trackBorder = anim.interpolate({
      inputRange: [0, 1],
      outputRange: material
        ? [themeColor.outline, themeColor.primary]
        : ["transparent", "transparent"],
    });
    const thumbBg = anim.interpolate({
      inputRange: [0, 1],
      outputRange: material
        ? [themeColor.outline, "#FFFFFF"]
        : ["#FFFFFF", "#FFFFFF"],
    });

    return (
      <Pressable
        disabled={disabled}
        onPress={() => onValueChange(!value)}
        style={[styles.wrap, style]}
      >
        <Animated.View
          style={[
            styles.track,
            { backgroundColor: trackColor, borderColor: trackBorder },
            material && styles.trackMaterial,
            disabled && styles.trackDisabled,
          ]}
        >
          <Animated.View
            style={[
              styles.thumb,
              material && styles.thumbMaterial,
              { backgroundColor: thumbBg, transform: [{ translateX }] },
            ]}
          >
            {material ? (
              value ? (
                <Ionicons
                  name="checkmark"
                  size={16}
                  color={themeColor.primary}
                />
              ) : (
                <Ionicons name="close" size={14} color="#FFFFFF" />
              )
            ) : null}
          </Animated.View>
        </Animated.View>
      </Pressable>
    );
  }
);

const styles = StyleSheet.create({
  wrap: {
    padding: 0,
  },
  track: {
    width: 52,
    height: 31,
    borderRadius: 15.5,
    justifyContent: "center",
    paddingHorizontal: 2,
    borderWidth: 0,
  },
  trackMaterial: {
    width: 52,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 1,
  },
  trackDisabled: {
    opacity: 0.5,
  },
  thumb: {
    width: 27,
    height: 27,
    borderRadius: 13.5,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  thumbMaterial: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 0,
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});

export default WeChatSwitch;
