import {
  PanResponderInstance,
  View,
  Text,
  PanResponder,
  TouchableOpacity,
} from "react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../../../theme/useTheme";
import { getSize } from "../../../../utils.ts";
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  createAudioPlayer,
} from "expo-audio";
import { Portal } from "../Portal";
import Button from "../../base/Button/Button";
const debouncedHandleTextChange = (fn: () => void) => fn;
const AudioRecorder = ({ onVoiceEnd }) => {
  const { themeColor } = useTheme();
  const elementsRef = useRef([]);
  const [tempUri, setTempUri] = useState();
  const { t } = useTranslation();
  const [panResponderRef, setPanResponderRef] =
    useState<PanResponderInstance | null>(null);
  const durationMillis = useRef(-1);
  const [isRecording, setIsRecording] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY, (status) => {
    if (status.isRecording) durationMillis.current = status.durationMillis;
  });
  const [isOnCancelBtn, setIsOnCancelBtn] = useState(false);
  const [isOnCheckBtn, setIsOnCheckBtn] = useState(false);
  useEffect(() => {
  }, [tempUri]);
  const cleanRecState = (cleanType: "normal" | "onCheck" = "normal") => {
    if (cleanType === "normal") {
      setIsOnCheckBtn(false);
      setIsOnCancelBtn(false);
      setIsRecording(false);
    }
    if (cleanType === "onCheck") {
      setIsOnCancelBtn(false);
    }
  };
  const stopRecordingHandler = useCallback(
    async (stopType: "stop" | "cancel" = "stop", onCheckState?: boolean) => {
      // recording.setOnRecordingStatusUpdate(null);
      // if (durationMillis.current < 1500) {
      //   Toast.info(t("too short"));
      //   cleanRecState();
      //   return;
      // }
      // this line is critical for routing audio back through the speaker instead of the earpiece
      // await Audio.setAudioModeAsync({
      //   allowsRecordingIOS: false,
      // });
      if (!isRecording) {
        return;
      }
      await recorder.stop();

      if (stopType === "cancel") {
        cleanRecState();
      } else {
        const uri = recorder.uri;
        setTempUri(uri);
        // two way
        // 1 direct to send
        // 2 press send btn and send
        if (onCheckState) {
          cleanRecState("onCheck");
          return;
        }
        if (uri) {
          cleanRecState();
          // const { sound } = await Audio.Sound.createAsync({ uri });
          // await sound.playAsync();
          onVoiceEnd?.(uri);
        }
      }
    },
    [isOnCheckBtn, isOnCancelBtn, isRecording, recorder]
  );

  const startRecordingHandler = async (type = "press") => {
    if (isRecording) {
      await stopRecordingHandler();
    }
    // reset
    setIsOnCheckBtn(false);
    await requestRecordingPermissionsAsync();
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
    });
    recorder.record();
    setIsRecording(true);
    // console.log(recording, "setRecording");
  };
  useEffect(() => {
    setPanResponderRef(
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: async (evt, gestureState) => {
          const touchIndex = await getTouchedElementIndex(
            evt.nativeEvent.pageX,
            evt.nativeEvent.pageY,
            "onPanResponderRelease"
          );
          if (touchIndex === 0) {
            setIsOnCheckBtn(true);
          } else {
            setIsOnCheckBtn(false);
          }
          // 如果在第二个元素上
          if (touchIndex === 1) {
            setIsOnCancelBtn(true);
          } else {
            setIsOnCancelBtn(false);
          }
        },
        onPanResponderRelease: async (evt, gestureState) => {
          // 检测手指移动过程中是否触碰到了元素5
          const touchIndex = await getTouchedElementIndex(
            evt.nativeEvent.pageX,
            evt.nativeEvent.pageY,
            "onPanResponderRelease"
          );
          // 如果在第一个元素上
          let onCheckState;
          let onCancelState;
          if (touchIndex === 0) {
            onCheckState = true;
            setIsOnCheckBtn(true);
          } // 如果在第二个元素上
          if (touchIndex === 1) {
            onCancelState = true;
            setIsOnCancelBtn(true);
          }
          // 松开手指时结束录音并尝试播放
          //  if on the second ele than cancel the recording
          if (onCancelState && isRecording) {
            stopRecordingHandler("cancel");
            return;
          }
          if (isRecording) {
            stopRecordingHandler("stop", onCheckState);
          }
        },
      })
    );
  }, [isRecording, isOnCancelBtn, isOnCheckBtn]);

  // 功能函数：根据触摸位置判断触碰到的元素索引
  const getTouchedElementIndex = (pageX, pageY, type) => {
    return new Promise((res, rej) => {
      // console.log(type, "type---------");
      let touchedIndex = -1;
      const lastIndex = elementsRef.current.length - 1;
      elementsRef.current.forEach(async (element, index) => {
        if (element) {
          try {
            // console.log("element");
            await element.measure(
              (x, y, width, height, pageXElem, pageYElem) => {
                if (
                  pageX >= pageXElem &&
                  pageX <= pageXElem + width &&
                  pageY >= pageYElem &&
                  pageY <= pageYElem + height
                ) {
                  // debouncedHandleTextChange(() => {
                  //   console.log(
                  //     pageX,
                  //     pageY,
                  //     pageXElem,
                  //     pageYElem,
                  //     "debouncedHandleTextChange"
                  //   );
                  //   console.log(
                  //     `Element ${index} is touchedtouchedtouchedtouched`
                  //   );
                  // });

                  touchedIndex = index;
                  res(touchedIndex);
                }
                if (index === lastIndex) {
                  res(touchedIndex);
                }
              }
            );
          } catch (e) {
          }
        }
      });

      // console.log("getTouchedElementIndex", touchedIndex);
    });
  };

  const playSound = async () => {
    try {
      const player = createAudioPlayer({ uri: tempUri + "" });
      player.play();
    } catch (error) {
      // 错误处理
      console.error("播放音频时发生错误", error);
    }
  };
  return (
    <View style={{ flex: 1 }}>
      <View {...panResponderRef?.panHandlers}>
        {isRecording && (
          <Portal>
            <View
              style={{
                backgroundColor: themeColor.overlay4,
                position: "absolute",
                height: "100%",
                width: "100%",
                bottom: 0,
              }}
            >
              <View
                style={{
                  position: "absolute",
                  bottom: getSize(100),
                  left: 0,
                  right: 0,
                  paddingHorizontal: getSize(32),
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                {/* 点击按钮播放音频 */}
                {isOnCheckBtn && tempUri && (
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      position: "absolute",
                      width: getSize(375),
                      paddingHorizontal: 24,
                      bottom: getSize(110),
                    }}
                  >
                    {
                      <Button
                        type="primary"
                        style={{ marginBottom: 12 }}
                        onPress={() => {
                          playSound();

                          return;
                        }}
                      >
                        {t("play voice")}
                      </Button>
                    }
                    <Button
                      type="primary"
                      onPress={() => {
                        setTempUri("");
                        cleanRecState();
                        onVoiceEnd?.(tempUri);
                      }}
                    >
                      {t("send")}
                    </Button>
                    <Button
                      type="primary"
                      onPress={() => {
                        setTempUri("");
                        cleanRecState();
                      }}
                    >
                      {t("cancel")}
                    </Button>
                  </View>
                )}
                <View
                  ref={(el) => (elementsRef.current[0] = el)}
                  style={{
                    borderRadius: getSize(75),
                    width: getSize(75),
                    height: getSize(75),
                    margin: 10,
                    justifyContent: "center",
                    alignItems: "center",
                    backgroundColor: isOnCheckBtn
                      ? themeColor.white
                      : themeColor.text3,
                  }}
                >
                  <Text>{t("check it")}</Text>
                </View>
                <View
                  ref={(el) => (elementsRef.current[1] = el)}
                  style={{
                    borderRadius: getSize(75),
                    width: getSize(75),
                    height: getSize(75),
                    margin: 10,
                    justifyContent: "center",
                    alignItems: "center",
                    backgroundColor: isOnCancelBtn
                      ? themeColor.white
                      : themeColor.text3,
                  }}
                >
                  <Text>{t("cancel")}</Text>
                </View>
              </View>
            </View>
          </Portal>
        )}
        <TouchableOpacity
          style={{
            borderRadius: 4,
            paddingVertical: 10,
            backgroundColor: themeColor.fill1,
            justifyContent: "center",
            alignItems: "center",
            width: "100%",
          }}
          onPress={() => {
            stopRecordingHandler();
          }}
          onPressIn={async () => {
            await startRecordingHandler();
          }}
        >
          <Text style={{ fontSize: 16 }}>
            {isRecording ? t("Release to Send") : t("Hold to Talk")}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default AudioRecorder;
