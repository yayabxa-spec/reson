package com.reson.chat.backdrop

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Path
import android.graphics.RectF
import android.graphics.RenderEffect
import android.graphics.RenderNode
import android.graphics.Shader
import android.graphics.RuntimeShader
import android.os.Build
import android.view.Choreographer
import android.view.View
import android.view.ViewGroup
import android.view.ViewParent
import android.view.ViewTreeObserver
import androidx.annotation.RequiresApi

/**
 * 玻璃效果视图（对应 Kyant0/Backdrop 的 drawBackdrop 修饰符）：
 * 声明 sources（背景层 id 列表，等价 combinedBackdrop），把各源视图的
 * RenderNode 按（源屏幕坐标 - 自己屏幕坐标）平移绘制进离屏层，
 * 再依次套用 vibrancy(饱和度1.5) ⇒ blur ⇒ lens(RuntimeShader 折射) 效果链，
 * 裁剪圆角后上屏，最后画表面色（onDrawSurface）与子视图。
 *
 * AGSL 着色器逐字移植自 F:\AndroidLiquidGlass-kmp backdrop/src/commonMain/
 * kotlin/com/kyant/backdrop/internal/Shaders.kt（Apache-2.0, Kyant0）。
 */
class GlassEffectView(context: Context) : ViewGroup(context) {
    private var sourceIds: List<String> = emptyList()
    private var cornerRadiusPx: Float = 0f
    private var blurRadiusPx: Float = 0f
    private var lensHeightPx: Float = 0f
    private var lensAmountPx: Float = 0f
    private var chromatic: Boolean = false
    private var vibrancy: Boolean = false
    private var lensAlwaysOn: Boolean = false
    private var pressed: Boolean = false
    private var surfaceColor: Int = Color.TRANSPARENT
    private var pressedSurfaceColor: Int = Color.TRANSPARENT
    // v0.60.6：官方 drawBackdrop 的 highlight/shadow/innerShadow 修饰层
    // （LiquidBottomTabs 仅在运动镜片 Box 上以 alpha=progress 启用三者；
    //   dock Row#1 为默认参数恒定 alpha=1 —— 用 lensAlwaysOn 区分）
    private var highlightEnabled = false
    private var shadowEnabled = false
    private var innerShadowEnabled = false

    // v0.60.8：官方 catalog/utils/InteractiveHighlight（LiquidBottomTabs.kt:148-159/:182/:221）
    // interactiveHighlight=启用绘制；highlightPressed=手势活跃（onStart true / endDrag false，
    // 抬起瞬间回弹，与 pressActive 的"等收敛 retract"时机不同）；effectId/highlightAnchor=
    // 位置锚点互引；highlightAnchorInset=官方 (value+0.5)×tabW 与 cx 的 INNER_PAD 差（4dp）
    private var interactiveHighlightEnabled = false
    private var effectId: String = ""
    private var anchorId: String = ""
    private var anchorInsetPx = 0f

    // 官方 InteractiveHighlight.pressProgress：spring(0.5f, 300f, 0.001f)
    // ζ=0.5 → 阻尼系数 c = 2×0.5×√300 = 17.3205，k=300（与 lensProgress 的 ζ=1,k=1000 独立）
    private var highlightProgress = 0f
    private var highlightProgressVel = 0f
    private var highlightProgressTarget = 0f
    private var highlightLastFrameNs = 0L
    private val highlightSpringK = 300f
    private val highlightSpringC = 2f * 0.5f * kotlin.math.sqrt(300f)
    private val highlightProgressThreshold = 0.001f

    private val highlightFrameCallback = object : Choreographer.FrameCallback {
        override fun doFrame(frameTimeNanos: Long) {
            val dtSec = if (highlightLastFrameNs == 0L) 1f / 60f
            else ((frameTimeNanos - highlightLastFrameNs) / 1_000_000_000.0).toFloat().coerceIn(0f, 0.05f)
            highlightLastFrameNs = frameTimeNanos
            var remaining = dtSec
            val maxStep = 1f / 240f
            while (remaining > 1e-6f) {
                val step = if (remaining < maxStep) remaining else maxStep
                val accel = -highlightSpringK * (highlightProgress - highlightProgressTarget) - highlightSpringC * highlightProgressVel
                highlightProgressVel += accel * step
                highlightProgress += highlightProgressVel * step
                remaining -= step
            }
            val settled = kotlin.math.abs(highlightProgress - highlightProgressTarget) < highlightProgressThreshold &&
                kotlin.math.abs(highlightProgressVel) < 0.05f
            if (settled) {
                highlightProgress = highlightProgressTarget
                highlightProgressVel = 0f
                highlightLastFrameNs = 0L
                invalidate()
                return
            }
            invalidate()
            Choreographer.getInstance().postFrameCallback(this)
        }
    }

    private var interactiveShader: RuntimeShader? = null

    // 官方 pressProgress：spring(1f, 1000f, 0.001f)
    // （Compose：阻尼比 ζ=1、stiffness k=1000、mass=1；阈值 0.001）
    // 等价二阶系统：x'' = -k·(x - target) - c·x'，其中阻尼系数 c = 2ζ√k = 63.2456
    // 用半隐式欧拉 + 1/240s 子步积分，替换原先的指数逼近（非官方曲线）
    private var lensProgress = 0f
    private var progressVel = 0f
    private var progressTarget = 0f
    private var lastFrameNs = 0L
    private val springK = 1000f
    private val springC = 2f * kotlin.math.sqrt(1000f)
    private val progressThreshold = 0.001f

