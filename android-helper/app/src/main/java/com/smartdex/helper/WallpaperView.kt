package com.smartdex.helper

import android.content.Context
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Shader
import android.util.AttributeSet
import android.view.View

/**
 * Code-drawn wallpaper: diagonal dark gradient with a faint dot grid.
 * Zero assets, resolution independent.
 */
class WallpaperView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : View(context, attrs) {

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val dotPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0x14FFFFFF
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val w = width.toFloat()
        val h = height.toFloat()
        if (w == 0f || h == 0f) return

        paint.shader = LinearGradient(
            0f, 0f, w, h,
            context.getColor(R.color.wallpaper_top),
            context.getColor(R.color.wallpaper_bottom),
            Shader.TileMode.CLAMP,
        )
        canvas.drawRect(0f, 0f, w, h, paint)

        // Subtle dot grid for texture.
        val step = (64 * resources.displayMetrics.density)
        val radius = (2 * resources.displayMetrics.density)
        var y = step / 2
        while (y < h) {
            var x = step / 2
            while (x < w) {
                canvas.drawCircle(x, y, radius, dotPaint)
                x += step
            }
            y += step
        }
    }
}
