import { useEffect, useLayoutEffect, useState } from "react";
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "expo-router";
import { useTheme } from "../../../../../theme/useTheme";
import { useChatList } from "../../../../store/chatList";
import {
  useMemories,
  setMemoryPinned,
  deleteMemory,
  clearMemories,
  MemoryEntry,
} from "../../../../store/memory";
import ConfirmDialog from "../../../../component/complex/ConfirmDialog";
import Toast from "../../../../component/base/Toast";

const ChatMemory = () => {
  const navigate = useNavigation();
  const { themeColor } = useTheme();
  const { chatListStore } = useChatList();
  const roleId = chatListStore.curConvo?.roleId;
  const { loadMemories } = useMemories();
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [clearVisible, setClearVisible] = useState(false);

  useEffect(() => {
    if (roleId) loadMemories(roleId).then(setMemories);
  }, [roleId]);

  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerTitle: "角色记忆",
      headerTitleAlign: "center",
      headerTintColor: "#111",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: "#EDEDED" },
    });
  }, []);

  const refresh = async () => {
    if (roleId) setMemories(await loadMemories(roleId));
  };

  const TYPE_LABEL: Record<string, string> = {
    preference: "偏好",
    event: "事件",
    relation: "关系",
    fact: "事实",
    life: "生活",
    promise: "约定",
    precious: "回忆",
    core: "长期档案",
    chronology: "编年史",
  };

  const tagOf = (m: MemoryEntry) => {
    const tags: string[] = [];
    if (m.pinned) tags.push("📌");
    if ((m.importance ?? 3) >= 4) tags.push("⭐");
    if (m.type === "promise") tags.push("📅");
    if (m.type === "precious") tags.push("💖");
    return tags.length ? tags.join(" ") + " " : "";
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#EDEDED" }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
        {memories.length === 0 && (
          <Text
            style={{
              textAlign: "center",
              color: themeColor.text3,
              marginTop: 50,
            }}
          >
            暂无记忆。对话满 8 轮后会自动提取。
          </Text>
        )}
        {memories.map((m) => (
          <View
            key={m.id}
            style={{
              backgroundColor: "#fff",
              marginTop: 8,
              paddingHorizontal: 16,
              paddingVertical: 12,
            }}
          >
            <Text style={{ fontSize: 15, color: "#1A1A1A" }}>
              {tagOf(m)}
              {m.content}
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: 6,
              }}
            >
              <Text style={{ flex: 1, fontSize: 11, color: themeColor.text3 }}>
                {m.source === "auto" ? "自动提取" : "手动"} ·
                {TYPE_LABEL[m.type || "fact"] || "记忆"} ·
                重要度 {(m.importance ?? 3)}/5 ·
                {new Date(m.createdAt).toLocaleString()}
              </Text>
              <TouchableOpacity
                onPress={async () => {
                  if (!roleId) return;
                  await setMemoryPinned(roleId, m.id, !m.pinned);
                  refresh();
                }}
                style={{ marginRight: 16 }}
              >
                <Text
                  style={{
                    color: m.pinned
                      ? themeColor.text2
                      : themeColor.textBlue,
                    fontSize: 13,
                  }}
                >
                  {m.pinned ? "取消置顶" : "置顶"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  if (!roleId) return;
                  await deleteMemory(roleId, m.id);
                  refresh();
                }}
              >
                <Text style={{ color: themeColor.danger6, fontSize: 13 }}>
                  删除
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
      {memories.length > 0 && (
        <View
          style={{
            backgroundColor: "#fff",
            paddingVertical: 14,
            alignItems: "center",
            borderTopWidth: 0.5,
            borderTopColor: "#E5E6EB",
          }}
        >
          <TouchableOpacity onPress={() => setClearVisible(true)}>
            <Text style={{ color: themeColor.danger6, fontSize: 15 }}>
              清空全部记忆
            </Text>
          </TouchableOpacity>
        </View>
      )}
      <ConfirmDialog
        visible={clearVisible}
        title="清空记忆"
        message="确定清空该角色的全部记忆吗？此操作不可恢复。"
        onCancel={() => setClearVisible(false)}
        onConfirm={async () => {
          setClearVisible(false);
          if (roleId) {
            await clearMemories(roleId);
            setMemories([]);
            Toast.success("记忆已清空");
          }
        }}
      />
    </View>
  );
};

export default ChatMemory;
