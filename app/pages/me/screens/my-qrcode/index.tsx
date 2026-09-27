import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "expo-router";
import { Fontisto } from "@expo/vector-icons";
import { useTheme } from "../../../../../theme/useTheme";
import { useProfile } from "../../../../hooks/useProfile";
import MyQrcode from "../../../../component/complex/MyQrcode";
import UserAvatar from "../../../../component/complex/UserAvatar";
import { captureScreenAndSaveToAlbum } from "../../../../../utils.ts";
import Toast from "../../../../component/base/Toast";

const QR_COLORS = [
  "#1A1A1A",
  "#5B67F1",
  "#576B95",
  "#FA5151",
  "#F5A623",
  "#8E6FE8",
  "#00B8A9",
  "#5B8DEF",
  "#EF8354",
];

const WECHAT_ICONS = [
  require("../../../../../assets/qr-center-wechat-0.png"),
  require("../../../../../assets/qr-center-wechat-1.png"),
  require("../../../../../assets/qr-center-wechat-2.png"),
  require("../../../../../assets/qr-center-wechat-3.png"),
  require("../../../../../assets/qr-center-wechat-4.png"),
  require("../../../../../assets/qr-center-wechat-5.png"),
  require("../../../../../assets/qr-center-wechat-6.png"),
  require("../../../../../assets/qr-center-wechat-7.png"),
  require("../../../../../assets/qr-center-wechat-8.png"),
];

const SHARE_ICON = require("../../../../../assets/qr-center-share.jpg");
const CLEAN_ICON = require("../../../../../assets/skins/clean/qr-center.png");
const SHARE_COLOR = "#3280C8";
const SAVE_W = 300;
const SAVE_H = 446;

function randomColor(): string {
  return QR_COLORS[Math.floor(Math.random() * QR_COLORS.length)];
}

const MoneyQrcode = () => {
  const { themeColor, skinId } = useTheme();
  const navigation = useNavigation();
  const profile = useProfile();
  const [open1, setOpen1] = useState(true);
  const [open2, setOpen2] = useState(false);
  const [color1, setColor1] = useState("#1A1A1A");
  const card1Ref = useRef<View>(null);
  const card2Ref = useRef<View>(null);
  const clean = skinId === "clean";
  const centerIcons = clean
    ? QR_COLORS.map(() => CLEAN_ICON)
    : WECHAT_ICONS;
  const shareIcon = clean ? CLEAN_ICON : SHARE_ICON;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTitle: "我的二维码",
      headerTitleAlign: "center",
      headerTintColor: "#111",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: "#EDEDED" },
    });
  }, [navigation]);

  const userId = profile.wechatId || profile.name || "local-user";
  const qr1 = "me-page+userId+" + userId;
  const qr2 = "share-cards+userId+" + userId;

  const changeStyle = () => {
    setColor1(randomColor());
    Toast.success("已更换样式");
  };

  const Card = ({
    icon,
    iconColor,
    title,
    subtitle,
    open,
    onToggle,
    children,
  }: {
    icon: string;
    iconColor: string;
    title: string;
    subtitle: string;
    open: boolean;
    onToggle: () => void;
    children?: ReactNode;
  }) => (
    <View
      style={{
        backgroundColor: "#fff",
        borderRadius: 14,
        marginHorizontal: 12,
        marginBottom: 12,
        padding: 20,
      }}
    >
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onToggle}
        style={{ flexDirection: "row", alignItems: "center" }}
      >
        <Fontisto
          name={icon as any}
          size={20}
          color={iconColor}
          style={{ marginRight: 12 }}
        />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, color: "#1A1A1A", fontWeight: "500" }}>
            {title}
          </Text>
          {!open && (
            <Text
              style={{
                fontSize: 14,
                color: "#B2B2B2",
                marginTop: 2,
              }}
            >
              {subtitle}
            </Text>
          )}
        </View>
        <Fontisto
          name={open ? "angle-up" : "angle-down"}
          size={14}
          color={themeColor.text3}
        />
      </TouchableOpacity>
      {open ? children : null}
    </View>
  );

  return (
    <View style={{ backgroundColor: "#EDEDED", flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}
      >
        <Card
          icon="qrcode"
          iconColor="#F5A623"
          title="添加我为朋友"
          subtitle="扫二维码，添加我为朋友。"
          open={open1}
          onToggle={() => {
            setOpen1(!open1);
            setOpen2(false);
          }}
        >
          <View
            ref={card1Ref}
            collapsable={false}
            style={{
              backgroundColor: "#fff",
              width: SAVE_W,
              height: SAVE_H,
              alignSelf: "center",
              paddingTop: 16,
              paddingBottom: 16,
              alignItems: "center",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                alignSelf: "flex-start",
              }}
            >
              <UserAvatar
                source={{ uri: profile.avatar || undefined }}
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 16,
                  borderColor: "transparent",
                  marginRight: 12,
                }}
              />
              <Text style={{ fontSize: 18, color: "#1A1A1A" }}>
                {profile.name}
              </Text>
            </View>
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MyQrcode
                value={qr1}
                size={232}
                color={color1}
                centerImage={
                  centerIcons[QR_COLORS.indexOf(color1)] ?? CLEAN_ICON
                }
              />
              <Text
                style={{
                  fontSize: 13,
                  color: themeColor.text3,
                  marginTop: 12,
                }}
              >
                扫二维码，添加我为朋友。
              </Text>
            </View>
          </View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              marginTop: 12,
            }}
          >
            <TouchableOpacity onPress={changeStyle}>
              <Text style={{ color: "#576B95", fontSize: 15 }}>换个样式</Text>
            </TouchableOpacity>
            <Text style={{ color: "#D8D8D8", marginHorizontal: 20 }}>|</Text>
            <TouchableOpacity
              onPress={() =>
                captureScreenAndSaveToAlbum(open1 ? card1Ref : card2Ref)
              }
            >
              <Text style={{ color: "#576B95", fontSize: 15 }}>保存图片</Text>
            </TouchableOpacity>
          </View>
        </Card>

        <Card
          icon="share"
          iconColor="#5B8DEF"
          title="面对面分享角色卡知识库"
          subtitle="扫二维码，分享我的角色卡和知识库。"
          open={open2}
          onToggle={() => {
            setOpen2(!open2);
            setOpen1(false);
          }}
        >
          <View
            ref={card2Ref}
            collapsable={false}
            style={{
              backgroundColor: "#fff",
              width: SAVE_W,
              height: SAVE_H,
              alignSelf: "center",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MyQrcode
              value={qr2}
              size={232}
              color={SHARE_COLOR}
              centerImage={shareIcon}
            />
            <Text
              style={{
                fontSize: 13,
                color: themeColor.text3,
                marginTop: 12,
              }}
            >
              扫二维码，分享我的角色卡和知识库。
            </Text>
          </View>
        </Card>
      </ScrollView>
    </View>
  );
};

export default MoneyQrcode;
