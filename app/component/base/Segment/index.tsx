import { memo } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { useTheme } from "../../../../theme/useTheme";

/**
 * 微信风格选项卡：无底色块，选项之间用灰色细线分隔，
 * 选中项深色、未选中浅灰。
 */
const Segment = memo(
  ({
    options,
    value,
    onChange,
    style,
  }: {
    options: { label: string; value: string }[];
    value: string;
    onChange: (v: string) => void;
    style?: ViewStyle;
  }) => {
    const { themeColor } = useTheme();
    return (
      <View style={[styles.container, style]}>
        {options.map((opt, i) => {
          const active = opt.value === value;
          return (
            <View key={opt.value} style={styles.itemWrap}>
              {i > 0 && <View style={styles.divider} />}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => onChange(opt.value)}
                style={styles.item}
              >
                <Text
                  style={{
                    fontSize: 14,
                    color: active ? themeColor.text5 : themeColor.text2,
                    fontWeight: active ? "500" : "400",
                  }}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
  },
  itemWrap: {
    flexDirection: "row",
    alignItems: "center",
  },
  item: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: "center",
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 14,
    backgroundColor: "#D9D9D9",
  },
});

export default Segment;
