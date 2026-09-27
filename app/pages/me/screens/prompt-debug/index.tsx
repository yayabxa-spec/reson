import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNavigation } from "expo-router";
import { useTheme } from "../../../../../theme/useTheme";
import { Button, List } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import AsyncStorage from "../../../../utils/storage";
import Toast from "../../../../component/base/Toast";
import {
  getPromptOverrides,
  PROMPT_DEFAULTS,
  PROMPT_MODULES,
  PromptModuleKey,
  resetAllPromptOverrides,
  resetPromptOverride,
  savePromptOverride,
} from "../../../../store/promptEditing";
import { buildExportZip, saveExportToDownload } from "../../../../store/logExport";
import * as Sharing from "expo-sharing";

// 关闭开发者模式：移除解锁标记，设置页入口随之隐藏
const DEBUG_UNLOCK_KEY = "wc_prompt_debug_unlocked_v1";

const PromptDebug = () => {
  const { themeColor } = useTheme();
  const navigator = useNavigation();
  const [values, setValues] = useState<Record<string, string>>({});
  const [modified, setModified] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);
  const [editingKey, setEditingKey] = useState<PromptModuleKey | null>(null);
  const [exporting, setExporting] = useState(false);
  const inputRefs = useRef<Record<string, TextInput | null>>({});

  const exportAll = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      Toast.info("正在导出并加密…");
      const zip = await buildExportZip();
      const uri = await saveExportToDownload(zip);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/octet-stream",
          dialogTitle: "导出文件（.reson 加密格式）",
        });
      } else {
        Toast.success("已导出：" + uri);
      }
    } catch (e: any) {
      Toast.info("导出失败：" + (e?.message || e));
    } finally {
      setExporting(false);
    }
  };

  const handleCloseDevMode = () => {
    AsyncStorage.removeItem(DEBUG_UNLOCK_KEY).catch(() => {});
    Toast.info("开发者模式已关闭，入口已隐藏");
    navigator.goBack();
  };

  const enterEdit = (key: PromptModuleKey) => {
    setEditingKey(key);
    // 等 editable 切换生效后再聚焦，确保键盘弹出
    setTimeout(() => {
      inputRefs.current[key]?.focus();
    }, 80);
  };

  const exitEdit = () => {
    setEditingKey(null);
    Keyboard.dismiss();
  };

  useEffect(() => {
    (async () => {
      const overrides = await getPromptOverrides();
      const init: Record<string, string> = {};
      for (const m of PROMPT_MODULES) {
        init[m.key] =
          overrides[m.key] != null && overrides[m.key]!.trim()
            ? overrides[m.key]!
            : PROMPT_DEFAULTS[m.key];
      }
      setValues(init);
      setLoaded(true);
    })();
  }, []);

  useLayoutEffect(() => {
    navigator.setOptions({
      headerShown: true,
      headerTitle: "开发者选项",
      headerTitleAlign: "center",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: themeColor.surfaceContainerLow },
      headerTintColor: themeColor.onSurface,
      headerRight: () => (
        <Pressable
          onPress={handleCloseDevMode}
          hitSlop={8}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 4,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <MaterialCommunityIcons
            name="lock-off-outline"
            size={17}
            color={themeColor.onSurfaceVariant}
          />
          <Text
            style={{
              color: themeColor.onSurfaceVariant,
              fontSize: 13,
              marginLeft: 4,
            }}
          >
            关闭
          </Text>
        </Pressable>
      ),
    });
  }, []);

  const customized = useMemo(() => {
    const set = new Set<string>();
    for (const m of PROMPT_MODULES) {
      const v = values[m.key];
      if (v != null && v.trim() && v !== PROMPT_DEFAULTS[m.key]) {
        set.add(m.key);
      }
    }
    return set;
  }, [values]);

  const save = async (key: PromptModuleKey, text: string) => {
    await savePromptOverride(key, text);
    setModified((s) => ({ ...s, [key]: false }));
    setEditingKey((cur) => (cur === key ? null : cur));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {}
    );
    Toast.info("已保存（空内容=恢复默认）");
  };

  const restore = async (key: PromptModuleKey) => {
    await resetPromptOverride(key);
    setValues((s) => ({ ...s, [key]: PROMPT_DEFAULTS[key] }));
    setModified((s) => ({ ...s, [key]: false }));
    setEditingKey((cur) => (cur === key ? null : cur));
    Toast.info("已恢复默认");
  };

  const restoreAll = async () => {
    await resetAllPromptOverrides();
    const init: Record<string, string> = {};
    for (const m of PROMPT_MODULES) init[m.key] = PROMPT_DEFAULTS[m.key];
    setValues(init);
    setModified({});
    Toast.info("已全部恢复默认");
  };

  const copy = async (key: PromptModuleKey) => {
    await Clipboard.setStringAsync(values[key] || "");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Toast.info("已复制到剪贴板");
  };

  return (
    <View style={{ flex: 1, backgroundColor: themeColor.surfaceContainerLow }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 12 }}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={{
            backgroundColor: themeColor.surfaceContainerLowest,
            borderRadius: 16,
            padding: 14,
            marginTop: 12,
          }}
        >
          <Text style={{ color: themeColor.onSurface, fontSize: 14, lineHeight: 21 }}>
            这里可以查看并自定义所有 AI 模块的系统提示词。模板中的{" "}
            {"{{占位符}}"} 由代码在运行时用真实数据填充（角色名、时间、记忆等），
            修改时请保留需要的占位符。留空并保存 = 恢复默认；恢复默认有兜底，不会丢失。
            平时文本框为只读，点右上角「编辑」才会弹出键盘并启用复制粘贴。
          </Text>
          <Button
            mode="outlined"
            textColor={themeColor.error}
            style={{ marginTop: 12, borderColor: themeColor.outlineVariant }}
            onPress={restoreAll}
          >
            全部恢复默认
          </Button>
          <Button
            mode="contained"
            buttonColor={themeColor.primary}
            textColor={themeColor.onPrimary}
            style={{ marginTop: 10 }}
            loading={exporting}
            onPress={exportAll}
          >
            导出全部数据
          </Button>
        </View>

        {loaded
          ? PROMPT_MODULES.map((m) => {
              const isCustom = customized.has(m.key);
              return (
                <View
                  key={m.key}
                  style={{
                    backgroundColor: themeColor.surfaceContainerLowest,
                    borderRadius: 16,
                    marginTop: 12,
                    padding: 14,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text
                      style={{
                        color: themeColor.onSurface,
                        fontSize: 15,
                        fontWeight: "600",
                        flexShrink: 1,
                      }}
                    >
                      {m.label}
                    </Text>
                    {isCustom && (
                      <View
                        style={{
                          marginLeft: 8,
                          backgroundColor: themeColor.secondaryContainer,
                          borderRadius: 10,
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                        }}
                      >
                        <Text
                          style={{
                            color: themeColor.onSecondaryContainer,
                            fontSize: 11,
                          }}
                        >
                          已自定义
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }} />
                    <Pressable
                      onPress={() =>
                        editingKey === m.key ? exitEdit() : enterEdit(m.key)
                      }
                      hitSlop={6}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 5,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor:
                          editingKey === m.key
                            ? themeColor.primary
                            : themeColor.outlineVariant,
                        backgroundColor:
                          editingKey === m.key
                            ? themeColor.primaryContainer
                            : "transparent",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          color:
                            editingKey === m.key
                              ? themeColor.onPrimaryContainer
                              : themeColor.primary,
                        }}
                      >
                        {editingKey === m.key ? "完成" : "编辑"}
                      </Text>
                    </Pressable>
                  </View>
                  <Text
                    style={{
                      color: themeColor.onSurfaceVariant,
                      fontSize: 12,
                      marginTop: 3,
                      marginBottom: 8,
                    }}
                  >
                    {m.desc}
                  </Text>
                  {editingKey === m.key ? (
                    <TextInput
                      value={values[m.key] || ""}
                      onChangeText={(t) => {
                        setValues((s) => ({ ...s, [m.key]: t }));
                        setModified((s) => ({ ...s, [m.key]: true }));
                      }}
                      multiline
                      editable
                      ref={(r) => {
                        inputRefs.current[m.key] = r;
                      }}
                      style={{
                        minHeight: 150,
                        maxHeight: 420,
                        backgroundColor: themeColor.surfaceContainerHigh,
                        borderRadius: 12,
                        padding: 10,
                        color: themeColor.onSurface,
                        fontSize: 13,
                        lineHeight: 20,
                        textAlignVertical: "top",
                        borderWidth: 1,
                        borderColor: themeColor.primary,
                      }}
                      placeholder="留空保存 = 使用默认提示词"
                      placeholderTextColor={themeColor.onSurfaceVariant}
                    />
                  ) : (
                    <ScrollView
                      nestedScrollEnabled
                      style={{
                        minHeight: 150,
                        maxHeight: 420,
                        backgroundColor: themeColor.surfaceContainerHigh,
                        borderRadius: 12,
                      }}
                      contentContainerStyle={{
                        padding: 10,
                        paddingBottom: 24,
                      }}
                    >
                      <Text
                        style={{
                          color: values[m.key]
                            ? themeColor.onSurface
                            : themeColor.onSurfaceVariant,
                          fontSize: 13,
                          lineHeight: 20,
                        }}
                      >
                        {values[m.key] || "（留空保存 = 使用默认提示词）"}
                      </Text>
                    </ScrollView>
                  )}
                  <View
                    style={{
                      flexDirection: "row",
                      marginTop: 10,
                      gap: 8,
                    }}
                  >
                    <Button
                      mode="contained"
                      compact
                      buttonColor={themeColor.primary}
                      textColor={themeColor.onPrimary}
                      style={{ flex: 1 }}
                      onPress={() => save(m.key, values[m.key] || "")}
                    >
                      {modified[m.key] ? "保存修改" : "保存"}
                    </Button>
                    <Button
                      mode="outlined"
                      compact
                      textColor={themeColor.onSurface}
                      style={{ flex: 1, borderColor: themeColor.outlineVariant }}
                      onPress={() => restore(m.key)}
                    >
                      恢复默认
                    </Button>
                    <Button
                      mode="outlined"
                      compact
                      textColor={themeColor.onSurface}
                      style={{ flex: 1, borderColor: themeColor.outlineVariant }}
                      onPress={() => copy(m.key)}
                    >
                      复制
                    </Button>
                  </View>
                </View>
              );
            })
          : null}
      </ScrollView>
    </View>
  );
};

export default PromptDebug;
