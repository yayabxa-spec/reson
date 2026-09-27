import React, { useEffect } from "react";
import "../i18n";
import { router, Stack, useRootNavigationState } from "expo-router";
import { AppState } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { RecoilRoot } from "recoil";
import * as Notifications from "expo-notifications";
import { ConfigProvider } from "./component/base/ConfigProvider";
import { ThemeProvider as AppThemeProvider } from "../theme/useTheme";
import { prepareNotifications } from "./store/notifications";
import { setAppForeground } from "./store/unread";
import { checkDueProactiveTasks } from "./store/proactive";
import eventBus from "./utils/eventBus";
import { warmupLocalEmbed } from "./utils/localEmbed";
import { precomputeVectors } from "./store/precompute";
import {
  dispatchWorldline,
  ensureWorldlineToday,
} from "./store/worldline";
import { dispatchBirthdayCelebration } from "./store/birthday";
import { generateRoleMoments } from "./store/momentsGen";
import { archiveStaleMemories, dispatchPromiseReminders } from "./store/memory";
import {
  autoBindRoleVoices,
  ensureRolesSeeded,
  maybeRefreshBuiltinRoles,
} from "./store/roles";
import {
  markKeepAliveTick,
  shouldAskAutostart,
  markAutostartAsked,
} from "./store/keepAliveCheck";
import {
  isOobeDone,
  isOobeSkipped,
  hasExistingData,
} from "./store/oobe";
import {
  startKeepAlive,
  stopKeepAlive,
  subscribeKeepAliveTick,
  openAutostartSettings,
  scheduleWakeAlarm,
} from "./utils/keepAlive";
import WeChatDialog from "./component/base/WeChatDialog";
import Oobe from "./oobe";
import KeyboardPad from "./component/base/KeyboardPad";
import { PaperThemeBridge } from "../theme/paper";
import { initLogCollector } from "./utils/logCollector";
import ErrorBoundary from "./component/base/ErrorBoundary";

// 尽早挂载全局日志采集器（hook console，后续所有输出都进环形日志）
initLogCollector();

export { PortalRef } from "./component/base/ConfigProvider";

