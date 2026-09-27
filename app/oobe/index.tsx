import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Linking,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useTheme } from "../../theme/useTheme";
import {
  readOobeSteps,
  saveOobeSteps,
  OobeSteps,
  completeOobe,
  skipOobe,
} from "../store/oobe";
import {
  readProfile,
  saveProfile,
  UserProfile,
  DEFAULT_PROFILE,
  formatBirthday,
} from "../store/profile";
import {
  PRESET_PROVIDERS,
  Provider,
  ProviderModel,
  addProvider,
  readProvidersRaw,
} from "../store/models";
import BirthdayPicker from "../component/base/BirthdayPicker";
import { fetchModels } from "../utils/ai";
import Segment from "../component/base/Segment";
import Toast from "../component/base/Toast";
import WeChatDialog from "../component/base/WeChatDialog";
import PermissionsStep, {
  INITIAL_PERM_STATUSES,
  type PermKey,
  type Status,
} from "./PermissionsStep";

const PRESET_NAMES = [
  "DeepSeek",
  "Xiaomi Mimo",
  "Kimi",
  "智谱",
  "MiniMAX",
  "火山方舟",
  "硅基流动",
  "自定义",
];

function providerLabel(list: Provider[]): string | null {
  for (const p of list) {
    const m = p.models.find((mm) => mm.capabilities.text) || p.models[0];
    if (m) return `${p.name} · ${m.name || m.id}`;
  }
  return null;
}

