import { useCallback, useEffect, useState } from "react";
import { Dimensions, Image, Text, TouchableOpacity, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as ImageManipulator from "expo-image-manipulator";
import { useTheme } from "../../../../../theme/useTheme";
import eventBus from "../../../../utils/eventBus";
import Toast from "../../../../component/base/Toast";

/**
 * 壁纸自由裁剪：
 * - 固定裁剪框 = 整个预览区（宽高比即手机屏幕），单指拖动、双指缩放图片
 * - 确认后按框内可见区域裁剪（expo-image-manipulator），最长边压到 1080 省空间
 * - 完成后 eventBus 发 "chat-bg-cropped"（带新 URI）并返回，chat-bg 页监听应用
 */
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

const Page = () => {
  const params = useLocalSearchParams<{ imageUri: string }>();
  const imageUri = params.imageUri || "";
  const { themeColor } = useTheme();

  const [frame, setFrame] = useState({ w: SCREEN_W, h: SCREEN_H - 120 });
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const startScale = useSharedValue(1);
  const startTx = useSharedValue(0);
  const startTy = useSharedValue(0);
  const pinchStartScale = useSharedValue(1);

  const minScale = imgSize
    ? Math.max(frame.w / imgSize.w, frame.h / imgSize.h)
    : 1;

  useEffect(() => {
    if (!imageUri) return;
    Image.getSize(
      imageUri,
      (w, h) => {
        setImgSize({ w, h });
        scale.value = Math.max(frame.w / w, frame.h / h);
      },
      () => Toast.info("图片读取失败")
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUri]);

  // 布局尺寸变化后保证最小缩放覆盖裁剪框
  useEffect(() => {
    if (!imgSize) return;
    const minS = Math.max(frame.w / imgSize.w, frame.h / imgSize.h);
    if (scale.value < minS) scale.value = minS;
    const c = clampT(translateX.value, translateY.value, scale.value);
    translateX.value = c.x;
    translateY.value = c.y;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame.w, frame.h]);

  const clampT = useCallback(
    (tx: number, ty: number, sc: number) => {
      const dx = Math.max(0, (imgSize!.w * sc - frame.w) / 2);
      const dy = Math.max(0, (imgSize!.h * sc - frame.h) / 2);
      return {
        x: Math.max(-dx, Math.min(dx, tx)),
        y: Math.max(-dy, Math.min(dy, ty)),
      };
    },
    [imgSize, frame]
  );

  const pan = Gesture.Pan()
    .onBegin(() => {
      startTx.value = translateX.value;
      startTy.value = translateY.value;
    })
    .onUpdate((e) => {
      const c = clampT(startTx.value + e.translationX, startTy.value + e.translationY, scale.value);
      translateX.value = c.x;
      translateY.value = c.y;
    })
    .runOnJS(true);

  const pinch = Gesture.Pinch()
    .onBegin(() => {
      startScale.value = scale.value;
      startTx.value = translateX.value;
      startTy.value = translateY.value;
      pinchStartScale.value = scale.value;
    })
    .onUpdate((e) => {
      const next = Math.max(minScale, Math.min(8, pinchStartScale.value * e.scale));
      // 以双指中心为锚点缩放：缩放前后锚点下的图像点保持不动
      const fx = e.focalX - frame.w / 2;
      const fy = e.focalY - frame.h / 2;
      const ratio = next / scale.value;
      const nx = fx - (fx - translateX.value) * ratio;
      const ny = fy - (fy - translateY.value) * ratio;
      scale.value = next;
      const c = clampT(nx, ny, next);
      translateX.value = c.x;
      translateY.value = c.y;
    })
    .runOnJS(true);

  const gesture = Gesture.Simultaneous(pan, pinch);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const onConfirm = useCallback(async () => {
    if (!imgSize || saving) return;
    setSaving(true);
    try {
      // 框内可见区域 → 图像像素坐标
      const dispW = imgSize.w * scale.value;
      const dispH = imgSize.h * scale.value;
      const topLeftX = (frame.w - dispW) / 2 + translateX.value;
      const topLeftY = (frame.h - dispH) / 2 + translateY.value;
      const originX = Math.max(0, Math.round(-topLeftX / scale.value));
      const originY = Math.max(0, Math.round(-topLeftY / scale.value));
      const width = Math.min(imgSize.w - originX, Math.round(frame.w / scale.value));
      const height = Math.min(imgSize.h - originY, Math.round(frame.h / scale.value));
      if (width < 10 || height < 10) {
        Toast.info("选区太小，调整后再试");
        setSaving(false);
        return;
      }
      const actions: ImageManipulator.Action[] = [
        { crop: { originX, originY, width, height } },
        { resize: { width: Math.min(1080, width) } },
      ];
      const result = await ImageManipulator.manipulateAsync(
        imageUri,
        actions,
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
      );
      eventBus.emit("chat-bg-cropped", { uri: result.uri });
      router.back();
    } catch (e: any) {
      Toast.info("裁剪失败：" + (e?.message || e));
      setSaving(false);
    }
  }, [imgSize, frame, scale, translateX, translateY, imageUri, saving]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <View
        style={{ flex: 1, overflow: "hidden" }}
        onLayout={(e) => {
          setFrame({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
        }}
      >
        {imgSize && (
          <GestureDetector gesture={gesture}>
            <Animated.View
              style={[
                {
                  position: "absolute",
                  left: (frame.w - imgSize.w) / 2,
                  top: (frame.h - imgSize.h) / 2,
                  width: imgSize.w,
                  height: imgSize.h,
                },
                imageStyle,
              ]}
            >
              <Image
                source={{ uri: imageUri }}
                style={{ width: "100%", height: "100%" }}
                resizeMode="stretch"
              />
            </Animated.View>
          </GestureDetector>
        )}
        {/* 三分线参考，帮助构图 */}
        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}>
          <View style={{ position: "absolute", top: "33.33%", left: 0, right: 0, height: StyleSheet_hairline, backgroundColor: "rgba(255,255,255,0.35)" }} />
          <View style={{ position: "absolute", top: "66.66%", left: 0, right: 0, height: StyleSheet_hairline, backgroundColor: "rgba(255,255,255,0.35)" }} />
          <View style={{ position: "absolute", left: "33.33%", top: 0, bottom: 0, width: StyleSheet_hairline, backgroundColor: "rgba(255,255,255,0.35)" }} />
          <View style={{ position: "absolute", left: "66.66%", top: 0, bottom: 0, width: StyleSheet_hairline, backgroundColor: "rgba(255,255,255,0.35)" }} />
        </View>
      </View>

      {/* 底部操作栏 */}
      <View
        style={{
          height: 96,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 28,
          paddingBottom: 20,
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ paddingVertical: 10, paddingHorizontal: 16 }}
        >
          <Text style={{ color: "#fff", fontSize: 16 }}>取消</Text>
        </TouchableOpacity>
        <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
          拖动调整位置 · 双指缩放大小
        </Text>
        <TouchableOpacity
          onPress={onConfirm}
          disabled={saving}
          style={{
            backgroundColor: saving ? "rgba(255,255,255,0.3)" : themeColor.primary,
            paddingVertical: 10,
            paddingHorizontal: 22,
            borderRadius: 20,
          }}
        >
          <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
            {saving ? "处理中…" : "确定"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// 细线宽度常量（避免引入 StyleSheet 命名冲突）
const StyleSheet_hairline = 1;

export default Page;
