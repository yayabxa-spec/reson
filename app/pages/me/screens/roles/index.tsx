import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import {
  FlatList,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "expo-router";
import { useTheme } from "../../../../../theme/useTheme";
import { getActiveSkinId } from "../../../../../theme/skinState";
import {
  ensureRolesSeeded,
  readRolesRaw,
  Role,
  deleteRole,
  sendFriendRequest,
  refreshBuiltinRolesFromPack,
} from "../../../../store/roles";
import RoleAvatar from "../../../../component/complex/RoleAvatar";
import eventBus from "../../../../utils/eventBus";
import Toast from "../../../../component/base/Toast";
import ConfirmDialog from "../../../../component/complex/ConfirmDialog";
import SearchIcon from "../../../../../assets/icon/common/search.svg";
import { buildRoleSearchKey } from "../../../../utils/pinyinSearch";

const STATUS_LABEL: Record<string, string> = {
  none: "未添加",
  requesting: "等待验证",
  done: "已添加",
};

const RoleRow = memo(
  ({
    role,
    themeColor,
    onEdit,
    onDelete,
    onAdd,
    onCheck,
    statusColor,
  }: {
    role: Role;
    themeColor: any;
    onEdit: (id: string) => void;
    onDelete: (id: string) => void;
    onAdd: (id: string) => void;
    onCheck: (id: string) => void;
    statusColor: (s: string) => string;
  }) => (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: 0.5,
        borderBottomColor: themeColor.line2,
      }}
    >
      <TouchableOpacity
        style={{ flex: 1, flexDirection: "row", alignItems: "center" }}
        onPress={() => onEdit(role.id)}
      >
        <RoleAvatar
          avatar={role.avatar}
          name={role.name}
          size={44}
          style={{ marginRight: 12 }}
        />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, color: themeColor.text5 }}>
            {role.name}
            {role.isSystem ? "" : "（自定义）"}
          </Text>
          <Text
            numberOfLines={1}
            style={{ color: themeColor.text3, fontSize: 13, marginTop: 2 }}
          >
            {(role.bio || role.persona).slice(0, 60)}
          </Text>
        </View>
      </TouchableOpacity>

      <View style={{ alignItems: "flex-end", marginLeft: 8 }}>
        <TouchableOpacity
          onPress={() => onEdit(role.id)}
          style={{ marginBottom: 4 }}
        >
          <Text style={{ color: themeColor.textBlue, fontSize: 13 }}>编辑</Text>
        </TouchableOpacity>
        <Text style={{ color: statusColor(role.status), fontSize: 13 }}>
          {STATUS_LABEL[role.status] || "未添加"}
        </Text>
        {role.status === "none" && (
          <TouchableOpacity
            onPress={() => onAdd(role.id)}
            style={{ marginTop: 4 }}
          >
            <Text style={{ color: themeColor.textBlue, fontSize: 13 }}>
              {getActiveSkinId() === "clean" ? "添加到联系人" : "添加到通讯录"}
            </Text>
          </TouchableOpacity>
        )}
        {!role.isSystem && (
          <TouchableOpacity
            onPress={() => onDelete(role.id)}
            style={{ marginTop: 4 }}
          >
            <Text style={{ color: themeColor.danger6, fontSize: 13 }}>删除</Text>
          </TouchableOpacity>
        )}
        {!role.isSystem && (
          <TouchableOpacity
            onPress={() => onCheck(role.id)}
            style={{ marginTop: 4 }}
          >
            <Text style={{ color: themeColor.textBlue, fontSize: 13 }}>体检</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
);

const Roles = () => {
const { themeColor } = useTheme();
  const navigate = useNavigation();
  const [roles, setRoles] = useState<Role[]>([]);
  const [delRoleId, setDelRoleId] = useState<string | null>(null);
  const [kw, setKw] = useState("");

  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerTitle: "角色管理",
      headerTitleAlign: "center",
      headerTintColor: "#111",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: "#fff" },
    });
  }, []);

  const refresh = useCallback(async () => {
    await ensureRolesSeeded();
    setRoles(await readRolesRaw());
  }, []);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    eventBus.on("roles-updated", handler);
    return () => {
      eventBus.off("roles-updated", handler);
    };
  }, [refresh]);

  const statusColor = useCallback(
    (s: string) =>
      s === "done"
        ? themeColor.primary
        : s === "requesting"
        ? themeColor.text2
        : themeColor.text3,
    [themeColor]
  );

  const onEdit = useCallback(
    (id: string) =>
      navigate.navigate("pages/me/screens/roles/edit", { roleId: id }),
    [navigate]
  );
  const onDelete = useCallback((id: string) => setDelRoleId(id), []);
  const onAdd = useCallback(
    async (id: string) => {
      await sendFriendRequest(id);
      refresh();
      Toast.info("申请已发送");
    },
    [refresh]
  );
  const onCheck = useCallback((id: string) => {
    navigate.navigate("pages/me/screens/roles/check", { roleId: id });
  }, [navigate]);
  const onRefreshBuiltin = useCallback(async () => {
    try {
      const n = await refreshBuiltinRolesFromPack();
      Toast.success(n ? `已刷新 ${n} 个内置角色` : "没有需要更新的角色");
    } catch (e: any) {
      Toast.fail(e?.message || "刷新失败");
    }
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Role }) => (
      <RoleRow
        role={item}
        themeColor={themeColor}
        statusColor={statusColor}
        onEdit={onEdit}
        onDelete={onDelete}
        onAdd={onAdd}
        onCheck={onCheck}
      />
    ),
    [themeColor, statusColor, onEdit, onDelete, onAdd]
  );

  const filteredRoles = useMemo(() => {
    const q = kw.trim().toLocaleLowerCase();
    if (!q) return roles;
    return roles.filter((r) => {
      const key = buildRoleSearchKey(r.name).toLocaleLowerCase();
      return (
        key.includes(q) ||
        r.name.toLocaleLowerCase().includes(q) ||
        (r.bio || r.persona || "").toLocaleLowerCase().includes(q)
      );
    });
  }, [roles, kw]);

  return (
    <>
      <FlatList
        style={{ backgroundColor: "#fff", flex: 1 }}
        data={filteredRoles}
        keyExtractor={(r) => r.id}
        renderItem={renderItem}
        initialNumToRender={15}
        maxToRenderPerBatch={15}
        windowSize={7}
        removeClippedSubviews
        ListHeaderComponent={
          <View>
            <View
              style={{
                backgroundColor: "#F5F5F5",
                borderRadius: 6,
                marginHorizontal: 16,
                marginTop: 12,
                paddingHorizontal: 10,
                height: 36,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <SearchIcon fill={themeColor.text3} width={15} height={15} />
              <TextInput
                value={kw}
                onChangeText={setKw}
                placeholder="搜索角色"
                placeholderTextColor={themeColor.text2}
                style={{
                  flex: 1,
                  marginLeft: 8,
                  fontSize: 14,
                  color: themeColor.text5,
                  paddingVertical: 0,
                }}
              />
            </View>
            <TouchableOpacity
              onPress={() => navigate.navigate("pages/me/screens/roles/edit")}
              style={{
                backgroundColor: themeColor.primary,
                margin: 16,
                paddingVertical: 12,
                borderRadius: 6,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#fff", fontSize: 16 }}>
                ＋ 创建自定义角色
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onRefreshBuiltin}
              style={{ alignItems: "center", paddingBottom: 8 }}
            >
              <Text style={{ color: themeColor.text3, fontSize: 12 }}>
                刷新内置角色卡（内容包更新后同步人设/背景）
              </Text>
            </TouchableOpacity>
            <Text
              style={{
                color: themeColor.text3,
                fontSize: 13,
                paddingHorizontal: 16,
                marginBottom: 4,
              }}
            >
              角色库（{roles.length} 个，点击可查看资料）
            </Text>
            {kw.trim() && filteredRoles.length === 0 ? (
              <Text
                style={{
                  color: themeColor.text3,
                  fontSize: 13,
                  textAlign: "center",
                  paddingVertical: 20,
                }}
              >
                未找到相关角色
              </Text>
            ) : null}
          </View>
        }
      />

      <ConfirmDialog
        visible={!!delRoleId}
        title="删除角色"
        message={
          "确定删除角色「" + (delRoleId || "") + "」及其会话与记忆吗？此操作不可恢复。"
        }
        onCancel={() => setDelRoleId(null)}
        onConfirm={async () => {
          if (delRoleId) {
            await deleteRole(delRoleId);
          }
          setDelRoleId(null);
          refresh();
          Toast.info("已删除");
        }}
      />
    </>
  );
};

export default Roles;
