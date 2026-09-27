import { atom, selector, useRecoilState, useRecoilValue } from "recoil";
type TLoadingStore = { loading: boolean; text?: string };
export const loadingStore = atom<TLoadingStore>({
  key: "loadingState",
  default: {
    loading: false,
    text: "Loading...",
  },
});

export const useLoadingStore = () => {
  const [loadingState, setLoadingStore] = useRecoilState(loadingStore);
  return {
    globalLoading: loadingState,
    setLoadingStore,
  };
};
