# RE:SON 液态玻璃 Dock — AI 交接文档

> 交接时间：2026-09-27。交接时基线：**v0.60.12 / versionCode 382（最终验收版本，Liquid Glass Bottom Tabs 复制工作正式收官）**。
> 本文档面向接手本项目的下一个 AI。先读完再动手。

---

## 1. 项目与目标

- **项目**：RE:SON（微信复刻 App）。Expo 57 / RN 0.86.2 / bare workflow / 仅 Android / `newArchEnabled=true` / 包名 `com.reson.chat`。
- **目标**：把 **Kyant0/AndroidLiquidGlass**（Backdrop，KMP + Compose）的液态玻璃效果 **尽可能 1:1** 移植到 App 底部 Tab：悬浮玻璃胶囊 dock + 独立可拖拽液态玻璃镜片。
- **参考源码（唯一准绳）**：`F:\AndroidLiquidGlass-kmp\AndroidLiquidGlass-kmp`
  - 库本体：`backdrop/src/commonMain/kotlin/com/kyant/backdrop/`（DrawBackdropModifier、highlight/、shadow/、internal/Shaders.kt 等）
  - 组件：`app/src/commonMain/kotlin/com/kyant/backdrop/catalog/components/LiquidBottomTabs.kt`（核心对照文件）
  - 动画：`...catalog/utils/DampedDragAnimation.kt`、`DragGestureInspector.kt`
- 参考官方 APK 已装在真机（包名不同，可共存对照）。
- **铁律：改任何代码前必须重读当前仓库源码，禁止凭记忆。所有"官方行为"以当前仓库源码为准。**

## 2. 硬性约束（用户明确要求，违反会被退回）

1. **文件不落 C/D 盘**：Gradle home = `F:\.gradle`，npm cache = `F:\npm-cache`，截图/日志/分析脚本一律放 `F:\reson-shots\`。
2. **构建期间不得结束回合**：用轮询日志盯到 `BUILD SUCCESSFUL / FAILED` 并安装完成后才汇报。
3. **每次构建必须递增版本**：`app.json` 的 `version`（当前 0.60.12）与 `android.versionCode`（当前 382）。
4. **每轮只做用户指定范围**：用户消息里有明确的"禁改清单"（targetCx / LSQ2 / velocity spring / pressProgress / scaleX / scaleY / dockScale / shader / RenderNode 坐标 / InteractiveHighlight 等），逐条遵守；发现需要越界修改时**先停下报告，不要自行扩大**。
5. **不声称"1:1"**：除非有源码对照 + 逐项测试证据。区分"参数对应 / ODE 对应 / 实际时间轨迹"三个层级。
6. **wechat/clean 皮肤零视觉变化**：`glass` 是第三个皮肤，全部玻璃代码只在 `skinId === "glass"` 时生效。
7. 汇报用**中文**。
8. 用户曾遇到 app.json 被外部回退（0.60.3/373 → 0.59.5/366）：**构建前先核对版本字段与设备版本**，被回退时恢复到递增序列。

## 3. 当前架构与关键文件

### JS 层
| 文件 | 内容 |
|---|---|
| `app/component/complex/GlassDock.tsx`（~800 行） | 核心。5 通道动画（cx/vel/pressProgress/scaleX/scaleY）、手势（onChange 增量 + endDrag 去重）、worklet LSQ2 VelocityTracker、offsetAnim/panelOffset、DebugOverlay（React.memo 子组件）、CSV 16 列 |
| `app/component/complex/NativeBackdrop.tsx` | `BackdropSource`（声明层录制）/ `GlassEffect`（玻璃视图）/ `PageSource` 包装 |
| `app/pages/chats/index.tsx` | dock 后方 `#808080` 纯灰测试带（debug 用） |
| `app/(tabs)/_layout.tsx`、`theme/skins.ts` | glass 皮肤接入（勿动，已稳定） |
| `app.json` | version 0.60.6 / versionCode 376 |

