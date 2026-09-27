import Chats from "../pages/chats/index";
import { useUser } from "../store/user";
import { Redirect } from "expo-router";
import TabFadeIn from "../anim/TabFadeIn";

const Page = () => {

  return (
    <TabFadeIn>
      <Chats />
    </TabFadeIn>
  );
};
export default Page;
