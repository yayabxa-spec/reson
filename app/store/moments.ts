import {
  sqlDeleteMoment,
  sqlReadAllMoments,
  sqlWriteMoment,
} from "./appDb";

// ============================================================
// 好友动态（纯文字版 v1）
// - 用户/角色都能发动态（角色动态由 AI 导演排期生成）
// - 可见性：全部人 / 仅自己 / 不给谁看 / 部分可见
// - 点赞 / 评论；互动写入角色记忆
// ============================================================

export interface MomentAuthor {
  type: "user" | "role";
  name: string; // 显示名
  avatar?: string;
  roleId?: string; // type=role 时的角色 id
}

export type MomentVisibilityType = "all" | "private" | "whitelist" | "blacklist";

export interface MomentVisibility {
  type: MomentVisibilityType;
  /** whitelist=仅这些角色可见；blacklist=这些角色不可见 */
  roleIds?: string[];
}

export interface LocalMoment {
  id: string;
  author: MomentAuthor;
  contentText: string;
  contentType: "text" | "img" | "video"; // v1 只用 text，img/video 结构保留
  imgList: string[];
  createdAt: number;
  likes: { name: string }[];
  comments: { id: string; name: string; comment: string; replyTo?: string }[];
  visible: MomentVisibility;
}

export async function getLocalMoments(): Promise<LocalMoment[]> {
  try {
    return await sqlReadAllMoments<LocalMoment>();
  } catch {}
  return [];
}

export async function addLocalMoment(m: LocalMoment): Promise<void> {
  await sqlWriteMoment(m);
  eventBusEmit();
}

export async function toggleLocalLike(momentId: string, name: string) {
  const list = await getLocalMoments();
  if (!list.some((m) => m.id === momentId)) return;
  const next = list.map((m) => {
    if (m.id !== momentId) return m;
    const has = m.likes.some((l) => l.name === name);
    return {
      ...m,
      likes: has
        ? m.likes.filter((l) => l.name !== name)
        : [...m.likes, { name }],
    };
  });
  const updated = next.find((m) => m.id === momentId);
  if (updated) await sqlWriteMoment(updated);
  eventBusEmit();
}

export async function addLocalComment(
  momentId: string,
  name: string,
  comment: string,
  triggerReply = true,
  replyTo?: string
) {
  const list = await getLocalMoments();
  const next = list.map((m) =>
    m.id === momentId
      ? {
          ...m,
          comments: [
            ...m.comments,
            {
              id: "c" + Date.now() + Math.floor(Math.random() * 1000),
              name,
              comment,
              replyTo,
            },
          ],
        }
      : m
  );
  const updated = next.find((m) => m.id === momentId);
  if (updated) await sqlWriteMoment(updated);
  eventBusEmit();
  // 用户评论角色动态 → 角色延迟回复（角色自己的回复不触发，防循环）
  if (triggerReply) {
    const target = next.find((m) => m.id === momentId);
    if (target?.author.type === "role" && target.author.roleId) {
      try {
        const { scheduleRoleReplyToComment } = await import("./momentsReplies");
        scheduleRoleReplyToComment(
          momentId,
          target.author.roleId,
          target.author.name,
          comment,
          target.contentText
        ).catch(() => {});
      } catch {}
    }
  }
}

/** 删除动态（仅用户自己的动态） */
export async function deleteLocalMoment(momentId: string): Promise<void> {
  await sqlDeleteMoment(momentId);
  eventBusEmit();
}

/** 删除评论（按评论 id） */
export async function deleteLocalComment(
  momentId: string,
  commentId: string
): Promise<void> {
  const list = await getLocalMoments();
  const next = list.map((m) =>
    m.id === momentId
      ? { ...m, comments: m.comments.filter((c) => c.id !== commentId) }
      : m
  );
  const updated = next.find((m) => m.id === momentId);
  if (updated) await sqlWriteMoment(updated);
  eventBusEmit();
}

/** 可见性判断：某条动态是否对指定角色可见（决定角色能否感知/回应） */
export function isMomentVisibleToRole(
  m: LocalMoment,
  roleId: string
): boolean {
  const v = m.visible || { type: "all" };
  if (v.type === "all") return true;
  if (v.type === "private") return false;
  if (v.type === "whitelist") return !!v.roleIds?.includes(roleId);
  if (v.type === "blacklist") return !v.roleIds?.includes(roleId);
  return true;
}

/** 获取某角色可见的动态（用户视角：自己的动态 + 可见的角色动态） */
export async function getVisibleMoments(
  friendRoleIds: string[]
): Promise<LocalMoment[]> {
  const all = await getLocalMoments();
  return all.filter(
    (m) => m.author.type === "user" || friendRoleIds.includes(m.author.roleId || "")
  );
}

/** 生成一条动态（用户或角色发布通用） */
export async function createMoment(params: {
  author: MomentAuthor;
  contentText: string;
  visible?: MomentVisibility;
}): Promise<LocalMoment> {
  const m: LocalMoment = {
    id: "mom-" + Date.now() + Math.floor(Math.random() * 1000),
    author: params.author,
    contentText: params.contentText.trim(),
    contentType: "text",
    imgList: [],
    createdAt: Date.now(),
    likes: [],
    comments: [],
    visible: params.visible || { type: "all" },
  };
  await addLocalMoment(m);
  // 用户发布的动态：安排可见角色来评论
  if (m.author.type === "user" && (!m.visible || m.visible.type === "all")) {
    try {
      const { scheduleRoleReplies } = await import("./momentsReplies");
      scheduleRoleReplies(m).catch(() => {});
    } catch {}
  }
  return m;
}

function eventBusEmit() {
  try {
    const eventBus = require("../utils/eventBus").default;
    eventBus.emit("moments-updated");
  } catch {}
}
