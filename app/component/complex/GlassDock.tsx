/**
 * 悬浮玻璃胶囊 Dock（glass 皮肤专用）
 *
 * 严格对照 F:\AndroidLiquidGlass-kmp LiquidBottomTabs.kt 实现，
 * 玻璃管线由原生 BackdropSource/GlassEffect 提供（声明式离屏图层 +
 * vibrancy⇒blur⇒lens 效果链 + AGSL 着色器，逐字移植自 Kyant0 源码）：
 * - dock 胶囊：vibrancy + blur(8dp) + lens(24dp,24dp) 恒定折射页面内容，
 *   表面 FAFAFA 40%；tab 按钮画在表面之上，永不进入折射（源码同构）
 * - 隐藏强调色副本层（captureOnly，等价源码 alpha(0f)+layerBackdrop）：
 *   全部 tab 图标/文字以强调色渲染，仅供镜片折射
 * - 运动镜片：静止 = 黑 10% 灰胶囊（progress=0 无折射无模糊）；
 *   按压/拖拽 = lens(10dp,14dp × progress) + chromaticAberration 实时折射
 *   [页面 + 强调色副本] 合成层（等价 rememberCombinedBackdrop），
 *   pressedScale 78/56，速度驱动 scaleX/scaleY 液态形变，Q 弹吸附
 *
 * v0.60.2：velocity 输入源对齐官方 —— 不再使用 RNGH 的手指速度 e.velocityX，
 * 改为逐帧采样 valueAnimation.value（此处即 cx）经 LSQ2 VelocityTracker 求速度。
 *
 * v0.60.4：手势路径对齐官方 DampedDragAnimation
 *   - onDrag：改为 onChange 的逐事件增量 changeX，累加基数是已 clamp 的 targetCx
 *     （等价官方 updateValue(targetValue + dragAmount.x / tabWidth)），消除越界死区
 *   - onEnd：吸附目标改用 targetCx（等价官方 valueAnimation.targetValue），不再用当前 cx
 *   - onFinalize：补齐官方 onDragCancel，与 onDragEnd 走同一条 onDragStopped + release 路径
 *   - 拖拽上下界改为 cxFor(0) / cxFor(n-1)，即官方 valueRange = 0f..(n-1)
 *
 * v0.60.5：官方 panelOffset / offsetAnimation
 *   - 拖拽中 offsetAnim += dragAmount.x（原始增量，不 clamp）
 *   - 结束（含 cancel）offsetAnim 以官方 spring(1f, 300f, 0.5f) 回 0
 *   - panelOffset = 4dp · sign(fraction) · EaseOut(|clamp(offset/dockW, -1, 1)|)
 *   - 施加于面板根节点，等价官方两处 Row 的 `graphicsLayer { translationX = panelOffset }`
 *
 * v0.60.7：官方 tabsBackdrop 完整语义（LiquidBottomTabs.kt:195-228 / :242）
 *   - 隐藏强调色副本层（accent-tabs）补入 Row#2 自身玻璃管线输出：
 *     drawBackdrop(backdrop=page) = vibrancy + blur(8dp) + lens(24dp×progress,24dp×progress)
 *     + Highlight.Default.copy(alpha=progress) + surface containerColor（恒定）
 *   - 运动镜片 backdrop 语义从 page 变为 combined(page, tabsBackdrop)：
 *     镜片内看到的不再是原始页面，而是 Row#2 的玻璃观感（模糊+表面）+ 强调色图标
 *   - 原生侧配套：BackdropSourceView 增加内容版本号，GlassEffectView 通知改按
 *     「被采样源版本变化」门控，防止源内嵌玻璃效果视图造成 60fps 持续重绘循环
 *
 * v0.60.8：官方 InteractiveHighlight（catalog/utils/InteractiveHighlight.kt，
 *   LiquidBottomTabs.kt:148-159/:182/:221/:239，用户本阶段解禁）
 *   - dock(层1) 与 Row#2(accent-tabs 内) 玻璃 surface 之上新增：
 *     白 8%×progress 全场提亮 + AGSL 径向光斑（BlendMode.Plus，API<33 走官方 25% 降级）
 *   - 位置 = 胶囊中心 + panelOffset（官方 position lambda 忽略手指 offset）；
 *     y = 各自 height/2；官方为"绘制层平移+position 各一次 panelOffset"的双重结构，
 *     本项目画布已含面板平移一份，position 内照抄 → 与官方屏幕效果逐帧一致
 *   - 手势信号：highlightActive（onStart true / endDrag false，抬起瞬间回弹
 *     spring(0.5,300)，与 pressActive 的等收敛 retract 时机不同）
 *   - 镜片 effectId="lens" 作位置锚点；dock/Row#2 经 view 属性读取（零桥）
 *
 * v0.60.9：官方 LocalLiquidBottomTabScale 同步到 tabsBackdrop 隐藏副本
 *   （审计结论：provider 只包 Row#2，1→1.2 缩放仅存在于隐藏副本，
 *     经录制进入镜片采样；可见 Row#1 内容无此缩放。源码审计详见会话报告）
 *   - accent-tabs 副本 tab 单元 Animated.View + useAnimatedStyle：
 *     scale = 1 + (TAB_PRESSED_SCALE−1)×pressProgress，UI 线程直驱零重渲染
 *   - 静止 p=0 → scale=1，静置外观与 v0.60.8 逐像素一致；可见层2 不动
 *
 * v0.60.10：方案 B 裁决——可见层移除 1→1.2
 *   - DockTabButton scale = focusScale（选中 1.06 / 未选中 1.0），
 *     pressProgress 不再参与可见层缩放
 *   - 官方依据：LocalLiquidBottomTabScale provider 只包 Row#2（:190-194），可见内容恒 1.0
 *   - 1.06 静置选中强调经裁决暂时保留（与官方 scale=1.0 的静置差被有意隔离）
 *   - accent-tabs 副本 1→1.2、bgScale、镜片、AGSL 等全部不动
 *
 * v0.60.11：差异⑤裁决——移除 1.06 静置选中放大
 *   - focusScale = focused ? 1.0 : 1，可见内容缩放与官方 Row#1（恒 1.0）完全一致
 *   - 1.06 经审计确认与按压动力学零交互、仅为静置强调（+5.66%），
 *     玻璃设计下选中强调由 accent 颜色 + 镜片停驻 + 副本放大承担
 *   - accent-tabs 副本 1→1.2、bgScale、镜片、AGSL 等全部不动
 *
 * v0.60.13：收官后出厂清理——移除 Debug UI
 *   - 删除 DebugOverlay（黑色调试数据面板）的渲染调用与组件定义；
 *     观测变量与 CSV 记录链路（useFrameCallback→recBuf→flushChunk→DebugDump）完整保留
 *   - 删除 chats 页 dock 后方 #808080 纯灰测试带（v0.60.1 测量用遮罩），
 *     玻璃改为折射真实页面内容（ConvoList）
 *   - 面板根 overflow:"visible" 保留（镜片按压越界渲染所需）
 *   - 玻璃管线/AGSL/弹簧/手势/布局零改动
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { NativeModules, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";
import {
  Gesture,
  GestureDetector,
  TouchableOpacity as GHTouchable,
} from "react-native-gesture-handler";
import { useTheme } from "../../../theme/useTheme";
import { BackdropSource, GlassEffect } from "./NativeBackdrop";
import { blendRgba, type DIYTabConfig, type ResolvedDIYTheme } from "../../../theme/diyTheme";
import { hapticLight } from "../../utils/haptics";

const DOCK_HEIGHT = 64;
export const DOCK_SIDE_MARGIN = 20;
export const DOCK_BOTTOM_MARGIN = 22;
const INNER_PAD = 4; // 源码 dock Row .padding(4f.dp)

export interface GlassDockTab {
  key: string;
  /** expo-router 路由路径（如 "/contacts"） */
  href: string;
  label: string;
  icon: (focused: boolean, color: string) => React.ReactNode;
  badge?: React.ReactNode;
}

