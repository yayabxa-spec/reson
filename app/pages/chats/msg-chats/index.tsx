import {
  Animated,
  Dimensions,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Image,
  View,
} from "react-native";
import EmojiPicker from "rn-emoji-keyboard";
import DeviceInfo from "react-native-device-info";
import * as DocumentPicker from "expo-document-picker";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  router,
  useFocusEffect,
  useLocalSearchParams,
  useNavigation,
} from "expo-router";
import {
  createRef,
  useCallback,
  Fragment,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useEffect,
} from "react";
import ThreeDot from "../../../../assets/icon/three-dot.svg";
import GoBack from "../../../../assets/icon/common/go-back.svg";
import FnKeyBoard, { FN_TYPE_MAPS } from "../../../component/business/FnKeyBoard";
import PrivateChatList from "./component/ChatList";
import ChatInput from "./component/ChatInput";
import { useTheme } from "../../../../theme/useTheme";
import { useUser } from "../../../store/user";
import { useChatList } from "../../../store/chatList";
import { useTranslation } from "react-i18next";
import ActionSheet, { ActionSheetAction } from "../../../component/base/ActionSheet";
import { TNavigationOptions } from "../../../component/complex/CommonNavigateTitle";
import { getSize } from "../../../../utils.ts";
import MemberList from "./component/MemberList";
import Toast from "../../../component/base/Toast";
import * as Clipboard from "expo-clipboard";
import { addFavorite } from "../../../store/favorites";
import MsgActionMenu from "../../../component/business/MsgActionMenu";
import { hapticMedium } from "../../../utils/haptics";
import { useLoadingStore } from "../../../store/globalLoading";
import {
  useLocalChat,
  LocalMsg,
  sendLocalMessage,
  isPendingReply,
  unhideConversation,
  readConversationsRaw,
  recallLocalMessage,
  canRecallMessage,
} from "../../../store/localChat";
import {
  resolveChatBg,
  type ChatBg as ChatBgConfig,
} from "../../../store/chatBg";
import ChatBgLayer from "../../../component/complex/ChatBgLayer";
import eventBus from "../../../utils/eventBus";
import {
  readWorldlineRaw,
  getRoleStatusShort,
} from "../../../store/roleStatus";
import { checkDueProactiveTasks } from "../../../store/proactive";
import { cancelConvoNotifications } from "../../../store/notifications";
import { setActiveConvo, markConversationRead } from "../../../store/unread";
import {
  GlassInputBar,
} from "../../../component/complex/LiquidGlass";
const _270 = getSize(130);

