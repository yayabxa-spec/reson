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
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import eventBus from "../utils/eventBus";
import { totalUnread } from "../store/unread";
import { getMomentsUnreadCount } from "../store/momentsNotify";
import { springs } from "../anim/motion";
import { hapticLight } from "../utils/haptics";
import { GlassDock, type GlassDockTab } from "../component/complex/GlassDock";
import { resolveDIYTheme } from "../../theme/diyTheme";

// tab 选中弹跳：focused 变为 true 时，图标+文字整体 spring 回弹一下（带过冲）
const Bounce = ({
  focused,
  children,
}: {
  focused: boolean;
  children: ReactNode;
}) => {
  const progress = useSharedValue(1); // 0 起跳 → 1 落定，初始 1 避免启动时弹跳
  useEffect(() => {
    if (focused) {
      progress.value = 0;
      progress.value = withSpring(1, springs.bouncy);
    }
  }, [focused, progress]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 0.86 + 0.14 * progress.value }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
};

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
  const glassDock = skin.layout.dock === "glass";
  // glass 皮肤沿用 material 的图标/文案/徽标体系，仅 dock 与 Header 外观不同
  const materialLike = material || glassDock;

  // 统一 tab 按钮：去掉安卓圆形水波纹 + 无条件导航。
  // react-navigation 默认 onPress 带 if(!focused) 短路，快速连点时闭包里的
  // focused 滞后，会把"切到别的页"的点击误判为"点当前页"而静默吞掉。
  // 这里直接用 router.navigate(href) 绕过该判断（导航到当前页本身是 no-op，无副作用）。
  const AlwaysPressTabButton = (props: any) => {
    const router = useRouter();
    const focused = Boolean(props["aria-selected"]);
    return (
      <Pressable
        role={props.role}
        accessibilityState={
          props["aria-selected"] ? { selected: true } : undefined
        }
        android_ripple={{ color: "transparent" }}
        onPress={() => {
          hapticLight();
          if (props.href) router.navigate(props.href);
          else props.onPress?.();
        }}
        onLongPress={props.onLongPress}
        style={[
          props.style,
          // glass dock 的选中胶囊指示器（Catalog：黑色 10% 表面）
          focused && glassDock
            ? {
                backgroundColor: "rgba(0, 0, 0, 0.08)",
                borderRadius: 28,
                marginHorizontal: 4,
                marginVertical: 4,
              }
            : null,
        ]}
      >
        <Bounce focused={focused}>{props.children}</Bounce>
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
    const textColor = materialLike
      ? focused
        ? themeColor.onSurface
        : themeColor.onSurfaceVariant
      : color;
    return (
      <Text
        style={{
          fontSize: materialLike ? 11 : 12,
          color: textColor,
          fontWeight: material ? "500" : "400",
          // 全宽 + 居中：杜绝不同字数标签在按钮里的水平漂移（"我"单字最明显）
          width: "100%",
          textAlign: "center",
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
          top: materialLike ? -4 : 0,
          right: materialLike ? -6 : -10,
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
          top: materialLike ? -4 : 0,
          right: materialLike ? -6 : -10,
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
    : glassDock
      ? {
          // 悬浮玻璃 dock：tabBar 容器 absolute 悬浮，screen 内容延伸到
          // dock 后面，页面背景层（PageSource）才能覆盖 dock 折射区域
          position: "absolute" as const,
          backgroundColor: "transparent",
          borderTopWidth: 0,
          elevation: 0,
        }
    : {
        height: 58 + insets.bottom,
        paddingTop: 6,
        paddingBottom: insets.bottom,
      };

  // glass 皮肤的悬浮胶囊 dock：独立组件（含可拖拽玻璃指示器）
  const routerTab = useRouter();
  const glassTabs: GlassDockTab[] = [
    {
      key: "index",
      href: "/",
      label: skin.labels.chats,
      icon: (focused, color) => (
        <Ionicons
          name={focused ? "chatbubble-ellipses" : "chatbubble-ellipses-outline"}
          size={24}
          color={color}
        />
      ),
      badge: unreadBadge,
    },
    {
      key: "contacts",
      href: "/contacts",
      label: skin.labels.contacts,
      icon: (focused, color) => (
        <Ionicons
          name={focused ? "people" : "people-outline"}
          size={24}
          color={color}
        />
      ),
      badge: friendRed ? newFriendDot : null,
    },
    {
      key: "discover",
      href: "/discover",
      label: skin.labels.discover,
      icon: (focused, color) => (
        <Ionicons
          name={focused ? "compass" : "compass-outline"}
          size={24}
          color={color}
        />
      ),
      badge: momentsBadge,
    },
    {
      key: "me",
      href: "/me",
      label: skin.labels.me,
      icon: (focused, color) => (
        <Ionicons name={focused ? "person" : "person-outline"} size={24} color={color} />
      ),
    },
  ];

  return (
    <Tabs
      initialRouteName="index"
      // 自定义 tabBar 必须是 Navigator 顶层 prop（screenOptions 里不生效）：
      // glass 皮肤用悬浮玻璃 Dock，其他皮肤用默认 tab bar（样式走 screenOptions）
      tabBar={
        glassDock
          ? (props: any) => {
              // v0.61.1-diy：Header/GlassDock 在 PageSource 之外，
              // 经 resolveDIYTheme(当前 route) 获取各自的颜色切片
              const diy = resolveDIYTheme(props.state.routes[props.state.index].name);
              return (
                <GlassDock
                  tabs={glassTabs}
                  activeIndex={props.state.index}
                  pageSourceId={`page-${props.state.routes[props.state.index].name}`}
                  diy={diy}
                  onSelect={(i: number) => {
                    // 用 expo-router 的 href 导航（AlwaysPressTabButton 同款可靠路径）
                    routerTab.navigate(glassTabs[i]?.href as never);
                  }}
                />
              );
            }
          : undefined
      }
      screenOptions={({ route }) => {
        // v0.61.1-diy：Header 按 route 取 DIY page.header（无配置回落 fillColor）
        const diy = resolveDIYTheme(route.name);
        return {
          headerTitleAlign: "center",
          headerStyle: {
            backgroundColor: diy?.page?.header ?? themeColor.fillColor,
            ...(material ? { elevation: 0 } : {}),
          },
          headerShadowVisible: false,
          tabBarActiveTintColor: materialLike
            ? themeColor.onSecondaryContainer
            : themeColor.primary,
          tabBarInactiveTintColor: materialLike
            ? themeColor.onSurfaceVariant
            : "#999999",
          tabBarButton: AlwaysPressTabButton,
          tabBarStyle: dockStyle,
        };
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarLabel: ({ color, focused }) => {
            return (
              <TabText color={color} focused={focused}>
                {materialLike ? skin.labels.chats : t("Chats")}
              </TabText>
            );
          },
          tabBarIcon: ({ size, color, focused }) => {
            if (materialLike) {
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
                {materialLike ? skin.labels.contacts : t("Contacts")}
              </TabText>
            );
          },
          headerTitle: materialLike ? skin.labels.contacts : t("Contacts"),
          tabBarIcon: ({ size, color, focused }) => {
            if (materialLike) {
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
                {materialLike ? skin.labels.discover : t("Discover")}
              </TabText>
            );
          },
          headerTitle: materialLike ? skin.labels.discover : t("Discover"),
          tabBarIcon: ({ size, color, focused }) => {
            if (materialLike) {
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
                {materialLike ? skin.labels.me : t("Me")}
              </TabText>
            );
          },
          headerShown: false,
          tabBarIcon: ({ size, color, focused }) => {
            if (materialLike) {
              return (
                <View style={{ position: "relative" }}>
                  <Ionicons
                    name={focused ? "person" : "person-outline"}
                    size={24}
                    color={color}
                  />
                </View>
              );
            }
            if (focused) {
              return (
                <View style={{ position: "relative" }}>
                  <MeActiveIcon />
                </View>
              );
            }
            return (
              <View style={{ position: "relative" }}>
                <MeIcon />
              </View>
            );
          },
        }}
      ></Tabs.Screen>
    </Tabs>
  );
};
export default Layout;
