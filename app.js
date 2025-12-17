// WiFi混雑度モニターアプリケーション

const STORAGE_KEYS = {
    data: 'wifiMonitorData',
    networks: 'wifiNetworks',
    currentWifi: 'currentWifi',
    wasMonitoring: 'wifiMonitorWasMonitoring',
    autoResumeEnabled: 'wifiMonitorAutoResumeEnabled',
    autoBackupEnabled: 'wifiMonitorAutoBackupEnabled'
};

class WiFiMonitor {
    constructor() {
        this.data = [];
        this.wifiNetworks = [];
        this.currentWifi = null;
        this.isMonitoring = false;
        this.monitorInterval = null;
        this.loadData();
        this.loadWifiNetworks();
        this.loadSettings();
        this.initUI();
        this.initConnectivityListeners();
        this.updateConnectionStatus();
        this.updateDisplay();
        this.maybeAutoResumeMonitoring();
    }

    // ローカルストレージからデータを読み込み
    loadData() {
        const saved = localStorage.getItem(STORAGE_KEYS.data);
        if (saved) {
            this.data = JSON.parse(saved);
        }
    }

    // WiFiネットワークリストを読み込み
    loadWifiNetworks() {
        const saved = localStorage.getItem(STORAGE_KEYS.networks);
        if (saved) {
            this.wifiNetworks = JSON.parse(saved);
        }

        // 最後に選択していたWiFiを復元
        const lastWifi = localStorage.getItem(STORAGE_KEYS.currentWifi);
        if (lastWifi && this.wifiNetworks.includes(lastWifi)) {
            this.currentWifi = lastWifi;
        }
    }

    // 設定を読み込み
    loadSettings() {
        const savedAutoResume = localStorage.getItem(STORAGE_KEYS.autoResumeEnabled);
        // 未設定ならON（要件: 自動再開する）
        this.autoResumeEnabled = savedAutoResume === null ? true : savedAutoResume === 'true';

        const savedAutoBackup = localStorage.getItem(STORAGE_KEYS.autoBackupEnabled);
        // 未設定ならON（要件: デフォルトでON）
        this.autoBackupEnabled = savedAutoBackup === null ? true : savedAutoBackup === 'true';
    }

    // ローカルストレージにデータを保存
    saveData() {
        localStorage.setItem(STORAGE_KEYS.data, JSON.stringify(this.data));
    }

    // WiFiネットワークリストを保存
    saveWifiNetworks() {
        localStorage.setItem(STORAGE_KEYS.networks, JSON.stringify(this.wifiNetworks));
        if (this.currentWifi) {
            localStorage.setItem(STORAGE_KEYS.currentWifi, this.currentWifi);
        }
    }

    // 自動再開ON/OFF
    setAutoResumeEnabled(enabled) {
        this.autoResumeEnabled = !!enabled;
        localStorage.setItem(STORAGE_KEYS.autoResumeEnabled, this.autoResumeEnabled ? 'true' : 'false');
    }

    // 自動バックアップON/OFF
    setAutoBackupEnabled(enabled) {
        this.autoBackupEnabled = !!enabled;
        localStorage.setItem(STORAGE_KEYS.autoBackupEnabled, this.autoBackupEnabled ? 'true' : 'false');
    }

    // 前回測定中だったか（ブラウザ終了時にstopMonitoringが呼ばれないケースも含めて保持）
    setWasMonitoring(wasMonitoring) {
        localStorage.setItem(STORAGE_KEYS.wasMonitoring, wasMonitoring ? 'true' : 'false');
    }

    getWasMonitoring() {
        return localStorage.getItem(STORAGE_KEYS.wasMonitoring) === 'true';
    }

