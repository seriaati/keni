package moe.seria.keni

import android.content.ContentValues
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.util.Base64
import android.util.Log
import android.widget.Toast
import androidx.core.content.IntentCompat
import androidx.core.view.WindowCompat
import com.getcapacitor.BridgeActivity
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.io.InputStream
import kotlin.concurrent.thread

// The app's own bridge to the web app (src/lib/native.ts).
@CapacitorPlugin(name = "Keni")
class KeniPlugin : Plugin() {
    companion object {
        // Per file. The backend has no limit of its own, and the web app shrinks images before
        // sending them; this keeps huge files from crossing the bridge as base64.
        private const val MAX_MB = 20
        private const val MAX_BYTES = MAX_MB shl 20
        private const val TAG = "KeniShare"

        // What was last shared to Keni, until the web app takes it (takeShare). Static, so it
        // waits through the server screen and the login, while the app's process lives.
        private var pending: JSObject? = null

        /** Holds what [intent] (ACTION_SEND or ACTION_SEND_MULTIPLE) shares, read off the main
         * thread, then tells the page in [activity] to take it (the `share` event). */
        fun receive(activity: BridgeActivity, intent: Intent) {
            val context = activity.applicationContext
            val title = intent.getStringExtra(Intent.EXTRA_SUBJECT)
            val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()
            val uris = if (intent.action == Intent.ACTION_SEND_MULTIPLE) {
                IntentCompat.getParcelableArrayListExtra(intent, Intent.EXTRA_STREAM, Uri::class.java).orEmpty()
            } else {
                listOfNotNull(IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java))
            }
            thread {
                val files = JSArray()
                var tooLarge = false
                for (uri in uris) {
                    try {
                        val type = context.contentResolver.getType(uri) ?: intent.type ?: continue
                        if (!type.startsWith("image/") && type != "application/pdf") continue
                        val bytes = read(context.contentResolver.openInputStream(uri) ?: continue)
                        if (bytes == null) {
                            tooLarge = true
                            continue
                        }
                        val name = context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
                            ?.use { if (it.moveToFirst()) it.getString(0) else null }
                        files.put(JSObject().put("name", name ?: uri.lastPathSegment ?: "shared").put("type", type)
                            .put("data", Base64.encodeToString(bytes, Base64.NO_WRAP)))
                    } catch (error: IOException) {
                        Log.w(TAG, "Can't read $uri", error)
                    } catch (error: SecurityException) {
                        Log.w(TAG, "Can't read $uri", error)
                    }
                }
                activity.runOnUiThread {
                    if (tooLarge) Toast.makeText(context, context.getString(R.string.share_too_large, MAX_MB), Toast.LENGTH_LONG).show()
                    if (title == null && text == null && files.length() == 0) return@runOnUiThread
                    synchronized(KeniPlugin) {
                        pending = JSObject().put("files", files).apply {
                            if (title != null) put("title", title)
                            if (text != null) put("text", text)
                        }
                    }
                    if (!activity.isDestroyed) (activity.bridge?.getPlugin("Keni")?.instance as? KeniPlugin)?.shared()
                }
            }
        }

        // The stream's bytes, or null when they're over MAX_BYTES.
        private fun read(input: InputStream): ByteArray? = input.use {
            val out = ByteArrayOutputStream()
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            while (out.size() <= MAX_BYTES) {
                val n = it.read(buffer)
                if (n < 0) return out.toByteArray()
                out.write(buffer, 0, n)
            }
            null
        }
    }

    private var bars: Pair<Int, Boolean>? = null

    private fun shared() = notifyListeners("share", null)

    /** What was shared to Keni ({ title?, text?, files: [{ name, type, data (base64) }] }), once;
     * nothing when there's none. */
    @PluginMethod
    fun takeShare(call: PluginCall) {
        val share = synchronized(KeniPlugin) { pending.also { pending = null } }
        if (share != null) call.resolve(share) else call.resolve()
    }

    /** Saves { name, type, data (base64) } to Downloads (an export). Before Android 10, to the
     * app's own Downloads folder (Android/data/moe.seria.keni/files/Download): no permission. */
    @PluginMethod
    fun saveFile(call: PluginCall) {
        val name = call.getString("name") ?: return call.reject("No file name")
        val bytes = try {
            Base64.decode(call.getString("data").orEmpty(), Base64.DEFAULT)
        } catch (error: IllegalArgumentException) {
            return call.reject("Not base64: $name")
        }
        // "text/csv; charset=utf-8" is no MediaStore type.
        val type = call.getString("type")?.substringBefore(';')?.trim().orEmpty().ifEmpty { "application/octet-stream" }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val resolver = context.contentResolver
                val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, name)
                    put(MediaStore.Downloads.MIME_TYPE, type)
                    put(MediaStore.Downloads.IS_PENDING, 1)
                }) ?: throw IOException("MediaStore refused $name")
                try {
                    (resolver.openOutputStream(uri) ?: throw IOException("Can't open $uri")).use { it.write(bytes) }
                } catch (error: IOException) {
                    resolver.delete(uri, null, null)
                    throw error
                }
                resolver.update(uri, ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }, null, null)
            } else {
                val dir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: throw IOException("No external storage")
                File(dir, name).writeBytes(bytes)
            }
            call.resolve()
        } catch (error: IOException) {
            call.reject("Can't save $name: ${error.message}", error)
        }
    }

    /** Leaves this Keni server for the screen that asks for one (ServerActivity): its login goes. */
    @PluginMethod
    fun changeServer(call: PluginCall) {
        val activity = activity
        Server.leave(activity) {
            call.resolve()
            activity.startActivity(Intent(activity, ServerActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK))
        }
    }

    /** The status and navigation bars take the page's color, with icons for a light or dark page. */
    @PluginMethod
    fun setSystemBars(call: PluginCall) {
        val color = try {
            Color.parseColor(call.getString("color"))
        } catch (error: IllegalArgumentException) {
            return call.reject("Not a color: ${call.getString("color")}")
        }
        bars = color to (call.getBoolean("dark") ?: false)
        activity.runOnUiThread {
            applyBars()
            call.resolve()
        }
    }

    // Capacitor's SystemBars resets them to the system theme when the configuration changes
    // (rotation, dark mode): put the page's back after it.
    override fun handleOnConfigurationChanged(newConfig: Configuration) {
        super.handleOnConfigurationChanged(newConfig)
        activity.window.decorView.post { applyBars() }
    }

    // SystemBars keeps the WebView between the bars (the page has no viewport-fit=cover), so what
    // shows behind them is the window's own background.
    private fun applyBars() {
        val (color, dark) = bars ?: return
        val window = activity.window
        window.decorView.setBackgroundColor(color)
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = !dark
            isAppearanceLightNavigationBars = !dark
        }
    }
}
