import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import {
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useTheme } from "../../../../../theme/useTheme";
import { sqlReadRole } from "../../../../store/appDb";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  ModelCategory,
  Provider,
  RoleModelBindings,
  useProviders,
} from "../../../../store/models";
import { readRolesRaw, updateRole } from "../../../../store/roles";
import eventBus from "../../../../utils/eventBus";
import Toast from "../../../../component/base/Toast";
import WeChatDialog from "../../../../component/base/WeChatDialog";

const RoleModels = () => {
  const { themeColor } = useTheme();
  const navigate = useNavigation();
  const params = useLocalSearchParams<{ roleId?: string }>();
  const { loadProviders } = useProviders();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [bindings, setBindings] = useState<RoleModelBindings>({});
  const [pickCategory, setPickCategory] = useState<ModelCategory | null>(null);

  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerTitle: "模型设置",
      headerTitleAlign: "center",
      headerTintColor: "#111",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: "#fff" },
    });
  }, []);

  const refresh = useCallback(async () => {
    setProviders(await loadProviders());
    if (params.roleId) {
      const role = await sqlReadRole(params.roleId);
      if (role?.modelIds) setBindings({ ...role.modelIds });
    }
  }, [params.roleId, loadProviders]);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    eventBus.on("providers-updated", handler);
    return () => {
      eventBus.off("providers-updated", handler);
    };
  }, [refresh]);

  const modelName = (category: ModelCategory, id?: string) => {
    if (!id) return "未选择";
    const p = providers.find((x) => x.models.some((m) => m.id === id));
    if (!p) return id;
    const m = p.models.find((x) => x.id === id);
    return `${p.name} · ${m?.name || id}`;
  };


  const catModels = providers
    .flatMap((p) => p.models.map((m) => ({ p, m })))
    .filter(({ m }) =>
      pickCategory === "text"
        ? m.capabilities.text
        : pickCategory === "image"
        ? m.capabilities.image ||
          m.capabilities.video ||
          m.capabilities.audio
        : m.capabilities.stt || m.capabilities.tts
    );
  const save = async () => {
    if (!params.roleId) {
      Toast.fail("角色不存在");
      return;
    }
    await updateRole(params.roleId, { modelIds: bindings });
    Toast.success("模型设置已保存");
    navigate.goBack();
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <ScrollView style={{ flex: 1 }}>
        <Text
          style={{
            color: themeColor.text3,
            fontSize: 13,
            paddingHorizontal: 16,
            paddingTop: 12,
          }}
        >
          分别选择该角色使用的文本、图像、语音模型（来自模型管理里的供应商）
        </Text>
        {CATEGORIES.map((c) => (
          <TouchableOpacity
            key={c}
            onPress={() => setPickCategory(c)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderBottomWidth: 0.5,
              borderBottomColor: themeColor.line2,
              marginTop: 8,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, color: themeColor.text5 }}>
                {CATEGORY_LABELS[c]}模型
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: bindings[c] ? themeColor.primary : themeColor.text3,
                  marginTop: 3,
                }}
              >
                {modelName(c, bindings[c])}
              </Text>
            </View>
            <Text style={{ color: themeColor.text3, fontSize: 20 }}>›</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <TouchableOpacity
        onPress={save}
        style={{
          backgroundColor: themeColor.primary,
          margin: 16,
          paddingVertical: 12,
          borderRadius: 6,
          alignItems: "center",
        }}
      >
        <Text style={{ color: "#fff", fontSize: 16 }}>保存</Text>
      </TouchableOpacity>

            <WeChatDialog
        visible={!!pickCategory}
        title={`选择${CATEGORY_LABELS[pickCategory || "text"]}模型`}
        onCancel={() => setPickCategory(null)}
      >
        <ScrollView style={{ marginTop: 4, maxHeight: 320 }}>
          {catModels.map(({ p, m }) => (
            <TouchableOpacity
              key={m.id}
              onPress={() => {
                setBindings((pre) => ({
                  ...pre,
                  [pickCategory || "text"]: m.id,
                }));
                setPickCategory(null);
              }}
              style={{
                paddingVertical: 10,
                borderBottomWidth: 0.5,
                borderBottomColor: themeColor.line2,
              }}
            >
              <Text style={{ fontSize: 15, color: themeColor.text5 }}>
                {m.name}
              </Text>
              <Text style={{ fontSize: 12, color: themeColor.text3 }}>
                {p.name}
              </Text>
            </TouchableOpacity>
          ))}
          {catModels.length === 0 && (
            <Text style={{ color: themeColor.text3, marginTop: 10 }}>
              该大类还没有供应商，请先到 我的 → 模型管理 添加
            </Text>
          )}
        </ScrollView>
      </WeChatDialog>
    </View>
  );
};

export default RoleModels;
