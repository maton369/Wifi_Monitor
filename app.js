// WiFi混雑度モニターアプリケーション

class WiFiMonitor {
    constructor() {
        this.data = [];
        this.wifiNetworks = [];
        this.currentWifi = null;
        this.isMonitoring = false;
        this.monitorInterval = null;
        this.loadData();
        this.loadWifiNetworks();
        this.initUI();
        this.updateDisplay();
    }

    // ローカルストレージからデータを読み込み
    loadData() {
        const saved = localStorage.getItem('wifiMonitorData');
        if (saved) {
            this.data = JSON.parse(saved);
        }
    }

    // WiFiネットワークリストを読み込み
    loadWifiNetworks() {
        const saved = localStorage.getItem('wifiNetworks');
        if (saved) {
            this.wifiNetworks = JSON.parse(saved);
        }

        // 最後に選択していたWiFiを復元
        const lastWifi = localStorage.getItem('currentWifi');
        if (lastWifi && this.wifiNetworks.includes(lastWifi)) {
            this.currentWifi = lastWifi;
        }
    }

    // ローカルストレージにデータを保存
    saveData() {
        localStorage.setItem('wifiMonitorData', JSON.stringify(this.data));
    }

    // WiFiネットワークリストを保存
    saveWifiNetworks() {
        localStorage.setItem('wifiNetworks', JSON.stringify(this.wifiNetworks));
        if (this.currentWifi) {
            localStorage.setItem('currentWifi', this.currentWifi);
        }
    }

    // UI初期化
    initUI() {
        document.getElementById('startBtn').addEventListener('click', () => this.startMonitoring());
        document.getElementById('stopBtn').addEventListener('click', () => this.stopMonitoring());
        document.getElementById('clearBtn').addEventListener('click', () => this.clearData());
        document.getElementById('addWifiBtn').addEventListener('click', () => this.addWifiNetwork());
        document.getElementById('wifiSelect').addEventListener('change', (e) => this.selectWifi(e.target.value));

        this.updateWifiSelector();
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
        if (!wifiName) {
            this.currentWifi = null;
        } else {
            this.currentWifi = wifiName;
            localStorage.setItem('currentWifi', wifiName);
        }
        this.updateDisplay();
    }

    // 測定開始
    startMonitoring() {
        if (!this.currentWifi) {
            alert('WiFiを選択または追加してください。');
            return;
        }

        if (this.isMonitoring) return;

        this.isMonitoring = true;
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
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
        }
        document.getElementById('startBtn').textContent = '測定開始';
        document.getElementById('startBtn').disabled = false;
    }

    // 即座に測定
    measureNow() {
        if (!this.currentWifi) {
            alert('WiFiを選択してください。');
            this.stopMonitoring();
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
            bar.textContent = '0%';
            return;
        }

        const latest = wifiData[wifiData.length - 1];

        document.getElementById('effectiveType').textContent = latest.effectiveType;
        document.getElementById('downlink').textContent = latest.downlink.toFixed(1) + ' Mbps';
        document.getElementById('rtt').textContent = latest.rtt + ' ms';

        const congestion = latest.congestion;
        const congestionLevel = this.getCongestionLevel(congestion);
        document.getElementById('congestion').textContent = congestionLevel.label;

        const bar = document.getElementById('congestionBar');
        bar.style.width = congestion + '%';
        bar.style.backgroundColor = congestionLevel.color;
        bar.textContent = Math.round(congestion) + '%';
    }

    // 混雑度レベルを取得
    getCongestionLevel(score) {
        if (score <= 20) return { label: '快適', color: '#4caf50' };
        if (score <= 40) return { label: '良好', color: '#8bc34a' };
        if (score <= 60) return { label: '普通', color: '#ffeb3b' };
        if (score <= 80) return { label: 'やや混雑', color: '#ff9800' };
        return { label: '混雑', color: '#f44336' };
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
