import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useNavigation } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useTheme } from "../../../../../theme/useTheme";
import Toast from "../../../../component/base/Toast";
import ActionSheet, { ActionSheetAction } from "../../../../component/base/ActionSheet";
import WeChatDialog from "../../../../component/base/WeChatDialog";
import {
  sqlAddRolePhoto,
  sqlDeleteRolePhoto,
  sqlReadRolePhotos,
  sqlReadRole,
  type RolePhoto,
} from "../../../../store/appDb";
import {
  readComfySettings,
  generateComfyImage,
} from "../../../../store/comfyui";

/**
 * 角色相册：展示该角色的照片（用户上传 / ComfyUI 生成自动入册）。
 * 右下角 + 添加；长按照片删除。
 */
const Page = () => {
  const navigate = useNavigation();
  const params = useLocalSearchParams<{ roleId: string; roleName?: string }>();
  const roleId = params.roleId;
  const roleName = params.roleName || "角色";
  const { themeColor } = useTheme();
  const [photos, setPhotos] = useState<RolePhoto[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [genDialogVisible, setGenDialogVisible] = useState(false);
  const [genPrompt, setGenPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RolePhoto | null>(null);
  const [comfyEnabled, setComfyEnabled] = useState(false);
  const [roleBio, setRoleBio] = useState<string>("");

  const refresh = useCallback(async () => {
    if (!roleId) return;
    setPhotos(await sqlReadRolePhotos(roleId));
    setLoaded(true);
  }, [roleId]);

  useLayoutEffect(() => {
    navigate.setOptions({
      headerTitle: `${roleName}的相册`,
      headerShadowVisible: false,
    } as any);
  }, [navigate, roleName]);

  useEffect(() => {
    refresh();
    sqlReadRole(roleId || "")
      .then((r) => setRoleBio((r as any)?.bio || (r as any)?.persona || ""))
      .catch(() => {});
    readComfySettings().then((s) => setComfyEnabled(!!s.enabled));
  }, [refresh, roleId]);

  const pickAndAdd = useCallback(async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (res.canceled || !res.assets?.length || !roleId) return;
    let uri = res.assets[0].uri;
    try {
      const ext = (uri.split(".").pop() || "jpg").split("?")[0];
      const dest = `${FileSystem.documentDirectory}album-${Date.now()}.${ext}`;
      await FileSystem.copyAsync({ from: uri, to: dest });
      uri = dest;
    } catch { /* 复制失败用原 URI */ }
    await sqlAddRolePhoto(roleId, uri);
    Toast.success("已加入相册");
    refresh();
  }, [roleId, refresh]);

  const onGenerate = useCallback(async () => {
    if (!roleId || !genPrompt.trim()) {
      Toast.info("先写一句画面描述");
      return;
    }
    setGenerating(true);
    try {
      const settings = await readComfySettings();
      const appearance = roleBio ? roleBio.slice(0, 100) + "，" : "";
      const prompt = `${roleName}，${appearance}${genPrompt.trim()}${
        settings.qualitySuffix ? "，" + settings.qualitySuffix : ""
      }`;
      const result = await generateComfyImage(settings, prompt);
      if (result.ok && result.uri) {
        await sqlAddRolePhoto(roleId, result.uri, genPrompt.trim());
        Toast.success("已生成并加入相册");
        setGenDialogVisible(false);
        setGenPrompt("");
        refresh();
      } else {
        Toast.info("生成失败：" + (result.error || "未知原因"));
      }
    } catch (e: any) {
      Toast.info("生成失败：" + (e?.message || e));
    } finally {
      setGenerating(false);
    }
  }, [roleId, genPrompt, roleName, roleBio, refresh]);

  const sheetActions: ActionSheetAction[] = [
    { name: "从相册选择", callback: () => pickAndAdd() },
    ...(comfyEnabled
      ? [
          {
            name: "AI 生成一张",
            callback: () => setGenDialogVisible(true),
          },
        ]
      : []),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: themeColor.surfaceContainerLow }}>
      {loaded && photos.length === 0 ? (
        <View style={{ alignItems: "center", marginTop: 80, paddingHorizontal: 32 }}>
          <Text style={{ color: themeColor.onSurfaceVariant, fontSize: 14, textAlign: "center" }}>
            相册还是空的{"\n"}点右下角 + 添加照片，开启 ComfyUI 后还能让 AI 生成
          </Text>
        </View>
      ) : (
        <FlatList
          data={photos}
          keyExtractor={(item: any) => item.id}
          numColumns={3}
          contentContainerStyle={{ padding: 4 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.85}
              onLongPress={() => setDeleteTarget(item)}
              style={{ flex: 1 / 3, aspectRatio: 1, padding: 2 }}
            >
              <Image
                source={{ uri: item.uri }}
                style={{ width: "100%", height: "100%", borderRadius: 6 }}
                resizeMode="cover"
              />
            </TouchableOpacity>
          )}
        />
      )}

      {/* 添加按钮 */}
      <TouchableOpacity
        onPress={() => setSheetVisible(true)}
        style={{
          position: "absolute",
          right: 20,
          bottom: 28,
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: themeColor.primary,
          alignItems: "center",
          justifyContent: "center",
          elevation: 6,
          shadowColor: "#000",
          shadowOpacity: 0.2,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
        }}
      >
        <Text style={{ color: "#fff", fontSize: 26, marginTop: -2 }}>+</Text>
      </TouchableOpacity>

      <ActionSheet
        style={{ backgroundColor: themeColor.white, borderRadius: 8 }}
        visible={sheetVisible}
        actions={sheetActions}
        onClose={() => setSheetVisible(false)}
        cancelText="取消"
        onCancel={() => setSheetVisible(false)}
      />

      {/* AI 生图描述输入 */}
      <WeChatDialog
        visible={genDialogVisible}
        title="AI 生成照片"
        message={generating ? "正在生成，可能需要一两分钟…" : "描述想要的照片画面（会结合角色外貌）"}
        input={{
          value: genPrompt,
          onChange: setGenPrompt,
          placeholder: "例如：在夕阳下的海边回眸微笑",
        }}
        confirmText={generating ? "生成中" : "生成"}
        cancelText="取消"
        onCancel={() => {
          if (!generating) setGenDialogVisible(false);
        }}
        onConfirm={() => {
          if (!generating) onGenerate();
        }}
      />
      {generating && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0, left: 0, right: 0,
            alignItems: "center",
            paddingTop: 8,
          }}
        >
          <ActivityIndicator size="small" color={themeColor.primary} />
        </View>
      )}

      {/* 删除确认 */}
      <WeChatDialog
        visible={!!deleteTarget}
        title="删除照片"
        message="从相册中删除这张照片？此操作不可恢复。"
        confirmText="删除"
        danger
        cancelText="取消"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            sqlDeleteRolePhoto(deleteTarget.id).catch(() => {});
            Toast.success("已删除");
            setDeleteTarget(null);
            refresh();
          }
        }}
      />
    </View>
  );
};

export default Page;
