import QrCodeIcon from "../../../assets/icon/qr-code.svg";
import ArrowRightIcon from "../../../assets/icon/common/arrow-right.svg";
import SettingIcon from "../../../assets/icon/common/setting-outline.svg";
import Favorites from "../../../assets/icon/me/favorites.svg";
import Sticker from "../../../assets/icon/keyboard-panel/emoji-icon.svg";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/useTheme";
import * as Haptics from "expo-haptics";
import {
  SafeAreaView,
  Text,
  View,
  Image,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import Image1 from "../../component/base/Image";
import { Divider, List } from "react-native-paper";
import Toast from "../../component/base/Toast";
import SimpleLogin from "./components/SimpleLogin";
import { useUser } from "../../store/user";
import { useProfile } from "../../hooks/useProfile";
import { useIsFocused, useNavigation } from "expo-router";

import { useEffect, useState } from "react";
import { useConfigState } from "../../store/globalConfig";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getFriendRoles } from "../../store/worldline";
import { useGlassDockPadding } from "../../component/complex/LiquidGlass";
import { PageSource } from "../../component/complex/NativeBackdrop";
import { GlassDiyBackdrop } from "../../component/complex/GlassDiyBackdrop";
import { DIYThemeProvider } from "../../../theme/useTheme";

const Me = () => {
  // return <PusherTester />;
  const { config } = useConfigState();
  const insets = useSafeAreaInsets();
  const { themeColor, skin, skinId } = useTheme();
  const isFocused = useIsFocused();
  const material = skin.layout.dock === "material";
  const dockPad = useGlassDockPadding();

  const friendColors = ["#5B8DEF", "#5B67F1", "#F5A623"];
  const { userStore } = useUser();
  const profile = useProfile();
  const navigator = useNavigation();
  const [friendCount, setFriendCount] = useState(0);
  useEffect(() => {
    getFriendRoles()
      .then((list) => setFriendCount(list.length))
      .catch(() => {});
  }, []);
  const serviceList = [
    {
      text: "收藏",
      icon: material ? (
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: themeColor.primaryContainer,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="star" size={22} color={themeColor.primary} />
        </View>
      ) : (
        <Favorites width={24} height={24} fill={themeColor.primary} />
      ),
    },
    {
      text: "表情",
      icon: material ? (
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: themeColor.tertiaryContainer,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="happy" size={22} color={themeColor.tertiary} />
        </View>
      ) : (
        <Sticker width={24} height={24} fill={themeColor.iconYellow} />
      ),
    },
  ];

  return (
    <PageSource
      enabled={skinId === "glass"}
      sourceId="page-me"
      active={isFocused}
    >
    <DIYThemeProvider route="me">
    <GlassDiyBackdrop route="me" />
    <SafeAreaView
      style={{ backgroundColor: themeColor.surfaceContainerLow, flex: 1 }}
    >
      <ScrollView
        style={{ backgroundColor: themeColor.surfaceContainerLow }}
        contentContainerStyle={{ paddingBottom: dockPad }}
      >
        <View
          className="flex-row"
          style={{
            backgroundColor: themeColor.white,
            paddingTop: Math.max(insets.top, 30) + 26,
            paddingBottom: 32,
            paddingHorizontal: 32,
          }}
        >
          <Image
            source={
              profile.avatar
                ? { uri: profile.avatar }
                : require("../../../assets/avatar-default.jpeg")
            }
            style={{
              width: 60,
              height: 60,
              borderRadius: 16,
            }}
          />
          <View className="flex-1" style={{ marginLeft: 20 }}>
            <View className="flex-row justify-between items-center">
              <Text
                style={{ fontSize: 22, fontWeight: "600", color: "#1A1A1A" }}
              >
                {profile.name}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  navigator.navigate("pages/me/screens/my-qrcode/index");
                }}
                hitSlop={8}
              >
                {material ? (
                  <Ionicons
                    name="qr-code"
                    size={20}
                    color={themeColor.onSurfaceVariant}
                  />
                ) : (
                  <QrCodeIcon width={18} />
                )}
              </TouchableOpacity>
            </View>
            <View className="flex-row justify-between items-center" style={{ marginTop: 5 }}>
              <Text style={{ fontSize: 14, color: themeColor.text3 }}>
                账号：{profile.wechatId || "未设置"}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  navigator.navigate("pages/me/screens/profile/index");
                }}
                hitSlop={8}
              >
                <ArrowRightIcon />
              </TouchableOpacity>
            </View>
            {/* 状态 + 朋友：横向并排胶囊 */}
            <View className="flex-row" style={{ marginTop: 14 }}>
              <TouchableOpacity
                className="flex-row justify-center items-center"
                onPress={() =>
                  navigator.navigate("pages/me/screens/status/index")
                }
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 3,
                  borderRadius: 11,
                  borderColor: "#D5D5D5",
                  borderWidth: 1,
                }}
              >
                <View className="flex-row">
                  {friendColors.map((color, index) => {
                    return (
                      <View
                        key={index}
                        style={{
                          width: 12,
                          marginLeft: index ? -(4 + index) : 0,
                          height: 12,
                          borderRadius: 6,
                          backgroundColor: color,
                        }}
                      />
                    );
                  })}
                </View>
                <Text
                  style={{
                    marginHorizontal: 4,
                    color: themeColor.text3,
                    fontSize: 12,
                }}
              >
                  等{friendCount}个朋友
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={{ backgroundColor: themeColor.surfaceContainerLowest }}>
          {serviceList.map((service) => (
            <View key={service.text}>
              <List.Item
                title={service.text}
                titleStyle={{ fontSize: 16, color: themeColor.onSurface }}
                style={{
                  minHeight: 56,
                  paddingLeft: 16,
                  paddingRight: 8,
                }}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  if (service.text === "收藏") {
                    navigator.navigate("pages/me/screens/favorites/index");
                  } else if (service.text === "表情") {
                    Toast.info("表情功能开发中");
                  }
                }}
                left={() => service.icon}
                right={() => (
                  <List.Icon
                    icon="chevron-right"
                    color={themeColor.onSurfaceVariant}
                  />
                )}
              />
              <Divider style={{ marginLeft: 68 }} />
            </View>
          ))}
          <List.Item
            title="设置"
            titleStyle={{ fontSize: 16, color: themeColor.onSurface }}
            style={{ minHeight: 56, paddingLeft: 16, paddingRight: 8 }}
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              navigator.navigate("pages/me/setting/index");
            }}
            left={() =>
              material ? (
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: themeColor.secondaryContainer,
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 8,
                  }}
                >
                  <Ionicons
                    name="settings-outline"
                    size={22}
                    color={themeColor.secondary}
                  />
                </View>
              ) : (
                <SettingIcon width={24} height={24} fill={themeColor.iconBlue} />
              )
            }
            right={() => (
              <List.Icon
                icon="chevron-right"
                color={themeColor.onSurfaceVariant}
              />
            )}
          />
        </View>
        {/* {process.env.NODE_ENV === "development" && <SimpleLogin />} */}
      </ScrollView>
    </SafeAreaView>
    </DIYThemeProvider>
    </PageSource>
  );
};

export default Me;
