import { useLayoutEffect } from "react";
import { ScrollView, Text, View } from "react-native";
import { useNavigation } from "expo-router";
import { useTheme } from "../../../../../theme/useTheme";
import { CHANGELOG } from "../../../../store/changelog";

const Changelog = () => {
  const navigator = useNavigation();
  const { themeColor } = useTheme();

  useLayoutEffect(() => {
    navigator.setOptions({
      headerShown: true,
      headerTitle: "更新日志",
      headerTitleAlign: "center",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: themeColor.surfaceContainerLow },
      headerTintColor: themeColor.onSurface,
    });
  }, []);

  return (
    <ScrollView
      style={{ backgroundColor: themeColor.surfaceContainerLow, flex: 1 }}
      contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
    >
      {CHANGELOG.length === 0 ? (
        <Text
          style={{
            fontSize: 14,
            color: themeColor.onSurfaceVariant,
            textAlign: "center",
            marginTop: 40,
          }}
        >
          暂无更新记录
        </Text>
      ) : (
        CHANGELOG.map((e) => (
          <View
            key={e.version}
            style={{
              backgroundColor: themeColor.surfaceContainerLowest,
              borderRadius: 12,
              padding: 16,
              marginBottom: 12,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "baseline",
                justifyContent: "space-between",
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "700",
                  color: themeColor.onSurface,
                }}
              >
                {e.version}
              </Text>
              <Text
                style={{ fontSize: 12, color: themeColor.onSurfaceVariant }}
              >
                {e.date}
              </Text>
            </View>
            {e.items.map((it, i) => (
              <Text
                key={i}
                style={{
                  fontSize: 14,
                  lineHeight: 22,
                  color: themeColor.onSurfaceVariant,
                  marginTop: 8,
                }}
              >
                · {it}
              </Text>
            ))}
          </View>
        ))
      )}
    </ScrollView>
  );
};

export default Changelog;
