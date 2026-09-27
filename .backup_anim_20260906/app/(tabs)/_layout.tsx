import { Tabs, useRouter } from "expo-router";
import { useNavigation } from "expo-router";
import {
  type ColorValue,
  Pressable,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ContactsIcon from "../../assets/icon/tabs/contacts.svg";
import ContactsActiveIcon from "../../assets/icon/tabs/contacts-active.svg";
import DiscoverActiveIcon from "../../assets/icon/tabs/discover.svg";
import DiscoverIcon from "../../assets/icon/tabs/discover-active.svg";
import MeActiveIcon from "../../assets/icon/tabs/me-active.svg";
import MeIcon from "../../assets/icon/tabs/me.svg";
import { useTranslation } from "react-i18next";
import ChatIcon from "../../assets/icon/tabs/chats.svg";
import ChatActiveIcon from "../../assets/icon/tabs/chats-active.svg";
import "../../global.css";
import { useUser } from "../store/user";
import { useContext, useEffect, useState, type ReactNode } from "react";
import { useTheme } from "../../theme/useTheme";
import { PusherContext } from "../hooks/usePusherProvider";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import eventBus from "../utils/eventBus";
import { totalUnread } from "../store/unread";
import { getMomentsUnreadCount } from "../store/momentsNotify";

const Layout = () => {
  const [friendRed, setFriendRed] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [momentsUnread, setMomentsUnread] = useState(0);
  const { t } = useTranslation();
  const { userStore } = useUser();
  const { themeColor, skinId, skin } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const material = skin.layout.dock === "material";

  // 统一 tab 按钮：去掉安卓圆形水波纹 + 无条件导航。
  // react-navigation 默认 onPress 带 if(!focused) 短路，快速连点时闭包里的
  // focused 滞后，会把"切到别的页"的点击误判为"点当前页"而静默吞掉。
  // 这里直接用 router.navigate(href) 绕过该判断（导航到当前页本身是 no-op，无副作用）。
  const AlwaysPressTabButton = (props: any) => {
    const router = useRouter();
    return (
      <Pressable
        role={props.role}
        accessibilityState={
          props["aria-selected"] ? { selected: true } : undefined
        }
        android_ripple={{ color: "transparent" }}
        onPress={() => {
          if (props.href) router.navigate(props.href);
          else props.onPress?.();
        }}
        onLongPress={props.onLongPress}
        style={props.style}
      >
        {props.children}
      </Pressable>
    );
  };

  const TabText = ({
    children,
    color,
    focused = false,
  }: {
    children: ReactNode;
    color: ColorValue;
    focused?: boolean;
  }) => {
    const textColor = material
      ? focused
        ? themeColor.onSurface
        : themeColor.onSurfaceVariant
      : color;
    return (
      <Text
        style={{
          fontSize: material ? 11 : 12,
          color: textColor,
          fontWeight: material ? "500" : "400",
        }}
      >
        {children}
      </Text>
    );
  };

  const pusherContext = useContext(PusherContext);
  const newFriendDot = (
    <View
      style={{
        borderRadius: 10,
        position: "absolute",
        top: -8,
        right: -8,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: themeColor.danger5,
        width: 15,
        height: 15,
      }}
      pointerEvents="none"
    >
      <Text
        style={{ textAlign: "center", color: themeColor.white, fontSize: 12 }}
      >
        1
      </Text>
    </View>
  );
  const refreshUnread = async () => {
    const n = await totalUnread();
    setUnreadCount(n);
  };
  const refreshMomentsUnread = async () => {
    const n = await getMomentsUnreadCount();
    setMomentsUnread(n);
  };
  // 动态未读红点：角色评论/回复/点赞产生
  const momentsBadge =
    momentsUnread > 0 ? (
      <View
        style={{
          borderRadius: 9,
          position: "absolute",
          top: material ? -4 : 0,
          right: material ? -6 : -10,
          minWidth: 18,
          height: 18,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: themeColor.error,
          paddingHorizontal: 4,
        }}
        pointerEvents="none"
      >
        <Text
          style={{
            textAlign: "center",
            color: "#fff",
            fontSize: 11,
            fontWeight: "600",
          }}
        >
          {momentsUnread > 99 ? "99+" : momentsUnread}
        </Text>
      </View>
    ) : null;
  // 未读红点：监听本地未读变化，显示真实总数（可隐藏）
  const unreadBadge =
    unreadCount > 0 ? (
      <View
        style={{
          borderRadius: 9,
          position: "absolute",
          top: material ? -4 : 0,
          right: material ? -6 : -10,
          minWidth: 18,
          height: 18,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: themeColor.error,
          paddingHorizontal: 4,
        }}
        pointerEvents="none"
      >
        <Text
          style={{
            textAlign: "center",
            color: "#fff",
            fontSize: 11,
            fontWeight: "600",
          }}
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </Text>
      </View>
    ) : null;
  useEffect(() => {
    refreshUnread();
    eventBus.on("unread-updated", refreshUnread);
    const onContactsFocused = () => setFriendRed(false);
    eventBus.on("contacts-focused", onContactsFocused);
    const onFriendNew = () => setFriendRed(true);
    const onMessagesNew = (messagesData: any) => {
      const data = messagesData.newMsgData;
      if (userStore.userInfo?._id === data?.user?._id) {
        return;
      }
      refreshUnread();
    };
    pusherContext.socket?.on("friend:new", onFriendNew);
    eventBus.on("jump-to-msg-page", () => {});
    pusherContext.socket?.on("messages:new", onMessagesNew);
    return () => {
      eventBus.off("unread-updated", refreshUnread);
      eventBus.off("contacts-focused", onContactsFocused);
      pusherContext.socket?.off("friend:new", onFriendNew);
      pusherContext.socket?.off("messages:new", onMessagesNew);
    };
  }, [pusherContext.socket, userStore]);

  useEffect(() => {
    refreshMomentsUnread();
    eventBus.on("moments-unread-updated", refreshMomentsUnread);
    return () => {
      eventBus.off("moments-unread-updated", refreshMomentsUnread);
    };
  }, []);

  const dockStyle = material
    ? {
        height: 68 + insets.bottom,
        paddingTop: 6,
        paddingBottom: insets.bottom,
        backgroundColor: themeColor.surface,
        elevation: 8,
        shadowColor: "#000",
        shadowOpacity: 0.08,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: -2 },
        borderTopWidth: 0,
      }
    : {
        height: 58 + insets.bottom,
        paddingTop: 6,
        paddingBottom: insets.bottom,
      };

  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        headerTitleAlign: "center",
        headerStyle: {
          backgroundColor: themeColor.fillColor,
          ...(material ? { elevation: 0 } : {}),
        },
        headerShadowVisible: false,
        tabBarActiveTintColor: material
          ? themeColor.onSecondaryContainer
          : themeColor.primary,
        tabBarInactiveTintColor: material
          ? themeColor.onSurfaceVariant
          : "#999999",
        tabBarButton: AlwaysPressTabButton,
        tabBarStyle: dockStyle,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarLabel: ({ color, focused }) => {
            return (
              <TabText color={color} focused={focused}>
                {material ? skin.labels.chats : t("Chats")}
              </TabText>
            );
          },
          tabBarIcon: ({ size, color, focused }) => {
            if (material) {
              return (
                <View style={{ position: "relative" }}>
                  <Ionicons
                    name={
                      focused
                        ? "chatbubble-ellipses"
                        : "chatbubble-ellipses-outline"
                    }
                    size={24}
                    color={color}
                  />
                  {unreadBadge}
                </View>
              );
            }
            if (focused) {
              return (
                <View style={{ position: "relative" }}>
                  <ChatActiveIcon />
                  {unreadBadge}
                </View>
              );
            }
            return (
              <View style={{ position: "relative" }}>
                <ChatIcon />
                {unreadBadge}
              </View>
            );
          },
        }}
      ></Tabs.Screen>
      <Tabs.Screen
        name="contacts"
        options={{
          tabBarLabel: ({ color, focused }) => {
            return (
              <TabText color={color} focused={focused}>
                {material ? skin.labels.contacts : t("Contacts")}
              </TabText>
            );
          },
          headerTitle: material ? skin.labels.contacts : t("Contacts"),
          tabBarIcon: ({ size, color, focused }) => {
            if (material) {
              return (
                <View style={{ position: "relative" }}>
                  <Ionicons
                    name={focused ? "people" : "people-outline"}
                    size={24}
                    color={color}
                  />
                  {friendRed && newFriendDot}
                </View>
              );
            }
            if (focused) {
              return (
                <View style={{ position: "relative" }}>
                  {friendRed && newFriendDot}
                  <ContactsActiveIcon />
                </View>
              );
            }
            return (
              <View style={{ position: "relative" }}>
                {friendRed && newFriendDot}
                <ContactsIcon />
              </View>
            );
          },
        }}
      ></Tabs.Screen>
      <Tabs.Screen
        name="discover"
        options={{
          tabBarLabel: ({ color, focused }) => {
            return (
              <TabText color={color} focused={focused}>
                {material ? skin.labels.discover : t("Discover")}
              </TabText>
            );
          },
          headerTitle: material ? skin.labels.discover : t("Discover"),
          tabBarIcon: ({ size, color, focused }) => {
            if (material) {
              return (
                <View style={{ position: "relative" }}>
                  <Ionicons
                    name={focused ? "compass" : "compass-outline"}
                    size={24}
                    color={color}
                  />
                  {momentsBadge}
                </View>
              );
            }
            if (focused) {
              return (
                <View style={{ position: "relative" }}>
                  <DiscoverActiveIcon />
                  {momentsBadge}
                </View>
              );
            }
            return (
              <View style={{ position: "relative" }}>
                <DiscoverIcon />
                {momentsBadge}
              </View>
            );
          },
        }}
      ></Tabs.Screen>
      <Tabs.Screen
        name="me"
        options={{
          tabBarLabel: ({ color, focused }) => {
            return (
              <TabText color={color} focused={focused}>
                {material ? skin.labels.me : t("Me")}
              </TabText>
            );
          },
          headerShown: false,
          tabBarIcon: ({ size, color, focused }) => {
            if (material) {
              return (
                <Ionicons
                  name={focused ? "person" : "person-outline"}
                  size={24}
                  color={color}
                />
              );
            }
            if (focused) {
              return <MeActiveIcon />;
            }
            return <MeIcon width={28} height={28} />;
          },
        }}
      ></Tabs.Screen>
    </Tabs>
  );
};
export default Layout;
