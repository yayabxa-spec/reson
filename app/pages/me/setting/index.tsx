import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Pressable, ScrollView, Text, View, Vibration } from "react-native";
import { useFocusEffect, useNavigation } from "expo-router";
import { useTheme } from "../../../../theme/useTheme";
import { Divider, List, Searchbar } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { buildRoleSearchKey } from "../../../utils/pinyinSearch";
import AsyncStorage from "../../../utils/storage";
import Toast from "../../../component/base/Toast";

// 隐藏入口1：连续点击顶栏"设置" 10 次解锁"支持 RE:SON"（解锁后 3 分钟自动隐藏）
const DONATE_UNLOCK_KEY = "wc_donate_unlocked_v1";
const DONATE_TAPS_REQUIRED = 10;
const DONATE_LIFETIME_MS = 3 * 60 * 1000;

// 隐藏入口2：在「关于」页连续点击"当前版本"10 次解锁"开发者选项"（持久化，设置页只读状态显示入口）
const DEBUG_UNLOCK_KEY = "wc_prompt_debug_unlocked_v1";

interface SettingItem {
  label: string;
  icon: string;
  keywords: string;
  route: string;
  rightText?: string;
}

interface SettingGroup {
  title: string;
  items: SettingItem[];
}

const GROUPS: SettingGroup[] = [
  {
    title: "账号与安全",
    items: [
      {
        label: "个人资料",
        icon: "account-circle-outline",
        keywords: "账号 资料 头像 昵称 性别 主页 ziliao touxiang",
        route: "pages/me/screens/profile/index",
      },
    ],
  },
  {
    title: "新消息通知",
    items: [
      {
        label: "消息通知",
        icon: "bell-outline",
        keywords: "通知 横幅 声音 锁屏 消息 tongzhi xiaoxi",
        route: "pages/me/screens/notify/index",
      },
    ],
  },
  {
    title: "聊天与角色",
    items: [
      {
        label: "AI 导演",
        icon: "movie-open-outline",
        keywords: "导演 世界线 状态 主动 看板 daoyan zhuangtai",
        route: "pages/me/screens/director/index",
      },
      {
        label: "角色主动消息（世界线）",
        icon: "calendar-clock-outline",
        keywords:
          "世界线 主动 角色 天气 频率 夜间静默 自启动 shijiexian tianqi pinlv yewan jingmo ziqidong",
        route: "pages/me/screens/worldline/index",
      },
      {
        label: "角色管理",
        icon: "account-group-outline",
        keywords: "角色 好友 通讯录 人设 添加 juese haoyou",
        route: "pages/me/screens/roles/index",
      },
      {
        label: "聊天记录备份",
        icon: "database-export-outline",
        keywords: "备份 还原 云盘 webdav 坚果云 飞牛 beifen huanyuan",
        route: "pages/me/screens/backup/index",
      },
      {
        label: "存储空间",
        icon: "database-outline",
        keywords: "存储 清理 缓存 聊天记录 cunchu qingli",
        route: "pages/me/screens/storage/index",
      },
    ],
  },
  {
    title: "AI 能力",
    items: [
      {
        label: "模型管理",
        icon: "memory",
        keywords: "模型 AI 供应商 api key 对话 图像 语音 moxing gongyingshang",
        route: "pages/me/screens/model-manage/index",
      },
      {
        label: "AI 对话选项",
        icon: "tune",
        keywords: "AI 思考 思考链 system 兼容 对话 模型 duihua sikao",
        route: "pages/me/screens/ai-options/index",
      },
      {
        label: "Token 统计",
        icon: "chart-line",
        keywords: "token 消耗 统计 用量 次数 token tongji yongliang",
        route: "pages/me/screens/cost/index",
      },
      {
        label: "记忆与检索",
        icon: "brain",
        keywords: "记忆 检索 embedding rerank 数据库 jiyi jiansuo",
        route: "pages/me/screens/rag/index",
      },
      {
        label: "知识库",
        icon: "book-open-outline",
        keywords: "知识库 文档 检索 上传 zhishiku wenjian",
        route: "pages/me/screens/kb/index",
      },
      {
        label: "联网搜索",
        icon: "web",
        keywords: "联网 搜索 tavily web lianwang sousuo",
        route: "pages/me/screens/websearch/index",
      },
      {
        label: "AI 生图（ComfyUI）",
        icon: "image-outline",
        keywords: "生图 画图 comfyui ai 图片 stable diffusion shengtu huatu",
        route: "pages/me/screens/comfyui/index",
      },
    ],
  },
  {
    title: "通用",
    items: [
      {
        label: "界面与显示",
        icon: "palette-outline",
        keywords: "界面 显示 深色 主题 字体 jiemian xianshi ziti",
        route: "pages/me/screens/display/index",
      },
      {
        label: "系统权限",
        icon: "shield-check-outline",
        keywords: "权限 通知 存储 后台 自启动 quanxian",
        route: "pages/me/screens/permission/index",
      },
    ],
  },
  {
    title: "关于",
    items: [
      {
        label: "关于 RE:SON",
        icon: "information-outline",
        keywords: "关于 版本 简介 协议 隐私 开源 免责 guanyu banben xieyi",
        route: "pages/me/screens/about/index",
      },
    ],
  },
];

