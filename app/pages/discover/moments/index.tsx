import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "expo-router";
import { useTheme } from "../../../../theme/useTheme";
import RoleAvatar from "../../../component/complex/RoleAvatar";
import {
  getVisibleMoments,
  toggleLocalLike,
  addLocalComment,
  deleteLocalMoment,
  deleteLocalComment,
  LocalMoment,
} from "../../../store/moments";
import { getFriendRoles } from "../../../store/worldline";
import {
  clearMomentsUnread,
  getMomentsUnread,
  MomentUnread,
} from "../../../store/momentsNotify";
import { readProfile } from "../../../store/profile";
import eventBus from "../../../utils/eventBus";
import CardIn from "../../../anim/CardIn";
import PressableScale from "../../../anim/PressableScale";

/** 动态时间格式：今天 HH:mm / 昨天 / M月D日 / YYYY年M月D日 */
function formatMomentTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const start = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((start(now) - start(d)) / 86400000);
  if (diffDays <= 0) {
    return `${String(d.getHours()).padStart(2, "0")}:${String(
      d.getMinutes()
    ).padStart(2, "0")}`;
  }
  if (diffDays === 1) return "昨天";
  if (d.getFullYear() !== now.getFullYear()) {
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  }
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

const Moments = () => {
  const navigate = useNavigation();
  const { themeColor } = useTheme();
  const [moments, setMoments] = useState<LocalMoment[]>([]);
  const [commentFor, setCommentFor] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  // 本轮进入页面时的新消息快照（进入即全部已读，未读按钮只负责跳到还没看的）
  const [sessionUnread, setSessionUnread] = useState<MomentUnread[]>([]);
  const [unreadIdx, setUnreadIdx] = useState(0);
  const [userAvatar, setUserAvatar] = useState("");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const itemY = useRef<Record<string, number>>({});

  const load = useCallback(async () => {
    try {
      const friends = await getFriendRoles();
      const list = await getVisibleMoments(friends.map((f) => f.id));
      setMoments(list);
    } catch {}
  }, []);

  useEffect(() => {
    readProfile()
      .then((p) => setUserAvatar(p.avatar || ""))
      .catch(() => {});
  }, []);

  // 进入页面即视为已读：抓取本轮新消息快照，清空未读（dock/探索页红点消失）
  const grabUnread = useCallback(async () => {
    try {
      const list = await getMomentsUnread();
      setSessionUnread(list);
      setUnreadIdx(0);
      await clearMomentsUnread();
    } catch {}
  }, []);

  const jumpNextUnread = () => {
    const item = sessionUnread[unreadIdx];
    if (!item) return;
    setUnreadIdx((i) => i + 1);
    setFocusedId(item.momentId);
    setTimeout(() => {
      const y = itemY.current[item.momentId];
      if (y != null) {
        scrollRef.current?.scrollTo({
          y: Math.max(0, y - 100),
          animated: true,
        });
      }
    }, 150);
    setTimeout(() => setFocusedId(null), 2500);
  };

  useFocusEffect(
    useCallback(() => {
      load();
      grabUnread();
      const handler = () => load();
      eventBus.on("moments-updated", handler);
      return () => {
        eventBus.off("moments-updated", handler);
      };
    }, [load, grabUnread])
  );

  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerTitle: "好友动态",
      headerTitleAlign: "center",
      headerTintColor: "#111",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: "#EDEDED" },
      headerRight: () => (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {sessionUnread.length - unreadIdx > 0 ? (
            <TouchableOpacity
              onPress={jumpNextUnread}
              style={{ paddingHorizontal: 8, paddingVertical: 4 }}
            >
              <Text
                style={{
                  color: "#FA5151",
                  fontSize: 15,
                  fontWeight: "600",
                }}
              >
                未读 {sessionUnread.length - unreadIdx}
              </Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={() =>
              navigate.navigate(
                "pages/discover/moments/screens/post-moments/index"
              )
            }
            style={{ paddingHorizontal: 8, paddingVertical: 4 }}
          >
            <Text style={{ color: themeColor.primary, fontSize: 15 }}>
              ＋ 发布
            </Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [themeColor, sessionUnread, unreadIdx, navigate]);

  const onLike = async (m: LocalMoment) => {
    await toggleLocalLike(m.id, "我");
    load();
  };

  const submitComment = async (m: LocalMoment) => {
    const t = commentText.trim();
    if (!t) return;
    await addLocalComment(m.id, "我", t);
    setCommentText("");
    setCommentFor(null);
    load();
  };

  const confirmDeleteMoment = (m: LocalMoment) => {
    Alert.alert("删除动态", "确定删除这条动态吗？", [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: async () => {
          await deleteLocalMoment(m.id);
          load();
        },
      },
    ]);
  };

  const removeComment = async (m: LocalMoment, cid: string) => {
    await deleteLocalComment(m.id, cid);
    load();
  };

  return (
    <ScrollView
      style={{ backgroundColor: "#EDEDED", flex: 1 }}
      contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
    >
      {moments.map((m, mIdx) => {
        const liked = m.likes.some((l) => l.name === "我");
        const authorAvatar =
          m.author.type === "user" ? userAvatar : m.author.avatar;
        return (
          <CardIn key={m.id} delay={Math.min(mIdx * 60, 420)}>
          <View
            onLayout={(e) => {
              itemY.current[m.id] = e.nativeEvent.layout.y;
            }}
            style={{
              backgroundColor:
                m.id === focusedId ? "#EAF2FF" : "#fff",
              borderRadius: 10,
              padding: 14,
              marginBottom: 12,
            }}
          >
            {/* 作者 */}
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <RoleAvatar
                avatar={authorAvatar}
                name={m.author.name}
                size={38}
              />
              <View style={{ marginLeft: 10, flex: 1 }}>
                <Text style={{ fontSize: 15, color: themeColor.text5 }}>
                  {m.author.name}
                </Text>
                <Text style={{ color: themeColor.text3, fontSize: 11, marginTop: 2 }}>
                  {formatMomentTime(m.createdAt)}
                </Text>
              </View>
              {m.author.type === "user" ? (
                <TouchableOpacity
                  onPress={() => confirmDeleteMoment(m)}
                  style={{ paddingHorizontal: 8, paddingVertical: 4 }}
                >
                  <Text style={{ color: themeColor.text2, fontSize: 16 }}>⋯</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* 内容 */}
            <Text
              style={{
                fontSize: 15,
                color: themeColor.text5,
                lineHeight: 22,
                marginTop: 12,
              }}
            >
              {m.contentText}
            </Text>

            {/* 点赞/评论 */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: 12,
                borderTopWidth: 0.5,
                borderTopColor: "#E5E6EB",
                paddingTop: 8,
              }}
            >
              <PressableScale
                scaleTo={0.94}
                onPress={() => onLike(m)}
                style={{ flexDirection: "row", alignItems: "center", marginRight: 20 }}
              >
                <Text
                  style={{
                    color: liked ? themeColor.primary : themeColor.text3,
                    fontSize: 13,
                  }}
                >
                  {liked ? "♥ 已赞" : "♡ 点赞"}
                </Text>
              </PressableScale>
              <PressableScale
                scaleTo={0.94}
                onPress={() => {
                  setCommentFor(commentFor === m.id ? null : m.id);
                  setCommentText("");
                }}
              >
                <Text style={{ color: themeColor.text3, fontSize: 13 }}>评论</Text>
              </PressableScale>
            </View>

            {/* 点赞列表 */}
            {m.likes.length ? (
              <Text
                style={{
                  color: themeColor.text3,
                  fontSize: 12,
                  marginTop: 10,
                  backgroundColor: themeColor.bg2,
                  borderRadius: 6,
                  paddingHorizontal: 8,
                  paddingVertical: 5,
                }}
              >
                {m.likes.map((l) => l.name).join("、")}
              </Text>
            ) : null}

            {/* 评论列表 */}
            {m.comments.length ? (
              <View
                style={{
                  marginTop: 8,
                  backgroundColor: themeColor.bg2,
                  borderRadius: 6,
                  paddingHorizontal: 8,
                  paddingVertical: 6,
                }}
              >
                {m.comments.map((c) => (
                  <View
                    key={c.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-start",
                      paddingVertical: 3,
                    }}
                  >
                    <Text
                      style={{
                        flex: 1,
                        color: themeColor.text3,
                        fontSize: 13,
                        lineHeight: 19,
                      }}
                    >
                      <Text style={{ color: themeColor.textBlue }}>
                        {c.name}
                      </Text>
                      {c.replyTo ? (
                        <Text> 回复{c.replyTo}</Text>
                      ) : null}
                      ：{c.comment}
                    </Text>
                    {c.name === "我" ? (
                      <TouchableOpacity
                        onPress={() => removeComment(m, c.id)}
                        style={{ paddingLeft: 8, paddingVertical: 2 }}
                      >
                        <Text style={{ color: themeColor.text2, fontSize: 12 }}>
                          ✕
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}

            {/* 评论输入 */}
            {commentFor === m.id ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginTop: 10,
                }}
              >
                <TextInput
                  style={{
                    flex: 1,
                    backgroundColor: themeColor.bg2,
                    borderRadius: 6,
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                    fontSize: 14,
                    color: themeColor.text5,
                  }}
                  value={commentText}
                  onChangeText={setCommentText}
                  placeholder="写下你的评论…"
                  placeholderTextColor={themeColor.text2}
                  autoFocus
                />
                <TouchableOpacity
                  onPress={() => submitComment(m)}
                  style={{ marginLeft: 8 }}
                >
                  <Text style={{ color: themeColor.primary, fontSize: 14 }}>
                    发送
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
          </CardIn>
        );
      })}
      {!moments.length ? (
        <View style={{ alignItems: "center", paddingTop: 80 }}>
          <Text style={{ fontSize: 40 }}>📭</Text>
          <Text style={{ color: themeColor.text3, fontSize: 14, marginTop: 12 }}>
            还没有动态，点右上角发布第一条吧
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
};

export default Moments;