### Native 层（`android/app/src/main/java/com/reson/chat/backdrop/`）
| 文件 | 内容 |
|---|---|
| `GlassEffectView.kt` | RenderNode 采样（selfLoc 补偿 + 祖先净缩放 + 1/s 逆缩放）→ vibrancy⇒blur⇒lens（AGSL 逐字）→ surface → **highlight/shadow/innerShadow（v0.60.6 新增）** → 子视图；pressProgress 原生弹簧积分器（k=1000, c=2√1000, 半隐式欧拉 1/240s 子步） |
| `BackdropSourceView.kt` | 把 RN 子视图录制为命名 RenderNode 层（captureOnly 语义） |
| `BackdropPackage.kt` | `BackdropSourceManager` / `GlassEffectManager`（@ReactProp） |
| `DebugDumpPackage.kt` | CSV 落盘 native module（写 `getExternalFilesDir`，vivo 屏蔽 release logcat 的替代方案） |
| `MainApplication.kt` | 注册 BackdropPackage + DebugDumpPackage |

### 官方 ↔ 本项目 映射速查
| 官方 | 本项目 |
|---|---|
| `valueAnimation`（index 空间，spring(1,1000,0.001)） | `cx`（dp，cx = 4dp + tabW×(value+0.5)，tabW=(dockW−8dp)/n=78dp） |
| `velocityAnimation`（spring(0.5,300,0.01)，输入=**value 本身**经 VelocityTracker） | `vel`（输入=逐帧采样 cx/tabW → worklet LSQ2(100ms,20样本) → /(n−1)） |
| `pressProgress` / `scaleX` / `scaleY`（spring(1,1000,0.001)/(0.6,250,0.001)/(0.7,250,0.001)） | 同名 shared value；镜片侧 progress 由原生 `lensProgress` 弹簧驱动（pressed prop） |
| `offsetAnimation` + `panelOffset` | `offsetAnim` + `useDerivedValue`：`4dp·sign·EaseOut(|clamp(offset/dockW,±1)|)`；回位 `withSpring(0,{damping:34.641,stiffness:300})`（ζ=1,k=300）；EaseOut=CubicBezierEasing(0,0,0.58,1)，32 次二分求解；面板根节点 translateX（=官方两处 Row 的 graphicsLayer） |
| drawBackdrop 的 highlight/shadow/innerShadow | GlassEffectView native 三层；dock 用官方默认参数（恒定 alpha=1），镜片 alpha=progress、innerShadow radius=8dp×progress |
| onDrag `updateValue(targetValue + dragAmount.x/tabWidth)` | `.onChange` 里 `CLAMP(targetCx + e.changeX, 43, 277)`（RNGH 的 changeX 只在 onChange 有） |
| onDragStopped（animateToValue：press 重置 tracker + velocity→0）与 onDragCancel（同路径） | `endDrag()`（onEnd 与 onFinalize 共用，`dragActive` 去重） |
| Z 序 | shadow(clip外最底) → 玻璃 → surface → highlight → innerShadow(clip内最顶) |

## 4. 已完成与验收状态

