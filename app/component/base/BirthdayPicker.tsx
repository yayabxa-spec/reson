import React, { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useTheme } from "../../../theme/useTheme";

const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

interface BirthdayPickerProps {
  visible: boolean;
  value?: string; // "MM-DD"
  onConfirm: (value: string | undefined) => void;
  onClose: () => void;
}

/**
 * 生日选择器（自绘）：月/日网格点选，无年份。
 * 规则：12 个月均可选（生日只有月日、无年份）；仅当月中的"今天"
 * 不可选（直接不显示，例如今天 8.16，则 8 月里没有 16 日）。
 * 纯 JS，无滚轮手势、无原生依赖。
 */
const BirthdayPicker = ({
  visible,
  value,
  onConfirm,
  onClose,
}: BirthdayPickerProps) => {
  const { themeColor } = useTheme();
  const now = new Date();
  const nowMonth = now.getMonth() + 1;
  const nowDay = now.getDate();

  const [selMonth, setSelMonth] = useState<number | null>(null);
  const [selDay, setSelDay] = useState<number | null>(null);

  // 打开时按当前值初始化
  useEffect(() => {
    if (!visible) return;
    const [mRaw, dRaw] = (value || "6-1").split("-");
    const m = parseInt(mRaw, 10);
    const d = parseInt(dRaw, 10);
    const mm = m >= 1 && m <= 12 ? m : null;
    setSelMonth(mm);
    // 已存的生日恰好是"今天"时视为未选（今天不可选）
    const today = mm === nowMonth && d === nowDay;
    setSelDay(d >= 1 && d <= 31 && !today ? d : null);
  }, [visible, value]);

  const daysInMonth = selMonth ? MONTH_DAYS[selMonth - 1] : 0;

  // 仅当月中的"今天"隐藏（其它月份的同一天照常可选）
  const dayHidden = (d: number) =>
    selMonth === nowMonth && d === nowDay;

  const ready = !!selMonth && !!selDay;

  const confirm = () => {
    if (!ready) return;
    onConfirm(
      `${String(selMonth).padStart(2, "0")}-${String(selDay).padStart(
        2,
        "0"
      )}`
    );
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.35)",
          justifyContent: "flex-end",
        }}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View
          style={{
            backgroundColor: "#fff",
            borderTopLeftRadius: 14,
            borderTopRightRadius: 14,
            paddingHorizontal: 18,
            paddingBottom: 28,
          }}
        >
          {/* 标题栏 */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 14,
            }}
          >
            <TouchableOpacity
              onPress={() => {
                onConfirm(undefined);
                onClose();
              }}
            >
              <Text style={{ color: themeColor.text3, fontSize: 15 }}>
                清除
              </Text>
            </TouchableOpacity>
            <Text
              style={{
                flex: 1,
                textAlign: "center",
                fontSize: 16,
                fontWeight: "600",
                color: themeColor.text5,
              }}
            >
              选择生日
            </Text>
            <TouchableOpacity onPress={confirm} disabled={!ready}>
              <Text
                style={{
                  color: ready ? themeColor.primary : themeColor.text2,
                  fontSize: 15,
                  fontWeight: "600",
                }}
              >
                确定
              </Text>
            </TouchableOpacity>
          </View>

          {/* 月份 */}
          <Text style={{ color: themeColor.text3, fontSize: 13 }}>月份</Text>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              marginTop: 6,
            }}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
              const active = selMonth === m;
              return (
                <TouchableOpacity
                  key={m}
                  onPress={() => {
                    setSelMonth(m);
                    setSelDay(null);
                  }}
                  style={{
                    width: "16.66%",
                    paddingVertical: 8,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      color: active ? themeColor.primary : themeColor.text5,
                      fontWeight: active ? "600" : "400",
                    }}
                  >
                    {m}月
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 日期 */}
          <Text
            style={{ color: themeColor.text3, fontSize: 13, marginTop: 12 }}
          >
            日期
          </Text>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              marginTop: 6,
            }}
          >
            {Array.from(
              { length: daysInMonth },
              (_, i) => i + 1
            )
              .filter((d) => !dayHidden(d))
              .map((d) => {
                const active = selDay === d;
                return (
                  <TouchableOpacity
                    key={d}
                    onPress={() => setSelDay(d)}
                    style={{
                      width: "14.28%",
                      paddingVertical: 8,
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 15,
                        color: active ? themeColor.primary : themeColor.text5,
                        fontWeight: active ? "600" : "400",
                      }}
                    >
                      {d}
                    </Text>
                  </TouchableOpacity>
                );
              })}
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default BirthdayPicker;
