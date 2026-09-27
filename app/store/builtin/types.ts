export interface RoleBackgroundItem {
  title: string;
  content: string;
  tags?: string[];
}

/** 角色对你的称呼（结构化变体，由角色卡生成端提供；App 按用户性别解析） */
export interface RoleCallNameVariants {
  male?: string;
  female?: string;
  neutral?: string;
}

export type RoleCallName = string | RoleCallNameVariants;

export interface BuiltinRoleData {
  name: string;
  work: string;
  region: string;
  persona: string;
  greeting?: string;
  /** 语音频率倾向：often/rare，缺省 sometimes（由角色性格决定，写入提示词） */
  voiceRate?: "rare" | "sometimes" | "often";
  bio?: string;
  callName?: RoleCallName;
  storyState?: string;
  background?: RoleBackgroundItem[];
}