| 阶段 | 版本 | 内容 | 验收 |
|---|---|---|---|
| Stage 1 坐标/采样 | v0.59.8/369 | RN scale 中心原点、祖先净缩放、InverseLayerScope 等价逆变换、越界采样 | ✅ 用户验收 |
| Stage 2 动画物理 | v0.60.0/370 | 5 通道 DampedDragAnimation | ✅ 用户验收 |
| 测量版 | v0.60.1/371 | DebugDump + CSV + Overlay；发现 overlay 重渲染干扰 RNGH | ✅ |
| velocity 输入源 | v0.60.3/373 | e.velocityX → post-spring cx + worklet LSQ2（用户选定 worklet 方案） | ✅【Velocity source：PASS】 |
| 手势路径 | v0.60.4/374 | onChange 增量、targetValue 吸附、onDragCancel、clamp [43,277]；区分性测试 I3/E2+G/F | ✅ |
| panelOffset | v0.60.5/375 | offsetAnim + EaseOut + spring(1,300,0.5)；满行程 3.6616dp | ✅ |
| Highlight/Shadow/InnerShadow | v0.60.6/376 | native 三层 + 删假 rim；A 组数据与 v0.60.5 逐位一致 | ✅ 用户未复核 |
| tabsBackdrop 完整语义 | v0.60.7/377 | accent-tabs 层补入 Row#2 自身玻璃输出（vibrancy+blur8+lens24×progress+highlight(alpha=progress)+surface 恒定；官方 shadow 默认参数经论证不可见故省略）；镜片采样语义=combined(page,tabsBackdrop)；原生新增采样源版本门控（BackdropSourceView.contentVersion + GlassEffectView.notifySourcesChanged）防"源内嵌效果视图"重绘循环 | ✅ 机器自验（像素游程 + CSV A 组物理零回归），**用户未复核** |
| InteractiveHighlight | v0.60.8/378 | 官方 catalog/utils/InteractiveHighlight 移植：dock(层1)+Row#2 玻璃 surface 之上白 8%×p 全场提亮 + 新 AGSL 径向光斑（InteractiveHighlightShader，Plus→saveLayer+ADD）；位置=胶囊中心+panelOffset（官方 lambda 忽略手指 offset）、y=各自 h/2；手势信号 highlightActive（onStart/endDrag，抬起即回弹 spring(0.5,300) ζ=0.5）；位置经 effectId="lens" 锚点读 view 属性（anchor.parent.translationX=cx−lensW/2、anchor.parent.parent.translationX=panelOffset，零桥）；API<33 走官方 25% 降级 | ✅ 机器自验（A/B/C/D 四组物理回归 + 光斑中心区分实验），**用户未复核** |
| 副本 LocalLiquidBottomTabScale | v0.60.9/379 | 源码审计确认官方 provider 只包 Row#2（1→1.2 仅存在于隐藏副本、经录制进镜片采样；可见 Row#1 无此缩放）；accent-tabs 副本 tab 单元 View→Animated.View + 共享 useAnimatedStyle（scale=1+0.2×pressProgress，复用 TAB_PRESSED_SCALE）。静止 p=0 外观逐像素不变；按压态副本蓝区 60px→71px（×1.183≈1.2）、中心不变；物理弹簧通道零回归。D 组快弹落点翻转经 14 样本只读实验**已结案：运行间方差**（见 §5 差异④） | ✅ 机器自验，**用户未复核** |
| 可见层移除 1→1.2（方案 B） | v0.60.10/380 | 用户裁决：可见层 `DockTabButton` scale 由 `(1+0.2×pp)×focusScale` 改为恒定 `focusScale`（选中 1.06/未选中 1.0）——移除已确认非官方的可见层 1→1.2（官方可见内容恒 1.0），**保留 1.06 静置选中强调**（与官方 scale=1.0 的静置差被有意隔离，待后续单独裁决；方案 B 是最小语义修正、非完全官方等价实现）。实测：静置逐像素不变；按住态未选中图标零增长（n=2220/2041/1896 vs 静置 2300/2072/1918，包围盒不变；v0.60.9 同工况为 3297/3028/2797 即 +20%）；胶囊 bgScale、镜片、副本 1→1.2、高光均保持 | ✅ 机器自验，**用户未复核** |
| 移除 1.06（差异⑤） | v0.60.11/381 | `focusScale = focused ? 1.0 : 1`——可见内容缩放与官方 Row#1（恒 1.0）完全一致。**审计修正**：静置时运动镜片完全覆盖选中 tab 内容区（内容 y 16-50.6dp ⊂ 镜片 4-60dp），蓝色像素全部为镜片内副本图标——1.06 在静置态从未可见（v0.60.9/10/11 静置逐像素一致的原因），其唯一可见时机是**拖拽中镜片离开选中 tab 的曝光**。实测曝光验证：拖拽中曝光的选中图标 w=73px/h=122px=1.0 基准（1.06 应为 w≈78/h≈129）；+8px 中心偏移=panelOffset（正常）。可见层语义至此与官方完全一致（恒 1.0） | ✅ 机器自验，用户验收 |
| Accessibility 修复 + **最终 A/B 验收（收官）** | **v0.60.12/382（最终验收版本）** | ① GlassDock hidden accent-tabs 加 `importantForAccessibility="no-hide-descendants"`（等价官方 Row#2 `clearAndSetSemantics{}`）+ NativeBackdrop.tsx `BackdropSourceProps` 类型声明；② **最终 A/B 像素验收**（官方 com.kyant.backdrop.catalog Bottom tabs 4-tab vs RE:SON，七场景 Rest/Press selected/Press unselected/Slow drag/Fast drag/Drag across selected/Release）：**镜片按压高度 官方 273px / ours 274px = ×1.393**；**副本图标 ×1.2**（官方 63→75px / ours 72→84px）；**曝光选中图标 1.0×**（官方 16px 笔画同未选中 / ours 左缘 191=已验证 1.0 几何）；**表面膜 10%→3%**；innerShadow/Highlight/Shadow/velocity 形变/release 无残留 全部一致；tsc 382=基线零新增；build 首次因 F 盘瞬时 I/O 失败、重试成功；**未发现新的代码级差异** | ✅ **用户正式验收通过（收官）** |

