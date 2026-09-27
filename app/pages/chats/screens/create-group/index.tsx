import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
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
import {
  ensureRolesSeeded,
  readRolesRaw,
  Role,
} from "../../../../store/roles";
import RoleAvatar from "../../../../component/complex/RoleAvatar";
import {
  createGroupConversation,
  GroupMemberInfo,
} from "../../../../store/localChat";
import { useChatList } from "../../../../store/chatList";
import { buildRoleSearchKey } from "../../../../utils/pinyinSearch";
import { resolveCallName } from "../../../../store/profile";

const HEADER_H = 26;
const ROW_H = 60;

type Row =
  | { type: "header"; title: string }
  | { type: "item"; role: Role };

const CreateGroup = () => {
  const navigate = useNavigation();
  const { themeColor } = useTheme();
  const { setChatListStoreV2 } = useChatList();
  const [friends, setFriends] = useState<Role[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [kw, setKw] = useState("");
  const listRef = useRef<FlatList<Row>>(null);
  const selectedIds = useMemo(() => [...selected], [selected]);

  useEffect(() => {
    (async () => {
      await ensureRolesSeeded();
      const roles = await readRolesRaw();
      setFriends(roles.filter((r) => r.status === "done"));
    })();
  }, []);

  const keyMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of friends) map.set(r.id, buildRoleSearchKey(r.name));
    return map;
  }, [friends]);

  const flatRows = useMemo(() => {
    const kwLower = kw.trim().toLocaleLowerCase();
    const filtered = kwLower
      ? friends.filter((r) =>
          (keyMap.get(r.id) || r.name.toLocaleLowerCase()).includes(kwLower)
        )
      : friends;
    const groups = new Map<string, Role[]>();
    for (const r of filtered) {
      const ini = keyMap.get(r.id)?.split("|")[1] || "";
      let letter = (ini.charAt(0) || "#").toUpperCase();
      if (!/[A-Z]/.test(letter)) letter = "#";
      if (!groups.has(letter)) groups.set(letter, []);
      groups.get(letter)!.push(r);
    }
    const rows: Row[] = [];
    const letters = [...groups.keys()].sort((a, b) =>
      a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b)
    );
    for (const letter of letters) {
      rows.push({ type: "header", title: letter });
      for (const role of groups.get(letter)!) {
        rows.push({ type: "item", role });
      }
    }
    return rows;
  }, [friends, kw, keyMap]);

  // 右侧字母索引 -> 对应分组的第一个位置
  const letterIndex = useMemo(() => {
    const map = new Map<string, number>();
    flatRows.forEach((row, i) => {
      if (row.type === "header" && !map.has(row.title)) {
        map.set(row.title, i);
      }
    });
    return map;
  }, [flatRows]);

  const toggle = useCallback((roleId: string) => {
    setSelected((pre) => {
      const next = new Set(pre);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });
  }, []);

  const done = useCallback(async () => {
    const members: GroupMemberInfo[] = await Promise.all(
      selectedIds.map(async (id) => {
        const r = friends.find((x) => x.id === id)!;
        return {
          roleId: r.id,
          name: r.name,
          avatar: r.avatar,
          persona: r.persona,
          callName: await resolveCallName(r.callName),
          modelIds: r.modelIds,
          temperature: r.temperature,
          examples: r.examples,
        };
      })
    );
    if (!members.length) return;
    const convo = await createGroupConversation(members);
    setChatListStoreV2({
      type: "goToMsgChat",
      chatListState: [],
      curConvo: {
        convoId: convo.id,
        curReceiverInfo: { act: convo.title, image: "" },
        convoMember: [],
        isGroup: true,
        groupName: convo.title,
        ...convo,
      },
    });
    navigate.navigate("pages/chats/msg-chats/index", {
      chatType: "isGroup",
      convoId: convo.id,
    });
  }, [selectedIds, friends, setChatListStoreV2, navigate]);

  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerTitle: "发起群聊",
      headerTitleAlign: "center",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: "#fff" },
      headerTintColor: "#111",
      headerRight: () => (
        <TouchableOpacity
          disabled={selected.size === 0}
          onPress={done}
          style={{ paddingHorizontal: 12, paddingVertical: 6 }}
        >
          <Text
            style={{
              fontSize: 15,
              fontWeight: "600",
              color:
                selected.size > 0 ? themeColor.primary : "#c2c2c2",
            }}
          >
            完成{selected.size > 0 ? `(${selected.size})` : ""}
          </Text>
        </TouchableOpacity>
      ),
      headerRightContainerStyle: { paddingRight: 12 },
    });
  }, [navigate, selected.size, themeColor, done]);

  const getItemLayout = useCallback(
    (_data: Row[] | null, index: number) => {
      const data = _data || [];
      let offset = 0;
      for (let i = 0; i < index; i++) {
        offset += data[i].type === "header" ? HEADER_H : ROW_H;
      }
      const length = data[index]?.type === "header" ? HEADER_H : ROW_H;
      return { length, offset, index };
    },
    []
  );

  const scrollToLetter = (letter: string) => {
    const index = letterIndex.get(letter);
    if (index == null) return;
    listRef.current?.scrollToIndex({ index, viewPosition: 0, animated: false });
  };

  const renderRow = ({ item }: { item: Row }) => {
    if (item.type === "header") {
      return (
        <View
          style={{
            height: HEADER_H,
            backgroundColor: themeColor.fillColor,
            paddingHorizontal: 16,
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 14, color: themeColor.text3 }}>
            {item.title}
          </Text>
        </View>
      );
    }
    const role = item.role;
    const isSel = selected.has(role.id);
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => toggle(role.id)}
        style={{
          height: ROW_H,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          backgroundColor: "#fff",
        }}
      >
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            borderWidth: 1.5,
            borderColor: isSel ? themeColor.primary : "#c8c8c8",
            backgroundColor: isSel ? themeColor.primary : "#fff",
            alignItems: "center",
            justifyContent: "center",
            marginRight: 12,
          }}
        >
          {isSel && (
            <Text style={{ color: "#fff", fontSize: 13, lineHeight: 18 }}>
              ✓
            </Text>
          )}
        </View>
        <RoleAvatar avatar={role.avatar} name={role.name} size={40} />
        <Text
          numberOfLines={1}
          style={{ fontSize: 16, color: themeColor.text5, marginLeft: 12, flex: 1 }}
        >
          {role.name}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: themeColor.fillColor }}>
      <View
        style={{
          backgroundColor: themeColor.white,
          borderRadius: 4,
          margin: 8,
          paddingHorizontal: 10,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <Text style={{ color: themeColor.text3, fontSize: 14 }}>🔍</Text>
        <TextInput
          value={kw}
          onChangeText={setKw}
          placeholder="搜索"
          placeholderTextColor={themeColor.text2}
          style={{ flex: 1, paddingVertical: 8, paddingLeft: 6, fontSize: 15 }}
        />
      </View>

      <View style={{ flex: 1, flexDirection: "row" }}>
        <FlatList
          ref={listRef}
          style={{ flex: 1 }}
          data={flatRows}
          keyExtractor={(row) =>
            row.type === "header" ? "h-" + row.title : row.role.id
          }
          renderItem={renderRow}
          getItemLayout={getItemLayout}
          onScrollToIndexFailed={() => {}}
          ListEmptyComponent={
            <Text
              style={{
                textAlign: "center",
                color: themeColor.text3,
                marginTop: 40,
              }}
            >
              没有可选择的角色，先去添加角色好友吧
            </Text>
          }
        />
        <View style={{ paddingVertical: 8, paddingRight: 6 }}>
          {[...letterIndex.keys()].map((letter) => (
            <TouchableOpacity
              key={letter}
              onPress={() => scrollToLetter(letter)}
              style={{ paddingVertical: 1.5, alignItems: "center" }}
            >
              <Text
                style={{
                  fontSize: 11,
                  color: themeColor.textBlue,
                  lineHeight: 14,
                }}
              >
                {letter}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
};

export default CreateGroup;
