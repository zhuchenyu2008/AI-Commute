package com.zhuchenyu.aicommute

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class AppUiState(
    val trips: List<TripEntity> = emptyList(),
    val memories: List<MemoryEntity> = emptyList(),
    val settings: AppSettings = AppSettings(),
    val weather: WeatherInfo? = null,
    val currentLocation: DeviceLocation? = null,
    val selectedTrip: TripDetail? = null,
    val isPlanning: Boolean = false,
    val isLocating: Boolean = false,
    val error: String? = null,
)

class AppViewModel(application: Application) : AndroidViewModel(application) {
    private val repo = TripRepository(application)
    private val _state = MutableStateFlow(
        AppUiState(settings = repo.loadSettings())
    )
    val state = _state.asStateFlow()

    init {
        viewModelScope.launch {
            repo.trips.collect { trips ->
                _state.value = _state.value.copy(trips = trips)
            }
        }
        viewModelScope.launch {
            repo.memories.collect { memories ->
                _state.value = _state.value.copy(memories = memories)
            }
        }
        refreshWeather()
    }

    fun saveSettings(settings: AppSettings) {
        repo.saveSettings(settings)
        _state.value = _state.value.copy(settings = repo.loadSettings(), error = null)
        refreshWeather()
    }

    fun refreshWeather() {
        viewModelScope.launch {
            val weather = runCatching { repo.weather() }.getOrNull()
            _state.value = _state.value.copy(weather = weather)
        }
    }

    fun refreshLocation() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLocating = true, error = null)
            val result = runCatching { repo.resolveDeviceLocation() }
            _state.value = if (result.isSuccess) {
                _state.value.copy(
                    currentLocation = result.getOrNull(),
                    isLocating = false
                )
            } else {
                _state.value.copy(
                    isLocating = false,
                    error = result.exceptionOrNull()?.message ?: "定位失败"
                )
            }
        }
    }

    fun plan(request: String) {
        if (_state.value.isPlanning) return
        viewModelScope.launch {
            _state.value = _state.value.copy(isPlanning = true, error = null)
            val result = runCatching {
                repo.planTrip(request, _state.value.currentLocation)
            }
            _state.value = if (result.isSuccess) {
                _state.value.copy(
                    isPlanning = false,
                    selectedTrip = result.getOrNull()
                )
            } else {
                _state.value.copy(
                    isPlanning = false,
                    error = result.exceptionOrNull()?.message ?: "规划失败"
                )
            }
        }
    }

    fun openTrip(id: String) {
        viewModelScope.launch {
            val detail = repo.tripDetail(id)
            _state.value = _state.value.copy(selectedTrip = detail, error = null)
        }
    }

    fun closeTrip() {
        _state.value = _state.value.copy(selectedTrip = null)
    }

    fun cancelTrip(id: String) {
        viewModelScope.launch {
            repo.cancelTrip(id)
            val refreshed = repo.tripDetail(id)
            _state.value = _state.value.copy(selectedTrip = refreshed)
        }
    }

    fun acceptMemory(id: String) {
        viewModelScope.launch { repo.acceptMemory(id) }
    }

    fun rejectMemory(id: String) {
        viewModelScope.launch { repo.rejectMemory(id) }
    }

    fun deleteMemory(id: String) {
        viewModelScope.launch { repo.deleteMemory(id) }
    }

    fun clearError() {
        _state.value = _state.value.copy(error = null)
    }
}
