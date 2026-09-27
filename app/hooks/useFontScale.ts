import { useEffect, useState } from "react";
import {
  getFontScale,
  loadAppearance,
  subscribeAppearance,
} from "../store/appearance";

export function useFontScale(): number {
  const [scale, setScale] = useState(getFontScale());
  useEffect(() => {
    loadAppearance().then(() => setScale(getFontScale()));
    return subscribeAppearance(() => setScale(getFontScale()));
  }, []);
  return scale;
}
