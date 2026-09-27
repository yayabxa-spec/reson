package com.reson.chat.backdrop

import android.content.Context
import android.graphics.Canvas
import android.graphics.RenderNode
import android.os.Build
import android.view.ViewGroup

/**
 * 背景源注册表（对应 Kyant0/Backdrop 的 LayerBackdrop + CombinedBackdrop）：
 * - BackdropSourceView 以 sourceId 注册自己的 RenderNode（声明式离屏图层）
 * - GlassEffectView 按多个 sourceId 取节点合成折射（等价 rememberCombinedBackdrop）
 * - captureOnly（隐藏层）：内容只录制不上屏，等价 alpha(0f)+layerBackdrop
 */
object BackdropRegistry {
    private val sources = LinkedHashMap<String, BackdropSourceView>()
    private val effects = mutableSetOf<GlassEffectView>()

    // v0.60.8：InteractiveHighlight 的位置锚点（官方 position lambda 的 value/panelOffset
    // 在 native 侧经 view 属性读取：anchor.parent.translationX = cx − lensW/2，
    // anchor.parent.parent.translationX = 面板根 panelStyle 平移）
    private val anchors = LinkedHashMap<String, GlassEffectView>()

    @Synchronized
    fun putSource(id: String, view: BackdropSourceView) {
        if (id.isEmpty()) return
        sources[id] = view
        notifyEffects()
    }

    @Synchronized
    fun removeSource(id: String, view: BackdropSourceView) {
        if (sources[id] === view) sources.remove(id)
        notifyEffects()
    }

    @Synchronized
    fun getSource(id: String): BackdropSourceView? = sources[id]

    @Synchronized
    fun putAnchor(id: String, view: GlassEffectView) {
        if (id.isEmpty()) return
        anchors[id] = view
    }

    @Synchronized
    fun removeAnchor(id: String, view: GlassEffectView) {
        if (anchors[id] === view) anchors.remove(id)
    }

    @Synchronized
    fun getAnchor(id: String): GlassEffectView? = anchors[id]

    @Synchronized
    fun registerEffect(view: GlassEffectView) { effects.add(view) }

    @Synchronized
    fun unregisterEffect(view: GlassEffectView) { effects.remove(view) }

    @Synchronized
    fun notifyEffects() {
        // v0.60.7：改为按各效果视图自己的采样快照门控（见 GlassEffectView.notifySourcesChanged）
        effects.toList().forEach { it.notifySourcesChanged() }
    }
}

/**
 * 背景源视图：宿主 RN 子视图，每帧把子内容录制进 RenderNode（声明式离屏层）。
 * - captureOnly=false：录制后把节点画到屏幕（正常显示）
 * - captureOnly=true ：只录制不上屏（等价源码 alpha(0f)+layerBackdrop 的隐藏层）
 */
class BackdropSourceView(context: Context) : ViewGroup(context) {
    var sourceId: String = ""
        private set
    var active: Boolean = false
        private set
    var captureOnly: Boolean = false
        private set

    /**
     * v0.60.7：内容版本号，每次重录 RenderNode 递增。
     * GlassEffectView 据此判断被采样源是否真的变化（notifySourcesChanged 门控），
     * 防止「源内嵌玻璃效果视图」（tabsBackdrop 层）形成
     * 源重录 → 通知 → 效果重绘 → 源再重录 的持续重绘循环。
     */
    var contentVersion: Long = 0L
        private set

    private var renderNode: RenderNode? = null
    private var attached = false

    fun setSourceId(v: String) {
        sourceId = v ?: ""
        syncRegistration()
    }

    fun setActive(v: Boolean) {
        active = v
        syncRegistration()
    }

    fun setCaptureOnly(v: Boolean) {
        captureOnly = v
        invalidate()
    }

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        // Yoga 在 mount 阶段已直接 layout 各子视图；这里按当前 frame 复位即可
        for (i in 0 until childCount) {
            val child = getChildAt(i)
            child.layout(child.left, child.top, child.right, child.bottom)
        }
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        attached = true
        syncRegistration()
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        attached = false
        BackdropRegistry.removeSource(sourceId, this)
    }

    private fun syncRegistration() {
        val registered = attached && active && sourceId.isNotEmpty()
        if (registered) {
            BackdropRegistry.putSource(sourceId, this)
        } else {
            BackdropRegistry.removeSource(sourceId, this)
        }
        android.util.Log.d(
            "BackdropSource",
            "id=$sourceId attached=$attached active=$active registered=$registered w=$width h=$height"
        )
    }

    fun obtainNode(): RenderNode? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return null
        if (width == 0 || height == 0) return null
        return renderNode
    }

    override fun dispatchDraw(canvas: Canvas) {
        // 录制子内容进 RenderNode 作为离屏源（源码 graphicsLayer record 语义）；
        // 内容上屏始终走常规绘制路径，不依赖 drawRenderNode
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && canvas.isHardwareAccelerated()) {
            val node = renderNode ?: RenderNode("backdrop-source").also { renderNode = it }
            // 关键：手动创建的 RenderNode 必须显式 setPosition，否则裁剪区为空、
            // drawRenderNode 不产生任何输出（表现为玻璃内永远空白）
            node.setPosition(0, 0, width, height)
            node.setClipToBounds(false)
            val rc = node.beginRecording(width, height)
            try {
                // View.background 不走 dispatchDraw，须显式录进离屏源，
                // 否则折射层只有前景像素（背景透明遮不住下层内容）
                background?.draw(rc)
                super.dispatchDraw(rc)
            } finally {
                node.endRecording()
                contentVersion++
            }
        }
        // captureOnly（隐藏强调色副本层）只录制不上屏，等价源码 alpha(0f)+layerBackdrop
        if (!captureOnly) {
            super.dispatchDraw(canvas)
        }
        // 内容更新后通知消费方（镜片）重绘——实时折射的关键
        // （v0.60.7：消费方按采样源版本门控，见 GlassEffectView.notifySourcesChanged）
        BackdropRegistry.notifyEffects()
    }
}