interface GlassDockProps {
  tabs: GlassDockTab[];
  activeIndex: number;
  /** 当前聚焦 tab 页的背景层 id（页面内容声明层） */
  pageSourceId: string;
  onSelect: (index: number) => void;
  /** v0.61.1-diy：当前 route 的 DIY theme 切片（glass/tab），由 (tabs)/_layout 传入 */
  diy?: ResolvedDIYTheme;
}

/**
 * 官方 DampedDragAnimation 的 5 条弹簧。
 * Compose 的 spring(dampingRatio ζ, stiffness k, mass = 1) 与 Reanimated 的 withSpring
 * 是同一二阶系统 x'' = -k·x - c·x'，但 Reanimated 的 damping 是【阻尼系数 c】（非阻尼比），
 * 换算：c = 2ζ√k。
 *   value         spring(1f,   1000f, 0.001f) → { c = 63.25, k = 1000 }
 *   velocity      spring(0.5f,  300f, 0.01f)  → { c = 17.32, k = 300  }
 *   pressProgress spring(1f,   1000f, 0.001f) → { c = 63.25, k = 1000 }
 *   scaleX        spring(0.6f,  250f, 0.001f) → { c = 18.97, k = 250  }
 *   scaleY        spring(0.7f,  250f, 0.001f) → { c = 22.14, k = 250  }
 */
const SP_VALUE = { damping: 63.25, stiffness: 1000, mass: 1 };
const SP_VELOCITY = { damping: 17.32, stiffness: 300, mass: 1 };
const SP_PRESS = { damping: 63.25, stiffness: 1000, mass: 1 };
const SP_SCALE_X = { damping: 18.97, stiffness: 250, mass: 1 };
const SP_SCALE_Y = { damping: 22.14, stiffness: 250, mass: 1 };
/**
 * v0.60.5：官方 offsetAnimation 回位弹簧
 * 官方 LiquidBottomTabs.kt:116-119 → offsetAnimation.animateTo(0f, spring(1f, 300f, 0.5f))
 *   Compose spring 位置参数 = (dampingRatio, stiffness, visibilityThreshold)
 *   → ζ = 1（临界阻尼）, k = 300, 阈值 0.5px
 *   Reanimated 的 damping 是阻尼系数 c = 2ζ√k = 2·1·√300
 */
const SP_OFFSET = { damping: 34.641, stiffness: 300, mass: 1 };
/** 官方 panelOffset 幅值：4f.dp.toPx() */
const PANEL_MAX_DP = 4;

/** 官方 pressedScale = 78f / 56f */
const PRESSED_SCALE = 78 / 56;
/** 官方 LocalLiquidBottomTabScale = lerp(1f, 1.2f, pressProgress) */
const TAB_PRESSED_SCALE = 1.2;
/** worklet 内使用的工具函数（必须带 'worklet' 指令） */
const CLAMP = (v: number, lo: number, hi: number) => {
  "worklet";
  return v < lo ? lo : v > hi ? hi : v;
};

