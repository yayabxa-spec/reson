import { createDefaultTheme } from "../../../../theme/styles/defaultTheme";
import { StyleSheet } from "react-native";
import type { ViewStyle, TextStyle } from "react-native";

interface Styles {
  container: ViewStyle;
  item: ViewStyle;
  name: TextStyle;
  gap: ViewStyle;
  cancel: ViewStyle;
  cancelText: TextStyle;
  description: TextStyle;
  descriptionGap: ViewStyle;
  subname: TextStyle;
  disabled: ViewStyle;
}

export const createStyle = (theme: DiceUI.Theme): Styles => {
  // 不能直接改写主题对象（NativeWind 下属性是只读 getter），合并到新对象
  const merged = { ...theme, ...createDefaultTheme(theme) };
  const itemStyle: TextStyle = {
    paddingHorizontal: merged.padding_md,
    paddingVertical: 14,
    backgroundColor: merged.action_sheet_item_background,
    alignItems: "center",
  };

  return StyleSheet.create<Styles>({
    cancel: {
      ...itemStyle,
    },
    cancelText: {
      color: merged.action_sheet_cancel_text_color,
      fontSize: merged.action_sheet_item_font_size,
      lineHeight: merged.action_sheet_item_line_height,
    },
    container: {
      maxHeight: merged.action_sheet_max_height,
    },
    description: {
      color: merged.action_sheet_description_color,
      fontSize: merged.action_sheet_description_font_size,
      lineHeight: merged.action_sheet_description_line_height,
      paddingHorizontal: merged.padding_md,
      paddingVertical: 20,
      textAlign: "center",
    },
    descriptionGap: {
      borderBottomColor: merged.border_color,
      borderBottomWidth: StyleSheet.hairlineWidth,
      marginHorizontal: merged.padding_md,
    },
    disabled: {
      color: merged.action_sheet_item_disabled_text_color,
    },
    gap: {
      backgroundColor: merged.action_sheet_cancel_padding_color,
      height: merged.action_sheet_cancel_padding_top,
    },
    item: {
      ...itemStyle,
    },
    name: {
      color: merged.action_sheet_item_text_color,
      fontSize: merged.action_sheet_item_font_size,
      lineHeight: merged.action_sheet_item_line_height,
    },
    subname: {
      color: merged.action_sheet_subname_color,
      fontSize: merged.action_sheet_subname_font_size,
      lineHeight: merged.action_sheet_subname_line_height,
      marginTop: merged.padding_xs,
    },
  });
};
