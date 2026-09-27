import { useEffect, useRef, useState } from "react";
import { Animated, Text, TouchableOpacity, View } from "react-native";
import { getSize } from "../../../../../utils.ts";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useFontScale } from "../../../../hooks/useFontScale";
import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "../../../../utils/storage";
import { useTheme } from "../../../../../theme/useTheme";
import Toast from "../../../base/Toast";

/** 全局当前播放的语音条：新的一条播放时自动暂停上一条（同屏只响一条） */
let activeVoicePlayer: { pause: () => void; currentStatus?: { playing?: boolean } } | null = null;

// ---------- 已播放记录（微信风格：收到未播放的语音带红点，播过才消失） ----------
const PLAYED_KEY = "wc_played_voice_v1";
let playedCache: Set<string> | null = null;

async function loadPlayed(): Promise<Set<string>> {
  if (playedCache) return playedCache;
  try {
    const raw = await AsyncStorage.getItem(PLAYED_KEY);
    playedCache = new Set(raw ? JSON.parse(raw) : []);
  } catch {
    playedCache = new Set();
  }
  return playedCache;
}

async function isVoicePlayed(id: string): Promise<boolean> {
  const s = await loadPlayed();
  return s.has(id);
}

async function markVoicePlayed(id: string) {
  if (!id) return;
  const s = await loadPlayed();
  if (s.has(id)) return;
  s.add(id);
  AsyncStorage.setItem(PLAYED_KEY, JSON.stringify([...s])).catch(() => {});
}

/** 微信/QQ 风格声波条：播放时三根条交错跳动 */
const WaveBars = ({ playing, color }: { playing: boolean; color: string }) => {
  const v1 = useRef(new Animated.Value(0.45)).current;
  const v2 = useRef(new Animated.Value(0.45)).current;
  const v3 = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    if (!playing) {
      v1.setValue(0.45);
      v2.setValue(0.45);
      v3.setValue(0.45);
      return;
    }
    const mk = (v: Animated.Value) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, {
            toValue: 1,
            duration: 260,
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 0.45,
            duration: 260,
            useNativeDriver: true,
          }),
        ])
      );
    const loops = [mk(v1), mk(v2), mk(v3)];
    const timers = loops.map((l, i) =>
      setTimeout(() => l.start(), i * 170)
    );
    return () => {
      timers.forEach(clearTimeout);
      loops.forEach((l) => l.stop());
    };
  }, [playing]);
  const bar = (v: Animated.Value) => (
    <Animated.View
      style={{
        width: 3,
        height: 15,
        borderRadius: 2,
        backgroundColor: color,
        marginHorizontal: 1.5,
        transform: [{ scaleY: v }],
      }}
    />
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {bar(v1)}
      {bar(v2)}
      {bar(v3)}
    </View>
  );
};

/**
 * 微信/QQ 风格语音条：
 * - 宽度按时长伸缩，气泡内左侧声波条、右侧时长（N″）；
 * - 播放时声波条交错跳动；
 * - 收到的未播放语音带小红点（播过消失）；
 * - 播放结束自动回到开头，可重复播放。
 */
