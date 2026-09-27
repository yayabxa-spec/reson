import type { WithSpringConfig, WithTimingConfig } from 'react-native-reanimated';

/**
 * 全局统一动画参数（spring 三档 + timing 时长）
 * 所有新动画从这里取参数，保证全 app 手感一致，避免各处调参不一致。
 */

export const springs: {
  /** 按压回弹：快而稳，几乎无过冲 */
  snappy: WithSpringConfig;
  /** 浮层/卡片入场：轻微过冲，柔和不拖沓 */
  gentle: WithSpringConfig;
  /** 强调弹跳（tab 选中、图标抖动）：明显过冲，弹性足 */
  bouncy: WithSpringConfig;
} = {
  snappy: { damping: 28, stiffness: 420, mass: 0.9 },
  gentle: { damping: 20, stiffness: 300, mass: 1 },
  bouncy: { damping: 12, stiffness: 260, mass: 1 },
};

/** withTiming 通用时长（毫秒） */
export const durations: {
  /** 按下反馈、微位移 */
  fast: number;
  /** 一般过渡 */
  normal: number;
  /** 遮罩淡出等较慢过渡 */
  slow: number;
} = { fast: 100, normal: 220, slow: 320 };

/** 3D 透视基准值（配合 rotateX/rotateY 使用） */
export const PERSPECTIVE = 800;

export type { WithTimingConfig };
