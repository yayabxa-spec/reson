import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

/** 全局错误边界：渲染抛错时给出可恢复界面，避免白屏 */
export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(e: any) {
    return { error: e?.message || String(e) };
  }

  componentDidCatch(e: any) {
    console.error("BOUNDARY", e);
  }

  render() {
    if (this.state.error) {
      return (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#fff",
            padding: 24,
          }}
        >
          <Text
            style={{
              fontSize: 15,
              color: "#333",
              marginBottom: 16,
              textAlign: "center",
            }}
          >
            页面出错了：{this.state.error}
          </Text>
          <TouchableOpacity
            onPress={() => this.setState({ error: null })}
            style={{
              paddingHorizontal: 24,
              paddingVertical: 9,
              backgroundColor: "#07C160",
              borderRadius: 8,
            }}
          >
            <Text style={{ color: "#fff", fontSize: 15 }}>重试</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}
