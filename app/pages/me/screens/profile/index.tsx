import { useEffect, useLayoutEffect, useState } from "react";
import {
  Image,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useTheme } from "../../../../../theme/useTheme";
import {
  readProfile,
  saveProfile,
  UserProfile,
  formatBirthday,
} from "../../../../store/profile";
import Toast from "../../../../component/base/Toast";
import Segment from "../../../../component/base/Segment";
import BirthdayPicker from "../../../../component/base/BirthdayPicker";
import ArrowRightIcon from "../../../../../assets/icon/common/arrow-right.svg";

const Profile = () => {
  const navigate = useNavigation();
  const { themeColor } = useTheme();
  const [p, setP] = useState<UserProfile | null>(null);
  const [birthday, setBirthday] = useState<string | undefined>(undefined);
  const [birthPickerVisible, setBirthPickerVisible] = useState(false);

  useEffect(() => {
    readProfile().then((profile) => {
      setP(profile);
      setBirthday(profile.birthday);
    });
  }, []);

  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerTitle: "个人资料",
      headerTitleAlign: "center",
      headerTintColor: "#111",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: "#EDEDED" },
    });
  }, []);

  if (!p) return null;

  const pickAvatar = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (res.canceled || !res.assets?.length) return;
    let uri = res.assets[0].uri;
    try {
      const ext = (uri.split(".").pop() || "jpg").split("?")[0];
      const dest = `${FileSystem.documentDirectory}avatar-${Date.now()}.${ext}`;
      await FileSystem.copyAsync({ from: uri, to: dest });
      uri = dest;
    } catch {}
    setP({ ...p, avatar: uri });
  };

  const field = (label: string, value: string, onChange: (v: string) => void) => (
    <View style={{ marginTop: 12 }}>
      <Text style={{ color: themeColor.text3, fontSize: 13 }}>{label}</Text>
      <TextInput
        style={{
          backgroundColor: themeColor.bg2,
          borderRadius: 6,
          paddingHorizontal: 12,
          paddingVertical: 10,
          fontSize: 14,
          color: themeColor.text5,
          marginTop: 6,
        }}
        value={value}
        onChangeText={onChange}
        placeholderTextColor={themeColor.text2}
      />
    </View>
  );

  const save = async () => {
    await saveProfile({
      ...p,
      birthday,
    });
    Toast.success("已保存");
    navigate.goBack();
  };

  return (
    <>
    <ScrollView
      style={{ backgroundColor: "#EDEDED", flex: 1 }}
      contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
    >
      <View style={{ backgroundColor: "#fff", borderRadius: 8, padding: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={{ flex: 1, fontSize: 15, color: themeColor.text5 }}>
            头像
          </Text>
          <TouchableOpacity onPress={pickAvatar}>
            <Image
              source={
                p.avatar
                  ? { uri: p.avatar }
                  : require("../../../../../assets/avatar-default.jpeg")
              }
            style={{ width: 56, height: 56, borderRadius: 14 }}
            />
          </TouchableOpacity>
        </View>
        {field("名字", p.name, (v) => setP({ ...p, name: v }))}
        <View style={{ marginTop: 12 }}>
          <Text style={{ color: themeColor.text3, fontSize: 13 }}>性别</Text>
          <Segment
            options={[
              { label: "男", value: "male" },
              { label: "女", value: "female" },
            ]}
            value={p.gender}
            onChange={(v) =>
              setP({ ...p, gender: v as UserProfile["gender"] })
            }
          />
          <Text style={{ color: themeColor.text2, fontSize: 12, marginTop: 4 }}>
            性别会作为角色了解你的信息之一
          </Text>
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginTop: 12,
            paddingVertical: 8,
          }}
        >
          <Text style={{ flex: 1, color: themeColor.text3, fontSize: 13 }}>
            生日
          </Text>
          {birthday ? (
            <TouchableOpacity
              onPress={() => setBirthday(undefined)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text
                style={{
                  color: themeColor.text2,
                  fontSize: 13,
                  marginRight: 12,
                }}
              >
                清除
              </Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={() => setBirthPickerVisible(true)}>
            <Text
              style={{
                color: birthday ? themeColor.text5 : themeColor.text2,
                fontSize: 15,
              }}
            >
              {formatBirthday(birthday)}
            </Text>
          </TouchableOpacity>
        </View>
        <View>
          <Text style={{ color: themeColor.text2, fontSize: 12 }}>
            生日当天，你添加的好友会陆续送来祝福（可留空）
          </Text>
        </View>
        {field("账号", p.wechatId, (v) => setP({ ...p, wechatId: v }))}
        <TouchableOpacity
          onPress={() => navigate.navigate("pages/me/screens/my-qrcode/index")}
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginTop: 14,
            paddingVertical: 8,
          }}
        >
          <Text style={{ flex: 1, fontSize: 15, color: themeColor.text5 }}>
            我的二维码
          </Text>
          <ArrowRightIcon fill={themeColor.text3} width={14} height={14} />
        </TouchableOpacity>
      </View>

      <View style={{ backgroundColor: "#fff", borderRadius: 8, padding: 14, marginTop: 12 }}>
        <Text style={{ fontSize: 15, color: themeColor.text5, fontWeight: "600" }}>
          拍一拍
        </Text>
        {field(
          "角色拍我时的内容",
          p.patContent,
          (v) => setP({ ...p, patContent: v })
        )}
        <Text style={{ color: themeColor.text2, fontSize: 12, marginTop: 4 }}>
          角色拍回来时显示：可莉拍了拍我的{p.patContent || "（留空则显示：可莉拍了拍我）"}
        </Text>
      </View>

      <TouchableOpacity
        onPress={save}
        style={{
          backgroundColor: themeColor.primary,
          paddingVertical: 12,
          borderRadius: 6,
          alignItems: "center",
          marginTop: 24,
        }}
      >
        <Text style={{ color: "#fff", fontSize: 16 }}>保存</Text>
      </TouchableOpacity>
    </ScrollView>
    <BirthdayPicker
      visible={birthPickerVisible}
      value={birthday}
      onConfirm={setBirthday}
      onClose={() => setBirthPickerVisible(false)}
    />
    </>
  );
};

export default Profile;
