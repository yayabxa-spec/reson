import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import {
  FlatList,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "expo-router";
import { useTheme } from "../../../../../theme/useTheme";
import {
  FavoriteMsg,
  readFavorites,
  removeFavorite,
  updateFavoriteAudio,
} from "../../../../store/favorites";
import Toast from "../../../../component/base/Toast";
import Dialog from "../../../../component/base/Dialog";
import { sqlReadMessages } from "../../../../store/appDb";
import VoiceCard from "../../../../component/business/MsgReceiver/component/VoiceCard";

const Favorites = () => {
  const navigate = useNavigation();
  const { themeColor } = useTheme();
  const [list, setList] = useState<FavoriteMsg[]>([]);

  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerTitle: "收藏",
      headerTitleAlign: "center",
      headerTintColor: "#111",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: "#EDEDED" },
    });
  }, [navigate]);

  const load = useCallback(async () => {
    let favs = await readFavorites();
    // 旧收藏语音回填：从原消息找回本地音频引用（不重新合成，不耗额度）
    const toBackfill = favs.filter((f) => !f.audio);
    for (const f of toBackfill) {
      try {
        const msgs = await sqlReadMessages(f.convoId);
        const m = msgs.find((x) => x.id === f.msgId);
        if (m?.audio) {
          await updateFavoriteAudio(f.id, m.audio);
          favs = favs.map((x) =>
            x.id === f.id ? { ...x, audio: m.audio } : x
          );
        }
      } catch {}
    }
    setList(favs);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const confirmDelete = (item: FavoriteMsg) => {
    Dialog.confirm({
      overlay: true,
      title: "删除收藏",
      message: "确定删除这条收藏吗？",
      confirmButtonText: "删除",
      cancelButtonText: "取消",
    })
      .then(async () => {
        await removeFavorite(item.id);
        Toast.success("已删除");
        load();
      })
      .catch(() => {});
  };

  return (
    <View style={{ flex: 1, backgroundColor: themeColor.fillColor }}>
      <FlatList
        data={list}
        keyExtractor={(x) => x.id}
        contentContainerStyle={{ padding: 12 }}
        ListEmptyComponent={
          <Text
            style={{
              textAlign: "center",
              marginTop: 60,
              color: themeColor.text3,
            }}
          >
            暂无收藏
          </Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.7}
            onLongPress={() => confirmDelete(item)}
            style={{
              backgroundColor: themeColor.white,
              borderRadius: 8,
              padding: 14,
              marginBottom: 10,
            }}
          >
            <Text style={{ fontSize: 13, color: themeColor.text3 }}>
              {item.roleName}
              {item.audio ? " · 语音消息" : ""}
            </Text>
            {item.audio ? (
              <View style={{ marginTop: 8, alignSelf: "flex-start" }}>
                <VoiceCard
                  text={item.audio}
                  type="left"
                  caption={item.content}
                  showCaption
                />
              </View>
            ) : (
              <Text
                style={{ fontSize: 15, color: themeColor.text5, marginTop: 6 }}
              >
                {item.content}
              </Text>
            )}
            <Text style={{ fontSize: 11, color: themeColor.text2, marginTop: 8 }}>
              {new Date(item.createdAt).toLocaleString("zh-CN")}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
};

export default Favorites;
