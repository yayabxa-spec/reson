import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Modal,
} from "react-native";
import { useNavigation } from "expo-router";
import { useTheme } from "../../../../../theme/useTheme";
import RoleAvatar from "../../../../component/complex/RoleAvatar";
import {
  getDirectorState,
  resetWorldlineToday,
  getFriendRoles,
  ensureWorldlineToday,
} from "../../../../store/worldline";
import { readRolesRaw } from "../../../../store/roles";
import { readWorldlineRaw } from "../../../../store/roleStatus";
import eventBus from "../../../../utils/eventBus";

const Director = () => {
  const navigate = useNavigation();
  const { themeColor } = useTheme();
  const [state, setState] = useState<any>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [candidates, setCandidates] = useState<any[]>([]);
  const [regenerating, setRegenerating] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [genProgress, setGenProgress] = useState({
    done: 0,
    total: 0,
    current: "",
  });

  const load = useCallback(async () => {
    setState(await getDirectorState());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 重置后逐角色落库：worldline-updated 时更新"入戏直播"进度
  useEffect(() => {
    if (!regenerating) return;
    const handler = async () => {
      try {
        const wl = await readWorldlineRaw();
        const friends = wl?.friends || [];
        setGenProgress((p) => ({
          ...p,
          done: friends.length,
          current: friends.length
            ? friends[friends.length - 1].name
            : p.current,
        }));
      } catch {}
    };
    eventBus.on("worldline-updated", handler);
    return () => {
      eventBus.off("worldline-updated", handler);
    };
  }, [regenerating]);

  const onReset = async () => {
    const friends = await getFriendRoles().catch(() => []);
    setGenProgress({
      done: 0,
      total: Math.min(friends.length, 20),
      current: "",
    });
    setRegenerating(true);
    setShowProgress(true);
    try {
      await resetWorldlineToday();
    } catch {}
    // 立即重新生成（逐角色落库，进度靠 worldline-updated 更新）
    ensureWorldlineToday()
      .catch(() => {})
      .finally(() => {
        setRegenerating(false);
        setShowProgress(false);
        load();
      });
  };

  // 空片场时：从角色库随机挑 3 个"待入组"候选，暗示角色在等你邀请
  useEffect(() => {
    if (state && !state.friends.length && !candidates.length) {
      readRolesRaw()
        .then((roles) => {
          const pool = roles.filter(
            (r) => r.id && !r.id.startsWith("local-")
          );
          const picked = [...pool]
            .sort(() => Math.random() - 0.5)
            .slice(0, 3);
          setCandidates(picked);
        })
        .catch(() => {});
    }
  }, [state, candidates.length]);

  // 好友新增/世界线刷新时自动重载，导演页不用退出重进
  useEffect(() => {
    const onUpdate = () => load();
    eventBus.on("worldline-updated", onUpdate);
    return () => {
      eventBus.off("worldline-updated", onUpdate);
    };
  }, [load]);

  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerTitle: "AI 导演",
      headerTitleAlign: "center",
      headerTintColor: "#111",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: "#EDEDED" },
    });
  }, []);

  if (!state) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#EDEDED",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator size="large" color={themeColor.primary} />
      </View>
    );
  }

  // 空片场：没有任何角色入戏
  if (!state.friends.length) {
    const goAdd = () =>
      navigate.navigate("pages/contacts/screens/add-contacts/index");
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#EDEDED",
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 34,
        }}
      >
        <Text style={{ fontSize: 54 }}>🎬</Text>
        <Text
          style={{
            fontSize: 18,
            fontWeight: "600",
            color: themeColor.text5,
            marginTop: 14,
          }}
        >
          导演已就位，片场还空着
        </Text>
        <Text
          style={{
            color: themeColor.text2,
            fontSize: 13,
            marginTop: 10,
            textAlign: "center",
            lineHeight: 21,
          }}
        >
          还没有角色加入你的世界。
          {"\n"}添加几位角色好友后，TA 们就会在这里拥有自己的生活——
          {"\n"}早上做了什么、今天遇见谁、想不想来找你聊两句。
        </Text>
        <TouchableOpacity
          onPress={goAdd}
          style={{
            marginTop: 24,
            backgroundColor: themeColor.primary,
            paddingHorizontal: 38,
            paddingVertical: 11,
            borderRadius: 22,
          }}
        >
          <Text
            style={{
              color: "#fff",
              fontSize: 15,
              fontWeight: "600",
            }}
          >
            去添加角色
          </Text>
        </TouchableOpacity>
        {candidates.length ? (
          <>
            <Text
              style={{
                color: themeColor.text3,
                fontSize: 12,
                marginTop: 32,
              }}
            >
              —— 片场外的候选，等你邀请 ——
            </Text>
            <View
              style={{
                flexDirection: "row",
                marginTop: 16,
                gap: 24,
              }}
            >
              {candidates.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  onPress={() =>
                    navigate.navigate(
                      "pages/contacts/screens/friend-info/apply",
                      { friendId: c.id }
                    )
                  }
                  style={{ alignItems: "center" }}
                >
                  <RoleAvatar avatar={c.avatar} name={c.name} size={46} />
                  <Text
                    style={{
                      color: themeColor.text2,
                      fontSize: 11,
                      marginTop: 5,
                    }}
                  >
                    {c.remark || c.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : null}
      </View>
    );
  }

  const levelLabel: Record<string, string> = {
    low: "低",
    normal: "中",
    high: "高",
  };

  return (
    <ScrollView
      style={{ backgroundColor: "#EDEDED", flex: 1 }}
      contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
    >
      {/* 总览 */}
      <View style={{ backgroundColor: "#fff", borderRadius: 10, padding: 16 }}>
        <Text style={{ fontSize: 15, color: themeColor.text5, fontWeight: "600" }}>
          今日世界线
        </Text>
        <Text style={{ color: themeColor.text2, fontSize: 12, marginTop: 4 }}>
          {state.date} · {state.friends.length} 个角色入戏
        </Text>
        <View style={{ flexDirection: "row", marginTop: 12 }}>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 22,
                fontWeight: "700",
                color: themeColor.primary,
              }}
            >
              {state.totalSent}
            </Text>
            <Text style={{ color: themeColor.text3, fontSize: 12 }}>
              今日主动消息
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 22,
                fontWeight: "700",
                color: themeColor.textBlue,
              }}
            >
              {state.totalFollowUps}
            </Text>
            <Text style={{ color: themeColor.text3, fontSize: 12 }}>
              今日跟进
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 22,
                fontWeight: "700",
                color: themeColor.text5,
              }}
            >
              {state.friends.length}
            </Text>
            <Text style={{ color: themeColor.text3, fontSize: 12 }}>角色</Text>
          </View>
        </View>
      </View>

      {/* 角色列表 */}
      {state.friends.length === 0 && (
        <View style={{ marginTop: 30, alignItems: "center" }}>
          <Text style={{ color: themeColor.text3, fontSize: 14 }}>
            还没有角色入戏，去添加角色好友吧
          </Text>
        </View>
      )}
      {state.friends.map((f: any) => {
        const isOpen = !!expanded[f.roleId];
        return (
          <View
            key={f.roleId}
            style={{
              backgroundColor: "#fff",
              borderRadius: 10,
              marginTop: 12,
              overflow: "hidden",
            }}
          >
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() =>
                setExpanded((e) => ({ ...e, [f.roleId]: !isOpen }))
              }
              style={{ flexDirection: "row", padding: 14 }}
            >
              <RoleAvatar avatar={f.avatar} name={f.name} size={46} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "600",
                      color: themeColor.text5,
                    }}
                  >
                    {f.name}
                  </Text>
                  <View
                    style={{
                      marginLeft: 8,
                      paddingHorizontal: 7,
                      paddingVertical: 2,
                      borderRadius: 4,
                      backgroundColor:
                        f.activityLevel === "high"
                          ? "#FDE8E8"
                          : f.activityLevel === "low"
                          ? "#E8F0FE"
                          : "#EDEDED",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        color:
                          f.activityLevel === "high"
                            ? "#E64340"
                            : f.activityLevel === "low"
                            ? "#576B95"
                            : themeColor.text3,
                      }}
                    >
                      活跃度{levelLabel[f.activityLevel]}
                    </Text>
                  </View>
                </View>
                <Text
                  style={{
                    color: themeColor.text3,
                    fontSize: 12,
                    marginTop: 4,
                    lineHeight: 18,
                  }}
                >
                  {f.currentSlot
                    ? `${f.currentSlot.start} ${f.currentSlot.activity}${
                        f.currentSlot.mood ? `（${f.currentSlot.mood}）` : ""
                      }`
                    : "现在没有安排特定活动"}
                </Text>
                <View style={{ flexDirection: "row", marginTop: 6 }}>
                  <Text style={{ color: themeColor.text3, fontSize: 11 }}>
                    主动 {f.sentCount}/{f.dailyBudget} 条
                  </Text>
                  {f.replyRate != null && (
                    <Text style={{ color: themeColor.text3, fontSize: 11, marginLeft: 10 }}>
                      回复率 {f.replyRate}%
                    </Text>
                  )}
                  {f.feedback.length > 0 && (
                    <Text style={{ fontSize: 11, marginLeft: 10 }}>
                      {f.feedback
                        .map((x: number) => (x === 1 ? "●" : "○"))
                        .join(" ")}
                    </Text>
                  )}
                </View>
              </View>
              <Text style={{ color: themeColor.text3, fontSize: 13 }}>
                {isOpen ? "▲" : "▼"}
              </Text>
            </TouchableOpacity>

            {isOpen && (
              <View style={{ borderTopWidth: 0.5, borderTopColor: "#E5E6EB" }}>
                <View style={{ padding: 14 }}>
                  {f.remaining.length === 0 && (
                    <Text style={{ color: themeColor.text3, fontSize: 12 }}>
                      今天剩余时段没有安排主动时机
                    </Text>
                  )}
                  {f.remaining.map((s: any, i: number) => (
                    <View
                      key={i}
                      style={{
                        flexDirection: "row",
                        paddingVertical: 5,
                        alignItems: "flex-start",
                      }}
                    >
                      <Text
                        style={{
                          width: 88,
                          color: themeColor.textBlue,
                          fontSize: 12,
                        }}
                      >
                        {s.start}-{s.end}
                      </Text>
                      <Text style={{ flex: 1, color: themeColor.text5, fontSize: 12 }}>
                        {s.reason || "（有意愿）"}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        );
      })}

      {/* 调试 */}
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onReset}
        style={{
          marginTop: 20,
          borderWidth: 1,
          borderColor: themeColor.textBlue,
          borderRadius: 6,
          paddingVertical: 10,
          alignItems: "center",
        }}
      >
        <Text style={{ color: themeColor.textBlue, fontSize: 14 }}>
          重置今日世界线
        </Text>
      </TouchableOpacity>

      {/* 生成进度全屏层（可后台化） */}
      <Modal
        visible={showProgress}
        transparent
        animationType="fade"
        onRequestClose={() => setShowProgress(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "#EDEDED",
            paddingHorizontal: 36,
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              fontSize: 20,
              fontWeight: "700",
              color: themeColor.text5,
              textAlign: "center",
            }}
          >
            世界线重启中
          </Text>
          <Text
            style={{
              color: themeColor.text3,
              fontSize: 14,
              textAlign: "center",
              marginTop: 10,
            }}
          >
            {genProgress.done} / {genProgress.total} 个角色已入戏
          </Text>
          {genProgress.current ? (
            <Text
              style={{
                color: themeColor.primary,
                fontSize: 13,
                textAlign: "center",
                marginTop: 8,
              }}
            >
              正在安排：{genProgress.current}
            </Text>
          ) : (
            <ActivityIndicator
              color={themeColor.primary}
              style={{ marginTop: 18 }}
            />
          )}
          <TouchableOpacity
            onPress={() => setShowProgress(false)}
            style={{
              marginTop: 30,
              backgroundColor: themeColor.primary,
              borderRadius: 20,
              paddingVertical: 10,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "600" }}>
              后台生成
            </Text>
          </TouchableOpacity>
          <Text
            style={{
              color: themeColor.text2,
              fontSize: 11,
              textAlign: "center",
              marginTop: 10,
            }}
          >
            生成将在后台继续，完成后自动刷新
          </Text>
        </View>
      </Modal>
    </ScrollView>
  );
};

export default Director;
