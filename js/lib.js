(() => {
  window.WifiMonitorLib = window.WifiMonitorLib || {};

  window.WifiMonitorLib.STORAGE_KEYS = {
    data: 'wifiMonitorData',
    networks: 'wifiNetworks',
    currentWifi: 'currentWifi',
    wasMonitoring: 'wifiMonitorWasMonitoring',
    autoResumeEnabled: 'wifiMonitorAutoResumeEnabled',
    autoBackupEnabled: 'wifiMonitorAutoBackupEnabled'
  };

  window.WifiMonitorLib.DAYS = ['日', '月', '火', '水', '木', '金', '土'];

  window.WifiMonitorLib.CONGESTION_BAR_TITLE =
    '混雑度（推定）: 速度（downlink）と遅延（RTT）から算出。値が大きいほど混雑（時間の進捗ではありません）。';
})();