/**
 * v0.60.5：官方 panelOffset 的缓动 —— `androidx.compose.animation.core.EaseOut`
 *
 * 官方源码（androidx 仓库原文）：
 *   public val EaseOut: Easing = CubicBezierEasing(0f, 0f, 0.58f, 1f)
 *   public fun evaluateCubic(p1: Float, p2: Float, t: Float): Float {
 *       val a = 1.0f / 3.0f + (p1 - p2); val b = (p2 - 2.0f * p1); val c = p1
 *       return 3.0f * ((a * t + b) * t + c) * t
 *   }
 *   CubicBezierEasing.transform(fraction): 解 x(t)=fraction 后取 y(t)，区间外直接返回 fraction
 *
 * 求解器说明：androidx 用 Cardano（findFirstCubicRoot）解 t。EaseOut 的 x(t) 在 [0,1] 严格
 * 单调（x(t)=1.74t²-0.74t³，x'(t)=t(3.48-2.22t)>0），我用 32 次二分求解，精度 2^-32，
 * 对输出（≤4dp）的影响 < 1e-5 dp。曲线参数与 evaluateCubic 公式均取自原文。
 */
const bezierEvalCubic = (p1: number, p2: number, t: number) => {
  "worklet";
  const a = 1 / 3 + (p1 - p2);
  const b = p2 - 2 * p1;
  const c = p1;
  return 3 * ((a * t + b) * t + c) * t;
};
const easeOut = (fraction: number) => {
  "worklet";
  if (!(fraction > 0) || !(fraction < 1)) return fraction;
  let lo = 0;
  let hi = 1;
  let t = fraction;
  for (let i = 0; i < 32; i++) {
    t = (lo + hi) / 2;
    if (bezierEvalCubic(0, 0.58, t) < fraction) lo = t;
    else hi = t;
  }
  return bezierEvalCubic(0, 1, t);
};

/**
 * v0.60.2：worklet 版 VelocityTracker（velocity 输入源对齐）
 *
 * 官方 DampedDragAnimation 喂进 VelocityTracker 的**不是手指速度**，而是
 * valueAnimation.value 本身（弹簧输出位置，即胶囊自己的实际运动）：
 *   valueAnimation.animateTo(targetValue, valueAnimationSpec) { updateVelocity() }
 *   velocityTracker.addPosition(Clock.System.now().toEpochMilliseconds(), Offset(value, 0f))
 *   targetVelocity = velocityTracker.calculateVelocity().x / (valueRange.end - valueRange.start)
 *
 * 此处按 AOSP/Compose LeastSquaresVelocityTrackerStrategy（LSQ2，DEGREE = 2）
 * 的公开策略语义移植：
 *   - HISTORY_SIZE = 20 个样本
 *   - HORIZON = 100ms 计算窗口（超出窗口的样本不参与拟合）
 *   - 均匀权重 + 二阶多项式最小二乘，取 t=0（最新样本时刻）处导数
 *   - 时间基为秒，t = (sampleTime - newestTime) / 1000 ≤ 0
 * 说明：本地无 Compose sources（SDK 源码只含策略枚举，实现在 native），
 *      故为“算法语义一致”的移植，未与 Compose 逐行对照。
 */
const VT_HISTORY_SIZE = 20;
const VT_HORIZON_MS = 100;

/** hist 为扁平历史 [t0,v0,t1,v1,...]（按时间升序），返回 t=0 处速度（单位/秒） */
const vtLsq2Velocity = (hist: number[], count: number, newest: number) => {
  "worklet";
  if (count < 2) return 0;
  if (newest - hist[0] <= 0) return 0;

  // 正规方程 M·c = B（基 1, t, t²；权重 1）；aug = [m00,m01,m02,b0, m10,m11,m12,b1, ...]
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  let s3 = 0;
  let s4 = 0;
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < count; i++) {
    const t = (hist[i * 2] - newest) / 1000;
    const y = hist[i * 2 + 1];
    const t2 = t * t;
    s0 += 1;
    s1 += t;
    s2 += t2;
    s3 += t2 * t;
    s4 += t2 * t2;
    b0 += y;
    b1 += y * t;
    b2 += y * t2;
  }
  const m = [s0, s1, s2, b0, s1, s2, s3, b1, s2, s3, s4, b2];
  for (let col = 0; col < 3; col++) {
    let piv = col;
    for (let r = col + 1; r < 3; r++) {
      if (Math.abs(m[r * 4 + col]) > Math.abs(m[piv * 4 + col])) piv = r;
    }
    if (Math.abs(m[piv * 4 + col]) < 1e-12) return 0; // 奇异 → 无法拟合
    if (piv !== col) {
      for (let c = 0; c < 4; c++) {
        const tmp = m[col * 4 + c];
        m[col * 4 + c] = m[piv * 4 + c];
        m[piv * 4 + c] = tmp;
      }
    }
    const d = m[col * 4 + col];
    for (let c = col; c < 4; c++) m[col * 4 + c] /= d;
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const fa = m[r * 4 + col];
      if (fa === 0) continue;
      for (let c = col; c < 4; c++) m[r * 4 + c] -= fa * m[col * 4 + c];
    }
  }
  return m[7]; // c1 = 一次项系数 = t=0 处导数
};

