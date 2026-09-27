import { atom, useRecoilState, useRecoilValue } from "recoil";
type TConfigState = { apiDomain?: string };
export const ConfigState = atom<TConfigState>({
  key: "configState",
  default: {
    apiDomain: "",
  },
});

export const useConfigState = () => {
  const [config, setConfig] = useRecoilState(ConfigState);
  return {
    config,
    setConfig,
  };
};
