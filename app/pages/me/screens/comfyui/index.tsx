import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "expo-router";
import { useTheme } from "../../../../../theme/useTheme";
import Toast from "../../../../component/base/Toast";
import WeChatSwitch from "../../../../component/base/WeChatSwitch";
import {
  DEFAULT_COMFY_SETTINGS,
  detectPromptNode,
  parseWorkflow,
  readComfySettings,
  saveComfySettings,
  testComfyConnection,
  type ComfySettings,
} from "../../../../store/comfyui";

/**
 * ComfyUI 自动生图设置。默认关闭：关闭时聊天内完全不出现生图能力（模型不会收到配图说明）。
 */
const Page = () => {
  const navigate = useNavigation();
  const { themeColor } = useTheme();
  const [s, setS] = useState<ComfySettings>({ ...DEFAULT_COMFY_SETTINGS });
  const [loaded, setLoaded] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string>("");

  useLayoutEffect(() => {
    navigate.setOptions({
      headerTitle: "AI 生图（ComfyUI）",
      headerShadowVisible: false,
    } as any);
  }, [navigate]);

  useEffect(() => {
    readComfySettings().then((v) => {
      setS(v);
      setLoaded(true);
    });
  }, []);

  const patch = (p: Partial<ComfySettings>) => setS((prev) => ({ ...prev, ...p }));

  const onSave = useCallback(async () => {
    if (s.enabled && !s.url.trim()) {
      Toast.info("开启前请先填写 ComfyUI 服务器地址");
      return;
    }
    if (s.enabled && s.workflowJson.trim() && !parseWorkflow(s.workflowJson)) {
      Toast.info("workflow JSON 无法解析，请用 ComfyUI 的 Export (API) 导出");
      return;
    }
    await saveComfySettings(s);
    Toast.success(s.enabled ? "已保存，生图已开启" : "已保存，生图保持关闭");
  }, [s]);

  const onTest = useCallback(async () => {
    setTesting(true);
    setTestResult("");
    const r = await testComfyConnection(s.url);
    setTesting(false);
    setTestResult(r.ok ? `连接成功：${r.info}` : `失败：${r.error}`);
  }, [s.url]);

  const detectedNode = s.workflowJson.trim()
    ? detectPromptNode(parseWorkflow(s.workflowJson) || {})
    : null;

  const label = (t: string) => (
    <Text
      style={{
        fontSize: 13,
        color: themeColor.text3,
        marginTop: 16,
        marginBottom: 6,
      }}
    >
      {t}
    </Text>
  );

  const inputStyle = {
    backgroundColor: themeColor.white,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: themeColor.text5,
  };

  if (!loaded) return <View style={{ flex: 1, backgroundColor: themeColor.fillColor }} />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: themeColor.fillColor }}
      contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* 总开关 */}
      <View
        style={{
          backgroundColor: themeColor.white,
          borderRadius: 10,
          paddingHorizontal: 14,
          height: 52,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ fontSize: 15, color: themeColor.text5 }}>
            启用 AI 自动生图
          </Text>
          <Text style={{ fontSize: 12, color: themeColor.text3, marginTop: 2 }}>
            默认关闭。关闭时聊天内完全不会出现生图，也不会请求 ComfyUI
          </Text>
        </View>
        <WeChatSwitch value={s.enabled} onValueChange={(v) => patch({ enabled: v })} />
      </View>

      {label("ComfyUI 服务器地址（与本机同一局域网）")}
      <TextInput
        value={s.url}
        onChangeText={(v) => patch({ url: v })}
        placeholder="http://192.168.31.100:8188"
        placeholderTextColor={themeColor.text2}
        autoCapitalize="none"
        autoCorrect={false}
        style={inputStyle}
      />
      <TouchableOpacity
        onPress={onTest}
        disabled={testing}
        style={{
          marginTop: 10,
          alignSelf: "flex-start",
          paddingHorizontal: 16,
          paddingVertical: 8,
          borderRadius: 18,
          backgroundColor: themeColor.primary + "18",
        }}
      >
        <Text style={{ fontSize: 13, color: themeColor.primary }}>
          {testing ? "测试中…" : "测试连接"}
        </Text>
      </TouchableOpacity>
      {!!testResult && (
        <Text style={{ fontSize: 12, color: themeColor.text3, marginTop: 6 }}>
          {testResult}
        </Text>
      )}

      {label("工作流 JSON（ComfyUI 里 Export (API) 导出的内容原样粘贴）")}
      <TextInput
        value={s.workflowJson}
        onChangeText={(v) => patch({ workflowJson: v })}
        placeholder='{"3": {"class_type": "KSampler", ...}}'
        placeholderTextColor={themeColor.text2}
        multiline
        textAlignVertical="top"
        style={[inputStyle, { height: 130, fontFamily: "monospace", fontSize: 12 }]}
      />
      <Text style={{ fontSize: 12, color: themeColor.text3, marginTop: 6 }}>
        {detectedNode
          ? `已自动识别提示词节点：${detectedNode}`
          : "无法自动识别提示词节点时，请在下方手动填写"}
      </Text>

      {label("提示词节点 ID（留空 = 自动识别）")}
      <TextInput
        value={s.promptNodeId}
        onChangeText={(v) => patch({ promptNodeId: v.trim() })}
        placeholder="例如 6"
        placeholderTextColor={themeColor.text2}
        autoCapitalize="none"
        style={inputStyle}
      />

      {label("画质后缀（拼在画面描述后，可留空）")}
      <TextInput
        value={s.qualitySuffix}
        onChangeText={(v) => patch({ qualitySuffix: v })}
        placeholder="masterpiece, best quality"
        placeholderTextColor={themeColor.text2}
        autoCapitalize="none"
        style={inputStyle}
      />

      <View
        style={{
          backgroundColor: themeColor.white,
          borderRadius: 10,
          paddingHorizontal: 14,
          height: 52,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 16,
        }}
      >
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ fontSize: 15, color: themeColor.text5 }}>
            生图自动存入角色相册
          </Text>
          <Text style={{ fontSize: 12, color: themeColor.text3, marginTop: 2 }}>
            聊天里生成的图片同时进入该角色的相册
          </Text>
        </View>
        <WeChatSwitch value={s.autoAlbum} onValueChange={(v) => patch({ autoAlbum: v })} />
      </View>

      <TouchableOpacity
        onPress={onSave}
        style={{
          marginTop: 24,
          height: 46,
          borderRadius: 23,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: themeColor.primary,
        }}
      >
        <Text style={{ fontSize: 15, color: "#fff", fontWeight: "600" }}>
          保存
        </Text>
      </TouchableOpacity>

      <Text style={{ fontSize: 12, color: themeColor.text3, marginTop: 14, lineHeight: 18 }}>
        提示：需要你自己在电脑上运行 ComfyUI（Stable Diffusion），手机和电脑连同一 Wi-Fi。
        开启后，聊天中画面感强的回复角色可能会自动配图；也可以直接让角色"画一张…"。
      </Text>
    </ScrollView>
  );
};

export default Page;
