import { useEffect, useLayoutEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useTheme } from "../../../../../../theme/useTheme";
import { Role } from "../../../../../store/roles";
import { sqlReadRole } from "../../../../../store/appDb";
import { runRoleCheck } from "../../../../../store/roleCheck";
import Toast from "../../../../../component/base/Toast";
import * as Clipboard from "expo-clipboard";

const RoleCheck = () => {
  const navigate = useNavigation();
  const { themeColor } = useTheme();
  const params = useLocalSearchParams<{ roleId?: string }>();
  const [role, setRole] = useState<Role | null>(null);
  const [report, setReport] = useState("");
  const [state, setState] = useState<"loading" | "running" | "done" | "error">(
    "loading"
  );
  const [error, setError] = useState("");

  useEffect(() => {
    if (!params.roleId) return;
    sqlReadRole(params.roleId)
      .then((r) => {
        setRole((r as Role) || null);
        setState("running");
        return runRoleCheck((r as Role) || { name: "?" });
      })
      .then((text) => {
        setReport(text);
        setState("done");
      })
      .catch((e: any) => {
        setError(e?.message || String(e));
        setState("error");
      });
  }, [params.roleId]);

  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerTitle: "人设体检",
      headerTitleAlign: "center",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: themeColor.surfaceContainerLow },
      headerTintColor: themeColor.onSurface,
    });
  }, []);

  const copyReport = async () => {
    await Clipboard.setStringAsync(report);
    Toast.success("体检报告已复制");
  };

  const retry = () => {
    if (!role) return;
    setState("running");
    setError("");
    runRoleCheck(role)
      .then((text) => {
        setReport(text);
        setState("done");
      })
      .catch((e: any) => {
        setError(e?.message || String(e));
        setState("error");
      });
  };

  return (
    <ScrollView
      style={{ backgroundColor: themeColor.surfaceContainerLow, flex: 1 }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
    >
      <Text
        style={{
          fontSize: 16,
          fontWeight: "600",
          color: themeColor.onSurface,
          marginBottom: 6,
        }}
      >
        {role ? role.name : "…"} 的人设体检
      </Text>
      <Text
        style={{
          color: themeColor.onSurfaceVariant,
          fontSize: 12,
          marginBottom: 14,
          lineHeight: 18,
        }}
      >
        让角色对 5 个日常场景各回一条短消息，再由评审模型检查口癖是否保留、
        性格是否一致、有无 OOC、说话风格是否自然，并给出优化建议。
      </Text>

      {state === "running" && (
        <View style={{ alignItems: "center", paddingVertical: 40 }}>
          <ActivityIndicator color={themeColor.primary} />
          <Text
            style={{ color: themeColor.onSurfaceVariant, marginTop: 12 }}
          >
            正在体检（测试扮演 → 质量评审）…
          </Text>
        </View>
      )}

      {state === "error" && (
        <View style={{ alignItems: "center", paddingVertical: 30 }}>
          <Text style={{ color: themeColor.error, textAlign: "center" }}>
            体检失败：{error}
          </Text>
          <TouchableOpacity onPress={retry} style={{ marginTop: 16 }}>
            <Text style={{ color: themeColor.primary, fontSize: 15 }}>
              重试
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {state === "done" && (
        <>
          <View
            style={{
              backgroundColor: themeColor.surfaceContainerLowest,
              borderRadius: 14,
              padding: 14,
            }}
          >
            <Text
              style={{
                color: themeColor.onSurface,
                fontSize: 14,
                lineHeight: 22,
              }}
            >
              {report}
            </Text>
          </View>
          <TouchableOpacity
            onPress={copyReport}
            style={{
              marginTop: 16,
              backgroundColor: themeColor.primary,
              borderRadius: 24,
              height: 44,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: themeColor.onPrimary, fontSize: 15 }}>
              复制体检报告
            </Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
};

export default RoleCheck;
