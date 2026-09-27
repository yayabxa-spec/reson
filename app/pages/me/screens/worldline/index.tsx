import { useEffect, useLayoutEffect, useState } from "react";
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "expo-router";
import { useTheme } from "../../../../../theme/useTheme";
import {
  readRagSettings,
  saveRagSettings,
  RagSettings,
} from "../../../../store/memory";
import Toast from "../../../../component/base/Toast";
import WeChatSwitch from "../../../../component/base/WeChatSwitch";
import {
  openAutostartSettings,
  requestBatteryExempt,
} from "../../../../utils/keepAlive";
import {
  fetchWeather,
  formatWeatherText,
  locateCurrentCity,
} from "../../../../store/weather";

const WorldlineSettings = () => {
  const navigate = useNavigation();
  const { themeColor } = useTheme();
  const [s, setS] = useState<RagSettings | null>(null);

  useEffect(() => {
    readRagSettings().then(setS);
  }, []);

  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerTitle: "角色主动消息",
      headerTitleAlign: "center",
      headerTintColor: "#111",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: "#EDEDED" },
    });
  }, []);

  if (!s) return null;

  const save = async () => {
    await saveRagSettings(s);
    Toast.success("已保存");
    navigate.goBack();
  };

  const actionBtn = (label: string, onPress: () => void, key?: string) => (
    <TouchableOpacity
      key={key || label}
      onPress={onPress}
      style={{
        marginTop: 10,
        borderColor: themeColor.textBlue,
        borderWidth: 1,
        borderRadius: 6,
        paddingVertical: 9,
        alignItems: "center",
      }}
    >
      <Text style={{ color: themeColor.textBlue, fontSize: 14 }}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView
      style={{ backgroundColor: "#EDEDED", flex: 1 }}
      contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
    >
      <View style={{ backgroundColor: "#fff", borderRadius: 8, padding: 14 }}>
        <Text style={{ fontSize: 15, color: themeColor.text5, fontWeight: "600" }}>
          世界线 · 角色主动发消息
        </Text>
        <Text style={{ color: themeColor.text2, fontSize: 12, marginTop: 6 }}>
          角色活在自己的世界里：每天有作息、日常和心情。到合适的时机，TA
          会自然地主动找你聊天（分享趣事、关心你、延续话题等）。
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 14,
          }}
        >
          <Text style={{ fontSize: 15, color: themeColor.text5 }}>
            角色主动发消息
          </Text>
          <WeChatSwitch
            value={s.proactiveEnabled}
            onValueChange={(v) => setS({ ...s, proactiveEnabled: v })}
          />
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 10,
          }}
        >
          <Text style={{ fontSize: 15, color: themeColor.text5 }}>
            夜间静默（23:00-08:00）
          </Text>
          <WeChatSwitch
            value={s.proactiveNightSilence}
            onValueChange={(v) => setS({ ...s, proactiveNightSilence: v })}
          />
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 12,
          }}
        >
          <Text style={{ fontSize: 15, color: themeColor.text5 }}>主动频率</Text>
          <View style={{ flexDirection: "row" }}>
            {(
              [
                ["low", "少"],
                ["normal", "标准"],
                ["high", "多"],
              ] as const
            ).map(([val, label], i) => {
              const active = s.proactiveFrequency === val;
              return (
                <TouchableOpacity
                  key={val}
                  onPress={() => setS({ ...s, proactiveFrequency: val })}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 5,
                    borderRadius: 4,
                    marginLeft: i ? 6 : 0,
                    borderWidth: 1,
                    borderColor: active ? themeColor.primary : "#D5D5D5",
                    backgroundColor: active ? themeColor.primary : "#fff",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      color: active ? "#fff" : themeColor.text5,
                    }}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        <Text style={{ color: themeColor.text2, fontSize: 12, marginTop: 8 }}>
          频率由角色性格和当天状态决定，这里只是控制整体活跃度
        </Text>
      </View>

      <View
        style={{
          backgroundColor: "#fff",
          borderRadius: 8,
          padding: 14,
          marginTop: 12,
        }}
      >
        <Text style={{ fontSize: 15, color: themeColor.text5, fontWeight: "600" }}>
          角色感知天气
        </Text>
        <Text style={{ color: themeColor.text2, fontSize: 12, marginTop: 6 }}>
          角色主动找你时能感知你所在城市的天气，自然地关心你（默认使用免费天气接口，无需注册）
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 12,
          }}
        >
          <Text style={{ fontSize: 15, color: themeColor.text5 }}>启用天气</Text>
          <WeChatSwitch
            value={s.weatherEnabled}
            onValueChange={(v) => setS({ ...s, weatherEnabled: v })}
          />
        </View>
        <Text
          style={{
            fontSize: 13,
            color: themeColor.text2,
            marginTop: 12,
            marginBottom: 4,
          }}
        >
          定位方式
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {(
            [
              ["auto", "自动（GPS 优先）"],
              ["gps", "GPS 精准定位"],
              ["manual", "手动指定城市"],
            ] as const
          ).map(([val, label], i) => {
            const active = s.weatherLocMode === val;
            return (
              <TouchableOpacity
                key={val}
                onPress={() => setS({ ...s, weatherLocMode: val })}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 6,
                  marginRight: 8,
                  marginBottom: 6,
                  borderWidth: 1,
                  borderColor: active ? themeColor.primary : "#D5D5D5",
                  backgroundColor: active ? themeColor.primary : "#fff",
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: active ? "#fff" : themeColor.text5,
                  }}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={{ color: themeColor.text2, fontSize: 12, marginTop: 4 }}>
          {s.weatherLocMode === "manual"
            ? "手动模式下需要填写下方城市"
            : s.weatherLocMode === "gps"
            ? "使用 GPS 定位你所在的城市（需授权位置权限）"
            : "自动：填写城市时优先用手动城市，否则用 GPS 定位，失败则按 IP 判断"}
        </Text>
        <Text
          style={{
            fontSize: 13,
            color: themeColor.text2,
            marginTop: 12,
            marginBottom: 4,
          }}
        >
          天气接口地址（自定义）
        </Text>
        <TextInput
          value={s.weatherBaseUrl}
          onChangeText={(v) => setS({ ...s, weatherBaseUrl: v })}
          placeholder="留空使用默认：https://uapis.cn/api/v1/misc/weather"
          placeholderTextColor="#B0B0B0"
          style={{
            backgroundColor: "#F5F5F5",
            borderRadius: 6,
            paddingHorizontal: 10,
            paddingVertical: 8,
            fontSize: 13,
            color: themeColor.text5,
          }}
        />
        <Text
          style={{
            fontSize: 13,
            color: themeColor.text2,
            marginTop: 10,
            marginBottom: 4,
          }}
        >
          城市（可选）
        </Text>
        <TextInput
          value={s.weatherCity}
          onChangeText={(v) => setS({ ...s, weatherCity: v })}
          placeholder={
            s.weatherLocMode === "manual"
              ? "输入城市名，例如：北京"
              : "留空自动定位（GPS / IP）"
          }
          placeholderTextColor="#B0B0B0"
          style={{
            backgroundColor: "#F5F5F5",
            borderRadius: 6,
            paddingHorizontal: 10,
            paddingVertical: 8,
            fontSize: 13,
            color: themeColor.text5,
          }}
        />
        <View style={{ flexDirection: "row", marginTop: 10 }}>
          <View style={{ flex: 1, marginRight: 6 }}>
            {actionBtn("用定位获取", async () => {
              Toast.info("正在定位…");
              const loc = await locateCurrentCity();
              if (loc) {
                setS({ ...s, weatherCity: loc.city, weatherLocMode: "manual" });
                Toast.success("定位到：" + loc.city);
              } else {
                Toast.fail("定位失败，请检查位置权限或网络");
              }
            })}
          </View>
          <View style={{ flex: 1, marginLeft: 6 }}>
            {actionBtn("测试天气", async () => {
              Toast.info("正在获取天气…");
              // 用当前表单输入测试（不必先保存）
              const w = await fetchWeather({
                city: s.weatherCity,
                baseUrl: s.weatherBaseUrl,
                locMode: s.weatherLocMode,
              });
              if (w) {
                Toast.success("天气获取成功：" + formatWeatherText(w));
              } else {
                Toast.fail("天气获取失败，请检查接口地址或城市名");
              }
            })}
          </View>
        </View>
      </View>

      <View
        style={{
          backgroundColor: "#fff",
          borderRadius: 8,
          padding: 14,
          marginTop: 12,
        }}
      >
        <Text style={{ fontSize: 15, color: themeColor.text5, fontWeight: "600" }}>
          后台保活
        </Text>
        <Text style={{ color: themeColor.text2, fontSize: 12, marginTop: 4 }}>
          小米手机需开启自启动和电池白名单，退后台后角色才能准时主动找你
        </Text>
        {actionBtn("打开小米自启动设置", () => openAutostartSettings())}
        {actionBtn("电池优化白名单（后台不被清理）", () => requestBatteryExempt())}
      </View>

      <TouchableOpacity
        onPress={save}
        style={{
          backgroundColor: themeColor.primary,
          paddingVertical: 12,
          borderRadius: 6,
          alignItems: "center",
          marginTop: 24,
        }}
      >
        <Text style={{ color: "#fff", fontSize: 16 }}>保存</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

export default WorldlineSettings;
