import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Divider, List } from "react-native-paper";
import { getSize } from "../../../../../utils.ts";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useTheme } from "../../../../../theme/useTheme";
import { Role, updateRole } from "../../../../store/roles";
import { sqlReadRole } from "../../../../store/appDb";
import Toast from "../../../../component/base/Toast";
import WeChatDialog from "../../../../component/base/WeChatDialog";

const FriendDetails = () => {
  const navigate = useNavigation();
  const { themeColor } = useTheme();
  const params = useLocalSearchParams<{ friendId?: string }>();
  const [role, setRole] = useState<Role | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editVal, setEditVal] = useState("");

  const load = useCallback(async () => {
    if (!params.friendId) return;
    const r = await sqlReadRole(params.friendId);
    setRole((r as Role) || null);
  }, [params.friendId]);

  useEffect(() => {
    load();
  }, [load]);

  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerTitle: "朋友资料",
      headerTitleAlign: "center",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: themeColor.surfaceContainerLow },
      headerTintColor: "#111",
    });
  }, []);

  if (!role) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: themeColor.surfaceContainerLow,
          alignItems: "center",
          paddingTop: 80,
        }}
      >
        <Text style={{ color: themeColor.onSurfaceVariant }}>
          角色不存在或已被删除
        </Text>
      </View>
    );
  }

  const saveRemark = async () => {
    await updateRole(role.id, { remark: editVal.trim() });
    setRole({ ...role, remark: editVal.trim() });
    setEditOpen(false);
    Toast.success("已保存");
  };

  const Row = ({
    label,
    value,
    onPress,
    last,
  }: {
    label: string;
    value?: string;
    onPress?: () => void;
    last?: boolean;
  }) => (
    <>
      <List.Item
        title={label}
        titleStyle={{ fontSize: 15, color: themeColor.onSurfaceVariant }}
        style={{
          minHeight: 52,
          paddingRight: 8,
          backgroundColor: themeColor.surfaceContainerLowest,
        }}
        onPress={onPress}
        right={() => (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              flexShrink: 1,
              marginLeft: 12,
            }}
          >
            {!!value && (
              <Text
                numberOfLines={1}
                style={{
                  maxWidth: getSize(210),
                  fontSize: 15,
                  color: themeColor.onSurface,
                  textAlign: "right",
                  marginRight: 6,
                }}
              >
                {value}
              </Text>
            )}
            {onPress && (
              <List.Icon
                icon="chevron-right"
                color={themeColor.onSurfaceVariant}
              />
            )}
          </View>
        )}
      />
      {!last && <Divider style={{ marginLeft: 16 }} />}
    </>
  );

  const addedAt = role.addedAt
    ? (() => {
        const d = new Date(role.addedAt);
        const p = (n: number) => String(n).padStart(2, "0");
        return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${p(
          d.getHours()
        )}:${p(d.getMinutes())}`;
      })()
    : "";

  return (
    <ScrollView
      style={{ backgroundColor: themeColor.surfaceContainerLow, flex: 1 }}
      contentContainerStyle={{ paddingBottom: 30 }}
    >
      <Text
        style={{
          color: themeColor.onSurfaceVariant,
          fontSize: 13,
          marginLeft: 16,
          marginTop: 18,
          marginBottom: 4,
        }}
      >
        备注
      </Text>
      <View style={{ backgroundColor: themeColor.surfaceContainerLowest }}>
        <Row
          label="备注名"
          value={role.remark || role.name}
          onPress={() => {
            setEditVal(role.remark || role.name);
            setEditOpen(true);
          }}
          last
        />
      </View>

      <Text
        style={{
          color: themeColor.onSurfaceVariant,
          fontSize: 13,
          marginLeft: 16,
          marginTop: 18,
          marginBottom: 4,
        }}
      >
        更多信息
      </Text>
      <View style={{ backgroundColor: themeColor.surfaceContainerLowest }}>
        <Row
          label="我和他共同群聊"
          value="0个"
          onPress={() => Toast.info("共同群聊功能开发中")}
        />
        <Row
          label="签名"
          value={role.bio || role.persona.split("\n")[0].slice(0, 30)}
        />
        <Row label="添加时间" value={addedAt || "未知"} last />
      </View>

      <WeChatDialog
        visible={editOpen}
        title="设置备注名"
        input={{
          value: editVal,
          onChange: setEditVal,
          placeholder: "输入备注名",
        }}
        confirmText="保存"
        onCancel={() => setEditOpen(false)}
        onConfirm={saveRemark}
      />
    </ScrollView>
  );
};

export default FriendDetails;
