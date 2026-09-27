import AsyncStorage from "../utils/storage";
import { chatCompletion, AIConfig } from "../utils/ai";
import { resolveRoleConfig } from "./models";
import { getFriendRoles } from "./worldline";
import { createMoment } from "./moments";
import { appendMemory } from "./memory";
import { readConversationsRaw } from "./localChat";
import {
  fillTemplate,
  PROMPT_DEFAULTS,
  resolvePrompt,
} from "./promptEditing";

// ============================================================
// 角色动态生成：AI 导演每天排期，随机选部分已添加角色，
// 让角色按性格和当天状态发一条朋友圈文案（纯文字）。
// 写入动态流 + 角色记忆（type=life）。
// ============================================================

const GEN_KEY = "wc_moments_gen_date"; // 当天已生成的角色 id 列表

/** 为单个角色生成一条朋友圈文案 */
async function generateMomentText(
  role: { id: string; name: string; persona?: string },
  config: AIConfig,
  today: string
): Promise<string> {
  let prompt = fillTemplate(
    await resolvePrompt("moments", PROMPT_DEFAULTS.moments),
    { 角色名: role.name, 角色设定: role.persona || "", 日期: today }
  );
  // 动态跟上剧情：注入会话剧情梗概（自然呼应，不直接复述）
  try {
    const convos = await readConversationsRaw();
    const summaryText = convos.find((c) => c.id === "role-" + role.id)?.summary;
    if (summaryText?.trim()) {
      prompt += `\n\n（你们最近的剧情梗概，动态内容可以自然呼应其中的人和事，但不要直接复述聊天内容）\n${summaryText}`;
    }
  } catch {}
  try {
    const reply = await chatCompletion(
      config,
      [{ role: "user", content: prompt }],
      {
        temperature: 0.9,
        maxTokens: 200,
        noThinking: true,
        roleId: role.id,
        scene: "动态生成",
      }
    );
    let clean = (reply || "")
      .replace(/<think>[\s\S]*?<\/think>/g, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/?[a-zA-Z][^>]*>/g, "")
      .trim();
    // 兜底：如果模型仍输出"任务理解/分析"段（以"用户要求/首先/我需要/扮演"等开头），
    // 取最后一段对话式内容（通常是真正的动态文案）
    if (
      /^(用户要求|首先|我需要|好的|明白了|让我|作为)/.test(clean) ||
      clean.length > 180
    ) {
      const parts = clean.split(/\n+/).map((s) => s.trim()).filter(Boolean);
      const last = parts[parts.length - 1] || clean;
      clean = last;
    }
    return clean.slice(0, 120);
  } catch {
    return "";
  }
}

/**
 * 导演排期角色动态：每天最多给 1~2 个角色生成动态（不刷屏）。
 * 有当天标记的角色不再重复生成。
 */
export async function generateRoleMoments(): Promise<void> {
  try {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(
      today.getMonth() + 1
    ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const raw = await AsyncStorage.getItem(GEN_KEY);
    const done: string[] = raw ? JSON.parse(raw) : [];
    if (done.includes(todayStr)) return; // 今天已生成过

    const friends = await getFriendRoles();
    if (!friends.length) return;
    const config = await resolveRoleConfig(undefined, "text");
    if (!config) return;

    // 随机选 1~2 个角色（当天还没生成过的）
    const candidates = friends.filter((f) => !done.includes(f.id));
    if (!candidates.length) return;
    const shuffled = [...candidates].sort(() => Math.random() - 0.5);
    const picked = shuffled.slice(0, Math.min(2, shuffled.length));

    for (const r of picked) {
      const text = await generateMomentText(r, config, todayStr);
      if (!text) continue;
      await createMoment({
        author: {
          type: "role",
          name: r.remark || r.name,
          avatar: r.avatar,
          roleId: r.id,
        },
        contentText: text,
        visible: { type: "all" },
      });
      // 记忆：角色记得自己发过这条动态
      await appendMemory(r.id, `我发了一条动态：${text}`, "auto", {
        type: "life",
        occurredAt: Date.now(),
      }).catch(() => {});
      done.push(r.id);
    }
    done.push(todayStr);
    await AsyncStorage.setItem(GEN_KEY, JSON.stringify(done));
  } catch {}
}
