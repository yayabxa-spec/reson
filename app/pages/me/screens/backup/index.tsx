import { useEffect, useLayoutEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as DocumentPicker from "expo-document-picker";
import { useTheme } from "../../../../../theme/useTheme";
import Toast from "../../../../component/base/Toast";
import WeChatSwitch from "../../../../component/base/WeChatSwitch";
import WeChatDialog from "../../../../component/base/WeChatDialog";
import {
  collectBackupPayload,
  backupFileName,
  restoreFromPayload,
  refreshAfterRestore,
  saveLocalBackup,
  hasEncryptedKeys,
} from "../../../../store/backup";
import {
  WEBDAV_PRESETS,
  resolveHost,
  webdavTest,
  webdavList,
  webdavMkcol,
  webdavPut,
  webdavGet,
  WebDavConfig,
  WebDavItem,
} from "../../../../utils/webdav";

const BACKUP_DIR = "RESON备份";

const Backup = () => {
  const navigate = useNavigation();
  const { themeColor } = useTheme();

  const [includeKeys, setIncludeKeys] = useState(false);
  const [keyPwd, setKeyPwd] = useState("");
  const [pwdModal, setPwdModal] = useState(false);
  const [pwdInput, setPwdInput] = useState("");
  const [mergeChats, setMergeChats] = useState(true);

  const [presetId, setPresetId] = useState("custom");
  const [host, setHost] = useState("");
  const [fnosId, setFnosId] = useState("");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState("");
  const [cloudList, setCloudList] = useState<WebDavItem[]>([]);

  const [restoreText, setRestoreText] = useState<string | null>(null);
  const [restorePwd, setRestorePwd] = useState("");

  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerTitle: "聊天记录备份",
      headerTitleAlign: "center",
      headerTintColor: "#111",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: "#EDEDED" },
    });
  }, []);

  const preset = WEBDAV_PRESETS.find((p) => p.id === presetId)!;
  const currentHost = resolveHost(presetId, host, fnosId);

  const doLocalBackup = async () => {
    try {
      const perm =
        await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!perm.granted) {
        Toast.fail("需要授权访问目录才能备份");
        return;
      }
      setBusy("backup");
      const payload = await collectBackupPayload({
        includeKeys,
        password: includeKeys ? keyPwd : "",
      });
      const fileUri = await saveLocalBackup(perm.directoryUri, payload);
      Toast.success("本地备份完成");
    } catch (e: any) {
      Toast.fail(e?.message || "备份失败");
    } finally {
      setBusy("");
    }
  };

  const pickLocalRestore = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "application/json",
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const text = await FileSystem.readAsStringAsync(res.assets[0].uri);
      setRestoreText(text);
      setRestorePwd("");
    } catch {
      Toast.fail("读取文件失败");
    }
  };

  const doRestore = async () => {
    if (!restoreText) return;
    if (hasEncryptedKeys(restoreText) && !restorePwd) {
      Toast.info("备份包含加密的 KEY，未输入密码将跳过密钥恢复");
    }
    setBusy("restore");
    try {
      await restoreFromPayload(restoreText, {
        mergeChats,
        password: restorePwd,
      });
      await refreshAfterRestore();
      setRestoreText(null);
      Toast.success("还原完成");
    } catch (e: any) {
      Toast.fail(e?.message || "还原失败");
    } finally {
      setBusy("");
    }
  };

  const doTest = async () => {
    setBusy("test");
    try {
      await webdavTest({ host: currentHost, user, pass });
      Toast.success("连接成功");
    } catch (e: any) {
      Toast.fail(e?.message || "连接失败");
    } finally {
      setBusy("");
    }
  };

  const doUpload = async () => {
    setBusy("upload");
    try {
      const cfg: WebDavConfig = { host: currentHost, user, pass };
      await webdavTest(cfg);
      try {
        await webdavMkcol(cfg, BACKUP_DIR);
      } catch {}
      const payload = await collectBackupPayload({
        includeKeys,
        password: includeKeys ? keyPwd : "",
      });
      const name = backupFileName();
      await webdavPut(cfg, `${BACKUP_DIR}/${name}`, JSON.stringify(payload));
      Toast.success("已上传云端");
      await loadCloudList();
    } catch (e: any) {
      Toast.fail(e?.message || "上传失败");
    } finally {
      setBusy("");
    }
  };

  const loadCloudList = async () => {
    setBusy("list");
    try {
      const cfg: WebDavConfig = { host: currentHost, user, pass };
      await webdavTest(cfg);
      const items = await webdavList(cfg, BACKUP_DIR);
      setCloudList(items.filter((it) => !it.collection));
      if (!items.filter((it) => !it.collection).length) {
        Toast.info("云端暂无备份文件");
      }
    } catch (e: any) {
      Toast.fail(e?.message || "获取列表失败");
    } finally {
      setBusy("");
    }
  };

  const restoreFromCloud = async (item: WebDavItem) => {
    setBusy("download");
    try {
      const text = await webdavGet(
        { host: currentHost, user, pass },
        item.href
      );
      setRestoreText(text);
      setRestorePwd("");
    } catch (e: any) {
      Toast.fail(e?.message || "下载失败");
    } finally {
      setBusy("");
    }
  };

  const inputStyle = {
    backgroundColor: themeColor.bg2,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: themeColor.text5,
    marginTop: 6,
  };

  const section = (title: string, children: ReactNode) => (
    <View
      style={{
        backgroundColor: "#fff",
        borderRadius: 8,
        padding: 14,
        marginBottom: 12,
      }}
    >
      <Text
        style={{
          fontSize: 15,
          color: themeColor.text5,
          fontWeight: "600",
          marginBottom: 6,
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );

  const btn = (label: string, onPress: () => void, disabled?: boolean) => (
    <TouchableOpacity
      disabled={!!busy || disabled}
      onPress={onPress}
      style={{
        marginTop: 10,
        borderColor: themeColor.textBlue,
        borderWidth: 1,
        borderRadius: 6,
        paddingVertical: 9,
        alignItems: "center",
        opacity: busy && !disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ color: themeColor.textBlue, fontSize: 14 }}>
        {busy === "upload" || busy === "backup" ? "处理中…" : label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView
      style={{ backgroundColor: "#EDEDED", flex: 1 }}
      contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
    >
      {section(
        "备份设置",
        <>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text style={{ fontSize: 15, color: themeColor.text5 }}>
              备份 API Key（模型密钥）
            </Text>
            <WeChatSwitch
              value={includeKeys}
              onValueChange={(v) => {
                if (v) {
                  setPwdInput("");
                  setPwdModal(true);
                } else {
                  setIncludeKeys(false);
                  setKeyPwd("");
                }
              }}
            />
          </View>
          <Text style={{ color: themeColor.text2, fontSize: 12, marginTop: 4 }}>
            备份内容包含聊天记录、角色资料、记忆与知识库数据
          </Text>
          {includeKeys && (
            <>
              <Text style={{ color: themeColor.text3, fontSize: 13, marginTop: 10 }}>
                设置备份密码（Key 将加密保存）
              </Text>
              <TextInput
                style={inputStyle}
                value={keyPwd}
                onChangeText={setKeyPwd}
                secureTextEntry
                placeholder="还原时需要输入此密码"
                placeholderTextColor={themeColor.text2}
              />
            </>
          )}
        </>
      )}

      {section(
        "本地备份",
        <>
          {btn("选择目录并备份到本地", doLocalBackup)}
          {btn("从本地备份文件还原", pickLocalRestore)}
        </>
      )}

      {section(
        "WebDAV 云端备份",
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {WEBDAV_PRESETS.map((p) => (
              <TouchableOpacity
                key={p.id}
                onPress={() => {
                  setPresetId(p.id);
                  setHost(p.host);
                }}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor:
                    presetId === p.id ? themeColor.primary : "#D8D8D8",
                  backgroundColor:
                    presetId === p.id ? "#EEF7F0" : "#fff",
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color:
                      presetId === p.id ? themeColor.primary : themeColor.text3,
                  }}
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {preset.hint ? (
            <Text
              style={{
                color: themeColor.text2,
                fontSize: 12,
                marginTop: 8,
                lineHeight: 18,
              }}
            >
              {preset.hint}
            </Text>
          ) : null}
          {presetId === "fnos" && (
            <>
              <Text style={{ color: themeColor.text3, fontSize: 13, marginTop: 10 }}>
                FN Connect ID
              </Text>
              <TextInput
                style={inputStyle}
                value={fnosId}
                onChangeText={setFnosId}
                placeholder="例如：1234"
                placeholderTextColor={themeColor.text2}
                autoCapitalize="none"
              />
            </>
          )}
          {presetId !== "fnos" && (
            <>
              <Text style={{ color: themeColor.text3, fontSize: 13, marginTop: 10 }}>
                主机地址
              </Text>
              <TextInput
                style={inputStyle}
                value={host}
                onChangeText={setHost}
                placeholder="https://dav.example.com/dav"
                placeholderTextColor={themeColor.text2}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </>
          )}
          <Text style={{ color: themeColor.text3, fontSize: 13, marginTop: 10 }}>
            账号
          </Text>
          <TextInput
            style={inputStyle}
            value={user}
            onChangeText={setUser}
            placeholder="WebDAV 账号"
            placeholderTextColor={themeColor.text2}
            autoCapitalize="none"
          />
          <Text style={{ color: themeColor.text3, fontSize: 13, marginTop: 10 }}>
            密码
          </Text>
          <TextInput
            style={inputStyle}
            value={pass}
            onChangeText={setPass}
            placeholder="WebDAV 密码（应用密码）"
            placeholderTextColor={themeColor.text2}
            secureTextEntry
          />
          {btn("连接测试", doTest)}
          {btn("上传备份到云端", doUpload)}
          {btn("获取云端备份列表", loadCloudList)}
          {cloudList.map((it) => (
            <View
              key={it.href}
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: 8,
                paddingVertical: 8,
                borderTopWidth: 0.5,
                borderTopColor: "#E5E6EB",
              }}
            >
              <Text style={{ flex: 1, fontSize: 13, color: themeColor.text5 }}>
                {it.name}
              </Text>
              <TouchableOpacity onPress={() => restoreFromCloud(it)}>
                <Text style={{ color: themeColor.textBlue, fontSize: 13 }}>
                  还原
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </>
      )}

            <WeChatDialog
        visible={pwdModal}
        title="设置备份密码"
        message="开启备份 KEY 需要设置密码，还原时必须输入相同密码才能解密密钥。"
        input={{
          value: pwdInput,
          onChange: setPwdInput,
          placeholder: "请输入备份密码",
          secure: true,
        }}
        onCancel={() => setPwdModal(false)}
        onConfirm={() => {
          if (!pwdInput.trim()) {
            Toast.fail("请输入备份密码");
            return;
          }
          setKeyPwd(pwdInput.trim());
          setIncludeKeys(true);
          setPwdModal(false);
        }}
      />

            <WeChatDialog
        visible={!!restoreText}
        title="还原备份"
        confirmText={busy === "restore" ? "还原中…" : "还原"}
        danger
        onCancel={() => setRestoreText(null)}
        onConfirm={doRestore}
        input={{
          value: restorePwd,
          onChange: setRestorePwd,
          placeholder: "留空则跳过密钥恢复",
          secure: true,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 14,
          }}
        >
          <Text style={{ fontSize: 15, color: themeColor.text5 }}>
            合并聊天记录
          </Text>
          <WeChatSwitch value={mergeChats} onValueChange={setMergeChats} />
        </View>
        <Text style={{ color: themeColor.text2, fontSize: 12, marginTop: 4 }}>
          关闭则覆盖当前聊天记录
        </Text>
        <Text style={{ color: themeColor.text3, fontSize: 13, marginTop: 10 }}>
          备份密码（备份时设置了才需要）
        </Text>
      </WeChatDialog>
    </ScrollView>
  );
};

export default Backup;
