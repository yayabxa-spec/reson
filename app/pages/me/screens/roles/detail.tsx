import { useEffect, useLayoutEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useTheme } from "../../../../../theme/useTheme";
import { Role } from "../../../../store/roles";
import { sqlReadRole } from "../../../../store/appDb";

const RoleDetail = () => {
  const navigate = useNavigation();
  const { themeColor } = useTheme();
  const params = useLocalSearchParams<{ roleId?: string }>();
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    if (params.roleId) {
      sqlReadRole(params.roleId).then((r) => setRole((r as Role) || null));
    }
  }, [params.roleId]);

  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerTitle: "详细资料",
      headerTitleAlign: "center",
      headerTintColor: "#111",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: themeColor.surfaceContainerLow },
    });
  }, []);

  const bg = role?.background || [];
  const state = role?.storyState || "";

  return (
    <ScrollView
      style={{
        backgroundColor: themeColor.surfaceContainerLow,
        flex: 1,
        padding: 16,
      }}
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      {!role && (
        <Text style={{ color: themeColor.text3, marginTop: 20 }}>加载中…</Text>
      )}
      {role && (
        <>
          <Text
            style={{
              fontSize: 18,
              fontWeight: "600",
              color: themeColor.onSurface,
            }}
          >
            {role.name}
          </Text>
          <Text
            style={{
              color: themeColor.onSurfaceVariant,
              fontSize: 13,
              marginTop: 4,
            }}
          >
            {role.work} · {role.region || "地区未知"}
          </Text>

          {state ? (
            <View style={{ marginTop: 14 }}>
              <Text style={{ color: themeColor.onSurfaceVariant, fontSize: 13 }}>
                当前状态
              </Text>
              <Text
                style={{
                  color: themeColor.onSurface,
                  fontSize: 14,
                  marginTop: 6,
                  lineHeight: 21,
                  backgroundColor: themeColor.surfaceContainerHigh,
                  borderRadius: 6,
                  padding: 10,
                }}
              >
                {state}
              </Text>
            </View>
          ) : null}

          <Text
            style={{
              color: themeColor.onSurfaceVariant,
              fontSize: 13,
              marginTop: 18,
            }}
          >
            详细资料（共 {bg.length} 条）
          </Text>
          {bg.map((b, i) => (
            <View
              key={i}
              style={{
                marginTop: 12,
                backgroundColor: themeColor.surfaceContainerLowest,
                borderRadius: 12,
                padding: 12,
              }}
            >
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: "600",
                  color: themeColor.onSurface,
                }}
              >
                {b.title}
              </Text>
              {b.tags?.length ? (
                <Text
                  style={{
                    color: themeColor.onSurfaceVariant,
                    fontSize: 11,
                    marginTop: 4,
                  }}
                >
                  {b.tags.join(" · ")}
                </Text>
              ) : null}
              <Text
                style={{
                  color: themeColor.onSurface,
                  fontSize: 13,
                  marginTop: 6,
                  lineHeight: 20,
                }}
              >
                {b.content}
              </Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
};

export default RoleDetail;
