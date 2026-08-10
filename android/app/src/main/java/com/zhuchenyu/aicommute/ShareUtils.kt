package com.zhuchenyu.aicommute

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import androidx.core.content.FileProvider
import com.google.zxing.BarcodeFormat
import com.google.zxing.MultiFormatWriter
import java.io.File

object ShareUtils {
    fun shareTrip(context: Context, detail: TripDetail) {
        val trip = detail.trip
        val segments = detail.segments
        val width = 1080
        val height = 1500
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.rgb(247, 248, 250))

        val titlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.rgb(25, 28, 30)
            textSize = 58f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
        }
        val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.rgb(37, 99, 235)
            textSize = 30f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
        }
        val bodyPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.rgb(67, 70, 85)
            textSize = 34f
        }

        canvas.drawText("AI Commute", 72f, 105f, labelPaint)
        drawWrapped(canvas, trip.title, 72f, 190f, width - 144f, titlePaint, 72f)
        var y = 340f
        canvas.drawText("最晚出发  ${formatTime(trip.departureEpochMillis)}", 72f, y, bodyPaint)
        y += 60f
        canvas.drawText("预计到达  ${formatTime(trip.arrivalEpochMillis)}", 72f, y, bodyPaint)
        y += 70f

        segments.take(6).forEachIndexed { index, segment ->
            val line = "${index + 1}. ${modeLabel(segment.mode)} · ${segment.fromName} → ${segment.toName} · ${segment.durationMinutes} 分钟"
            y = drawWrapped(canvas, line, 72f, y, width - 144f, bodyPaint, 50f) + 20f
        }

        val qrText = buildString {
            append("AI Commute\n")
            append(trip.title).append('\n')
            append("出发：").append(formatTime(trip.departureEpochMillis)).append('\n')
            append("到达：").append(formatTime(trip.arrivalEpochMillis)).append('\n')
            append("目的地：").append(trip.destination)
        }
        val qr = qrBitmap(qrText, 330)
        canvas.drawBitmap(qr, 72f, height - 410f, null)
        bodyPaint.textSize = 28f
        canvas.drawText("扫码查看行程摘要", 435f, height - 240f, bodyPaint)
        canvas.drawText("由 AI Commute Android 生成", 435f, height - 190f, bodyPaint)

        val dir = File(context.cacheDir, "share").apply { mkdirs() }
        val file = File(dir, "ai-commute-${trip.id}.png")
        file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 95, it) }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)

        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "image/png"
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_TEXT, qrText)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(intent, "分享行程"))
    }

    private fun qrBitmap(text: String, size: Int): Bitmap {
        val matrix = MultiFormatWriter().encode(text, BarcodeFormat.QR_CODE, size, size)
        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        for (x in 0 until size) {
            for (y in 0 until size) {
                bitmap.setPixel(x, y, if (matrix[x, y]) Color.BLACK else Color.WHITE)
            }
        }
        return bitmap
    }

    private fun drawWrapped(
        canvas: Canvas,
        text: String,
        x: Float,
        y: Float,
        maxWidth: Float,
        paint: Paint,
        lineHeight: Float,
    ): Float {
        var current = ""
        var yy = y
        text.forEach { char ->
            val candidate = current + char
            if (paint.measureText(candidate) > maxWidth && current.isNotEmpty()) {
                canvas.drawText(current, x, yy, paint)
                current = char.toString()
                yy += lineHeight
            } else {
                current = candidate
            }
        }
        if (current.isNotEmpty()) canvas.drawText(current, x, yy, paint)
        return yy + lineHeight
    }
}

fun modeLabel(mode: String): String = when (mode.lowercase()) {
    "walking", "walk" -> "步行"
    "driving", "car" -> "驾车"
    "taxi" -> "打车"
    "bicycling", "bicycle", "bike", "cycling" -> "骑行"
    else -> "公共交通"
}
