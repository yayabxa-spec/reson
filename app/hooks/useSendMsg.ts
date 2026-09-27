import { useUser } from "../store/user";

import Toast from "../component/base/Toast";
import { useConfigState } from "../store/globalConfig";

const useSendMsg = () => {
  const { config } = useConfigState();

  const sendMsgHandler = ({
    val,
    type,
    userId,
    convoId,
    doneHandler,
  }: {
    val: string;
    userId: string;
    doneHandler?: (data: any) => void;
    convoId: string;
    type: string;
  }) => {
    if (!val) {
      return;
    }
    fetch(config.apiDomain + "/api/msg/add-msg", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // msg: "https://placekitten.com/302/302",
        msg: val,
        type: type,
        userId,
        convoId,
      }),
    })
      .then((res) => res.json())
      .then(async (res) => {
        if (res.code === 200) {
        } else {
          Toast.fail("sendMsg failed");
        }
        doneHandler?.(res);
      });
  };
  return { sendMsgHandler };
};
export default useSendMsg;
