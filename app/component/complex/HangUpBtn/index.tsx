import { useTheme } from "../../../../theme/useTheme";
import { FontAwesome, MaterialCommunityIcons } from "@expo/vector-icons";
import {
  TouchableOpacity,
  TouchableOpacityProps,
  Text,
  View,
} from "react-native";
import { getSize } from "../../../../utils.ts";
const sizeMap: Record<string, any> = {
  big: { size: getSize(58) },
  normal: { size: getSize(42) },
};
const HangUpBtn = ({
  type = "normal",
  text = "",
  height = "",
  width = "",
  sizeOut = "",
  ...rest
}: { type?: string; text?: string } & TouchableOpacityProps) => {
  const { themeColor } = useTheme();
  const size = sizeMap[type].size;
  return (
    <View style={{ alignItems: "center" }}>
      <TouchableOpacity
        style={{
          backgroundColor: themeColor.magenta6,
          width: width || getSize(75),
          height: height || getSize(75),
          alignItems: "center",
          justifyContent: "center",
          borderRadius: width || getSize(75),
        }}
        {...rest}
      >
        <MaterialCommunityIcons
          size={sizeOut || size}
          color={themeColor.white}
          name="phone-hangup"
        />
      </TouchableOpacity>
      <Text style={{ fontSize: 30, color: themeColor.white }}>{text}</Text>
    </View>
  );
};
export default HangUpBtn;
