import { useRouter } from "expo-router";
import GoBackIcon from "../../../../assets/icon/common/go-back.svg";

import { Pressable, Text, View } from "react-native";
const GoBack = ({ color, style }: { color?: string; style?: any }) => {
  const router = useRouter();

  return (
    <Pressable
      style={style}
      onPress={() => {
        router.back();
      }}
    >
      <GoBackIcon width={24} height={24} fill={color} />
    </Pressable>
  );
};
export default GoBack;