    private val frameCallback = object : Choreographer.FrameCallback {
        override fun doFrame(frameTimeNanos: Long) {
            val dtSec = if (lastFrameNs == 0L) 1f / 60f
            else ((frameTimeNanos - lastFrameNs) / 1_000_000_000.0).toFloat().coerceIn(0f, 0.05f)
            lastFrameNs = frameTimeNanos
            // 半隐式欧拉，固定子步长保证稳定
            var remaining = dtSec
            val maxStep = 1f / 240f
            while (remaining > 1e-6f) {
                val step = if (remaining < maxStep) remaining else maxStep
                val accel = -springK * (lensProgress - progressTarget) - springC * progressVel
                progressVel += accel * step
                lensProgress += progressVel * step
                remaining -= step
            }
            val settled = kotlin.math.abs(lensProgress - progressTarget) < progressThreshold &&
                kotlin.math.abs(progressVel) < 0.05f
            if (settled) {
                lensProgress = progressTarget
                progressVel = 0f
                lastFrameNs = 0L
                invalidate()
                return
            }
            // 未收敛（含 release 回弹）时逐帧重绘：镜片位置随手指/弹簧移动，
            // 采样坐标必须逐帧更新
            invalidate()
            Choreographer.getInstance().postFrameCallback(this)
        }
    }

    private var baseNode: RenderNode? = null
    private var stageNodes: Array<RenderNode?> = arrayOfNulls(3)
    private var nodesWidth = 0
    private var nodesHeight = 0
    private var refractionShader: RuntimeShader? = null
    private var dispersionShader: RuntimeShader? = null
    // v0.60.6：Highlight / Shadow / InnerShadow 离屏层缓存
    private var shadowNode: RenderNode? = null
    private var highlightNode: RenderNode? = null
    private var innerShadowNode: RenderNode? = null
    private var innerShadowBlurRadius = -1f
    private var highlightShader: RuntimeShader? = null

    // v0.60.7：上次 base 重录时的采样源快照（视图身份 + 内容版本）。
    // notifySourcesChanged 用它判断被采样源是否真的变化：
    // 玻璃效果视图可被声明在某个 BackdropSource 内部（官方 tabsBackdrop 语义），
    // 此时「源重录 → 通知 → 效果重绘 → 源再重录」若不门控会变成 60fps 持续循环。
    private var recordedSources: List<BackdropSourceView> = emptyList()
    private var recordedVersions: List<Long> = emptyList()

    private val density get() = resources.displayMetrics.density
    private var attachedToWindowFlag = false
    private val selfLoc = IntArray(2)
    private val srcLoc = IntArray(2)
    private val netScale = FloatArray(2)

    /**
     * 本视图局部坐标受到的总缩放 = 自身 scale × 全部祖先 scale。
     * RN 动画的 transform: scale 施加在父级 Animated.View 上（本视图自身 scaleX 恒为 1），
     * 只读自身会漏掉，导致采样内容被放大（实测 dock 1.05×、镜片 1.39×）。
     */
    private fun computeNetScale(out: FloatArray) {
        var sx = if (scaleX != 0f) scaleX else 1f
        var sy = if (scaleY != 0f) scaleY else 1f
        var p: ViewParent? = parent
        var guard = 0
        while (p is View && guard++ < 64) {
            if (p.scaleX != 0f) sx *= p.scaleX
            if (p.scaleY != 0f) sy *= p.scaleY
            p = p.parent
        }
        out[0] = sx
        out[1] = sy
    }

    /**
     * 祖先链缩放变化监测：父级 transform 变化不会让子视图重绘，
     * 会导致 base 层沿用旧缩放录制的内容（表现为内容被父级缩放整体放大）。
     * 每帧比对净缩放，变化即 invalidate 触发按新缩放重新采样。
     */
    private val lastScale = FloatArray(2)
    private val scaleWatcher = object : ViewTreeObserver.OnPreDrawListener {
        override fun onPreDraw(): Boolean {
            computeNetScale(netScale)
            if (netScale[0] != lastScale[0] || netScale[1] != lastScale[1]) {
                lastScale[0] = netScale[0]
                lastScale[1] = netScale[1]
                invalidate()
            }
            return true
        }
    }

    fun setSources(v: List<String>) {
        sourceIds = v ?: emptyList()
        invalidate()
    }

    /**
     * v0.60.7：源内容变化通知（BackdropRegistry.notifyEffects 逐效果调用）。
     * 仅当被采样源的视图身份或内容版本与上次 base 重录快照不同才重绘。
     * 其余重绘驱动（按压弹簧逐帧、净缩放 watcher、props、尺寸）不受影响。
     */
    fun notifySourcesChanged() {
        val srcs = sourceIds.mapNotNull { BackdropRegistry.getSource(it) }
        if (srcs.size != recordedSources.size) {
            postInvalidate()
            return
        }
        for (i in srcs.indices) {
            if (srcs[i] !== recordedSources[i] || srcs[i].contentVersion != recordedVersions[i]) {
                postInvalidate()
                return
            }
        }
    }

    fun setCornerRadiusDp(v: Float) { cornerRadiusPx = (v ?: 0f) * density; rebuild() }
    fun setBlurRadiusDp(v: Float) { blurRadiusPx = (v ?: 0f) * density; invalidate() }
    fun setLensHeightDp(v: Float) { lensHeightPx = (v ?: 0f) * density; invalidate() }
    fun setLensAmountDp(v: Float) { lensAmountPx = (v ?: 0f) * density; invalidate() }
    fun setChromatic(v: Boolean) { chromatic = v; invalidate() }
    fun setVibrancy(v: Boolean) { vibrancy = v; invalidate() }
    fun setLensAlwaysOn(v: Boolean) { lensAlwaysOn = v; invalidate() }

