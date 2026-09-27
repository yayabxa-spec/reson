# 液态玻璃（Liquid Glass）皮肤实施计划

## Context

用户希望把 GitHub Backdrop Catalog（Kyant0/AndroidLiquidGlass）的液态玻璃效果应用到本 App（RE:SON，微信复刻，Expo 57 / RN 0.86 / bare workflow 仅 Android / newArch=true / NDK 27.1 已配置）。

经确认的需求：
- 新增 npm 依赖 `react-native-liquid-glassmorphism`（Android API 33+ 为 AGSL 折射着色器，31–32 退化 blur，<31 退化 tint；支持 New Arch；依赖装到 F 盘项目内）
- 通过**新增第三个皮肤 `glass`** 接入，与 wechat/clean 并存，设置页可切换
- 玻璃应用三处：**底部 Tab 栏、顶部 Header、聊天输入栏**
- **硬约束**：wechat/clean 两皮肤视觉与交互完全不变——所有玻璃改动以 `skinId === "glass"` 为闸门

关键事实（已核实）：
- expo-router 57 的 native-stack 支持 `headerTransparent` + `headerBackground`
- Expo 57 默认 compileSdk 35（≥34 满足库要求）；NDK 已是 27.1.12297006
- 该库 config plugin 为可选直通，autolinking 自动链接即可，**不需要也不应跑 expo prebuild**（android/ 目录有手工改动）
- 库自带运行时降级链（tier: refraction/blur/tint），无需 JS 层按 API 重复判断，但包装层需兜底

## 实施步骤

