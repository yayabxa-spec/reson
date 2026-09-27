import { useFocusEffect, useNavigation } from "expo-router";
import {
  FlatList,
  Text,
  View,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useUser } from "../../../store/user";
import { useChatList } from "../../../store/chatList";
import { PusherContext } from "../../../hooks/usePusherProvider";
import { useTheme } from "../../../../theme/useTheme";
import { useLocalChat } from "../../../store/localChat";
import { getSize } from "../../../../utils.ts";
import eventBus from "../../../utils/eventBus";
import RoleAvatar from "../../../component/complex/RoleAvatar";
import {
  useGlassDockPadding,
  useGlassHeaderPadding,
} from "../../../component/complex/LiquidGlass";
import { readUnreadMap } from "../../../store/unread";
import { cleanChatText } from "../../../utils/sanitize";
import dayjs from "dayjs";
import { List } from "react-native-paper";
import PressableScale from "../../../anim/PressableScale";
import LiquidRefresh from "../../../anim/LiquidRefresh";

const ConvoList = ({
  onLongPressItem,
}: {
  onLongPressItem?: (item: any) => void;
}) => {
  const navigate = useNavigation();
  const { userStore } = useUser();
  useContext(PusherContext);
  const { themeColor } = useTheme();
  const dockPad = useGlassDockPadding();
  const headerPad = useGlassHeaderPadding();
  const { setChatListStoreV2 } = useChatList();
  const {
    conversations,
    loadConversations,
    ensureSeeded,
  } = useLocalChat();
  const [loaded, setLoaded] = useState(false);
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});

  /** 会话列表时间格式 */
  const formatConvoTime = useCallback((ts: number): string => {
    if (!ts) return "";
    const d = dayjs(ts);
    const now = dayjs();
    const diffDays = now.startOf("day").diff(d.startOf("day"), "day");
    if (diffDays <= 0) return d.format("HH:mm"); // 今天：只显示时间
    if (diffDays === 1) return "昨天";
    if (diffDays <= 7) {
      const week = ["日", "一", "二", "三", "四", "五", "六"][d.day()];
      return d.isSame(now, "week") ? `周${week}` : `上周${week}`;
    }
    if (d.year() !== now.year()) return d.format("YYYY年M月D日");
    return d.format("M月D日");
  }, []);

  const refreshUnread = useCallback(async () => {
    setUnreadMap(await readUnreadMap());
  }, []);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        // ensureSeeded 内部已把会话写入状态；这里不再重复 loadConversations
        // （同一份 JSON 连续解析两次是切页卡顿的来源之一）
        await ensureSeeded();
        setLoaded(true);
      })();
      const handler = () => {
        loadConversations();
      };
      const unreadHandler = () => refreshUnread();
      refreshUnread();
      eventBus.on("local-chat-updated", handler);
      eventBus.on("unread-updated", unreadHandler);
      return () => {
        eventBus.off("local-chat-updated", handler);
        eventBus.off("unread-updated", unreadHandler);
      };
    }, [refreshUnread])
  );

  const openConvo = useCallback(
    (convo: any) => {
      setChatListStoreV2({
        type: "goToMsgChat",
        chatListState: [],
        curConvo: {
          convoId: convo.id,
          curReceiverInfo: { act: convo.remark || convo.title, image: "" },
          convoMember: [],
          isGroup: false,
          groupName: convo.title,
          ...convo,
        },
      });
      navigate.navigate("pages/chats/msg-chats/index", {
        chatType: "",
        convoId: convo.id,
      });
    },
    [setChatListStoreV2, navigate]
  );

  const renderItem = ({ item }: { item: any }) => {
    const isAI = item.id === "local-ai-1" || item.title === "AI 助手";
    const isGroup = !!item.isGroup;
    const unread = unreadMap[item.id] || 0;
    return (
      <PressableScale
        scaleTo={0.985}
        onPress={() => openConvo(item)}
        onLongPress={() => onLongPressItem?.(item)}
      >
        <List.Item
          title={item.remark || item.title}
          description={cleanChatText(item.lastMessage || "")}
          titleStyle={{ fontSize: 16, color: themeColor.onSurface }}
          descriptionStyle={{
            fontSize: 13,
            color: themeColor.onSurfaceVariant,
            marginTop: 2,
          }}
          style={{
            backgroundColor: item.pinned
              ? themeColor.surfaceContainer
              : themeColor.surfaceContainerLowest,
            minHeight: 68,
            paddingLeft: 16,
            paddingRight: 12,
          }}
          left={() => (
            <View style={style.avatarWrap}>
            {isGroup ? (
              <RoleAvatar name="群聊" size={50} style={style.avatar} />
            ) : isAI ? (
              <RoleAvatar name="AI" size={50} style={style.avatar} />
            ) : item.roleAvatar ? (
              <RoleAvatar
                avatar={item.roleAvatar}
                name={item.remark || item.title}
                size={50}
                style={style.avatar}
              />
            ) : (
              <RoleAvatar
                name={item.remark || item.title}
                size={50}
                style={style.avatar}
              />
            )}
            {unread > 0 && (
              <View style={style.unreadBadge}>
                <Text style={style.unreadText}>
                  {unread > 99 ? "99+" : unread}
                </Text>
              </View>
            )}
            </View>
          )}
          right={() => (
            <View style={{ marginLeft: 8, alignItems: "flex-end" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                {!!item.muted && (
                  <Ionicons
                    name="notifications-off-outline"
                    size={13}
                    color={themeColor.onSurfaceVariant}
                  />
                )}
                <Text style={{ fontSize: 12, color: themeColor.onSurfaceVariant }}>
                  {formatConvoTime(item.updatedAt)}
                </Text>
              </View>
            </View>
          )}
        />
      </PressableScale>
    );
  };

  return (
    <LiquidRefresh
      color={themeColor.primary}
      onRefresh={() => {
        loadConversations();
        return refreshUnread();
      }}
    >
      {(refreshControl) => (
        <FlatList
          refreshControl={refreshControl}
          data={conversations}
          keyExtractor={(item: any) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{
            paddingTop: headerPad,
            paddingBottom: dockPad,
          }}
          ListEmptyComponent={
            loaded ? (
              <Text
                style={{
                  textAlign: "center",
                  marginTop: 60,
                  color: themeColor.text3,
                }}
              >
                暂无会话
              </Text>
            ) : null
          }
        />
      )}
    </LiquidRefresh>
  );
};

const style = StyleSheet.create({
  avatar: {
    width: getSize(50),
    height: getSize(50),
    // 圆角由 RoleAvatar 按尺寸计算，这里不覆盖
  },
  avatarWrap: {
    position: "relative",
    marginRight: 12,
  },
  unreadBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#FA5151",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  unreadText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
});

export default ConvoList;