**最终 A/B 验收收官记录（v0.60.12/382）**：
- 官方 Dark Material 分支结案：RE:SON 产品层固定浅色主题（useTheme.tsx 深色模式显式禁用），官方深色分支（dock 121212@40%、lens White 10%→3%）为死路径，不实现。
- 已接受的已知差异（最终清单，**不再重开**）：
  1. Capsule 超椭圆（官方）vs 标准圆角胶囊（ours）几何近似——低影响；
  2. dock 内容不随 bgScale 缩放（官方 layerBlock 连内容一起缩放）——已确认结构差；
  3. accent / icon / 页面色彩体系（#0088FF vs #4A7FB5、黑图标 vs 深灰）——产品定义；
  4. dock 边距 20dp vs 官方演示 36dp → 胶囊绝对宽度不同——产品定义；
  5. 深色材质分支——死路径，不实现。
- 顺带保留的已记录微项：副本单元几何中心 34dp vs 官方 32dp（对齐需改副本布局，用户已裁决暂不动）；D 组 180ms 快弹落点分布（已结案：运行间方差，见 §5 差异④）。
- **最终 A/B 验收未发现新的代码级差异。项目状态：v0.60.12 / 382 为当前最终验收版本，Liquid Glass Bottom Tabs 复制工作正式收官。不再提出新的优化项，不再修改玻璃管线，不再重新打开已结案差异。**

## 5. 剩余工作（按用户既定顺序）

1. ~~**tabsBackdrop 完整语义**~~ → **已在 v0.60.7/377 实现**：accent-tabs 源内新增 Row#2 等价 GlassEffect（采样 page），镜片 `sources=[page,"accent-tabs"]` 现在采样到的 combined 语义 = 官方 `rememberCombinedBackdrop(backdrop, tabsBackdrop)`（LiquidBottomTabs.kt:242）。已验证但**等用户验收**。
   - ~~已知剩余差异①（副本图标缩放）~~ → **已在 v0.60.9/379 实现**（副本单元 1→1.2，见阶段表）。
   - 已知剩余差异②：官方 Row#2 有默认 Shadow.Default，但其本体在胶囊内被 CLEAR 挖空、镜片只采样胶囊内部 → 本项目省略，无视觉差。
   - 已知剩余差异③（本轮记录，未修）：副本单元几何中心 34dp（height 64+paddingTop 4 所致），官方 Row#2 单元中心 32dp——差 2dp；缩放 pivot 随之偏 2dp，折射内容影响微小。如需对齐需改副本行布局（影响 v0.60.7 验收的副本几何），待用户拍板。
   - **差异④：v0.60.9 D 组最终吸附翻转 → 已结案：运行间方差**
     **结论：** 379 的 14 次独立冷启动实验显示，处理窗口为 126.1–150.5ms，releaseTg 与窗口长度呈近似线性关系，并自然跨越 82dp 吸附边界，因此同一版本内部即可产生 `finalCx=121` 与 `finalCx=43` 两种结果。此前 v0.60.8 与 v0.60.5 的 D 组样本均落在 379 已观测的窗口—releaseTg 关系及落点范围内。当前数据没有显示 v0.60.9 的隐藏 Row#2 缩放修改引入可识别的 D 组行为偏移。**本差异在本实验数据范围内可由运行间处理窗口方差解释（按"运行间方差"结案，不继续 ABBA/BAAB）。**
     数据：window=126.1–150.5ms（mean 138.7，σ≈6.8）；releaseTg=75.39–100.02dp（mean 90.09，σ≈7.46）；82dp 为 0↔1 吸附边界，14 次中 12 次 finalCx=121、2 次 finalCx=43；releaseTg 与 processing window 呈近似线性关系，边界对应的临界 window≈144ms；v0.60.8-D=149.7ms/76.59dp/finalCx=43，完全落在 379 自身观测分布内；v0.60.5-D=158.4ms/75.92dp/finalCx=43，同样与既有关系一致；温度全程 33.6–33.8°C，无明显热漂移；末段 frame dt≈8.1–8.5ms，未观察到与 379 缩放修改同步出现的明确掉帧信号；当前数据中没有指向 v0.60.9 副本缩放修改的可识别残差。（措辞边界：不表述为"数学证明不存在版本效应"，也不表述为"必然由运行方差导致"。分析脚本：F:\reson-shots\dwindow2.js / exper.js。）
   - ~~**差异⑤：可见层 1.06 静置选中强调**~~ → **已在 v0.60.11/381 移除并结案**（`focusScale = focused ? 1.0 : 1`，可见层语义与官方完全一致）。审计修正：1.06 并不影响静置态（静置时镜片完全覆盖选中 tab 内容，1.06 仅在拖拽曝光时可见 +6%），其移除对静置外观零影响。
