import { memo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../../theme/useTheme";
import AddContactsFilled from "../../../../assets/icon/chats/add-contacts-filled.svg";
import Pop from "../../../anim/Pop";

const WECHAT_ITEMS = [
  {
    text: "发起群聊",
    icon: <Ionicons name="people" size={20} color="#fff" />,
  },
  {
    text: "添加朋友",
    icon: <AddContactsFilled style={{ width: 20, height: 20 }} fill="#fff" />,
  },
];

const MATERIAL_ITEMS = [
  { text: "发起群聊", ion: "people" as const },
  { text: "添加朋友", ion: "person-add-outline" as const },
];

/**
 * 主页右上角 + 的下拉菜单：
 * - wechat 皮肤：深色卡片 + 小三角（微信风格）
 * - clean 皮肤：原生安卓 Material 下拉菜单（白色圆角卡片 + 阴影 + 原生图标）
 */
const PlusMenu = memo(
  ({
    visible,
    onClose,
    onSelect,
    top = 4,
  }: {
    visible: boolean;
    onClose: () => void;
    onSelect: (text: string) => void;
    top?: number;
  }) => {
    const { themeColor, skin } = useTheme();
    if (!visible) return null;
    const material = skin.layout.plusMenu === "material";

    if (material) {
      return (
        <View style={StyleSheet.absoluteFill}>
          <Pressable style={styles.backdrop} onPress={onClose} />
          <View style={[styles.materialWrap, { top }]}>
            <Pop visible from="top">
              <View style={styles.materialCard}>
                {MATERIAL_ITEMS.map((item, index) => (
                  <TouchableOpacity
                    key={item.text}
                    activeOpacity={0.6}
                    onPress={() => {
                      onClose();
                      onSelect(item.text);
                    }}
                    style={[
                      styles.materialItem,
                      index > 0 && styles.materialItemBorder,
                    ]}
                  >
                    <Ionicons
                      name={item.ion}
                      size={22}
                      color={themeColor.primary}
                    />
                    <Text style={styles.materialItemText}>{item.text}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Pop>
          </View>
        </View>
      );
    }

    return (
      <View style={StyleSheet.absoluteFill}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.wrap, { top }]}>
          <Pop visible from="top">
            <View style={styles.triangleRow}>
              <View style={styles.triangle} />
            </View>
            <View style={styles.card}>
              {WECHAT_ITEMS.map((item, index) => (
                <TouchableOpacity
                  key={item.text}
                  activeOpacity={0.7}
                  onPress={() => {
                    onClose();
                    onSelect(item.text);
                  }}
                  style={[styles.item, index > 0 && styles.itemBorder]}
                >
                  {item.icon}
                  <Text style={styles.itemText}>{item.text}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Pop>
        </View>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "transparent",
  },
  wrap: {
    position: "absolute",
    top: 0,
    right: 12,
  },
  triangleRow: {
    alignItems: "flex-end",
    marginRight: 23,
    marginBottom: -1,
  },
  triangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 7,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#4b4b4b",
  },
  card: {
    backgroundColor: "#4b4b4b",
    borderRadius: 6,
    overflow: "hidden",
  },
  item: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 138,
  },
  itemBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.15)",
  },
  itemText: {
    fontSize: 15,
    marginLeft: 10,
    color: "#fff",
  },
  materialWrap: {
    position: "absolute",
    top: 0,
    right: 12,
  },
  materialCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    overflow: "hidden",
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    minWidth: 170,
  },
  materialItem: {
    paddingHorizontal: 18,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
  },
  materialItemBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E6EB",
  },
  materialItemText: {
    fontSize: 15,
    marginLeft: 12,
    color: "#1A1A1A",
  },
});

export default PlusMenu;
