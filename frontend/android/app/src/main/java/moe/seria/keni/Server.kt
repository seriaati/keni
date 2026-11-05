package moe.seria.keni

import android.app.Activity
import android.content.Context
import android.net.Uri
import android.webkit.CookieManager
import android.webkit.WebStorage
import android.webkit.WebView
import org.json.JSONException
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

// The Keni server the app loads, as entered on ServerActivity and kept in SharedPreferences.
object Server {
    private const val PREFS = "keni"
    private const val SERVER = "server"

    /** The hosted Keni's API, which the server screen offers first. */
    const val HOSTED = "https://keni-api.seria.moe"

    /** The web app's origin the app loads (https://keni.example.com), or null before one was found. */
    fun url(context: Context): String? = prefs(context).getString(SERVER, null)

    fun remember(context: Context, url: String) = prefs(context).edit().putString(SERVER, url).apply()

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** An address as typed ("keni.example.com", "https://keni.example.com/insights/") as an
     * origin, https:// when it has no scheme; null when it isn't a web address. */
    fun normalize(typed: String): String? {
        val text = typed.trim().let { if ("://" in it) it else "https://$it" }
        val uri = Uri.parse(text)
        val scheme = uri.scheme?.lowercase()
        val authority = uri.encodedAuthority?.substringAfterLast('@')?.lowercase()
        if (scheme !in listOf("https", "http") || uri.host.isNullOrEmpty() || authority.isNullOrEmpty()) return null
        return "$scheme://$authority"
    }

    /** The Keni web app to load for an address as entered, or null when there's none. The address
     * may serve the web app itself (Docker: one host for both, or the web app's own host), or only
     * the API, whose /api/health then names the web app (`web`), as the hosted Keni's does. Call
     * it from a background thread. */
    fun find(url: String): String? {
        if (isWebApp(url)) return url
        val web = json("$url/api/health")?.takeIf { it.optString("app") == "keni" }?.optString("web") ?: return null
        return normalize(web)?.takeIf { it.startsWith("https://") && isWebApp(it) }
    }

    // The web app's manifest names it (vite.config.ts).
    private fun isWebApp(url: String) = json("$url/manifest.webmanifest")?.optString("name") == "Keni"

    private fun json(url: String): JSONObject? = try {
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 8000
            connection.readTimeout = 8000
            if (connection.responseCode == 200) JSONObject(connection.inputStream.use { String(it.readBytes()) }) else null
        } finally {
            connection.disconnect()
        }
    } catch (error: IOException) {
        null
    } catch (error: JSONException) {
        null
    }

    /** Leaves this server, for another or to ask again: the WebView's cookies and storage (the
     * login's tokens are in local storage) go, and the stored address too. [done] runs on the
     * main thread. */
    fun leave(activity: Activity, done: () -> Unit) {
        prefs(activity).edit().remove(SERVER).apply()
        activity.runOnUiThread {
            CookieManager.getInstance().removeAllCookies(null)
            CookieManager.getInstance().flush()
            WebStorage.getInstance().deleteAllData() // the page's storage: local storage, IndexedDB, caches
            WebView(activity).run {
                clearCache(true) // the HTTP cache, shared by all of the app's WebViews
                destroy()
            }
            done()
        }
    }
}
