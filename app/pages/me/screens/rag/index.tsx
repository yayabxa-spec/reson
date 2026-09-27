import { useEffect, useLayoutEffect, useState } from "react";
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "expo-router";
import { useTheme } from "../../../../../theme/useTheme";
import {
  DEFAULT_RAG_SETTINGS,
  RagSettings,
  readRagSettings,
  saveRagSettings,
} from "../../../../store/memory";
import Toast from "../../../../component/base/Toast";
import WeChatSwitch from "../../../../component/base/WeChatSwitch";
import Segment from "../../../../component/base/Segment";

const RagConfig = () => {
  const navigate = useNavigation();
  const { themeColor } = useTheme();
  const [s, setS] = useState<RagSettings>({ ...DEFAULT_RAG_SETTINGS });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    readRagSettings().then((v) => {
      setS(v);
      setLoaded(true);
    });
  }, []);

  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerTitle: "记忆与检索",
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
    marginTop: 6,
  };

  const sectionTitle = (title: string) => (
    <Text
      style={{
        color: themeColor.text3,
        fontSize: 13,
        marginTop: 18,
        marginBottom: 4,
      }}
    >
      {title}
    </Text>
  );

  const save = async () => {
    await saveRagSettings(s);
    Toast.success("已保存");
    navigate.goBack();
  };

  return (
    <ScrollView
      style={{ backgroundColor: "#fff", flex: 1, padding: 16 }}
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      {!loaded && (
        <Text style={{ color: themeColor.text3, marginTop: 20 }}>加载中…</Text>
      )}

      {/* 检索模式（总开关） */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ fontSize: 15, color: themeColor.text5 }}>
          检索模式：
          {s.mode === "auto"
            ? "云端优先 · 离线自动切换"
            : s.mode === "rag"
            ? "Embedding + Rerank"
            : "本地语义向量（BGE）"}
        </Text>
        <Segment
          options={[
            { label: "自动", value: "auto" },
            { label: "RAG", value: "rag" },
            { label: "本地", value: "local" },
          ]}
          value={s.mode}
          onChange={(m) => setS({ ...s, mode: m as "auto" | "rag" | "local" })}
        />
      </View>

      {s.mode === "local" && (
        <Text
          style={{
            color: themeColor.text3,
            fontSize: 12,
            marginTop: 8,
            lineHeight: 18,
          }}
        >
          本地模式使用 BGE-small-zh-v1.5 离线语义模型（约 43MB，首次使用自动解压到缓存）
        </Text>
      )}
      {s.mode === "auto" && (
        <Text
          style={{
            color: themeColor.text3,
            fontSize: 12,
            marginTop: 8,
            lineHeight: 18,
          }}
        >
          自动模式：优先使用云端 Embedding + Rerank，断网或未配置密钥时自动切换本地模型
        </Text>
      )}

      {/* 记忆检索 */}
      {sectionTitle("记忆检索")}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 4,
        }}
      >
        <Text style={{ fontSize: 15, color: themeColor.text5 }}>
          启用记忆检索
        </Text>
        <WeChatSwitch
          value={s.enabled}
          onValueChange={(v) => setS({ ...s, enabled: v })}
        />
      </View>
      <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: themeColor.text3, fontSize: 13 }}>
            记忆衰减窗口（天，0=不限）
          </Text>
          <Text style={{ color: themeColor.text2, fontSize: 11, marginTop: 4 }}>
            超过窗口的记忆逐渐降权，置顶不受影响
          </Text>
          <TextInput
            style={inputStyle}
            value={String(s.windowDays)}
            onChangeText={(v) =>
              setS({ ...s, windowDays: parseInt(v, 10) || 0 })
            }
            keyboardType="number-pad"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: themeColor.text3, fontSize: 13 }}>Top-K</Text>
          <TextInput
            style={inputStyle}
            value={String(s.topK)}
            onChangeText={(v) =>
              setS({ ...s, topK: Math.max(1, parseInt(v, 10) || 5) })
            }
            keyboardType="number-pad"
          />
        </View>
      </View>
      <View style={{ marginTop: 8 }}>
        <Text style={{ color: themeColor.text3, fontSize: 13 }}>
          相似度阈值
        </Text>
        <Text style={{ color: themeColor.text2, fontSize: 11, marginTop: 4 }}>
          低于该相似度的记忆不会被注入（RAG 与本地模式通用）
        </Text>
        <TextInput
          style={inputStyle}
          value={String(s.threshold)}
          onChangeText={(v) =>
            setS({ ...s, threshold: parseFloat(v) || 0.32 })
          }
          keyboardType="decimal-pad"
        />
      </View>
      <View style={{ marginTop: 12 }}>
        <Text style={{ color: themeColor.text3, fontSize: 13 }}>
          记忆提取敏感度
        </Text>
        <Text style={{ color: themeColor.text2, fontSize: 11, marginTop: 4 }}>
          低=只记重要记忆（约定/重大事件），中=普通偏好也记，高=尽量全记
        </Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          {(
            [
              ["low", "低"],
              ["medium", "中"],
              ["high", "高"],
            ] as const
          ).map(([key, label]) => {
            const active = s.memorySensitivity === key;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => setS({ ...s, memorySensitivity: key })}
                style={{
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: 9,
                  borderRadius: 8,
                  borderWidth: 1.5,
                  borderColor: active
                    ? themeColor.primary
                    : themeColor.line2,
                  backgroundColor: active ? themeColor.bg2 : "#fff",
                }}
              >
                <Text
                  style={{
                    color: active ? themeColor.primary : themeColor.text5,
                    fontSize: 14,
                    fontWeight: active ? "600" : "400",
                  }}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 知识库检索 */}
      {sectionTitle("知识库检索")}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 4,
        }}
      >
        <Text style={{ fontSize: 15, color: themeColor.text5 }}>
          启用知识库检索
        </Text>
        <WeChatSwitch
          value={s.kbEnabled}
          onValueChange={(v) => setS({ ...s, kbEnabled: v })}
        />
      </View>
      <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: themeColor.text3, fontSize: 13 }}>
            相似度阈值
          </Text>
          <TextInput
            style={inputStyle}
            value={String(s.kbThreshold)}
            onChangeText={(v) =>
              setS({ ...s, kbThreshold: parseFloat(v) || 0.6 })
            }
            keyboardType="decimal-pad"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: themeColor.text3, fontSize: 13 }}>Top-K</Text>
          <TextInput
            style={inputStyle}
            value={String(s.kbTopK)}
            onChangeText={(v) =>
              setS({ ...s, kbTopK: Math.max(1, parseInt(v, 10) || 5) })
            }
            keyboardType="number-pad"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: themeColor.text3, fontSize: 13 }}>
            最大注入 tokens
          </Text>
          <TextInput
            style={inputStyle}
            value={String(s.kbMaxTokens)}
            onChangeText={(v) =>
              setS({
                ...s,
                kbMaxTokens: Math.max(100, parseInt(v, 10) || 2000),
              })
            }
            keyboardType="number-pad"
          />
        </View>
      </View>

      {/* 设置模型入口 */}
      <TouchableOpacity
        onPress={() => navigate.navigate("pages/me/screens/rag/models")}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 24,
          paddingVertical: 12,
          paddingHorizontal: 12,
          borderWidth: 1,
          borderColor: themeColor.line2,
          borderRadius: 8,
          backgroundColor: themeColor.bg2,
        }}
      >
        <View>
          <Text style={{ fontSize: 15, color: themeColor.text5 }}>
            设置模型
          </Text>
          <Text style={{ fontSize: 12, color: themeColor.text3, marginTop: 3 }}>
            Embedding / Rerank 接口配置
          </Text>
        </View>
        <Text style={{ color: themeColor.text3, fontSize: 16 }}>→</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={save}
        style={{
          backgroundColor: themeColor.primary,
          paddingVertical: 12,
          borderRadius: 6,
          alignItems: "center",
          marginTop: 24,
        }}
      >
        <Text style={{ color: "#fff", fontSize: 16 }}>保存</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

export default RagConfig;
