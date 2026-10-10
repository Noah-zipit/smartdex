package com.smartdex.helper

import android.app.Activity
import android.app.ActivityOptions
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ResolveInfo
import android.graphics.Point
import android.graphics.Rect
import android.graphics.drawable.Drawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.TextWatcher
import android.util.Log
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * SmartDex desktop surface: a fullscreen activity the Windows app launches onto
 * the scrcpy virtual display. Shows a wallpaper, clock, searchable app grid;
 * tapping an app opens it as a centered freeform window on the same display.
 *
 * Not a launcher replacement — just this one activity, launched explicitly via:
 *   adb shell am start --display <id> -n com.smartdex.helper/.DeskActivity
 */
class DeskActivity : Activity() {

    companion object {
        private const val TAG = "SmartDex"
        // android.app.WindowConfiguration.WINDOWING_MODE_FREEFORM (the whole
        // WindowConfiguration class is @hide, so the value is inlined here).
        private const val WINDOWING_MODE_FREEFORM = 5
        private const val WINDOW_SCALE = 0.75f // launched windows cover ~75% of the display
        private const val GRID_COLUMNS = 5
    }

    private lateinit var adapter: AppAdapter
    private lateinit var clockView: TextView
    private lateinit var dateView: TextView
    private val clockHandler = Handler(Looper.getMainLooper())

    private val clockTick = object : Runnable {
        override fun run() {
            updateClock()
            clockHandler.postDelayed(this, 15_000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        hideSystemBars()
        setContentView(R.layout.activity_desk)

        clockView = findViewById(R.id.clock)
        dateView = findViewById(R.id.date)
        updateClock()
        clockHandler.postDelayed(clockTick, 15_000)

        val grid = findViewById<RecyclerView>(R.id.app_grid)
        grid.layoutManager = GridLayoutManager(this, GRID_COLUMNS)
        adapter = AppAdapter { entry -> launchApp(entry) }
        grid.adapter = adapter

        findViewById<EditText>(R.id.search).addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                adapter.filter(s?.toString().orEmpty())
            }
            override fun afterTextChanged(s: Editable?) {}
        })

        loadApps()
    }

    override fun onDestroy() {
        clockHandler.removeCallbacks(clockTick)
        super.onDestroy()
    }

    private fun hideSystemBars() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.let {
                it.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                it.systemBarsBehavior =
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility =
                (View.SYSTEM_UI_FLAG_FULLSCREEN
                        or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY)
        }
    }

    private fun updateClock() {
        val now = Date()
        clockView.text = SimpleDateFormat("HH:mm", Locale.getDefault()).format(now)
        dateView.text = SimpleDateFormat("EEE, d MMM yyyy", Locale.getDefault()).format(now)
    }

    /** Taskbar-proven enumeration: all launchable apps, sorted alphabetically. */
    private fun loadApps() {
        val pm: PackageManager = packageManager
        val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val resolved: List<ResolveInfo> =
            pm.queryIntentActivities(launcher, 0)
                .filter { it.activityInfo.packageName != packageName } // exclude ourselves

        val entries = resolved.map { info ->
            val label = info.loadLabel(pm).toString()
            AppEntry(
                label = label.ifBlank { info.activityInfo.packageName },
                packageName = info.activityInfo.packageName,
                icon = info.loadIcon(pm),
            )
        }.sortedBy { it.label.lowercase(Locale.getDefault()) }

        adapter.setApps(entries)
        Log.i(TAG, "Loaded ${entries.size} apps")
    }

    /** Opens the app as a centered freeform window on this activity's display. */
    private fun launchApp(entry: AppEntry) {
        val launchIntent = packageManager.getLaunchIntentForPackage(entry.packageName)
        if (launchIntent == null) {
            Log.w(TAG, "No launch intent for ${entry.packageName}")
            Toast.makeText(this, "Cannot open ${entry.label}", Toast.LENGTH_SHORT).show()
            return
        }
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

        val displayId = currentDisplayId()
        val bounds = centeredWindowRect()
        val opts = ActivityOptions.makeBasic()
        // setLaunchWindowingMode(int) is @hide (absent from the SDK stubs), so it
        // is invoked via reflection. It needs no special permission at runtime on
        // API 28+. If reflection is blocked, the launch still targets the right
        // display with centered bounds; the Windows app has an adb fallback
        // (am start --display <id> --windowingMode 5).
        try {
            val m = ActivityOptions::class.java.getMethod(
                "setLaunchWindowingMode", Int::class.javaPrimitiveType)
            m.invoke(opts, WINDOWING_MODE_FREEFORM)
        } catch (e: Exception) {
            Log.w(TAG, "setLaunchWindowingMode not reachable via reflection", e)
        }
        opts.setLaunchDisplayId(displayId)
        opts.setLaunchBounds(bounds)
        try {
            startActivity(launchIntent, opts.toBundle())
            Log.i(TAG, "Launched ${entry.packageName} on display $displayId bounds $bounds")
        } catch (e: Exception) {
            Log.w(TAG, "Launch failed for ${entry.packageName}; adb fallback available", e)
            Toast.makeText(this, "Could not open ${entry.label}", Toast.LENGTH_SHORT).show()
        }
    }

    private fun currentDisplayId(): Int {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            display?.displayId ?: 0
        } else {
            @Suppress("DEPRECATION")
            windowManager.defaultDisplay.displayId
        }
    }

    /** Rect centered on the current display at ~75% of its size. */
    private fun centeredWindowRect(): Rect {
        val width: Int
        val height: Int
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val bounds = windowManager.currentWindowMetrics.bounds
            width = bounds.width()
            height = bounds.height()
        } else {
            @Suppress("DEPRECATION")
            val size = Point().also { windowManager.defaultDisplay.getSize(it) }
            width = size.x
            height = size.y
        }
        val w = (width * WINDOW_SCALE).toInt()
        val h = (height * WINDOW_SCALE).toInt()
        val left = (width - w) / 2
        val top = (height - h) / 2
        return Rect(left, top, left + w, top + h)
    }
}

data class AppEntry(
    val label: String,
    val packageName: String,
    val icon: Drawable,
)
