import { useFocusEffect, useIsFocused, useNavigation } from "expo-router";
import {
  useContext,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { TouchableOpacity, View } from "react-native";
import ConvoList from "./component/ChatList";
import PlusMenu from "./component/PlusMenu";
import ConvoLongPressMenu from "./component/ConvoLongPressMenu";
import HeaderPlus from "../../component/base/HeaderPlus";
import { useTheme } from "../../../theme/useTheme";
import Dialog from "../../component/base/Dialog";
import WeChatDialog from "../../component/base/WeChatDialog";
import { PusherContext } from "../../hooks/usePusherProvider";
import { useUser } from "../../store/user";
import { PortalRef } from "../../_layout";
import PhoneCalling, { portalKey } from "../../component/complex/PhoneCalling";
import { playSound } from "../../../utils.ts";
import { checkDueProactiveTasks } from "../../store/proactive";
import { dispatchWorldline } from "../../store/worldline";
import { hapticLight, hapticMedium } from "../../utils/haptics";
import { PageSource } from "../../component/complex/NativeBackdrop";
import { GlassDiyBackdrop } from "../../component/complex/GlassDiyBackdrop";
import { DIYThemeProvider } from "../../../theme/useTheme";

const Chats = () => {
  const pusherContext = useContext(PusherContext);
  const socket = pusherContext.socket;
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuItem, setMenuItem] = useState<any | null>(null);
  const [groupConfirm, setGroupConfirm] = useState(false);
  const navigate = useNavigation();
  const { userStore } = useUser();
  const userId = useMemo(() => userStore.userInfo?._id || "", [userStore]);
  const { themeColor, skinId } = useTheme();
  const isFocused = useIsFocused();
    const select = (text: string) => {
    if (text === "发起群聊") {
      setGroupConfirm(true);
    } else if (text === "添加朋友") {
      navigate.navigate("pages/contacts/screens/add-contacts/index");
    }
  };

  useLayoutEffect(() => {
    navigate.setOptions({
      headerTitle: "聊天",
      headerRight: () => (
        <HeaderPlus onPress={() => {
          hapticLight();
          setMenuVisible((v) => !v);
        }} />
      ),
      headerRightContainerStyle: { paddingRight: 12 },
    });
  }, []);

  useEffect(() => {
    socket?.on(
      "pre-call",
      async (preCallData: { to: string; from: string }) => {
        const { to, from } = preCallData;
        const rejectHandler = () => {
          socket?.emit("pre-call-answer", {
            answer: false,
            to: from,
            from: to,
          });
        };
        const answerHandler = () => {
          navigate.navigate("pages/chats/screens/video-call-rec/index", {
            answer: true,
            to,
            from,
          });
          setTimeout(() => {
            socket?.emit("pre-call-answer", {
              answer: true,
              to: from,
              from: to,
            });
          }, 400);
        };
        PortalRef.current?.addPortal(
          "PhoneCalling",
          <PhoneCalling
            callUserId={from}
            rejectHandler={rejectHandler}
            answerHandler={answerHandler}
          />
        );
        return;
        await Dialog.confirm({
          overlay: true,
          cancelButtonText: "拒接",
          confirmButtonText: "接听",
          title: "from：" + preCallData?.from,
          message: "to：" + preCallData?.to,
        })
          .then(() => {
            answerHandler();
          })
          .catch(() => {
            rejectHandler();
          });
      }
    );
  }, [socket]);

  useEffect(() => {
    const unsubscribeFocus = navigate.addListener("focus", () => {
      checkDueProactiveTasks().catch(() => {});
      dispatchWorldline().catch(() => {});
    });
    return () => {
      unsubscribeFocus();
    };
  }, [navigate, userId]);

  useFocusEffect(
    useCallback(() => {
      return () => setMenuVisible(false);
    }, [])
  );

  useEffect(() => {
      pusherContext.socket?.on("convo:update", () => {
        if (!navigate.isFocused()) return;
        playSound();
      });
  }, [pusherContext.socket, navigate, userId]);

  return (
    <>
      <PageSource
        enabled={skinId === "glass"}
        sourceId="page-index"
        active={isFocused}
      >
      <DIYThemeProvider route="index">
      <GlassDiyBackdrop route="index" />
      <View style={{ backgroundColor: themeColor.surfaceContainerLow, flex: 1 }}>
        <ConvoList
        onLongPressItem={(item) => {
          hapticMedium();
          setMenuItem(item);
        }}
      />
      </View>
      </DIYThemeProvider>
      </PageSource>
      <PlusMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        onSelect={select}
      />
      <ConvoLongPressMenu item={menuItem} onClose={() => setMenuItem(null)} />
      <WeChatDialog
        visible={groupConfirm}
        title="发起群聊"
        message="此功能还在调试中，可能出现不稳定的情况"
        confirmText="我知道了"
        countdown={3}
        backdropClosable={false}
        onBackdropPress={() => setGroupConfirm(false)}
        onConfirm={() => {
          setGroupConfirm(false);
          navigate.navigate("pages/chats/screens/create-group/index");
        }}
      />
    </>
  );
};

export default Chats;
