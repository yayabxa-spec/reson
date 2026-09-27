import ImageViewer from "../../../base/ImageViewer";
import FastImage from "react-native-fast-image";
const ImageCard = ({ text, popover }) => {
  return (
    <ImageViewer uri={text} onPressLong={() => popover.current?.show()}>
      <FastImage
        defaultSource={require("../../../../../assets/loading-image.png")}
        source={{
          uri:
            // "https://placekitten.com/302/302"
            // ||
            text,
        }}
        style={{ width: 180, height: 100 }}
      />
    </ImageViewer>
  );
};
export default ImageCard;
