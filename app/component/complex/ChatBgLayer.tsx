import React, { memo } from "react";
import { Image, StyleSheet, View } from "react-native";
import LinearGradient from "react-native-linear-gradient";
import type { ChatBg } from "../../store/chatBg";

/**
 * 聊天背景层：按配置渲染图片/纯色/渐变，铺满父容器（原图直接铺，不加遮罩）。
 * 无背景时渲染 null。父容器需有确定尺寸（聊天页放最底层 absolute fill）。
 */
const ChatBgLayer = memo(({ bg }: { bg?: ChatBg | null }) => {
  if (!bg) return null;
  if (bg.type === "image") {
    return (
      <Image
        source={{ uri: bg.uri }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />
    );
  }
  if (bg.type === "gradient") {
    return <LinearGradient colors={[bg.from, bg.to]} style={StyleSheet.absoluteFill} />;
  }
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: bg.value }]} />
  );
});

export default ChatBgLayer;
