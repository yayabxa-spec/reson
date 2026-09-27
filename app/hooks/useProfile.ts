import { useEffect, useState } from "react";
import {
  readProfile,
  subscribeProfile,
  UserProfile,
} from "../store/profile";

export function useProfile(): UserProfile {
  const [p, setP] = useState<UserProfile | null>(null);
  useEffect(() => {
    readProfile().then(setP);
    return subscribeProfile(() => readProfile().then(setP));
  }, []);
  return p || { name: "用户", gender: "female", wechatId: "", avatar: "", patContent: "" };
}
