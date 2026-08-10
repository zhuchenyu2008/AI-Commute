package com.zhuchenyu.aicommute

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import androidx.core.content.ContextCompat
import kotlinx.coroutines.suspendCancellableCoroutine
import java.util.concurrent.Executor
import kotlin.coroutines.resume

object DeviceLocationProvider {
    suspend fun current(context: Context): Location? {
        val fine = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        if (!fine && !coarse) return null

        val manager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
            .filter { runCatching { manager.isProviderEnabled(it) }.getOrDefault(false) }

        val last = providers.mapNotNull { provider ->
            runCatching { manager.getLastKnownLocation(provider) }.getOrNull()
        }.maxByOrNull { it.time }

        if (last != null && System.currentTimeMillis() - last.time < 5 * 60_000) {
            return last
        }
        val provider = providers.firstOrNull() ?: return last

        return suspendCancellableCoroutine { continuation ->
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                val executor = Executor { command -> command.run() }
                val signal = android.os.CancellationSignal()
                manager.getCurrentLocation(provider, signal, executor) { location ->
                    if (continuation.isActive) continuation.resume(location ?: last)
                }
                continuation.invokeOnCancellation { signal.cancel() }
            } else {
                @Suppress("DEPRECATION")
                val listener = object : LocationListener {
                    override fun onLocationChanged(location: Location) {
                        manager.removeUpdates(this)
                        if (continuation.isActive) continuation.resume(location)
                    }
                }
                @Suppress("DEPRECATION")
                manager.requestSingleUpdate(provider, listener, null)
                continuation.invokeOnCancellation { manager.removeUpdates(listener) }
            }
        }
    }
}