const Oobe = ({ onDone }: { onDone: () => void }) => {
  const { themeColor } = useTheme();
  const [page, setPage] = useState<0 | 1 | 2>(0);
  const [steps, setSteps] = useState<OobeSteps | null>(null);
  const stepsRef = useRef<OobeSteps | null>(null);

  // AI 模型步骤
  const [modelReady, setModelReady] = useState(false);
  const [modelLabel, setModelLabel] = useState("");
  const [modelConfirm, setModelConfirm] = useState(false);
  const modelConfirmAction = useRef<"next" | "skip">("next");
  const [permReady, setPermReady] = useState(false);
  // 权限状态提升到父组件：切页/返回时不丢失手动确认的结果
  const [permStatuses, setPermStatuses] = useState<
    Record<PermKey, Status>
  >(INITIAL_PERM_STATUSES);
  const [preset, setPreset] = useState("自定义");
  const [apiKey, setApiKey] = useState("");
  const [apiDomain, setApiDomain] = useState("");
  const [consoleUrl, setConsoleUrl] = useState("");
  const [modelList, setModelList] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);

  // 个人资料步骤
  const [profile, setProfile] = useState<UserProfile>({ ...DEFAULT_PROFILE });
  const [birthday, setBirthday] = useState<string | undefined>(undefined);
  const [birthPickerVisible, setBirthPickerVisible] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [kbVisible, setKbVisible] = useState(false);

  useEffect(() => {
    readOobeSteps()
      .then((s) => {
        stepsRef.current = s;
        setSteps(s);
      })
      .catch(() => {});
    readProfile()
      .then((p) => {
        setProfile(p);
        setBirthday(p.birthday);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () =>
      setKbVisible(true)
    );
    const hideSub = Keyboard.addListener("keyboardDidHide", () =>
      setKbVisible(false)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const markModelDone = () => {
    setSteps((s) => {
      const next = { ...(s || { model: false, profile: false }), model: true };
      stepsRef.current = next;
      saveOobeSteps(next).catch(() => {});
      return next;
    });
  };

  const goNextFromModel = () => {
    if (modelReady || !!steps?.model) {
      setPage(2);
      return;
    }
    modelConfirmAction.current = "next";
    setModelConfirm(true);
  };

  const onPermGranted = useCallback((v: boolean) => setPermReady(v), []);

  const skipFromModel = () => {
    if (modelReady || !!steps?.model) {
      skip();
      return;
    }
    modelConfirmAction.current = "skip";
    setModelConfirm(true);
  };

  const choosePreset = (name: string) => {
    setPreset(name);
    setApiKey("");
    setModelList(null);
    setSelected([]);
    const p = PRESET_PROVIDERS.find((x) => x.name === name);
    setApiDomain(p?.apiDomain || "");
    setConsoleUrl(p?.consoleUrl || "");
  };

  const getModels = async () => {
    const domain = apiDomain.trim();
    if (!domain || !apiKey.trim()) {
      Toast.fail("请填写接口地址和 API Key");
      return;
    }
    setFetching(true);
    try {
      const p = PRESET_PROVIDERS.find((x) => x.name === preset);
      const result = await fetchModels(
        { apiDomain: domain, apiKey: apiKey.trim(), model: "" },
        p?.apiDomains?.slice(1)
      );
      setModelList(result.models);
      setSelected(result.models.length ? [result.models[0]] : []);
      if (result.domain && result.domain !== domain) {
        setApiDomain(result.domain);
      }
    } catch (e: any) {
      Toast.fail(e?.message || "获取模型列表失败");
    } finally {
      setFetching(false);
    }
  };

  const toggleModel = (id: string) => {
    setSelected((pre) =>
      pre.includes(id) ? pre.filter((x) => x !== id) : [...pre, id]
    );
  };

  const saveModel = async () => {
    const domain = apiDomain.trim();
    if (!domain || !apiKey.trim()) {
      Toast.fail("请先填写 API Key");
      return;
    }
    if (!modelList || !selected.length) {
      Toast.fail("请先获取模型列表并选择模型");
      return;
    }
    setSaving(true);
    try {
      const p = PRESET_PROVIDERS.find((x) => x.name === preset);
      const models: ProviderModel[] = selected.map((id) => ({
        id,
        name: id,
        capabilities: {
          text: true,
          image: false,
          video: false,
          audio: false,
          stt: false,
          tts: false,
        },
      }));
      await addProvider({
        id: "",
        name: preset === "自定义" ? "自定义" : preset,
        apiDomain: domain,
        apiDomains: p?.apiDomains?.length
          ? [domain, ...p.apiDomains.filter((d) => d !== domain)]
          : [domain],
        apiKey: apiKey.trim(),
        consoleUrl:
          preset === "自定义"
            ? consoleUrl.trim() || undefined
            : p?.consoleUrl,
        models,
      });
      const list = await readProvidersRaw();
      const label = providerLabel(list);
      setModelReady(!!label);
      setModelLabel(label || "");
      markModelDone();
      Toast.success("模型配置完成");
    } catch (e: any) {
      Toast.fail(e?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Toast.fail("需要相册权限才能选择头像");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (res.canceled || !res.assets?.length) return;
    let uri = res.assets[0].uri;
    if (FileSystem.documentDirectory) {
      try {
        const ext = (uri.split(".").pop() || "jpg").split("?")[0];
        const dest = `${FileSystem.documentDirectory}avatar-${Date.now()}.${ext}`;
        await FileSystem.copyAsync({ from: uri, to: dest });
        uri = dest;
      } catch {}
    }
    setProfile((p) => ({ ...p, avatar: uri }));
  };

  const finish = async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      await saveProfile({
        ...profile,
        birthday,
      });
    } catch {}
    await completeOobe();
    onDone();
  };

  const skip = async () => {
    if (finishing) return;
    setFinishing(true);
    await skipOobe();
    onDone();
  };

  const progress = useMemo(
    () => [
      { key: "perm", label: "权限", done: page > 0 },
      { key: "model", label: "AI 模型", done: page > 1 || !!steps?.model },
      { key: "profile", label: "个人资料", done: !!steps?.profile },
    ],
    [steps, page]
  );

  const inputStyle = {
    backgroundColor: themeColor.bg2,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: themeColor.text5,
    marginTop: 8,
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#EDEDED" }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 22,
          paddingTop: 56,
          paddingBottom: 30,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* 标题 */}
        <View style={{ alignItems: "center" }}>
          <Text
            style={{
              fontSize: 22,
              fontWeight: "700",
              color: themeColor.text5,
            }}
          >
            欢迎使用 RE:SON
          </Text>
          <Text
            style={{
              marginTop: 8,
              fontSize: 14,
              color: themeColor.text2,
              textAlign: "center",
              lineHeight: 21,
            }}
          >
            {page === 0
              ? "先完成关键权限，角色才能稳定找到你"
              : page === 1
              ? "先配置 AI 模型，角色才能和你对话"
              : "告诉角色怎么称呼你"}
          </Text>
        </View>

        {/* 步骤进度 */}
        <View
          style={{
            marginTop: 20,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          {progress.map((p, i) => {
            const active = i === page;
            const done = p.done;
            return (
              <React.Fragment key={p.key}>
                {i > 0 && (
                  <View
                    style={{
                      flex: 1,
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: done ? themeColor.primary : "#D8D8D8",
                      marginHorizontal: 10,
                    }}
                  />
                )}
                <View style={{ alignItems: "center", width: 62 }}>
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      backgroundColor: done
                        ? themeColor.primary
                        : active
                        ? "#fff"
                        : "#D8D8D8",
                      borderWidth: active && !done ? 2 : 0,
                      borderColor: themeColor.primary,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {done ? (
                      <Text style={{ color: "#fff", fontSize: 12 }}>✓</Text>
                    ) : (
                      <Text
                        style={{
                          color: active
                            ? themeColor.primary
                            : themeColor.text3,
                          fontSize: 12,
                        }}
                      >
                        {i + 1}
                      </Text>
                    )}
                  </View>
                  <Text
                    style={{
                      marginTop: 5,
                      fontSize: 12,
                      color: active ? themeColor.text5 : themeColor.text3,
                    }}
                  >
                    {p.label}
                  </Text>
                </View>
              </React.Fragment>
            );
          })}
        </View>

        {page === 0 ? (
          <PermissionsStep
            statuses={permStatuses}
            onChange={setPermStatuses}
            onAllGranted={onPermGranted}
          />
        ) : page === 1 ? (
          <>
            {modelReady ? (
              <View
                style={{
                  backgroundColor: themeColor.primary,
                  borderRadius: 12,
                  padding: 14,
                  marginTop: 20,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <Text
                  style={{ color: "#fff", fontSize: 15, fontWeight: "600" }}
                >
                  模型已就绪
                </Text>
                <Text
                  numberOfLines={1}
                  style={{
                    color: "#fff",
                    fontSize: 13,
                    marginLeft: 10,
                    flex: 1,
                  }}
                >
                  {modelLabel}
                </Text>
              </View>
            ) : null}

            {/* 添加供应商表单 */}
            <View
              style={{
                backgroundColor: "#fff",
                borderRadius: 12,
                padding: 16,
                marginTop: modelReady ? 12 : 20,
              }}
            >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 10,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      color: themeColor.text3,
                    }}
                  >
                    供应商
                  </Text>
                  <Text
                    style={{
                      fontSize: 11,
                      color: themeColor.text2,
                      marginLeft: 8,
                    }}
                  >
                    选择快捷添加
                  </Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingRight: 8 }}
                >
                  {PRESET_NAMES.map((name) => {
                    const active = preset === name;
                    return (
                      <TouchableOpacity
                        key={name}
                        onPress={() => choosePreset(name)}
                        style={{
                          borderWidth: 1,
                          borderColor: active
                            ? themeColor.textBlue
                            : themeColor.line2,
                          borderRadius: 14,
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          backgroundColor: active ? "#EAF2FE" : "#fff",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            color: active
                              ? themeColor.textBlue
                              : themeColor.text5,
                          }}
                        >
                          {name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <View
                  style={{
                    height: 0.5,
                    backgroundColor: themeColor.line2,
                    marginTop: 16,
                    marginBottom: 14,
                  }}
                />
                <Text
                  style={{
                    fontSize: 13,
                    color: themeColor.text3,
                    marginBottom: 10,
                  }}
                >
                  凭据
                </Text>

                {preset === "自定义" ? (
                  <>
                    <Text
                      style={{
                        color: themeColor.text3,
                        fontSize: 13,
                        marginTop: 16,
                      }}
                    >
                      接口地址
                    </Text>
                    <TextInput
                      style={inputStyle}
                      value={apiDomain}
                      onChangeText={setApiDomain}
                      placeholder="https://api.example.com/v1"
                      placeholderTextColor={themeColor.text2}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <Text
                      style={{
                        color: themeColor.text3,
                        fontSize: 13,
                        marginTop: 16,
                      }}
                    >
                      控制台网址（可选）
                    </Text>
                    <TextInput
                      style={inputStyle}
                      value={consoleUrl}
                      onChangeText={setConsoleUrl}
                      placeholder="https://platform.example.com"
                      placeholderTextColor={themeColor.text2}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </>
                ) : null}

                <Text
                  style={{
                    color: themeColor.text3,
                    fontSize: 13,
                    marginTop: 16,
                  }}
                >
                  API Key{consoleUrl ? "（请前往控制台获取）" : ""}
                </Text>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <TextInput
                    style={[inputStyle, { flex: 1, marginTop: 8 }]}
                    value={apiKey}
                    onChangeText={setApiKey}
                    placeholder="sk- 或 tp- 开头"
                    placeholderTextColor={themeColor.text2}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {consoleUrl ? (
                    <TouchableOpacity
                      onPress={() => Linking.openURL(consoleUrl)}
                      style={{
                        borderWidth: 1,
                        borderColor: themeColor.textBlue,
                        borderRadius: 6,
                        paddingHorizontal: 10,
                        marginTop: 8,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{ color: themeColor.textBlue, fontSize: 13 }}
                      >
                        打开控制台
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                <TouchableOpacity
                  onPress={getModels}
                  disabled={fetching}
                  style={{
                    marginTop: 16,
                    borderWidth: 1,
                    borderColor: themeColor.textBlue,
                    borderRadius: 6,
                    paddingVertical: 10,
                    alignItems: "center",
                  }}
                >
                  {fetching ? (
                    <ActivityIndicator size="small" color={themeColor.textBlue} />
                  ) : (
                    <Text style={{ color: themeColor.textBlue, fontSize: 14 }}>
                      获取模型列表
                    </Text>
                  )}
                </TouchableOpacity>

                {modelList ? (
                  <View style={{ marginTop: 16 }}>
                    <View
                      style={{
                        height: 0.5,
                        backgroundColor: themeColor.line2,
                        marginBottom: 14,
                      }}
                    />
                    <Text
                      style={{
                        color: themeColor.text3,
                        fontSize: 13,
                        marginBottom: 8,
                      }}
                    >
                      模型
                    </Text>
                    <Text style={{ color: themeColor.text3, fontSize: 13 }}>
                      选择要添加的模型（{selected.length}/{modelList.length}）
                    </Text>
                    <ScrollView
                      style={{ maxHeight: 200, marginTop: 6 }}
                    >
                      {modelList.map((id) => {
                        const on = selected.includes(id);
                        return (
                          <TouchableOpacity
                            key={id}
                            onPress={() => toggleModel(id)}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              paddingVertical: 8,
                            }}
                          >
                            <View
                              style={{
                                width: 16,
                                height: 16,
                                borderRadius: 3,
                                borderWidth: 1,
                                borderColor: on
                                  ? themeColor.primary
                                  : themeColor.text3,
                                backgroundColor: on ? themeColor.primary : "#fff",
                                alignItems: "center",
                                justifyContent: "center",
                                marginRight: 8,
                              }}
                            >
                              {on ? (
                                <Text style={{ color: "#fff", fontSize: 10 }}>
                                  ✓
                                </Text>
                              ) : null}
                            </View>
                            <Text
                              style={{
                                flex: 1,
                                fontSize: 14,
                                color: themeColor.text5,
                              }}
                            >
                              {id}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                    <TouchableOpacity
                      onPress={saveModel}
                      disabled={saving || !selected.length}
                      style={{
                        marginTop: 12,
                        backgroundColor: selected.length
                          ? themeColor.primary
                          : "#A6A6A6",
                        borderRadius: 6,
                        paddingVertical: 10,
                        alignItems: "center",
                      }}
                    >
                      {saving ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={{ color: "#fff", fontSize: 14 }}>
                          保存模型配置
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
          </>
        ) : (
          <>
            {/* 头像 */}
            <View
              style={{
                backgroundColor: "#fff",
                borderRadius: 12,
                padding: 16,
                marginTop: 20,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <Text style={{ flex: 1, fontSize: 15, color: themeColor.text5 }}>
                头像
              </Text>
              <TouchableOpacity
                onPress={pickAvatar}
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 6,
                  overflow: "hidden",
                }}
              >
                <Image
                  source={
                    profile.avatar
                      ? { uri: profile.avatar }
                      : require("../../assets/avatar-default.jpeg")
                  }
                  style={{ width: 56, height: 56 }}
                />
                <View
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: "rgba(0,0,0,0.45)",
                    paddingVertical: 2,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "#fff", fontSize: 10 }}>
                    点击更换
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* 基本资料 */}
            <View
              style={{
                backgroundColor: "#fff",
                borderRadius: 12,
                padding: 16,
                marginTop: 12,
              }}
            >
              <Text
                style={{ color: themeColor.text3, fontSize: 13 }}
              >
                昵称
              </Text>
              <TextInput
                style={inputStyle}
                value={profile.name}
                onChangeText={(v) => setProfile((p) => ({ ...p, name: v }))}
                placeholder="输入昵称"
                placeholderTextColor={themeColor.text2}
              />

              <Text
                style={{
                  color: themeColor.text3,
                  fontSize: 13,
                  marginTop: 16,
                }}
              >
                性别
              </Text>
              <Segment
                options={[
                  { label: "男", value: "male" },
                  { label: "女", value: "female" },
                ]}
                value={profile.gender}
                onChange={(v) =>
                  setProfile((p) => ({
                    ...p,
                    gender: v as UserProfile["gender"],
                  }))
                }
              />

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginTop: 16,
                  paddingVertical: 8,
                }}
              >
                <Text
                  style={{ color: themeColor.text3, fontSize: 13, flex: 1 }}
                >
                  生日
                </Text>
                {birthday ? (
                  <TouchableOpacity
                    onPress={() => setBirthday(undefined)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text
                      style={{
                        color: themeColor.text2,
                        fontSize: 13,
                        marginRight: 12,
                      }}
                    >
                      清除
                    </Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity onPress={() => setBirthPickerVisible(true)}>
                  <Text
                    style={{
                      color: birthday ? themeColor.text5 : themeColor.text2,
                      fontSize: 15,
                    }}
                  >
                    {formatBirthday(birthday)}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text
                style={{ color: themeColor.text2, fontSize: 12, marginTop: 6 }}
              >
                生日当天，你添加的好友会陆续送来祝福（可留空）
              </Text>

              <Text
                style={{
                  color: themeColor.text2,
                  fontSize: 12,
                  marginTop: 12,
                  lineHeight: 18,
                }}
              >
                这些信息会作为角色了解你的基础资料，之后可在“我 → 设置”中随时修改。
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      <BirthdayPicker
        visible={birthPickerVisible}
        value={birthday}
        onConfirm={setBirthday}
        onClose={() => setBirthPickerVisible(false)}
      />

      {/* 底部按钮（键盘弹出时隐藏，避免误以为可以点下一步） */}
      {!kbVisible ? (
        <View
          style={{
            paddingHorizontal: 22,
            paddingBottom: 30,
            paddingTop: 8,
            backgroundColor: "#EDEDED",
          }}
        >
        {page === 0 ? (
          <>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setPage(1)}
              disabled={!permReady}
              style={{
                backgroundColor: permReady ? themeColor.primary : "#A6A6A6",
                height: 48,
                borderRadius: 24,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}
              >
                下一步
              </Text>
            </TouchableOpacity>
          </>
        ) : page === 1 ? (
          <>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={goNextFromModel}
              style={{
                backgroundColor: themeColor.primary,
                height: 48,
                borderRadius: 24,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}
              >
                下一步
              </Text>
            </TouchableOpacity>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginTop: 14,
                paddingHorizontal: 8,
              }}
            >
              <TouchableOpacity onPress={() => setPage(0)} disabled={finishing}>
                <Text style={{ color: themeColor.text3, fontSize: 14 }}>
                  上一步
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={skipFromModel} disabled={finishing}>
                <Text style={{ color: themeColor.text3, fontSize: 14 }}>
                  跳过引导
                </Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={finish}
              disabled={finishing}
              style={{
                backgroundColor: themeColor.primary,
                height: 48,
                borderRadius: 24,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {finishing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text
                  style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}
                >
                  完成设置
                </Text>
              )}
            </TouchableOpacity>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginTop: 14,
                paddingHorizontal: 8,
              }}
            >
              <TouchableOpacity
                onPress={() => setPage(1)}
                disabled={finishing}
              >
                <Text style={{ color: themeColor.text3, fontSize: 14 }}>
                  上一步
                </Text>
              </TouchableOpacity>
            </View>
          </>
          )}
        </View>
      ) : null}

      <WeChatDialog
        visible={modelConfirm}
        title="还没有添加模型"
        children={
          <View>
            <Text
              style={{
                fontSize: 16,
                fontWeight: "700",
                color: themeColor.danger6,
                textAlign: "center",
              }}
            >
              无法与角色聊天
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: themeColor.text3,
                textAlign: "center",
                lineHeight: 21,
                marginTop: 8,
              }}
            >
              建议先添加你自己的模型供应商，也可以稍后在“我 → 模型管理”中配置。
            </Text>
          </View>
        }
        confirmText="去添加"
        cancelText="仍要继续"
        cancelCountdown={3}
        backdropClosable={false}
        onBackdropPress={() => setModelConfirm(false)}
        onCancel={() => {
          setModelConfirm(false);
          if (modelConfirmAction.current === "skip") {
            skip();
          } else {
            setPage(2);
          }
        }}
        onConfirm={() => setModelConfirm(false)}
      />
    </View>
  );
};

export default Oobe;