const VoiceCard = ({
  popover,
  text,
  type = "left",
  msgId,
  onLongPress,
  caption,
  showCaption,
}: {
  popover?: any;
  text: string;
  type?: "left" | "right";
  msgId?: string;
  onLongPress?: (e?: any) => void;
  caption?: string;
  showCaption?: boolean;
}) => {
  const fontScale = useFontScale();
  const { themeColor } = useTheme();
  const player = useAudioPlayer(text || null);
  const status = useAudioPlayerStatus(player);
  const isRight = type === "right";
  const [unread, setUnread] = useState(false);

  // 本地 WAV 可读到真实时长；流式/未加载完成时兜底 1 秒
  const durationSec = Math.max(1, Math.round(status?.duration || 0));
  // 宽度按时长伸缩（最短 72、最长 238，单行不换行）
  const bubbleWidth = Math.max(
    getSize(72),
    Math.min(
      getSize(238),
      getSize(40) + Math.min(durationSec, 60) * getSize(3.3)
    )
  );
  const bubbleBg = isRight ? themeColor.brand2 : "#FFFFFF";
  const contentColor = isRight ? "#FFFFFF" : "#111111";
  const isPlaying = !!status?.playing;
  const playable = !!status?.isLoaded;

  // 未读红点：收到的语音未播放过则显示
  useEffect(() => {
    if (!isRight && msgId) {
      isVoicePlayed(msgId).then((v) => setUnread(!v));
    }
  }, [msgId, isRight]);

  // 播放结束/卸载时清掉全局占用，避免其他语音条误以为还在播
  useEffect(() => {
    if (status?.didJustFinish && activeVoicePlayer === player) {
      activeVoicePlayer = null;
    }
  }, [status?.didJustFinish]);
  useEffect(() => {
    return () => {
      if (activeVoicePlayer === player) activeVoicePlayer = null;
    };
  }, []);

  const togglePlay = async () => {
    // 本地文件加载好后直接播；远程旧链接先下载到本地再播，避免过期/流式问题
    if (!playable) {
      if (/^https?:\/\//.test(text || "")) {
        playRemote();
      }
      return;
    }
    if (isPlaying) {
      player.pause();
      if (activeVoicePlayer === player) activeVoicePlayer = null;
      return;
    }
    // 播放结束/停在末尾时先回到开头（否则按完一次后 play() 不响）
    const dur = status?.duration || 0;
    const cur = status?.currentTime || 0;
    if (status?.didJustFinish || (dur > 0 && cur >= dur - 0.05)) {
      try {
        await player.seekTo(0);
      } catch {}
    }
    if (activeVoicePlayer && activeVoicePlayer !== player) {
      activeVoicePlayer.pause();
    }
    activeVoicePlayer = player;
    player.play();
    // 首次播放即视为已读（红点消失）
    if (!isRight && msgId) {
      setUnread(false);
      markVoicePlayed(msgId);
    }
  };

  const playRemote = async () => {
    try {
      const dest = `${FileSystem.documentDirectory}voice-rt-${Date.now()}.wav`;
      const res = await FileSystem.downloadAsync(text, dest);
      if (res.status >= 200 && res.status < 300) {
        player.replace(res.uri || dest);
        // replace 后等待新源加载完成再播放
        const t0 = Date.now();
        const iv = setInterval(() => {
          if (player.currentStatus?.isLoaded) {
            clearInterval(iv);
            if (activeVoicePlayer && activeVoicePlayer !== player) {
              activeVoicePlayer.pause();
            }
            activeVoicePlayer = player;
            player.play();
            if (!isRight && msgId) {
              setUnread(false);
              markVoicePlayed(msgId);
            }
          } else if (Date.now() - t0 > 15000) {
            clearInterval(iv);
          }
        }, 200);
      } else {
        Toast.info("语音文件已失效，无法播放");
      }
    } catch {
      Toast.info("语音文件已失效，无法播放");
    }
  };

  const durationLabel = (
    <Text
      style={{
        color: contentColor,
        fontSize: Math.round(15 * fontScale),
        fontWeight: "500",
      }}
    >
      {durationSec}″
    </Text>
  );

  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {!isRight && unread && (
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: "#FA5151",
              marginRight: 6,
            }}
          />
        )}
        <TouchableOpacity
          activeOpacity={0.7}
          onLongPress={(e) => {
            if (onLongPress) onLongPress(e);
            else popover?.current?.show();
          }}
          onPress={togglePlay}
          style={{
            width: bubbleWidth,
            height: getSize(38),
            borderRadius: getSize(6),
            backgroundColor: bubbleBg,
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: getSize(12),
            justifyContent: isRight ? "flex-end" : "flex-start",
          }}
        >
          {!isRight ? (
            <>
              <WaveBars playing={isPlaying} color={contentColor} />
              <Text style={{ width: 6 }} />
              {durationLabel}
            </>
          ) : (
            <>
              {durationLabel}
              <Text style={{ width: 6 }} />
              <WaveBars playing={isPlaying} color={contentColor} />
            </>
          )}
        </TouchableOpacity>
      </View>
      {showCaption && caption ? (
        <View
          style={{
            maxWidth: getSize(250),
            backgroundColor: isRight ? "#D9F3C9" : "#F4F4F4",
            borderRadius: 6,
            paddingHorizontal: getSize(10),
            paddingVertical: getSize(6),
            marginTop: getSize(4),
            alignSelf: isRight ? "flex-end" : "flex-start",
          }}
        >
          <Text
            style={{
              color: isRight ? "#111" : "#555",
              fontSize: Math.round(14 * fontScale),
              lineHeight: Math.round(20 * fontScale),
            }}
          >
            {caption}
          </Text>
        </View>
      ) : null}
    </>
  );
};

export default VoiceCard;
