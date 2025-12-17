(() => {
  const Lib = (window.WifiMonitorLib = window.WifiMonitorLib || {});
  const KEYS = Lib.STORAGE_KEYS;

  function safeParse(json, fallback) {
    if (!json) return fallback;
    try {
      return JSON.parse(json);
    } catch {
      return fallback;
    }
  }

  function loadData() {
    return safeParse(localStorage.getItem(KEYS.data), []);
  }

  function saveData(data) {
    localStorage.setItem(KEYS.data, JSON.stringify(data ?? []));
  }

  function loadWifiNetworks() {
    return safeParse(localStorage.getItem(KEYS.networks), []);
  }

  function saveWifiNetworks(networks) {
    localStorage.setItem(KEYS.networks, JSON.stringify(networks ?? []));
  }

  function loadCurrentWifi() {
    return localStorage.getItem(KEYS.currentWifi);
  }

  function saveCurrentWifi(wifiName) {
    if (wifiName) localStorage.setItem(KEYS.currentWifi, wifiName);
  }

  function loadBool(key, defaultValue) {
    const v = localStorage.getItem(key);
    if (v === null) return defaultValue;
    return v === 'true';
  }

  function saveBool(key, value) {
    localStorage.setItem(key, value ? 'true' : 'false');
  }

  function loadSettings() {
    return {
      autoResumeEnabled: loadBool(KEYS.autoResumeEnabled, true),
      autoBackupEnabled: loadBool(KEYS.autoBackupEnabled, true)
    };
  }

  function saveAutoResumeEnabled(enabled) {
    saveBool(KEYS.autoResumeEnabled, !!enabled);
  }

  function saveAutoBackupEnabled(enabled) {
    saveBool(KEYS.autoBackupEnabled, !!enabled);
  }

  function loadWasMonitoring() {
    return loadBool(KEYS.wasMonitoring, false);
  }

  function saveWasMonitoring(wasMonitoring) {
    saveBool(KEYS.wasMonitoring, !!wasMonitoring);
  }

  Lib.Storage = {
    loadData,
    saveData,
    loadWifiNetworks,
    saveWifiNetworks,
    loadCurrentWifi,
    saveCurrentWifi,
    loadSettings,
    saveAutoResumeEnabled,
    saveAutoBackupEnabled,
    loadWasMonitoring,
    saveWasMonitoring
  };
})();