    // UI初期化
    initUI() {
        document.getElementById('startBtn').addEventListener('click', () => this.startMonitoring());
        document.getElementById('stopBtn').addEventListener('click', () => this.stopMonitoring());
        document.getElementById('clearBtn').addEventListener('click', () => this.clearData());
        document.getElementById('addWifiBtn').addEventListener('click', () => this.addWifiNetwork());
        document.getElementById('wifiSelect').addEventListener('change', (e) => this.selectWifi(e.target.value));

        // 自動再開トグル
        const autoResumeChk = document.getElementById('autoResumeChk');
        if (autoResumeChk) {
            autoResumeChk.checked = this.autoResumeEnabled;
            autoResumeChk.addEventListener('change', (e) => this.setAutoResumeEnabled(e.target.checked));
        }

        const autoBackupChk = document.getElementById('autoBackupChk');
        if (autoBackupChk) {
            autoBackupChk.checked = this.autoBackupEnabled;
            autoBackupChk.addEventListener('change', (e) => this.setAutoBackupEnabled(e.target.checked));
        }

        // エクスポート/インポート（JSON）
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportDataToFile());
        }

        const importBtn = document.getElementById('importBtn');
        const importFileInput = document.getElementById('importFileInput');
        if (importBtn && importFileInput) {
            importBtn.addEventListener('click', () => importFileInput.click());
            importFileInput.addEventListener('change', async (e) => {
                const file = e.target.files && e.target.files[0];
                await this.importDataFromFile(file);
                // 同じファイルを連続で選べるようにリセット
                e.target.value = '';
            });
        }

        this.updateWifiSelector();
    }

    // オンライン/オフライン状態をUIに表示
    updateConnectionStatus() {
        const elem = document.getElementById('connectionStatus');
        if (!elem) return;
        const online = navigator.onLine !== false;
        elem.textContent = `オンライン状態: ${online ? 'オンライン' : 'オフライン（復帰待ち）'}`;
    }

    // 接続状態の変化を監視（WiFiを切った等）
    initConnectivityListeners() {
        window.addEventListener('online', () => {
            this.updateConnectionStatus();
            // オンライン復帰時、前回測定中なら自動再開（B: ダウンロード保存はしない）
            this.maybeAutoResumeMonitoring();
        });

        window.addEventListener('offline', () => {
            this.updateConnectionStatus();
            // オフラインになったら計測を一時停止（自動ダウンロード保存はしない）
            this.pauseMonitoringDueToOffline();
        });

        if (navigator.connection && typeof navigator.connection.addEventListener === 'function') {
            navigator.connection.addEventListener('change', () => {
                this.updateConnectionStatus();
                if (navigator.onLine === false) {
                    this.pauseMonitoringDueToOffline();
                }
            });
        }
    }

    // WiFi切断などでオフラインになったときの一時停止（wasMonitoringフラグは維持）
    pauseMonitoringDueToOffline() {
        // dataはmeasureNowごとに保存されるが、念のためここでも保存
        this.saveData();
        this.saveWifiNetworks();

        if (!this.isMonitoring) return;

        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
        }

        // stopMonitoring()は呼ばない（wasMonitoring=falseにしない／自動DLバックアップも走らせない）
        this.isMonitoring = false;
        document.getElementById('startBtn').textContent = '測定開始';
        document.getElementById('startBtn').disabled = false;
    }

    // WiFiセレクターを更新
    updateWifiSelector() {
        const select = document.getElementById('wifiSelect');
        select.innerHTML = '<option value="">WiFiを選択してください</option>';

        this.wifiNetworks.forEach(wifi => {
            const option = document.createElement('option');
            option.value = wifi;
            option.textContent = wifi;
            if (wifi === this.currentWifi) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    }

    // 新しいWiFiネットワークを追加
    addWifiNetwork() {
        const wifiName = prompt('WiFiネットワーク名（SSID）を入力してください:\n\n例: 大学WiFi_1F, 研究室WiFi など');

        if (!wifiName || wifiName.trim() === '') {
            return;
        }

        const trimmedName = wifiName.trim();

        if (this.wifiNetworks.includes(trimmedName)) {
            alert('このWiFiはすでに登録されています。');
            return;
        }

        this.wifiNetworks.push(trimmedName);
        this.currentWifi = trimmedName;
        this.saveWifiNetworks();
        this.updateWifiSelector();
        this.updateDisplay();

        alert(`WiFi「${trimmedName}」を追加しました。\n測定を開始してください。`);
    }

    // WiFiを選択
    selectWifi(wifiName) {
        const prevWifi = this.currentWifi;
        const wasMonitoringBeforeSwitch = this.isMonitoring;
        if (!wifiName) {
            this.currentWifi = null;
        } else {
            this.currentWifi = wifiName;
            localStorage.setItem(STORAGE_KEYS.currentWifi, wifiName);
        }

        // WiFi切替時は「前のWiFiの計測が終わった」とみなして自動バックアップ
        if (this.autoBackupEnabled && prevWifi && prevWifi !== this.currentWifi) {
            this.exportWifiDataToFile(prevWifi, 'switch');
        }

        // 測定中に切り替えた場合は、新しいWiFiで自動的に計測を継続（再開）
        if (wasMonitoringBeforeSwitch && prevWifi !== this.currentWifi) {
            // 新しいWiFiが未選択なら停止
            if (!this.currentWifi) {
                this.stopMonitoring();
            } else {
                // intervalだけ張り替え（UI状態は「測定中」のまま維持）
                if (this.monitorInterval) {
                    clearInterval(this.monitorInterval);
                    this.monitorInterval = null;
                }
                this.isMonitoring = true;
                this.setWasMonitoring(true);
                this.measureNow();
                this.monitorInterval = setInterval(() => {
                    this.measureNow();
                }, 5 * 60 * 1000);
            }
        }

        this.updateDisplay();
    }

    // 測定開始
    startMonitoring(isAutoStart = false) {
        if (!this.currentWifi) {
            alert('WiFiを選択または追加してください。');
            return;
        }

        // オフライン時は開始しない（オンライン復帰時に自動再開させる）
        if (navigator.onLine === false) {
            this.updateConnectionStatus();
            return;
        }

        if (this.isMonitoring) return;

        this.isMonitoring = true;
        // ブラウザを閉じても次回起動時に再開できるよう状態を保存
        this.setWasMonitoring(true);
        this.measureNow();

        // 5分ごとに測定
        this.monitorInterval = setInterval(() => {
            this.measureNow();
        }, 5 * 60 * 1000); // 5分

        // デモ用：10秒ごと（実運用では上記の5分間隔を使用）
        // this.monitorInterval = setInterval(() => {
        //     this.measureNow();
        // }, 10 * 1000);

        document.getElementById('startBtn').textContent = '測定中...';
        document.getElementById('startBtn').disabled = true;
    }

    // 測定停止
    stopMonitoring() {
        this.isMonitoring = false;
        this.setWasMonitoring(false);
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
        }
        document.getElementById('startBtn').textContent = '測定開始';
        document.getElementById('startBtn').disabled = false;

        // 測定停止時に自動バックアップ
        if (this.autoBackupEnabled && this.currentWifi) {
            this.exportWifiDataToFile(this.currentWifi, 'stop');
        }
    }

    // 起動時に自動で測定を再開（前回が測定中だった場合）
    maybeAutoResumeMonitoring() {
        if (!this.autoResumeEnabled) return;
        if (!this.currentWifi) return;
        if (this.isMonitoring) return;
        if (!this.getWasMonitoring()) return;

        // 前回「測定中」だったなら自動的に測定開始
        this.startMonitoring(true);
    }

    // 即座に測定
    measureNow() {
        if (!this.currentWifi) {
            alert('WiFiを選択してください。');
            this.stopMonitoring();
            return;
        }

        // オフライン時は計測せず一時停止（B: ローカル保持のみ）
        if (navigator.onLine === false) {
            this.updateConnectionStatus();
            this.pauseMonitoringDueToOffline();
            return;
        }

        if (!navigator.connection) {
            alert('このブラウザはNetwork Information APIをサポートしていません。Chrome/Edgeをお試しください。');
            this.stopMonitoring();
            return;
        }

        const connection = navigator.connection;
        const now = new Date();

        const measurement = {
            timestamp: now.toISOString(),
            wifiName: this.currentWifi,
            dayOfWeek: now.getDay(), // 0=日曜, 1=月曜, ..., 6=土曜
            hour: now.getHours(),
            effectiveType: connection.effectiveType || 'unknown',
            downlink: connection.downlink || 0,
            rtt: connection.rtt || 0,
            congestion: this.calculateCongestion(connection.downlink, connection.rtt)
        };

        this.data.push(measurement);

        // 直近1000件のみ保持
        if (this.data.length > 1000) {
            this.data = this.data.slice(-1000);
        }

        this.saveData();
        this.updateDisplay();
    }

    // 混雑度を計算（0-100のスコア）
    calculateCongestion(downlink, rtt) {
        // downlink: 高いほど良い（通常0-10 Mbps）
        // rtt: 低いほど良い（通常50-500 ms）

        let score = 0;

        // 速度スコア（50点満点）
        if (downlink >= 5) score += 50; // 5Mbps以上で快適
        else if (downlink >= 2) score += 30;
        else if (downlink >= 1) score += 15;
        else score += 5;

        // RTTスコア（50点満点）
        if (rtt <= 100) score += 50; // 100ms以下で快適
        else if (rtt <= 200) score += 30;
        else if (rtt <= 400) score += 15;
        else score += 5;

        // 100点満点を混雑度に変換（高いほど混雑）
        return 100 - score;
    }

    // 現在のWiFiのデータのみを取得
    getCurrentWifiData() {
        if (!this.currentWifi) return [];
        return this.data.filter(d => d.wifiName === this.currentWifi);
    }

    // 表示を更新
    updateDisplay() {
        this.updateCurrentStatus();
        this.updateHeatmap();
        this.updateStatistics();
        this.updateHistory();
        this.updateWifiNameDisplay();
    }

    // WiFi名の表示を更新
    updateWifiNameDisplay() {
        const elem = document.getElementById('currentWifiName');
        if (this.currentWifi) {
            const wifiData = this.getCurrentWifiData();
            elem.textContent = `📡 ${this.currentWifi} のデータ（測定回数: ${wifiData.length}回）`;
            elem.style.display = 'block';
        } else {
            elem.textContent = 'WiFiを選択してください';
            elem.style.display = 'block';
        }
    }

    // 現在のステータス表示
    updateCurrentStatus() {
        const wifiData = this.getCurrentWifiData();

        if (wifiData.length === 0) {
            document.getElementById('effectiveType').textContent = '-';
            document.getElementById('downlink').textContent = '-';
            document.getElementById('rtt').textContent = '-';
            document.getElementById('congestion').textContent = '-';

            const bar = document.getElementById('congestionBar');
            bar.style.width = '0%';
            bar.title = '混雑度（推定）: 速度（downlink）と遅延（RTT）から算出。値が大きいほど混雑（時間の進捗ではありません）。';
            bar.setAttribute('role', 'progressbar');
            bar.setAttribute('aria-valuemin', '0');
            bar.setAttribute('aria-valuemax', '100');
            bar.setAttribute('aria-valuenow', '0');
            const text = document.getElementById('congestionText');
            if (text) {
                text.textContent = '0%';
                text.title = bar.title;
            }
            return;
        }

        const latest = wifiData[wifiData.length - 1];

        document.getElementById('effectiveType').textContent = this.formatEffectiveType(latest.effectiveType);
        document.getElementById('downlink').textContent = latest.downlink.toFixed(1) + ' Mbps';
        document.getElementById('rtt').textContent = latest.rtt + ' ms';

        const congestion = latest.congestion;
        const congestionLevel = this.getCongestionLevel(congestion);
        document.getElementById('congestion').textContent = congestionLevel.label;

        const bar = document.getElementById('congestionBar');
        bar.style.width = congestion + '%';
        bar.style.backgroundColor = congestionLevel.color;
        bar.title = '混雑度（推定）: 速度（downlink）と遅延（RTT）から算出。値が大きいほど混雑（時間の進捗ではありません）。';
        bar.setAttribute('role', 'progressbar');
        bar.setAttribute('aria-valuemin', '0');
        bar.setAttribute('aria-valuemax', '100');
        bar.setAttribute('aria-valuenow', String(Math.round(congestion)));
        const text = document.getElementById('congestionText');
        if (text) {
            text.textContent = Math.round(congestion) + '%';
            text.title = bar.title;
        }
    }

    // 混雑度レベルを取得
    getCongestionLevel(score) {
        if (score <= 20) return { label: '快適', color: '#4caf50' };
        if (score <= 40) return { label: '良好', color: '#8bc34a' };
        if (score <= 60) return { label: '普通', color: '#ffeb3b' };
        if (score <= 80) return { label: 'やや混雑', color: '#ff9800' };
        return { label: '混雑', color: '#f44336' };
    }

    // 接続タイプ表示の正規化（4g -> 4G など）
    formatEffectiveType(type) {
        const t = String(type ?? '').trim();
        if (/^[234]g$/.test(t)) return t.toUpperCase(); // 2g/3g/4g -> 2G/3G/4G
        return t || '-';
    }

    // ヒートマップを更新
    updateHeatmap() {
        const heatmap = document.getElementById('heatmap');
        heatmap.innerHTML = '';

        const days = ['日', '月', '火', '水', '木', '金', '土'];
        const hours = Array.from({ length: 24 }, (_, i) => i);

        // ヘッダー行（時間）
        heatmap.appendChild(this.createCell('', true));
        hours.forEach(hour => {
            heatmap.appendChild(this.createCell(hour + '時', true));
        });

        // 各曜日の行
        days.forEach((day, dayIndex) => {
            heatmap.appendChild(this.createCell(day, true));

            hours.forEach(hour => {
                const avgCongestion = this.getAverageCongestion(dayIndex, hour);
                const cell = this.createCell('', false);

                if (avgCongestion !== null) {
                    const level = this.getCongestionLevel(avgCongestion);
                    cell.style.backgroundColor = level.color;
                    cell.title = `${day}曜日 ${hour}時: ${level.label} (${Math.round(avgCongestion)}%)`;
                } else {
                    cell.style.backgroundColor = '#e0e0e0';
                    cell.title = 'データなし';
                }

                heatmap.appendChild(cell);
            });
        });
    }

    // セルを作成
    createCell(text, isLabel) {
        const cell = document.createElement('div');
        cell.className = isLabel ? 'heatmap-label' : 'heatmap-cell';
        cell.textContent = text;
        return cell;
    }

    // 特定の曜日・時間の平均混雑度を取得（現在のWiFiのみ）
    getAverageCongestion(dayOfWeek, hour) {
        const wifiData = this.getCurrentWifiData();
        const filtered = wifiData.filter(d => d.dayOfWeek === dayOfWeek && d.hour === hour);

        if (filtered.length === 0) return null;

        const sum = filtered.reduce((acc, d) => acc + d.congestion, 0);
        return sum / filtered.length;
    }

    // 統計情報を更新
    updateStatistics() {
        const statsTable = document.getElementById('statsTable');
        const recommendations = document.getElementById('recommendations');

        const wifiData = this.getCurrentWifiData();

        if (wifiData.length === 0) {
            statsTable.innerHTML = '<tr><td colspan="2">データがありません</td></tr>';
            recommendations.innerHTML = '<p>測定を開始してください</p>';
            return;
        }

        // 統計計算
        const avgCongestion = wifiData.reduce((sum, d) => sum + d.congestion, 0) / wifiData.length;
        const avgDownlink = wifiData.reduce((sum, d) => sum + d.downlink, 0) / wifiData.length;
        const avgRTT = wifiData.reduce((sum, d) => sum + d.rtt, 0) / wifiData.length;

        // 最も快適な時間帯を見つける
        const bestTimes = this.findBestTimes();
        const worstTimes = this.findWorstTimes();

        // 統計テーブル
        statsTable.innerHTML = `
            <tr><td>測定回数</td><td>${wifiData.length}回</td></tr>
            <tr><td>平均混雑度</td><td>${Math.round(avgCongestion)}% (${this.getCongestionLevel(avgCongestion).label})</td></tr>
            <tr><td>平均速度</td><td>${avgDownlink.toFixed(2)} Mbps</td></tr>
            <tr><td>平均遅延</td><td>${Math.round(avgRTT)} ms</td></tr>
            <tr><td>最速記録</td><td>${Math.max(...wifiData.map(d => d.downlink)).toFixed(2)} Mbps</td></tr>
            <tr><td>最低速度</td><td>${Math.min(...wifiData.map(d => d.downlink)).toFixed(2)} Mbps</td></tr>
        `;

        // レコメンデーション
        const days = ['日', '月', '火', '水', '木', '金', '土'];
        let recHTML = '';

        if (bestTimes.length > 0) {
            recHTML += '<div class="recommendation">';
            recHTML += '<h3>💡 おすすめの時間帯（快適）</h3><ul>';
            bestTimes.slice(0, 5).forEach(time => {
                recHTML += `<li>${days[time.day]}曜日 ${time.hour}時頃 - 混雑度: ${Math.round(time.congestion)}%</li>`;
            });
            recHTML += '</ul></div>';
        }

        if (worstTimes.length > 0) {
            recHTML += '<div class="recommendation warning">';
            recHTML += '<h3>⚠️ 避けるべき時間帯（混雑）</h3><ul>';
            worstTimes.slice(0, 5).forEach(time => {
                recHTML += `<li>${days[time.day]}曜日 ${time.hour}時頃 - 混雑度: ${Math.round(time.congestion)}%</li>`;
            });
            recHTML += '</ul></div>';
        }

        recommendations.innerHTML = recHTML || '<p>データを蓄積中...</p>';
    }

    // 最も快適な時間帯を見つける
    findBestTimes() {
        const timeSlots = [];

        for (let day = 0; day < 7; day++) {
            for (let hour = 0; hour < 24; hour++) {
                const avg = this.getAverageCongestion(day, hour);
                if (avg !== null) {
                    timeSlots.push({ day, hour, congestion: avg });
                }
            }
        }

        return timeSlots.sort((a, b) => a.congestion - b.congestion);
    }

    // 最も混雑する時間帯を見つける
    findWorstTimes() {
        const timeSlots = [];

        for (let day = 0; day < 7; day++) {
            for (let hour = 0; hour < 24; hour++) {
                const avg = this.getAverageCongestion(day, hour);
                if (avg !== null) {
                    timeSlots.push({ day, hour, congestion: avg });
                }
            }
        }

        return timeSlots.sort((a, b) => b.congestion - a.congestion);
    }

    // 履歴テーブルを更新
    updateHistory() {
        const historyTable = document.getElementById('historyTable');
        const wifiData = this.getCurrentWifiData();

        if (wifiData.length === 0) {
            historyTable.innerHTML = '<tr><td colspan="6">データがありません</td></tr>';
            return;
        }

        const days = ['日', '月', '火', '水', '木', '金', '土'];
        const recent = wifiData.slice(-20).reverse();

        historyTable.innerHTML = recent.map(d => {
            const date = new Date(d.timestamp);
            const level = this.getCongestionLevel(d.congestion);

            return `
                <tr>
                    <td>${date.toLocaleString('ja-JP')}</td>
                    <td>${d.wifiName}</td>
                    <td>${days[d.dayOfWeek]}</td>
                    <td>${d.downlink.toFixed(1)} Mbps</td>
                    <td>${d.rtt} ms</td>
                    <td style="color: ${level.color}; font-weight: bold;">${level.label}</td>
                </tr>
            `;
        }).join('');
    }

    // JSONとしてデータを書き出し（ローカルに保存）
    exportDataToFile() {
        const payload = {
            schemaVersion: 1,
            exportedAt: new Date().toISOString(),
            wifiNetworks: this.wifiNetworks,
            currentWifi: this.currentWifi,
            data: this.data
        };

        this.downloadJson(payload, `wifi-monitor-backup`);
    }

    // 特定WiFiのみJSONとしてバックアップ
    exportWifiDataToFile(wifiName, reason = 'manual') {
        const wifi = String(wifiName || '').trim();
        if (!wifi) return;

        const wifiData = this.data.filter((d) => d && d.wifiName === wifi);
        const payload = {
            schemaVersion: 1,
            exportedAt: new Date().toISOString(),
            reason,
            wifiName: wifi,
            data: wifiData
        };

        this.downloadJson(payload, `wifi-monitor-${this.sanitizeFilename(wifi)}-${reason}`);
    }

    sanitizeFilename(name) {
        return String(name)
            .replace(/[\/\\?%*:|"<>]/g, '_')
            .replace(/\s+/g, '_')
            .slice(0, 80) || 'wifi';
    }

    downloadJson(payload, baseName) {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        const filename = `${baseName}-${ts}.json`;

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    // JSONファイルからデータを読み込み（ブラウザから選択）
    async importDataFromFile(file) {
        if (!file) return;

        let text;
        try {
            text = await file.text();
        } catch (e) {
            alert('ファイルの読み込みに失敗しました。別のブラウザでお試しください。');
            return;
        }

        let imported;
        try {
            imported = JSON.parse(text);
        } catch (e) {
            alert('JSONの形式が正しくありません。');
            return;
        }

        let importedData = [];
        let importedNetworks = [];
        let importedCurrentWifi = null;

        if (Array.isArray(imported)) {
            importedData = imported;
        } else if (imported && typeof imported === 'object') {
            if (Array.isArray(imported.data)) importedData = imported.data;
            if (Array.isArray(imported.wifiNetworks)) importedNetworks = imported.wifiNetworks;
            if (typeof imported.currentWifi === 'string') importedCurrentWifi = imported.currentWifi;
        } else {
            alert('読み込んだJSONが想定フォーマットではありません。');
            return;
        }

        const normalized = importedData
            .map((d) => this.normalizeMeasurement(d))
            .filter(Boolean);

        if (normalized.length === 0) {
            alert('読み込めるデータがありませんでした（フォーマット不一致）。');
            return;
        }

        const shouldMerge = confirm(
            `「${file.name}」を読み込みます。\n\n既存データに追加（マージ）しますか？\nOK: 追加（マージ）\nキャンセル: 置き換え`
        );

        const combined = shouldMerge ? [...this.data, ...normalized] : [...normalized];
        const deduped = this.dedupeAndSortMeasurements(combined);

        // 直近1000件のみ保持（全WiFi合算）
        this.data = deduped.length > 1000 ? deduped.slice(-1000) : deduped;

        // WiFiリストを更新（インポート側のwifiNetworks + データ内wifiName）
        const fromData = Array.from(new Set(normalized.map((d) => d.wifiName)));
        const mergedNetworks = new Set(
            [...(this.wifiNetworks || []), ...(importedNetworks || []), ...fromData]
                .map((w) => String(w).trim())
                .filter(Boolean)
        );
        this.wifiNetworks = Array.from(mergedNetworks);

        // currentWifiは、未選択ならインポート側を採用（上書きはしない）
        if (!this.currentWifi && importedCurrentWifi && this.wifiNetworks.includes(importedCurrentWifi)) {
            this.currentWifi = importedCurrentWifi;
            localStorage.setItem(STORAGE_KEYS.currentWifi, importedCurrentWifi);
        }

        this.saveData();
        this.saveWifiNetworks();
        this.updateWifiSelector();
        this.updateDisplay();

        alert(`読み込み完了: ${normalized.length}件（有効）`);
    }

    // 測定レコードの正規化（インポート用）
    normalizeMeasurement(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const wifiName = String(raw.wifiName ?? '').trim();
        const timestamp = String(raw.timestamp ?? '').trim();
        if (!wifiName || !timestamp) return null;

        const date = new Date(timestamp);
        if (isNaN(date.getTime())) return null;

        const downlink = Number(raw.downlink ?? 0) || 0;
        const rtt = Number(raw.rtt ?? 0) || 0;
        const effectiveType = raw.effectiveType ? String(raw.effectiveType) : 'unknown';

        const dayOfWeek = Number.isInteger(raw.dayOfWeek) ? raw.dayOfWeek : date.getDay();
        const hour = Number.isInteger(raw.hour) ? raw.hour : date.getHours();

        let congestion = typeof raw.congestion === 'number' ? raw.congestion : this.calculateCongestion(downlink, rtt);
        congestion = Math.max(0, Math.min(100, congestion));

        return {
            timestamp: date.toISOString(),
            wifiName,
            dayOfWeek,
            hour,
            effectiveType,
            downlink,
            rtt,
            congestion
        };
    }

    // 重複排除して時系列ソート（wifiName + timestamp で重複判定）
    dedupeAndSortMeasurements(measurements) {
        const sorted = [...measurements].sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
        const map = new Map();
        sorted.forEach((d) => {
            if (!d || !d.wifiName || !d.timestamp) return;
            const key = `${d.wifiName}::${d.timestamp}`;
            map.set(key, d);
        });
        return Array.from(map.values()).sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
    }

    // データをクリア
    clearData() {
        if (!this.currentWifi) {
            alert('WiFiを選択してください。');
            return;
        }

        if (confirm(`「${this.currentWifi}」のすべてのデータを削除しますか？`)) {
            // 現在のWiFiのデータのみ削除
            this.data = this.data.filter(d => d.wifiName !== this.currentWifi);
            this.saveData();
            this.updateDisplay();
        }
    }
}

// アプリケーション起動
const monitor = new WiFiMonitor();