    fun setHighlight(v: Boolean) { highlightEnabled = v; invalidate() }
    fun setShadow(v: Boolean) { shadowEnabled = v; invalidate() }
    fun setInnerShadow(v: Boolean) { innerShadowEnabled = v; invalidate() }

    fun setInteractiveHighlight(v: Boolean) { interactiveHighlightEnabled = v; invalidate() }

    /** 手势活跃信号：按下→1（spring 0.5/300），抬起/取消→0（官方抬起瞬间回弹，不等 dock 收敛） */
    fun setHighlightPressed(v: Boolean) {
        val target = if (v) 1f else 0f
        if (highlightProgressTarget == target) return
        highlightProgressTarget = target
        highlightLastFrameNs = 0L
        Choreographer.getInstance().postFrameCallback(highlightFrameCallback)
    }

    fun setEffectId(v: String?) {
        effectId = v ?: ""
        if (attachedToWindowFlag) {
            BackdropRegistry.putAnchor(effectId, this)
        }
    }

    fun setHighlightAnchor(v: String?) { anchorId = v ?: ""; invalidate() }

    fun setHighlightAnchorInsetDp(v: Float) { anchorInsetPx = (v ?: 0f) * density; invalidate() }

    fun setSurfaceColor(v: String?) {
        surfaceColor = try { Color.parseColor(v) } catch (_: Exception) { Color.TRANSPARENT }
        invalidate()
    }

    fun setPressedSurfaceColor(v: String?) {
        pressedSurfaceColor = try { Color.parseColor(v) } catch (_: Exception) { Color.TRANSPARENT }
        invalidate()
    }

