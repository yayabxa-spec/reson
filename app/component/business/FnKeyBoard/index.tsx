import {
  View,
  Text,
  Animated,
  TouchableOpacity,
  Dimensions,
  StyleSheet,
} from "react-native";
import PanelSvgs from "../../../../assets/icon/utils/svgs";
import { convertCamelCaseToNormal, getSize } from "../../../../utils.ts";
import { useNavigation, useRouter } from "expo-router";
import { useState } from "react";
import { pickImages } from "../../../hooks/useImagePicker";
import * as ImagePicker from "expo-image-picker";
import { useTheme } from "../../../../theme/useTheme";
import { useLoadingStore } from "../../../store/globalLoading";
import { Toast } from "../../base/Toast";
import { GlassSurface } from "../../complex/LiquidGlass";
export const FN_TYPE_MAPS = {
  Album: "Album",
  Camera: "Camera",
  VideoCall: "VideoCall",
  Location: "Location",
  RedPacket: "RedPacket",
  Transfer: "Transfer",
  VoiceInput: "VoiceInput",
  Favorites: "Favorites",
};
const iconOrderOne = [
  FN_TYPE_MAPS.Album,
  FN_TYPE_MAPS.Camera,
  FN_TYPE_MAPS.Favorites,
  "File",
];

const { width } = Dimensions.get("window");

const iconOrderTwo: string[] = [];
const FN_LABELS: Record<string, string> = {
  Album: "相册",
  Camera: "拍摄",
  VideoCall: "视频通话",
  Location: "位置",
  RedPacket: "红包",
  Transfer: "转账",
  VoiceInput: "语音输入",
  Favorites: "收藏",
  ContactCard: "名片",
  File: "文件",
  Coupons: "卡券",
  Music: "音乐",
};
const getStyle = (themeColor: ReturnType<typeof useTheme>["themeColor"]) => {
  const styles = StyleSheet.create({
    container: {
      flex: 1,
    },
    child: { width, justifyContent: "center" },
    text: { fontSize: width * 0.5, textAlign: "center" },
    touchItemWrapper: {
      flexDirection: "row",
      flexWrap: "wrap",
    },
    touchItem: {
      marginHorizontal: 16,
      justifyContent: "center",
      alignItems: "center",
      borderRadius: 16,
      backgroundColor: themeColor.white,
      width: getSize(60),
      height: getSize(60),
    },
  });
  return styles;
};
const FnKeyBoard = ({
  heightValue,
  handlers,
}: {
  heightValue: number;
  handlers: (data: { type: string; val?: any }) => void;
}) => {
  // console.log("FnKeyBoard", heightValue);
  const { themeColor, skinId } = useTheme();
  const isGlass = skinId === "glass";
  const router = useRouter();
  const { setLoadingStore } = useLoadingStore();

  const navigator = useNavigation();
  const styles = getStyle(themeColor);
  const svgHandler = async (name: string) => {
    switch (name) {
      case "Album":

        const imageList = await pickImages({
          beforeUploaded: () => {
            setLoadingStore({ loading: true, text: "uploading..." });
          },
          afterUploaded: () => {
            setLoadingStore({ loading: false });
          },
        });

        if (imageList.length > 0) {
          handlers?.({
            type: FN_TYPE_MAPS.Album,
            val: imageList.length === 1 ? imageList[0] : imageList,
          });
        }

        break;
      case "Camera":
        try {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) {
            Toast.info("需要相机权限");
            break;
          }
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.8,
          });
          if (!result.canceled && result.assets?.[0]?.uri) {
            handlers?.({ type: FN_TYPE_MAPS.Camera, val: result.assets[0].uri });
          }
        } catch {}
        break;
      case FN_TYPE_MAPS.Favorites:
        handlers?.({ type: FN_TYPE_MAPS.Favorites });
        break;
      case "File":
        handlers?.({ type: "File" });
        break;
    }
  };
  const SvgText = ({ children }: { children: string }) => (
    <Text
      style={{
        fontSize: 11,
        marginVertical: 8,
        color: themeColor.text4,
        textAlign: "center",
      }}
    >
      {FN_LABELS[children] || convertCamelCaseToNormal(children)}
    </Text>
  );

  const [showIndicator, setShowIndicator] = useState(false);
  const onLayoutChange = (event: any) => {
    const { height } = event.nativeEvent.layout;
    // console.log(height, "height");
    if (height > 200) {
      setShowIndicator(true);
      return;
    }
    setShowIndicator(false);
  };
  return (
    <Animated.View
      onLayout={onLayoutChange}
      style={{
        // backgroundColor: "blue",
        borderTopColor: themeColor.fill5,
        borderTopWidth: isGlass ? 0 : StyleSheet.hairlineWidth,
        height: heightValue,
        paddingTop: 12,
        width: "100%",
        bottom: 0,
      }}
    >
      {/* glass 皮肤：玻璃抽屉背景（Catalog glass-bottom-sheet 配方：
          44dp 顶圆角 + 轻 blur + 深透镜 + 白 50% 表面） */}
      {isGlass && (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              borderTopLeftRadius: 44,
              borderTopRightRadius: 44,
              overflow: "hidden",
            },
          ]}
        >
          <GlassSurface
            fallbackBackgroundColor="rgba(250, 250, 250, 0.6)"
            preset="cardOverMedia"
            variant="clear"
            borderRadius={44}
            thickness={2.2}
            legibilityFloor={0.12}
            style={StyleSheet.absoluteFill}
          />
        </View>
      )}
      <View style={[styles.child, styles.touchItemWrapper]}>
        {[...iconOrderOne, ...iconOrderTwo].map((iconName, index) => {
          const Svg = (PanelSvgs as Record<string, any>)[iconName];
          const glassItem = (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                svgHandler(iconName);
              }}
            >
              <GlassSurface
                fallbackBackgroundColor="rgba(255,255,255,0.5)"
                variant="clear"
                borderRadius={16}
                thickness={1.2}
                legibilityFloor={0.1}
                style={{
                  width: getSize(60),
                  height: getSize(60),
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Svg width={32} height={32} />
              </GlassSurface>
            </TouchableOpacity>
          );
          return (
            <View key={index + iconName}>
              {isGlass ? (
                glassItem
              ) : (
                <TouchableOpacity
                  style={styles.touchItem}
                  onPress={() => {
                    svgHandler(iconName);
                  }}
                >
                  <Svg width={32} height={32} />
                </TouchableOpacity>
              )}
              <SvgText>{iconName}</SvgText>
            </View>
          );
        })}
      </View>

    </Animated.View>
  );
};
export default FnKeyBoard;
