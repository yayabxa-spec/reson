import { StyleProp, View, ViewStyle } from "react-native";
import { useMemo } from "react";
import Svg, {
  Rect,
  Text as SvgText,
  Image as SvgImage,
} from "react-native-svg";
import qrcode from "qrcode-generator";
import { getActiveSkinId } from "../../../../theme/skinState";
import { getSkin } from "../../../../theme/skins";

const DEFAULT_CENTER_COLOR = getSkin(getActiveSkinId()).overrides.primary;

const MyQrcode = ({
  value,
  size = 260,
  color = "#1A1A1A",
  logo,
  centerImage,
  centerText,
  centerColor = DEFAULT_CENTER_COLOR,
  style,
}: {
  value: string;
  size?: number;
  color?: string;
  logo?: string;
  centerImage?: any;
  centerText?: string;
  centerColor?: string;
  style?: StyleProp<ViewStyle>;
}) => {
  const cells = useMemo(() => {
    try {
      const qr: any = qrcode(0, "M");
      qr.addData(value);
      qr.make();
      const n = qr.getModuleCount();
      const list: { r: number; c: number }[] = [];
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (qr.isDark(r, c)) list.push({ r, c });
        }
      }
      return { n, list };
    } catch {
      return { n: 0, list: [] };
    }
  }, [value]);
  const margin = Math.round(size * 0.06);
  const cell = cells.n ? (size - margin * 2) / cells.n : 0;
  const centerSize = Math.round(size * 0.22);

  return (
    <View style={[{ alignItems: "center" }, style]}>
      <Svg width={size} height={size}>
        <Rect x={0} y={0} width={size} height={size} fill="#fff" />
        {cells.list.map((p, i) => (
          <Rect
            key={i}
            x={margin + p.c * cell}
            y={margin + p.r * cell}
            width={cell}
            height={cell}
            fill={color}
          />
        ))}
        {centerImage ? (
          <Rect
            x={size / 2 - centerSize / 2 - 5}
            y={size / 2 - centerSize / 2 - 5}
            width={centerSize + 10}
            height={centerSize + 10}
            fill="#fff"
            rx={7}
          />
        ) : logo ? (
          <Rect
            x={size / 2 - centerSize / 2 - 5}
            y={size / 2 - centerSize / 2 - 5}
            width={centerSize + 10}
            height={centerSize + 10}
            fill="#fff"
            rx={7}
          />
        ) : null}
        {centerImage ? (
          <SvgImage
            x={size / 2 - centerSize / 2}
            y={size / 2 - centerSize / 2}
            width={centerSize}
            height={centerSize}
            href={centerImage}
          />
        ) : logo ? (
          <SvgImage
            x={size / 2 - centerSize / 2}
            y={size / 2 - centerSize / 2}
            width={centerSize}
            height={centerSize}
            href={{ uri: logo }}
          />
        ) : centerText ? (
          <>
            <Rect
              x={size / 2 - centerSize / 2 - 5}
              y={size / 2 - centerSize / 2 - 5}
              width={centerSize + 10}
              height={centerSize + 10}
              fill="#fff"
              rx={7}
            />
            <Rect
              x={size / 2 - centerSize / 2}
              y={size / 2 - centerSize / 2}
              width={centerSize}
              height={centerSize}
              fill={centerColor}
              rx={6}
            />
            <SvgText
              x={size / 2}
              y={size / 2 + centerSize * 0.11}
              fontSize={centerSize * 0.4}
              fill="#fff"
              textAnchor="middle"
              fontWeight="600"
            >
              {centerText}
            </SvgText>
          </>
        ) : null}
      </Svg>
    </View>
  );
};

export default MyQrcode;
