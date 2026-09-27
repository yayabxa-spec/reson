import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useTheme } from "../../../../../theme/useTheme";
import { Role, sendFriendRequest } from "../../../../store/roles";
import { sqlReadRole } from "../../../../store/appDb";
import { useUser } from "../../../../store/user";
import Toast from "../../../../component/base/Toast";

const ApplyFriend = () => {
  const navigate = useNavigation();
const { themeColor } = useTheme();
  const params = useLocalSearchParams<{ friendId?: string }>();
  const { userStore } = useUser();
  const [role, setRole] = useState<Role | null>(null);
  const [greeting, setGreeting] = useState("");
  const [remark, setRemark] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!params.friendId) return;
    const r = await sqlReadRole(params.friendId);
    setRole((r as Role) || null);
  }, [params.friendId]);

  useEffect(() => {
    load();
  }, [load]);

  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerTitle: "申请添加朋友",
      headerTitleAlign: "center",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: "#fff" },
      headerTintColor: "#111",
    });
  }, []);

  const myName = userStore?.userInfo?.act || "";
  const defaultGreeting = myName ? `我是${myName}` : "你好，我是你的新朋友";

  const send = async () => {
    if (!params.friendId) return;
    if (!role) {
      Toast.info("角色资料加载中，请稍候…");
      return;
    }
    if (sending) return;
    setSending(true);
    await sendFriendRequest(params.friendId, greeting.trim() || defaultGreeting);
    Toast.info("申请已发送，等待对方通过");
    // 自动返回角色资料页：通过后那里的按钮会变"发消息"
    navigate.goBack();
  };

  const sectionLabel = (text: string) => (
    <Text
      style={{
        backgroundColor: themeColor.fillColor,
        paddingHorizontal: 16,
        paddingVertical: 8,
        fontSize: 13,
        color: themeColor.text3,
      }}
    >
      {text}
    </Text>
  );

  return (
    <View style={{ flex: 1, backgroundColor: themeColor.fillColor }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
        {sectionLabel("打招呼内容")}
        <View style={{ backgroundColor: themeColor.white, padding: 12 }}>
          <TextInput
            style={{
              minHeight: 90,
              fontSize: 15,
              color: themeColor.text5,
              textAlignVertical: "top",
            }}
            value={greeting}
            onChangeText={setGreeting}
            placeholder={defaultGreeting}
            placeholderTextColor={themeColor.text2}
            multiline
          />
        </View>

        {sectionLabel("备注")}
        <View style={{ backgroundColor: themeColor.white, padding: 12 }}>
          <TextInput
            style={{ fontSize: 15, color: themeColor.text5 }}
            value={remark}
            onChangeText={setRemark}
            placeholder="添加备注"
            placeholderTextColor={themeColor.text2}
          />
        </View>
        {role && (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setRemark(role.name)}
            style={{
              backgroundColor: themeColor.white,
              borderTopWidth: 0.5,
              borderTopColor: themeColor.line2,
              paddingHorizontal: 16,
              paddingVertical: 10,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <Text style={{ flex: 1, fontSize: 14, color: themeColor.textBlue }}>
              {role.name}
            </Text>
            <Text style={{ color: themeColor.text2, fontSize: 14 }}>↗</Text>
          </TouchableOpacity>
        )}

      </ScrollView>

      <View
        style={{
          backgroundColor: themeColor.white,
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderTopWidth: 0.5,
          borderTopColor: themeColor.line2,
        }}
      >
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={send}
          disabled={!role}
          style={{
            backgroundColor: role ? themeColor.primary : themeColor.text2,
            paddingVertical: 12,
            borderRadius: 6,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#fff", fontSize: 16 }}>
            {!role ? "加载中…" : sending ? "发送中…" : "发送"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default ApplyFriend;
