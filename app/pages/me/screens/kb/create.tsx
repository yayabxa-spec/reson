import { useLayoutEffect, useState } from "react";
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "expo-router";
import { useTheme } from "../../../../../theme/useTheme";
import { createKnowledgeBase } from "../../../../store/knowledge";
import Toast from "../../../../component/base/Toast";

const KbCreate = () => {
  const navigate = useNavigation();
  const { themeColor } = useTheme();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerTitle: "创建知识库",
      headerTitleAlign: "center",
      headerTintColor: "#111",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: "#fff" },
    });
  }, []);

  const inputStyle = {
    backgroundColor: themeColor.bg2,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: themeColor.text5,
    marginTop: 8,
  };

  const create = async () => {
    if (!name.trim()) {
      Toast.fail("请填写知识库名称");
      return;
    }
    setCreating(true);
    try {
      const kb = await createKnowledgeBase({
        name: name.trim(),
        description: description.trim(),
      });
      Toast.success("已创建，请上传文档");
      navigate.navigate("pages/me/screens/kb/detail", { kbId: kb.id });
    } catch (e: any) {
      Toast.fail(e?.message || "创建失败");
    } finally {
      setCreating(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: "#fff", flex: 1, padding: 16 }}
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      <Text style={{ color: themeColor.text3, fontSize: 13 }}>知识库名称</Text>
      <TextInput
        style={inputStyle}
        value={name}
        onChangeText={setName}
        placeholder="例如：提瓦特知识库"
        placeholderTextColor={themeColor.text2}
      />

      <Text style={{ color: themeColor.text3, fontSize: 13, marginTop: 16 }}>
        描述（可选）
      </Text>
      <TextInput
        style={[inputStyle, { minHeight: 80, textAlignVertical: "top" }]}
        value={description}
        onChangeText={setDescription}
        placeholder="例如：角色所在的幻想世界世界观、地理、角色背景等"
        placeholderTextColor={themeColor.text2}
        multiline
      />

      <TouchableOpacity
        onPress={create}
        disabled={creating}
        style={{
          backgroundColor: themeColor.primary,
          paddingVertical: 12,
          borderRadius: 6,
          alignItems: "center",
          marginTop: 20,
        }}
      >
        <Text style={{ color: "#fff", fontSize: 16 }}>
          {creating ? "创建中…" : "创建"}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

export default KbCreate;
