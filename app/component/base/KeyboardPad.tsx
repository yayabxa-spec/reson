import { useEffect, useState } from "react";
import { Keyboard, Platform, View } from "react-native";
import type { ReactNode } from "react";

/**
 * 全局键盘避让：Android 15+ 全屏（edge-to-edge）下 adjustResize 失效，
 * 这里监听键盘事件给根容器加底部 padding，保证底部输入框自动升到键盘上方。
 */
export default function KeyboardPad({ children }: { children: ReactNode }) {
  const [pad, setPad] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const show = Keyboard.addListener("keyboardDidShow", (e) => {
      setPad(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => setPad(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return (
    <View style={{ flex: 1, paddingBottom: pad }}>{children}</View>
  );
}