const Page = () => {
  const screenHeight = Dimensions.get("screen").height - 300;
  const navigate = useNavigation();
  // 获取设备型号
  const deviceModel = DeviceInfo.getModel();
  const [visible, setVisible] = useState(false);
  const [memberListVisible, setMemberListVisible] = useState(false);
  const [fnOpen, setFnOpen] = useState(false);
  const [replyToMsg, setReplyToMsg] = useState<LocalMsg | null>(null);
  const [msgMenuMsg, setMsgMenuMsg] = useState<LocalMsg | null>(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [expandedVoiceId, setExpandedVoiceId] = useState<string | null>(null);
  const { themeColor, skinId } = useTheme();
  const [msg, setMsg] = useState("");
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const heightValue = useRef(new Animated.Value(10)).current;
  const height = useRef(0);
  const flatListRef = useRef<FlatList>();
  const { userInfo } = useUser().userStore;
  const { setLoadingStore } = useLoadingStore();
  const { chatListStore } = useChatList();
  const { loadMessages, getAIConfig } = useLocalChat();
  const [messages, setMessages] = useState<LocalMsg[]>([]);
  const [isAITyping, setIsAITyping] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [groupTypingName, setGroupTypingName] = useState<string | null>(null);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  // 自定义聊天背景（会话覆盖优先于全局，原图直接铺）
  const [chatBg, setChatBg] = useState<ChatBgConfig | null>(null);
  // 最近一次撤回：气泡下的"重新编辑"链接（10 分钟内有效）
  const [recallEdit, setRecallEdit] = useState<{
    recallMsgId: string;
    content: string;
  } | null>(null);
  const params = useLocalSearchParams<{
    convoId: string;
    chatType: string;
    msgId?: string;
  }>();
  const convoId = useMemo(() => {
    return chatListStore.curConvo?.convoId || params.convoId;
  }, [chatListStore.curConvo, params.convoId]);
  const { t } = useTranslation();
  const [fallbackConvo, setFallbackConvo] = useState<any>(null);
  const curReceiverInfo = useMemo(() => {
    return chatListStore.curConvo?.curReceiverInfo;
  }, [chatListStore]);
  const convoInfo = chatListStore.curConvo || fallbackConvo;
  const aiAvatar = convoInfo?.roleAvatar || undefined;
  const aiAvatarName =
    convoInfo?.remark ||
    convoInfo?.roleName ||
    convoInfo?.title ||
    "";

  // 深链/桌面快捷方式直接打开时没有 curConvo，从会话数据兜底
  useEffect(() => {
    if (!convoId || chatListStore.curConvo) return;
    readConversationsRaw().then((list) => {
      const c = list.find((x) => x.id === convoId);
      if (c) setFallbackConvo(c);
    });
  }, [convoId]);

  // 页面获得焦点时重新加载消息（处理"后台收到新消息后回到页面"的场景）
  useFocusEffect(
    useCallback(() => {
      if (!convoId) return;
      loadMessages(convoId)
        .then((list) => {
          setMessages(list);
          setMessagesLoaded(true);
        })
        .catch(() => {});
    }, [convoId, loadMessages])
  );

  // 聊天背景：进入页面/设置变化时刷新
  useFocusEffect(
    useCallback(() => {
      resolveChatBg(convoId || undefined).then((bg) => setChatBg(bg));
      const handler = () =>
        resolveChatBg(convoId || undefined).then((bg) => setChatBg(bg));
      eventBus.on("chat-bg-updated", handler);
      return () => {
        eventBus.off("chat-bg-updated", handler);
      };
    }, [convoId])
  );

  useEffect(() => {
    if (!convoId) return;
    setActiveConvo(convoId);
    markConversationRead(convoId).catch(() => {});
    // 已读：移除该会话的通知栏通知和未触发的定时通知
    cancelConvoNotifications(convoId).catch(() => {});
    unhideConversation(convoId).catch(() => {}); // 从通讯录进入时让隐藏会话重新出现
    setIsAITyping(isPendingReply(convoId));
    setMessagesLoaded(false);
    setMessages([]);
    loadMessages(convoId).then((list) => {
      setMessages(list);
      setMessagesLoaded(true);
    });
    // 进入会话时触发已到期的主动消息
    checkDueProactiveTasks().catch(() => {});
    return () => setActiveConvo(null);
  }, [convoId]);

  useEffect(() => {
    if (!convoId) return;
    const handler = (updatedConvoId: string) => {
      if (updatedConvoId !== convoId) return;
      setIsAITyping(isPendingReply(convoId));
      loadMessages(convoId).then((list) => setMessages(list));
    };
    eventBus.on("local-chat-updated", handler);
    return () => {
      eventBus.off("local-chat-updated", handler);
    };
  }, [convoId]);

  // 群聊"正在输入"分角色（一次一个角色依次回复）
  useEffect(() => {
    if (!convoId || !convoInfo?.isGroup) return;
    const handler = (e: {
      convoId: string;
      name: string;
      active: boolean;
    }) => {
      if (e.convoId !== convoId) return;
      setGroupTypingName(e.active ? e.name : null);
    };
    eventBus.on("group-typing", handler);
    return () => {
      eventBus.off("group-typing", handler);
    };
  }, [convoId, convoInfo?.isGroup]);

  // 语音消息：合成/讲话中显示"对方正在讲话"
  useEffect(() => {
    if (!convoId) return;
    const onStart = (e: { convoId: string }) => {
      if (e.convoId === convoId) setAiSpeaking(true);
    };
    const onEnd = (e: { convoId: string }) => {
      if (e.convoId === convoId) setAiSpeaking(false);
    };
    eventBus.on("ai-speaking", onStart);
    eventBus.on("ai-speaking-end", onEnd);
    return () => {
      eventBus.off("ai-speaking", onStart);
      eventBus.off("ai-speaking-end", onEnd);
    };
  }, [convoId]);

  const onSend = useCallback(async () => {
    const trimmed = (msg || "").trim();
    if ((!trimmed && pendingImages.length === 0) || !convoId) return;
    if (isPendingReply(convoId)) {
      Toast.info("正在回复中，请稍候");
      return;
    }
    setMsg("");
    const cfg = await getAIConfig();
    sendLocalMessage(convoId, trimmed, cfg, {
      images: pendingImages.length ? pendingImages : undefined,
      ...(replyToMsg
        ? {
            replyTo: {
              content: replyToMsg.content,
              senderName: replyToMsg.senderName,
            },
          }
        : {}),
    });
    setReplyToMsg(null);
    setPendingImages([]);
  }, [msg, pendingImages, convoId, getAIConfig, replyToMsg]);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [roleStatusText, setRoleStatusText] = useState("");
  const roleId = convoInfo?.roleId as string | undefined;

  // 角色状态：随世界线/时段变化刷新（5 分钟一次 + 世界线更新时）
  useEffect(() => {
    if (!roleId) {
      setRoleStatusText("");
      return;
    }
    const load = () => {
      readWorldlineRaw()
        .then((wl) => setRoleStatusText(getRoleStatusShort(wl, roleId)))
        .catch(() => {});
    };
    load();
    const wlHandler = () => load();
    eventBus.on("worldline-updated", wlHandler);
    const timer = setInterval(load, 2 * 60 * 1000);
    return () => {
      eventBus.off("worldline-updated", wlHandler);
      clearInterval(timer);
    };
  }, [roleId]);

  const title = useMemo(() => {
    if (params.chatType === "isGroup") {
      const groupName = chatListStore.curConvo?.groupName;
      const memberCount =
        chatListStore.curConvo?.memberNames?.length ||
        chatListStore.curConvo?.convoMember?.length ||
        0;
      return t(
        (groupName ? groupName : "Group chat") +
          "(" +
          memberCount +
          ")"
      );
    }
    return curReceiverInfo?.act;
  }, [params, curReceiverInfo, chatListStore.curConvo]);

  const startAnimation = (toValue) => {
    Animated.timing(heightValue, {
      toValue,
      duration: toValue === 0 ? 0 : 100, // 动画持续时间
      useNativeDriver: false, // 在 Android 上需要设置为 false
    }).start();
  };

  Keyboard.addListener("keyboardWillShow", () => {
    startAnimation(0);
  });

  const setH = () => {
    Keyboard.dismiss();
    if (height.current === _270) {
      startAnimation(0);
      height.current = 0;
      setFnOpen(false);
      return;
    }

    height.current = _270;
    startAnimation(_270);
    setFnOpen(true);
  };

  const VideoCallActions = [
    {
      name: t("📹 Video Call"),
      callback: () => {
        Toast.info("视频通话暂未支持");
      },
    },
    {
      name: t("🔊 Voice Call"),
      callback: () => {
        Toast.info("语音通话暂未支持");
      },
    },
  ];
  const LocationActions = [
    {
      name: t("Send Location"),
      callback: () => {
        Toast.info("位置消息暂未支持");
      },
    },
    {
      name: t("Real-time Location"),
      callback: () => {
        Toast.info("实时位置暂未支持");
      },
    },
  ];
  const [defaultActions, setDefaultActions] =
    useState<ActionSheetAction[]>(VideoCallActions);

  const onClose = () => {
    setVisible(false);
  };
  useLayoutEffect(() => {
    navigate.setOptions({
      headerShown: true,
      headerShadowVisible: false,
      headerBackVisible: false,
      headerStyle: { backgroundColor: themeColor.fillColor },
      headerTintColor: themeColor.bg5,
      headerRight: () => (
        <TouchableOpacity
          onPress={() =>
            navigate.navigate("pages/chats/screens/chat-info/index")
          }
        >
          <ThreeDot />
        </TouchableOpacity>
      ),
      headerLeftContainerStyle: { paddingLeft: 12 },
      headerTitle: () => {
        return (
          <TouchableOpacity
            onPress={() => {
              setMemberListVisible(true);
            }}
          >
            <View style={{ alignItems: "center" }}>
              <Text
                style={{
                  color: themeColor.bg5,
                  fontSize: isAITyping || aiSpeaking ? 15 : 18,
                  fontWeight: "bold",
                }}
              >
                {groupTypingName
                  ? `${groupTypingName} 正在输入…`
                  : aiSpeaking
                  ? "对方正在讲话…"
                  : isAITyping
                  ? "对方正在输入…"
                  : title}
              </Text>
              {!params.chatType &&
              !groupTypingName &&
              !aiSpeaking &&
              !isAITyping &&
              roleStatusText ? (
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 10,
                    color: themeColor.text3,
                    marginTop: 1,
                    maxWidth: 180,
                  }}
                >
                  {roleStatusText}
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>
        );
      },
      headerTitleAlign: "center",
      headerLeft: () => {
        return (
          <TouchableOpacity
            style={{ flexDirection: "row", alignItems: "center" }}
            onPress={() => {
              router.back();
            }}
          >
            <GoBack width={24} height={24} />
          </TouchableOpacity>
        );
      },
      headerRightContainerStyle: { paddingRight: 12 },
    } as TNavigationOptions);
  }, [isAITyping, aiSpeaking, title, groupTypingName, roleStatusText, skinId, themeColor]);
  const ChatInputRef = useRef<TextInput>(null);
  // 玻璃皮肤下输入区（引用条/图片条/输入行）包进玻璃面板；其他皮肤保持原结构
  const InputSurface: any = skinId === "glass" ? GlassInputBar : Fragment;
  const insertAt = useCallback(
    (name: string) => {
      setMsg((prev) => (prev ? prev + " " : "") + "@" + name + " ");
      setTimeout(() => ChatInputRef.current?.focus(), 60);
    },
    []
  );
  return (
    <SafeAreaView
      style={{
        backgroundColor: skinId === "glass" ? "transparent" : themeColor.fillColor,
        flex: 1,
      }}
      edges={["bottom"]}
    >
      {/* 自定义聊天背景（原图直接铺，铺在输入栏和消息区下面） */}
      <View
        pointerEvents="none"
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
      >
        <ChatBgLayer bg={chatBg} />
      </View>
      {/* 顶栏下方细线（对齐原版微信） */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: StyleSheet.hairlineWidth,
          backgroundColor: "#C8C9CC",
          zIndex: 20,
        }}
      />
      <MemberList
        memberListVisible={memberListVisible}
        onClose={() => {
          setMemberListVisible(false);
        }}
      />
      <ActionSheet
        style={{
          backgroundColor: themeColor.white,
          borderRadius: 8,
        }}
        visible={visible}
        actions={defaultActions}
        onClose={onClose}
        cancelText={t("Cancel")}
        onCancel={onClose}
      />
      <MsgActionMenu
        visible={!!msgMenuMsg}
        x={menuPos.x}
        y={menuPos.y}
        options={[
          ...(msgMenuMsg?.audio
            ? [
                {
                  text: "转文字",
                  onPress: () => {
                    const m = msgMenuMsg;
                    if (m) {
                      // 语音条下方展开/收起对应文字
                      setExpandedVoiceId((cur) =>
                        cur === m.id ? null : m.id
                      );
                      setMsgMenuMsg(null);
                    }
                  },
                },
              ]
            : [
                {
                  text: "复制",
                  onPress: async () => {
                    const m = msgMenuMsg;
                    if (m) {
                      await Clipboard.setStringAsync(m.content);
                      Toast.success("已复制");
                    }
                  },
                },
              ]),
          {
            text: "收藏",
            onPress: async () => {
              const m = msgMenuMsg;
              if (m) {
                const ok = await addFavorite({
                  convoId,
                  roleName:
                    convoInfo?.roleName ||
                    convoInfo?.title ||
                    (m.role === "user" ? "我" : "角色"),
                  msgId: m.id,
                  content: m.content,
                  audio: m.audio,
                });
                Toast.success(ok ? "已收藏" : "已在收藏中");
              }
            },
          },
          ...(msgMenuMsg?.audio
            ? []
            : [
                {
                  text: "引用",
                  onPress: () => {
                    const m = msgMenuMsg;
                    if (m) {
                      setReplyToMsg(m);
                      ChatInputRef.current?.focus();
                    }
                  },
                },
              ]),
          // 撤回：仅自己发的消息且在 2 分钟内（微信规则）
          ...(msgMenuMsg && canRecallMessage(msgMenuMsg)
            ? [
                {
                  text: "撤回",
                  onPress: async () => {
                    const m = msgMenuMsg;
                    if (!m || !convoId) return;
                    const res = await recallLocalMessage(convoId, m.id);
                    if (res.ok) {
                      hapticMedium();
                      Toast.success("已撤回");
                      setRecallEdit(
                        res.content?.trim()
                          ? {
                              recallMsgId: "recall-" + m.id,
                              content: res.content,
                            }
                          : null
                      );
                    } else {
                      Toast.info(res.reason || "无法撤回");
                    }
                  },
                },
              ]
            : []),
        ]}
        onClose={() => setMsgMenuMsg(null)}
      />
      <KeyboardAvoidingView
        style={{
          // backgroundColor: "yellow",
          flex: 1,
        }}
        keyboardVerticalOffset={Platform.OS === "ios" ? screenHeight * 0.15 : 0}
        behavior={Platform.OS === "ios" ? "padding" : ""}
      >
        {/* 聊天content  */}
        {/* 聊天列表 */}
        <TouchableWithoutFeedback
          onPress={() => {
            // 点击消息区（面板外）任意位置收起功能面板/表情面板
            if (fnOpen) {
              setH();
            } else if (isOpen) {
              setIsOpen(false);
            }
          }}
        >
          <View style={{ flex: 1, overflow: "scroll" }}>
            <PrivateChatList
              messages={messages}
              loaded={messagesLoaded}
              isAITyping={isAITyping}
              aiAvatar={aiAvatar}
              aiAvatarName={aiAvatarName}
              panelOpen={fnOpen}
              expandedVoiceId={expandedVoiceId}
              onMsgLongPress={(m, x, y) => {
                hapticMedium();
                setMsgMenuMsg(m);
                setMenuPos({ x, y });
              }}
              groupMemberInfos={chatListStore.curConvo?.memberInfos}
              roleId={convoInfo?.roleId}
              convoId={convoId}
              targetMsgId={params.msgId}
              recallEditId={recallEdit?.recallMsgId || null}
              onRecallEdit={() => {
                if (!recallEdit) return;
                setMsg(recallEdit.content);
                setTimeout(() => ChatInputRef.current?.focus(), 60);
              }}
              onAtMember={insertAt}
          />
        </View>
        </TouchableWithoutFeedback>
        {/* <View
          style={{ width: "100%", height: 10, backgroundColor: "purple" }}
        ></View> */}
        {/* keyboard 内容 */}
        <InputSurface>
        {replyToMsg && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: skinId === "glass" || chatBg ? "transparent" : themeColor.white,
              paddingHorizontal: 12,
              paddingVertical: 6,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                numberOfLines={1}
                style={{ fontSize: 12, color: themeColor.text3 }}
              >
                引用：
                {replyToMsg.senderName ? replyToMsg.senderName + "：" : ""}
                {replyToMsg.content}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setReplyToMsg(null)}
              style={{ padding: 4, marginLeft: 8 }}
            >
              <Text style={{ color: themeColor.text3, fontSize: 16 }}>×</Text>
            </TouchableOpacity>
          </View>
        )}
        {pendingImages.length > 0 && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: skinId === "glass" || chatBg ? "transparent" : themeColor.white,
              paddingHorizontal: 12,
              paddingVertical: 6,
              gap: 6,
            }}
          >
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
              {pendingImages.map((uri, idx) => (
                <View key={idx} style={{ position: "relative", marginRight: 4 }}>
                  <Image
                    source={{ uri }}
                    style={{ width: 56, height: 56, borderRadius: 8 }}
                    resizeMode="cover"
                  />
                  <TouchableOpacity
                    onPress={() => setPendingImages(prev => prev.filter((_, i) => i !== idx))}
                    style={{ position: "absolute", top: -4, right: -4, width: 18, height: 18, borderRadius: 9, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" }}
                  >
                    <Text style={{ color: "#fff", fontSize: 12 }}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity
              onPress={() => setPendingImages([])}
              style={{ padding: 8, marginLeft: 8 }}
            >
              <Text style={{ color: themeColor.text3, fontSize: 18 }}>×</Text>
            </TouchableOpacity>
          </View>
        )}
        <ChatInput
          ref={ChatInputRef}
          transparent={!!chatBg || skinId === "glass"}
          emojiPress={() => {
            // console.log("333");
            setIsOpen(true);
            setFnOpen(false);
          }}
          onVoiceEnd={async (uri) => {
            Toast.info("语音消息暂未支持");
          }}
          value={msg}
          onChangeText={(val: string) => {
            setMsg(() => val);
          }}
          onFocus={() => {
            startAnimation(0);

            // console.log(flatListRef.current?.props, "flatListRef");
            // flatListRef.current?.scrollToIndex({ animated: true, index: 0 });
          }}
          onEndEditing={() => {
            if (!convoId) {
              return;
            }
            onSend();
          }}
          chatPress={() => {
          }}
          plusPress={() => {
            setH();
          }}
        />
        </InputSurface>
        <EmojiPicker
          disabledCategories={[]}
          defaultHeight={"30%"}
          categoryPosition={"top"}
          onEmojiSelected={(emojiSelectedData) => {
            // {"emoji": "🤗", "name": "smiling face with open hands",
            //  "slug": "smiling_face_with_open_hands",
            //   "toneEnabled": false, "unicode_version": "1.0"}
            // console.log(emojiSelectedData, "emojiSelectedData");
            setMsg((val: string) => (val += emojiSelectedData.emoji + ""));
            ChatInputRef.current?.setVoiceInput(false);
            setTimeout(() => {
              ChatInputRef.current?.focus();
            }, 100);
          }}
          open={isOpen}
          onClose={() => setIsOpen(false)}
        />
        {fnOpen && (
          <FnKeyBoard
            heightValue={heightValue}
            handlers={({ type, val }: { type: string; val: any }) => {
              if (type === FN_TYPE_MAPS.Album) {
              if (Array.isArray(val)) {
                  setPendingImages(val.map((img: any) => img.uri).filter(Boolean).slice(0, 9));
                } else if (val?.uri) {
                  setPendingImages([val.uri]);
                  setFnOpen(false);
                }
              } else if (type === FN_TYPE_MAPS.Camera) {
                if (val) {
                  setPendingImages([val]);
                  setFnOpen(false);
                }
              } else if (type === FN_TYPE_MAPS.Favorites) {
                router.push('/pages/me/screens/favorites');
                setFnOpen(false);
              } else if (type === "File") {
                DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true }).then(res => {
                  if (!res.canceled && res.assets?.[0]?.uri) {
                    setPendingImages([res.assets[0].uri]);
                    setFnOpen(false);
                  }
                }).catch(() => {});
              } else if (type === FN_TYPE_MAPS.VideoCall) {
                setVisible(!visible);
                setDefaultActions(VideoCallActions);

                setH();
              } else if (type === FN_TYPE_MAPS.Location) {
                Toast.info("位置消息暂未支持");
              }
            }}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};
export default Page;