### 1. 依赖与构建链
- `npm i react-native-liquid-glassmorphism`（node_modules 在 F 盘项目内）
- app.json `plugins` 追加 `"react-native-liquid-glassmorphism"`（直通插件）
- [build-local.ps1](file:///f:/RE-SON_work_20260827_004629/build-local.ps1) 顶部加 `$env:GRADLE_USER_HOME = "F:\.gradle"`（gradle 缓存到 F 盘；JDK21/local.properties 不动）

### 2. 皮肤层扩展
- [theme/skins.ts](file:///f:/RE-SON_work_20260827_004629/theme/skins.ts)：
  - `SkinId` 加 `"glass"`；`isSkinId` 同步
  - `SKINS.glass`：label「玻璃风格」；**overrides 全部用不透明中性冷灰蓝色板**（如 fillColor `#F2F5F9`）——半透明只进玻璃组件的 tint prop，不进全局 palette，避免透底
  - `layout`：仅 `dock` 新增 `"glass"` 枚举；plusMenu/switchControl/dialog/button 沿用 `"material"`（最小改动）
  - `labels` 复用 clean 的中性文案（配套 material 图标分支）
  - 新增可选 `SkinConfig.glass?: { tint: string; highlight: string }` 承载玻璃参数
- [theme/skinState.ts](file:///f:/RE-SON_work_20260827_004629/theme/skinState.ts)：合规构建（`BUILD_SKIN === "clean"`）时 `loadSkin` 忽略 AsyncStorage 残留的 `"glass"`，保证 EXPO_PUBLIC_APP_SKIN=clean 构建不进玻璃
- [theme/useTheme.tsx](file:///f:/RE-SON_work_20260827_004629/theme/useTheme.tsx)：composePalette 无需分支（glass 走 overrides，不接 dynamicScheme）

### 3. 设置页
- [app/pages/me/screens/display/index.tsx](file:///f:/RE-SON_work_20260827_004629/app/pages/me/screens/display/index.tsx)：皮肤选项卡改为 `["wechat", "clean", "glass"]`；glass 选项仅 `!SKIN_FIXED && getBuildSkin() !== "clean"` 时渲染；附文案说明「Android 13+ 完整折射效果，低版本自动降级」

### 4. 通用包装组件（新建）
- [app/component/complex/LiquidGlass.tsx](file:///f:/RE-SON_work_20260827_004629/app/component/complex/LiquidGlass.tsx)：
  - `GlassSurface`：仅 `skinId === "glass"` 渲染玻璃，否则原样渲染普通 View（wechat/clean 零影响）；懒加载 require + try/catch
  - 降级链：API 33+ → `LiquidGlassView`（tint 取 skin.glass.tint）；31–32 → expo-blur（已装未用）；<31 或加载失败 → 半透明白 View + 细边框
  - 语义封装：`GlassTabBarBackground` / `GlassHeaderBackground` / `GlassInputBar`
  - `useGlassDockPadding()`：glass 时返回 `insets.bottom + 68`，否则 0

### 5. 底部 Tab 栏
- [app/(tabs)/_layout.tsx](file:///f:/RE-SON_work_20260827_004629/app/(tabs)/_layout.tsx)：
  - `glassDock = skin.layout.dock === "glass"`；图标/文字/徽标用 `material || glassDock` 判定（复用 material 分支偏移）
  - glass dockStyle：height 68+insets.bottom、`backgroundColor:"transparent"`、`elevation:0`、`position:"absolute"`、`bottom:0`
  - `tabBarBackground: () => <GlassTabBarBackground />`
- 四个 tab 页内容底部 padding：chats 列表 [app/pages/chats/component/ChatList.tsx](file:///f:/RE-SON_work_20260827_004629/app/pages/chats/component/ChatList.tsx) FlatList、contacts/discover/me 各列表容器，用 `useGlassDockPadding()` 加 paddingBottom（非 glass 返回 0，无影响）

### 6. 顶部 Header
- (tabs)/_layout.tsx screenOptions 中对 chats/contacts/discover（me 页 headerShown:false 豁免）：glass 时 `headerTransparent: true` + `headerBackground: () => <GlassHeaderBackground />`（返回 absolute 填充玻璃）
- 对应列表 contentContainerStyle 加 `paddingTop: insets.top + 56`（仅 glass）
- 聊天详情页 [app/pages/chats/msg-chats/index.tsx](file:///f:/RE-SON_work_20260827_004629/app/pages/chats/msg-chats/index.tsx) setOptions（L363-438）加 glass 同样分支
- display 设置页硬编码 #EDEDED **豁免**，保持普通

### 7. 聊天输入栏（保守方案）
- msg-chats/index.tsx：glass 时 SafeAreaView 背景改透明；输入区容器（回复引用条 + pendingImages 条 + `<ChatInput>`）包进 `<GlassInputBar>`
- 玻璃折射的是 ChatBgLayer 铺底内容（absolute 铺满全页）；KeyboardAvoidingView 结构不动，键盘行为零风险；EmojiPicker/FnKeyBoard 渲染在输入区之后，自然盖在玻璃上方
- 可选增强（第二阶段，真机回归后再上）：输入区 absolute 化 + 列表 paddingBottom 实现消息滚动穿透

## 验证

1. 类型检查：`node scripts/tsc-check-touched.js`
2. APK 构建：`powershell -ExecutionPolicy Bypass -File .\build-local.ps1`（确认 GRADLE 缓存落 F 盘）
3. 真机清单：
   - API 33+ 设备切 glass：三处玻璃折射、tab 内容滚动穿透，`adb logcat -s LiquidGlass` 确认 tier=refraction
   - API<33 设备：blur/tint 降级正常不白屏
   - wechat/clean 皮肤回归：三处 UI 与改动前截图比对零变化
   - clean 合规构建：设置页无 glass 选项
   - 键盘/EmojiPicker/FnKeyBoard 弹出层级正确
   - 设置自定义聊天背景后玻璃效果正常

## 涉及文件
修改：theme/skins.ts、theme/skinState.ts、app/pages/me/screens/display/index.tsx、app/(tabs)/_layout.tsx、app/pages/chats/component/ChatList.tsx、app/pages/chats/msg-chats/index.tsx、app.json、build-local.ps1
新建：app/component/complex/LiquidGlass.tsx
