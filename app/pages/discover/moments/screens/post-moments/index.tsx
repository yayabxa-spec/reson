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
import { useTheme } from "../../../../../../theme/useTheme";
import RoleAvatar from "../../../../../component/complex/RoleAvatar";
import {
  createMoment,
  MomentVisibilityType,
} from "../../../../../store/moments";
import { getFriendRoles } from "../../../../../store/worldline";
import { readRolesRaw, Role } from "../../../../../store/roles";
import Toast from "../../../../../component/base/Toast";
import { readProfile } from "../../../../../store/profile";

const VISIBLE_OPTIONS: { type: MomentVisibilityType; label: string; desc: string }[] = [
  { type: "all", label: "全部人", desc: "所有好友可见" },
  { type: "private", label: "仅自己", desc: "只有自己能看到" },
  { type: "blacklist", label: "不给谁看", desc: "选择屏蔽的角色" },
  { type: "whitelist", label: "部分可见", desc: "仅选择的角色可见" },
];

const PostMoments = () => {
  const navigate = useNavigation();
  const { themeColor } = useTheme();
  const [text, setText] = useState("");
  const [visibleType, setVisibleType] = useState<MomentVisibilityType>("all");
  const [excluded, setExcluded] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [friends, setFriends] = useState<Role[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  const loadFriends = useCallback(async () => {
    try {
      const roles = await readRolesRaw();
      const f = roles.filter((r) => r.status === "done");
      setFriends(f);
    } catch {}
  }, []);

  useEffect(() => {
    loadFriends();
  }, [loadFriends]);

  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerTitle: "发布动态",
      headerTitleAlign: "center",
      headerTintColor: "#111",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: "#fff" },
    });
  }, []);

  const visibleLabel = () => {
    const opt = VISIBLE_OPTIONS.find((o) => o.type === visibleType)!;
    if (visibleType === "blacklist" && excluded.length) {
      return `${opt.label}（${excluded.length}）`;
    }
    if (visibleType === "whitelist" && picked.length) {
      return `${opt.label}（${picked.length}）`;
    }
    return opt.label;
  };

  const publish = async () => {
    const t = text.trim();
    if (!t) {
      Toast.fail("写点什么再发布吧");
      return;
    }
    const profile = await readProfile();
    await createMoment({
      author: { type: "user", name: "我", avatar: profile.avatar || "" },
      contentText: t,
      visible: {
        type: visibleType,
        roleIds:
          visibleType === "blacklist"
            ? excluded
            : visibleType === "whitelist"
            ? picked
            : undefined,
      },
    });
    Toast.success("已发布");
    navigate.goBack();
  };

  const toggleRole = (id: string) => {
    const list = visibleType === "blacklist" ? excluded : picked;
    const setter = visibleType === "blacklist" ? setExcluded : setPicked;
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <TextInput
          style={{
            minHeight: 140,
            fontSize: 16,
            color: themeColor.text5,
            textAlignVertical: "top",
            lineHeight: 24,
          }}
          value={text}
          onChangeText={setText}
          placeholder="分享此刻的想法…"
          placeholderTextColor={themeColor.text2}
          multiline
          autoFocus
        />

        {/* 添加图片（开发中占位） */}
        <TouchableOpacity
          onPress={() => Toast.info("图文动态开发中，敬请期待")}
          style={{
            marginTop: 14,
            width: 72,
            height: 72,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: themeColor.line2,
            borderStyle: "dashed",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: themeColor.text3, fontSize: 24 }}>＋</Text>
          <Text style={{ color: themeColor.text3, fontSize: 11, marginTop: 2 }}>
            图片
          </Text>
        </TouchableOpacity>

        <View style={{ height: 0.5, backgroundColor: themeColor.line2, marginTop: 18 }} />

        {/* 谁可以看 */}
        <TouchableOpacity
          onPress={() => setShowPicker(true)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 14,
          }}
        >
          <Text style={{ flex: 1, fontSize: 15, color: themeColor.text5 }}>
            谁可以看
          </Text>
          <Text style={{ color: themeColor.text2, fontSize: 14 }}>
            {visibleLabel()} ›
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* 发布按钮 */}
      <View
        style={{
          padding: 16,
          borderTopWidth: 0.5,
          borderTopColor: themeColor.line2,
        }}
      >
        <TouchableOpacity
          onPress={publish}
          style={{
            backgroundColor: themeColor.primary,
            borderRadius: 22,
            paddingVertical: 11,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#fff", fontSize: 15, fontWeight: "600" }}>
            发布
          </Text>
        </TouchableOpacity>
      </View>

      {/* 可见性选择 */}
      <Modal
        visible={showPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPicker(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.35)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: "#fff",
              borderTopLeftRadius: 14,
              borderTopRightRadius: 14,
              padding: 16,
              maxHeight: "75%",
            }}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: "600",
                color: themeColor.text5,
                textAlign: "center",
              }}
            >
              谁可以看
            </Text>

            {VISIBLE_OPTIONS.map((o) => (
              <TouchableOpacity
                key={o.type}
                onPress={() => {
                  setVisibleType(o.type);
                  if (o.type !== "blacklist") setExcluded([]);
                  if (o.type !== "whitelist") setPicked([]);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 13,
                  borderBottomWidth: 0.5,
                  borderBottomColor: themeColor.line2,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, color: themeColor.text5 }}>
                    {o.label}
                  </Text>
                  <Text style={{ fontSize: 12, color: themeColor.text2, marginTop: 2 }}>
                    {o.desc}
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: 16,
                    color:
                      visibleType === o.type
                        ? themeColor.primary
                        : themeColor.text2,
                  }}
                >
                  {visibleType === o.type ? "●" : "○"}
                </Text>
              </TouchableOpacity>
            ))}

            {/* 角色多选 */}
            {(visibleType === "blacklist" || visibleType === "whitelist") && (
              <View style={{ marginTop: 8, maxHeight: 320 }}>
                <Text style={{ color: themeColor.text3, fontSize: 13, marginBottom: 6 }}>
                  {visibleType === "blacklist" ? "选择不给谁看" : "选择可见角色"}
                </Text>
                <ScrollView>
                  {friends.map((f) => {
                    const sel =
                      visibleType === "blacklist"
                        ? excluded.includes(f.id)
                        : picked.includes(f.id);
                    return (
                      <TouchableOpacity
                        key={f.id}
                        onPress={() => toggleRole(f.id)}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          paddingVertical: 8,
                        }}
                      >
                        <RoleAvatar avatar={f.avatar} name={f.name} size={34} />
                        <Text
                          style={{
                            flex: 1,
                            fontSize: 14,
                            color: themeColor.text5,
                            marginLeft: 10,
                          }}
                        >
                          {f.remark || f.name}
                        </Text>
                        <Text
                          style={{
                            fontSize: 15,
                            color: sel ? themeColor.primary : themeColor.text2,
                          }}
                        >
                          {sel ? "☑" : "☐"}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            <TouchableOpacity
              onPress={() => setShowPicker(false)}
              style={{
                marginTop: 14,
                backgroundColor: themeColor.primary,
                borderRadius: 20,
                paddingVertical: 10,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#fff", fontSize: 15, fontWeight: "600" }}>
                完成
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default PostMoments;