export const GlassDock = ({
  tabs,
  activeIndex,
  pageSourceId,
  onSelect,
  diy,
}: GlassDockProps) => {
  const { themeColor } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();

  const n = tabs.length;
  const dockW = screenW - DOCK_SIDE_MARGIN * 2;
  const tabW = (dockW - INNER_PAD * 2) / n; // 源码 (maxWidth - 8dp)/tabs
  const lensW = tabW;
  const lensH = DOCK_HEIGHT - 8; // 源码：镜片 56dp 在 64dp dock 内
  const lensRadius = lensH / 2;

  const cxFor = (i: number) => INNER_PAD + tabW * (i + 0.5);

  // ===== 5 个独立动画通道（对应官方 DampedDragAnimation 的 5 个 Animatable）=====
  const cx = useSharedValue(cxFor(activeIndex)); // value：位置（px 等价 value × tabWidth）
  // v0.60.4：拖拽会话标志。官方 onDragEnd 与 onDragCancel 走同一条结束路径
  // （onDragStopped + release），而 RNGH 的 onEnd 与 onFinalize 在正常结束时都会触发，
  // 用此标志保证一条拖拽只执行一次结束逻辑（否则 #END 会写两次、onSelect 会调用两次）
  const dragActive = useSharedValue(0);
  const vel = useSharedValue(0); // velocity：value 速度 / span（有符号）
  const pressProgress = useSharedValue(0); // pressProgress：连续 [0,1]
  const scaleX = useSharedValue(1); // scaleX 独立通道
  const scaleY = useSharedValue(1); // scaleY 独立通道
  // release 时序：先等 value 收敛到目标（官方 2.5% × span），再 retract
  const settleCx = useSharedValue(cxFor(activeIndex));
  const awaitingRetract = useSharedValue(false);
  // 按压会话进行中：原生侧据此驱动 pressProgress 弹簧并持续重绘采样
  const [pressActive, setPressActive] = useState(false);
  // v0.60.8：官方 InteractiveHighlight 的手势活跃信号（gestureModifier：
  //   按下瞬间→1，手指抬起/取消瞬间→0，spring(0.5,300) 立即回弹；
  //   与 pressActive 的"等 value 收敛后 retract"时机不同，故独立 state）
  const [highlightActive, setHighlightActive] = useState(false);
  const didMount = useRef(false);

  const setPressActiveJS = (v: boolean) => setPressActive(v);
  const setHighlightActiveJS = (v: boolean) => setHighlightActive(v);
  const retractThreshold = 0.025 * (n - 1) * tabW; // 官方 (valueRange span) × 0.025

  // ===== v0.60.2：velocity 输入源（post-spring 逐帧采样 + LSQ2 VelocityTracker）=====
  // vtHist：扁平样本历史 [t0,v0,t1,v1,...]（时间为 monotonic ms，值为 index 空间）
  // vtFeed：是否处于「拖拽驱动的 value 动画」期间（官方仅在 updateValue 的 animateTo 块内采样）
  const vtHist = useSharedValue<number[]>([]);
  const vtFeed = useSharedValue(0);
  const vtRawIndex = useSharedValue(0);
  const vtRawCx = useSharedValue(0);
  const vtCount = useSharedValue(0);
  const vtSrcIndex = useSharedValue(cxFor(activeIndex) / tabW);

  // ===== v0.60.5：官方 panelOffset / offsetAnimation（LiquidBottomTabs.kt:87-95 / 116-120 / 128）=====
  // offsetAnim：官方 `remember { Animatable(0f) }`，单位 px（此处用 dp，比值不变）
  //   拖拽中：offsetAnimation.snapTo(offsetAnimation.value + dragAmount.x)  ← 原始 dragAmount.x，不 clamp
  //   结束（含 cancel）：offsetAnimation.animateTo(0f, spring(1f, 300f, 0.5f))
  // panelOffset：官方 derivedStateOf
  //   fraction = (offset / constraints.maxWidth).coerceIn(-1, 1)
  //   with(density) { 4.dp.toPx() * fraction.sign * EaseOut.transform(abs(fraction)) }
  //   本项目的 constraints.maxWidth 等价量 = dockW（tabW 已按 (dockW-8dp)/n 复刻官方公式）
  const offsetAnim = useSharedValue(0);
  const panelOffset = useDerivedValue(() => {
    const fraction = CLAMP(offsetAnim.value / dockW, -1, 1);
    const sign = fraction > 0 ? 1 : fraction < 0 ? -1 : 0;
    return PANEL_MAX_DP * sign * easeOut(Math.abs(fraction));
  });
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: panelOffset.value }],
  }));

  // ===== v0.60.1-debug：观测通道与帧级记录（不参与任何物理公式）=====
  const targetCx = useSharedValue(cxFor(activeIndex));
  const recOn = useSharedValue(1);
  const recBuf = useSharedValue<number[]>([]);
  const csvLines = useRef<string[]>([]);
  const DebugDump = NativeModules.DebugDump as
    | { reset: (n: string) => void; append: (n: string, c: string) => void }
    | undefined;
  const writeCsv = (text: string) => {
    csvLines.current.push(text);
    if (csvLines.current.length >= 5 && DebugDump) {
      DebugDump.append("anim.csv", csvLines.current.join(""));
      csvLines.current = [];
    }
  };

  // v0.60.5：再新增 panelOffset 两列（共 16 列）
  const CSV_COLS = 16;
  const flushChunk = (chunk: number[]) => {
    let text = "";
    for (let i = 0; i + CSV_COLS - 1 < chunk.length; i += CSV_COLS) {
      text +=
        `${chunk[i].toFixed(1)},${chunk[i + 1].toFixed(4)},${chunk[i + 2].toFixed(4)},` +
        `${chunk[i + 3].toFixed(6)},${chunk[i + 4].toFixed(6)},${chunk[i + 5].toFixed(6)},` +
        `${chunk[i + 6].toFixed(6)},${chunk[i + 7].toFixed(4)},${chunk[i + 8]},` +
        `${chunk[i + 9].toFixed(4)},${chunk[i + 10].toFixed(6)},` +
        `${chunk[i + 11].toFixed(4)},${chunk[i + 12].toFixed(6)},${chunk[i + 13]},` +
        `${chunk[i + 14].toFixed(4)},${chunk[i + 15].toFixed(6)}\n`;
    }
    writeCsv(text);
  };

  const mark = (label: string) => writeCsv(`#${label}\n`);

  useEffect(() => {
    if (DebugDump) {
      DebugDump.reset("anim.csv");
      DebugDump.append(
        "anim.csv",
        "timestamp,cx,targetCx,velocity,pressProgress,scaleX,scaleY,settleCx,awaitingRetract," +
          "velocitySourceCx,velocitySourceIndex,velocityRawCx,velocityRawIndex,velocityTrackerSampleCount," +
          "offsetAnimation,panelOffset\n"
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 每帧：① velocity 输入源采样（官方 updateVelocity 的逐帧等价物，UI 线程内完成）
  //       ② 帧级数据记录（每 20 帧批量回 JS，避免逐帧 runOnJS 干扰动画）
  useFrameCallback((f) => {
    "worklet";
    // ===== ① velocity 输入源 = cx 自身的运动（post-spring），不是手指速度 =====
    const idx = cx.value / tabW; // value 的 index 空间等价量（= 官方 value）
    if (vtFeed.value === 1) {
      vtSrcIndex.value = idx;
      // velocityTracker.addPosition(now, Offset(value, 0))
      let h = vtHist.value.concat([f.timestamp, idx]);
      // HORIZON：丢弃超出 100ms 计算窗口的样本（至少保留 2 个样本）
      let cut = 0;
      while (h.length - cut >= 4 && f.timestamp - h[cut] > VT_HORIZON_MS) cut += 2;
      if (cut > 0) h = h.slice(cut);
      // HISTORY_SIZE 上限
      if (h.length > VT_HISTORY_SIZE * 2) h = h.slice(h.length - VT_HISTORY_SIZE * 2);
      vtHist.value = h;
      const cnt = h.length / 2;
      const rawIndex = vtLsq2Velocity(h, cnt, f.timestamp); // calculateVelocity().x
      vtRawIndex.value = rawIndex;
      vtRawCx.value = rawIndex * tabW; // 同一量的 cx 单位表示（仅供记录）
      vtCount.value = cnt;
      // velocityAnimation.animateTo(targetVelocity, velocityAnimationSpec)
      const targetVel = rawIndex / (n - 1); // 除以 valueRange span
      // 空闲时不重复发起（官方在该动画停止后也不再调用 updateVelocity）
      if (Math.abs(targetVel) > 1e-6 || Math.abs(vel.value) > 1e-6) {
        vel.value = withSpring(targetVel, SP_VELOCITY);
      }
    }

    // ===== ② 帧级记录 =====
    if (!recOn.value) return;
    const next = recBuf.value.concat([
      f.timestamp,
      cx.value,
      targetCx.value,
      vel.value,
      pressProgress.value,
      scaleX.value,
      scaleY.value,
      settleCx.value,
      awaitingRetract.value ? 1 : 0,
      cx.value, // velocitySourceCx（采样时刻的 cx）
      idx, // velocitySourceIndex = cx / tabW
      vtRawCx.value, // VelocityTracker 结果（dp/s）
      vtRawIndex.value, // VelocityTracker 结果（index/s）
      vtCount.value, // velocityTrackerSampleCount
      offsetAnim.value, // 官方 offsetAnimation（dp）
      panelOffset.value, // 官方 panelOffset = 4dp · sign · EaseOut(|clamp(offset/dockW)|)
    ]);
    if (next.length >= 16 * 20) {
      recBuf.value = [];
      runOnJS(flushChunk)(next);
    } else {
      recBuf.value = next;
    }
  });

  // 官方 press()：velocityTracker.resetTracking() + 并行启动 pressProgress / scaleX / scaleY
  const press = () => {
    "worklet";
    vtHist.value = []; // 官方 velocityTracker.resetTracking()
    vtRawIndex.value = 0;
    vtRawCx.value = 0;
    vtCount.value = 0;
    vtFeed.value = 1; // 进入「拖拽驱动 value 动画」期间，开始逐帧采样
    pressProgress.value = withSpring(1, SP_PRESS);
    scaleX.value = withSpring(PRESSED_SCALE, SP_SCALE_X);
    scaleY.value = withSpring(PRESSED_SCALE, SP_SCALE_Y);
    runOnJS(setPressActiveJS)(true);
  };

  // 官方 release()：等 value 收敛后再 retract（不是同时回弹）
  useAnimatedReaction(
    () => cx.value,
    (v) => {
      if (awaitingRetract.value && Math.abs(v - settleCx.value) < retractThreshold) {
        awaitingRetract.value = false;
        pressProgress.value = withSpring(0, SP_PRESS);
        scaleX.value = withSpring(1, SP_SCALE_X);
        scaleY.value = withSpring(1, SP_SCALE_Y);
        runOnJS(setPressActiveJS)(false);
      }
    }
  );

  // 官方 LaunchedEffect + animateToValue（索引变化：press → 弹簧到目标 → release）
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return; // 官方 .drop(1)：跳过首次
    }
    settleCx.value = cxFor(activeIndex);
    targetCx.value = cxFor(activeIndex);
    cx.value = withSpring(cxFor(activeIndex), SP_VALUE);
    // v0.60.2：程序化切 tab（官方 animateToValue）路径下 valueAnimation.animateTo
    // 无 updateVelocity 块 → 不采样；且官方显式 velocityAnimation.animateTo(0f)
    vtFeed.value = 0;
    vtHist.value = [];
    vel.value = withSpring(0, SP_VELOCITY);
    pressProgress.value = withSpring(1, SP_PRESS);
    scaleX.value = withSpring(PRESSED_SCALE, SP_SCALE_X);
    scaleY.value = withSpring(PRESSED_SCALE, SP_SCALE_Y);
    awaitingRetract.value = true;
    setPressActiveJS(true);
  }, [activeIndex, tabW]);

  // 官方 valueRange = 0f..(tabsCount-1)：拖拽范围就是首末 tab 中心之间，两端对称。
  // v0.60.4 修正：原 maxCx = INNER_PAD + dockW - INNER_PAD - tabW/2 中
  //   +INNER_PAD -INNER_PAD 相消 → dockW - tabW/2 = 281，比官方 valueRange 的
  //   上界（index n-1 → cx 277）多出 4dp（= INNER_PAD），左右不对称。
  const minCx = cxFor(0); // 官方 index 0
  const maxCx = cxFor(n - 1); // 官方 index n-1

  // 官方 onDragEnd / onDragCancel 的共同路径：onDragStopped() + release()
  //   onDragStopped：targetIndex = valueAnimation.targetValue.fastRoundToInt()
  //                  .fastCoerceIn(0, tabsCount-1) → 吸附 → animateToValue()
  //   release()：等 |value - target| < 2.5% × span 后再 retract（由 useAnimatedReaction 承担）
  const endDrag = () => {
    "worklet";
    if (dragActive.value === 0) return; // onEnd 与 onFinalize 只执行一次
    dragActive.value = 0;
    // 官方用的是 valueAnimation.targetValue（弹簧目标），不是当前 value；
    // targetCx 与 cx 的弹簧目标始终成对赋值，故它就是 targetValue 的等价量
    const target = CLAMP(
      Math.round((targetCx.value - INNER_PAD) / tabW - 0.5),
      0,
      n - 1
    );
    const tEnd = INNER_PAD + tabW * (target + 0.5);
    targetCx.value = tEnd;
    settleCx.value = tEnd;
    cx.value = withSpring(tEnd, SP_VALUE);
    // v0.60.2：松手等价于官方 onDragStopped() → animateToValue()，
    // 而 animateToValue 内部是：press()（velocityTracker.resetTracking()）
    //   + valueAnimation.animateTo(target, spec)   ← 该 animateTo 无 updateVelocity 块
    //   + if (velocity != 0f) velocityAnimation.animateTo(0f, velocityAnimationSpec)
    // 即：松手时采样停止、tracker 清空、velocity 由 velocity 弹簧送回 0。
    // （注意 release() 本身确实不碰 velocity，但松手路径同时走了 animateToValue）
    vtFeed.value = 0;
    vtHist.value = [];
    if (vel.value !== 0) vel.value = withSpring(0, SP_VELOCITY);
    // v0.60.5：官方 onDragStopped 里 offsetAnimation.animateTo(0f, spring(1f, 300f, 0.5f))
    // （onDragCancel 也走 onDragStopped，故这里一并覆盖）
    offsetAnim.value = withSpring(0, SP_OFFSET);
    awaitingRetract.value = true;
    runOnJS(mark)("END");
    // v0.60.8：官方 InteractiveHighlight onDragEnd/onDragCancel（抬起瞬间回弹）
    runOnJS(setHighlightActiveJS)(false);
    if (target !== activeIndex) {
      runOnJS(onSelect)(target);
    }
  };

  const pan = Gesture.Pan()
    .minDistance(0)
    .onStart(() => {
      // 官方 onDragStart → press()（不加任何即时位移）
      dragActive.value = 1;
      runOnJS(mark)("START");
      press();
      // v0.60.8：官方 InteractiveHighlight gestureModifier onDragStart（按下瞬间）
      runOnJS(setHighlightActiveJS)(true);
    })
    // 用 onChange 而不是 onUpdate：RNGH 只在 onChange 里附上 changeX/changeY
    // （eventReceiver.ts:104-114 / useAnimatedGesture.ts:181-195，
    //  onUpdate 拿到的是不含 changeX 的原始 event）
    .onChange((e) => {
      // 官方 onDrag：updateValue(targetValue + dragAmount.x / tabWidth)
      //   - dragAmount 是【逐事件增量】（Compose positionChange / RNGH changeX），
      //     不是从按下位置累加的总位移
      //   - 累加基数是 valueAnimation.targetValue（已是 clamp 后的值），
      //     因此越界拖动不会累积“待抵消”的死区，回拖立即生效
      const next = CLAMP(targetCx.value + e.changeX, minCx, maxCx);
      targetCx.value = next;
      cx.value = withSpring(next, SP_VALUE);
      // v0.60.5：官方 onDrag 里与 updateValue 并列的 offsetAnimation.snapTo(... + dragAmount.x)
      // 注意官方用的是【原始 dragAmount.x】（不做 isLtr 取反），且不 clamp
      offsetAnim.value = offsetAnim.value + e.changeX;
      // v0.60.2：velocity 不再取自手指速度 e.velocityX，
      // 改由 useFrameCallback 逐帧采样 cx（post-spring）经 VelocityTracker 得到
    })
    .onEnd(() => {
      endDrag();
    })
    .onFinalize(() => {
      // 官方 onDragCancel 与 onDragEnd 完全相同：onDragStopped() + release()
      // RNGH 的 onFinalize 在 END 与 CANCELLED 都会触发，由 dragActive 去重
      endDrag();
    });

  // 官方镜片 layerBlock：scaleX / scaleY 独立通道 + 速度液态形变（有符号，禁止 abs）
  const lensStyle = useAnimatedStyle(() => {
    const v10 = vel.value / 10;
    const vx = CLAMP(v10 * 0.75, -0.2, 0.2);
    const vy = CLAMP(v10 * 0.25, -0.2, 0.2);
    return {
      transform: [
        { translateX: cx.value - lensW / 2 },
        { scaleX: scaleX.value / (1 - vx) },
        { scaleY: scaleY.value * (1 - vy) },
      ],
    };
  });

  // 官方 dock layerBlock：lerp(1, 1 + 16dp / size.width, pressProgress)
  const bgScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + (16 / dockW) * pressProgress.value }],
  }));

  // v0.60.9：官方 LocalLiquidBottomTabScale —— provider 只包裹 Row#2（LiquidBottomTabs.kt:190-194），
  // lerp(1, 1.2, pressProgress) = 1 + 0.2×pressProgress，作用于隐藏副本每个 tab 单元
  // （LiquidBottomTab.kt:40-44，graphicsLayer 默认原点=单元中心）。UI 线程直驱，
  // 静止 p=0 → scale=1，静置外观与 v0.60.8 逐像素一致；可见层2 不受影响
  const accentTabScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + (TAB_PRESSED_SCALE - 1) * pressProgress.value }],
  }));

  // v0.61.1-diy：玻璃表面颜色由 DIY_THEMES[route].glass 组合（base+tint+tintAlpha），
  // 经既有 surfaceColor prop 下发（原生零改动）；无 DIY 配置时精确回退纯白表面
  const diySurface = useMemo(() => {
    const g = diy?.glass;
    if (!g) return "rgba(250, 250, 250, 0.4)";
    if (!g.tint) return g.base;
    return blendRgba(g.base, g.tint, g.tintAlpha);
  }, [diy]);

  return (
    // v0.60.5：官方 panelOffset 的图形层落点。
    // 官方 LiquidBottomTabs 对两处 Row 施加 `graphicsLayer { translationX = panelOffset }`：
    //   Row#1（LiquidBottomTabs.kt:161-188）= 可见玻璃胶囊 Row，含 tab 内容（= 本项目 层1 + 层2）
    //   Row#2（LiquidBottomTabs.kt:195-202）= 隐藏强调色副本 Row（= 本项目 accent-tabs 源层）
    // 官方镜片不在这两处（LiquidBottomTab 只做 clip+clickable+tabScale）；本项目镜片是自有元素，
    // 与上述两 Row 同属面板，故统一由面板根节点平移，等价于官方两处 Row 同时平移。
    <Animated.View
      pointerEvents="box-none"
      style={[
        {
          position: "absolute",
          bottom: insets.bottom + DOCK_BOTTOM_MARGIN,
          left: DOCK_SIDE_MARGIN,
          right: DOCK_SIDE_MARGIN,
          height: DOCK_HEIGHT,
          // overflow visible 必须保留（v0.60.13 起与 Debug Overlay 无关）：
          // 按压时镜片 scale 1.393 会超出面板上下边界，隐藏会裁掉镜片
          overflow: "visible",
        },
        panelStyle,
      ]}
    >
      {/* 隐藏强调色副本层（源码 Row#2：alpha(0f)+layerBackdrop(tabsBackdrop)，
          LiquidBottomTabs.kt:195-228）：内容只进背景层不上屏；布局与真实按钮行完全对齐。
          v0.60.12：importantForAccessibility=no-hide-descendants 等价官方 Row#2 的
          clearAndSetSemantics{}（:197）——隐藏副本不进入无障碍树，防止 TalkBack 重复朗读 */}
      <BackdropSource
        sourceId="accent-tabs"
        active
        captureOnly
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        style={StyleSheet.absoluteFill}
      >
        {/* Row#2 玻璃输出（LiquidBottomTabs.kt:203-220）：
            vibrancy + blur(8dp) + lens(24dp×progress, 24dp×progress)
            + Highlight.Default.copy(alpha=progress) + surface containerColor（恒定）。
            官方 shadow 走默认 Shadow.Default，但其本体在胶囊内被 CLEAR 挖空、
            镜片只采样胶囊内部 → 不绘制无视觉差；无 innerShadow。 */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 4,
            left: 0,
            right: 0,
            height: DOCK_HEIGHT - 8,
          }}
        >
          <GlassEffect
            sources={[pageSourceId]}
            cornerRadius={(DOCK_HEIGHT - 8) / 2}
            blurRadius={8}
            lensHeight={24}
            lensAmount={24}
            vibrancy
            pressed={pressActive}
            surfaceColor={diySurface}
            pressedSurfaceColor={diySurface}
            highlight
            // v0.60.8：官方 InteractiveHighlight.modifier 同挂在 Row#2（:221）——
            // 高光输出随 tabsBackdrop 层进入运动镜片的采样
            interactiveHighlight
            highlightPressed={highlightActive}
            highlightAnchor="lens"
            highlightAnchorInset={INNER_PAD}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        </View>
        <View
          style={{
            flexDirection: "row",
            height: DOCK_HEIGHT,
            paddingTop: 4,
            paddingHorizontal: INNER_PAD,
          }}
        >
          {tabs.map((t) => (
            <Animated.View
              key={t.key}
              style={[
                {
                  width: tabW,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 1,
                },
                // v0.60.9：官方 LocalLiquidBottomTabScale（仅 Row#2 副本），默认中心缩放
                accentTabScaleStyle,
              ]}
            >
              {t.icon(true, themeColor.primary)}
              <Text
                style={{
                  fontSize: 11,
                  color: themeColor.primary,
                  fontWeight: "500",
                  textAlign: "center",
                }}
                numberOfLines={1}
              >
                {t.label}
              </Text>
            </Animated.View>
          ))}
        </View>
      </BackdropSource>

      {/* 层 1：dock 胶囊玻璃（源码 vibrancy + blur(8dp) + lens(24dp,24dp)
          + 表面 FAFAFA 40%；折射的是声明的页面背景层，按钮永不被卷入）。
          按压时整体轻微放大（源码 dock layerBlock） */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            ...StyleSheet.absoluteFill,
            borderRadius: 32,
          },
          bgScaleStyle,
        ]}
      >
        <GlassEffect
          sources={[pageSourceId]}
          cornerRadius={32}
          blurRadius={8}
          lensHeight={24}
          lensAmount={24}
          lensAlwaysOn
          vibrancy
          // v0.60.6：官方 dock Row#1 drawBackdrop 未显式传 highlight/shadow，
          // 走默认参数（Highlight.Default / Shadow.Default，alpha 恒 1）
          highlight
          shadow
          surfaceColor={diySurface}
          pressedSurfaceColor={diySurface}
          // v0.60.8：官方 InteractiveHighlight.modifier 挂在 Row#1（:182）——
          // surface 之上的白 8%×p 全场提亮 + AGSL 径向光斑（位置=胶囊中心+panelOffset）
          interactiveHighlight
          highlightPressed={highlightActive}
          highlightAnchor="lens"
          highlightAnchorInset={INNER_PAD}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      </Animated.View>

      {/* 层 2：tab 按钮行（源码 LocalLiquidBottomTabScale：镜片按下时
          内容放大 1.2；选中项触摸穿透到镜片把手） */}
      <View
        pointerEvents="box-none"
        style={{
          flexDirection: "row",
          flex: 1,
          paddingHorizontal: INNER_PAD,
        }}
      >
        {tabs.map((t, i) => (
          <DockTabButton
            key={t.key}
            tab={t}
            focused={i === activeIndex}
            passThrough={i === activeIndex}
            pressProgress={pressProgress}
            themeColor={themeColor}
            diyTab={diy?.tab}
            width={tabW}
            onPress={() => {
              hapticLight();
              onSelect(i);
            }}
          />
        ))}
      </View>

      {/* 层 3：运动镜片（源码 Box + dampedDragAnimation）。
          静止 = 黑 10% 灰胶囊（progress=0，无折射无模糊）；
          按压/拖拽 = lens(10dp,14dp×progress) + 色散实时折射
          [页面 + 强调色副本] 合成层，镜片放大 78/56，横向液态拉伸 */}
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            {
              position: "absolute",
              top: 4,
              left: 0,
              width: lensW,
              height: lensH,
            },
            lensStyle,
          ]}
        >
          <GlassEffect
            sources={[pageSourceId, "accent-tabs"]}
            cornerRadius={lensRadius}
            blurRadius={0}
            lensHeight={10}
            lensAmount={14}
            chromatic
            pressed={pressActive}
            surfaceColor="rgba(0, 0, 0, 0.1)"
            pressedSurfaceColor="rgba(0, 0, 0, 0.03)"
            highlight
            shadow
            innerShadow
            // v0.60.8：官方 gestureModifier 挂在运动镜片 Box 上（:239）——
            // 镜片自身不画高光，仅作为 dock/Row#2 高光的位置锚点（effectId）
            effectId="lens"
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        </Animated.View>
      </GestureDetector>

      {/* v0.60.13 出厂清理：DebugOverlay（黑色调试数据面板）已移除——
          仅删除其 UI 渲染；观测变量与 CSV 记录链路（useFrameCallback→recBuf→
          flushChunk→DebugDump）完整保留，动画逻辑零改动 */}
    </Animated.View>
  );
};

