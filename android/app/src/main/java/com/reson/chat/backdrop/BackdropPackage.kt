package com.reson.chat.backdrop

import com.facebook.react.bridge.ReadableArray
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewGroupManager
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class BackdropSourceManager : ViewGroupManager<BackdropSourceView>() {
    override fun getName() = "BackdropSourceView"

    override fun createViewInstance(reactContext: ThemedReactContext): BackdropSourceView =
        BackdropSourceView(reactContext)

    @ReactProp(name = "sourceId")
    fun setSourceId(view: BackdropSourceView, value: String?) {
        view.setSourceId(value ?: "")
    }

    @ReactProp(name = "active", defaultBoolean = false)
    fun setActive(view: BackdropSourceView, value: Boolean) {
        view.setActive(value)
    }

    @ReactProp(name = "captureOnly", defaultBoolean = false)
    fun setCaptureOnly(view: BackdropSourceView, value: Boolean) {
        view.setCaptureOnly(value)
    }
}

class GlassEffectManager : ViewGroupManager<GlassEffectView>() {
    override fun getName() = "GlassEffectView"

    override fun createViewInstance(reactContext: ThemedReactContext): GlassEffectView =
        GlassEffectView(reactContext)

    @ReactProp(name = "sources")
    fun setSources(view: GlassEffectView, value: ReadableArray?) {
        val list = mutableListOf<String>()
        if (value != null) {
            for (i in 0 until value.size()) {
                val item = value.getString(i)
                if (item != null) list.add(item)
            }
        }
        view.setSources(list)
    }

    @ReactProp(name = "cornerRadius", defaultFloat = 0f)
    fun setCornerRadius(view: GlassEffectView, value: Float) = view.setCornerRadiusDp(value)

    @ReactProp(name = "blurRadius", defaultFloat = 0f)
    fun setBlurRadius(view: GlassEffectView, value: Float) = view.setBlurRadiusDp(value)

    @ReactProp(name = "lensHeight", defaultFloat = 0f)
    fun setLensHeight(view: GlassEffectView, value: Float) = view.setLensHeightDp(value)

    @ReactProp(name = "lensAmount", defaultFloat = 0f)
    fun setLensAmount(view: GlassEffectView, value: Float) = view.setLensAmountDp(value)

    @ReactProp(name = "chromatic", defaultBoolean = false)
    fun setChromatic(view: GlassEffectView, value: Boolean) = view.setChromatic(value)

    @ReactProp(name = "vibrancy", defaultBoolean = false)
    fun setVibrancy(view: GlassEffectView, value: Boolean) = view.setVibrancy(value)

    @ReactProp(name = "lensAlwaysOn", defaultBoolean = false)
    fun setLensAlwaysOn(view: GlassEffectView, value: Boolean) = view.setLensAlwaysOn(value)

    @ReactProp(name = "pressed", defaultBoolean = false)
    fun setPressed(view: GlassEffectView, value: Boolean) = view.setGlassPressed(value)

    @ReactProp(name = "surfaceColor")
    fun setSurfaceColor(view: GlassEffectView, value: String?) = view.setSurfaceColor(value)

    @ReactProp(name = "pressedSurfaceColor")
    fun setPressedSurfaceColor(view: GlassEffectView, value: String?) =
        view.setPressedSurfaceColor(value)

    @ReactProp(name = "highlight", defaultBoolean = false)
    fun setHighlight(view: GlassEffectView, value: Boolean) = view.setHighlight(value)

    @ReactProp(name = "shadow", defaultBoolean = false)
    fun setShadow(view: GlassEffectView, value: Boolean) = view.setShadow(value)

    @ReactProp(name = "innerShadow", defaultBoolean = false)
    fun setInnerShadow(view: GlassEffectView, value: Boolean) = view.setInnerShadow(value)

    // v0.60.8：官方 catalog/utils/InteractiveHighlight（LiquidBottomTabs）
    @ReactProp(name = "interactiveHighlight", defaultBoolean = false)
    fun setInteractiveHighlight(view: GlassEffectView, value: Boolean) =
        view.setInteractiveHighlight(value)

    @ReactProp(name = "highlightPressed", defaultBoolean = false)
    fun setHighlightPressed(view: GlassEffectView, value: Boolean) =
        view.setHighlightPressed(value)

    @ReactProp(name = "effectId")
    fun setEffectId(view: GlassEffectView, value: String?) = view.setEffectId(value)

    @ReactProp(name = "highlightAnchor")
    fun setHighlightAnchor(view: GlassEffectView, value: String?) = view.setHighlightAnchor(value)

    @ReactProp(name = "highlightAnchorInset", defaultFloat = 0f)
    fun setHighlightAnchorInset(view: GlassEffectView, value: Float) =
        view.setHighlightAnchorInsetDp(value)
}

class BackdropPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        emptyList()

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
        listOf(BackdropSourceManager(), GlassEffectManager())
}