2. ~~**InteractiveHighlight**~~ → **已在 v0.60.8/378 实现**（用户已解禁）。
   - 官方语义要点：position lambda **忽略手指 offset**（位置=胶囊中心+panelOffset，非真实手指位置）；官方为"Row graphicsLayer(panelOffset) + position 内 panelOffset"双重结构，本项目画布（面板根平移）+position 各一次与官方屏幕效果逐帧一致；回弹时机=**手指抬起瞬间**（spring 0.5/300 ζ=0.5 欠阻尼有 ~1.16 过冲，官方同参数同行为），与 dock pressProgress 的等收敛 retract 独立。
   - 实现载体：GlassEffectView 新增 interactiveHighlight/highlightPressed/effectId/highlightAnchor/highlightAnchorInset 五个 prop + 独立弹簧 + 第 4 个 AGSL（InteractiveHighlightShader）；光斑画在胶囊裁剪内 surface 之后、rim 之前。
   - 已知剩余差异：无（参数/顺序/混合均逐字对照；光斑经 Row#2 进入镜片采样与官方一致）。
3. 已记录不修的小项（用户知情）：Capsule 超椭圆 vs 圆角胶囊近似；时间戳 monotonic vs 官方墙钟；LSQ2 为算法语义重建（本机无 Compose sources）；RTL 未验证；无源兜底路径不画三层（注意：accent-tabs 内嵌玻璃后，无 page 源的页面镜片内会多一层 FAFAFA40% 表面膜——玻璃皮肤所有 dock 页均声明 PageSource，实际不触发）；真人手指轨迹未测（全部为 `adb input` 注入）。

## 6. 工具链与测试协议

```powershell
# 构建（3-6 分钟；构建期间不要结束回合）
powershell -ExecutionPolicy Bypass -File .\build-local.ps1
# 产物：android\app\build\outputs\apk\release\app-release.apk
# 安装（adb 不在 PATH）：
C:\Users\yayabxa\AppData\Local\Android\Sdk\platform-tools\adb.exe install -r <apk>
```

- 设备：vivo，1260×2800 @560dpi（3.5x）。dock 中线 y≈2548，tab 图标触摸 y≈2477，tab 中心 x = 219/494/766/1039（±3px）。
- **测试协议（避免手势干扰）**：`am force-stop` → 冷启动等 10s → **每组只做第一次手势** → 等 13~14s → pull CSV。C/D 组需先 `input tap 1039 2477` 切到 tab3 再等 12s。
- 手势注入：`input swipe`（A/C=2500ms 慢速，B/D=180ms 快速，x 250↔1010）；`input motionevent DOWN/MOVE/UP/CANCEL`（注意每步 ≥130ms，单帧大跳变不可靠）。
- CSV：`/sdcard/Android/data/com.reson.chat/files/anim.csv`，16 列（timestamp,cx,targetCx,velocity,pressProgress,scaleX,scaleY,settleCx,awaitingRetract,velocitySourceCx,velocitySourceIndex,velocityRawCx,velocityRawIndex,velocityTrackerSampleCount,offsetAnimation,panelOffset），`#START/#END` 标记行。
- 分析脚本（可复用/改造）：`F:\reson-shots\analyze*.js`、`panel-trajectory.js`、`deadzone2.js`、`onend-check*.js`、`vt-test.js`、`paneloffset-test.js`。
- 验证手段：截图（`screencap` + System.Drawing 裁剪）+ **像素游程测量**（胶囊左缘静止应精确 70px；图标中心 219/494.5/766.5/1039.5）。
- 快速健康检查：真机 Overlay 15 项（4 位小数）；拖拽中 `vtRawCx` ≈ 手指速度（±5%）。