// 每个设置项的可搜索文本：标签 + 关键词 + 拼音（支持中文/拼音首字母/全拼搜索）
const SEARCH_MAP = new Map<string, string>();
for (const g of GROUPS) {
  for (const it of g.items) {
    SEARCH_MAP.set(
      it.route,
      buildRoleSearchKey(it.label) + " " + buildRoleSearchKey(it.keywords)
    );
  }
}

const Setting = () => {
  const { themeColor } = useTheme();
  const navigator = useNavigation();
  const [query, setQuery] = useState("");
  const [donateUnlocked, setDonateUnlocked] = useState(false);
  const [debugUnlocked, setDebugUnlocked] = useState(false);
  const tapCountRef = useRef(0);
  const donateUnlockedRef = useRef(false);
  const debugUnlockedRef = useRef(false);
  const donateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadUnlockState = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(DONATE_UNLOCK_KEY);
      const t = raw ? parseInt(raw, 10) : 0;
      if (t && Date.now() - t < DONATE_LIFETIME_MS) {
        donateUnlockedRef.current = true;
        setDonateUnlocked(true);
        if (donateTimerRef.current) clearTimeout(donateTimerRef.current);
        const remain = DONATE_LIFETIME_MS - (Date.now() - t);
        donateTimerRef.current = setTimeout(() => {
          donateUnlockedRef.current = false;
          setDonateUnlocked(false);
          AsyncStorage.removeItem(DONATE_UNLOCK_KEY).catch(() => {});
        }, remain);
      } else if (raw) {
        AsyncStorage.removeItem(DONATE_UNLOCK_KEY).catch(() => {});
        donateUnlockedRef.current = false;
        setDonateUnlocked(false);
      }
      const dbg = await AsyncStorage.getItem(DEBUG_UNLOCK_KEY);
      debugUnlockedRef.current = dbg === "1";
      setDebugUnlocked(dbg === "1");
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadUnlockState();
      return () => {
        if (donateTimerRef.current) clearTimeout(donateTimerRef.current);
      };
    }, [loadUnlockState])
  );

  const handleTitleTap = () => {
    // 用 ref 同步判断，避免解锁后 state 未更新时继续计数弹提示
    if (donateUnlockedRef.current) return;
    tapCountRef.current += 1;
    // 最强震动：直接驱动震动马达满幅 60ms（比系统轻/中/重反馈都强）
    Vibration.vibrate(60);
    if (tapCountRef.current >= DONATE_TAPS_REQUIRED) {
      tapCountRef.current = 0;
      donateUnlockedRef.current = true;
      setDonateUnlocked(true);
      Toast.info("debug：已开启隐藏页面");
      AsyncStorage.setItem(
        DONATE_UNLOCK_KEY,
        String(Date.now())
      ).catch(() => {});
      donateTimerRef.current = setTimeout(() => {
        donateUnlockedRef.current = false;
        setDonateUnlocked(false);
        AsyncStorage.removeItem(DONATE_UNLOCK_KEY).catch(() => {});
      }, DONATE_LIFETIME_MS);
      return;
    }
    // 中间点击只震动，不弹提示
  };

  useLayoutEffect(() => {
    navigator.setOptions({
      headerShown: true,
      headerTitle: () => (
        <Pressable onPress={handleTitleTap} hitSlop={10}>
          <Text
            style={{
              color: themeColor.onSurface,
              fontSize: 17,
              fontWeight: "600",
            }}
          >
            设置
          </Text>
        </Pressable>
      ),
      headerTitleAlign: "center",
      headerTintColor: themeColor.onSurface,
      headerShadowVisible: false,
      headerStyle: { backgroundColor: themeColor.surfaceContainerLow },
    });
  }, []);

  const groups = useMemo(() => {
    const extra: SettingGroup[] = [];
    // 捐赠入口独立放在设置页最底部（不在"关于"分组里），解锁 3 分钟后自动隐藏
    if (donateUnlocked) {
      extra.push({
        title: "",
        items: [
          {
            label: "支持 RE:SON",
            icon: "coffee-outline",
            keywords: "捐赠 支持 咖啡 开发者 juanzeng zhichi",
            route: "pages/me/screens/donate/index",
          },
        ],
      });
    }
    // 开发者选项入口：设置页最底部（由关于页点"当前版本"解锁）
    if (debugUnlocked) {
      extra.push({
        title: "",
        items: [
          {
            label: "开发者选项",
            icon: "script-text-outline",
            keywords: "开发者 调试 提示词 prompt 系统 模板 kaifazhe tiaoshi",
            route: "pages/me/screens/prompt-debug/index",
          },
        ],
      });
    }
    if (!donateUnlocked && !debugUnlocked) return GROUPS;
    return [
      ...GROUPS,
      ...extra,
    ];
  }, [donateUnlocked, debugUnlocked]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    const result: SettingGroup[] = [];
    for (const g of groups) {
      const items = g.items.filter(
        (it) => (SEARCH_MAP.get(it.route) || "").includes(q)
      );
      if (items.length) result.push({ ...g, items });
    }
    return result;
  }, [query, groups]);

  return (
    <View style={{ flex: 1, backgroundColor: themeColor.surfaceContainerLow }}>
      <Searchbar
        placeholder="搜索设置项"
        value={query}
        onChangeText={setQuery}
        style={{
          marginHorizontal: 12,
          marginTop: 12,
          borderRadius: 12,
          backgroundColor: themeColor.surfaceContainerHigh,
        }}
        inputStyle={{ fontSize: 14, color: themeColor.onSurface }}
      />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 30 }}
        keyboardShouldPersistTaps="handled"
      >
        {filtered.length === 0 ? (
          <Text
            style={{
              textAlign: "center",
              color: themeColor.onSurfaceVariant,
              fontSize: 14,
              marginTop: 40,
            }}
          >
            没有找到相关设置
          </Text>
        ) : (
          filtered.map((g) => (
            <View key={g.title}>
              {g.title ? (
                <List.Subheader
                  style={{
                    color: themeColor.onSurfaceVariant,
                    fontSize: 13,
                    marginTop: 4,
                  }}
                >
                  {g.title}
                </List.Subheader>
              ) : null}
              <View style={{ backgroundColor: themeColor.surfaceContainerLowest }}>
                {g.items.map((it, i) => (
                  <View key={it.label}>
                    <List.Item
                      title={it.label}
                      titleStyle={{
                        fontSize: 16,
                        color: themeColor.onSurface,
                      }}
                      style={{
                        minHeight: 56,
                        paddingLeft: 16,
                        paddingRight: 8,
                      }}
                      onPress={() => navigator.navigate(it.route)}
                      left={() => (
                        <View
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 10,
                            backgroundColor: themeColor.secondaryContainer,
                            alignItems: "center",
                            justifyContent: "center",
                            marginRight: 8,
                          }}
                        >
                          <MaterialCommunityIcons
                            name={it.icon as any}
                            size={20}
                            color={themeColor.onSecondaryContainer}
                          />
                        </View>
                      )}
                      right={() => (
                        <List.Icon
                          icon="chevron-right"
                          color={themeColor.onSurfaceVariant}
                        />
                      )}
                    />
                    {i < g.items.length - 1 && (
                      <Divider style={{ marginLeft: 72 }} />
                    )}
                  </View>
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
};

export default Setting;
