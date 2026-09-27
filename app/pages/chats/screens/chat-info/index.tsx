import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import {
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "expo-router";
import { useTheme } from "../../../../../theme/useTheme";
import { Divider, List } from "react-native-paper";
import { useChatList } from "../../../../store/chatList";
import {
  ensureRolesSeeded,
  readRolesRaw,
  Role,
} from "../../../../store/roles";
import { sqlReadRole, sqlReadRoleState } from "../../../../store/appDb";
import { sqlReadMemories } from "../../../../store/memoryDb";
import {
  addGroupMembers,
  clearConversationMessages,
  dissolveGroup,
  readConversationsRaw,
  removeGroupMember,
  setConversationMuted,
  setConversationPinned,
  setGroupInterChatRounds,
  updateGroupInfo,
  type GroupMemberInfo,
  type LocalConvo,
} from "../../../../store/localChat";
import RoleAvatar from "../../../../component/complex/RoleAvatar";
import eventBus from "../../../../utils/eventBus";
import WeChatSwitch from "../../../../component/base/WeChatSwitch";
import WeChatDialog from "../../../../component/base/WeChatDialog";
import ConfirmDialog from "../../../../component/complex/ConfirmDialog";
import Toast from "../../../../component/base/Toast";
import { resolveCallName } from "../../../../store/profile";

const ChatInfo = () => {
  const navigate = useNavigation();
  const { themeColor } = useTheme();
  const { chatListStore } = useChatList();
  const convo = chatListStore.curConvo as any as LocalConvo | undefined;
  const convoId = (convo as any)?.convoId || convo?.id;
  const isGroup = !!convo?.isGroup;
  const [role, setRole] = useState<Role | null>(null);
  const [memCount, setMemCount] = useState(0);
  const [pinned, setPinned] = useState(!!convo?.pinned);
  const [muted, setMuted] = useState(!!convo?.muted);
  const [affection, setAffection] = useState<number | null>(null);
  const [mood, setMood] = useState("");
  const [clearVisible, setClearVisible] = useState(false);

  // 群聊：名称/互聊轮数/成员管理
  const [groupName, setGroupName] = useState(
    convo?.groupName || convo?.title || ""
  );
  const [renameVisible, setRenameVisible] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [interRounds, setInterRounds] = useState(
    convo?.maxInterChatRounds ?? 6
  );
  const [memberInfos, setMemberInfos] = useState<GroupMemberInfo[]>(
    convo?.memberInfos || []
  );
  const [pickerVisible, setPickerVisible] = useState(false);
  const [friendRoles, setFriendRoles] = useState<Role[]>([]);
  const [pickSel, setPickSel] = useState<Set<string>>(new Set());
  const [removeRole, setRemoveRole] = useState<Role | null>(null);
  const [dissolveVisible, setDissolveVisible] = useState(false);

  useEffect(() => {
    const roleId = convo?.roleId;
    if (!roleId) return;
    sqlReadRole(roleId).then((r) => setRole((r as Role) || null));
    sqlReadMemories(roleId).then((list) => setMemCount(list.length));
    // 好感度/情绪：读取 + 跟随聊天中的状态标签更新
    const loadState = () =>
      sqlReadRoleState(roleId)
        .then((st) => {
          setAffection(st.affection);
          setMood(st.mood);
        })
        .catch(() => {});
    loadState();
    eventBus.on("role-state-updated", loadState);
    return () => {
      eventBus.off("role-state-updated", loadState);
    };
  }, [convo?.roleId]);

  // 读取真实会话数据，同步置顶/群名/互聊轮数（通讯录入口的 curConvo 不带这些）
  useEffect(() => {
    if (!convoId) return;
    readConversationsRaw().then((list) => {
      const c = list.find((x) => x.id === convoId);
      if (!c) return;
      setPinned(!!c.pinned);
      setMuted(!!c.muted);
      if (c.isGroup) {
        setGroupName(c.groupName || c.title || "");
        if (c.maxInterChatRounds != null) setInterRounds(c.maxInterChatRounds);
        setMemberInfos(c.memberInfos || []);
      }
    });
  }, [convoId]);

  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerTitle: isGroup ? "群聊信息" : "聊天信息",
      headerTitleAlign: "center",
      headerTintColor: "#111",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: themeColor.surfaceContainerLow },
    });
  }, [isGroup]);

  const openRole = () => {
    if (convo?.roleId) {
      navigate.navigate("pages/contacts/screens/friend-info/index", {
        friendId: convo.roleId,
      });
    }
  };

  const openPicker = useCallback(async () => {
    await ensureRolesSeeded();
    const roles = await readRolesRaw();
    const inGroup = new Set(convo?.memberRoleIds || []);
    setFriendRoles(
      roles.filter((r) => r.status === "done" && !inGroup.has(r.id))
    );
    setPickSel(new Set());
    setPickerVisible(true);
  }, [convo?.memberRoleIds]);

  const confirmRename = async () => {
    const name = nameDraft.trim();
    if (!name) return;
    await updateGroupInfo(convoId, {
      title: name,
      groupName: name,
      autoTitle: false,
    });
    setGroupName(name);
    setRenameVisible(false);
    Toast.success("群聊名称已修改");
  };

  const confirmAdd = async () => {
    const add: GroupMemberInfo[] = await Promise.all(
      friendRoles
        .filter((r) => pickSel.has(r.id))
        .map(async (r) => ({
          roleId: r.id,
          name: r.name,
          avatar: r.avatar,
          persona: r.persona,
          callName: await resolveCallName(r.callName),
          modelIds: r.modelIds,
          temperature: r.temperature,
          examples: r.examples,
        }))
    );
    if (!add.length) return;
    await addGroupMembers(convoId, add);
    const list = await readConversationsRaw();
    const c = list.find((x) => x.id === convoId);
    if (c?.memberInfos) setMemberInfos(c.memberInfos);
    setPickerVisible(false);
    Toast.success(`已添加 ${add.length} 位成员`);
  };

  const confirmRemove = async () => {
    if (removeRole) {
      await removeGroupMember(convoId, removeRole.id);
      const list = await readConversationsRaw();
      const c = list.find((x) => x.id === convoId);
      if (c?.memberInfos) setMemberInfos(c.memberInfos);
      Toast.success(`已移除 ${removeRole.name}`);
    }
    setRemoveRole(null);
  };

  const confirmDissolve = async () => {
    setDissolveVisible(false);
    await dissolveGroup(convoId);
    Toast.success("群聊已解散");
    navigate.goBack();
  };

  const clearChat = async () => {
    setClearVisible(false);
    if (convo) {
      await clearConversationMessages(convoId);
      Toast.success("聊天记录已清空");
      navigate.goBack();
    }
  };

  const Row = ({
    label,
    value,
    onPress,
    last,
    danger = false,
  }: {
    label: string;
    value?: string | React.ReactNode;
    onPress?: () => void;
    last?: boolean;
    danger?: boolean;
  }) => (
    <>
      <List.Item
        title={label}
        titleStyle={{
          fontSize: 16,
          color: danger ? themeColor.error : themeColor.onSurface,
        }}
        style={{
          minHeight: 56,
          paddingRight: 8,
          backgroundColor: themeColor.surfaceContainerLowest,
        }}
        onPress={onPress}
        right={() => (
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {!!value &&
              (typeof value === "string" ? (
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 14,
                    color: themeColor.onSurfaceVariant,
                    marginRight: 6,
                  }}
                >
                  {value}
                </Text>
              ) : (
                value
              ))}
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

  return (
    <ScrollView
      style={{ backgroundColor: themeColor.surfaceContainerLow, flex: 1 }}
      contentContainerStyle={{ paddingBottom: 30 }}
    >
      {/* 成员区 */}
      <View
        style={{
          backgroundColor: themeColor.surfaceContainerLowest,
          paddingVertical: 20,
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        {isGroup && memberInfos.length ? (
          memberInfos.map((m) => (
            <TouchableOpacity
              key={m.roleId}
              onLongPress={() => {
                readRolesRaw().then((roles) => {
                  const r = roles.find((x) => x.id === m.roleId);
                  if (r) setRemoveRole(r);
                });
              }}
              onPress={() =>
                navigate.navigate(
                  "pages/contacts/screens/friend-info/index",
                  { friendId: m.roleId }
                )
              }
              style={{ alignItems: "center", marginRight: 14, width: 64 }}
            >
              <RoleAvatar avatar={m.avatar} name={m.name} size={48} />
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 12,
                  color: themeColor.onSurfaceVariant,
                  marginTop: 6,
                }}
              >
                {m.name}
              </Text>
            </TouchableOpacity>
          ))
        ) : (
          <TouchableOpacity
            onPress={openRole}
            style={{ alignItems: "center", marginRight: 14, width: 64 }}
          >
            <RoleAvatar
              avatar={role?.avatar}
              name={role?.name || convo?.title || "角色"}
              size={48}
            />
            <Text
              numberOfLines={1}
              style={{
                fontSize: 12,
                color: themeColor.onSurfaceVariant,
                marginTop: 6,
              }}
            >
              {role?.name || convo?.title || "角色"}
            </Text>
          </TouchableOpacity>
        )}
        {isGroup && (
          <TouchableOpacity
            onPress={openPicker}
            style={{ alignItems: "center", width: 64 }}
          >
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: themeColor.line2,
                borderStyle: "dashed",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 26, color: themeColor.text3 }}>+</Text>
            </View>
            <Text
              numberOfLines={1}
              style={{
                fontSize: 12,
                color: themeColor.onSurfaceVariant,
                marginTop: 6,
              }}
            >
              添加成员
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {isGroup ? (
        <>
          {/* 群聊设置 */}
          <View
            style={{
              backgroundColor: themeColor.surfaceContainerLowest,
              marginTop: 10,
            }}
          >
            <Row
              label="群聊名称"
              value={groupName}
              onPress={() => {
                setNameDraft(groupName);
                setRenameVisible(true);
              }}
            />
            <Row
              label="角色互聊"
              value={
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginRight: 2,
                  }}
                >
                  <TouchableOpacity
                    onPress={() => {
                      const n = Math.max(0, interRounds - 1);
                      setInterRounds(n);
                      setGroupInterChatRounds(convoId, n);
                    }}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: themeColor.line3,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontSize: 18, color: themeColor.text5 }}>
                      −
                    </Text>
                  </TouchableOpacity>
                  <Text
                    style={{
                      fontSize: 15,
                      color: themeColor.text5,
                      marginHorizontal: 10,
                      minWidth: 30,
                      textAlign: "center",
                    }}
                  >
                    {interRounds}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      const n = Math.min(12, interRounds + 1);
                      setInterRounds(n);
                      setGroupInterChatRounds(convoId, n);
                    }}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: themeColor.line3,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontSize: 18, color: themeColor.text5 }}>
                      +
                    </Text>
                  </TouchableOpacity>
                </View>
              }
            />
            <Row
              label="置顶聊天"
              last
              value={
                <WeChatSwitch
                  value={pinned}
                  onValueChange={async (v) => {
                    setPinned(v);
                    if (convoId) await setConversationPinned(convoId, v);
                  }}
                />
              }
            />
          </View>

          <View
            style={{
              backgroundColor: themeColor.surfaceContainerLowest,
              marginTop: 10,
            }}
          >
            <Row
              label="清空聊天记录"
              onPress={() => setClearVisible(true)}
            />
            <Row
              label="解散群聊"
              danger
              last
              onPress={() => setDissolveVisible(true)}
            />
          </View>
        </>
      ) : (
        <>
          {/* 私聊设置 */}
          <View
            style={{
              backgroundColor: themeColor.surfaceContainerLowest,
              marginTop: 10,
            }}
          >
            <Row
              label="角色记忆"
              value={memCount ? `${memCount} 条` : undefined}
              onPress={() =>
                navigate.navigate("pages/chats/screens/chat-info/memory")
              }
            />
            <Row
              label="朋友资料"
              onPress={() => {
                if (convo?.roleId) {
                  navigate.navigate(
                    "pages/contacts/screens/friend-info/details",
                    { friendId: convo.roleId }
                  );
                }
              }}
            />
            <Row
              label="模型设置"
              onPress={() => {
                if (convo?.roleId) {
                  navigate.navigate("pages/me/screens/roles/models", {
                    roleId: convo.roleId,
                  });
                }
              }}
            />
            <Row
              label="好感度"
              value={
                affection != null
                  ? `${affection}/100${mood ? " · " + mood : ""}`
                  : undefined
              }
            />
            <Row
              label="聊天背景"
              onPress={() =>
                navigate.navigate("pages/chats/screens/chat-bg/index", {
                  convoId,
                })
              }
            />
            <Row
              label="消息免打扰"
              value={
                <WeChatSwitch
                  value={muted}
                  onValueChange={async (v) => {
                    setMuted(v);
                    if (convoId) await setConversationMuted(convoId, v);
                  }}
                />
              }
            />
            <Row
              label="置顶聊天"
              last
              value={
                <WeChatSwitch
                  value={pinned}
                  onValueChange={async (v) => {
                    setPinned(v);
                    if (convoId) await setConversationPinned(convoId, v);
                  }}
                />
              }
            />
          </View>

          <View
            style={{
              backgroundColor: themeColor.surfaceContainerLowest,
              marginTop: 10,
            }}
          >
            <Row
              label="清空聊天记录"
              last
              onPress={() => setClearVisible(true)}
            />
          </View>
        </>
      )}

      {/* 群聊改名 */}
      <WeChatDialog
        visible={renameVisible}
        title="修改群聊名称"
        input={{
          value: nameDraft,
          onChange: setNameDraft,
          placeholder: "输入群聊名称",
        }}
        confirmText="保存"
        cancelText="取消"
        onCancel={() => setRenameVisible(false)}
        onConfirm={confirmRename}
      />

      {/* 添加成员选择器 */}
      <Modal
        transparent
        visible={pickerVisible}
        animationType="fade"
        onRequestClose={() => setPickerVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.4)",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <View
            style={{
            backgroundColor: themeColor.surfaceContainerLowest,
              borderRadius: 16,
              maxHeight: "70%",
              overflow: "hidden",
            }}
          >
            <Text
              style={{
                fontSize: 17,
                fontWeight: "600",
                color: themeColor.onSurface,
                textAlign: "center",
                paddingVertical: 14,
              }}
            >
              选择要添加的角色
            </Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {friendRoles.length === 0 ? (
                <Text
                  style={{
                    textAlign: "center",
                    color: themeColor.text3,
                    paddingVertical: 30,
                  }}
                >
                  没有可添加的角色好友
                </Text>
              ) : (
                friendRoles.map((r) => {
                  const on = pickSel.has(r.id);
                  return (
                    <TouchableOpacity
                      key={r.id}
                      onPress={() =>
                        setPickSel((pre) => {
                          const next = new Set(pre);
                          if (next.has(r.id)) next.delete(r.id);
                          else next.add(r.id);
                          return next;
                        })
                      }
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingHorizontal: 18,
                        paddingVertical: 10,
                      }}
                    >
                      <View
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 10,
                          borderWidth: 1.5,
                          borderColor: on
                            ? themeColor.primary
                            : themeColor.text3,
                          backgroundColor: on ? themeColor.primary : "#fff",
                          alignItems: "center",
                          justifyContent: "center",
                          marginRight: 12,
                        }}
                      >
                        {on && (
                          <Text style={{ color: "#fff", fontSize: 12 }}>
                            ✓
                          </Text>
                        )}
                      </View>
                      <RoleAvatar avatar={r.avatar} name={r.name} size={38} />
                      <Text
                        style={{
                          fontSize: 15,
                          color: themeColor.onSurface,
                          marginLeft: 12,
                        }}
                      >
                        {r.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
            <View
              style={{
                flexDirection: "row",
                borderTopWidth: 0.5,
                borderTopColor: "#E5E6EB",
              }}
            >
              <TouchableOpacity
                onPress={() => setPickerVisible(false)}
                style={{
                  flex: 1,
                  height: 48,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 16, color: "#1A1A1A" }}>取消</Text>
              </TouchableOpacity>
              <View style={{ width: 0.5, backgroundColor: "#E5E6EB" }} />
              <TouchableOpacity
                onPress={confirmAdd}
                disabled={pickSel.size === 0}
                style={{
                  flex: 1,
                  height: 48,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    color:
                      pickSel.size > 0 ? themeColor.primary : "#c2c2c2",
                  }}
                >
                  确定{pickSel.size > 0 ? `(${pickSel.size})` : ""}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmDialog
        visible={!!removeRole}
        title="移除成员"
        message={
          removeRole
            ? `确定将 ${removeRole.name} 移出群聊吗？`
            : ""
        }
        onCancel={() => setRemoveRole(null)}
        onConfirm={confirmRemove}
      />
      <ConfirmDialog
        visible={dissolveVisible}
        title="解散群聊"
        message="确定解散该群聊吗？聊天记录会被删除，此操作不可恢复。"
        onCancel={() => setDissolveVisible(false)}
        onConfirm={confirmDissolve}
      />
      <ConfirmDialog
        visible={clearVisible}
        title="清空聊天记录"
        message="确定清空该会话的全部聊天记录吗？此操作不可恢复。"
        onCancel={() => setClearVisible(false)}
        onConfirm={clearChat}
      />
    </ScrollView>
  );
};

export default ChatInfo;
