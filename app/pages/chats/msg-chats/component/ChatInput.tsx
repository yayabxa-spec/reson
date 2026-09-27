import { TextInput, Text, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { themeColor } from "../../../../../theme/light";
import Emoji from "../../../../../assets/icon/keyboard-panel/emoji-icon.svg";
import VoiceRecord from "../../../../../assets/icon/keyboard-panel/voice-record.svg";
import CirclePlus from "../../../../../assets/icon/circle-plus.svg";
import { getSize } from "../../../../../utils.ts";
import AudioRecorder from "../../../../component/business/AudioRecorder";
import PressableScale from "../../../../anim/PressableScale";
import { springs } from "../../../../anim/motion";
import {
  forwardRef,
  memo,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

const ChatInput = (
  {
    value,
    onEndEditing,
    onVoiceEnd,
    onChangeText,
    chatPress,
    onFocus,
    emojiPress,
    plusPress,
    transparent = false,
  },
  ref
) => {
  const [voiceInput, setVoiceInput] = useState(false);
  const [init, setInit] = useState(true);
  const [focused, setFocused] = useState(false);
  const hasText = !!(value || "").trim();
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    setInit(true);
  });

  // 聚焦微反馈：输入区整体轻微上浮（1.01），失焦回落，"托起"感
  const lift = useSharedValue(0);
  const liftStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + lift.value * 0.01 }],
  }));

  // 如果需要暴露子组件的特定方法或属性给父组件
  useImperativeHandle(ref, () => ({
    focus: () => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    },
    clear: () => {
      if (inputRef.current) {
        inputRef.current.clear();
      }
    },
    setVoiceInput,
  }));
  return (
    <Animated.View
      style={[
        {
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
          columnGap: 4,
          padding: 8,
        },
        liftStyle,
      ]}
    >
      <PressableScale
        scaleTo={0.85}
        onPress={() => {
          chatPress?.();
          setInit(false);
          setVoiceInput(!voiceInput);
        }}
      >
        <VoiceRecord style={{ marginRight: 4 }} width={28} height={28} />
      </PressableScale>

      <View style={{ flex: 1 }}>
        {voiceInput ? (
          <Animated.View
            key="voice"
            entering={FadeIn.duration(140)}
            exiting={FadeOut.duration(90)}
          >
            <AudioRecorder onVoiceEnd={onVoiceEnd} />
          </Animated.View>
        ) : (
          <Animated.View
            key="text"
            entering={FadeIn.duration(140)}
            exiting={FadeOut.duration(90)}
          >
            <TextInput
              ref={inputRef}
              value={value}
              selectionColor={themeColor.primary}
              onChangeText={onChangeText}
              returnKeyType="send"
              onSubmitEditing={onEndEditing}
              onFocus={(e) => {
                setFocused(true);
                lift.value = withSpring(1, springs.gentle);
                onFocus?.(e);
              }}
              onBlur={() => {
                setFocused(false);
                lift.value = withSpring(0, springs.snappy);
              }}
              autoFocus={!voiceInput && !init}
              blurOnSubmit={false}
              style={{
                borderRadius: 4,
                height: getSize(38),
                paddingLeft: 8,
                fontSize: 18,
                paddingVertical: 8,
                // 自定义聊天背景时输入框改半透明白，透出背景又不影响可读性
                backgroundColor: transparent
                  ? "rgba(255,255,255,0.9)"
                  : themeColor.white,
              }}
            ></TextInput>
          </Animated.View>
        )}
      </View>

      <PressableScale
        scaleTo={0.85}
        onPress={() => {
          emojiPress?.();
        }}
      >
        <Emoji width={30} height={30} />
      </PressableScale>
      {hasText ? (
        // 微信行为：输入框有字时 ➕ 变为发送按钮
        <PressableScale
          scaleTo={0.92}
          onPress={() => {
            onEndEditing?.();
          }}
          style={{
            marginLeft: 4,
            backgroundColor: themeColor.primary,
            paddingHorizontal: 14,
            height: getSize(34),
            borderRadius: getSize(6),
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#fff", fontSize: 15, fontWeight: "500" }}>
            发送
          </Text>
        </PressableScale>
      ) : (
        <PressableScale
          scaleTo={0.85}
          onPress={() => {
            plusPress?.();
          }}
        >
          <CirclePlus width={30} height={30} />
        </PressableScale>
      )}
    </Animated.View>
  );
};
export default memo(forwardRef(ChatInput));
