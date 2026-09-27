import { Text, View, Image, TouchableOpacity } from "react-native";
import { getSize } from "../../../../utils.ts";
import { useNavigation } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../../../theme/useTheme";
import { useUser } from "../../../store/user";
import TransferCard from "./component/TransferCard";
import { getMsgTypeMap } from "./component/common";
import React, { useMemo, useRef } from "react";
import CopyOutline from "../../../../assets/icon/chats/copy-outline.svg";
import PreviousOutline from "../../../../assets/icon/chats/previous-outline.svg";
import * as Clipboard from "expo-clipboard";

import {
  Popover,
  PopoverAction,
  PopoverInstance,
} from "../../base/Popover";
import Toast from "../../base/Toast";
import useSendMsg from "../../../hooks/useSendMsg";
import { useChatList } from "../../../store/chatList";
import VoiceCard from "./component/VoiceCard";
import ImageCard from "./component/ImageCard";
import LocationCard from "./component/LocationCard";
import RealTimeLocationCard from "./component/RealTimeLocationCard";
import { useFontScale } from "../../../hooks/useFontScale";
const MsgWrapper = React.memo(
  ({
    msgType = "text",
    type = "left",
    userName = "",
    text,
    msgId,
    msgSenderId,
    onLongPress,
    caption,
    showCaption,
  }: {
    type?: "left" | "right";
    text: string;
    msgId: string;
    // if userName is not null then its group chat
    userName?: string;
    msgSenderId: string;
    msgType: string;
    onLongPress?: (e?: any) => void;
    caption?: string;
    showCaption?: boolean;
  }) => {
    const { sendMsgHandler } = useSendMsg();
    const { chatListStore } = useChatList();
    const { themeColor } = useTheme();
    const fontScale = useFontScale();
    const userInfo = useUser().userStore.userInfo;
    const msgTypeMap = getMsgTypeMap(themeColor);
    const navigator = useNavigation();
    const { t } = useTranslation();
    const popover = useRef<PopoverInstance>(null);
    const iconActions: PopoverAction[] = useMemo(() => {
      const iconActionsList = [
        {
          text: t("Recall"),
          icon: (
            <PreviousOutline width={20} height={20} fill={themeColor.white} />
          ),
        },
        {
          text: t("Copy"),
          icon: <CopyOutline width={20} height={20} fill={themeColor.white} />,
        },
      ];
      if (msgSenderId + "" !== userInfo?._id + "") {
        iconActionsList.shift();
      }
      return iconActionsList;
    }, [msgSenderId]);
    const select = async (option: PopoverAction) => {
      Toast.info(option.text);
      if (option.text === "Recall") {
        sendMsgHandler({
          val: "recallMsg+" + "recalled+" + msgId,
          userId: userInfo?._id + "",
          type: "recallMsg",
          convoId: chatListStore.curConvo?.convoId + "",
          doneHandler: () => {},
        });
        return;
      }
      await Clipboard.setStringAsync(text);
      Toast.success("copied");
      popover.current?.hide();
    };
    const TextWrapper = ({ children }) => {
      return (
        <View
          key={msgId}
          style={[
            msgTypeMap[
              type === "left" ? "itemLeftWrapper" : "itemRightWrapper"
            ],
            {
              alignSelf: "flex-start",
              maxWidth: getSize(250),
              // padding算距离
              borderRadius: 4,
              position: "relative",
            },
          ]}
        >
          {children}
        </View>
      );
    };
    // transId+amount+userid
    const getContent = () => {
      // console.log(msgType, "msgType");

      // move to chatlisht component
      // if (msgType === "recallMsg") {
      //   return (
      //     <Text style={{ padding: 12, justifyContent: "center" }}>
      //       {t("recalled a message")}
      //     </Text>
      //   );
      // }
      if (msgType === "location") {
        return <LocationCard popover={popover} text={text} />;
      }
      if (msgType === "realTimeLocation") {
        // console.log(msgId, "sss");
        return <RealTimeLocationCard msgId={msgId} />;
      }
      if (msgType === "voice") {
        return (
          <VoiceCard
            popover={popover}
            text={text}
            type={type}
            msgId={msgId}
            onLongPress={onLongPress}
            caption={caption}
            showCaption={showCaption}
          />
        );
      }
      if (msgType === "transfer") {
        let accepted = false;
        if (
          // receiver accepted the transfer
          text.includes("[accepted]") ||
          // the originMsg need Update to accepted
          text.includes("isTransferAccepted")
        ) {
          accepted = true;
        }

        const transId = text.split("+")[0];
        const amount = text.split("+")[1];

        return (
          <TransferCard
            onLongPress={() => {
              popover.current?.show();
            }}
            originMsgId={msgId}
            accepted={accepted}
            amount={amount}
            transId={transId}
            msgSenderId={msgSenderId}
            type={type}
          />
        );
      }
      if (msgType === "img") {
        // console.log(text, "text-img");
        return <ImageCard popover={popover} text={text} />;
      }
      return (
        <>
          <View
            style={msgTypeMap[type === "left" ? "itemLeft" : "itemRight"]}
          ></View>
          <TouchableOpacity
            onLongPress={(e) => {
              if (onLongPress) {
                onLongPress(e);
              } else {
                popover.current?.show();
              }
            }}
          >
            <Text
              style={{
                alignSelf: "flex-start",
                marginVertical: 8,
                marginHorizontal: 12,
                fontSize: Math.round(16 * fontScale),
              }}
            >
              {text}
            </Text>
          </TouchableOpacity>
        </>
      );
    };
    return (
      <View key={msgId}>
        <Popover ref={popover} theme="light">
          <View style={{ flexDirection: "row" }}>
            {iconActions.map((action) => {
              return (
                <TouchableOpacity
                  onPress={() => {
                    select(action);
                  }}
                  key={action.text}
                  style={{
                    padding: 12,
                    flexDirection: "row",
                    justifyContent: "flex-start",
                    alignItems: "center",
                  }}
                >
                  {action.icon}
                  <Text
                    style={{
                      fontSize: 16,
                      marginLeft: 8,
                      color: themeColor.white,
                    }}
                  >
                    {action.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Popover>
        {/* show only in group chat  */}
        {userName && (
          <Text
            style={{
              color: themeColor.text3,
              marginVertical: 4,
              marginLeft: 4,
            }}
          >
            {userName}
          </Text>
        )}
        <TextWrapper>{getContent()}</TextWrapper>
      </View>
    );
  }
);
export default MsgWrapper;
