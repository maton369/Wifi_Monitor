(() => {
  const Lib = (window.WifiMonitorLib = window.WifiMonitorLib || {});
  const Metrics = Lib.Metrics;
  const Analysis = Lib.Analysis;
  const DAYS = Lib.DAYS;

  const $ = (id) => document.getElementById(id);

  function bindEvents(controller) {
    $('startBtn')?.addEventListener('click', () => controller.startMonitoring());
    $('stopBtn')?.addEventListener('click', () => controller.stopMonitoring());
    $('clearBtn')?.addEventListener('click', () => controller.clearData());
    $('addWifiBtn')?.addEventListener('click', () => controller.addWifiNetwork());
    $('wifiSelect')?.addEventListener('change', (e) => controller.selectWifi(e.target.value));

    const autoResumeChk = $('autoResumeChk');
    if (autoResumeChk) {
      autoResumeChk.checked = controller.autoResumeEnabled;
      autoResumeChk.addEventListener('change', (e) => controller.setAutoResumeEnabled(e.target.checked));
    }

    const autoBackupChk = $('autoBackupChk');
    if (autoBackupChk) {
      autoBackupChk.checked = controller.autoBackupEnabled;
      autoBackupChk.addEventListener('change', (e) => controller.setAutoBackupEnabled(e.target.checked));
    }

    const exportBtn = $('exportBtn');
    exportBtn?.addEventListener('click', () => controller.exportAllData());

    const importBtn = $('importBtn');
    const importFileInput = $('importFileInput');
    if (importBtn && importFileInput) {
      importBtn.addEventListener('click', () => importFileInput.click());
      importFileInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        await controller.importDataFromFile(file);
        e.target.value = '';
      });
    }
  }

  function updateWifiSelector(wifiNetworks, currentWifi) {
    const select = $('wifiSelect');
    if (!select) return;
    select.innerHTML = '<option value="">WiFiを選択してください</option>';

    (wifiNetworks ?? []).forEach((wifi) => {
      const option = document.createElement('option');
      option.value = wifi;
      option.textContent = wifi;
      if (wifi === currentWifi) option.selected = true;
      select.appendChild(option);
    });
  }

  function updateWifiNameDisplay(currentWifi, wifiData) {
    const elem = $('currentWifiName');
    if (!elem) return;
    if (currentWifi) {
      elem.textContent = `📡 ${currentWifi} のデータ（測定回数: ${(wifiData ?? []).length}回）`;
      elem.style.display = 'block';
    } else {
      elem.textContent = 'WiFiを選択してください';
      elem.style.display = 'block';
    }
  }

  function setProgressBar(congestion) {
    const bar = $('congestionBar');
    const text = $('congestionText');
    if (!bar) return;

    const pct = Math.max(0, Math.min(100, Number(congestion ?? 0) || 0));
    bar.style.width = `${pct}%`;
    bar.title = Lib.CONGESTION_BAR_TITLE;
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    bar.setAttribute('aria-valuenow', String(Math.round(pct)));
    if (text) {
      text.textContent = `${Math.round(pct)}%`;
      text.title = bar.title;
    }
  }

  function updateCurrentStatus(wifiData) {
    const effectiveTypeEl = $('effectiveType');
    const downlinkEl = $('downlink');
    const rttEl = $('rtt');
    const congestionLabelEl = $('congestion');

    if (!wifiData || wifiData.length === 0) {
      if (effectiveTypeEl) effectiveTypeEl.textContent = '-';
      if (downlinkEl) downlinkEl.textContent = '-';
      if (rttEl) rttEl.textContent = '-';
      if (congestionLabelEl) congestionLabelEl.textContent = '-';
      setProgressBar(0);
      return;
    }

    const latest = wifiData[wifiData.length - 1];
    if (effectiveTypeEl) effectiveTypeEl.textContent = Metrics.formatEffectiveType(latest.effectiveType);
    if (downlinkEl) downlinkEl.textContent = `${Number(latest.downlink).toFixed(1)} Mbps`;
    if (rttEl) rttEl.textContent = `${latest.rtt} ms`;

    const congestion = latest.congestion;
    const level = Metrics.getCongestionLevel(congestion);
    if (congestionLabelEl) congestionLabelEl.textContent = level.label;

    const bar = $('congestionBar');
    if (bar) bar.style.backgroundColor = level.color;
    setProgressBar(congestion);
  }

  function createCell(text, isLabel) {
    const cell = document.createElement('div');
    cell.className = isLabel ? 'heatmap-label' : 'heatmap-cell';
    cell.textContent = text;
    return cell;
  }

  function updateHeatmap(wifiData) {
    const heatmap = $('heatmap');
    if (!heatmap) return;
    heatmap.innerHTML = '';

    const hours = Array.from({ length: 24 }, (_, i) => i);
    heatmap.appendChild(createCell('', true));
    hours.forEach((hour) => heatmap.appendChild(createCell(`${hour}時`, true)));

    DAYS.forEach((day, dayIndex) => {
      heatmap.appendChild(createCell(day, true));
      hours.forEach((hour) => {
        const avg = Analysis.getAverageCongestion(wifiData ?? [], dayIndex, hour);
        const cell = createCell('', false);
        if (avg !== null) {
          const level = Metrics.getCongestionLevel(avg);
          cell.style.backgroundColor = level.color;
          cell.title = `${day}曜日 ${hour}時: ${level.label} (${Math.round(avg)}%)`;
        } else {
          cell.style.backgroundColor = '#e0e0e0';
          cell.title = 'データなし';
        }
        heatmap.appendChild(cell);
      });
    });
  }

  function updateStatistics(wifiData) {
    const statsTable = $('statsTable');
    const recommendations = $('recommendations');
    if (!statsTable || !recommendations) return;

    if (!wifiData || wifiData.length === 0) {
      statsTable.innerHTML = '<tr><td colspan="2">データがありません</td></tr>';
      recommendations.innerHTML = '<p>測定を開始してください</p>';
      return;
    }

    const avgCongestion = wifiData.reduce((sum, d) => sum + d.congestion, 0) / wifiData.length;
    const avgDownlink = wifiData.reduce((sum, d) => sum + d.downlink, 0) / wifiData.length;
    const avgRTT = wifiData.reduce((sum, d) => sum + d.rtt, 0) / wifiData.length;

    const bestTimes = Analysis.findBestTimes(wifiData);
    const worstTimes = Analysis.findWorstTimes(wifiData);

    statsTable.innerHTML = `
      <tr><td>測定回数</td><td>${wifiData.length}回</td></tr>
      <tr><td>平均混雑度</td><td>${Math.round(avgCongestion)}% (${Metrics.getCongestionLevel(avgCongestion).label})</td></tr>
      <tr><td>平均速度</td><td>${avgDownlink.toFixed(2)} Mbps</td></tr>
      <tr><td>平均遅延</td><td>${Math.round(avgRTT)} ms</td></tr>
      <tr><td>最速記録</td><td>${Math.max(...wifiData.map((d) => d.downlink)).toFixed(2)} Mbps</td></tr>
      <tr><td>最低速度</td><td>${Math.min(...wifiData.map((d) => d.downlink)).toFixed(2)} Mbps</td></tr>
    `;

    let recHTML = '';
    if (bestTimes.length > 0) {
      recHTML += '<div class="recommendation">';
      recHTML += '<h3>💡 おすすめの時間帯（快適）</h3><ul>';
      bestTimes.slice(0, 5).forEach((time) => {
        recHTML += `<li>${DAYS[time.day]}曜日 ${time.hour}時頃 - 混雑度: ${Math.round(time.congestion)}%</li>`;
      });
      recHTML += '</ul></div>';
    }

    if (worstTimes.length > 0) {
      recHTML += '<div class="recommendation warning">';
      recHTML += '<h3>⚠️ 避けるべき時間帯（混雑）</h3><ul>';
      worstTimes.slice(0, 5).forEach((time) => {
        recHTML += `<li>${DAYS[time.day]}曜日 ${time.hour}時頃 - 混雑度: ${Math.round(time.congestion)}%</li>`;
      });
      recHTML += '</ul></div>';
    }

    recommendations.innerHTML = recHTML || '<p>データを蓄積中...</p>';
  }

  function updateHistory(wifiData) {
    const historyTable = $('historyTable');
    if (!historyTable) return;

    if (!wifiData || wifiData.length === 0) {
      historyTable.innerHTML = '<tr><td colspan="6">データがありません</td></tr>';
      return;
    }

    const recent = wifiData.slice(-20).reverse();
    historyTable.innerHTML = recent
      .map((d) => {
        const date = new Date(d.timestamp);
        const level = Metrics.getCongestionLevel(d.congestion);
        return `
          <tr>
            <td>${date.toLocaleString('ja-JP')}</td>
            <td>${d.wifiName}</td>
            <td>${DAYS[d.dayOfWeek]}</td>
            <td>${d.downlink.toFixed(1)} Mbps</td>
            <td>${d.rtt} ms</td>
            <td style="color: ${level.color}; font-weight: bold;">${level.label}</td>
          </tr>
        `;
      })
      .join('');
  }

  function updateConnectionStatus() {
    const elem = $('connectionStatus');
    if (!elem) return;
    const online = navigator.onLine !== false;
    const type = navigator.connection && typeof navigator.connection.type === 'string' ? navigator.connection.type : null;
    const typeLabel = type ? ` / 接続: ${type === 'wifi' ? 'WiFi' : type}` : '';
    elem.textContent = `オンライン状態: ${online ? 'オンライン' : 'オフライン（復帰待ち）'}${typeLabel}`;
  }

  function updateStartButton(isMonitoring) {
    const startBtn = $('startBtn');
    if (!startBtn) return;
    startBtn.textContent = isMonitoring ? '測定中...' : '測定開始';
    startBtn.disabled = !!isMonitoring;
  }

  function renderAll({ wifiNetworks, currentWifi, wifiData, isMonitoring }) {
    updateWifiSelector(wifiNetworks, currentWifi);
    updateWifiNameDisplay(currentWifi, wifiData);
    updateCurrentStatus(wifiData);
    updateHeatmap(wifiData);
    updateStatistics(wifiData);
    updateHistory(wifiData);
    updateConnectionStatus();
    updateStartButton(isMonitoring);
  }

  Lib.UI = {
    bindEvents,
    renderAll,
    updateWifiSelector,
    updateConnectionStatus,
    updateStartButton
  };
})();


