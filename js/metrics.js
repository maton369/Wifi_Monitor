(() => {
  const Lib = (window.WifiMonitorLib = window.WifiMonitorLib || {});

  function calculateCongestion(downlink, rtt) {
    // downlink: 高いほど良い（通常0-10 Mbps）
    // rtt: 低いほど良い（通常50-500 ms）
    let score = 0;

    // 速度スコア（50点満点）
    if (downlink >= 5) score += 50;
    else if (downlink >= 2) score += 30;
    else if (downlink >= 1) score += 15;
    else score += 5;

    // RTTスコア（50点満点）
    if (rtt <= 100) score += 50;
    else if (rtt <= 200) score += 30;
    else if (rtt <= 400) score += 15;
    else score += 5;

    // 100点満点を混雑度に変換（高いほど混雑）
    return 100 - score;
  }

  function getCongestionLevel(score) {
    if (score <= 20) return { label: '快適', color: '#4caf50' };
    if (score <= 40) return { label: '良好', color: '#8bc34a' };
    if (score <= 60) return { label: '普通', color: '#ffeb3b' };
    if (score <= 80) return { label: 'やや混雑', color: '#ff9800' };
    return { label: '混雑', color: '#f44336' };
  }

  function formatEffectiveType(type) {
    const t = String(type ?? '').trim();
    if (/^[234]g$/.test(t)) return t.toUpperCase(); // 2g/3g/4g -> 2G/3G/4G
    return t || '-';
  }

  function normalizeMeasurement(raw) {
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

    let congestion = typeof raw.congestion === 'number' ? raw.congestion : calculateCongestion(downlink, rtt);
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

  function dedupeAndSortMeasurements(measurements) {
    const sorted = [...measurements].sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
    const map = new Map();
    sorted.forEach((d) => {
      if (!d || !d.wifiName || !d.timestamp) return;
      const key = `${d.wifiName}::${d.timestamp}`;
      map.set(key, d);
    });
    return Array.from(map.values()).sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  }

  Lib.Metrics = {
    calculateCongestion,
    getCongestionLevel,
    formatEffectiveType,
    normalizeMeasurement,
    dedupeAndSortMeasurements
  };
})();


