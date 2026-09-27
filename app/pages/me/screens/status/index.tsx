import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import {
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "expo-router";
import { useTheme } from "../../../../../theme/useTheme";
import RoleAvatar from "../../../../component/complex/RoleAvatar";
import {
  getUserStatus,
  setUserStatus,
  clearUserStatus,
  statusRemainHours,
  subscribeUserStatus,
  UserStatus,
} from "../../../../store/userStatus";
import {
  readWorldlineRaw,
  buildStatusMap,
} from "../../../../store/roleStatus";
import { getFriendRoles } from "../../../../store/worldline";
import { readRolesRaw } from "../../../../store/roles";
import { useChatList } from "../../../../store/chatList";
import eventBus from "../../../../utils/eventBus";
import Toast from "../../../../component/base/Toast";

const CATEGORIES = ["忙碌", "放松", "心情", "自定义"];
const DURATIONS = [1, 4, 8, 24];

const StatusPage = () => {
  const navigate = useNavigation();
  const { themeColor } = useTheme();
  const { setChatListStoreV2 } = useChatList();
  const [myStatus, setMyStatus] = useState<UserStatus | null>(null);
  const [friends, setFriends] = useState<any[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, string>>({});
  const [publishVisible, setPublishVisible] = useState(false);
  const [cat, setCat] = useState("心情");
  const [text, setText] = useState("");
  const [hours, setHours] = useState(24);
  const [customHours, setCustomHours] = useState("");

  const load = useCallback(async () => {
    try {
      const [s, roles, wl] = await Promise.all([
        getUserStatus(),
        getFriendRoles(),
        readWorldlineRaw(),
      ]);
      setMyStatus(s);
      setFriends(roles);
      setStatusMap(
        buildStatusMap(
          wl,
          roles.map((r: any) => r.id)
        )
      );
    } catch {}
  }, []);

  useEffect(() => {
    load();
    const unsub = subscribeUserStatus(load);
    const wlHandler = () => load();
    const timer = setInterval(load, 2 * 60 * 1000);
    eventBus.on("worldline-updated", wlHandler);
    return () => {
      unsub();
      eventBus.off("worldline-updated", wlHandler);
      clearInterval(timer);
    };
  }, [load]);

  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerTitle: "状态",
      headerTitleAlign: "center",
      headerTintColor: "#111",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: "#EDEDED" },
    });
  }, []);

  const openChat = (role: any) => {
    setChatListStoreV2({
      type: "goToMsgChat",
      chatListState: [],
      curConvo: {
        convoId: "role-" + role.id,
        curReceiverInfo: { act: role.remark || role.name, image: "" },
        convoMember: [],
        isGroup: false,
        groupName: role.name,
        roleId: role.id,
        roleName: role.name,
        roleAvatar: role.avatar,
      },
      chatType: "",
      convoId: "role-" + role.id,
    });
    navigate.navigate("pages/chats/msg-chats/index", {
      chatType: "",
      convoId: "role-" + role.id,
    });
  };

  const doPublish = async () => {
    const t = text.trim();
    if (!t) {
      Toast.fail("请输入状态内容");
      return;
    }
    const h =
      hours === 0
        ? Math.min(168, Math.max(1, parseInt(customHours, 10) || 24))
        : hours;
    await setUserStatus(t, cat, h);
    setPublishVisible(false);
    setText("");
    setHours(24);
    Toast.success("状态已发布");
  };

  return (
    <ScrollView
      style={{ backgroundColor: "#EDEDED", flex: 1 }}
      contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
    >
      {/* 我的状态 */}
      <View style={{ backgroundColor: "#fff", borderRadius: 10, padding: 16 }}>
        <Text
          style={{ fontSize: 15, fontWeight: "600", color: themeColor.text5 }}
        >
          我的状态
        </Text>
        {myStatus ? (
          <TouchableOpacity
            onPress={() => setPublishVisible(true)}
            style={{
              marginTop: 12,
              backgroundColor: themeColor.bg2,
              borderRadius: 8,
              padding: 12,
            }}
          >
            <Text style={{ fontSize: 16, color: themeColor.text5 }}>
              {myStatus.text}
            </Text>
            <Text style={{ color: themeColor.text3, fontSize: 12, marginTop: 4 }}>
              {myStatus.category} · 还有 {statusRemainHours(myStatus)} 小时消失
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => setPublishVisible(true)}
            style={{
              marginTop: 12,
              borderColor: themeColor.primary,
              borderWidth: 1,
              borderRadius: 8,
              padding: 12,
              alignItems: "center",
            }}
          >
            <Text style={{ color: themeColor.primary, fontSize: 15 }}>
              ＋ 发个状态
            </Text>
            <Text style={{ color: themeColor.text3, fontSize: 12, marginTop: 4 }}>
              角色会看到你的状态，比如"加班中"TA 会来关心你
            </Text>
          </TouchableOpacity>
        )}
        {myStatus ? (
          <TouchableOpacity
            onPress={async () => {
              await clearUserStatus();
              Toast.success("状态已清除");
            }}
            style={{ marginTop: 10, alignItems: "center", paddingVertical: 4 }}
          >
            <Text style={{ color: themeColor.text3, fontSize: 13 }}>
              清除状态
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <Text
        style={{
          color: themeColor.text3,
          fontSize: 13,
          marginTop: 18,
          marginBottom: 6,
        }}
      >
        好友状态（{friends.length}）
      </Text>
      <View style={{ backgroundColor: "#fff", borderRadius: 10 }}>
        {friends.map((f, i) => {
          const st = statusMap[f.id];
          return (
            <TouchableOpacity
              key={f.id}
              activeOpacity={0.7}
              onPress={() => openChat(f)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: 12,
                borderBottomWidth: i < friends.length - 1 ? 0.5 : 0,
                borderBottomColor: "#E5E6EB",
              }}
            >
              <RoleAvatar avatar={f.avatar} name={f.name} size={40} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 15, color: themeColor.text5 }}>
                  {f.remark || f.name}
                </Text>
                <Text
                  numberOfLines={2}
                  style={{
                    color: themeColor.text3,
                    fontSize: 12,
                    marginTop: 2,
                    lineHeight: 17,
                    paddingRight: 8,
                  }}
                >
                  {st || "此刻没有状态"}
                </Text>
              </View>
              <Text
                style={{
                  color: themeColor.text2,
                  fontSize: 18,
                  marginLeft: 6,
                }}
              >
                ›
              </Text>
            </TouchableOpacity>
          );
        })}
        {!friends.length ? (
          <Text
            style={{
              color: themeColor.text3,
              fontSize: 13,
              textAlign: "center",
              padding: 24,
            }}
          >
            还没有角色好友，添加后这里会显示 TA 们的状态
          </Text>
        ) : null}
      </View>

      {/* 发状态弹窗 */}
      <Modal
        visible={publishVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPublishVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.35)",
            justifyContent: "center",
            padding: 28,
          }}
        >
          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 12,
              padding: 18,
            }}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: "600",
                color: themeColor.text5,
                textAlign: "center",
              }}
            >
              发个状态
            </Text>

            <Text style={{ color: themeColor.text3, fontSize: 13, marginTop: 16 }}>
              分类
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
              {CATEGORIES.map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setCat(c)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 6,
                    borderRadius: 14,
                    backgroundColor:
                      cat === c ? themeColor.primary : themeColor.bg2,
                  }}
                >
                  <Text
                    style={{
                      color: cat === c ? "#fff" : themeColor.text3,
                      fontSize: 13,
                    }}
                  >
                    {c}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={{ color: themeColor.text3, fontSize: 13, marginTop: 14 }}>
              内容
            </Text>
            <TextInput
              style={{
                backgroundColor: themeColor.bg2,
                borderRadius: 6,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: 15,
                color: themeColor.text5,
                marginTop: 6,
              }}
              value={text}
              onChangeText={setText}
              placeholder="例如：加班中 / 在旅行 / 今天有点难过…"
              placeholderTextColor={themeColor.text2}
              maxLength={30}
            />

            <Text style={{ color: themeColor.text3, fontSize: 13, marginTop: 14 }}>
              持续时长
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
              {DURATIONS.map((h) => (
                <TouchableOpacity
                  key={h}
                  onPress={() => setHours(h)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 6,
                    borderRadius: 14,
                    backgroundColor:
                      hours === h ? themeColor.primary : themeColor.bg2,
                  }}
                >
                  <Text
                    style={{
                      color: hours === h ? "#fff" : themeColor.text3,
                      fontSize: 13,
                    }}
                  >
                    {h}小时
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={() => setHours(0)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 6,
                  borderRadius: 14,
                  backgroundColor:
                    hours === 0 ? themeColor.primary : themeColor.bg2,
                }}
              >
                <Text
                  style={{
                    color: hours === 0 ? "#fff" : themeColor.text3,
                    fontSize: 13,
                  }}
                >
                  自定义
                </Text>
              </TouchableOpacity>
            </View>
            {hours === 0 ? (
              <TextInput
                style={{
                  backgroundColor: themeColor.bg2,
                  borderRadius: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  fontSize: 14,
                  color: themeColor.text5,
                  marginTop: 8,
                }}
                value={customHours}
                onChangeText={(v) =>
                  setCustomHours(v.replace(/[^0-9]/g, "").slice(0, 3))
                }
                placeholder="自定义小时数（1~168）"
                placeholderTextColor={themeColor.text2}
                keyboardType="number-pad"
              />
            ) : null}

            <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
              <TouchableOpacity
                onPress={() => setPublishVisible(false)}
                style={{
                  flex: 1,
                  borderColor: "#CCC",
                  borderWidth: 1,
                  borderRadius: 6,
                  paddingVertical: 10,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: themeColor.text3, fontSize: 15 }}>
                  取消
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={doPublish}
                style={{
                  flex: 1,
                  backgroundColor: themeColor.primary,
                  borderRadius: 6,
                  paddingVertical: 10,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#fff", fontSize: 15, fontWeight: "600" }}>
                  发布
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

export default StatusPage;
