// エントリーポイント（分割モジュールの起動だけを担当）
(() => {
  const Monitor = window.WifiMonitorLib?.Monitor;
  if (!Monitor?.WiFiMonitor) {
    // 読み込み順が崩れている場合に気づけるようにする
    alert('初期化に失敗しました（スクリプトの読み込み順を確認してください）。');
            return;
        }
  new Monitor.WiFiMonitor();
})();
