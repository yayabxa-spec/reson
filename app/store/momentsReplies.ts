import { chatCompletion } from "../utils/ai";
import { resolveRoleConfig } from "./models";
import {
  addLocalComment,
  isMomentVisibleToRole,
  LocalMoment,
  toggleLocalLike,
} from "./moments";
import { getFriendRoles } from "./worldline";
import { appendMemory } from "./memory";
import { addMomentsUnread } from "./momentsNotify";
import {
  fillTemplate,
  PROMPT_DEFAULTS,
  resolvePrompt,
} from "./promptEditing";

// ============================================================
// 角色互动回应：
// 1) 用户发动态 → 1~2 个可见角色延迟评论（AI 按性格生成）
// 2) 用户评论角色动态 → 该角色延迟回复评论
// 互动写入角色记忆（type=event）
// ============================================================

async function generateComment(
  role: { id: string; name: string; persona?: string },
  context: string,
  mode: "comment" | "reply",
  userComment?: string
): Promise<string> {
  let config = await resolveRoleConfig(undefined, "text");
  try {
    const resolved = await resolveRoleConfig(role.modelIds as any, "text");
    if (resolved) config = resolved;
  } catch {}
  if (!config) return "";
  const modeText =
    mode === "comment"
      ? `看到了一条动态，请以你的性格评论一句（10~40 字，像真人朋友圈评论）。`
      : `用户在你的动态下评论了，请以你的性格回复这条评论（10~40 字，像真人回复朋友圈）。`;
  const prompt = fillTemplate(
    await resolvePrompt("momentsReplies", PROMPT_DEFAULTS.momentsReplies),
    {
      角色名: role.name,
      角色设定: role.persona || "",
      模式提示: modeText,
      动态内容: context,
      用户评论: userComment ? `\n用户评论：${userComment}` : "",
    }
  );
  try {
    const reply = await chatCompletion(
      config,
      [{ role: "user", content: prompt }],
      {
        temperature: 0.9,
        maxTokens: 120,
        noThinking: true,
        roleId: role.id,
        scene: "动态互动",
      }
    );
    return (reply || "")
      .replace(/<think>[\s\S]*?<\/think>/g, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/?[a-zA-Z][^>]*>/g, "")
      .trim()
      .slice(0, 80);
  } catch {
    return "";
  }
}

/** 用户发布动态后：选可见角色 1~2 个，延迟评论 */
export async function scheduleRoleReplies(moment: LocalMoment): Promise<void> {
  try {
    const friends = await getFriendRoles();
    const visible = friends.filter((f) => isMomentVisibleToRole(moment, f.id));
    const picked = [...visible]
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(2, visible.length));
    picked.forEach((r, i) => {
      setTimeout(async () => {
        const roleName = r.remark || r.name;
        // 35% 概率点赞，否则评论（互动都会产生未读）
        if (Math.random() < 0.35) {
          await toggleLocalLike(moment.id, roleName);
          await appendMemory(
            r.id,
            `我点赞了「${moment.author.name}」的动态`,
            "auto",
            { type: "event" }
          ).catch(() => {});
          await addMomentsUnread({
            id:
              "mu-" +
              Date.now() +
              Math.floor(Math.random() * 1000),
            type: "like",
            roleName,
            content: "赞了你的动态",
            momentId: moment.id,
            createdAt: Date.now(),
          });
          return;
        }
        const text = await generateComment(
          r,
          moment.contentText,
          "comment"
        );
        if (!text) return;
        await addLocalComment(moment.id, roleName, text, false);
        await appendMemory(
          r.id,
          `我在「${moment.author.name}」的动态下评论了：${text}`,
          "auto",
          { type: "event" }
        ).catch(() => {});
        await addMomentsUnread({
          id: "mu-" + Date.now() + Math.floor(Math.random() * 1000),
          type: "comment",
          roleName,
          content: text,
          momentId: moment.id,
          createdAt: Date.now(),
        });
      }, 15000 + i * 12000 + Math.random() * 8000);
    });
  } catch {}
}

/** 用户评论角色动态后：该角色延迟回复 */
export async function scheduleRoleReplyToComment(
  momentId: string,
  roleId: string,
  roleName: string,
  userComment: string,
  momentContent: string
): Promise<void> {
  setTimeout(async () => {
    try {
      const roles = await (await import("./roles")).readRolesRaw();
      const role = roles.find((x) => x.id === roleId);
      if (!role) return;
      const text = await generateComment(
        role,
        momentContent,
        "reply",
        userComment
      );
      if (!text) return;
      await addLocalComment(momentId, role.remark || roleName, text, false, "我");
      await appendMemory(
        roleId,
        `用户在我的动态下评论了「${userComment}」，我回复了：${text}`,
        "auto",
        { type: "event" }
      ).catch(() => {});
      await addMomentsUnread({
        id: "mu-" + Date.now() + Math.floor(Math.random() * 1000),
        type: "reply",
        roleName: role.remark || roleName,
        content: text,
        momentId,
        createdAt: Date.now(),
      });
    } catch {}
  }, 10000 + Math.random() * 8000);
}
