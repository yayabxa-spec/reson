import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Divider, List } from "react-native-paper";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useTheme } from "../../../../../theme/useTheme";
import {
  Role,
  removeFriend,
  updateRole,
} from "../../../../store/roles";
import { sqlReadRole } from "../../../../store/appDb";
import Toast from "../../../../component/base/Toast";
import WeChatSwitch from "../../../../component/base/WeChatSwitch";
import ConfirmDialog from "../../../../component/complex/ConfirmDialog";
import { createChatShortcut } from "../../../../utils/shortcut";

const FriendSettings = () => {
  const navigate = useNavigation();
  const { themeColor } = useTheme();
  const params = useLocalSearchParams<{ friendId?: string }>();
  const [role, setRole] = useState<Role | null>(null);
  const [starred, setStarred] = useState(false);
  const [delOpen, setDelOpen] = useState(false);

  const load = useCallback(async () => {
    if (!params.friendId) return;
    const r = await sqlReadRole(params.friendId);
    setRole(r);
    setStarred(!!r?.starred);
  }, [params.friendId]);

  useEffect(() => {
    load();
  }, [load]);

  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerTitle: "朋友设置",
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

  const Row = ({
    label,
    onPress,
    last,
  }: {
    label: string;
    onPress?: () => void;
    last?: boolean;
  }) => (
    <>
      <List.Item
        title={label}
        titleStyle={{ fontSize: 16, color: themeColor.onSurface }}
        style={{
          minHeight: 52,
          paddingRight: 8,
          backgroundColor: themeColor.surfaceContainerLowest,
        }}
        onPress={onPress}
        right={
          onPress
            ? () => (
                <List.Icon
                  icon="chevron-right"
                  color={themeColor.onSurfaceVariant}
                />
              )
            : undefined
        }
      />
      {!last && <Divider style={{ marginLeft: 16 }} />}
    </>
  );

  const doDelete = async () => {
    await removeFriend(role.id);
    Toast.success("已删除");
    (navigate as any).popToTop?.();
  };

  return (
    <ScrollView
      style={{ backgroundColor: themeColor.surfaceContainerLow, flex: 1 }}
      contentContainerStyle={{ paddingBottom: 30 }}
    >
      <View
        style={{
          backgroundColor: themeColor.surfaceContainerLowest,
          marginTop: 12,
        }}
      >
        <Row label="把她推荐给朋友" onPress={() => Toast.info("开发中")} />
        <Row
          label="添加到桌面"
          last
          onPress={() => {
            createChatShortcut(role.id, role.name);
            Toast.info("已创建桌面快捷方式");
          }}
        />
      </View>

      <View
        style={{
          backgroundColor: themeColor.surfaceContainerLowest,
          marginTop: 10,
        }}
      >
        <List.Item
          title="设为星标朋友"
          titleStyle={{ fontSize: 16, color: themeColor.onSurface }}
          style={{
            minHeight: 52,
            paddingRight: 8,
            backgroundColor: themeColor.surfaceContainerLowest,
          }}
          right={() => (
            <WeChatSwitch
              value={starred}
              onValueChange={(v) => {
                setStarred(v);
                updateRole(role.id, { starred: v }).catch(() => {});
              }}
            />
          )}
        />
      </View>

      <TouchableOpacity
        onPress={() => setDelOpen(true)}
        style={{
          backgroundColor: themeColor.surfaceContainerLowest,
          height: 52,
          alignItems: "center",
          justifyContent: "center",
          marginTop: 10,
        }}
      >
        <Text style={{ fontSize: 16, color: themeColor.error }}>删除</Text>
      </TouchableOpacity>

      <ConfirmDialog
        visible={delOpen}
        title="删除好友"
        message={`删除好友将从通讯录移除并清除聊天记录与记忆，角色资料卡会保留，可重新添加。确定删除「${role.name}」吗？`}
        onCancel={() => setDelOpen(false)}
        onConfirm={doDelete}
      />
    </ScrollView>
  );
};

export default FriendSettings;
