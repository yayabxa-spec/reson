import { useLayoutEffect } from "react";
import { Image, ScrollView, Text, View } from "react-native";
import { useNavigation } from "expo-router";
import { useTheme } from "../../../../../theme/useTheme";

const Donate = () => {
  const navigator = useNavigation();
  const { themeColor } = useTheme();

  useLayoutEffect(() => {
    navigator.setOptions({
      headerShown: true,
      headerTitle: "支持 RE:SON",
      headerTitleAlign: "center",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: themeColor.surfaceContainerLow },
      headerTintColor: themeColor.onSurface,
    });
  }, []);

  return (
    <ScrollView
      style={{ backgroundColor: themeColor.surfaceContainerLow, flex: 1 }}
      contentContainerStyle={{ padding: 24, paddingBottom: 48 }}
    >
      <View style={{ alignItems: "center", marginTop: 12 }}>
        <Text
          style={{
            fontSize: 20,
            fontWeight: "700",
            color: themeColor.onSurface,
          }}
        >
          支持 RE:SON
        </Text>
        <Text
          style={{
            fontSize: 13,
            color: themeColor.onSurfaceVariant,
            marginTop: 8,
            lineHeight: 21,
            textAlign: "center",
          }}
        >
          RE:SON 是个人利用业余时间开发的项目。如果你喜欢它，欢迎请开发者喝杯咖啡
          ——每一份支持都是对这份心意的认可和鼓励。
        </Text>
      </View>

      <View
        style={{
          marginTop: 28,
          alignItems: "center",
        }}
      >
        <View
          style={{
            backgroundColor: themeColor.surfaceContainerLowest,
            borderRadius: 16,
            padding: 12,
            elevation: 3,
            shadowColor: "#000",
            shadowOpacity: 0.12,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
          }}
        >
          <Image
            source={require("../../../../../assets/donate-qr.png")}
            style={{ width: 260, height: 260, borderRadius: 8 }}
          />
        </View>
        <Text
          style={{
            color: themeColor.onSurfaceVariant,
            fontSize: 12,
            marginTop: 12,
          }}
        >
          微信扫码 · 谢谢你让角色继续活着
        </Text>
      </View>

      <Text
        style={{
          textAlign: "center",
          color: themeColor.onSurface,
          fontSize: 14,
          fontWeight: "600",
          marginTop: 36,
        }}
      >
        谢谢支持 ❤
      </Text>

      <Text
        style={{
          textAlign: "center",
          color: themeColor.onSurfaceVariant,
          fontSize: 12,
          lineHeight: 20,
          marginTop: 18,
        }}
      >
        捐赠全凭自愿，不影响任何功能 · 未满 18 岁请勿捐赠
      </Text>
    </ScrollView>
  );
};

export default Donate;
