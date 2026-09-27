import { requireNativeComponent } from "react-native";
import type { NativeSyntheticEvent } from "react-native";

export interface WeChatScanResultEvent {
  data: string;
}

export interface WeChatScanViewProps {
  analyzing?: boolean;
  onScanResult?: (event: NativeSyntheticEvent<WeChatScanResultEvent>) => void;
  style?: any;
}

export default requireNativeComponent<WeChatScanViewProps>("WeChatScanView");