    /** 按压状态切换：进度由原生侧逐帧动画逼近（源码 progress spring） */
    fun setGlassPressed(v: Boolean) {
        if (pressed == v) return
        pressed = v
        progressTarget = if (v) 1f else 0f
        lastFrameNs = 0L
        Choreographer.getInstance().postFrameCallback(frameCallback)
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        attachedToWindowFlag = true
        BackdropRegistry.registerEffect(this)
        if (effectId.isNotEmpty()) BackdropRegistry.putAnchor(effectId, this)
        computeNetScale(lastScale)
        viewTreeObserver.addOnPreDrawListener(scaleWatcher)
    }

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        for (i in 0 until childCount) {
            val child = getChildAt(i)
            child.layout(child.left, child.top, child.right, child.bottom)
        }
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        attachedToWindowFlag = false
        BackdropRegistry.unregisterEffect(this)
        if (effectId.isNotEmpty()) BackdropRegistry.removeAnchor(effectId, this)
        val vto = viewTreeObserver
        if (vto.isAlive) vto.removeOnPreDrawListener(scaleWatcher)
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        rebuild()
    }

    private fun rebuild() {
        nodesWidth = 0
        nodesHeight = 0
        stageNodes = arrayOfNulls(3)
        baseNode = null
        shadowNode = null
        highlightNode = null
        innerShadowNode = null
        innerShadowBlurRadius = -1f
        invalidate()
    }

    private fun obtainStage(index: Int, w: Int, h: Int): RenderNode {
        var node = stageNodes[index]
        if (node == null || nodesWidth != w || nodesHeight != h) {
            node = RenderNode("glass-stage-$index")
            node.setPosition(0, 0, w, h)
            node.setClipToBounds(false)
            stageNodes[index] = node
        }
        return node
    }

    private fun obtainBase(w: Int, h: Int): RenderNode {
        var node = baseNode
        if (node == null || nodesWidth != w || nodesHeight != h) {
            node = RenderNode("glass-base")
            node.setPosition(0, 0, w, h)
            node.setClipToBounds(false)
            baseNode = node
            nodesWidth = w
            nodesHeight = h
        }
        return node
    }

    @RequiresApi(Build.VERSION_CODES.TIRAMISU)
    private fun obtainShader(chromatic: Boolean): RuntimeShader {
        if (chromatic) {
            var sh = dispersionShader
            if (sh == null) {
                sh = RuntimeShader(DispersionShader)
                dispersionShader = sh
            }
            return sh
        }
        var sh = refractionShader
        if (sh == null) {
            sh = RuntimeShader(RefractionShader)
            refractionShader = sh
        }
        return sh
    }

    override fun dispatchDraw(canvas: Canvas) {
        val w = width
        val h = height
        val hw = canvas.isHardwareAccelerated &&
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
        val srcs = if (hw) sourceIds.mapNotNull { BackdropRegistry.getSource(it) } else emptyList()

        val canEffect = hw && srcs.isNotEmpty() && w > 0 && h > 0
        if (!canEffect) {
            // 兜底：无源/无硬件加速时只画表面色与子视图
            recordedSources = srcs
            recordedVersions = srcs.map { it.contentVersion }
            drawSurface(canvas, 0f)
            super.dispatchDraw(canvas)
            return
        }

        // 1. base 层：把各源节点按（源屏幕位置 - 自己屏幕位置）平移绘制
        //
        // 坐标约定（等价官方 LayerBackdrop.drawBackdrop）：
        // a) selfLoc = 本视图"局部原点"的屏幕位置。
        //    getLocationOnScreen() 不含本视图自身的 transform（translation/scale），
        //    所以必须手动补 translationX/Y。
        // b) 官方在采样绘制时套 inverseTransform（InverseLayerScope 的 scale(1/sx,1/sy)），
        //    用以抵消 layer 的缩放；RN 的 transform: scale 由父层施加、本视图画布已被放大，
        //    故此处按【同一 pivot】施加 1/s 逆缩放，得到与官方等价的净映射：
        //        screen(q) = selfLoc + q          （纯平移，无缩放）
        //    即：采样内容与页面 1:1，不被放大；RN scale 的中心原点偏移被精确抵消，
        //    采样矩形回到布局矩形（不再外扩），从而消除越界采样。
        val base = obtainBase(w, h)
        val rc = base.beginRecording(w, h)
        try {
            getLocationOnScreen(selfLoc)
            // getLocationOnScreen 已包含祖先链 transform，但不含本视图自身 transform，
            // 故补上自身项：translation + 绕 pivot 缩放引起的原点偏移
            selfLoc[0] += (translationX + (1f - scaleX) * pivotX + 0.5f).toInt()
            selfLoc[1] += (translationY + (1f - scaleY) * pivotY + 0.5f).toInt()

            computeNetScale(netScale)
            val sx = netScale[0]
            val sy = netScale[1]
            val needInverse = sx != 1f || sy != 1f
            for (src in srcs) {
                val node = src.obtainNode() ?: continue
                src.getLocationOnScreen(srcLoc)
                val save = rc.save()
                if (needInverse) {
                    // 逆缩放 pivot = 局部原点(0,0)，与官方 InverseLayerScope 的
                    // inverseTransformAtTopLeft(scale(1/sx, 1/sy, Offset.Zero)) 一致。
                    // 此时净映射 screen = selfLoc + q：采样内容与页面精确 1:1，
                    // 且完整填充放大后的胶囊（采样面积随缩放同比例增大，不含空带）
                    rc.scale(1f / sx, 1f / sy)
                }
                rc.translate((srcLoc[0] - selfLoc[0]).toFloat(), (srcLoc[1] - selfLoc[1]).toFloat())
                rc.drawRenderNode(node)
                rc.restoreToCount(save)
            }
            // v0.60.7：记录本次采样快照（版本号在源重录时递增）
            recordedSources = srcs
            recordedVersions = srcs.map { it.contentVersion }
        } finally {
            base.endRecording()
        }

        var current: RenderNode = base
        var stageIdx = 0
        // 2. 效果链（源码文档顺序）：colorFilter ⇒ blur ⇒ lens
        if (vibrancy && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // 源码 ColorFilter.kt colorControls(saturation=1.5) 精确矩阵
            val s = 1.5f
            val invSat = 1f - s
            val r = 0.213f * invSat
            val g = 0.715f * invSat
            val b = 0.072f * invSat
            val cm = ColorMatrix(floatArrayOf(
                r + s, g, b, 0f, 0f,
                r, g + s, b, 0f, 0f,
                r, g, b + s, 0f, 0f,
                0f, 0f, 0f, 1f, 0f
            ))
            current = wrap(
                current, stageIdx++,
                RenderEffect.createColorFilterEffect(ColorMatrixColorFilter(cm)), w, h
            )
        }
        if (blurRadiusPx > 0f && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val r = blurRadiusPx
            current = wrap(
                current, stageIdx++,
                RenderEffect.createBlurEffect(r, r, Shader.TileMode.CLAMP), w, h
            )
        }
        val useLens = (lensAlwaysOn || lensProgress > 0.001f) &&
            lensAmountPx > 0f && lensHeightPx > 0f &&
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
        if (useLens) {
            val amount = lensAmountPx * if (lensAlwaysOn) 1f else lensProgress
            val height = lensHeightPx * if (lensAlwaysOn) 1f else lensProgress
            val sh = try {
                obtainShader(chromatic)
            } catch (e: Exception) {
                android.util.Log.w("GlassEffect", "shader create failed", e)
                null
            }
            if (sh != null) {
                sh.setFloatUniform("size", w.toFloat(), h.toFloat())
                sh.setFloatUniform("offset", 0f, 0f)
                val r = cornerRadiusPx
                sh.setFloatUniform("cornerRadii", floatArrayOf(r, r, r, r))
                // 源码 Lens.kt：refractionAmount 传负值
                sh.setFloatUniform("refractionHeight", height)
                sh.setFloatUniform("refractionAmount", -amount)
                sh.setFloatUniform("depthEffect", 0f)
                if (chromatic) sh.setFloatUniform("chromaticAberration", 1f)
                current = wrap(
                    current, stageIdx++,
                    RenderEffect.createRuntimeShaderEffect(sh, "content"), w, h
                )
            }
        }

        // 0. 外阴影（源码 ShadowElement：在一切内容之下、不受形状裁剪）
        //    alpha：dock（lensAlwaysOn）恒 1（官方默认 Shadow alpha=1f）；
        //    运动镜片 alpha=progress（官方 Shadow(alpha = progress)）
        val decoAlpha = if (lensAlwaysOn) 1f else lensProgress
        if (shadowEnabled && decoAlpha > 0.001f) {
            drawShadow(canvas, decoAlpha, w, h)
        }

        // 3. 裁剪圆角并上屏（源码：layer clip + shape capsule）
        val save = canvas.save()
        if (cornerRadiusPx > 0f) {
            val path = Path()
            path.addRoundRect(
                RectF(0f, 0f, w.toFloat(), h.toFloat()),
                cornerRadiusPx, cornerRadiusPx, Path.Direction.CW
            )
            canvas.clipPath(path)
        }
        try {
            canvas.drawRenderNode(current)
        } catch (e: Exception) {
            android.util.Log.w("GlassEffect", "draw failed", e)
        }
        // 4. 表面色（源码 onDrawSurface：黑10%*(1-progress) + 按压色*progress）
        drawSurface(canvas, if (lensAlwaysOn) 0f else lensProgress)

        // 4a. v0.60.8：InteractiveHighlight（官方 catalog/utils/InteractiveHighlight.kt
        //     drawWithContent：玻璃→surface→[白8%×progress 全场提亮 + AGSL 径向光斑(Plus)]
        //     →内容(图标)）。位于胶囊裁剪内、rim(4b)/innerShadow(4c) 之下 —— 与官方一致
        if (interactiveHighlightEnabled && highlightProgress > 0.001f) {
            drawInteractiveHighlight(canvas, highlightProgress, w, h)
        }
        canvas.restoreToCount(save)

        // 4b. 边缘 rim 高光（源码 HighlightNode：record 内 clip 本体、上屏无 clip）。
        //     Z 序：modifier 链为 InnerShadow(外) → Shadow → Highlight(内) → DrawBackdrop(最内)，
        //     外层 modifier 的后处理画在最顶 → Highlight 在 surface 之上、InnerShadow 之下
        if (highlightEnabled && decoAlpha > 0.001f) {
            drawHighlight(canvas, decoAlpha, w, h)
        }

        // 4c. 内阴影（源码 InnerShadowNode：clip 形状内、全部内容之下的最顶层）
        if (innerShadowEnabled && lensProgress > 0.001f) {
            val save2 = canvas.save()
            if (cornerRadiusPx > 0f) {
                val path = Path()
                path.addRoundRect(
                    RectF(0f, 0f, w.toFloat(), h.toFloat()),
                    cornerRadiusPx, cornerRadiusPx, Path.Direction.CW
                )
                canvas.clipPath(path)
            }
            drawInnerShadow(canvas, lensProgress, w, h)
            canvas.restoreToCount(save2)
        }

        // 5. 子视图（rim 高光等）
        super.dispatchDraw(canvas)
    }

    private fun wrap(
        inner: RenderNode, index: Int, fx: RenderEffect, w: Int, h: Int
    ): RenderNode {
        val stage = obtainStage(index, w, h)
        stage.setRenderEffect(fx)
        val rc = stage.beginRecording(w, h)
        try {
            rc.drawRenderNode(inner)
        } finally {
            stage.endRecording()
        }
        return stage
    }

    /** 胶囊路径（官方 shape = Capsule()，此处用全圆角胶囊等价；cornerRadii = minDim/2） */
    private fun capsulePath(w: Float, h: Float): Path {
        val p = Path()
        if (cornerRadiusPx > 0f) {
            p.addRoundRect(RectF(0f, 0f, w, h), cornerRadiusPx, cornerRadiusPx, Path.Direction.CW)
        } else {
            p.addRect(0f, 0f, w, h, Path.Direction.CW)
        }
        return p
    }

    /**
     * v0.60.6：外阴影 —— 逐字复刻官方 ShadowNode.draw()
     * （backdrop/src/commonMain/.../shadow/ShadowModifier.kt:73-111）
     * Shadow.Default：radius=24dp、offset=(0, radius/6)、color=Black 10%、blend=SrcOver。
     * 离屏层（= CompositingStrategy.Offscreen）：translate(2r+ox,2r+oy) 画 blur 填充体，
     * 再平移 offset 用 CLEAR 挖掉本体；上屏 translate(-2r,-2r)。
     */
    private fun drawShadow(canvas: Canvas, alpha: Float, w: Int, h: Int) {
        val r = 24f * density
        val ox = 0f
        val oy = r / 6f
        val sw = (w + r * 4f + ox).toInt().coerceAtLeast(1)
        val sh = (h + r * 4f + oy).toInt().coerceAtLeast(1)
        var node = shadowNode
        if (node == null || node.width != sw || node.height != sh) {
            node = RenderNode("glass-shadow").apply {
                setPosition(0, 0, sw, sh)
                setClipToBounds(false)
                // 源码 CompositingStrategy.Offscreen（CLEAR 只作用本层）
                setUseCompositingLayer(true, null)
            }
            shadowNode = node
        }
        node.alpha = alpha // 源码 shadowLayer.alpha = shadow.alpha
        val rc = node.beginRecording(sw, sh)
        try {
            val path = capsulePath(w.toFloat(), h.toFloat())
            val fill = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
                color = 0x1A000000 // Color.Black.copy(alpha = 0.1f)
                maskFilter = android.graphics.BlurMaskFilter(
                    r, android.graphics.BlurMaskFilter.Blur.NORMAL
                ) // 源码 paint.blur(radius)
            }
            rc.save()
            rc.translate(r * 2f + ox, r * 2f + oy)
            rc.drawPath(path, fill)
            rc.translate(-ox, -oy)
            val clear = android.graphics.Paint().apply {
                xfermode = android.graphics.PorterDuffXfermode(
                    android.graphics.PorterDuff.Mode.CLEAR
                ) // 源码 ShadowMaskPaint
            }
            rc.drawPath(path, clear)
            rc.restore()
        } finally {
            node.endRecording()
        }
        canvas.save()
        canvas.translate(-r * 2f, -r * 2f)
        canvas.drawRenderNode(node)
        canvas.restore()
    }

    /**
     * v0.60.6：边缘 rim 高光 —— 逐字复刻官方 HighlightNode.draw()
     * （backdrop/src/commonMain/.../highlight/HighlightModifier.kt:87-133）
     * Highlight.Default：width=0.5dp（stroke = ceil(0.5dp)×2）、blur=0.25dp、
     * style.Default{White50%, blend=Plus, angle=45°, falloff=1}、shader=DefaultHighlightShader。
     * 离屏层 size+2：translate(1,1) → clip → stroke；上屏 translate(-1,-1)。
     */
    private fun drawHighlight(canvas: Canvas, alpha: Float, w: Int, h: Int) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val safeW = w + 2
        val safeH = h + 2
        var node = highlightNode
        if (node == null || node.width != safeW || node.height != safeH) {
            node = RenderNode("glass-highlight").apply {
                setPosition(0, 0, safeW, safeH)
                setClipToBounds(false)
            }
            highlightNode = node
            highlightShader = null
        }
        node.alpha = alpha // 源码 highlightLayer.alpha = highlight.alpha
        // 源码 highlightLayer.blendMode = Plus。android.graphics.RenderNode 无 setBlendMode，
        // 以 saveLayer + PorterDuff.Mode.ADD（= 饱和加法 Plus）等价实现
        val blendPaint = android.graphics.Paint().apply {
            xfermode = android.graphics.PorterDuffXfermode(
                android.graphics.PorterDuff.Mode.ADD
            )
        }
        val rc = node.beginRecording(safeW, safeH)
        try {
            val path = capsulePath(w.toFloat(), h.toFloat())
            val strokeW =
                kotlin.math.ceil(minOf(0.5f * density, minOf(w, h) / 2f)) * 2f
            val sh = highlightShader ?: RuntimeShader(DefaultHighlightShaderString).also { s ->
                s.setFloatUniform("size", w.toFloat(), h.toFloat())
                val r = cornerRadiusPx
                s.setFloatUniform("cornerRadii", floatArrayOf(r, r, r, r))
                s.setColorUniform("color", Color.WHITE) // 源码 color.copy(alpha = 1f)
                s.setFloatUniform("angle", (45f * (Math.PI / 180f)).toFloat())
                s.setFloatUniform("falloff", 1f)
                highlightShader = s
            }
            val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
                style = android.graphics.Paint.Style.STROKE
                strokeWidth = strokeW
                shader = sh
                maskFilter = android.graphics.BlurMaskFilter(
                    0.25f * density, android.graphics.BlurMaskFilter.Blur.NORMAL
                ) // 源码 paint.blur(blurRadius)
            }
            rc.save()
            rc.translate(1f, 1f)
            rc.clipPath(path)
            rc.drawPath(path, paint)
            rc.restore()
        } finally {
            node.endRecording()
        }
        canvas.save()
        canvas.saveLayer(-1f, -1f, (safeW - 1).toFloat(), (safeH - 1).toFloat(), blendPaint)
        canvas.translate(-1f, -1f)
        canvas.drawRenderNode(node)
        canvas.restore()
        canvas.restore()
    }

    /**
     * v0.60.6：内阴影 —— 逐字复刻官方 InnerShadowNode.draw()
     * （backdrop/src/commonMain/.../shadow/InnerShadowModifier.kt:78-133）
     * LiquidBottomTabs：InnerShadow(radius = 8dp×progress, alpha = progress)，
     * 默认 offset=(0, radius)、color=Black 15%；layer.renderEffect = Blur(radius, Decal)。
     * 录制：clip → fill → translate(offset) → CLEAR 挖空；绘制：clip 内 drawLayer。
     */
    private fun drawInnerShadow(canvas: Canvas, progress: Float, w: Int, h: Int) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
        val radius = 8f * density * progress
        val ox = 0f
        val oy = radius
        var node = innerShadowNode
        if (node == null) {
            node = RenderNode("glass-inner-shadow").apply {
                setPosition(0, 0, w, h)
                setClipToBounds(false)
                setUseCompositingLayer(true, null) // CLEAR 需离屏（RenderEffect 存在时亦强制离屏）
            }
            innerShadowNode = node
            innerShadowBlurRadius = -1f
        }
        if (kotlin.math.abs(innerShadowBlurRadius - radius) > 0.01f) {
            // RenderNode 只有 setRenderEffect（无 getter），不能用 Kotlin 合成属性
            node.setRenderEffect(
                if (radius > 0f) RenderEffect.createBlurEffect(
                    radius, radius, Shader.TileMode.DECAL
                ) else null
            )
            innerShadowBlurRadius = radius
        }
        node.alpha = progress // 源码 shadowLayer.alpha = shadow.alpha
        val rc = node.beginRecording(w, h)
        try {
            val path = capsulePath(w.toFloat(), h.toFloat())
            rc.save()
            rc.clipPath(path)
            val fill = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
                color = 0x26000000 // Color.Black.copy(alpha = 0.15f)
            }
            rc.drawPath(path, fill)
            rc.translate(ox, oy)
            val clear = android.graphics.Paint().apply {
                xfermode = android.graphics.PorterDuffXfermode(
                    android.graphics.PorterDuff.Mode.CLEAR
                ) // 源码 ShadowMaskPaint
            }
            rc.drawPath(path, clear)
            rc.restore()
        } finally {
            node.endRecording()
        }
        canvas.drawRenderNode(node)
    }

    /**
     * v0.60.8：InteractiveHighlight —— 逐字复刻官方
     * catalog/utils/InteractiveHighlight.kt 的 drawWithContent：
     *   ① drawRect(White.copy(0.08f × progress), Plus)  —— 全场提亮
     *   ② shader：size / color=White.copy(0.15f×progress) / radius=size.minDimension×1.5f /
     *      position = position(size, positionAnimation.value)
     *      drawRect(ShaderBrush(shader), Plus) —— 径向光斑
     * LiquidBottomTabs 的 position lambda（:151-157）忽略手指 offset 参数：
     *   x = (value+0.5)×tabWidth + panelOffset = cx − INNER_PAD + panelOffset
     *   y = size.height / 2
     *   再 coerceIn(0, size)。
     * value/panelOffset 经 anchor 的 view 属性读取（Reanimated 直设、每帧最新、零桥）：
     *   anchor.parent.translationX = cx − lensW/2（官方镜片 graphicsLayer 等价）
     *   anchor.parent.parent.translationX = 面板根 panelStyle（=官方 Row graphicsLayer(panelOffset)）
     * 官方屏幕效果为"绘制层平移 + position 内各一次 panelOffset"的双重结构；
     * 本项目画布已含面板平移一份（=官方绘制层），position 内再照抄 lambda 一次 → 与官方逐帧一致。
     * 混合：官方 BlendMode.Plus → saveLayer(ADD) 内两次 ADD drawRect（加法可结合，数学等价）。
     * API<33（无 RuntimeShader）走官方降级：只画 White.copy(0.25f×progress) Plus。
     */
    private fun drawInteractiveHighlight(canvas: Canvas, progress: Float, w: Int, h: Int) {
        val anchor = if (anchorId.isNotEmpty()) BackdropRegistry.getAnchor(anchorId) else null
        val anchorParent = anchor?.parent as? View
        val panelRoot = anchorParent?.parent as? View
        if (anchor == null || anchorParent == null || panelRoot == null || anchor.width == 0) return
        val cxPx = anchorParent.translationX + anchor.width / 2f
        val panelOffsetPx = panelRoot.translationX
        val x = (cxPx - anchorInsetPx + panelOffsetPx).coerceIn(0f, w.toFloat())
        val y = (h / 2f).coerceIn(0f, h.toFloat())

        val blendPaint = android.graphics.Paint().apply {
            xfermode = android.graphics.PorterDuffXfermode(android.graphics.PorterDuff.Mode.ADD)
        }
        val saveLayer = canvas.saveLayer(0f, 0f, w.toFloat(), h.toFloat(), blendPaint)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                val fullRect = android.graphics.Paint().apply {
                    color = android.graphics.Color.argb(
                        (255f * 0.08f * progress).toInt().coerceIn(0, 255), 255, 255, 255
                    )
                    xfermode = android.graphics.PorterDuffXfermode(android.graphics.PorterDuff.Mode.ADD)
                }
                canvas.drawRect(0f, 0f, w.toFloat(), h.toFloat(), fullRect)

                val sh = interactiveShader ?: RuntimeShader(InteractiveHighlightShaderString).also {
                    interactiveShader = it
                }
                sh.setFloatUniform("size", w.toFloat(), h.toFloat())
                sh.setColorUniform(
                    "color",
                    android.graphics.Color.argb(
                        (255f * 0.15f * progress).toInt().coerceIn(0, 255), 255, 255, 255
                    )
                )
                sh.setFloatUniform("radius", minOf(w, h) * 1.5f)
                sh.setFloatUniform("position", x, y)
                val spotPaint = android.graphics.Paint().apply {
                    shader = sh
                    xfermode = android.graphics.PorterDuffXfermode(android.graphics.PorterDuff.Mode.ADD)
                }
                canvas.drawRect(0f, 0f, w.toFloat(), h.toFloat(), spotPaint)
            } else {
                // 官方降级分支：isRuntimeShaderSupported() == false
                val fallback = android.graphics.Paint().apply {
                    color = android.graphics.Color.argb(
                        (255f * 0.25f * progress).toInt().coerceIn(0, 255), 255, 255, 255
                    )
                    xfermode = android.graphics.PorterDuffXfermode(android.graphics.PorterDuff.Mode.ADD)
                }
                canvas.drawRect(0f, 0f, w.toFloat(), h.toFloat(), fallback)
            }
        } catch (e: Exception) {
            android.util.Log.w("GlassEffect", "interactive highlight failed", e)
        } finally {
            canvas.restoreToCount(saveLayer)
        }
    }

    private fun drawSurface(canvas: Canvas, progress: Float) {
        if (surfaceColor == Color.TRANSPARENT && pressedSurfaceColor == Color.TRANSPARENT) return
        val p0 = progress
        drawColorWithAlpha(canvas, surfaceColor, 1f - p0)
        drawColorWithAlpha(canvas, pressedSurfaceColor, p0)
    }

    private fun drawColorWithAlpha(canvas: Canvas, color: Int, alphaFactor: Float) {
        if (color == Color.TRANSPARENT || alphaFactor <= 0.001f) return
        val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
            this.color = color
            alpha = (Color.alpha(color) * alphaFactor.coerceIn(0f, 1f)).toInt()
        }
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), paint)
    }
}