## 7. 已知坑（全部踩过）

1. **tsc 基线 = 382 个错误**：不得新增；只看 `GlassDock|NativeBackdrop|GlassEffect` 相关是否出现。
2. **Kotlin 错误消息会被 daemon 截断成首字母**（如 `477:40 N`）：直接对照 `C:\Users\yayabxa\AppData\Local\Android\Sdk\sources\android-36.1\` 的 Java 源码核对 API（RenderNode：`setUseCompositingLayer(boolean,Paint?)` 两参、`endRecording()` 在 node 不在 Canvas、**无 setBlendMode**（用 saveLayer + `PorterDuff.Mode.ADD`）、只有 `setRenderEffect` 无 getter 不能用合成属性）。
3. **PowerShell 内置别名冲突**：不要定义名为 `MV`、`Measure` 的函数；中文注释的 .ps1 必须 UTF-8 BOM，否则解析炸。
4. RNGH：`changeX` 只在 `.onChange`；`onFinalize` 在 END 与 CANCELLED 都触发（去重用 `dragActive`）；`lastUpdateEvent` 手势开始时重置。
5. worklet **没有** NativeModules：velocity tracker 只能 worklet 内实现（用户已选此方案，勿改回 Kotlin 桥）。
6. DebugOverlay 必须 React.memo 子组件：父组件 10Hz setState 会重建 GestureDetector 导致手势失效。
7. `android/gradle.properties` 的 jvmargs 只能定义一次。
8. expo 构建必须跳过 lint（`-x lintVitalAnalyzeRelease -x lintVitalRelease`，已在 build-local.ps1）否则 Metaspace OOM。
9. 首次冷启动后前 10 秒内别注入手势（未就绪）。
10. 新增 native 组件靠 autolinking/Package 注册（MainApplication.kt），不走 config plugin。
11. **采样源版本门控（v0.60.7）**：GlassEffectView 可以声明在某个 BackdropSource 内部（tabsBackdrop 语义）。`BackdropRegistry.notifyEffects()` 现在逐效果调 `notifySourcesChanged()`（按 contentVersion 快照门控），删除此门控会导致 60fps 持续重绘循环。新增"源内嵌玻璃"层时保持该机制。
12. `input motionevent DOWN` 单发后 shell 退出，孤立指针会被系统取消（表现为按压无效）；要"按住"状态用近零距离 `input swipe x y x+1 y 1500`。
13. PowerShell 里 `adb exec-out screencap -p > file` 会用文本编码破坏 PNG（二进制必须走 cmd 重定向或 `Start-Process -RedirectStandardOutput`）。
14. **真机测试期间人手会碰手机**（本本轮实测：会话中混入 21 组人手势、安装确认框也需人点）。自动化验证前确认设备无人操作；干净度用 CSV 的 `#START/#END` 组数校验（A 组应恰为 1）。

## 8. 沟通基调

用户是验收驱动、逐阶段推进的：每轮给出"修改了什么 / 官方源码依据 / 真机实测数据 / 是否回归 / 剩余差异"，**让证据说话**，不夸大。用户欣赏：先给映射表再动代码、区分性测试（构造两法结果不同的场景）、如实报告异常（如 app.json 回退、E 组注入异常）。用户反感：凭记忆断言官方行为、顺手改无关代码、声称未经验证的 1:1。

—— 交接完毕。**v0.60.12 / 382 已通过最终 A/B 验收，Liquid Glass Bottom Tabs 复制项目正式收官**（见 §4 收官记录）。后续如需改动玻璃管线，先读本档 §2 硬性约束与 §7 已知坑，并对照 §4 已接受差异清单确认不重开已结案项。
