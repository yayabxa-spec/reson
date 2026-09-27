import { chatCompletion } from "../utils/ai";
import { resolveRoleConfig } from "./models";
import {
  fillTemplate,
  PROMPT_DEFAULTS,
  resolvePrompt,
} from "./promptEditing";
import { cleanChatText } from "../utils/sanitize";

// ============================================================
// 角色卡体检：让角色对几个日常场景各回一条短消息，
// 再交给评审模型检查口癖/性格/OOC/说话风格，输出优化建议。
// ============================================================

const SCENES = [
  "和你打招呼（你们第一次聊天）",
  "你说'今天心情不太好'，安慰你",
  "你夸'你今天真好看'",
  "你约 TA 周末一起出去玩",
  "你开玩笑说 TA 的坏话",
];

export async function runRoleCheck(role: {
  id?: string;
  name: string;
  persona?: string;
  bio?: string;
  temperature?: number;
  modelIds?: any;
}): Promise<string> {
  let config = await resolveRoleConfig(undefined, "text");
  try {
    const resolved = await resolveRoleConfig(role.modelIds, "text");
    if (resolved) config = resolved;
  } catch {}
  if (!config?.apiKey) throw new Error("请先在模型管理中配置模型");

  // 1) 测试扮演
  const playPrompt = fillTemplate(
    await resolvePrompt("roleCheckPlay", PROMPT_DEFAULTS.roleCheckPlay),
    {
      角色名: role.name,
      角色设定: role.persona || "（无详细设定）",
      简介: role.bio ? `\n简介：${role.bio}` : "",
      场景: SCENES.map((s, i) => `${i + 1}. ${s}`).join("\n"),
    }
  );
  const play = await chatCompletion(
    config,
    [{ role: "user", content: playPrompt }],
    {
      temperature: role.temperature ?? 0.9,
      maxTokens: 800,
      roleId: role.id,
      scene: "角色卡体检",
    }
  );

  // 2) 质量评审
  const reviewPrompt = fillTemplate(
    await resolvePrompt("roleCheckReview", PROMPT_DEFAULTS.roleCheckReview),
    {
      角色名: role.name,
      角色设定: role.persona || "（无详细设定）",
      测试回复: cleanChatText(play),
    }
  );
  const report = await chatCompletion(
    config,
    [{ role: "user", content: reviewPrompt }],
    {
      temperature: 0.3,
      maxTokens: 1200,
      roleId: role.id,
      scene: "角色卡体检",
    }
  );
  return report.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}
