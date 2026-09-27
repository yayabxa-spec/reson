import {
  Image,
  ImageSourcePropType,
  ImageStyle,
  StyleProp,
  StyleSheet,
} from "react-native";
import { getSize } from "../../../../utils.ts";
import { themeColor } from "../../../../theme/light";
import { useMemo } from "react";
import FastImage from "react-native-fast-image";

const UserAvatar = ({
  source,
  style,
  rounded = false,
  ...rest
}: {
  source?: ImageSourcePropType;
  rounded?: boolean;
  style?: StyleProp<ImageStyle>;
}) => {
  const valid = useMemo(() => {
    if (typeof source === "object") {
      return (
        !!source?.uri &&
        /^(https?:|file:|content:|data:)/.test(source.uri)
      );
    }
    return source != null;
  }, [source]);
  if (!valid) {
    return (
      <Image
        source={require("../../../../assets/avatar-default.jpeg")}
          style={[
            avatarStyle.itemContainerAvatar,
            style,
            {
              borderRadius: rounded
                ? getSize(50)
                : Math.round(getSize(50) * 0.28),
            },
        ]}
      />
    );
  }
  return (
    <FastImage
      {...rest}
      source={source}
      style={[
        avatarStyle.itemContainerAvatar,
        style,
        {
          borderRadius: rounded
            ? getSize(50)
            : Math.round(getSize(50) * 0.28),
        },
      ]}
    />
  );
};
const avatarStyle = StyleSheet.create({
  itemContainerAvatar: {
    borderColor: themeColor.fillColor,
    borderWidth: 1,
    width: getSize(50),
    height: getSize(50),
  },
});
export default UserAvatar;
