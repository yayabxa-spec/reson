import Popup from "../../../../component/base/Popup";
import UserAvatar from "../../../../component/complex/UserAvatar";
import RoleAvatar from "../../../../component/complex/RoleAvatar";
import { useChatList } from "../../../../store/chatList";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { getSize } from "../../../../../utils.ts";
const MemberLIst = ({ memberListVisible, onClose }) => {
  const { chatListStore } = useChatList();
  const { t } = useTranslation();
  return (
    <Popup
      visible={memberListVisible}
      position="top"
      closeable
      onClose={onClose}
    >
      <View
        style={{
          width: getSize(375),
          padding: 24,
          paddingTop: 80,
          backgroundColor: "white",
        }}
      >
        {chatListStore.curConvo?.memberInfos?.length ? (
          chatListStore.curConvo.memberInfos.map((m) => (
            <View className="items-center flex-row my-1" key={m.roleId}>
              <RoleAvatar avatar={m.avatar} name={m.name} size={40} />
              <Text style={{ marginLeft: 12 }}>{m.name}</Text>
            </View>
          ))
        ) : (
          chatListStore.curConvo?.convoMember?.map?.((user) => {
            return (
              <View className="items-center flex-row my-1" key={user._id}>
                <UserAvatar source={{ uri: user.image }} />
                <Text style={{ marginLeft: 12 }}>{user.act}</Text>
              </View>
            );
          })
        )}
        <Text style={{ textAlign: "center" }}>
          {t("total member:")}
          {chatListStore.curConvo?.memberInfos?.length ||
            chatListStore.curConvo?.convoMember?.length ||
            0}
        </Text>
      </View>
    </Popup>
  );
};
export default MemberLIst;
