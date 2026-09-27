import { memo, useMemo } from "react";
import { Image, StyleProp, Text, View, ViewStyle } from "react-native";
import { ROLE_AVATARS, resolveRoleAvatar } from "../../../store/roles";

const PALETTE = [
  "#5B8DEF",
  "#5B67F1",
  "#F5A623",
  "#E85D75",
  "#8E6FE8",
  "#00B8A9",
  "#EF8354",
  "#4C9F70",
  "#6C7A89",
  "#B08768",
];

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * 角色头像统一渲染：
 * - 自定义图片（data:/file:/content: URI）或预设 key → 显示图片
 * - 其余（内置角色名 key）→ 显示首字占位块，后续接入真实头像资源时直接替换
 */
const RoleAvatar = memo(
  ({
    avatar,
    name = "",
    size = 44,
    rounded = false,
    style,
  }: {
    avatar?: string;
    name?: string;
    size?: number;
    rounded?: boolean;
    style?: StyleProp<ViewStyle>;
  }) => {
    const isImage = useMemo(() => {
      if (!avatar) return false;
      if (
        avatar.startsWith("data:") ||
        avatar.startsWith("file:") ||
        avatar.startsWith("content:")
      ) {
        return true;
      }
      return !!ROLE_AVATARS[avatar];
    }, [avatar]);

    if (isImage) {
      return (
        <Image
          source={resolveRoleAvatar(avatar)}
          style={{
            width: size,
            height: size,
            borderRadius: rounded ? size / 2 : Math.round(size * 0.28),
            ...(style as object),
          }}
        />
      );
    }

    const color = PALETTE[hashName(name) % PALETTE.length];
    const letter = (name || "").trim().charAt(0) || "？";
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: rounded ? size / 2 : Math.round(size * 0.28),
          backgroundColor: color,
          alignItems: "center",
          justifyContent: "center",
          ...(style as object),
        }}
      >
        <Text style={{ color: "#fff", fontSize: size * 0.45, fontWeight: "600" }}>
          {letter}
        </Text>
      </View>
    );
  }
);

export default RoleAvatar;
