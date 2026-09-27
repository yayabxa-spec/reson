import * as MediaLibrary from "expo-media-library";
import { captureRef } from "react-native-view-shot";

export const captureScreenAndSaveToAlbum = async (viewRef: any) => {
  if (!viewRef) {
    const Toast = require("../component/base/Toast").default;
    Toast.fail("Save error");
    return;
  }
  try {
    const uri = await captureRef(viewRef, {
      format: "png",
      quality: 1,
    });
    // const barCodeResult = await BarCodeScanner.scanFromURLAsync(uri);
    // console.log(barCodeResult[0].data, "datadatadatadata");
    // 保存截图文件到相册
    const asset = await MediaLibrary.createAssetAsync(uri);
    const Toast = require("../component/base/Toast").default;
    Toast.info("Save Successfully");
    // 保存图像到本地文件系统
    // const fileUri = FileSystem.documentDirectory + "screenshot.png";
    // await FileSystem.copyAsync({ from: uri, to: fileUri });
    // console.log("Screenshot saved:", fileUri);
  } catch (error) {
    console.error("Error capturing screenshot:", error);
  }
};

export const jumpSomeWhereAfterGotQrcodeData = (
  text: string,
  navigator?: any,
  t?: any,
  reset?: () => void
) => {
  const [barCodeType, data] = text.split("///");
  try {
    if (!data) {
      return;
    }
    const [dataType, userIdField, userId] = data.split("+");
    // qrcode in me
    if (text.includes("(((getType)))")) {
      return dataType;
    }
    const goToFriendAdd = (userId: string) => {
      navigator.navigate("pages/contacts/screens/friend-info/index", {
        friendId: userId,
        type: "new",
      });
    };
    const goToTransfer = (userId: string) => {
      navigator.navigate("component/business/individual-payment/index", {
        recipientId: userId,
        type: "direct",
      });
    };

    if (dataType === "me-page") {
      const Dialog = require("../component/base/Dialog").default;
      Dialog.confirm({
        closeable: true,
        cancelButtonText: t("Transfer"),
        confirmButtonText: t("Add Friend"),
        title: t("Detected Qrcode"),
        message: t("do u wanna add as a friend or make a transfer?"),
      })
        .then(() => {
          goToFriendAdd(userId);
        })
        .catch(() => {
          goToTransfer(userId);
        })
        .finally(() => {
          reset?.();
        });
    }
    // qrcode in money accept
    if (dataType === "transfer") {
      goToTransfer(userId);
      return dataType;
    }
    // qrcode in friend
    if (dataType === "friend") {
      goToFriendAdd(userId);
      return dataType;
    }
  } catch (e) {
  }
};
