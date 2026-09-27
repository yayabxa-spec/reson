import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import {
  useFocusEffect,
  useIsFocused,
  useNavigation,
} from "expo-router";
import { useTheme } from "../../../theme/useTheme";
import { Divider, List } from "react-native-paper";
import {
  ensureRolesSeeded,
  readRolesRaw,
  Role,
} from "../../store/roles";
import { useChatList } from "../../store/chatList";
import { cardList } from "./data/contacts-mocks";
import eventBus from "../../utils/eventBus";
import RoleAvatar from "../../component/complex/RoleAvatar";
import PlusMenu from "../chats/component/PlusMenu";
import HeaderPlus from "../../component/base/HeaderPlus";
import { Ionicons } from "@expo/vector-icons";
import WeChatDialog from "../../component/base/WeChatDialog";
import LiquidRefresh from "../../anim/LiquidRefresh";
import {
  useGlassDockPadding,
  useGlassHeaderPadding,
} from "../../component/complex/LiquidGlass";
import { PageSource } from "../../component/complex/NativeBackdrop";
import { GlassDiyBackdrop } from "../../component/complex/GlassDiyBackdrop";
import { DIYThemeProvider } from "../../../theme/useTheme";

const Contacts = () => {
  const { themeColor, skin, skinId } = useTheme();
  const isFocused = useIsFocused();
  const material = skin.layout.dock === "material";
  const dockPad = useGlassDockPadding();
  const headerPad = useGlassHeaderPadding();
  const navigate = useNavigation();
  const { setChatListStoreV2 } = useChatList();
  const [friends, setFriends] = useState<Role[]>([]);
  const [menuVisible, setMenuVisible] = useState(false);
  const [groupConfirm, setGroupConfirm] = useState(false);

  const select = (text: string) => {
    if (text === "发起群聊") {
      setGroupConfirm(true);
    } else if (text === "添加朋友") {
      navigate.navigate("pages/contacts/screens/add-contacts/index");
    }
  };

  const MATERIAL_CARD_ICONS: Record<
    string,
    { name: any; bg: string; color: string }
  > = {
    群聊: {
      name: "people",
      bg: themeColor.secondaryContainer,
      color: themeColor.secondary,
    },
    标签: {
      name: "pricetags",
      bg: themeColor.surfaceVariant,
      color: themeColor.onSurfaceVariant,
    },
  };

  useLayoutEffect(() => {
    navigate.setOptions({
      headerRight: () => (
        <HeaderPlus onPress={() => setMenuVisible((v) => !v)} />
      ),
      headerRightContainerStyle: { paddingRight: 12 },
    });
  }, []);

  const refresh = useCallback(async () => {
    // 启动时已确保种子完成；这里只在角色表为空时兜底一次，
    // 避免每次聚焦都全量扫角色表+会话表+拿全局锁导致切页卡顿（快速连点丢击的温床）
    let roles = await readRolesRaw();
    if (!roles.length) {
      await ensureRolesSeeded();
      roles = await readRolesRaw();
    }
    setFriends(
      roles
        .filter((r) => r.status === "done")
        .sort((a, b) => {
          if (!!a.starred !== !!b.starred) return a.starred ? -1 : 1;
          return (b.addedAt || 0) - (a.addedAt || 0);
        })
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      eventBus.emit("contacts-focused");
      refresh();
      const handler = () => refresh();
      eventBus.on("roles-updated", handler);
      return () => {
        eventBus.off("roles-updated", handler);
      };
    }, [refresh])
  );
  useFocusEffect(
    useCallback(() => {
      return () => setMenuVisible(false);
    }, [])
  );

  const openChat = (role: Role) => {
    setChatListStoreV2({
      type: "goToMsgChat",
      chatListState: [],
      curConvo: {
        convoId: "role-" + role.id,
        curReceiverInfo: { act: role.name, image: "" },
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

  return (
    <View style={{ flex: 1, backgroundColor: themeColor.surfaceContainerLow }}>
      <PageSource
        enabled={skinId === "glass"}
        sourceId="page-contacts"
        active={isFocused}
      >
      <DIYThemeProvider route="contacts">
      <GlassDiyBackdrop route="contacts" />
      <LiquidRefresh onRefresh={refresh} color={themeColor.primary}>
        {(refreshControl) => (
          <ScrollView
            refreshControl={refreshControl}
            style={{ backgroundColor: themeColor.surfaceContainerLow, flex: 1 }}
            contentContainerStyle={{
              paddingTop: headerPad,
              paddingBottom: 24 + dockPad,
            }}
          >
        <View style={{ backgroundColor: themeColor.surfaceContainerLowest }}>
          {cardList.map((card, index) => (
            <View key={index}>
              {index === 3 && (
                <View
                  style={{
                    height: 8,
                    backgroundColor: themeColor.surfaceContainerLow,
                  }}
                />
              )}
              <List.Item
                title={card.text}
                titleStyle={{ fontSize: 16, color: themeColor.onSurface }}
                style={{
                  minHeight: 56,
                  paddingLeft: 16,
                  paddingRight: 8,
                }}
                onPress={
                  card.text === "群聊"
                    ? () =>
                        navigate.navigate(
                          "pages/contacts/screens/group-chats/index"
                        )
                    : undefined
                }
                left={() =>
                  material ? (
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        marginRight: 12,
                        backgroundColor:
                          MATERIAL_CARD_ICONS[card.text]?.bg ||
                          themeColor.surfaceVariant,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ionicons
                        name={
                          MATERIAL_CARD_ICONS[card.text]?.name || "people"
                        }
                        size={22}
                        color={
                          MATERIAL_CARD_ICONS[card.text]?.color ||
                          themeColor.primary
                        }
                      />
                    </View>
                  ) : (
                    <Image
                      source={card.url}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 4,
                        marginRight: 12,
                      }}
                    />
                  )
                }
                right={
                  card.text === "群聊"
                    ? () => (
                        <List.Icon
                          icon="chevron-right"
                          color={themeColor.onSurfaceVariant}
                        />
                      )
                    : undefined
                }
              />
              {index < cardList.length - 1 && index !== 2 && (
                <Divider style={{ marginLeft: 68 }} />
              )}
            </View>
          ))}
        </View>

      <View style={{ marginTop: 8 }}>
        <Text
          style={{
            backgroundColor: themeColor.surfaceContainer,
            paddingHorizontal: 16,
            paddingVertical: 8,
            fontSize: 13,
            color: themeColor.onSurfaceVariant,
          }}
        >
          角色好友
        </Text>
        {friends.length === 0 && (
          <Text
            style={{
              textAlign: "center",
              color: themeColor.onSurfaceVariant,
              marginTop: 30,
              fontSize: 13,
            }}
          >
            还没有角色好友，去「主页」右上角 + 添加吧
          </Text>
        )}
        <View style={{ backgroundColor: themeColor.surfaceContainerLowest }}>
          {friends.map((role) => (
            <List.Item
              key={role.id}
              title={role.remark || role.name}
              description={role.region || (role as any).work || ""}
              titleStyle={{ fontSize: 16, color: themeColor.onSurface }}
              descriptionStyle={{
                fontSize: 12,
                color: themeColor.onSurfaceVariant,
              }}
              style={{
                minHeight: 60,
                paddingLeft: 16,
                paddingRight: 16,
              }}
              onPress={() =>
                navigate.navigate(
                  "pages/contacts/screens/friend-info/index",
                  {
                    friendId: role.id,
                  }
                )
              }
              left={() => (
                <RoleAvatar
                  avatar={role.avatar}
                  name={role.remark || role.name}
                  size={42}
                  style={{ marginRight: 12 }}
                />
              )}
            />
          ))}
        </View>
        </View>
          </ScrollView>
        )}
      </LiquidRefresh>
      </DIYThemeProvider>
      </PageSource>
      <PlusMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        onSelect={select}
      />
      <WeChatDialog
        visible={groupConfirm}
        title="发起群聊"
        message="此功能还在调试中，可能出现不稳定的情况"
        confirmText="我知道了"
        countdown={3}
        backdropClosable={false}
        onBackdropPress={() => setGroupConfirm(false)}
        onConfirm={() => {
          setGroupConfirm(false);
          navigate.navigate("pages/chats/screens/create-group/index");
        }}
      />
    </View>
  );
};

export default Contacts;
