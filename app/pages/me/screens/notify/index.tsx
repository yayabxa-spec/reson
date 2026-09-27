import { useLayoutEffect } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "expo-router";
import { useTheme } from "../../../../../theme/useTheme";
import { notifyNewMessage } from "../../../../store/notifications";
import { openMessageChannelSettings } from "../../../../utils/keepAlive";

const NotifySettings = () => {
  const navigate = useNavigation();
  const { themeColor } = useTheme();

  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerTitle: "消息通知",
      headerTitleAlign: "center",
      headerTintColor: "#111",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: "#EDEDED" },
    });
  }, []);

  const actionBtn = (label: string, onPress: () => void) => (
    <TouchableOpacity
      onPress={onPress}
      style={{
        marginTop: 10,
        borderColor: themeColor.textBlue,
        borderWidth: 1,
        borderRadius: 6,
        paddingVertical: 9,
        alignItems: "center",
      }}
    >
      <Text style={{ color: themeColor.textBlue, fontSize: 14 }}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView
      style={{ backgroundColor: "#EDEDED", flex: 1 }}
      contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
    >
      <View
        style={{ backgroundColor: "#fff", borderRadius: 8, padding: 14 }}
      >
        <Text style={{ fontSize: 15, color: themeColor.text5, fontWeight: "600" }}>
          消息通知
        </Text>
        <Text style={{ color: themeColor.text2, fontSize: 12, marginTop: 6 }}>
          管理角色回复、主动消息等通知的横幅、声音与锁屏显示方式
        </Text>
        {actionBtn(
          "打开消息通知设置（横幅 / 锁屏显示）",
          () => openMessageChannelSettings()
        )}
        {actionBtn(
          "发送一条测试通知",
          () =>
            notifyNewMessage(
              "测试通知",
              "如果你能看到这条横幅，说明通知设置正常",
              "local-ai-1"
            )
        )}
      </View>
    </ScrollView>
  );
};

export default NotifySettings;
