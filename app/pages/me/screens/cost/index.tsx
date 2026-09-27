import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "expo-router";
import { useTheme } from "../../../../../theme/useTheme";
import {
  sqlClearUsage,
  sqlReadRoles,
  sqlReadUsage,
  UsageRow,
} from "../../../../store/appDb";
import ConfirmDialog from "../../../../component/complex/ConfirmDialog";

type TabKey = "model" | "role" | "scene";

const SCENE_LABEL: Record<string, string> = {
  chat: "聊天",
  聊天: "聊天",
  开场白: "开场白",
  记忆提取: "记忆提取",
  记忆整理: "记忆整理",
  主动消息: "主动消息",
  世界线生成: "世界线生成",
  生日祝福: "生日祝福",
  动态生成: "动态生成",
  动态互动: "动态互动",
  群聊: "群聊",
  对话摘要: "对话摘要",
  拍一拍: "拍一拍",
  角色卡优化: "角色卡优化",
};

function fmtTokens(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(n);
}

function dayKey(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
}

const TokenStats = () => {
  const navigate = useNavigation();
  const { themeColor } = useTheme();
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [tab, setTab] = useState<TabKey>("role");
  const [clearVisible, setClearVisible] = useState(false);
  const [roleNames, setRoleNames] = useState<Record<string, string>>({});

  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerTitle: "Token 统计",
      headerTitleAlign: "center",
      headerTintColor: "#111",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: "#EDEDED" },
    });
  }, []);

  const load = useCallback(async () => {
    setRows(await sqlReadUsage(dayKey(60), dayKey(0)));
    try {
      const roles = await sqlReadRoles();
      const map: Record<string, string> = {};
      roles.forEach((r) => {
        map[r.id] = r.remark || r.name || r.id;
      });
      setRoleNames(map);
    } catch {}
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const roleName = (id: string) => {
    if (!id) return "系统";
    if (id === "ai-director") return "AI 导演";
    if (id === "local-ai-1") return "AI 助手";
    return roleNames[id] || "角色 " + id.slice(-4);
  };

  const sceneName = (s: string) => SCENE_LABEL[s] || s || "其他";

  const summary = useMemo(() => {
    const calc = (from: string, to: string) => {
      const inRange = rows.filter((r) => r.date >= from && r.date <= to);
      return {
        prompt: inRange.reduce((a, b) => a + b.promptTokens, 0),
        completion: inRange.reduce((a, b) => a + b.completionTokens, 0),
        cached: inRange.reduce((a, b) => a + b.cachedTokens, 0),
        calls: inRange.reduce((a, b) => a + b.calls, 0),
      };
    };
    return {
      today: calc(dayKey(0), dayKey(0)),
      week: calc(dayKey(6), dayKey(0)),
      month: calc(dayKey(29), dayKey(0)),
    };
  }, [rows]);

  const grouped = useMemo(() => {
    const keyOf = (r: UsageRow) =>
      tab === "model" ? r.model : tab === "role" ? r.roleId : r.scene;
    const map = new Map<
      string,
      { prompt: number; completion: number; cached: number; calls: number }
    >();
    for (const r of rows) {
      const k = keyOf(r);
      const cur = map.get(k) || {
        prompt: 0,
        completion: 0,
        cached: 0,
        calls: 0,
      };
      cur.prompt += r.promptTokens;
      cur.completion += r.completionTokens;
      cur.cached += r.cachedTokens;
      cur.calls += r.calls;
      map.set(k, cur);
    }
    return [...map.entries()].sort(
      (a, b) =>
        b[1].prompt + b[1].completion - (a[1].prompt + a[1].completion)
    );
  }, [rows, tab]);

  const displayName = (k: string) =>
    tab === "role" ? roleName(k) : tab === "scene" ? sceneName(k) : k;

  const trend = [0, 1, 2, 3, 4, 5, 6].map((off) => {
    const key = dayKey(off);
    const inDay = rows.filter((r) => r.date === key);
    const total = inDay.reduce(
      (a, b) => a + b.promptTokens + b.completionTokens,
      0
    );
    return { key, total };
  });
  const maxTrend = Math.max(1, ...trend.map((t) => t.total));

  const SumCard = ({
    label,
    data,
  }: {
    label: string;
    data: { prompt: number; completion: number; cached: number; calls: number };
  }) => (
    <View
      style={{
        flex: 1,
        backgroundColor: "#fff",
        borderRadius: 10,
        padding: 12,
      }}
    >
      <Text style={{ color: themeColor.text3, fontSize: 12 }}>{label}</Text>
      <Text
        style={{
          fontSize: 17,
          color: themeColor.text5,
          fontWeight: "600",
          marginTop: 4,
        }}
      >
        {fmtTokens(data.prompt + data.completion)}
      </Text>
      <Text style={{ color: themeColor.text2, fontSize: 11, marginTop: 2 }}>
        {data.calls} 次
      </Text>
      <Text style={{ color: themeColor.text2, fontSize: 10, marginTop: 1 }}>
        输入 {fmtTokens(data.prompt)} · 输出 {fmtTokens(data.completion)}
      </Text>
    </View>
  );

  return (
    <ScrollView
      style={{ backgroundColor: "#EDEDED", flex: 1 }}
      contentContainerStyle={{ padding: 12, paddingBottom: 30 }}
    >
      <View style={{ flexDirection: "row", gap: 8 }}>
        <SumCard label="今日" data={summary.today} />
        <SumCard label="本周" data={summary.week} />
        <SumCard label="本月" data={summary.month} />
      </View>

      <View
        style={{
          flexDirection: "row",
          backgroundColor: "#fff",
          borderRadius: 10,
          marginTop: 10,
          padding: 4,
        }}
      >
        {(
          [
            ["role", "按角色"],
            ["model", "按模型"],
            ["scene", "按场景"],
          ] as const
        ).map(([key, label]) => (
          <TouchableOpacity
            key={key}
            onPress={() => setTab(key)}
            style={{
              flex: 1,
              alignItems: "center",
              paddingVertical: 8,
              borderRadius: 8,
              backgroundColor: tab === key ? themeColor.primary : "transparent",
            }}
          >
            <Text
              style={{
                color: tab === key ? "#fff" : themeColor.text5,
                fontSize: 13,
                fontWeight: tab === key ? "600" : "400",
              }}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ backgroundColor: "#fff", borderRadius: 10, marginTop: 8 }}>
        {grouped.length === 0 && (
          <Text
            style={{
              color: themeColor.text3,
              fontSize: 13,
              padding: 20,
              textAlign: "center",
            }}
          >
            暂无数据，对话/生成后会自动统计
          </Text>
        )}
        {grouped.map(([k, s]) => (
          <View
            key={k}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 14,
              paddingVertical: 11,
              borderBottomWidth: 0.5,
              borderBottomColor: "#E5E6EB",
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, color: themeColor.text5 }} numberOfLines={1}>
                {displayName(k)}
              </Text>
              <Text style={{ fontSize: 11, color: themeColor.text2, marginTop: 2 }}>
                {s.calls} 次 · 输入 {fmtTokens(s.prompt)} · 输出{" "}
                {fmtTokens(s.completion)}
                {s.cached > 0 ? ` · 缓存 ${fmtTokens(s.cached)}` : ""}
              </Text>
            </View>
            <Text
              style={{
                fontSize: 15,
                color: themeColor.text5,
                fontWeight: "600",
              }}
            >
              {fmtTokens(s.prompt + s.completion)}
            </Text>
          </View>
        ))}
      </View>

      <View
        style={{
          backgroundColor: "#fff",
          borderRadius: 10,
          marginTop: 10,
          padding: 14,
        }}
      >
        <Text style={{ color: themeColor.text3, fontSize: 13 }}>最近 7 天</Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            height: 90,
            marginTop: 10,
            gap: 6,
          }}
        >
          {trend.map((t) => (
            <View key={t.key} style={{ flex: 1, alignItems: "center" }}>
              <View
                style={{
                  width: "100%",
                  height: Math.max(3, (t.total / maxTrend) * 64),
                  borderRadius: 4,
                  backgroundColor: themeColor.primary,
                  opacity: 0.75 + (t.total / maxTrend) * 0.25,
                }}
              />
              <Text
                style={{
                  fontSize: 9,
                  color: themeColor.text2,
                  marginTop: 4,
                }}
                numberOfLines={1}
              >
                {t.key.slice(5)}
              </Text>
            </View>
          ))}
        </View>
        <Text style={{ color: themeColor.text2, fontSize: 11, marginTop: 4 }}>
          柱高 = 当日 token 总量
        </Text>
      </View>

      <TouchableOpacity
        onPress={() => setClearVisible(true)}
        style={{ alignItems: "center", paddingVertical: 14 }}
      >
        <Text style={{ color: themeColor.danger6, fontSize: 14 }}>
          清空统计
        </Text>
      </TouchableOpacity>

      <ConfirmDialog
        visible={clearVisible}
        title="清空统计"
        message="确定清空全部 Token 统计数据吗？"
        onCancel={() => setClearVisible(false)}
        onConfirm={async () => {
          setClearVisible(false);
          await sqlClearUsage();
          load();
        }}
      />
    </ScrollView>
  );
};

export default TokenStats;
