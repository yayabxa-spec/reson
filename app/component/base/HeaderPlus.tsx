import { TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import CirclePlus from "../../../assets/icon/circle-plus.svg";
import { useTheme } from "../../../theme/useTheme";

/**
 * 页面右上角加号按钮：
 * - wechat 皮肤：微信风格圆角加号
 * - clean 皮肤：原生安卓风格 + 号
 */
const HeaderPlus = ({
  onPress,
}: {
  onPress: () => void;
}) => {
  const { themeColor, skin } = useTheme();
  const material = skin.layout.plusMenu === "material";
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{ padding: 12, paddingBottom: 6, paddingRight: 6 }}
    >
      {material ? (
        <Ionicons name="add" size={26} color={themeColor.text5} />
      ) : (
        <CirclePlus />
      )}
    </TouchableOpacity>
  );
};

export default HeaderPlus;