/* ===== AGSL 着色器（逐字移植自 Kyant0/Backdrop Shaders.kt，Apache-2.0） ===== */

private const val RoundedRectSDF = """
float radiusAt(float2 coord, float4 radii) {
    if (coord.x >= 0.0) {
        if (coord.y <= 0.0) return radii.y;
        else return radii.z;
    } else {
        if (coord.y <= 0.0) return radii.x;
        else return radii.w;
    }
}

float sdRoundedRect(float2 coord, float2 halfSize, float radius) {
    float2 cornerCoord = abs(coord) - (halfSize - float2(radius));
    float outside = length(max(cornerCoord, 0.0)) - radius;
    float inside = min(max(cornerCoord.x, cornerCoord.y), 0.0);
    return outside + inside;
}

float2 gradSdRoundedRect(float2 coord, float2 halfSize, float radius) {
    float2 cornerCoord = abs(coord) - (halfSize - float2(radius));
    if (cornerCoord.x >= 0.0 || cornerCoord.y >= 0.0) {
        return sign(coord) * normalize(max(cornerCoord, 0.0));
    } else {
        float gradX = step(cornerCoord.y, cornerCoord.x);
        return sign(coord) * float2(gradX, 1.0 - gradX);
    }
}"""

private const val DefaultHighlightShaderString = """
uniform float2 size;
uniform float4 cornerRadii;
layout(color) uniform half4 color;
uniform float angle;
uniform float falloff;

$RoundedRectSDF

half4 main(float2 coord) {
    float2 halfSize = size * 0.5;
    float2 centeredCoord = coord - halfSize;
    float radius = radiusAt(coord, cornerRadii);
    
    float gradRadius = min(radius * 1.5, min(halfSize.x, halfSize.y));
    float2 grad = gradSdRoundedRect(centeredCoord, halfSize, gradRadius);
    float2 normal = float2(cos(angle), sin(angle));
    float d = dot(grad, normal);
    float intensity = pow(abs(d), falloff);
    return color * intensity;
}"""

