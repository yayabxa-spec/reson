import { useEffect, useLayoutEffect, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "expo-router";
import { useTheme } from "../../../../../theme/useTheme";
import {
  getFontScale,
  getThemeMode,
  loadAppearance,
  setFontScale,
  setThemeMode,
  subscribeAppearance,
  ThemeMode,
} from "../../../../store/appearance";
import Toast from "../../../../component/base/Toast";
import Segment from "../../../../component/base/Segment";
import {
  getActiveSkinId,
  getBuildSkin,
  getThemeSource,
  loadSkin,
  loadThemeSource,
  setActiveSkinId,
  setThemeSource,
  subscribeSkin,
  SKIN_FIXED,
  type ThemeSource,
} from "../../../../../theme/skinState";
import { getSkin } from "../../../../../theme/skins";
import { GlassSlider } from "../../../../component/complex/GlassSlider";

const FONT_LEVELS = [0.85, 0.95, 1.0, 1.1, 1.2, 1.3, 1.45];
const FONT_LABELS = ["较小", "偏小", "标准", "偏大", "较大", "很大", "特大"];
const THEME_PRESETS = [
  { label: "靛蓝", color: "#5B67F1" },
  { label: "紫", color: "#7C4DFF" },
  { label: "蓝", color: "#1E88E5" },
  { label: "青", color: "#00B8A9" },
  { label: "绿", color: "#2E7D32" },
  { label: "橙", color: "#FF7043" },
  { label: "粉", color: "#E91E8C" },
  { label: "红", color: "#C62828" },
];

const Display = () => {
  const navigate = useNavigation();
  const { themeColor, skinId: activeSkinId } = useTheme();
  const [mode, setMode] = useState<ThemeMode>(getThemeMode());
  const [scale, setScale] = useState(getFontScale());
  const [skinId, setSkinIdState] = useState(getActiveSkinId());
  const [source, setSource] = useState<ThemeSource>(getThemeSource());

  useEffect(() => {
    loadAppearance().then(() => {
      setMode(getThemeMode());
      setScale(getFontScale());
    });
    const unsub = subscribeAppearance(() => {
      setMode(getThemeMode());
      setScale(getFontScale());
    });
    return unsub;
  }, []);

  useEffect(() => {
    loadSkin().then(() => setSkinIdState(getActiveSkinId()));
    const unsub = subscribeSkin(() => setSkinIdState(getActiveSkinId()));
    return unsub;
  }, []);

  useEffect(() => {
    loadThemeSource().then(() => setSource(getThemeSource()));
    const unsub = subscribeSkin(() => setSource(getThemeSource()));
    return unsub;
  }, []);

  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerTitle: "界面与显示",
      headerTitleAlign: "center",
      headerTintColor: "#111",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: "#EDEDED" },
    });
  }, []);

  const levelIdx = Math.round(
    FONT_LEVELS.reduce(
      (best, v, i) =>
        Math.abs(v - scale) < Math.abs(FONT_LEVELS[best] - scale) ? i : best,
      2
    )
  );

  return (
    <ScrollView
      style={{ backgroundColor: "#EDEDED", flex: 1 }}
      contentContainerStyle={{ paddingBottom: 30 }}
    >
      {!SKIN_FIXED && (
        <View
          style={{
            backgroundColor: "#fff",
            marginTop: 12,
            paddingVertical: 12,
          }}
        >
          <Text
            style={{
              color: themeColor.text3,
              fontSize: 13,
              marginHorizontal: 14,
              marginBottom: 8,
            }}
          >
            界面皮肤
          </Text>
          <View style={{ flexDirection: "row", paddingHorizontal: 14 }}>
            {(["wechat", "clean", "glass"] as const)
              .filter((id) => !(id === "glass" && getBuildSkin() === "clean"))
              .map((id, _idx, _arr) => {
                const active = skinId === id;
                const skin = getSkin(id);
                const isGlass = id === "glass";
                return (
                  <TouchableOpacity
                    key={id}
                    onPress={() => setActiveSkinId(id)}
                    style={{
                      flex: 1,
                      alignItems: "center",
                      paddingVertical: 14,
                      marginRight: 10,
                      borderRadius: 10,
                      borderWidth: 1.5,
                      borderColor: active ? themeColor.primary : "#E5E6EB",
                      backgroundColor: active
                        ? skin.overrides.brandLight
                        : "#F7F8FA",
                    }}
                  >
                    <View
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 17,
                        backgroundColor: skin.overrides.primary,
                        marginBottom: 6,
                        ...(isGlass
                          ? {
                              borderWidth: 1.5,
                              borderColor: "rgba(255,255,255,0.7)",
                              opacity: 0.85,
                            }
                          : {}),
                      }}
                    />
                    <Text
                      style={{
                        fontSize: 14,
                        color: active ? themeColor.primary : themeColor.text5,
                        fontWeight: active ? "600" : "400",
                      }}
                    >
                      {skin.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
          </View>
          <Text
            style={{
              color: themeColor.text2,
              fontSize: 12,
              marginTop: 8,
              marginHorizontal: 14,
            }}
          >
            玻璃风格在 Android 13+ 显示完整折射效果，低版本自动降级为磨砂或半透明；清爽风格用于对外发布的合规版本，Android 12 及以上会跟随系统动态取色（Monet）
          </Text>
        </View>
      )}

      <View
        style={{
          backgroundColor: "#fff",
          marginTop: 12,
          paddingVertical: 12,
        }}
      >
        <Text
          style={{
            color: themeColor.text3,
            fontSize: 13,
            marginHorizontal: 14,
            marginBottom: 8,
          }}
        >
          主题色（清爽风格）
        </Text>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            paddingHorizontal: 14,
          }}
        >
          <TouchableOpacity
            onPress={() => setThemeSource({ mode: "system" })}
            style={{ alignItems: "center", marginRight: 12, marginBottom: 8 }}
          >
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                borderWidth: source.mode === "system" ? 2.5 : 1,
                borderColor:
                  source.mode === "system"
                    ? themeColor.primary
                    : themeColor.outlineVariant,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: themeColor.surfaceContainerHigh,
              }}
            >
              <Text style={{ fontSize: 10, color: themeColor.onSurfaceVariant }}>
                自动
              </Text>
            </View>
            <Text
              style={{
                fontSize: 11,
                marginTop: 3,
                color:
                  source.mode === "system"
                    ? themeColor.primary
                    : themeColor.text3,
              }}
            >
              跟随系统
            </Text>
          </TouchableOpacity>
          {THEME_PRESETS.map((p) => {
            const active = source.mode === "preset" && source.color === p.color;
            return (
              <TouchableOpacity
                key={p.color}
                onPress={() =>
                  setThemeSource({ mode: "preset", color: p.color })
                }
                style={{
                  alignItems: "center",
                  marginRight: 12,
                  marginBottom: 8,
                }}
              >
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    backgroundColor: p.color,
                    borderWidth: active ? 3 : 1,
                    borderColor: active ? themeColor.onSurface : "#fff",
                    shadowColor: "#000",
                    shadowOpacity: 0.15,
                    shadowRadius: 3,
                    shadowOffset: { width: 0, height: 1 },
                    elevation: 2,
                  }}
                />
                <Text
                  style={{
                    fontSize: 11,
                    marginTop: 3,
                    color: active ? themeColor.primary : themeColor.text3,
                  }}
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text
          style={{
            color: themeColor.text2,
            fontSize: 12,
            marginTop: 6,
            marginHorizontal: 14,
          }}
        >
          选择后按 Monet 算法生成整套主题色；小米系统动态取色可能不生效，用预设色更稳定
        </Text>
      </View>

      {/* 聊天背景（全局默认） */}
      <View style={{ backgroundColor: "#fff", marginTop: 12 }}>
        <TouchableOpacity
          activeOpacity={0.6}
          style={{
            paddingHorizontal: 14,
            height: 52,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
          onPress={() =>
            navigate.navigate("pages/chats/screens/chat-bg/index" as never)
          }
        >
          <Text style={{ fontSize: 15, color: themeColor.text5 }}>
            聊天背景
          </Text>
          <Text style={{ fontSize: 14, color: themeColor.text3 }}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={{ backgroundColor: "#fff", paddingHorizontal: 14, paddingVertical: 12 }}>
        <Text style={{ fontSize: 15, color: themeColor.text5, fontWeight: "600" }}>
          深色模式
        </Text>
        <View style={{ marginTop: 12 }}>
          <Segment
            options={[
              { label: "浅色", value: "light" },
            ]}
            value={mode}
            onChange={(v) => {
              setThemeMode("light");
              Toast.success("已切换");
            }}
          />
        </View>
        <Text style={{ color: themeColor.text2, fontSize: 12, marginTop: 6 }}>
          深色模式暂时不可用，修复后会重新开放
        </Text>
      </View>

      <View style={{ backgroundColor: "#fff", marginTop: 12, paddingVertical: 10 }}>
        <Text
          style={{
            color: themeColor.text3,
            fontSize: 13,
            marginHorizontal: 14,
            marginBottom: 6,
          }}
        >
          字体大小
        </Text>

        {/* 聊天预览 */}
        <View style={{ paddingHorizontal: 14, paddingVertical: 10, backgroundColor: "#F7F7F7" }}>
          <View style={{ alignItems: "flex-end" }}>
            <View
              style={{
                backgroundColor: themeColor.brand2,
                borderRadius: 6,
                maxWidth: "75%",
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Text style={{ fontSize: 16 * scale, color: "#111" }}>
                预览字体大小
              </Text>
            </View>
          </View>
          <View style={{ alignItems: "flex-start", marginTop: 10 }}>
            <View
              style={{
                backgroundColor: "#fff",
                borderRadius: 6,
                maxWidth: "80%",
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Text style={{ fontSize: 16 * scale, color: "#111" }}>
                拖动下面的滑块，可设置字体大小
              </Text>
            </View>
          </View>
          <View style={{ alignItems: "flex-start", marginTop: 10 }}>
            <View
              style={{
                backgroundColor: "#fff",
                borderRadius: 6,
                maxWidth: "90%",
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Text style={{ fontSize: 16 * scale, color: "#111" }}>
                设置后，会改变聊天界面的字体大小
              </Text>
            </View>
          </View>
        </View>

        {/* 滑块面板 */}
        <View style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
          <Text
            style={{
              color: themeColor.text3,
              fontSize: 12,
              textAlign: "center",
            }}
          >
            {FONT_LABELS[levelIdx]}
          </Text>
          {activeSkinId === "glass" ? (
            /* glass 皮肤：玻璃滑块（Catalog glass-slider 教程） */
            <View style={{ marginTop: 14, paddingHorizontal: 10 }}>
              <GlassSlider
                value={levelIdx / (FONT_LEVELS.length - 1)}
                onChange={(v) => {
                  const idx = Math.round(
                    v * (FONT_LEVELS.length - 1)
                  );
                  const next = FONT_LEVELS[idx];
                  if (next !== scale) {
                    setFontScale(next);
                    setScale(next);
                  }
                }}
                accent={themeColor.primary}
              />
            </View>
          ) : (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: 10,
              }}
            >
              <Text style={{ fontSize: 13, color: themeColor.text3 }}>A</Text>
              {FONT_LEVELS.map((v, i) => {
                const active = i === levelIdx;
                return (
                  <TouchableOpacity
                    key={i}
                    onPress={() => setFontScale(v)}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      backgroundColor: active ? themeColor.primary : "#D8D8D8",
                      borderWidth: active ? 2 : 0,
                      borderColor: "#fff",
                      marginHorizontal: 4,
                    }}
                  />
                );
              })}
              <Text style={{ fontSize: 17, color: themeColor.text3 }}>A</Text>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
};

export default Display;
