import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "expo-router";
import AsyncStorage from "../../../../utils/storage";
import * as FileSystem from "expo-file-system/legacy";
import { useTheme } from "../../../../../theme/useTheme";
import Toast from "../../../../component/base/Toast";
import {
  sqlDeleteAllMessages,
  sqlSumMessageBytes,
  sqlSumRoleBytes,
} from "../../../../store/appDb";

interface Usage {
  chat: number;
  roles: number;
  kb: number;
  other: number;
}

function fmt(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1024 / 1024).toFixed(2) + " MB";
}

function byteLen(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c < 0x10000) n += 3;
    else n += 4;
  }
  return n;
}

const Storage = () => {
  const navigate = useNavigation();
  const { themeColor } = useTheme();
  const [usage, setUsage] = useState<Usage>({
    chat: 0,
    roles: 0,
    kb: 0,
    other: 0,
  });

  const measure = useCallback(async () => {
    const u: Usage = { chat: 0, roles: 0, kb: 0, other: 0 };
    try {
      const keys = await AsyncStorage.getAllKeys();
      const entries = await AsyncStorage.multiGet(keys);
      for (const [k, v] of entries) {
        if (!v) continue;
        const n = byteLen(v);
        if (/^wc_local_conversations|^wc_local_unread|^wc_local_proactive/.test(k)) {
          u.chat += n;
        } else if (/^wc_local_roles/.test(k)) {
          u.roles += n;
        } else if (/^wc_kb_|^wc_rag_settings|^wc_memory|^wc_extract/.test(k)) {
          u.kb += n;
        } else {
          u.other += n;
        }
      }
      // 聊天消息/角色卡已迁移到 SQLite，按内容字节统计
      u.chat += await sqlSumMessageBytes();
      u.roles += await sqlSumRoleBytes();
    } catch {}
    try {
      for (const name of ["wc_memory.db", "wc_kb.db"]) {
        const info = await FileSystem.getInfoAsync(
          `${FileSystem.documentDirectory}SQLite/${name}`
        );
        if (info.exists && info.size != null) u.kb += info.size;
      }
    } catch {}
    setUsage(u);
  }, []);

  useEffect(() => {
    measure();
  }, [measure]);

  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerTitle: "存储空间",
      headerTitleAlign: "center",
      headerTintColor: "#111",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: "#EDEDED" },
    });
  }, []);

  const total = usage.chat + usage.roles + usage.kb + usage.other;

  const clearChats = () => {
    Alert.alert("清空聊天记录", "将删除所有角色的聊天记录，此操作不可恢复。", [
      { text: "取消", style: "cancel" },
      {
        text: "清空",
        style: "destructive",
        onPress: async () => {
          try {
            await sqlDeleteAllMessages();
            await AsyncStorage.multiRemove([
              "wc_local_conversations",
              "wc_local_unread_v1",
              "wc_local_proactive_tasks",
              "wc_local_proactive_daily",
            ]);
            Toast.success("已清空");
            measure();
          } catch {}
        },
      },
    ]);
  };

  const Card = ({
    title,
    size,
    desc,
    action,
  }: {
    title: string;
    size: number;
    desc: string;
    action?: { label: string; onPress: () => void; highlight?: boolean };
  }) => (
    <View style={{ backgroundColor: "#fff", borderRadius: 10, padding: 14, marginBottom: 10 }}>
      <Text style={{ color: themeColor.text3, fontSize: 13 }}>{title}</Text>
      <Text style={{ fontSize: 22, color: themeColor.text5, marginTop: 4 }}>
        {fmt(size)}
      </Text>
      <Text style={{ color: themeColor.text2, fontSize: 12, marginTop: 6, lineHeight: 18 }}>
        {desc}
      </Text>
      {action && (
        <TouchableOpacity
          onPress={action.onPress}
          style={{
            alignSelf: "flex-end",
            marginTop: 10,
            paddingHorizontal: 18,
            paddingVertical: 7,
            borderRadius: 5,
      backgroundColor: action.highlight ? themeColor.primary : "#E5E6EB",
          }}
        >
          <Text
            style={{
              color: action.highlight ? "#fff" : "#1A1A1A",
              fontSize: 14,
            }}
          >
            {action.label}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <ScrollView
      style={{ backgroundColor: "#EDEDED", flex: 1 }}
      contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
    >
      <View style={{ paddingVertical: 8 }}>
        <Text style={{ color: themeColor.text3, fontSize: 13 }}>App 已用空间</Text>
        <Text style={{ fontSize: 30, color: themeColor.text5, marginTop: 4 }}>
          {fmt(total)}
        </Text>
      </View>

      <Card
        title="聊天记录"
        size={usage.chat}
        desc="包含所有角色的聊天内容。清理后无法恢复。"
        action={{ label: "清理", onPress: clearChats, highlight: true }}
      />
      <Card
        title="角色资料"
        size={usage.roles}
        desc="包含角色设定、头像等资料，不会清理。"
      />
      <Card
        title="记忆与知识库"
        size={usage.kb}
        desc="包含角色记忆、知识库文档与向量数据。"
      />
      <Card
        title="其他数据"
        size={usage.other}
        desc="包含模型配置、个人资料等设置数据。"
      />
    </ScrollView>
  );
};

export default Storage;
