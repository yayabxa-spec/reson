import Toast from "../../component/base/Toast";
import { List } from "react-native-paper";
import { themeColor } from "../../../theme/light";
import { useIsFocused, useNavigation, useRouter } from "expo-router";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useLayoutEffect, useState } from "react";
import { useCallback } from "react";
import { useFocusEffect } from "expo-router";
import {
  SafeAreaView,
  Text,
  Image,
  View,
  Pressable,
  Platform,
} from "react-native";
import { TouchableOpacity } from "react-native";
import PlusMenu from "../chats/component/PlusMenu";
import HeaderPlus from "../../component/base/HeaderPlus";
import { useTheme } from "../../../theme/useTheme";
import { Ionicons } from "@expo/vector-icons";
import { getMomentsUnreadCount } from "../../store/momentsNotify";
import eventBus from "../../utils/eventBus";
import WeChatDialog from "../../component/base/WeChatDialog";
import CardIn from "../../anim/CardIn";
import PressableScale from "../../anim/PressableScale";
import { useGlassDockPadding } from "../../component/complex/LiquidGlass";
import { PageSource } from "../../component/complex/NativeBackdrop";
import { GlassDiyBackdrop } from "../../component/complex/GlassDiyBackdrop";
import { DIYThemeProvider } from "../../../theme/useTheme";
const Discover = () => {
  const navigator = useNavigation();
  const { t } = useTranslation();
  const { skin, themeColor, skinId } = useTheme();
  const isFocused = useIsFocused();
  const material = skin.layout.dock === "material";
  const glassDock = skin.layout.dock === "glass";
  const dockPad = useGlassDockPadding();
  // SafeAreaView 已含状态栏 inset，玻璃透明 Header 只需补头部本体高度
  const glassTop = glassDock ? 56 : 0;
  const [menuVisible, setMenuVisible] = useState(false);
  const [momentsUnread, setMomentsUnread] = useState(0);
  const [groupConfirm, setGroupConfirm] = useState(false);

  const refreshMomentsUnread = useCallback(async () => {
    const n = await getMomentsUnreadCount();
    setMomentsUnread(n);
  }, []);

  const select = (text: string) => {
    if (text === "发起群聊") {
      setGroupConfirm(true);
    } else if (text === "添加朋友") {
      navigator.navigate("pages/contacts/screens/add-contacts/index");
    }
  };

  useLayoutEffect(() => {
    navigator.setOptions({
      headerRight: () => (
        <HeaderPlus onPress={() => setMenuVisible((v) => !v)} />
      ),
      headerRightContainerStyle: { paddingRight: 12 },
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshMomentsUnread();
      eventBus.on("moments-unread-updated", refreshMomentsUnread);
      return () => {
        eventBus.off("moments-unread-updated", refreshMomentsUnread);
        setMenuVisible(false);
      };
    }, [refreshMomentsUnread])
  );

  const cardList = [
    {
      text: skin.layout.dock === "material" ? skin.labels.moments : t("moments"),
      url: require("../../../assets/icon/discover/moments.jpeg"),
      onPressHandler: () => {
        navigator.navigate("pages/discover/moments/index");
      },
    },
  ];
  const MATERIAL_CARD_ICONS: Record<
    string,
    { name: any; bg: string; color: string }
  > = {
    好友动态: {
      name: "images",
      bg: themeColor.tertiaryContainer,
      color: themeColor.tertiary,
    },
    朋友圈: {
      name: "images",
      bg: themeColor.tertiaryContainer,
      color: themeColor.tertiary,
    },
  };
  return (
    <View style={{ flex: 1, backgroundColor: themeColor.surfaceContainerLow }}>
      <PageSource
        enabled={skinId === "glass"}
        sourceId="page-discover"
        active={isFocused}
      >
      <DIYThemeProvider route="discover">
      <GlassDiyBackdrop route="discover" />
      <SafeAreaView
        style={{
          backgroundColor: themeColor.surfaceContainerLow,
          paddingTop: glassTop,
          paddingBottom: dockPad,
        }}
      >
        {cardList.map((card, cardIdx) => {
        return (
          <CardIn
            key={card.text}
            delay={Math.min(cardIdx * 60, 300)}
            style={{ backgroundColor: themeColor.surfaceContainerLowest }}
          >
            <PressableScale
              scaleTo={0.985}
              onPress={() => card.onPressHandler?.()}
            >
            <List.Item
              title={card.text}
              titleStyle={{ fontSize: 16, color: themeColor.onSurface }}
              style={{
                minHeight: 56,
                paddingLeft: 16,
                paddingRight: 8,
              }}
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
                      name={MATERIAL_CARD_ICONS[card.text]?.name || "apps"}
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
              right={() => (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                >
                  {momentsUnread > 0 && (
                    <View
                      style={{
                        backgroundColor: themeColor.error,
                        borderRadius: 9,
                        minWidth: 18,
                        height: 18,
                        alignItems: "center",
                        justifyContent: "center",
                        paddingHorizontal: 4,
                        marginRight: 8,
                      }}
                    >
                      <Text
                        style={{
                          color: "#fff",
                          fontSize: 11,
                          fontWeight: "600",
                        }}
                      >
                        {momentsUnread > 99 ? "99+" : momentsUnread}
                      </Text>
                    </View>
                  )}
                  <List.Icon
                    icon="chevron-right"
                    color={themeColor.onSurfaceVariant}
                  />
                </View>
              )}
            />
            </PressableScale>
          </CardIn>
        );
        })}
      </SafeAreaView>
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
          navigator.navigate("pages/chats/screens/create-group/index");
        }}
      />
    </View>
  );
};
export default Discover;
