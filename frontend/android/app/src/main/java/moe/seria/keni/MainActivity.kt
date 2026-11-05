package moe.seria.keni

import android.content.Intent
import android.os.Bundle
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import com.getcapacitor.Bridge
import com.getcapacitor.BridgeActivity
import com.getcapacitor.BridgeWebViewClient
import com.getcapacitor.CapConfig
import org.json.JSONObject
import java.io.File

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(KeniPlugin::class.java)
        // Not again when Android recreates the activity, or reopens it from Recents.
        val fresh = savedInstanceState == null && (intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) == 0
        share(intent, fresh)
        // Nor a launcher shortcut (res/xml/shortcuts.xml), which load hands the web app.
        if (!fresh && intent.action == Intent.ACTION_VIEW) setIntent(Intent(this, MainActivity::class.java))
        super.onCreate(savedInstanceState)
        val bridge = bridge ?: return // no server yet (load)
        bridge.webViewClient = Client(bridge)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        share(intent)
    }

    // Something shared to Keni from another app: KeniPlugin holds it for the web app, also through
    // the server screen. The activity's intent is then a plain one, as Capacitor's load hands it to
    // onNewIntent again, and a recreated activity would share it again.
    private fun share(intent: Intent, fresh: Boolean = true) {
        if (intent.action != Intent.ACTION_SEND && intent.action != Intent.ACTION_SEND_MULTIPLE) return
        if (fresh) KeniPlugin.receive(this, intent)
        setIntent(Intent(this, MainActivity::class.java))
    }

    // The server comes from ServerActivity, not the bundled config: Capacitor's config is the
    // bundled one (capacitor.config.ts) with that server as server.url. The bridge takes the page
    // to load, the origin its JavaScript is injected into and the hosts the WebView may show from
    // it. Without a server yet, ServerActivity asks for one.
    override fun load() {
        val server = Server.url(this) ?: return askServer(unreachable = false)
        val json = JSONObject(assets.open("capacitor.config.json").bufferedReader().use { it.readText() })
        json.put("server", (json.optJSONObject("server") ?: JSONObject()).put("url", server))
        // CapConfig reads from assets or a file only.
        val dir = File(noBackupFilesDir, "capacitor").apply { mkdirs() }
        File(dir, "capacitor.config.json").writeText(json.toString())
        config = CapConfig.loadFromFile(this, dir.path)
        super.load()
    }

    private fun askServer(unreachable: Boolean) {
        startActivity(Intent(this, ServerActivity::class.java).putExtra(ServerActivity.UNREACHABLE, unreachable))
        finish()
    }

    // When the page itself can't load (no network, the server down), ServerActivity shows, with
    // Retry and Change server, instead of the WebView's error page. A page the service worker
    // serves from its cache has loaded: the web app then works offline as in a browser.
    private inner class Client(bridge: Bridge) : BridgeWebViewClient(bridge) {
        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            super.onReceivedError(view, request, error)
            // ERROR_UNKNOWN is also a load that was cancelled (a link opened in the browser instead).
            if (request.isForMainFrame && error.errorCode != WebViewClient.ERROR_UNKNOWN) unreachable()
        }

        // A proxy's "502 Bad Gateway" while Keni restarts, say.
        override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
            super.onReceivedHttpError(view, request, response)
            if (request.isForMainFrame && response.statusCode >= 500) unreachable()
        }

        private fun unreachable() {
            if (!isFinishing) askServer(unreachable = true)
        }
    }
}
