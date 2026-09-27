import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useNavigation } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useTheme } from "../../../../../theme/useTheme";
import {
  KbDocument,
  KnowledgeBase,
} from "../../../../store/kbDb";
import {
  deleteDocument,
  listDocuments,
  listKnowledgeBases,
  searchKnowledge,
  uploadDocumentToKb,
} from "../../../../store/knowledge";
import ConfirmDialog from "../../../../component/complex/ConfirmDialog";
import Toast from "../../../../component/base/Toast";

type TabKey = "info" | "docs" | "search";

const TABS: { key: TabKey; label: string }[] = [
  { key: "info", label: "基本信息" },
  { key: "docs", label: "文档管理" },
  { key: "search", label: "知识库检索" },
];

const KbDetail = () => {
  const navigate = useNavigation();
  const { themeColor } = useTheme();
  const params = useLocalSearchParams<{ kbId?: string }>();
  const kbId = params.kbId || "";
  const [tab, setTab] = useState<TabKey>("info");
  const [kb, setKb] = useState<KnowledgeBase | null>(null);
  const [docs, setDocs] = useState<KbDocument[]>([]);
  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState("5");
  const [results, setResults] = useState<{ content: string; score: number }[]>(
    []
  );
  const [searching, setSearching] = useState(false);
  const [delDoc, setDelDoc] = useState<KbDocument | null>(null);
  const [uploading, setUploading] = useState(false);

  const refresh = useCallback(async () => {
    if (!kbId) return;
    const list = await listKnowledgeBases();
    setKb(list.find((k) => k.id === kbId) || null);
    setDocs(await listDocuments(kbId));
  }, [kbId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerTitle: kb?.name || "知识库",
      headerTitleAlign: "center",
      headerTintColor: "#111",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: "#fff" },
    });
  }, [kb?.name]);

  const pickAndUpload = async () => {
    if (!kbId) return;
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          "text/plain",
          "text/markdown",
          "application/json",
          "application/octet-stream",
        ],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      const ext = (asset.name || "").toLowerCase();
      if (!/\.(txt|md|json)$/.test(ext)) {
        Toast.fail("暂支持 txt / md / json，PDF/Word 请先转成文本");
        return;
      }
      setUploading(true);
      const content = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const doc = await uploadDocumentToKb(kbId, {
        name: asset.name || "未命名文档",
        size: asset.size || content.length,
        text: content,
      });
      Toast.success(`已上传，共 ${doc.chunkCount} 个分块`);
      refresh();
    } catch {
      Toast.fail("上传失败");
    } finally {
      setUploading(false);
    }
  };

  const doSearch = async () => {
    if (!query.trim()) {
      Toast.fail("请输入检索内容");
      return;
    }
    setSearching(true);
    try {
      const n = Math.max(1, parseInt(topK, 10) || 5);
      setResults(await searchKnowledge(kbId, query.trim(), n));
    } catch (e: any) {
      Toast.fail(e?.message || "检索失败");
    } finally {
      setSearching(false);
    }
  };

  const infoRow = (label: string, value: string) => (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 13,
        backgroundColor: "#fff",
      }}
    >
      <Text style={{ width: 90, fontSize: 15, color: themeColor.text3 }}>
        {label}
      </Text>
      <Text style={{ flex: 1, fontSize: 15, color: "#1A1A1A" }}>{value}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: "#EDEDED" }}>
      {/* 顶部横向 tab */}
      <View
        style={{
          flexDirection: "row",
          backgroundColor: "#fff",
          borderBottomWidth: 0.5,
          borderBottomColor: "#E5E6EB",
        }}
      >
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              onPress={() => setTab(t.key)}
              style={{
                flex: 1,
                paddingVertical: 12,
                alignItems: "center",
                borderBottomWidth: 2,
                borderBottomColor: active ? themeColor.primary : "transparent",
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: active ? "600" : "400",
                  color: active ? "#1A1A1A" : themeColor.text3,
                }}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {tab === "info" && (
        <View style={{ marginTop: 8 }}>
          {infoRow("名称", kb?.name || "")}
          <View
            style={{
              height: 0.5,
              backgroundColor: "#E5E6EB",
              marginLeft: 16,
            }}
          />
          {infoRow("描述", kb?.description || "暂无描述")}
          <View
            style={{
              height: 0.5,
              backgroundColor: "#E5E6EB",
              marginLeft: 16,
            }}
          />
          {infoRow("创建时间", kb ? new Date(kb.createdAt).toLocaleString() : "")}
          <View
            style={{
              height: 0.5,
              backgroundColor: "#E5E6EB",
              marginLeft: 16,
            }}
          />
          {infoRow("更新时间", kb ? new Date(kb.updatedAt).toLocaleString() : "")}
          <View
            style={{
              height: 0.5,
              backgroundColor: "#E5E6EB",
              marginLeft: 16,
            }}
          />
          {infoRow("文档数量", String(kb?.docCount ?? 0))}
          <View
            style={{
              height: 0.5,
              backgroundColor: "#E5E6EB",
              marginLeft: 16,
            }}
          />
          {infoRow("分块数量", String(kb?.chunkCount ?? 0))}
        </View>
      )}

      {tab === "docs" && (
        <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
          <View style={{ padding: 16 }}>
            <TouchableOpacity
              onPress={pickAndUpload}
              disabled={uploading}
              style={{
                backgroundColor: themeColor.primary,
                borderRadius: 6,
                paddingVertical: 12,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#fff", fontSize: 15 }}>
                {uploading ? "上传中（分块 + 向量化）…" : "＋ 上传文档"}
              </Text>
            </TouchableOpacity>
            <Text style={{ color: themeColor.text2, fontSize: 12, marginTop: 8 }}>
              支持 txt / md / json，上传后自动分块并向量化
            </Text>
          </View>
          {docs.length === 0 && (
            <Text
              style={{
                textAlign: "center",
                color: themeColor.text3,
                marginTop: 30,
              }}
            >
              还没有文档
            </Text>
          )}
          {docs.map((d) => (
            <View
              key={d.id}
              style={{
                backgroundColor: "#fff",
                marginTop: 8,
                paddingHorizontal: 16,
                paddingVertical: 12,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ flex: 1, fontSize: 15, color: "#1A1A1A" }}>
                  {d.name}
                </Text>
                <TouchableOpacity onPress={() => setDelDoc(d)}>
                  <Text style={{ color: themeColor.danger6, fontSize: 13 }}>
                    删除
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 12, color: themeColor.text3, marginTop: 4 }}>
                {d.chunkCount} 个分块 ·{" "}
                {d.size > 1024
                  ? (d.size / 1024).toFixed(1) + " KB"
                  : d.size + " B"}{" "}
                · {new Date(d.createdAt).toLocaleString()}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}

      {tab === "search" && (
        <View style={{ flex: 1, padding: 16 }}>
          <Text style={{ color: themeColor.text3, fontSize: 13 }}>
            模拟检索（测试知识库命中效果）
          </Text>
          <TextInput
            style={{
              backgroundColor: "#fff",
              borderRadius: 6,
              paddingHorizontal: 12,
              paddingVertical: 10,
              fontSize: 14,
              color: themeColor.text5,
              marginTop: 8,
              minHeight: 44,
            }}
            value={query}
            onChangeText={setQuery}
            placeholder="输入要检索的内容，例如：蒙德城在哪"
            placeholderTextColor={themeColor.text2}
          />
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10 }}>
            <Text style={{ color: themeColor.text3, fontSize: 13 }}>
              结果数量
            </Text>
            <TextInput
              style={{
                backgroundColor: "#fff",
                borderRadius: 6,
                paddingHorizontal: 10,
                paddingVertical: 8,
                fontSize: 14,
                color: themeColor.text5,
                marginLeft: 10,
                width: 70,
                textAlign: "center",
              }}
              value={topK}
              onChangeText={setTopK}
              keyboardType="number-pad"
            />
            <TouchableOpacity
              onPress={doSearch}
              disabled={searching}
              style={{
                marginLeft: 12,
                backgroundColor: themeColor.primary,
                borderRadius: 6,
                paddingVertical: 10,
                paddingHorizontal: 20,
              }}
            >
              <Text style={{ color: "#fff", fontSize: 14 }}>
                {searching ? "检索中…" : "检索"}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ marginTop: 12, flex: 1 }}>
            {results.length === 0 && (
              <Text style={{ color: themeColor.text3, fontSize: 13, marginTop: 10 }}>
                输入内容后点击「检索」查看命中的分块
              </Text>
            )}
            {results.map((r, i) => (
              <View
                key={i}
                style={{
                  backgroundColor: "#fff",
                  borderRadius: 6,
                  padding: 12,
                  marginBottom: 8,
                }}
              >
                <Text style={{ color: themeColor.text2, fontSize: 12 }}>
                  命中 #{i + 1} · 相似度 {r.score.toFixed(3)}
                </Text>
                <Text
                  style={{
                    color: "#1A1A1A",
                    fontSize: 14,
                    lineHeight: 20,
                    marginTop: 4,
                  }}
                >
                  {r.content}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      <ConfirmDialog
        visible={!!delDoc}
        title="删除文档"
        message={`确定删除文档「${delDoc?.name || ""}」及其分块和向量吗？`}
        onCancel={() => setDelDoc(null)}
        onConfirm={async () => {
          if (delDoc && kbId) {
            await deleteDocument(kbId, delDoc.id);
            setDelDoc(null);
            refresh();
          }
        }}
      />
    </View>
  );
};

export default KbDetail;
