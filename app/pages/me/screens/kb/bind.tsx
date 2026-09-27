import { useEffect, useLayoutEffect, useState } from "react";
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useTheme } from "../../../../../theme/useTheme";
import {
  KnowledgeBase,
  ensureKbInit,
} from "../../../../store/kbDb";
import {
  listKnowledgeBases,
  listRoleKbIds,
} from "../../../../store/knowledge";
import {
  sqlBindRoleKb,
  sqlUnbindRoleKb,
} from "../../../../store/kbDb";
import Toast from "../../../../component/base/Toast";

const KbBind = () => {
  const navigate = useNavigation();
  const { themeColor } = useTheme();
  const params = useLocalSearchParams<{ roleId?: string }>();
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      await ensureKbInit();
      setKbs(await listKnowledgeBases());
      if (params.roleId) {
        const ids = await listRoleKbIds(params.roleId);
        setSelected(new Set(ids));
      }
    })();
  }, [params.roleId]);

  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerTitle: "关联知识库",
      headerTitleAlign: "center",
      headerTintColor: "#111",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: "#fff" },
      headerRight: () => (
        <TouchableOpacity
          onPress={async () => {
            if (!params.roleId) {
              Toast.fail("缺少角色");
              return;
            }
            const cur = await listRoleKbIds(params.roleId);
            const curSet = new Set(cur);
            for (const id of selected) {
              if (!curSet.has(id)) await sqlBindRoleKb(params.roleId, id);
            }
            for (const id of cur) {
              if (!selected.has(id)) await sqlUnbindRoleKb(params.roleId, id);
            }
            Toast.success("已保存");
            navigate.goBack();
          }}
          style={{ paddingHorizontal: 12, paddingVertical: 6 }}
        >
          <Text style={{ color: themeColor.textBlue, fontSize: 15 }}>
            完成
          </Text>
        </TouchableOpacity>
      ),
      headerRightContainerStyle: { paddingRight: 12 },
    });
  }, [selected, params.roleId]);

  const toggle = (id: string) => {
    setSelected((pre) => {
      const next = new Set(pre);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <ScrollView
      style={{ backgroundColor: "#fff", flex: 1 }}
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
          还没有知识库，请先到 设置 → 知识库 创建
        </Text>
      )}
      {kbs.map((kb) => {
        const on = selected.has(kb.id);
        return (
          <TouchableOpacity
            key={kb.id}
            onPress={() => toggle(kb.id)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderBottomWidth: 0.5,
              borderBottomColor: themeColor.line2,
            }}
          >
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                borderWidth: 1.5,
                borderColor: on ? themeColor.primary : "#C8C8C8",
                backgroundColor: on ? themeColor.primary : "#fff",
                alignItems: "center",
                justifyContent: "center",
                marginRight: 12,
              }}
            >
              {on && (
                <Text style={{ color: "#fff", fontSize: 12 }}>✓</Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, color: "#1A1A1A" }}>{kb.name}</Text>
              <Text
                numberOfLines={1}
                style={{ fontSize: 12, color: themeColor.text3, marginTop: 2 }}
              >
                {kb.description || "暂无描述"} · {kb.chunkCount} 个分块
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
};

export default KbBind;
