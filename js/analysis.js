(() => {
  const Lib = (window.WifiMonitorLib = window.WifiMonitorLib || {});

  function getAverageCongestion(wifiData, dayOfWeek, hour) {
    const filtered = wifiData.filter((d) => d.dayOfWeek === dayOfWeek && d.hour === hour);
    if (filtered.length === 0) return null;
    const sum = filtered.reduce((acc, d) => acc + d.congestion, 0);
    return sum / filtered.length;
  }

  function findBestTimes(wifiData) {
    const timeSlots = [];
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const avg = getAverageCongestion(wifiData, day, hour);
        if (avg !== null) timeSlots.push({ day, hour, congestion: avg });
      }
    }
    return timeSlots.sort((a, b) => a.congestion - b.congestion);
  }

  function findWorstTimes(wifiData) {
    const timeSlots = [];
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const avg = getAverageCongestion(wifiData, day, hour);
        if (avg !== null) timeSlots.push({ day, hour, congestion: avg });
      }
    }
    return timeSlots.sort((a, b) => b.congestion - a.congestion);
  }

  Lib.Analysis = {
    getAverageCongestion,
    findBestTimes,
    findWorstTimes
  };
})();


