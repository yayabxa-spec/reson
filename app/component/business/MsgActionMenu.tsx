import { useState } from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTheme } from "../../../theme/useTheme";
import Pop from "../../anim/Pop";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const ITEM_HEIGHT = 46;
const MENU_PADDING = 8;

export interface MsgMenuOption {
  text: string;
  onPress: () => void;
}

/**
 * M3 风格长按消息菜单：浅色表面圆角浮层（带阴影/分割线），出现在长按位置附近。
 */
export default function MsgActionMenu({
  visible,
  x,
  y,
  options,
  onClose,
}: {
  visible: boolean;
  x: number;
  y: number;
  options: MsgMenuOption[];
  onClose: () => void;
}) {
  const [measuredW, setMeasuredW] = useState(132);
  const [measuredH, setMeasuredH] = useState(
    options.length * ITEM_HEIGHT + MENU_PADDING
  );
  const { themeColor } = useTheme();

  const menuW = measuredW;
  const menuH = measuredH;
  let left = x + 10;
  if (left + menuW > SCREEN_W - 8) left = x - menuW - 10;
  left = Math.max(8, Math.min(left, SCREEN_W - menuW - 8));
  let top = y + 10;
  if (top + menuH > SCREEN_H - 8) top = y - menuH - 10;
  top = Math.max(8, Math.min(top, SCREEN_H - menuH - 8));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={{ flex: 1 }} onPress={onClose}>
        <Pop
          visible
          from="center"
          style={{
            position: "absolute",
            left,
            top,
          }}
        >
          <View
            onLayout={(e) => {
              setMeasuredW(e.nativeEvent.layout.width);
              setMeasuredH(e.nativeEvent.layout.height);
            }}
            style={{
              backgroundColor: themeColor.surfaceContainerLowest,
              borderRadius: 12,
              paddingVertical: 4,
              minWidth: 132,
              elevation: 6,
              shadowColor: "#000",
              shadowOpacity: 0.18,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: themeColor.outlineVariant + "88",
            }}
          >
          {options.map((o, i) => (
            <Pressable
              key={o.text}
              onPress={() => {
                onClose();
                o.onPress();
              }}
              style={[
                styles.item,
                i > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: themeColor.outlineVariant + "99",
                },
              ]}
            >
              <Text
                style={{
                  color: themeColor.onSurface,
                  fontSize: 15,
                  fontWeight: "500",
                }}
              >
                {o.text}
              </Text>
            </Pressable>
          ))}
          </View>
        </Pop>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  item: {
    paddingHorizontal: 18,
    height: ITEM_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
});
