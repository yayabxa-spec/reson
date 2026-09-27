import { useNavigation } from "expo-router";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import SearchIcon from "../../../../../assets/icon/common/search.svg";
import { useTheme } from "../../../../../theme/useTheme";
import { ensureRolesSeeded, readRolesRaw, Role } from "../../../../store/roles";
import RoleAvatar from "../../../../component/complex/RoleAvatar";
import { buildRoleSearchKey } from "../../../../utils/pinyinSearch";

const AddContactsSearch = () => {
  const navigate = useNavigation();
  const [text, setText] = useState("");
  const [rolesCache, setRolesCache] = useState<Role[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [searchKeys, setSearchKeys] = useState<Map<string, string>>(new Map());
  const { themeColor } = useTheme();
  const textInputRef = useRef<TextInput>(null);

  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerTitle: "搜索角色",
      headerTitleAlign: "center",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: themeColor.fillColor },
      headerTintColor: "#111",
    });
  }, []);

  useEffect(() => {
    textInputRef.current?.focus();
    (async () => {
      await ensureRolesSeeded();
      const roles = await readRolesRaw();
      setRolesCache(roles);
      const map = new Map<string, string>();
      for (const r of roles) {
        map.set(r.id, buildRoleSearchKey(r.name));
      }
      setSearchKeys(map);
      setLoaded(true);
    })();
  }, []);

  // 按角色名 / 拼音首字母 / 全拼模糊搜索（同步过滤缓存，输入即时响应、不卡顿）
  const kw = text.trim().toLocaleLowerCase();
  const resultList = useMemo(() => {
    if (!kw) return [];
    return rolesCache.filter((r) =>
      (searchKeys.get(r.id) || r.name.toLocaleLowerCase()).includes(kw)
    );
  }, [kw, rolesCache, searchKeys]);
  const searched = !!kw;

  return (
    <SafeAreaView style={{ backgroundColor: themeColor.fillColor, flex: 1 }} edges={["bottom"]}>
      <View
        style={{
          backgroundColor: themeColor.fillColor,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingRight: 8,
        }}
      >
        <View
          style={{
            flex: 1,
            borderRadius: 6,
            margin: 8,
            height: 40,
            paddingHorizontal: 8,
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: themeColor.white,
          }}
        >
          <SearchIcon />
          <TextInput
            ref={textInputRef}
            autoFocus
            onChangeText={setText}
            selectionColor={themeColor.primary}
            style={{ paddingLeft: 8, flex: 1, height: 40, fontSize: 15, paddingVertical: 0 }}
            placeholder="输入角色名搜索"
            placeholderTextColor={themeColor.text2}
          />
        </View>
        <TouchableOpacity
          onPress={() => {
            navigate.goBack();
          }}
        >
          <Text style={{ color: themeColor.textBlue, fontSize: 16 }}>取消</Text>
        </TouchableOpacity>
      </View>

      <View style={{ backgroundColor: themeColor.white, flex: 1, paddingTop: 8 }}>
        {!loaded && (
          <Text
            style={{
              textAlign: "center",
              color: themeColor.text3,
              marginTop: 40,
            }}
          >
            加载中…
          </Text>
        )}
        {searched && resultList.length === 0 && (
          <Text
            style={{
              textAlign: "center",
              color: themeColor.text3,
              marginTop: 40,
            }}
          >
            未找到相关角色
          </Text>
        )}
        <FlatList
          data={resultList}
          keyExtractor={(r) => r.id}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={15}
          maxToRenderPerBatch={15}
          windowSize={7}
          removeClippedSubviews
          renderItem={({ item: role }) => (
            <TouchableOpacity
              key={role.id}
              activeOpacity={0.7}
              onPress={() => {
                navigate.navigate("pages/contacts/screens/friend-info/index", {
                  friendId: role.id,
                  type: "search",
                });
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 16,
                paddingVertical: 10,
              }}
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
                </Text>
                <Text
                  numberOfLines={1}
                  style={{ color: themeColor.text3, fontSize: 13, marginTop: 2 }}
                >
                  {role.persona}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      </View>
    </SafeAreaView>
  );
};

export default AddContactsSearch;