const DockTabButton = ({
  tab,
  focused,
  passThrough,
  pressProgress,
  themeColor,
  diyTab,
  width,
  onPress,
}: {
  tab: GlassDockTab;
  focused: boolean;
  /** 选中项：触摸穿透到上层镜片把手（镜片即拖把手） */
  passThrough: boolean;
  /** 官方 LocalLiquidBottomTabScale 由连续 pressProgress 驱动 */
  pressProgress: SharedValue<number>;
  themeColor: any;
  /** v0.61.1-diy：当前 route 的 DIY tab 颜色（缺省回落 themeColor） */
  diyTab?: DIYTabConfig;
  width: number;
  onPress: () => void;
}) => {
  const [pressedIn, setPressedIn] = useState(false);
  // Catalog：选中 tab 的图标+文字用强调色（蓝），未选中用中性色
  // v0.61.1-diy：DIY tab 颜色优先，缺省回落 themeColor
  const iconColor = focused
    ? diyTab?.selectedIcon ?? themeColor.primary
    : diyTab?.unselectedIcon ?? themeColor.onSurfaceVariant;
  const textColor = focused
    ? diyTab?.selectedText ?? iconColor
    : diyTab?.unselectedText ?? iconColor;
  // v0.60.11（差异⑤裁决）：移除可见 Row#1 选中 tab 的 1.06 静置放大——
  //   2026-09-27 审计确认 1.06 与按压动力学零交互、仅为静置选中强调（+5.66%），
  //   且玻璃设计下选中强调已由 accent 颜色 + 镜片停驻 + 副本放大承担；
  //   现可见内容缩放与官方 Row#1（恒 1.0）完全一致。保留三元结构便于将来调档。
  const focusScale = focused ? 1.0 : 1;
  const tabScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: focusScale }],
  }));
  return (
    <View pointerEvents={passThrough ? "none" : "auto"} style={{ width }}>
      {/* RNGH 的 Touchable：与镜片拖拽同一编排体系，tap 不会被吞 */}
      <GHTouchable
        onPress={onPress}
        onPressIn={() => setPressedIn(true)}
        onPressOut={() => setPressedIn(false)}
        style={{
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Animated.View
          style={[
            {
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
            },
            tabScaleStyle,
          ]}
        >
          <View style={{ position: "relative" }}>
            {tab.icon(focused, iconColor)}
            {tab.badge}
          </View>
          <Text
            style={{
              fontSize: 11,
              color: textColor,
              fontWeight: focused ? "500" : "400",
              textAlign: "center",
            }}
            numberOfLines={1}
          >
            {tab.label}
          </Text>
        </Animated.View>
      </GHTouchable>
    </View>
  );
};
