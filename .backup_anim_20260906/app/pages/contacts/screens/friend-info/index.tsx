import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { List } from "react-native-paper";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { Fontisto } from "@expo/vector-icons";
import { useTheme } from "../../../../../theme/useTheme";
import { Role } from "../../../../store/roles";
import { sqlReadRole } from "../../../../store/appDb";
import RoleAvatar from "../../../../component/complex/RoleAvatar";
import { useChatList } from "../../../../store/chatList";
import {
  readWorldlineRaw,
  getRoleStatusFull,
} from "../../../../store/roleStatus";
import eventBus from "../../../../utils/eventBus";
import Toast from "../../../../component/base/Toast";

const FriendInfo = () => {
  const navigate = useNavigation();
const { themeColor, skin } = useTheme();
  const { setChatListStoreV2 } = useChatList();
  const params = useLocalSearchParams<{ friendId?: string; type?: string }>();
  const [role, setRole] = useState<Role | null>(null);
  const [roleStatusText, setRoleStatusText] = useState("");

  useEffect(() => {
    if (!params.friendId) {
      setRoleStatusText("");
      return;
    }
    const load = () => {
      readWorldlineRaw()
        .then((wl) =>
          setRoleStatusText(getRoleStatusFull(wl, params.friendId!))
        )
        .catch(() => {});
    };
    load();
    const wlHandler = () => load();
    eventBus.on("worldline-updated", wlHandler);
    const timer = setInterval(load, 2 * 60 * 1000);
    return () => {
      eventBus.off("worldline-updated", wlHandler);
      clearInterval(timer);
    };
  }, [params.friendId]);

  const load = useCallback(async () => {
    if (!params.friendId) return;
    const r = await sqlReadRole(params.friendId);
    setRole((r as Role) || null);
  }, [params.friendId]);

  useEffect(() => {
    load();
    const handler = () => load();
    eventBus.on("roles-updated", handler);
    return () => {
      eventBus.off("roles-updated", handler);
    };
  }, [load]);

  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerTitle: "",
      headerTitleAlign: "center",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: themeColor.surfaceContainerLowest },
      headerTintColor: "#111",
      headerRight:
        role?.status === "done"
          ? () => (
              <Pressable
                onPress={() =>
                  navigate.navigate(
                    "pages/contacts/screens/friend-info/settings",
                    { friendId: params.friendId }
                  )
                }
                style={{ paddingHorizontal: 12, paddingVertical: 4 }}
              >
                <Text
                  style={{ color: "#111", fontSize: 20, fontWeight: "600" }}
                >
                  ···
                </Text>
              </Pressable>
            )
          : () => null,
    });
  }, [params.friendId, role?.status]);

  if (!role) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#fff",
          alignItems: "center",
          paddingTop: 80,
        }}
      >
        <Text style={{ color: themeColor.text3 }}>角色不存在或已被删除</Text>
      </View>
    );
  }

  const openChat = () => {
    setChatListStoreV2({
      type: "goToMsgChat",
      chatListState: [],
      curConvo: {
        id: "role-" + role.id,
        convoId: "role-" + role.id,
        curReceiverInfo: { act: role.remark || role.name, image: "" },
        remark: role.remark,
        convoMember: [],
        isGroup: false,
        groupName: role.name,
        roleId: role.id,
        roleName: role.name,
        roleAvatar: role.avatar,
      },
    });
    navigate.navigate("pages/chats/msg-chats/index", {
      chatType: "",
      convoId: "role-" + role.id,
    });
  };

  const centeredAction = (icon: string, label: string, onPress: () => void, last?: boolean) => (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        height: 52,
        backgroundColor: themeColor.surfaceContainerLowest,
        borderBottomWidth: last ? 0 : 0.5,
        borderBottomColor: themeColor.outlineVariant + "88",
      }}
    >
      <Fontisto name={icon as any} size={18} color={themeColor.primary} />
      <Text
        style={{
          color: themeColor.primary,
          fontSize: 16,
          marginLeft: 8,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: themeColor.surfaceContainerLow }}
      contentContainerStyle={{ paddingBottom: 30 }}
    >
      <View
        style={{
          backgroundColor: themeColor.surfaceContainerLowest,
          padding: 20,
          paddingBottom: 24,
        }}
      >
        {/* 状态横幅 */}
        {roleStatusText ? (
          <View
            style={{
              backgroundColor: themeColor.bg2,
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 9,
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: 4,
                backgroundColor: themeColor.primary,
                marginRight: 7,
              }}
            />
            <Text
              style={{
                color: themeColor.primary,
                fontSize: 14,
                fontWeight: "500",
              }}
            >
              此刻 · {roleStatusText}
            </Text>
          </View>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <RoleAvatar
            avatar={role.avatar}
            name={role.name}
            size={64}
            style={{ marginRight: 18 }}
          />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "600",
                  color: themeColor.onSurface,
                }}
              >
                {role.remark || role.name}
              </Text>
              <Fontisto name="person" size={13} color="#FA5151" />
            </View>
            <Text
              style={{
                color: themeColor.onSurfaceVariant,
                fontSize: 14,
                marginTop: 5,
              }}
            >
              账号：{role.id}
            </Text>
            <Text
              style={{
                color: themeColor.onSurfaceVariant,
                fontSize: 14,
                marginTop: 3,
              }}
            >
              地区：{role.region || "中国"}
            </Text>
          </View>
        </View>
      </View>

      <View
        style={{ height: 8, backgroundColor: themeColor.surfaceContainerLow }}
      />

      <View style={{ backgroundColor: themeColor.surfaceContainerLowest }}>
        <List.Item
          title="朋友资料"
          description="添加朋友的备注名、电话、标签、备忘、照片等，并设置朋友权限。"
          titleStyle={{
            fontSize: 17,
            fontWeight: "500",
            color: themeColor.onSurface,
          }}
          descriptionStyle={{
            color: themeColor.onSurfaceVariant,
            fontSize: 13,
            marginTop: 3,
          }}
          style={{
            minHeight: 66,
            paddingRight: 8,
          }}
          onPress={() =>
            navigate.navigate("pages/contacts/screens/friend-info/details", {
              friendId: role.id,
            })
          }
          right={() => (
            <List.Icon
              icon="chevron-right"
              color={themeColor.onSurfaceVariant}
            />
          )}
        />
        <List.Item
          title={skin.layout.dock === "material" ? skin.labels.moments : "朋友圈"}
          titleStyle={{
            fontSize: 17,
            fontWeight: "500",
            color: themeColor.onSurface,
          }}
          style={{ minHeight: 66, paddingRight: 8 }}
          onPress={() =>
            Toast.info(
              (skin.layout.dock === "material" ? skin.labels.moments : "朋友圈") +
                "功能开发中"
            )
          }
          right={() => (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ flexDirection: "row", gap: 4, marginRight: 8 }}>
                {[0, 1, 2].map((i) => (
                  <View
                    key={i}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 3,
                      backgroundColor: themeColor.surfaceContainerHigh,
                    }}
                  />
                ))}
              </View>
              <List.Icon
                icon="chevron-right"
                color={themeColor.onSurfaceVariant}
              />
            </View>
          )}
        />
      </View>

      <View
        style={{ height: 8, backgroundColor: themeColor.surfaceContainerLow }}
      />

      {role.status === "none" && (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() =>
            navigate.navigate("pages/contacts/screens/friend-info/apply", {
              friendId: role.id,
            })
          }
          style={{
            height: 52,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: themeColor.surfaceContainerLowest,
          }}
        >
          <Text style={{ color: themeColor.primary, fontSize: 16 }}>
            {skin.layout.dock === "material" ? "添加到联系人" : "添加到通讯录"}
          </Text>
        </TouchableOpacity>
      )}
      {role.status === "requesting" && (
        <View
          style={{
            height: 52,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: themeColor.surfaceContainerLowest,
          }}
        >
          <Text style={{ color: themeColor.text2, fontSize: 16 }}>
            等待验证（角色正在同意…）
          </Text>
        </View>
      )}
      {role.status === "done" && (
        <>
          {centeredAction("comment", "发消息", openChat, true)}
        </>
      )}
    </ScrollView>
  );
};

export default FriendInfo;