export default function RootLayout() {
  const rootNavState = useRootNavigationState();
  const navigatorReady = !!rootNavState?.key;
  const [showOobe, setShowOobe] = React.useState(false);
  const [booted, setBooted] = React.useState(false);
  const [askAutostart, setAskAutostart] = React.useState(false);
  const askRef = React.useRef(false);
  const oobeRef = React.useRef(false);

  const maybeAskAutostart = () => {
    if (askRef.current || oobeRef.current) return;
    shouldAskAutostart().then((yes) => {
      if (yes && !oobeRef.current) {
        askRef.current = true;
        setAskAutostart(true);
      }
    });
  };

  const closeAskAutostart = () => {
    askRef.current = false;
    setAskAutostart(false);
  };

  // 启动时也检查一次（刚安装/刚升级回来时）
  useEffect(() => {
    const t = setTimeout(() => {
      if (!showOobe) maybeAskAutostart();
    }, 2500);
    return () => clearTimeout(t);
  }, [showOobe]);

  useEffect(() => {
    // 后台预热本地 embedding（首次会解压模型，约 3-5s），随后空闲预计算向量
    const t = setTimeout(async () => {
      await warmupLocalEmbed().catch(() => {});
      precomputeVectors().catch(() => {});
    }, 3500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    prepareNotifications().catch(() => {});

    // 启动检查：未完成 OOBE 且未跳过 → 先进入引导页
    Promise.all([isOobeDone(), isOobeSkipped(), hasExistingData()])
      .then(([done, skipped, existing]) => {
        const needOobe = !done && !skipped && !existing;
        setShowOobe(needOobe);
        oobeRef.current = needOobe;
        setBooted(true);
      })
      .catch(() => setBooted(true));

    const appStateSub = AppState.addEventListener("change", (state) => {
      const inForeground = state === "active";
      setAppForeground(inForeground);
      if (inForeground) {
        stopKeepAlive();
        // 回到前台：补跑世界线调度（到点的主动消息立即落地）
        dispatchWorldline().catch(() => {});
        dispatchBirthdayCelebration().catch(() => {});
        generateRoleMoments().catch(() => {});
        checkDueProactiveTasks().catch(() => {});
        dispatchPromiseReminders().catch(() => {});
        maybeAskAutostart();
      } else {
        startKeepAlive();
      }
    });

    // 后台心跳：保活服务每 60 秒唤醒一次 JS，处理到点的主动消息
    const unsubTick = subscribeKeepAliveTick(() => {
      markKeepAliveTick().catch(() => {});
      dispatchWorldline().catch(() => {});
      dispatchBirthdayCelebration().catch(() => {});
      generateRoleMoments().catch(() => {});
      checkDueProactiveTasks().catch(() => {});
      dispatchPromiseReminders().catch(() => {});
    });

    // 前台定时巡检：每 30 分钟判断一次是否有角色想主动找用户
    const interval = setInterval(() => {
      dispatchWorldline().catch(() => {});
      dispatchBirthdayCelebration().catch(() => {});
      generateRoleMoments().catch(() => {});
      dispatchPromiseReminders().catch(() => {});
    }, 30 * 60 * 1000);

    // 启动时：确保今天的世界线已生成，并补执行到点的任务
    // 排程后台唤醒闹钟（自启动检测依据 + 主动消息补发通道）
    scheduleWakeAlarm();
    // 音色自动绑定：先播种角色再批量绑定（全新安装时角色表为空，
    // 必须启动时就完成，不能等角色库页面首次打开才触发）
    ensureRolesSeeded()
      .then(() => autoBindRoleVoices())
      .catch(() => {});
    // 版本变化时自动刷新内置角色卡（内容包更新无需清数据）
    maybeRefreshBuiltinRoles().catch(() => {});
    ensureWorldlineToday()
      .then(() => dispatchWorldline())
      .catch(() => {});
    dispatchBirthdayCelebration().catch(() => {});
    generateRoleMoments().catch(() => {});
    checkDueProactiveTasks().catch(() => {});
    archiveStaleMemories().catch(() => {});
    dispatchPromiseReminders().catch(() => {});

    return () => {
      appStateSub.remove();
      unsubTick();
      clearInterval(interval);
    };
  }, []);

  // 新好友加入后立即补生成世界线（导演页可即时看到新角色动态）
  useEffect(() => {
    const onWorldlineUpdated = () => {
      ensureWorldlineToday()
        .then(() => dispatchWorldline())
        .catch(() => {});
    };
    eventBus.on("worldline-updated", onWorldlineUpdated);
    return () => {
      eventBus.off("worldline-updated", onWorldlineUpdated);
    };
  }, []);

  useEffect(() => {
    if (!navigatorReady) return;
    // 通知导航守卫：去重 + 冷启动首帧渲染完成后再导航，避免竞态白屏
    const navGuard = { convoId: "", at: 0 };
    const openChatFromNotification = (convoId?: string) => {
      if (!convoId || oobeRef.current) return;
      const now = Date.now();
      if (navGuard.convoId === convoId && now - navGuard.at < 3000) return;
      navGuard.convoId = convoId;
      navGuard.at = now;
      setTimeout(() => {
        router.navigate({
          pathname: "/pages/chats/msg-chats",
          params: { chatType: "", convoId },
        });
      }, 400);
    };
    const responseSub =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content
          .data as { convoId?: string } | null;
        openChatFromNotification(data?.convoId);
      });
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = response.notification.request.content
        .data as { convoId?: string } | null;
      openChatFromNotification(data?.convoId);
    });
    return () => responseSub.remove();
  }, [navigatorReady]);

  return (
    <RecoilRoot>
      <AppThemeProvider>
        <PaperThemeBridge>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <ConfigProvider>
              <KeyboardPad>
            {!booted ? null : (
              <ErrorBoundary>
                {showOobe ? (
                  <Oobe
                    onDone={() => {
                      oobeRef.current = false;
                      setShowOobe(false);
                    }}
                  />
                ) : (
                  <Stack
                    screenOptions={{
                      headerShadowVisible: true,
                      // 全局转场：从底部带景深淡入（层级感），由原生执行无 JS 开销
                      animation: "fade_from_bottom",
                    }}
                  >
                    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                    {/* 聊天详情页保留平台默认滑动：最高频路径保持方向感 */}
                    <Stack.Screen
                      name="pages/chats/msg-chats/index"
                      options={{ animation: "default" }}
                    />
                  </Stack>
                )}
              </ErrorBoundary>
            )}
            <WeChatDialog
              visible={askAutostart}
              title="开启自启动"
              message={
                "角色偷偷来找过你，但你没在线，TA 们又回去了。好像是被后台权限拦住了（自启动可能没开）。去开启一下，别让 TA 们等太久？"
              }
              confirmText="去开启"
              cancelText="暂不"
              cancelCountdown={2}
              onCancel={() => {
                markAutostartAsked().catch(() => {});
                closeAskAutostart();
              }}
              onConfirm={() => {
                markAutostartAsked().catch(() => {});
                closeAskAutostart();
                openAutostartSettings();
              }}
            />
              </KeyboardPad>
            </ConfigProvider>
          </GestureHandlerRootView>
        </PaperThemeBridge>
      </AppThemeProvider>
    </RecoilRoot>
  );
}
