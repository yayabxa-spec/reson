import * as ImagePicker from "expo-image-picker";

export type TImageIns = {
  uri: string;
  type: "image" | "video" | undefined | "audio/mpeg";
  name: string | null | undefined;
};

export const pickImages = async ({
  startPicking = () => {},
  endPicking = () => {},
  beforeUploaded = () => {},
  afterUploaded = () => {},
} = {}) => {
  startPicking();
  let result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: true,
    selectionLimit: 9,
    quality: 1,
  });
  endPicking();
  if (!result.canceled) {
    beforeUploaded();
    const images = result?.assets?.map((image) => ({
      uri: image.uri,
      type: image.type,
      name: image.fileName,
    }));
    afterUploaded();
    return images;
  }
  return [];
};

/**
 * 直接返回本地 URI 交给调用方；后续做图片消息时由调用方转 data URL 给模型。
 */
export const uploadImages = async (images: TImageIns[]) => {
  return images.map((img) => ({
    uri: img.uri,
    type: img.type || "image",
    name: img.name || img.uri.split("/").pop() || "image.jpg",
  }));
};
