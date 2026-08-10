package com.zhuchenyu.aicommute

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import kotlinx.coroutines.flow.Flow
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

@Entity(tableName = "trips")
data class TripEntity(
    @PrimaryKey val id: String,
    val title: String,
    val requestText: String,
    val destination: String,
    val arrivalEpochMillis: Long,
    val departureEpochMillis: Long,
    val status: String,
    val routeDurationMinutes: Int,
    val bufferMinutes: Int,
    val weatherSummary: String,
    val reasoning: String,
    val createdAt: Long,
    val updatedAt: Long,
    val monitorEnabled: Boolean,
    val routeChangeThresholdMinutes: Int,
    val originName: String,
    val originLng: Double?,
    val originLat: Double?,
    val destinationLng: Double?,
    val destinationLat: Double?,
)

@Entity(
    tableName = "segments",
    foreignKeys = [
        ForeignKey(
            entity = TripEntity::class,
            parentColumns = ["id"],
            childColumns = ["tripId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [Index("tripId")]
)
data class SegmentEntity(
    @PrimaryKey val id: String,
    val tripId: String,
    val sequence: Int,
    val mode: String,
    val fromName: String,
    val toName: String,
    val durationMinutes: Int,
    val distanceMeters: Int,
    val instruction: String,
    val originLng: Double?,
    val originLat: Double?,
    val destinationLng: Double?,
    val destinationLat: Double?,
)

@Entity(tableName = "memories")
data class MemoryEntity(
    @PrimaryKey val id: String,
    val content: String,
    val source: String,
    val status: String,
    val createdAt: Long,
)

@Dao
interface TripDao {
    @Query("SELECT * FROM trips ORDER BY createdAt DESC")
    fun observeAll(): Flow<List<TripEntity>>

    @Query("SELECT * FROM trips WHERE id = :id LIMIT 1")
    suspend fun getById(id: String): TripEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(trip: TripEntity)

    @Query("UPDATE trips SET status = :status, monitorEnabled = :monitor, updatedAt = :updatedAt WHERE id = :id")
    suspend fun setStatus(id: String, status: String, monitor: Boolean, updatedAt: Long)

    @Query("UPDATE trips SET routeDurationMinutes = :minutes, departureEpochMillis = :departure, updatedAt = :updatedAt WHERE id = :id")
    suspend fun updateTiming(id: String, minutes: Int, departure: Long, updatedAt: Long)
}

@Dao
interface SegmentDao {
    @Query("SELECT * FROM segments WHERE tripId = :tripId ORDER BY sequence ASC")
    suspend fun getForTrip(tripId: String): List<SegmentEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(segments: List<SegmentEntity>)

    @Query("DELETE FROM segments WHERE tripId = :tripId")
    suspend fun deleteForTrip(tripId: String)
}

@Dao
interface MemoryDao {
    @Query("SELECT * FROM memories ORDER BY createdAt DESC")
    fun observeAll(): Flow<List<MemoryEntity>>

    @Query("SELECT * FROM memories WHERE status = 'accepted' ORDER BY createdAt DESC")
    suspend fun accepted(): List<MemoryEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(memory: MemoryEntity)

    @Query("UPDATE memories SET status = :status WHERE id = :id")
    suspend fun setStatus(id: String, status: String)

    @Query("DELETE FROM memories WHERE id = :id")
    suspend fun delete(id: String)
}

@Database(
    entities = [TripEntity::class, SegmentEntity::class, MemoryEntity::class],
    version = 1,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun trips(): TripDao
    abstract fun segments(): SegmentDao
    abstract fun memories(): MemoryDao

    companion object {
        @Volatile private var INSTANCE: AppDatabase? = null

        fun get(context: Context): AppDatabase = INSTANCE ?: synchronized(this) {
            INSTANCE ?: Room.databaseBuilder(
                context.applicationContext,
                AppDatabase::class.java,
                "ai-commute.db"
            ).build().also { INSTANCE = it }
        }
    }
}

class SettingsStore(context: Context) {
    private val prefs = context.getSharedPreferences("ai_commute_settings", Context.MODE_PRIVATE)
    private val secretPrefs = context.getSharedPreferences("ai_commute_secrets", Context.MODE_PRIVATE)
    private val secretBox = SecretBox()

    fun load(): AppSettings = AppSettings(
        defaultCity = prefs.getString("defaultCity", "宁波") ?: "宁波",
        defaultOrigin = prefs.getString("defaultOrigin", "") ?: "",
        commutePreferences = prefs.getString(
            "commutePreferences",
            "优先经济实惠，其次准时；合理考虑天气与步行距离"
        ) ?: "",
        routeChangeThresholdMinutes = prefs.getInt("routeChangeThresholdMinutes", 8),
        emailRecipient = prefs.getString("emailRecipient", "") ?: "",
        openAiBaseUrl = prefs.getString("openAiBaseUrl", "https://api.openai.com/v1")
            ?: "https://api.openai.com/v1",
        openAiModel = prefs.getString("openAiModel", "") ?: "",
        openAiKey = readSecret("openAiKey"),
        amapKey = readSecret("amapKey"),
        smtpHost = prefs.getString("smtpHost", "") ?: "",
        smtpPort = prefs.getInt("smtpPort", 587),
        smtpUser = prefs.getString("smtpUser", "") ?: "",
        smtpPassword = readSecret("smtpPassword"),
        smtpFrom = prefs.getString("smtpFrom", "") ?: "",
        smtpSecure = prefs.getBoolean("smtpSecure", false),
    )

    fun save(settings: AppSettings) {
        prefs.edit()
            .putString("defaultCity", settings.defaultCity)
            .putString("defaultOrigin", settings.defaultOrigin)
            .putString("commutePreferences", settings.commutePreferences)
            .putInt("routeChangeThresholdMinutes", settings.routeChangeThresholdMinutes)
            .putString("emailRecipient", settings.emailRecipient)
            .putString("openAiBaseUrl", settings.openAiBaseUrl.trimEnd('/'))
            .putString("openAiModel", settings.openAiModel)
            .putString("smtpHost", settings.smtpHost)
            .putInt("smtpPort", settings.smtpPort)
            .putString("smtpUser", settings.smtpUser)
            .putString("smtpFrom", settings.smtpFrom)
            .putBoolean("smtpSecure", settings.smtpSecure)
            .apply()
        writeSecret("openAiKey", settings.openAiKey)
        writeSecret("amapKey", settings.amapKey)
        writeSecret("smtpPassword", settings.smtpPassword)
    }

    private fun readSecret(key: String): String {
        val raw = secretPrefs.getString(key, null) ?: return ""
        return runCatching { secretBox.decrypt(raw) }.getOrDefault("")
    }

    private fun writeSecret(key: String, value: String) {
        if (value.isBlank()) {
            secretPrefs.edit().remove(key).apply()
        } else {
            val encrypted = secretBox.encrypt(value)
            secretPrefs.edit().putString(key, encrypted).apply()
        }
    }
}

private class SecretBox {
    private val alias = "ai_commute_local_secret_key"

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val existing = keyStore.getKey(alias, null) as? SecretKey
        if (existing != null) return existing

        val generator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            "AndroidKeyStore"
        )
        generator.init(
            KeyGenParameterSpec.Builder(
                alias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build()
        )
        return generator.generateKey()
    }

    fun encrypt(plain: String): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val encrypted = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" +
            Base64.encodeToString(encrypted, Base64.NO_WRAP)
    }

    fun decrypt(encoded: String): String {
        val parts = encoded.split(":", limit = 2)
        require(parts.size == 2)
        val iv = Base64.decode(parts[0], Base64.NO_WRAP)
        val encrypted = Base64.decode(parts[1], Base64.NO_WRAP)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(128, iv))
        return String(cipher.doFinal(encrypted), Charsets.UTF_8)
    }
}
