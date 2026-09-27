import React, { useState } from "react";
import { Modal, Pressable, View } from "react-native";
import FastImage from "react-native-fast-image";

/**
 * 轻量图片全屏查看器：黑底 + 原图 contain 展示，点任意处关闭。
 * 只用 Modal + FastImage，无轮播/Portal/二维码扫描等重逻辑，保证点开必响应。
 * 用法：<ImageViewer uri={uri} onPressLong={...}>{缩略图}</ImageViewer>
 */
const ImageViewer = ({
  uri,
  children,
  onPressLong,
}: {
  uri: string;
  children: React.ReactNode;
  onPressLong?: () => void;
}) => {
  const [visible, setVisible] = useState(false);
  return (
    <View>
      <Pressable
        onPress={() => setVisible(true)}
        onLongPress={onPressLong}
        delayLongPress={250}
      >
        {children}
      </Pressable>
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.96)" }}
          onPress={() => setVisible(false)}
        >
          <FastImage
            source={{ uri }}
            style={{ flex: 1 }}
            resizeMode={FastImage.resizeMode.contain}
          />
        </Pressable>
      </Modal>
    </View>
  );
};

export default ImageViewer;
