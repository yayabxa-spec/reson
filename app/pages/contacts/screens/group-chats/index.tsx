import { useCallback, useLayoutEffect, useState } from "react";
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "expo-router";
import { useTheme } from "../../../../../theme/useTheme";
import RoleAvatar from "../../../../component/complex/RoleAvatar";
import { readConversationsRaw } from "../../../../store/localChat";
import { useChatList } from "../../../../store/chatList";
import { cleanChatText } from "../../../../utils/sanitize";
import eventBus from "../../../../utils/eventBus";

/** 群聊列表：显示我创建的所有群聊，点击进入聊天 */
const GroupChats = () => {
  const navigate = useNavigation();
  const { themeColor } = useTheme();
  const { setChatListStoreV2 } = useChatList();
  const [groups, setGroups] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      const convos = await readConversationsRaw();
      setGroups(convos.filter((c) => c.isGroup));
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const handler = () => load();
      eventBus.on("local-chat-updated", handler);
      return () => {
        eventBus.off("local-chat-updated", handler);
      };
    }, [load])
  );

  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerTitle: "群聊",
      headerTitleAlign: "center",
      headerTintColor: "#111",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: "#EDEDED" },
    });
  }, []);

  const openGroup = (g: any) => {
    setChatListStoreV2({
      type: "goToMsgChat",
      chatListState: [],
      curConvo: {
        convoId: g.id,
        curReceiverInfo: { act: g.title, image: "" },
        convoMember: [],
        isGroup: true,
        groupName: g.title,
        ...g,
      },
      chatType: "",
      convoId: g.id,
    });
    navigate.navigate("pages/chats/msg-chats/index", {
      chatType: "",
      convoId: g.id,
    });
  };

  return (
    <ScrollView
      style={{ backgroundColor: "#EDEDED", flex: 1 }}
      contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
    >
      <View style={{ backgroundColor: "#fff", borderRadius: 10 }}>
        {groups.map((g, i) => {
          const memberCount = g.memberNames?.length || 0;
          return (
            <TouchableOpacity
              key={g.id}
              activeOpacity={0.7}
              onPress={() => openGroup(g)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: 14,
                borderBottomWidth: i < groups.length - 1 ? 0.5 : 0,
                borderBottomColor: "#E5E6EB",
              }}
            >
              <RoleAvatar name={g.title} size={46} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 16, color: themeColor.text5 }}>
                  {g.title}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{
                    color: themeColor.text3,
                    fontSize: 12,
                    marginTop: 3,
                  }}
                >
                  {memberCount > 0
                    ? `(${memberCount}) ${cleanChatText(g.lastMessage || "")}`
                    : cleanChatText(g.lastMessage || "")}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
        {!groups.length ? (
          <Text
            style={{
              color: themeColor.text3,
              fontSize: 13,
              textAlign: "center",
              padding: 28,
            }}
          >
            还没有群聊，去主页右上角「发起群聊」创建一个吧
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
};

export default GroupChats;
