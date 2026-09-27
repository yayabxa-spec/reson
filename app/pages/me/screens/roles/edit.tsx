import { useEffect, useLayoutEffect, useState } from "react";
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useNavigation } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as DocumentPicker from "expo-document-picker";
import { createAudioPlayer } from "expo-audio";
import { useTheme } from "../../../../../theme/useTheme";
import type { RoleBackgroundItem } from "../../../../store/builtin/types";
import type { RoleVoice } from "../../../../store/roles";
import {
  createRole,
  updateRole,
} from "../../../../store/roles";
import { sqlReadRole } from "../../../../store/appDb";
import {
  buildVoiceVariants,
  fetchVoices,
  matchVoice,
  synthTTS,
  type VoiceMatch,
} from "../../../../utils/ttson";
import RoleAvatar from "../../../../component/complex/RoleAvatar";
import Toast from "../../../../component/base/Toast";
import eventBus from "../../../../utils/eventBus";
import { readImportFile } from "../../../../utils/importText";
import type { RoleCallName } from "../../../../store/builtin/types";

const EditRole = () => {
  const { themeColor } = useTheme();
  const navigate = useNavigation();
  const params = useLocalSearchParams<{ roleId?: string }>();
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [persona, setPersona] = useState("");
  const [region, setRegion] = useState("");
  const [avatar, setAvatar] = useState<string>("");
  const [callName, setCallName] = useState("");
  const [patReply, setPatReply] = useState("");
  const [temperature, setTemperature] = useState("0.7");
  const [contextRounds, setContextRounds] = useState("20");
  const [background, setBackground] = useState<RoleBackgroundItem[]>([]);
  const [storyState, setStoryState] = useState("");
  const [importText, setImportText] = useState("");
  const [voice, setVoice] = useState<RoleVoice | null>(null);
  const [voiceCandidates, setVoiceCandidates] = useState<VoiceMatch[]>([]);
  const [voiceLoading, setVoiceLoading] = useState(false);

  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerTitle: params.roleId ? "编辑角色" : "创建角色",
      headerTitleAlign: "center",
      headerTintColor: "#111",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: "#fff" },
    });
  }, [params.roleId]);

  useEffect(() => {
    if (!params.roleId) return;
    sqlReadRole(params.roleId).then((role) => {
      if (role) {
        setName(role.name);
        setBio(role.bio || "");
        setPersona(role.persona);
        setRegion(role.region);
        setAvatar(role.avatar);
        const cn = role.callName as RoleCallName | undefined;
        setCallName(
          typeof cn === "string"
            ? cn
            : cn?.female || cn?.neutral || cn?.male || ""
        );
        setPatReply(role.patReply || "");
        setTemperature(role.temperature != null ? String(role.temperature) : "0.7");
        setContextRounds(
          role.contextRounds != null ? String(role.contextRounds) : "20"
        );
        if (Array.isArray(role.background)) setBackground(role.background);
        if (role.storyState) setStoryState(role.storyState);
        if (role.voice) setVoice(role.voice);
      }
    });
  }, [params.roleId]);

  const autoMatchVoice = async () => {
    if (!name.trim()) {
      Toast.fail("请先填写角色名字");
      return;
    }
    setVoiceLoading(true);
    try {
      const voices = await fetchVoices();
      const matches = matchVoice(name.trim(), voices);
      setVoiceCandidates(matches);
      if (!matches.length) Toast.info("未匹配到音色，可换个名字写法");
    } catch (e) {
      Toast.fail("获取音色列表失败");
    } finally {
      setVoiceLoading(false);
    }
  };

  const previewVoice = async (voiceId: number) => {
    try {
      const url = await synthTTS(voiceId, "你好呀！很高兴认识你！");
      const player = createAudioPlayer({ uri: url });
      player.play();
      setTimeout(() => player.release(), 8000);
    } catch (e) {
      Toast.fail("试听失败（可能额度不足）");
    }
  };

  // 二级页面（角色设定编辑）返回后同步人设
  useEffect(() => {
    const handler = (e: { roleId?: string; persona?: string }) => {
      if (e?.persona != null) setPersona(e.persona);
    };
    eventBus.on("role-persona-edited", handler);
    return () => {
      eventBus.off("role-persona-edited", handler);
    };
  }, []);

  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Toast.fail("需要相册权限才能选择头像");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets?.length) return;
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 256 } }],
        {
          compress: 0.8,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        }
      );
      if (manipulated.base64) {
        setAvatar("data:image/jpeg;base64," + manipulated.base64);
      } else {
        setAvatar(manipulated.uri);
      }
      Toast.success("头像已更新");
    } catch (e) {
      Toast.fail("图片处理失败");
    }
  };

  /** 解析导入内容：兼容 SillyTavern 风格（meta + system_prompt）与普通 JSON / 纯文本 */
  const parseImport = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      Toast.fail("请先粘贴或导入内容");
      return;
    }
    try {
      if (trimmed.startsWith("{")) {
        const data = JSON.parse(trimmed);
        // SillyTavern 风格：{ meta: { name, title, faction }, system_prompt }
        if (data.meta && data.system_prompt) {
          setName(String(data.meta.name || name));
          if (data.meta.title) setBio(String(data.meta.title));
          if (data.meta.faction && !data.meta.title) setBio(String(data.meta.faction));
          setPersona(String(data.system_prompt));
          setImportText("");
          Toast.success("已导入角色卡");
          return;
        }
        if (data.name) setName(String(data.name));
        if (data.bio) setBio(String(data.bio));
        if (data.persona || data.setting) setPersona(String(data.persona || data.setting));
        if (data.region) setRegion(String(data.region));
        if (data.callName) {
          const cn = data.callName as RoleCallName;
          setCallName(
            typeof cn === "string"
              ? cn
              : cn.female || cn.neutral || cn.male || ""
          );
        }
        if (Array.isArray(data.background)) {
          setBackground(
            data.background
              .filter((b: any) => b && b.content)
              .map((b: any) => ({
                title: String(b.title || "资料"),
                content: String(b.content),
                tags: Array.isArray(b.tags) ? b.tags.map(String) : undefined,
              }))
          );
        }
        if (data.storyState) setStoryState(String(data.storyState));
        if (!data.bio && data.summary) setBio(String(data.summary));
        setImportText("");
        Toast.success("已导入");
        return;
      }
    } catch (e) {
      // JSON 解析失败则按纯文本处理
    }
    // 纯文本：名称：/简介：/人设：/地区：
    const lines = trimmed.split(/\r?\n/);
    const find = (keys: string[]) => {
      const line = lines.find((l) => keys.some((k) => l.startsWith(k)));
      return line ? line.replace(/^[^：:]*[：:]\s*/, "").trim() : "";
    };
    const n = find(["名称", "名字", "姓名"]);
    const b = find(["简介"]);
    const p = find(["人设", "角色设定", "设定"]);
    const r = find(["地区"]);
    if (n) setName(n);
    if (b) setBio(b);
    if (p) setPersona(p);
    if (r) setRegion(r);
    if (!n && !p) {
      // 都没有字段标记：整段当作人设
      setPersona(trimmed);
    }
    setImportText("");
    Toast.success("已导入");
  };

  const importFromFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      const content = await readImportFile(
        asset.uri,
        asset.name || "import.txt"
      );
      setImportText(content);
      parseImport(content);
    } catch (e) {
      Toast.fail("读取文件失败，支持 txt / json / md / docx 等格式");
    }
  };

  const save = async () => {
    if (!name.trim()) {
      Toast.fail("请填写角色名字");
      return;
    }
    if (!persona.trim()) {
      Toast.fail("请填写角色人设");
      return;
    }
    const data = {
      name: name.trim(),
      bio: bio.trim(),
      persona: persona.trim(),
      callName: callName.trim(),
      patReply: patReply.trim(),
      region: region.trim() || "中国",
      avatar,
      temperature: Math.min(2, Math.max(0, parseFloat(temperature) || 0.7)),
      contextRounds: Math.max(1, parseInt(contextRounds, 10) || 20),
      background: background.filter((b) => b.content.trim()),
      storyState: storyState.trim(),
      voice: voice ?? undefined,
    };
    if (params.roleId) {
      await updateRole(params.roleId, data);
      Toast.success("已保存");
    } else {
      await createRole(data);
      Toast.success("角色已创建，可在通讯录中搜索添加");
    }
    navigate.goBack();
  };

  const inputStyle = {
    backgroundColor: themeColor.bg2,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: themeColor.text5,
    marginTop: 8,
  };

  return (
    <ScrollView style={{ backgroundColor: "#fff", flex: 1, padding: 16 }}>
      <Text style={{ color: themeColor.text3, fontSize: 13 }}>角色名字</Text>
      <TextInput
        style={inputStyle}
        value={name}
        onChangeText={setName}
        placeholder="例如：夜莺"
        placeholderTextColor={themeColor.text2}
      />

      <Text style={{ color: themeColor.text3, fontSize: 13, marginTop: 16 }}>
        个性签名
      </Text>
      <TextInput
        style={inputStyle}
        value={bio}
        onChangeText={setBio}
        placeholder="例如：冷面剑客，江湖人称「夜莺」"
        placeholderTextColor={themeColor.text2}
      />

      <Text style={{ color: themeColor.text3, fontSize: 13, marginTop: 16 }}>
        角色对你的称呼
      </Text>
      <TextInput
        style={inputStyle}
        value={callName}
        onChangeText={setCallName}
        placeholder="例如：主人、旅行者"
        placeholderTextColor={themeColor.text2}
      />
      <Text style={{ color: themeColor.text2, fontSize: 12, marginTop: 6 }}>
        添加好友后，系统提示会用它代替「你」，例如：你已经添加主人为好友，可以开始聊天了
      </Text>

      <Text style={{ color: themeColor.text3, fontSize: 13, marginTop: 16 }}>
        我拍了拍角色的内容
      </Text>
      <TextInput
        style={inputStyle}
        value={patReply}
        onChangeText={setPatReply}
        placeholder="例如：头、肩膀（留空则显示「我拍了拍角色」）"
        placeholderTextColor={themeColor.text2}
      />
      <Text style={{ color: themeColor.text2, fontSize: 12, marginTop: 6 }}>
        聊天页双击角色头像会触发拍一拍，显示「我拍了拍{name || "角色"}的{patReply}」
      </Text>

      <Text style={{ color: themeColor.text3, fontSize: 13, marginTop: 16 }}>
        头像（从相册选择）
      </Text>
      <View style={{ flexDirection: "row", marginTop: 10, alignItems: "center", gap: 16 }}>
        <RoleAvatar avatar={avatar} name={name} size={60} />
        <TouchableOpacity
          onPress={pickAvatar}
          style={{
            borderColor: themeColor.text3,
            borderWidth: 1,
            borderRadius: 8,
            paddingHorizontal: 16,
            paddingVertical: 8,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: themeColor.text3, fontSize: 14 }}>＋ 从相册选择</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 16 }}>
        <Text style={{ color: themeColor.text3, fontSize: 13 }}>角色设定（人设）</Text>
      </View>
      <View
        style={{
          backgroundColor: themeColor.bg2,
          borderRadius: 6,
          paddingHorizontal: 12,
          paddingVertical: 10,
          marginTop: 8,
          minHeight: 60,
          justifyContent: "center",
        }}
      >
        <Text
          numberOfLines={4}
          style={{
            fontSize: 14,
            lineHeight: 20,
            color: persona ? themeColor.text5 : themeColor.text2,
          }}
        >
          {persona || "暂无设定，点击下方按钮前往编辑"}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() =>
          navigate.navigate("pages/me/screens/roles/persona", {
            roleId: params.roleId || "",
            initial: persona,
          })
        }
        style={{
          marginTop: 8,
          borderColor: themeColor.primary,
          borderWidth: 1,
          borderRadius: 6,
          paddingVertical: 9,
          alignItems: "center",
        }}
      >
        <Text style={{ color: themeColor.primary, fontSize: 14 }}>
          编辑角色设定
        </Text>
      </TouchableOpacity>

      {params.roleId ? (
        <TouchableOpacity
          onPress={() =>
            navigate.navigate("pages/me/screens/roles/detail", {
              roleId: params.roleId,
            })
          }
          style={{
            marginTop: 8,
            borderColor: themeColor.textBlue,
            borderWidth: 1,
            borderRadius: 6,
            paddingVertical: 9,
            alignItems: "center",
          }}
        >
          <Text style={{ color: themeColor.textBlue, fontSize: 14 }}>
            查看详细资料
          </Text>
        </TouchableOpacity>
      ) : null}

      <Text style={{ color: themeColor.text3, fontSize: 13, marginTop: 16 }}>地区</Text>
      <TextInput
        style={inputStyle}
        value={region}
        onChangeText={setRegion}
        placeholder="例如：中国 长安"
        placeholderTextColor={themeColor.text2}
      />

      <Text style={{ color: themeColor.text3, fontSize: 13, marginTop: 20 }}>
        语音（海豚 TTS）
      </Text>
      <Text style={{ color: themeColor.text2, fontSize: 11, marginTop: 8 }}>
        密钥已内置并加密保存，无需填写。
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, gap: 10 }}>
        <Text style={{ color: themeColor.text3, fontSize: 12, flex: 1 }}>
          {voice ? `已匹配：${voice.voiceName}` : "未设置音色"}
        </Text>
        <TouchableOpacity onPress={autoMatchVoice} disabled={voiceLoading}>
          <Text style={{ color: themeColor.textBlue, fontSize: 13 }}>
            {voiceLoading ? "匹配中…" : "按角色名自动匹配"}
          </Text>
        </TouchableOpacity>
      </View>
      {voiceCandidates.map((c) => (
        <TouchableOpacity
          key={c.voice.voice_id}
          onPress={async () => {
            try {
              const voices = await fetchVoices();
              setVoice({
                provider: "ttson",
                voiceId: c.voice.voice_id,
                voiceName: c.voice.voice_name,
                variants: buildVoiceVariants(name.trim(), voices),
              });
            } catch {
              setVoice({
                provider: "ttson",
                voiceId: c.voice.voice_id,
                voiceName: c.voice.voice_name,
              });
            }
            setVoiceCandidates([]);
            Toast.success("已选择音色");
          }}
          style={{
            backgroundColor: themeColor.bg2,
            borderRadius: 8,
            padding: 10,
            marginTop: 8,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: themeColor.text5, fontSize: 13 }}>
              {c.voice.voice_name}
            </Text>
            <Text style={{ color: themeColor.text2, fontSize: 11 }}>
              匹配度 {c.score}（{c.matchType}）· {(c.voice.tags || []).join(" / ")}
            </Text>
          </View>
          <TouchableOpacity onPress={() => previewVoice(c.voice.voice_id)}>
            <Text style={{ color: themeColor.textBlue, fontSize: 13 }}>试听</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      ))}

      <Text style={{ color: themeColor.text3, fontSize: 13, marginTop: 20 }}>高级设置</Text>
      <View style={{ flexDirection: "row", marginTop: 8, gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: themeColor.text3, fontSize: 12 }}>温度 (0~2)</Text>
          <TextInput
            style={inputStyle}
            value={temperature}
            onChangeText={setTemperature}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: themeColor.text3, fontSize: 12 }}>上下文轮数</Text>
          <TextInput
            style={inputStyle}
            value={contextRounds}
            onChangeText={setContextRounds}
            keyboardType="number-pad"
          />
        </View>
      </View>

      <TouchableOpacity
        onPress={importFromFile}
        style={{
          marginTop: 16,
          borderColor: themeColor.textBlue,
          borderWidth: 1,
          borderRadius: 6,
          paddingVertical: 10,
          alignItems: "center",
        }}
      >
        <Text style={{ color: themeColor.textBlue, fontSize: 15 }}>
          从文件导入（JSON / TXT）
        </Text>
      </TouchableOpacity>
      <Text style={{ color: themeColor.text3, fontSize: 12, marginTop: 14 }}>
        或在上方粘贴角色卡内容（支持 SillyTavern 角色卡 JSON）
      </Text>
      <TextInput
        style={[inputStyle, { minHeight: 90, textAlignVertical: "top" }]}
        value={importText}
        onChangeText={setImportText}
        placeholder="粘贴 JSON 或文本内容…"
        placeholderTextColor={themeColor.text2}
        multiline
      />
      <TouchableOpacity
        onPress={() => parseImport(importText)}
        style={{
          marginTop: 8,
          backgroundColor: themeColor.bg2,
          borderRadius: 6,
          paddingVertical: 10,
          alignItems: "center",
        }}
      >
        <Text style={{ color: themeColor.text5, fontSize: 15 }}>
          解析并填充表单
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => {
          if (params.roleId) {
            navigate.navigate("pages/me/screens/roles/models", {
              roleId: params.roleId,
            });
          } else {
            Toast.info("保存角色后可在编辑中设置模型");
          }
        }}
        style={{
          marginTop: 12,
          borderColor: themeColor.textBlue,
          borderWidth: 1,
          borderRadius: 6,
          paddingVertical: 10,
          alignItems: "center",
        }}
      >
        <Text style={{ color: themeColor.textBlue, fontSize: 15 }}>
          模型设置（文本 / 图像 / 语音）
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => {
          if (params.roleId) {
            navigate.navigate("pages/me/screens/kb/bind", {
              roleId: params.roleId,
            });
          } else {
            Toast.info("保存角色后可在编辑中关联知识库");
          }
        }}
        style={{
          marginTop: 12,
          borderColor: themeColor.textBlue,
          borderWidth: 1,
          borderRadius: 6,
          paddingVertical: 10,
          alignItems: "center",
        }}
      >
        <Text style={{ color: themeColor.textBlue, fontSize: 15 }}>
          关联知识库
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={save}
        style={{
          backgroundColor: themeColor.primary,
          paddingVertical: 12,
          borderRadius: 6,
          alignItems: "center",
          marginTop: 16,
          marginBottom: 30,
        }}
      >
        <Text style={{ color: "#fff", fontSize: 16 }}>保存</Text>
      </TouchableOpacity>

    </ScrollView>
  );
};

export default EditRole;
