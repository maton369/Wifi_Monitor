(() => {
  const Lib = (window.WifiMonitorLib = window.WifiMonitorLib || {});
  const Storage = Lib.Storage;
  const Metrics = Lib.Metrics;
  const Backup = Lib.Backup;
  const UI = Lib.UI;

  class WiFiMonitor {
    constructor() {
      this.data = Storage.loadData();
      this.wifiNetworks = Storage.loadWifiNetworks();

      const lastWifi = Storage.loadCurrentWifi();
      this.currentWifi = lastWifi && this.wifiNetworks.includes(lastWifi) ? lastWifi : null;

      const settings = Storage.loadSettings();
      this.autoResumeEnabled = settings.autoResumeEnabled;
      this.autoBackupEnabled = settings.autoBackupEnabled;

      this.isMonitoring = false;
      this.monitorInterval = null;

      UI.bindEvents(this);
      this.initConnectivityListeners();
      UI.updateConnectionStatus();
      this.render();
      this.maybeAutoResumeMonitoring();
    }

    // UIに表示するための派生データ
    getCurrentWifiData() {
      if (!this.currentWifi) return [];
      return this.data.filter((d) => d.wifiName === this.currentWifi);
    }

    render() {
      UI.renderAll({
        wifiNetworks: this.wifiNetworks,
        currentWifi: this.currentWifi,
        wifiData: this.getCurrentWifiData(),
        isMonitoring: this.isMonitoring
      });
    }

    persist() {
      Storage.saveData(this.data);
      Storage.saveWifiNetworks(this.wifiNetworks);
      if (this.currentWifi) Storage.saveCurrentWifi(this.currentWifi);
    }

    setAutoResumeEnabled(enabled) {
      this.autoResumeEnabled = !!enabled;
      Storage.saveAutoResumeEnabled(this.autoResumeEnabled);
    }

    setAutoBackupEnabled(enabled) {
      this.autoBackupEnabled = !!enabled;
      Storage.saveAutoBackupEnabled(this.autoBackupEnabled);
    }

    setWasMonitoring(wasMonitoring) {
      Storage.saveWasMonitoring(!!wasMonitoring);
    }

    getWasMonitoring() {
      return Storage.loadWasMonitoring();
    }

    initConnectivityListeners() {
      window.addEventListener('online', () => {
        UI.updateConnectionStatus();
        this.maybeAutoResumeMonitoring();
      });

      window.addEventListener('offline', () => {
        UI.updateConnectionStatus();
        this.pauseMonitoringDueToOffline();
      });

      if (navigator.connection && typeof navigator.connection.addEventListener === 'function') {
        navigator.connection.addEventListener('change', () => {
          UI.updateConnectionStatus();
          // WiFi以外になったら計測停止（大学WiFiが切れてもセルラーでオンラインのまま、というケースを防ぐ）
          if (!this.isWifiConnected()) this.stopMonitoringDueToWifiDisconnect();
          else if (navigator.onLine === false) this.pauseMonitoringDueToOffline();
        });
      }
    }

    // WiFi接続中か（取得できない環境ではオンライン判定のみ）
    isWifiConnected() {
      if (navigator.onLine === false) return false;
      const type = navigator.connection && typeof navigator.connection.type === 'string' ? navigator.connection.type : null;
      // typeが取れないブラウザでは「WiFiかどうか」を判定できないため、オンラインなら許可
      if (!type) return true;
      return type === 'wifi';
    }

    // WiFiが切れたと判断した場合は計測を停止（自動再開しない）
    stopMonitoringDueToWifiDisconnect() {
      this.persist();
      if (!this.isMonitoring) return;
      if (this.monitorInterval) {
        clearInterval(this.monitorInterval);
        this.monitorInterval = null;
      }
      this.isMonitoring = false;
      // “前回測定中”を落としておく（別ネットワークで勝手に再開しない）
      this.setWasMonitoring(false);
      UI.updateStartButton(false);
      alert('WiFi接続が切れたため、計測を停止しました。WiFiに接続したうえで、必要ならWiFi名を選び直して「測定開始」してください。');
    }

    pauseMonitoringDueToOffline() {
      this.persist();
      if (!this.isMonitoring) return;
      if (this.monitorInterval) {
        clearInterval(this.monitorInterval);
        this.monitorInterval = null;
      }
      // stopMonitoringは呼ばない（wasMonitoring=falseにしない／自動DLバックアップも走らせない）
      this.isMonitoring = false;
      UI.updateStartButton(false);
    }

    addWifiNetwork() {
      const wifiName = prompt('WiFiネットワーク名（SSID）を入力してください:\n\n例: 大学WiFi_1F, 研究室WiFi など');
      if (!wifiName || wifiName.trim() === '') return;
      const trimmedName = wifiName.trim();
      if (this.wifiNetworks.includes(trimmedName)) {
        alert('このWiFiはすでに登録されています。');
        return;
      }
      this.wifiNetworks.push(trimmedName);
      this.currentWifi = trimmedName;
      this.persist();
      this.render();
      alert(`WiFi「${trimmedName}」を追加しました。\n測定を開始してください。`);
    }

    selectWifi(wifiName) {
      const prevWifi = this.currentWifi;
      const wasMonitoringBeforeSwitch = this.isMonitoring;

      this.currentWifi = wifiName ? wifiName : null;
      if (this.currentWifi) Storage.saveCurrentWifi(this.currentWifi);

      // WiFi切替時は「前のWiFiの計測が終わった」とみなして自動バックアップ
      if (this.autoBackupEnabled && prevWifi && prevWifi !== this.currentWifi) {
        Backup.exportWifi({ data: this.data }, prevWifi, 'switch');
      }

      // 測定中に切り替えた場合は、新しいWiFiで自動的に計測を継続（再開）
      if (wasMonitoringBeforeSwitch && prevWifi !== this.currentWifi) {
        if (!this.currentWifi) {
          this.stopMonitoring();
        } else {
          if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
          }
          this.isMonitoring = true;
          this.setWasMonitoring(true);
          this.measureNow();
          this.monitorInterval = setInterval(() => this.measureNow(), 5 * 60 * 1000);
        }
      }

      this.render();
    }

    startMonitoring() {
      if (!this.currentWifi) {
        alert('WiFiを選択または追加してください。');
        return;
      }
      if (!this.isWifiConnected()) {
        UI.updateConnectionStatus();
        alert('WiFi接続中のみ測定できます。WiFiに接続してから再度お試しください。');
        return;
      }
      if (this.isMonitoring) return;

      this.isMonitoring = true;
      this.setWasMonitoring(true);
      this.measureNow();
      this.monitorInterval = setInterval(() => this.measureNow(), 5 * 60 * 1000);
      UI.updateStartButton(true);
    }

    stopMonitoring() {
      this.isMonitoring = false;
      this.setWasMonitoring(false);
      if (this.monitorInterval) {
        clearInterval(this.monitorInterval);
        this.monitorInterval = null;
      }
      UI.updateStartButton(false);

      if (this.autoBackupEnabled && this.currentWifi) {
        Backup.exportWifi({ data: this.data }, this.currentWifi, 'stop');
      }
    }

    maybeAutoResumeMonitoring() {
      if (!this.autoResumeEnabled) return;
      if (!this.currentWifi) return;
      if (this.isMonitoring) return;
      if (!this.getWasMonitoring()) return;
      if (!this.isWifiConnected()) return;
      this.startMonitoring();
    }

    measureNow() {
      if (!this.currentWifi) {
        alert('WiFiを選択してください。');
        this.stopMonitoring();
        return;
      }

      if (!this.isWifiConnected()) {
        UI.updateConnectionStatus();
        this.stopMonitoringDueToWifiDisconnect();
        return;
      }

      if (!navigator.connection) {
        alert('このブラウザはNetwork Information APIをサポートしていません。Chrome/Edgeをお試しください。');
        this.stopMonitoring();
        return;
      }

      const connection = navigator.connection;
      const now = new Date();

      const downlink = connection.downlink || 0;
      const rtt = connection.rtt || 0;

      const measurement = {
        timestamp: now.toISOString(),
        wifiName: this.currentWifi,
        dayOfWeek: now.getDay(),
        hour: now.getHours(),
        effectiveType: connection.effectiveType || 'unknown',
        downlink,
        rtt,
        congestion: Metrics.calculateCongestion(downlink, rtt)
      };

      this.data.push(measurement);
      if (this.data.length > 1000) this.data = this.data.slice(-1000);
      this.persist();
      this.render();
    }

    exportAllData() {
      Backup.exportAll({
        data: this.data,
        wifiNetworks: this.wifiNetworks,
        currentWifi: this.currentWifi
      });
    }

    async importDataFromFile(file) {
      if (!file) return;
      try {
        const result = await Backup.importFromFile(file, {
          existingData: this.data,
          existingNetworks: this.wifiNetworks,
          currentWifi: this.currentWifi
        });

        if (!result) return;
        if (result.importedCount === 0) {
          alert('読み込めるデータがありませんでした（フォーマット不一致）。');
          return;
        }

        this.data = result.data;
        this.wifiNetworks = result.wifiNetworks;
        if (!this.currentWifi && result.currentWifi) this.currentWifi = result.currentWifi;

        this.persist();
        this.render();
        alert(`読み込み完了: ${result.importedCount}件（有効）`);
      } catch (e) {
        const msg =
          e?.message === 'file_read_failed'
            ? 'ファイルの読み込みに失敗しました。別のブラウザでお試しください。'
            : e?.message === 'json_invalid'
              ? 'JSONの形式が正しくありません。'
              : e?.message === 'format_invalid'
                ? '読み込んだJSONが想定フォーマットではありません。'
                : '読み込みに失敗しました。';
        alert(msg);
      }
    }

    clearData() {
      if (!this.currentWifi) {
        alert('WiFiを選択してください。');
        return;
      }
      if (confirm(`「${this.currentWifi}」のすべてのデータを削除しますか？`)) {
        this.data = this.data.filter((d) => d.wifiName !== this.currentWifi);
        this.persist();
        this.render();
      }
    }
  }

  Lib.Monitor = { WiFiMonitor };
})();


