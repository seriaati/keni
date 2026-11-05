package moe.seria.keni

import android.content.Intent
import android.content.res.Configuration
import android.os.Bundle
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import kotlin.concurrent.thread

// The Keni server the app shows: asked for at the first start and after Change server in the web
// app, and kept once Keni answers there. Also what shows when the server can't be reached
// (MainActivity), with Retry and Change server, instead of the WebView's error page.
class ServerActivity : AppCompatActivity() {
    companion object {
        const val UNREACHABLE = "moe.seria.keni.unreachable"
    }

    private lateinit var title: TextView
    private lateinit var text: TextView
    private lateinit var address: EditText
    private lateinit var status: TextView
    private lateinit var go: Button
    private lateinit var change: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.server)
        // Dark icons on light cream (the bars are see-through from Android 15).
        val light = resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK != Configuration.UI_MODE_NIGHT_YES
        WindowCompat.getInsetsController(window, window.decorView).run {
            isAppearanceLightStatusBars = light
            isAppearanceLightNavigationBars = light
        }
        title = findViewById(R.id.title)
        text = findViewById(R.id.text)
        address = findViewById(R.id.address)
        status = findViewById(R.id.status)
        go = findViewById(R.id.go)
        change = findViewById(R.id.change)
        address.setOnEditorActionListener { _, action, _ -> (action == EditorInfo.IME_ACTION_GO).also { if (it) connect() } }
        val server = Server.url(this)
        if (server != null && intent.getBooleanExtra(UNREACHABLE, false)) unreachable(server) else ask()
    }

    // Offers the hosted Keni until another server was kept.
    private fun ask() {
        title.setText(R.string.server_title)
        text.setText(R.string.server_text)
        address.visibility = View.VISIBLE
        address.setText((Server.url(this) ?: Server.HOSTED).removePrefix("https://"))
        address.setSelection(address.length())
        address.requestFocus()
        change.visibility = View.GONE
        status.visibility = View.GONE
        go.setText(R.string.server_continue)
        go.setOnClickListener { connect() }
    }

    private fun unreachable(server: String) {
        title.setText(R.string.server_unreachable)
        text.text = getString(R.string.server_unreachable_text, server.removePrefix("https://"))
        address.visibility = View.GONE
        change.visibility = View.VISIBLE
        change.setOnClickListener { ask() }
        go.setText(R.string.server_retry)
        go.setOnClickListener { check(server, getString(R.string.server_still_unreachable, server.removePrefix("https://"))) }
    }

    private fun connect() {
        if (!go.isEnabled) return
        val server = Server.normalize(address.text.toString())
        when {
            server == null -> say(getString(R.string.server_not_address))
            server.startsWith("http://") -> say(getString(R.string.server_https))
            else -> check(server, getString(R.string.server_not_keni, server.removePrefix("https://")))
        }
    }

    /** Opens [server] once Keni answers there; else says [failed]. */
    private fun check(server: String, failed: String) {
        busy(true)
        say(getString(R.string.server_checking))
        thread {
            val keni = Server.isKeni(server)
            runOnUiThread {
                if (isDestroyed) return@runOnUiThread
                if (keni) return@runOnUiThread open(server)
                busy(false)
                say(failed)
            }
        }
    }

    // Another server than the one kept: what belonged to that one goes first (Server.leave).
    private fun open(server: String) {
        val start = {
            Server.remember(this, server)
            startActivity(Intent(this, MainActivity::class.java))
            finish()
        }
        val current = Server.url(this)
        if (current == null || current == server) start() else Server.leave(this, start)
    }

    private fun say(message: String) {
        status.text = message
        status.visibility = View.VISIBLE
    }

    private fun busy(busy: Boolean) {
        go.isEnabled = !busy
        go.alpha = if (busy) 0.5f else 1f
        change.isEnabled = !busy
        address.isEnabled = !busy
    }
}
