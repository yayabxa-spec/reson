import { useEffect, useLayoutEffect, useState } from "react";
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useTheme } from "../../../../../theme/useTheme";
import { updateRole } from "../../../../store/roles";
import { sqlReadRole } from "../../../../store/appDb";
import { useLocalChat } from "../../../../store/localChat";
import { optimizeRoleText } from "../../../../utils/ai";
import Overlay from "../../../../component/base/Overlay";
import Toast from "../../../../component/base/Toast";
import eventBus from "../../../../utils/eventBus";

const EditPersona = () => {
  const { themeColor } = useTheme();
  const navigate = useNavigation();
  const params = useLocalSearchParams<{ roleId?: string; initial?: string }>();
  const { getAIConfig } = useLocalChat();
  const [persona, setPersona] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [roleName, setRoleName] = useState("");
  // AI 优化弹窗
  const [optVisible, setOptVisible] = useState(false);
  const [optOriginal, setOptOriginal] = useState("");
  const [optResult, setOptResult] = useState("");
  const [optLoading, setOptLoading] = useState(false);

  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerTitle: "编辑角色设定",
      headerTitleAlign: "center",
      headerTintColor: "#111",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: "#fff" },
    });
  }, []);

  useEffect(() => {
    (async () => {
      if (params.roleId) {
        const role = await sqlReadRole(params.roleId);
        if (role) {
          setPersona(role.persona || "");
          setRoleName(role.name || "");
        }
      } else {
        setPersona(params.initial || "");
      }
      setLoaded(true);
    })();
  }, [params.roleId, params.initial]);

  const startOptimize = async () => {
    if (!persona.trim()) {
      Toast.fail("内容为空，无法优化");
      return;
    }
    setOptOriginal(persona);
    setOptResult("");
    setOptVisible(true);
    setOptLoading(true);
    try {
      const cfg = await getAIConfig();
      const result = await optimizeRoleText(
        cfg,
        "角色人设",
        persona,
        roleName || "角色"
      );
      setOptResult(result);
    } catch (e: any) {
      setOptResult("[优化失败] " + (e?.message || ""));
    } finally {
      setOptLoading(false);
    }
  };

  const applyOptimize = () => {
    if (!optResult || optResult.startsWith("[优化失败]")) return;
    setPersona(optResult);
    setOptVisible(false);
    Toast.success("已采用优化结果");
  };

  const save = async () => {
    if (params.roleId) {
      await updateRole(params.roleId, { persona: persona.trim() });
      Toast.success("已保存");
    }
    eventBus.emit("role-persona-edited", {
      roleId: params.roleId || "",
      persona: persona.trim(),
    });
    navigate.goBack();
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#fff", padding: 16 }}>
      <Text style={{ color: themeColor.text3, fontSize: 13 }}>
        角色设定（人设）{loaded ? "" : "，加载中…"}
      </Text>
      <TextInput
        style={{
          flex: 1,
          backgroundColor: themeColor.bg2,
          borderRadius: 6,
          paddingHorizontal: 12,
          paddingVertical: 10,
          fontSize: 15,
          color: themeColor.text5,
          marginTop: 8,
          textAlignVertical: "top",
        }}
        value={persona}
        onChangeText={setPersona}
        placeholder="例如：清冷寡言的古风剑客，惜字如金，但内心温柔……"
        placeholderTextColor={themeColor.text2}
        multiline
      />

      <TouchableOpacity
        onPress={startOptimize}
        style={{
          marginTop: 12,
          borderColor: themeColor.primary,
          borderWidth: 1,
          borderRadius: 6,
          paddingVertical: 10,
          alignItems: "center",
        }}
      >
        <Text style={{ color: themeColor.primary, fontSize: 15 }}>AI 优化</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={save}
        style={{
          backgroundColor: themeColor.primary,
          paddingVertical: 12,
          borderRadius: 6,
          alignItems: "center",
          marginTop: 10,
          marginBottom: 20,
        }}
      >
        <Text style={{ color: "#fff", fontSize: 16 }}>保存</Text>
      </TouchableOpacity>

      <Overlay
        visible={optVisible}
        onBackdropPress={() => !optLoading && setOptVisible(false)}
      >
        <View
          style={{
            width: "88%",
            maxHeight: "78%",
            backgroundColor: "#fff",
            borderRadius: 8,
            padding: 16,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "600", color: "#222" }}>
            AI 优化（角色设定）
          </Text>
          <ScrollView style={{ marginTop: 12, maxHeight: "70%" }}>
            <Text style={{ color: "#999", fontSize: 12 }}>原文：</Text>
            <Text
              style={{
                color: "#444",
                fontSize: 14,
                marginTop: 4,
                marginBottom: 12,
              }}
            >
              {optOriginal}
            </Text>
            <Text style={{ color: "#999", fontSize: 12 }}>优化结果：</Text>
            <Text style={{ color: "#222", fontSize: 14, marginTop: 4 }}>
              {optLoading ? "正在优化…" : optResult || "等待结果"}
            </Text>
          </ScrollView>
          <View style={{ flexDirection: "row", marginTop: 16, gap: 10 }}>
            <TouchableOpacity
              style={{
                flex: 1,
                borderColor: "#ccc",
                borderWidth: 1,
                borderRadius: 6,
                paddingVertical: 9,
                alignItems: "center",
              }}
              onPress={() => setOptVisible(false)}
            >
              <Text style={{ color: "#555", fontSize: 15 }}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                flex: 1,
                backgroundColor: themeColor.primary,
                borderRadius: 6,
                paddingVertical: 9,
                alignItems: "center",
              }}
              onPress={applyOptimize}
            >
              <Text style={{ color: "#fff", fontSize: 15 }}>采用</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Overlay>
    </View>
  );
};

export default EditPersona;
