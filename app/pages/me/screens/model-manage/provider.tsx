import { useEffect, useLayoutEffect, useState } from "react";
import {
  Linking,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useTheme } from "../../../../../theme/useTheme";
import {
  CAP_LABELS_ALL,
  PRESET_PROVIDERS,
  Provider,
  ProviderModel,
  addProvider,
  deleteProvider,
  readProvidersRaw,
  updateProvider,
} from "../../../../store/models";
import {
  fetchModels,
  testConnection,
  testModelCapabilities,
} from "../../../../utils/ai";
import eventBus from "../../../../utils/eventBus";
import Toast from "../../../../component/base/Toast";
import ConfirmDialog from "../../../../component/complex/ConfirmDialog";

interface PendingModel {
  id: string;
  name: string;
  caps: {
    text: boolean;
    image: boolean;
    video: boolean;
    audio: boolean;
    stt: boolean;
    tts: boolean;
  };
}

const EMPTY_CAPS = {
  text: false,
  image: false,
  video: false,
  audio: false,
  stt: false,
  tts: false,
};

const ProviderEdit = () => {
  const { themeColor } = useTheme();
  const navigate = useNavigation();
  const params = useLocalSearchParams<{
    providerId?: string;
  }>();
  const [form, setForm] = useState<Provider>({
    id: "",
    name: "",
    apiDomain: "",
    apiKey: "",
    models: [],
  });
  const [pendingModels, setPendingModels] = useState<PendingModel[]>([]);
  const [fetchedModels, setFetchedModels] = useState<string[] | null>(null);
  const [modelLoading, setModelLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testingAll, setTestingAll] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);
  const [delProvider, setDelProvider] = useState(false);
  const [delModelId, setDelModelId] = useState<string | null>(null);
  const [collapseAdvanced, setCollapseAdvanced] = useState(false);

  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerTitle: params.providerId ? "编辑供应商" : "添加模型",
      headerTitleAlign: "center",
      headerTintColor: "#111",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: "#fff" },
    });
  }, [params.providerId]);

  useEffect(() => {
    if (params.providerId) {
      readProvidersRaw().then((list) => {
        const p = list.find((x) => x.id === params.providerId);
        if (p) {
          setForm({
            ...p,
            apiDomains: p.apiDomains?.length ? [...p.apiDomains] : [p.apiDomain],
            models: [...p.models],
          });
          setPendingModels(
            p.models.map((m) => ({
              id: m.id,
              name: m.name || m.id,
              caps: {
                ...EMPTY_CAPS,
                text: m.capabilities?.text ?? true,
                image: m.capabilities?.image ?? false,
                video: m.capabilities?.video ?? false,
                audio: m.capabilities?.audio ?? false,
                stt: m.capabilities?.stt ?? false,
                tts: m.capabilities?.tts ?? false,
              },
            }))
          );
        }
      });
    }
  }, [params.providerId]);

  const set = (key: keyof Provider) => (val: string) => {
    setForm((pre) => ({ ...pre, [key]: val }));
  };

  const setKey = (val: string) => {
    setForm((pre) => ({ ...pre, apiKey: val }));
  };

  const choosePreset = (name: string, apiDomain: string, consoleUrl: string) => {
    const preset = PRESET_PROVIDERS.find((x) => x.name === name);
    setForm((pre) => ({
      ...pre,
      name,
      apiDomain,
      apiDomains: preset?.apiDomains?.length
        ? preset.apiDomains
        : [apiDomain],
      consoleUrl,
      apiKey: "",
    }));
    setPendingModels([]);
    setCollapseAdvanced(name !== "自定义");
  };

  const getModels = async () => {
    if (!form.apiDomain.trim() || !form.apiKey.trim()) {
      Toast.fail("请先填写接口地址和 API Key");
      return;
    }
    setModelLoading(true);
    try {
      const result = await fetchModels(
        {
          apiDomain: form.apiDomain,
          apiKey: form.apiKey,
          model: "",
        },
        form.apiDomains?.slice(1)
      );
      setFetchedModels(result.models);
      // 哪个域名能扫到模型就保存哪个，避免订阅密钥/普通密钥用错接口地址
      if (result.domain && result.domain !== form.apiDomain) {
        setForm((pre) => ({ ...pre, apiDomain: result.domain }));
        Toast.info("已自动切换可用接口地址：" + result.domain);
      }
    } catch (e: any) {
      Toast.fail(e?.message || "获取失败");
    } finally {
      setModelLoading(false);
    }
  };

  const addSelectedModels = (ids: string[]) => {
    setPendingModels((pre) => {
      const next = [...pre];
      ids.forEach((id) => {
        if (!next.some((m) => m.id === id)) {
          next.push({
            id,
            name: id,
            caps: { ...EMPTY_CAPS, text: true },
          });
        }
      });
      return next;
    });
    setFetchedModels(null);
  };

  const toggleCaps = (modelId: string, key: keyof PendingModel["caps"]) => {
    setPendingModels((pre) =>
      pre.map((m) =>
        m.id === modelId
          ? { ...m, caps: { ...m.caps, [key]: !m.caps[key] } }
          : m
      )
    );
  };

  const testOneModel = async (model: PendingModel) => {
    if (!form.apiDomain.trim() || !form.apiKey.trim()) {
      Toast.fail("请先填写接口地址和 API Key");
      return;
    }
    setTestingId(model.id);
    try {
      const caps = await testModelCapabilities(
        {
          apiDomain: form.apiDomain,
          apiKey: form.apiKey,
          model: model.id,
        },
        model.id,
        form.apiDomains?.slice(1)
      );
      setPendingModels((pre) =>
        pre.map((m) =>
          m.id === model.id
            ? {
                ...m,
                caps: { ...caps },
              }
            : m
        )
      );
      const found = CAP_LABELS_ALL
        .filter((c) => caps[c.key])
        .map((c) => c.label);
      Toast.success(
        found.length
          ? `检测到能力：${found.join(" / ")}`
          : "未检测到可用能力"
      );
    } catch (e: any) {
      Toast.fail(e?.message || "测试失败");
    } finally {
      setTestingId(null);
    }
  };

  const testAllModels = async () => {
    if (!pendingModels.length) {
      Toast.fail("请先获取并添加模型");
      return;
    }
    if (!form.apiDomain.trim() || !form.apiKey.trim()) {
      Toast.fail("请先填写接口地址和 API Key");
      return;
    }
    setTestingAll(true);
    for (let i = 0; i < pendingModels.length; i++) {
      const model = pendingModels[i];
      Toast.info(`正在检测 ${i + 1}/${pendingModels.length}：${model.name}`);
      try {
        const caps = await testModelCapabilities(
          {
            apiDomain: form.apiDomain,
            apiKey: form.apiKey,
            model: model.id,
          },
          model.id,
          form.apiDomains?.slice(1)
        );
        setPendingModels((pre) =>
          pre.map((m) =>
            m.id === model.id
              ? {
                  ...m,
                  caps: { ...caps },
                }
              : m
          )
        );
      } catch {}
    }
    setTestingAll(false);
    Toast.success("全部检测完成");
  };

  const save = async () => {
    if (!form.name.trim() || !form.apiDomain.trim() || !form.apiKey.trim()) {
      Toast.fail("名称、接口地址、API Key 都不能为空");
      return;
    }
    if (!pendingModels.length) {
      Toast.fail("请至少添加一个模型");
      return;
    }
    const models: ProviderModel[] = pendingModels.map((m) => ({
      id: m.id,
      name: m.name,
      capabilities: { ...m.caps },
    }));
    const data = { ...form, models };
    if (form.id) {
      await updateProvider(form.id, data);
    } else {
      await addProvider({ ...data, id: "" });
    }
    eventBus.emit("providers-updated");
    Toast.success("已保存");
    navigate.goBack();
  };

  const test = async () => {
    if (!form.apiDomain.trim() || !form.apiKey.trim()) {
      Toast.fail("请先填写接口地址和 API Key");
      return;
    }
    setTesting(true);
    try {
      const msg = await testConnection({
        apiDomain: form.apiDomain,
        apiKey: form.apiKey,
        model: pendingModels[0]?.id || "",
      }, form.apiDomains?.slice(1));
      Toast.success(msg);
    } catch (e: any) {
      Toast.fail(e?.message || "连接失败");
    } finally {
      setTesting(false);
    }
  };

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
    <ScrollView style={{ backgroundColor: "#fff", flex: 1, padding: 16 }}>
      <Text style={{ color: themeColor.text3, fontSize: 13 }}>
      </Text>

      {!form.id && (
        <>
          <Text style={{ color: themeColor.text3, fontSize: 13, marginTop: 16 }}>
            快捷添加供应商
          </Text>
          <TouchableOpacity
            onPress={() => setPresetOpen(true)}
            style={{
              borderWidth: 1,
              borderColor: themeColor.line2,
              borderRadius: 6,
              paddingHorizontal: 12,
              paddingVertical: 10,
              backgroundColor: themeColor.bg2,
              marginTop: 8,
            }}
          >
            <Text style={{ fontSize: 14, color: themeColor.text5 }}>
              {form.name || "选择供应商预设"} ▾
            </Text>
          </TouchableOpacity>
          <Modal
            visible={presetOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setPresetOpen(false)}
          >
            <View
              style={{
                flex: 1,
                backgroundColor: "rgba(0,0,0,0.4)",
                justifyContent: "center",
                padding: 30,
              }}
            >
              <View
                style={{
                  backgroundColor: "#fff",
                  borderRadius: 10,
                  maxHeight: "75%",
                  padding: 16,
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: "600", color: "#222" }}>
                  选择供应商
                </Text>
                <ScrollView style={{ marginTop: 10 }}>
                  {PRESET_PROVIDERS.map((p) => (
                    <TouchableOpacity
                      key={p.name}
                      onPress={() => {
                        choosePreset(p.name, p.apiDomain, p.consoleUrl);
                        setPresetOpen(false);
                      }}
                      style={{
                        paddingVertical: 10,
                        borderBottomWidth: 0.5,
                        borderBottomColor: themeColor.line2,
                      }}
                    >
                      <Text style={{ fontSize: 15, color: themeColor.text5 }}>
                        {p.name}
                      </Text>
                      <Text style={{ fontSize: 12, color: themeColor.text3 }}>
                        {p.apiDomain}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    onPress={() => {
                      choosePreset("自定义", "", "");
                      setPresetOpen(false);
                    }}
                    style={{
                      paddingVertical: 10,
                      borderBottomWidth: 0.5,
                      borderBottomColor: themeColor.line2,
                    }}
                  >
                    <Text style={{ fontSize: 15, color: themeColor.text5 }}>
                      自定义
                    </Text>
                    <Text style={{ fontSize: 12, color: themeColor.text3 }}>
                      自己填写接口地址
                    </Text>
                  </TouchableOpacity>
                </ScrollView>
                <TouchableOpacity
                  onPress={() => setPresetOpen(false)}
                  style={{ alignItems: "center", paddingTop: 12 }}
                >
                  <Text style={{ color: themeColor.text3, fontSize: 14 }}>
                    取消
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        </>
      )}

      <Text style={{ color: themeColor.text3, fontSize: 13, marginTop: 16 }}>
        供应商名称
      </Text>
      <TextInput
        style={inputStyle}
        value={form.name}
        onChangeText={set("name")}
        placeholder="例如：DeepSeek"
        placeholderTextColor={themeColor.text2}
      />

      {!collapseAdvanced && (
        <>
                <Text style={{ color: themeColor.text3, fontSize: 13, marginTop: 16 }}>
            接口地址（OpenAI 兼容）
          </Text>
          <TextInput
            style={inputStyle}
            value={form.apiDomain}
            onChangeText={(v) => {
              setForm((pre) => ({
                ...pre,
                apiDomain: v,
                apiDomains: pre.apiDomains?.length
                  ? [v, ...pre.apiDomains.slice(1)]
                  : [v],
              }));
            }}
            placeholder="https://api.deepseek.com"
            placeholderTextColor={themeColor.text2}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {(form.apiDomains || []).slice(1).map((d, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <TextInput
                style={[inputStyle, { flex: 1, marginTop: 0 }]}
                value={d}
                onChangeText={(v) =>
                  setForm((pre) => {
                    const list = pre.apiDomains || [pre.apiDomain];
                    const next = list.map((x, j) => (j === i + 1 ? v : x));
                    return { ...pre, apiDomains: next };
                  })
                }
                placeholder="备用接口地址"
                placeholderTextColor={themeColor.text2}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                onPress={() =>
                  setForm((pre) => {
                    const list = pre.apiDomains || [pre.apiDomain];
                    return { ...pre, apiDomains: list.filter((_, j) => j !== i + 1) };
                  })
                }
                style={{ justifyContent: "center", paddingHorizontal: 4 }}
              >
                <Text style={{ color: themeColor.danger6, fontSize: 14 }}>
                  删除
                </Text>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity
            onPress={() =>
              setForm((pre) => ({
                ...pre,
                apiDomains: [...(pre.apiDomains || [pre.apiDomain]), ""],
              }))
            }
            style={{ marginTop: 8, alignSelf: "flex-start" }}
          >
            <Text style={{ color: themeColor.textBlue, fontSize: 13 }}>
              ＋ 添加备用接口地址
            </Text>
          </TouchableOpacity>
        </>
      )}

      {collapseAdvanced ? (
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 16, gap: 10 }}>
          {!!form.consoleUrl && (
            <TouchableOpacity
              onPress={() => Linking.openURL(form.consoleUrl!)}
              style={{
                borderWidth: 1,
                borderColor: themeColor.textBlue,
                borderRadius: 6,
                paddingHorizontal: 14,
                paddingVertical: 8,
              }}
            >
              <Text style={{ color: themeColor.textBlue, fontSize: 13 }}>
                打开控制台
              </Text>
            </TouchableOpacity>
          )}

        </View>
      ) : (
        <>
                <Text style={{ color: themeColor.text3, fontSize: 13, marginTop: 16 }}>
                  控制台网址（可选）
                </Text>
                <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
                  <TextInput
                    style={[inputStyle, { flex: 1, marginTop: 0 }]}
                    value={form.consoleUrl || ""}
                    onChangeText={set("consoleUrl")}
                    placeholder="https://platform.xxx.com"
                    placeholderTextColor={themeColor.text2}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {!!form.consoleUrl && (
                    <TouchableOpacity
                      onPress={() => Linking.openURL(form.consoleUrl!)}
                      style={{
                        borderWidth: 1,
                        borderColor: themeColor.textBlue,
                        borderRadius: 6,
                        paddingHorizontal: 12,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ color: themeColor.textBlue, fontSize: 13 }}>
                        打开控制台
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
        </>
      )}

      <Text style={{ color: themeColor.text3, fontSize: 13, marginTop: 16 }}>
        API Key（请前往控制台获取）
      </Text>
      <TextInput
        style={inputStyle}
        value={form.apiKey}
        onChangeText={setKey}
        placeholder="sk-... 或 tp-..."
        placeholderTextColor={themeColor.text2}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />

      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 18 }}>
        <Text style={{ color: themeColor.text3, fontSize: 13 }}>
          模型列表（{pendingModels.length}）
        </Text>
        <TouchableOpacity
          onPress={testAllModels}
          disabled={testingAll}
          style={{
            borderWidth: 1,
            borderColor: themeColor.primary,
            borderRadius: 4,
            paddingHorizontal: 10,
            paddingVertical: 4,
            marginLeft: 10,
          }}
        >
          <Text style={{ color: themeColor.primary, fontSize: 12 }}>
            {testingAll ? "检测中…" : "一键检测全部"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={getModels}
          style={{
            borderWidth: 1,
            borderColor: themeColor.primary,
            borderRadius: 4,
            paddingHorizontal: 10,
            paddingVertical: 4,
            marginLeft: 10,
          }}
        >
          <Text style={{ color: themeColor.primary, fontSize: 12 }}>
            {modelLoading ? "获取中…" : "获取模型列表"}
          </Text>
        </TouchableOpacity>
      </View>

      {pendingModels.map((m) => (
        <View
          key={m.id}
          style={{
            borderWidth: 0.5,
            borderColor: themeColor.line2,
            borderRadius: 8,
            padding: 10,
            marginTop: 8,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ flex: 1, fontSize: 14, color: themeColor.text5 }}>
              {m.name}
            </Text>
            <TouchableOpacity
              onPress={() => testOneModel(m)}
              disabled={testingId === m.id}
              style={{
                borderWidth: 1,
                borderColor: themeColor.textBlue,
                borderRadius: 4,
                paddingHorizontal: 8,
                paddingVertical: 3,
                marginRight: 8,
              }}
            >
              <Text style={{ color: themeColor.textBlue, fontSize: 12 }}>
                {testingId === m.id ? "测试中…" : "测试能力"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() =>
                setDelModelId(m.id)
              }
            >
              <Text style={{ color: themeColor.danger6, fontSize: 13 }}>
                删除
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginTop: 8 }}
          >
            <View style={{ flexDirection: "row", gap: 16, paddingRight: 8 }}>
              {CAP_LABELS_ALL.map((c) => (
                <TouchableOpacity
                  key={c.key}
                  onPress={() => toggleCaps(m.id, c.key)}
                  style={{ flexDirection: "row", alignItems: "center" }}
                >
                  <View
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 3,
                      borderWidth: 1,
                      borderColor: m.caps[c.key]
                        ? themeColor.primary
                        : themeColor.text3,
                      backgroundColor: m.caps[c.key]
                        ? themeColor.primary
                        : "#fff",
                      marginRight: 4,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {m.caps[c.key] && (
                      <Text style={{ color: "#fff", fontSize: 10 }}>✓</Text>
                    )}
                  </View>
                  <Text style={{ fontSize: 13, color: themeColor.text5 }}>
                    {c.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      ))}
      {pendingModels.length === 0 && (
        <Text style={{ color: themeColor.text3, fontSize: 13, marginTop: 10 }}>
          点「获取模型列表」选择要添加的模型
        </Text>
      )}

      <View style={{ flexDirection: "row", marginTop: 24, gap: 10 }}>
        <TouchableOpacity
          onPress={save}
          style={{
            flex: 1,
            backgroundColor: themeColor.primary,
            borderRadius: 6,
            paddingVertical: 11,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#fff", fontSize: 15 }}>保存</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={test}
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: themeColor.primary,
            borderRadius: 6,
            paddingVertical: 11,
            alignItems: "center",
          }}
        >
          <Text style={{ color: themeColor.primary, fontSize: 15 }}>
            {testing ? "测试中…" : "测试连接"}
          </Text>
        </TouchableOpacity>
      </View>
      {!!form.id && (
        <TouchableOpacity
          onPress={() => setDelProvider(true)}
          style={{ alignItems: "center", paddingVertical: 12 }}
        >
          <Text style={{ color: themeColor.danger6, fontSize: 14 }}>
            删除该供应商
          </Text>
        </TouchableOpacity>
      )}

      {/* 获取模型列表 → 多选添加 */}
      <Modal
        visible={!!fetchedModels}
        transparent
        animationType="fade"
        onRequestClose={() => setFetchedModels(null)}
      >
        <ModelPicker
          models={fetchedModels || []}
          themeColor={themeColor}
          onClose={() => setFetchedModels(null)}
          onConfirm={addSelectedModels}
        />
      </Modal>

      {/* 删除确认 */}
      <ConfirmDialog
        visible={delProvider}
        title="删除供应商"
        message={`确定删除「${form.name}」及其全部模型吗？此操作不可恢复。`}
        onCancel={() => setDelProvider(false)}
        onConfirm={async () => {
          setDelProvider(false);
          await deleteProvider(form.id);
          eventBus.emit("providers-updated");
          Toast.success("已删除");
          navigate.goBack();
        }}
      />
      <ConfirmDialog
        visible={!!delModelId}
        title="删除模型"
        message={`确定删除模型「${delModelId || ""}」吗？`}
        onCancel={() => setDelModelId(null)}
        onConfirm={() => {
          if (delModelId) {
            setPendingModels((pre) => pre.filter((x) => x.id !== delModelId));
          }
          setDelModelId(null);
          Toast.success("已删除");
        }}
      />
    </ScrollView>
  );
};

const ModelPicker = ({
  models,
  themeColor,
  onClose,
  onConfirm,
}: {
  models: string[];
  themeColor: any;
  onClose: () => void;
  onConfirm: (ids: string[]) => void;
}) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (id: string) => {
    setSelected((pre) => {
      const next = new Set(pre);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.4)",
        justifyContent: "center",
        padding: 30,
      }}
    >
      <View
        style={{
          backgroundColor: "#fff",
          borderRadius: 10,
          maxHeight: "75%",
          padding: 16,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "600", color: "#222" }}>
          选择要添加的模型（已选 {selected.size}）
        </Text>
        <ScrollView style={{ marginTop: 10 }}>
          {models.map((m) => (
            <TouchableOpacity
              key={m}
              onPress={() => toggle(m)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 10,
                borderBottomWidth: 0.5,
                borderBottomColor: themeColor.line2,
              }}
            >
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 3,
                  borderWidth: 1,
                  borderColor: selected.has(m)
                    ? themeColor.primary
                    : themeColor.text3,
                  backgroundColor: selected.has(m)
                    ? themeColor.primary
                    : "#fff",
                  marginRight: 10,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {selected.has(m) && (
                  <Text style={{ color: "#fff", fontSize: 11 }}>✓</Text>
                )}
              </View>
              <Text style={{ fontSize: 15, color: themeColor.text5 }}>{m}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={{ flexDirection: "row", marginTop: 12, gap: 10 }}>
          <TouchableOpacity
            onPress={onClose}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: themeColor.text3,
              borderRadius: 6,
              paddingVertical: 9,
              alignItems: "center",
            }}
          >
            <Text style={{ color: themeColor.text3, fontSize: 14 }}>取消</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onConfirm([...selected])}
            style={{
              flex: 1,
              backgroundColor: themeColor.primary,
              borderRadius: 6,
              paddingVertical: 9,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#fff", fontSize: 14 }}>
              添加选中（{selected.size}）
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default ProviderEdit;
