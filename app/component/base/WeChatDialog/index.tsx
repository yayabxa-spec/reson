import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  Dimensions,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useTheme } from "../../../../theme/useTheme";
import Pop from "../../../anim/Pop";

const SCREEN_W = Dimensions.get("window").width;

/**
 * 微信风格标准弹窗：
 * 确认 / 输入 统一 50-50 按钮、按钮与边框对齐，
 * 支持标题、正文、输入框、自定义内容、确认倒计时、危险色。
 * 未来所有弹窗统一调用它。
 */
const WeChatDialog = ({
  visible,
  title,
  message,
  input,
  children,
  confirmText = "确定",
  cancelText = "取消",
  danger = false,
  countdown = 0,
  cancelCountdown = 0,
  backdropClosable = true,
  onConfirm,
  onCancel,
  onBackdropPress,
}: {
  visible: boolean;
  title?: string;
  message?: string;
  input?: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    secure?: boolean;
  };
  children?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  countdown?: number;
  cancelCountdown?: number;
  backdropClosable?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
  onBackdropPress?: () => void;
}) => {
  const { themeColor, skin } = useTheme();
  const material = skin.layout.dialog === "material";
  const [left, setLeft] = useState(countdown);
  const [cancelLeft, setCancelLeft] = useState(cancelCountdown);

  useEffect(() => {
    if (!visible) return;
    setLeft(countdown);
    setCancelLeft(cancelCountdown);
    const timers: ReturnType<typeof setInterval>[] = [];
    if (countdown > 0) {
      timers.push(
        setInterval(() => {
          setLeft((c) => {
            if (c <= 1) {
              clearInterval(timers[0]);
              return 0;
            }
            return c - 1;
          });
        }, 1000)
      );
    }
    if (cancelCountdown > 0) {
      timers.push(
        setInterval(() => {
          setCancelLeft((c) => {
            if (c <= 1) {
              clearInterval(timers[1]);
              return 0;
            }
            return c - 1;
          });
        }, 1000)
      );
    }
    return () => timers.forEach((t) => clearInterval(t));
  }, [visible, countdown, cancelCountdown]);

  const width = Math.round(SCREEN_W * 0.82);
  const confirmDisabled = left > 0;
  const cancelDisabled = cancelLeft > 0;
  const showTitle = !!title;
  const showBody = !!message || !!input || !!children;

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onBackdropPress || onCancel}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.4)",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={
            backdropClosable ? onBackdropPress || onCancel : undefined
          }
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        />
        {/* 弹出弹性：与长按菜单/面板统一的手感（Pop 只负责入场，Modal 自身仍 fade） */}
        <Pop visible from="center">
        <View
          style={{
            width,
            borderRadius: material ? 28 : 10,
            backgroundColor: material
              ? themeColor.surfaceContainerLowest
              : "#fff",
            overflow: "hidden",
            ...(material
              ? {
                  elevation: 24,
                  shadowColor: "#000",
                  shadowOpacity: 0.2,
                  shadowRadius: 24,
                  shadowOffset: { width: 0, height: 12 },
                }
              : {}),
          }}
        >
          {showTitle ? (
            <Text
              style={{
                fontSize: material ? 22 : 17,
                fontWeight: "600",
                color: material ? themeColor.onSurface : "#1A1A1A",
                textAlign: material ? "left" : "center",
                marginTop: showBody
                  ? material
                    ? 20
                    : 18
                  : material
                  ? 16
                  : 0,
                paddingHorizontal: material ? 24 : 18,
              }}
            >
              {title}
            </Text>
          ) : null}
          {message ? (
            <Text
              style={{
                fontSize: material ? 16 : 14,
                color: material ? themeColor.onSurfaceVariant : themeColor.text3,
                textAlign: material ? "left" : "center",
                lineHeight: material ? 24 : 21,
                paddingHorizontal: material ? 24 : 22,
                paddingVertical: showTitle || input || children
                  ? material
                    ? 12
                    : 14
                  : material
                  ? 20
                  : 26,
              }}
            >
              {message}
            </Text>
          ) : null}
          {input ? (
            <View
              style={{
                paddingHorizontal: material ? 24 : 18,
                paddingBottom: material ? 16 : 14,
              }}
            >
              <TextInput
                value={input.value}
                onChangeText={input.onChange}
                placeholder={input.placeholder}
                placeholderTextColor={themeColor.text2}
                secureTextEntry={input.secure}
                autoFocus
                style={{
                  backgroundColor: material ? "transparent" : themeColor.bg2,
                  borderRadius: material ? 6 : 6,
                  borderWidth: material ? 1 : 0,
                  borderColor: material
                    ? themeColor.outlineVariant
                    : "transparent",
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: material ? 16 : 15,
                  color: material ? themeColor.onSurface : themeColor.text5,
                }}
              />
            </View>
          ) : null}
          {children ? (
            <View
              style={{
                paddingHorizontal: material ? 24 : 18,
                paddingBottom: material ? 16 : 14,
              }}
            >
              {children}
            </View>
          ) : null}
          {material ? (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                paddingHorizontal: 16,
                paddingBottom: 14,
                paddingTop: 4,
              }}
            >
              {onCancel ? (
                <TouchableOpacity
                  disabled={cancelDisabled}
                  onPress={onCancel}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 20,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: cancelDisabled
                        ? themeColor.text2
                        : themeColor.primary,
                    }}
                  >
                    {cancelDisabled
                      ? `${cancelText}（${cancelLeft}）`
                      : cancelText}
                  </Text>
                </TouchableOpacity>
              ) : null}
              {onConfirm ? (
                <TouchableOpacity
                  disabled={confirmDisabled}
                  onPress={onConfirm}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 20,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: confirmDisabled
                        ? themeColor.text2
                        : danger
                        ? themeColor.error
                        : themeColor.primary,
                    }}
                  >
                    {confirmDisabled
                      ? `${confirmText}（${left}）`
                      : confirmText}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : (
            <View
              style={{
                flexDirection: "row",
                borderTopWidth: 0.5,
                borderTopColor: "#E5E6EB",
              }}
            >
              <TouchableOpacity
                disabled={cancelDisabled}
                onPress={onCancel}
                style={{
                  flex: 1,
                  height: 48,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    color: cancelDisabled ? themeColor.text2 : "#1A1A1A",
                  }}
                >
                  {cancelDisabled
                    ? `${cancelText}（${cancelLeft}）`
                    : cancelText}
                </Text>
              </TouchableOpacity>
              <View style={{ width: 0.5, backgroundColor: "#E5E6EB" }} />
              <TouchableOpacity
                disabled={confirmDisabled}
                onPress={onConfirm}
                style={{
                  flex: 1,
                  height: 48,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    color: confirmDisabled
                      ? themeColor.text2
                      : danger
                      ? "#FA5151"
                      : themeColor.primary,
                  }}
                >
                  {confirmDisabled
                    ? `${confirmText}（${left}）`
                    : confirmText}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        </Pop>
      </View>
    </Modal>
  );
};

export default WeChatDialog;
