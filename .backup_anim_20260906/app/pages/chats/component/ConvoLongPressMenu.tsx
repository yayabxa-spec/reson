import { useEffect, useState } from "react";
import {
  Dimensions,
  Modal,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useTheme } from "../../../../theme/useTheme";
import {
  deleteConversation,
  hideConversation,
  setConversationPinned,
} from "../../../store/localChat";
import { markConversationUnread } from "../../../store/unread";
import Toast from "../../../component/base/Toast";

const DIALOG_WIDTH = Math.round(Dimensions.get("window").width * 0.85);

const ConvoLongPressMenu = ({
  item,
  onClose,
}: {
  item: any | null;
  onClose: () => void;
}) => {
  const { themeColor } = useTheme();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [count, setCount] = useState(5);

  useEffect(() => {
    if (!confirmOpen) return;
    setCount(5);
    const timer = setInterval(() => {
      setCount((c) => {
        if (c <= 1) {
          clearInterval(timer);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [confirmOpen]);

  if (!item) return null;

  const MenuRow = ({
    label,
    onPress,
    last,
  }: {
    label: string;
    onPress: () => void;
    last?: boolean;
  }) => (
    <TouchableOpacity
      onPress={onPress}
      style={{
        height: 46,
        paddingHorizontal: 18,
        justifyContent: "center",
        backgroundColor: "#fff",
      }}
    >
      <Text style={{ fontSize: 16, color: "#1A1A1A" }}>{label}</Text>
      {!last && (
        <View
          style={{
            position: "absolute",
            left: 18,
            right: 0,
            bottom: 0,
            height: 0.5,
            backgroundColor: "#E5E6EB",
          }}
        />
      )}
    </TouchableOpacity>
  );

  return (
    <>
      <Modal transparent animationType="fade" onRequestClose={onClose}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={onClose}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          />
          <View
            style={{
              position: "absolute",
              top: 150,
              right: 12,
              borderRadius: 8,
              overflow: "hidden",
              backgroundColor: "#fff",
              shadowColor: "#000",
              shadowOpacity: 0.2,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 },
              elevation: 8,
            }}
          >
            <MenuRow
              label="标为未读"
              onPress={() => {
                markConversationUnread(item.id).catch(() => {});
                Toast.success("已标为未读");
                onClose();
              }}
            />
            <MenuRow
              label={item.pinned ? "取消置顶" : "置顶该聊天"}
              onPress={() => {
                setConversationPinned(item.id, !item.pinned).catch(() => {});
                onClose();
              }}
            />
            <MenuRow
              label="不显示该聊天"
              onPress={() => {
                hideConversation(item.id).catch(() => {});
                onClose();
              }}
            />
            <MenuRow
              label="删除该聊天"
              last
              onPress={() => setConfirmOpen(true)}
            />
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        animationType="fade"
        visible={confirmOpen}
        onRequestClose={() => setConfirmOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.4)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setConfirmOpen(false)}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          />
          <View
            style={{
              width: DIALOG_WIDTH,
              borderRadius: 10,
              backgroundColor: "#fff",
              overflow: "hidden",
            }}
          >
            <Text
              style={{
                fontSize: 14,
                color: themeColor.text3,
                textAlign: "center",
                lineHeight: 21,
                paddingHorizontal: 22,
                paddingVertical: 26,
              }}
            >
              将删除与「{item.title}」的聊天记录，记忆会保留，此操作不可恢复。
            </Text>
            <View
              style={{
                flexDirection: "row",
                borderTopWidth: 0.5,
                borderTopColor: "#E5E6EB",
              }}
            >
              <TouchableOpacity
                onPress={() => setConfirmOpen(false)}
                style={{
                  flex: 1,
                  height: 48,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 16, color: "#1A1A1A" }}>取消</Text>
              </TouchableOpacity>
              <View style={{ width: 0.5, backgroundColor: "#E5E6EB" }} />
              <TouchableOpacity
                disabled={count > 0}
                onPress={() => {
                  deleteConversation(item.id).catch(() => {});
                  Toast.success("已删除");
                  onClose();
                }}
                style={{
                  flex: 1,
                  height: 48,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    color: count > 0 ? themeColor.text2 : "#FA5151",
                  }}
                >
                  {count > 0 ? `删除（${count}）` : "删除"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

export default ConvoLongPressMenu;
