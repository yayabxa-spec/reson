import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "expo-router";
import { useTheme } from "../../../../../theme/useTheme";
import {
  KnowledgeBase,
  ensureKbInit,
} from "../../../../store/kbDb";
import {
  deleteKnowledgeBase,
  listKnowledgeBases,
} from "../../../../store/knowledge";
import ConfirmDialog from "../../../../component/complex/ConfirmDialog";
import Toast from "../../../../component/base/Toast";

const KbManage = () => {
  const navigate = useNavigation();
  const { themeColor } = useTheme();
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [delKb, setDelKb] = useState<KnowledgeBase | null>(null);

  const refresh = useCallback(async () => {
    await ensureKbInit();
    setKbs(await listKnowledgeBases());
  }, []);

  useEffect(() => {
    const unsub = navigate.addListener("focus", refresh);
    refresh();
    return () => {
      unsub?.();
    };
  }, [refresh, navigate]);

  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerTitle: "知识库",
      headerTitleAlign: "center",
      headerTintColor: "#111",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: "#EDEDED" },
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigate.navigate("pages/me/screens/kb/create")}
          style={{ paddingHorizontal: 12, paddingVertical: 6 }}
        >
          <Text style={{ color: themeColor.textBlue, fontSize: 15 }}>
            新建
          </Text>
        </TouchableOpacity>
      ),
      headerRightContainerStyle: { paddingRight: 12 },
    });
  }, []);

  return (
    <ScrollView
      style={{ backgroundColor: "#EDEDED", flex: 1 }}
      contentContainerStyle={{ paddingBottom: 30 }}
    >
      {kbs.length === 0 && (
        <Text
          style={{
            textAlign: "center",
            color: themeColor.text3,
            marginTop: 60,
          }}
        >
          还没有知识库，点右上角「新建」创建
        </Text>
      )}
      {kbs.map((kb) => (
        <TouchableOpacity
          key={kb.id}
          activeOpacity={0.7}
          onPress={() =>
            navigate.navigate("pages/me/screens/kb/detail", { kbId: kb.id })
          }
          style={{
            backgroundColor: "#fff",
            marginTop: 8,
            paddingHorizontal: 16,
            paddingVertical: 14,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ flex: 1, fontSize: 17, color: "#1A1A1A" }}>
              {kb.name}
            </Text>
            <Text style={{ color: themeColor.text2, fontSize: 16 }}>›</Text>
          </View>
          <Text
            numberOfLines={1}
            style={{ fontSize: 13, color: themeColor.text3, marginTop: 4 }}
          >
            {kb.description || "暂无描述"}
          </Text>
          <Text style={{ fontSize: 12, color: themeColor.text2, marginTop: 6 }}>
            文档 {kb.docCount} · 分块 {kb.chunkCount} · 更新于{" "}
            {new Date(kb.updatedAt).toLocaleString()}
          </Text>
          <TouchableOpacity
            onPress={() => setDelKb(kb)}
            style={{ alignSelf: "flex-end", marginTop: 8 }}
          >
            <Text style={{ color: themeColor.danger6, fontSize: 13 }}>
              删除
            </Text>
          </TouchableOpacity>
        </TouchableOpacity>
      ))}

      <ConfirmDialog
        visible={!!delKb}
        title="删除知识库"
        message={`确定删除知识库「${delKb?.name || ""}」及其全部文档、分块与向量吗？此操作不可恢复。`}
        onCancel={() => setDelKb(null)}
        onConfirm={async () => {
          if (delKb) {
            await deleteKnowledgeBase(delKb.id);
            Toast.success("已删除");
            setDelKb(null);
            refresh();
          }
        }}
      />
    </ScrollView>
  );
};

export default KbManage;
