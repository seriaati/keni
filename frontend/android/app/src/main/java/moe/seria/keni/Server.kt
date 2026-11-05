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

    /** The hosted Keni, which the server screen offers first. */
    const val HOSTED = "https://app.keni.seria.moe"

    /** The server's origin (https://keni.example.com), or null before one was entered. */
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

    /** Whether Keni answers at [url]: its /api/health says so, without a login. Call it from a
     * background thread. */
    fun isKeni(url: String): Boolean = try {
        val connection = URL("$url/api/health").openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 8000
            connection.readTimeout = 8000
            val body = (if (connection.responseCode < 400) connection.inputStream else connection.errorStream)
                ?.use { String(it.readBytes()) }
            body != null && JSONObject(body).optString("app") == "keni"
        } finally {
            connection.disconnect()
        }
    } catch (error: IOException) {
        false
    } catch (error: JSONException) {
        false
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
