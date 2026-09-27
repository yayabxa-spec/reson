import { StyleSheet } from "react-native";

export const createStyle = (theme: DiceUI.Theme) => {
  return StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.overlay_background_color,
    },
    container: {
      // 用 flex 全屏而非 absoluteFillObject：
      // 升级后 Animated.View 在 Modal 内绝对定位失效，会导致弹窗跑到屏幕顶部
      flex: 1,
      width: "100%",
      height: "100%",
      alignItems: "center",
      justifyContent: "center",
    },
  });
};
