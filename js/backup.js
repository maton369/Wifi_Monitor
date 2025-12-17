(() => {
  const Lib = (window.WifiMonitorLib = window.WifiMonitorLib || {});
  const Metrics = Lib.Metrics;

  function sanitizeFilename(name) {
    return (
      String(name)
        .replace(/[\/\\?%*:|"<>]/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 80) || 'wifi'
    );
  }

  function downloadJson(payload, baseName) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(
      now.getMinutes()
    )}${pad(now.getSeconds())}`;
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

  function exportAll({ data, wifiNetworks, currentWifi }) {
    const payload = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      wifiNetworks: wifiNetworks ?? [],
      currentWifi: currentWifi ?? null,
      data: data ?? []
    };
    downloadJson(payload, `wifi-monitor-backup`);
  }

  function exportWifi({ data }, wifiName, reason = 'manual') {
    const wifi = String(wifiName || '').trim();
    if (!wifi) return;
    const wifiData = (data ?? []).filter((d) => d && d.wifiName === wifi);
    const payload = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      reason,
      wifiName: wifi,
      data: wifiData
    };
    downloadJson(payload, `wifi-monitor-${sanitizeFilename(wifi)}-${reason}`);
  }

  async function importFromFile(file, { existingData, existingNetworks, currentWifi }) {
    if (!file) return null;

    let text;
    try {
      text = await file.text();
    } catch {
      throw new Error('file_read_failed');
    }

    let imported;
    try {
      imported = JSON.parse(text);
    } catch {
      throw new Error('json_invalid');
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
      throw new Error('format_invalid');
    }

    const normalized = importedData.map((d) => Metrics.normalizeMeasurement(d)).filter(Boolean);
    if (normalized.length === 0) return { importedCount: 0 };

    const shouldMerge = confirm(
      `「${file.name}」を読み込みます。\n\n既存データに追加（マージ）しますか？\nOK: 追加（マージ）\nキャンセル: 置き換え`
    );

    const combined = shouldMerge ? [...(existingData ?? []), ...normalized] : [...normalized];
    const deduped = Metrics.dedupeAndSortMeasurements(combined);

    const nextData = deduped.length > 1000 ? deduped.slice(-1000) : deduped;

    const fromData = Array.from(new Set(normalized.map((d) => d.wifiName)));
    const mergedNetworks = new Set(
      [...(existingNetworks ?? []), ...(importedNetworks ?? []), ...fromData].map((w) => String(w).trim()).filter(Boolean)
    );
    const nextNetworks = Array.from(mergedNetworks);

    let nextCurrentWifi = currentWifi ?? null;
    if (!nextCurrentWifi && importedCurrentWifi && nextNetworks.includes(importedCurrentWifi)) {
      nextCurrentWifi = importedCurrentWifi;
    }

    return {
      importedCount: normalized.length,
      data: nextData,
      wifiNetworks: nextNetworks,
      currentWifi: nextCurrentWifi
    };
  }

  Lib.Backup = {
    sanitizeFilename,
    downloadJson,
    exportAll,
    exportWifi,
    importFromFile
  };
})();


