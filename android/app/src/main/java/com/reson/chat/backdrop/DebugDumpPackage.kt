package com.reson.chat.backdrop

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager
import java.io.File

/**
 * v0.60.1-debug 专用：把帧级动画数据写入外部私有目录，
 * 便于 adb pull 取回（release 包无法用 run-as 读取内部存储）。
 * 仅做文件写入，不参与任何动画物理。
 */
class DebugDumpModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "DebugDump"

    private fun fileFor(name: String): File {
        val dir = reactApplicationContext.getExternalFilesDir(null) ?: reactApplicationContext.filesDir
        if (!dir.exists()) dir.mkdirs()
        return File(dir, name)
    }

    /** 覆盖写入（会话开始重置） */
    @ReactMethod
    fun reset(name: String) {
        try {
            fileFor(name).writeText("")
        } catch (_: Throwable) {
        }
    }

    /** 追加写入 */
    @ReactMethod
    fun append(name: String, content: String) {
        try {
            fileFor(name).appendText(content)
        } catch (_: Throwable) {
        }
    }

    /** 返回可被 adb pull 的绝对路径 */
    @ReactMethod(isBlockingSynchronousMethod = true)
    fun path(name: String): String = fileFor(name).absolutePath
}

class DebugDumpPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(DebugDumpModule(reactContext))

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}