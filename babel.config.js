module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],

    // Reanimated 4 / worklets 插件由 babel-preset-expo 自动注入（检测到
    // react-native-worklets 已安装），这里不要再手动加，避免重复注册。
    plugins: [],
  };
};