private const val RefractionShader = """
uniform shader content;

uniform float2 size;
uniform float2 offset;
uniform float4 cornerRadii;
uniform float refractionHeight;
uniform float refractionAmount;
uniform float depthEffect;

$RoundedRectSDF

float circleMap(float x) {
    return 1.0 - sqrt(1.0 - x * x);
}

half4 main(float2 coord) {
    float2 halfSize = size * 0.5;
    float2 centeredCoord = (coord + offset) - halfSize;
    float radius = radiusAt(coord, cornerRadii);

    float sd = sdRoundedRect(centeredCoord, halfSize, radius);
    if (-sd >= refractionHeight) {
        return content.eval(coord);
    }
    sd = min(sd, 0.0);

    float d = circleMap(1.0 - -sd / refractionHeight) * refractionAmount;
    float gradRadius = min(radius * 1.5, min(halfSize.x, halfSize.y));
    float2 grad = normalize(gradSdRoundedRect(centeredCoord, halfSize, gradRadius) + depthEffect * normalize(centeredCoord));

    float2 refractedCoord = coord + d * grad;
    return content.eval(refractedCoord);
}"""

private const val DispersionShader = """
uniform shader content;

uniform float2 size;
uniform float2 offset;
uniform float4 cornerRadii;
uniform float refractionHeight;
uniform float refractionAmount;
uniform float depthEffect;
uniform float chromaticAberration;

$RoundedRectSDF

float circleMap(float x) {
    return 1.0 - sqrt(1.0 - x * x);
}

half4 main(float2 coord) {
    float2 halfSize = size * 0.5;
    float2 centeredCoord = (coord + offset) - halfSize;
    float radius = radiusAt(coord, cornerRadii);

    float sd = sdRoundedRect(centeredCoord, halfSize, radius);
    if (-sd >= refractionHeight) {
        return content.eval(coord);
    }
    sd = min(sd, 0.0);

    float d = circleMap(1.0 - -sd / refractionHeight) * refractionAmount;
    float gradRadius = min(radius * 1.5, min(halfSize.x, halfSize.y));
    float2 grad = normalize(gradSdRoundedRect(centeredCoord, halfSize, gradRadius) + depthEffect * normalize(centeredCoord));

    float2 refractedCoord = coord + d * grad;
    float dispersionIntensity = chromaticAberration * ((centeredCoord.x * centeredCoord.y) / (halfSize.x * halfSize.y));
    float2 dispersedCoord = d * grad * dispersionIntensity;

    half4 color = half4(0.0);

    half4 red = content.eval(refractedCoord + dispersedCoord);
    color.r += red.r / 3.5;
    color.a += red.a / 7.0;

    half4 orange = content.eval(refractedCoord + dispersedCoord * (2.0 / 3.0));
    color.r += orange.r / 3.5;
    color.g += orange.g / 7.0;
    color.a += orange.a / 7.0;

    half4 yellow = content.eval(refractedCoord + dispersedCoord * (1.0 / 3.0));
    color.r += yellow.r / 3.5;
    color.g += yellow.g / 3.5;
    color.a += yellow.a / 7.0;

    half4 green = content.eval(refractedCoord);
    color.g += green.g / 3.5;
    color.a += green.a / 7.0;

    half4 cyan = content.eval(refractedCoord - dispersedCoord * (1.0 / 3.0));
    color.g += cyan.g / 3.5;
    color.b += cyan.b / 3.0;
    color.a += cyan.a / 7.0;

    half4 blue = content.eval(refractedCoord - dispersedCoord * (2.0 / 3.0));
    color.b += blue.b / 3.0;
    color.a += blue.a / 7.0;

    half4 purple = content.eval(refractedCoord - dispersedCoord);
    color.r += purple.r / 7.0;
    color.b += purple.b / 3.0;
    color.a += purple.a / 7.0;

    return color;
}"""

// v0.60.8：InteractiveHighlight 面光源斑（逐字移植自
// catalog/utils/InteractiveHighlight.kt:44-54 内联 AGSL，Apache-2.0, Kyant0）。
// 与 DefaultHighlightShader（边缘 rim）无关，是独立的面光源。
private const val InteractiveHighlightShaderString = """
uniform float2 size;
layout(color) uniform half4 color;
uniform float radius;
uniform float2 position;

half4 main(float2 coord) {
    float dist = distance(coord, position);
    float intensity = smoothstep(radius, radius * 0.5, dist);
    return color * intensity;
}"""
