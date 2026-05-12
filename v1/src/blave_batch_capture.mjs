import fs from "node:fs/promises";
import path from "node:path";
import {
  createCaptureSession,
  getArg,
  saveFullPageScreenshot,
  stabilize,
  waitForUserReady,
  writePageUrl,
  writeSummary,
  hasFlag,
  readCommonOptions,
  launchContext,
  gotoUrl,
  checkBlaveLoginStatus,
  waitForEnter,
  ensureDir,
  formatTaipeiTimestamp
} from "./capture_shared.mjs";

function isBlaveTopTraderPositionUrl(url) {
  return /blave\.org\/studio\/(zh|en|cn)\/charts\/blave_top_trader\/position/i.test(url);
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

function parseNumber(value) {
  if (value == null) return null;
  const s = String(value).replace(/[,\s$]/g, "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function captureBlaveTopTraderPosition(page, outDir) {
  const apiUrl = "https://api.blave.org/studio/charts/blave_top_trader/position";

  let direct = await page
    .evaluate(async (url) => {
      try {
        const res = await fetch(url, { method: "GET", credentials: "include" });
        const text = await res.text().catch(() => "");
        return { ok: true, status: res.status, url: res.url, text };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
      }
    }, apiUrl)
    .catch(() => null);

  if (!direct || !direct.ok) {
    const response = await page
      .waitForResponse((r) => r.url().startsWith(apiUrl), { timeout: 45000 })
      .catch(() => null);

    if (!response) {
      await writeJson(path.join(outDir, "blave_top_trader_position_capture.json"), {
        ok: false,
        reason: "api_unavailable",
        apiUrl,
        direct
      });
      return { ok: false, reason: "api_unavailable" };
    }

    const status = response.status();
    const text = await response.text().catch(() => "");
    const url = response.url();
    direct = { ok: true, status, url, text };
  }

  const status = direct.status;
  const text = direct.text ?? "";
  const url = direct.url ?? apiUrl;
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  await writeJson(path.join(outDir, "blave_top_trader_position_raw.json"), {
    status,
    url,
    body: json ?? text
  });

  const errorCode = json?.error_code ?? json?.errorCode ?? json?.error ?? null;
  const hasData = !!json?.data;
  if (!hasData) {
    return { ok: false, reason: "no_data", errorCode: errorCode ?? null };
  }

  const longList = Array.isArray(json.data.long) ? json.data.long : [];
  const shortList = Array.isArray(json.data.short) ? json.data.short : [];

  const normalizeItem = (item) => ({
    token: item?.token ?? null,
    tokenId: item?.token_id ?? null,
    price: parseNumber(item?.price),
    entry: parseNumber(item?.entry),
    position: parseNumber(item?.position)
  });

  const normalized = {
    ok: true,
    capturedAtUrl: page.url(),
    long: longList.map(normalizeItem),
    short: shortList.map(normalizeItem)
  };

  await writeJson(path.join(outDir, "blave_top_trader_position_parsed.json"), normalized);

  const top5Long = [...normalized.long]
    .filter((x) => x.token)
    .sort((a, b) => (b.position ?? -Infinity) - (a.position ?? -Infinity))
    .slice(0, 5);

  const top5Short = [...normalized.short]
    .filter((x) => x.token)
    .sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity))
    .slice(0, 5);

  await writeJson(path.join(outDir, "blave_top_trader_position_top5.json"), {
    ok: true,
    top5Long,
    top5Short
  });

  return { ok: true, top5LongCount: top5Long.length, top5ShortCount: top5Short.length };
}

async function captureBlaveOverview(page, outDir, { apiUrl, outBaseName }) {
  let direct = await page
    .evaluate(async (url) => {
      try {
        const res = await fetch(url, { method: "GET", credentials: "include" });
        const text = await res.text().catch(() => "");
        return { ok: true, status: res.status, url: res.url, text };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
      }
    }, apiUrl)
    .catch(() => null);

  if (!direct || !direct.ok) {
    const response = await page
      .waitForResponse((r) => r.url().startsWith(apiUrl), { timeout: 45000 })
      .catch(() => null);

    if (!response) {
      await writeJson(path.join(outDir, `${outBaseName}_capture.json`), {
        ok: false,
        reason: "api_unavailable",
        apiUrl,
        direct
      });
      return { ok: false, reason: "api_unavailable" };
    }

    const status = response.status();
    const text = await response.text().catch(() => "");
    const url = response.url();
    direct = { ok: true, status, url, text };
  }

  const status = direct.status;
  const text = direct.text ?? "";
  const url = direct.url ?? apiUrl;
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  await writeJson(path.join(outDir, `${outBaseName}_raw.json`), {
    status,
    url,
    body: json ?? text
  });

  const symbols = Array.isArray(json?.symbols) ? json.symbols : null;
  if (!symbols) {
    const errorCode = json?.error_code ?? json?.errorCode ?? json?.error ?? null;
    return { ok: false, reason: "no_symbols", errorCode: errorCode ?? null };
  }

  const normalizedSymbols = symbols.map((item) => ({
    token: item?.token ?? null,
    tokenId: parseNumber(item?.token_id),
    price: parseNumber(item?.price),
    pctChange: parseNumber(item?.pct_change),
    chg24h: parseNumber(item?.chg_24h),
    alpha: parseNumber(item?.alpha)
  }));

  const normalized = {
    ok: true,
    capturedAtUrl: page.url(),
    overallAlpha: parseNumber(json?.overall_alpha),
    overallScore: parseNumber(json?.overall_score),
    symbols: normalizedSymbols
  };

  await writeJson(path.join(outDir, `${outBaseName}_parsed.json`), normalized);

  const top10 = [...normalizedSymbols]
    .filter((x) => x.token && Number.isFinite(x.alpha))
    .sort((a, b) => Math.abs(b.alpha) - Math.abs(a.alpha))
    .slice(0, 10);

  await writeJson(path.join(outDir, `${outBaseName}_top10.json`), {
    ok: true,
    top10
  });

  return { ok: true, symbolCount: normalizedSymbols.length, top10Count: top10.length };
}

const TASK_REGISTRY = {
  "blave:economic_calendar": {
    platform: "blave",
    name: "經濟行事曆",
    defaultUrl: "https://blave.org/studio/zh/charts/economic_calendar",
    outDirPrefix: "blave_economic_calendar",
    capture: async (page, outDir) => {
      await writeJson(path.join(outDir, "task_result.json"), { ok: true, note: "no_api_available" });
      return { ok: true };
    }
  },
  "blave:holder_concentration:overview": {
    platform: "blave",
    name: "籌碼集中度-總覽",
    defaultUrl: "https://blave.org/studio/zh/charts/holder_concentration/overview",
    outDirPrefix: "blave_holder_concentration_overview",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/holder_concentration/overview",
      outBaseName: "blave_holder_concentration_overview"
    })
  },
  "blave:holder_concentration:change": {
    platform: "blave",
    name: "籌碼集中度-變化",
    defaultUrl: "https://blave.org/studio/zh/charts/holder_concentration/change",
    outDirPrefix: "blave_holder_concentration_change",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/holder_concentration/change",
      outBaseName: "blave_holder_concentration_change"
    })
  },
  "blave:holder_concentration:sectors": {
    platform: "blave",
    name: "籌碼集中度-板塊",
    defaultUrl: "https://blave.org/studio/zh/charts/holder_concentration/sectors",
    outDirPrefix: "blave_holder_concentration_sectors",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/holder_concentration/sectors",
      outBaseName: "blave_holder_concentration_sectors"
    })
  },
  "blave:holder_concentration:history": {
    platform: "blave",
    name: "籌碼集中度-歷史",
    defaultUrl: "https://blave.org/studio/zh/charts/holder_concentration/history",
    outDirPrefix: "blave_holder_concentration_history",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/holder_concentration/history",
      outBaseName: "blave_holder_concentration_history"
    })
  },
  "blave:toptrader:exposure": {
    platform: "blave",
    name: "Blave頂尖交易員-曝險",
    defaultUrl: "https://blave.org/studio/zh/charts/blave_top_trader/exposure",
    outDirPrefix: "blave_top_trader_exposure",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/blave_top_trader/exposure",
      outBaseName: "blave_top_trader_exposure"
    })
  },
  "blave:toptrader:position": {
    platform: "blave",
    name: "Blave頂尖交易員-部位",
    defaultUrl: "https://blave.org/studio/zh/charts/blave_top_trader/position",
    outDirPrefix: "blave_top_trader_position",
    capture: async (page, outDir) => captureBlaveTopTraderPosition(page, outDir)
  },
  "blave:toptrader:watchlist": {
    platform: "blave",
    name: "Blave頂尖交易員-觀察清單",
    defaultUrl: "https://blave.org/studio/zh/charts/blave_top_trader/watchlist",
    outDirPrefix: "blave_top_trader_watchlist",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/blave_top_trader/watchlist",
      outBaseName: "blave_top_trader_watchlist"
    })
  },
  "blave:whale_hunter:scatter": {
    platform: "blave",
    name: "巨鯨警報-分佈",
    defaultUrl: "https://blave.org/studio/zh/charts/whale_hunter/scatter",
    outDirPrefix: "blave_whale_hunter_scatter",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/whale_hunter/scatter",
      outBaseName: "blave_whale_hunter_scatter"
    })
  },
  "blave:whale_hunter:overview": {
    platform: "blave",
    name: "巨鯨警報-總覽",
    defaultUrl: "https://blave.org/studio/zh/charts/whale_hunter/overview",
    outDirPrefix: "blave_whale_hunter_overview",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/whale_hunter/overview",
      outBaseName: "blave_whale_hunter_overview"
    })
  },
  "blave:whale_hunter:history": {
    platform: "blave",
    name: "巨鯨警報-歷史",
    defaultUrl: "https://blave.org/studio/zh/charts/whale_hunter/history",
    outDirPrefix: "blave_whale_hunter_history",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/whale_hunter/history",
      outBaseName: "blave_whale_hunter_history"
    })
  },
  "blave:liquidation:overview": {
    platform: "blave",
    name: "爆倉-總覽",
    defaultUrl: "https://blave.org/studio/zh/charts/liquidation/overview",
    outDirPrefix: "blave_liquidation_overview",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/liquidation/overview",
      outBaseName: "blave_liquidation_overview"
    })
  },
  "blave:liquidation:history": {
    platform: "blave",
    name: "爆倉-歷史",
    defaultUrl: "https://blave.org/studio/zh/charts/liquidation/history",
    outDirPrefix: "blave_liquidation_history",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/liquidation/history",
      outBaseName: "blave_liquidation_history"
    })
  },
  "blave:liquidation:map": {
    platform: "blave",
    name: "爆倉-地圖",
    defaultUrl: "https://blave.org/studio/zh/charts/liquidation/map",
    outDirPrefix: "blave_liquidation_map",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/liquidation/map",
      outBaseName: "blave_liquidation_map"
    })
  },
  "blave:liquidation:map_change": {
    platform: "blave",
    name: "爆倉-地圖變化",
    defaultUrl: "https://blave.org/studio/zh/charts/liquidation/map_change",
    outDirPrefix: "blave_liquidation_map_change",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/liquidation/map_change",
      outBaseName: "blave_liquidation_map_change"
    })
  },
  "blave:taker_intensity:overview": {
    platform: "blave",
    name: "多空力道-總覽",
    defaultUrl: "https://blave.org/studio/zh/charts/taker_intensity/overview",
    outDirPrefix: "blave_taker_intensity_overview",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/taker_intensity/overview",
      outBaseName: "blave_taker_intensity_overview"
    })
  },
  "blave:taker_intensity:history": {
    platform: "blave",
    name: "多空力道-歷史",
    defaultUrl: "https://blave.org/studio/zh/charts/taker_intensity/history",
    outDirPrefix: "blave_taker_intensity_history",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/taker_intensity/history",
      outBaseName: "blave_taker_intensity_history"
    })
  },
  "blave:funding_rate:overview": {
    platform: "blave",
    name: "資金費率-總覽",
    defaultUrl: "https://blave.org/studio/zh/charts/funding_rate/overview",
    outDirPrefix: "blave_funding_rate_overview",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/funding_rate/overview",
      outBaseName: "blave_funding_rate_overview"
    })
  },
  "blave:funding_rate:history": {
    platform: "blave",
    name: "資金費率-歷史",
    defaultUrl: "https://blave.org/studio/zh/charts/funding_rate/history",
    outDirPrefix: "blave_funding_rate_history",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/funding_rate/history",
      outBaseName: "blave_funding_rate_history"
    })
  },
  "blave:oi_imbalance:overview": {
    platform: "blave",
    name: "OI失衡-總覽",
    defaultUrl: "https://blave.org/studio/zh/charts/oi_imbalance/overview",
    outDirPrefix: "blave_oi_imbalance_overview",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/oi_imbalance/overview",
      outBaseName: "blave_oi_imbalance_overview"
    })
  },
  "blave:unusual_movement:overview": {
    platform: "blave",
    name: "異常漲跌-總覽",
    defaultUrl: "https://blave.org/studio/zh/charts/unusual_movement/overview",
    outDirPrefix: "blave_unusual_movement_overview",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/unusual_movement/overview",
      outBaseName: "blave_unusual_movement_overview"
    })
  },
  "blave:unusual_movement:history": {
    platform: "blave",
    name: "異常漲跌-歷史",
    defaultUrl: "https://blave.org/studio/zh/charts/unusual_movement/history",
    outDirPrefix: "blave_unusual_movement_history",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/unusual_movement/history",
      outBaseName: "blave_unusual_movement_history"
    })
  },
  "blave:main_alt:history": {
    platform: "blave",
    name: "主流/山寨-歷史",
    defaultUrl: "https://blave.org/studio/zh/charts/main_alt/history",
    outDirPrefix: "blave_main_alt_history",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/main_alt/history",
      outBaseName: "blave_main_alt_history"
    })
  },
  "blave:squeeze_momentum:history": {
    platform: "blave",
    name: "擠壓動能-歷史",
    defaultUrl: "https://blave.org/studio/zh/charts/squeeze_momentum/history",
    outDirPrefix: "blave_squeeze_momentum_history",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/squeeze_momentum/history",
      outBaseName: "blave_squeeze_momentum_history"
    })
  },
  "blave:market_sentiment:overview": {
    platform: "blave",
    name: "市場情緒-總覽",
    defaultUrl: "https://blave.org/studio/zh/charts/market_sentiment/overview",
    outDirPrefix: "blave_market_sentiment_overview",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/market_sentiment/overview",
      outBaseName: "blave_market_sentiment_overview"
    })
  },
  "blave:market_sentiment:sectors": {
    platform: "blave",
    name: "市場情緒-板塊",
    defaultUrl: "https://blave.org/studio/zh/charts/market_sentiment/sectors",
    outDirPrefix: "blave_market_sentiment_sectors",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/market_sentiment/sectors",
      outBaseName: "blave_market_sentiment_sectors"
    })
  },
  "blave:market_sentiment:history": {
    platform: "blave",
    name: "市場情緒-歷史",
    defaultUrl: "https://blave.org/studio/zh/charts/market_sentiment/history",
    outDirPrefix: "blave_market_sentiment_history",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/market_sentiment/history",
      outBaseName: "blave_market_sentiment_history"
    })
  },
  "blave:capital_shortage:history": {
    platform: "blave",
    name: "資金稀缺-歷史",
    defaultUrl: "https://blave.org/studio/zh/charts/capital_shortage/history",
    outDirPrefix: "blave_capital_shortage_history",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/capital_shortage/history",
      outBaseName: "blave_capital_shortage_history"
    })
  },
  "blave:hyperliquid:leaderboard": {
    platform: "blave",
    name: "Hyperliquid-排行榜",
    defaultUrl: "https://blave.org/studio/zh/charts/hyperliquid/leaderboard",
    outDirPrefix: "blave_hyperliquid_leaderboard",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/hyperliquid/leaderboard",
      outBaseName: "blave_hyperliquid_leaderboard"
    })
  },
  "blave:hyperliquid:trader_position": {
    platform: "blave",
    name: "Hyperliquid-交易員投資組合",
    defaultUrl: "https://blave.org/studio/zh/charts/hyperliquid/trader_position",
    outDirPrefix: "blave_hyperliquid_trader_position",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/hyperliquid/trader_position",
      outBaseName: "blave_hyperliquid_trader_position"
    })
  },
  "blave:hyperliquid:trader_cohort": {
    platform: "blave",
    name: "Hyperliquid-分群部位",
    defaultUrl: "https://blave.org/studio/zh/charts/hyperliquid/trader_cohort",
    outDirPrefix: "blave_hyperliquid_trader_cohort",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/hyperliquid/trader_cohort",
      outBaseName: "blave_hyperliquid_trader_cohort"
    })
  },
  "blave:hyperliquid:top_traders:exposure": {
    platform: "blave",
    name: "Hyperliquid-頂尖曝險",
    defaultUrl: "https://blave.org/studio/zh/charts/hyperliquid/top_traders/exposure",
    outDirPrefix: "blave_hyperliquid_top_traders_exposure",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/hyperliquid/top_traders/exposure",
      outBaseName: "blave_hyperliquid_top_traders_exposure"
    })
  },
  "blave:hyperliquid:top_traders:position": {
    platform: "blave",
    name: "Hyperliquid-頂尖部位",
    defaultUrl: "https://blave.org/studio/zh/charts/hyperliquid/top_traders/position",
    outDirPrefix: "blave_hyperliquid_top_traders_position",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/hyperliquid/top_traders/position",
      outBaseName: "blave_hyperliquid_top_traders_position"
    })
  },
  "blave:sector_rotation:overview": {
    platform: "blave",
    name: "板塊輪動-總覽",
    defaultUrl: "https://blave.org/studio/zh/charts/sector_rotation/overview",
    outDirPrefix: "blave_sector_rotation_overview",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/sector_rotation/overview",
      outBaseName: "blave_sector_rotation_overview"
    })
  },
  "blave:sector_rotation:symbols": {
    platform: "blave",
    name: "板塊輪動-板塊",
    defaultUrl: "https://blave.org/studio/zh/charts/sector_rotation/symbols",
    outDirPrefix: "blave_sector_rotation_symbols",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/sector_rotation/symbols",
      outBaseName: "blave_sector_rotation_symbols"
    })
  },
  "blave:sector_rotation:history": {
    platform: "blave",
    name: "板塊輪動-歷史",
    defaultUrl: "https://blave.org/studio/zh/charts/sector_rotation/history",
    outDirPrefix: "blave_sector_rotation_history",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/sector_rotation/history",
      outBaseName: "blave_sector_rotation_history"
    })
  },
  "blave:gtrade:holder_concentration": {
    platform: "blave",
    name: "gTrade-籌碼集中度",
    defaultUrl: "https://blave.org/studio/zh/charts/gtrade/holder_concentration",
    outDirPrefix: "blave_gtrade_holder_concentration",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/gtrade/holder_concentration",
      outBaseName: "blave_gtrade_holder_concentration"
    })
  },
  "blave:gtrade:top_trader_portfolio": {
    platform: "blave",
    name: "gTrade-頂尖交易員",
    defaultUrl: "https://blave.org/studio/zh/charts/gtrade/top_trader_portfolio",
    outDirPrefix: "blave_gtrade_top_trader_portfolio",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/gtrade/top_trader_portfolio",
      outBaseName: "blave_gtrade_top_trader_portfolio"
    })
  },
  "blave:gtrade:whale_hunter": {
    platform: "blave",
    name: "gTrade-巨鯨警報",
    defaultUrl: "https://blave.org/studio/zh/charts/gtrade/whale_hunter",
    outDirPrefix: "blave_gtrade_whale_hunter",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/gtrade/whale_hunter",
      outBaseName: "blave_gtrade_whale_hunter"
    })
  }
};

async function main() {
  const outRoot = getArg("outDir", path.resolve("./data/blave"), process.argv);
  const profileDir = getArg("profileDir", path.resolve("./.profile"), process.argv);
  const channel = getArg("channel", process.env.COINCLASS_BROWSER_CHANNEL || "msedge", process.argv);
  const manual = !hasFlag("noManual", process.argv);
  const keepOpen = hasFlag("keepOpen", process.argv);
  const ignoreHttpsErrors = hasFlag("ignoreHttpsErrors", process.argv);
  const waitMsRaw = getArg("waitMs", "60000", process.argv);
  const waitMsParsed = Number.parseInt(waitMsRaw, 10);
  const waitMs = Number.isFinite(waitMsParsed) ? waitMsParsed : 60000;

  const tasks = [
    "blave:economic_calendar",
    "blave:holder_concentration:overview",
    "blave:holder_concentration:change",
    "blave:holder_concentration:sectors",
    "blave:toptrader:exposure",
    "blave:toptrader:position",
    "blave:toptrader:watchlist",
    "blave:whale_hunter:scatter",
    "blave:whale_hunter:overview",
    "blave:liquidation:overview",
    "blave:liquidation:map",
    "blave:liquidation:map_change",
    "blave:taker_intensity:overview",
    "blave:funding_rate:overview",
    "blave:oi_imbalance:overview",
    "blave:unusual_movement:overview",
    "blave:market_sentiment:overview",
    "blave:market_sentiment:sectors",
    "blave:hyperliquid:leaderboard",
    "blave:hyperliquid:trader_position",
    "blave:hyperliquid:trader_cohort",
    "blave:hyperliquid:top_traders:exposure",
    "blave:hyperliquid:top_traders:position",
    "blave:sector_rotation:overview",
    "blave:sector_rotation:symbols",
    "blave:gtrade:holder_concentration",
    "blave:gtrade:top_trader_portfolio",
    "blave:gtrade:whale_hunter"
  ];

  const stamp = formatTaipeiTimestamp();
  const batchOutDir = path.join(outRoot, `batch_${stamp}`);
  await ensureDir(batchOutDir);
  await ensureDir(profileDir);

  console.log("========================================");
  console.log("Blave Batch Capture System");
  console.log("========================================");
  console.log(`Total tasks: ${tasks.length}`);
  console.log(`Output directory: ${batchOutDir}`);
  console.log("");

  let context = null;
  let mainPage = null;
  const taskResults = [];

  try {
    console.log("========================================");
    console.log("步驟 1：開啟 Blave 並登入");
    console.log("========================================");
    console.log("");
    console.log("💡 請在開啟的瀏覽器中登入 Blave");
    console.log("💡 登入完成後，按 Enter 繼續...");
    console.log("");

    const { context: ctx, page: pg } = await launchContext({
      profileDir,
      channel,
      ignoreHttpsErrors
    });
    context = ctx;
    mainPage = pg;

    await gotoUrl(mainPage, "https://blave.org/");
    await mainPage.waitForTimeout(2000);

    console.log("✅ 已打開 Blave 網站");
    console.log("");
    console.log("👉 請在瀏覽器中手動登入 Blave");
    console.log("👉 登入完成後，按 Enter 繼續...");
    console.log("");
    await waitForEnter("登入完成後按 Enter 繼續...");

    console.log("");
    console.log("✅ 已確認您的操作，繼續執行...");
    console.log("");

    await mainPage.waitForTimeout(2000);

    const loginStatus = await checkBlaveLoginStatus(mainPage);
    if (loginStatus.isLoggedIn || loginStatus.hasAuthCookie) {
      console.log("✅ 已確認 Blave 登入狀態\n");
    } else {
      console.log("⚠️  尚未偵測到登入狀態，但繼續執行...\n");
    }

    console.log("========================================");
    console.log("Step 1: Opening all pages in tabs...");
    console.log("========================================");
    console.log("");

    const pages = [];
    for (let i = 0; i < tasks.length; i++) {
      const taskKey = tasks[i];
      const taskConfig = TASK_REGISTRY[taskKey];
      if (!taskConfig) {
        console.log(`⚠️  Skipping unknown task: ${taskKey}`);
        continue;
      }

      console.log(`[${i + 1}/${tasks.length}] Opening: ${taskConfig.name}`);
      
      let page;
      if (i === 0) {
        page = mainPage;
        await gotoUrl(page, taskConfig.defaultUrl);
      } else {
        page = await context.newPage();
        await gotoUrl(page, taskConfig.defaultUrl);
      }

      pages.push({
        taskKey,
        taskConfig,
        page
      });

      await page.waitForTimeout(1000);
    }

    console.log("");
    console.log("========================================");
    console.log("All pages opened!");
    console.log("========================================");
    console.log("");

    if (manual) {
      console.log("請檢查所有分頁是否載入完成，確認後按 Enter 開始擷取...");
      await waitForEnter("按 Enter 開始擷取...");
    } else {
      console.log(`Waiting ${waitMs / 1000} seconds for pages to load...`);
      await mainPage.waitForTimeout(waitMs);
    }

    console.log("");
    console.log("========================================");
    console.log("🚀 Step 2: Capturing data (HYBRID MODE 🚀)");
    console.log("========================================");
    console.log("⚠️  混合模式：數據並行擷取 + 截圖串行處理");
    console.log("");

    const dataConcurrency = 5;
    let dataCompleted = 0;

    async function captureDataOnly(item, index) {
      const { taskKey, taskConfig, page } = item;
      const taskOutDir = path.join(batchOutDir, `${taskConfig.outDirPrefix}_${stamp}`);
      await ensureDir(taskOutDir);

      let result;
      try {
        await stabilize(page, { extraWaitMs: 1500 });

        const r = await taskConfig.capture(page, taskOutDir);
        await writeJson(path.join(taskOutDir, "task_result.json"), { task: taskKey, ...r });

        const html = await page.content();
        await fs.writeFile(path.join(taskOutDir, "page.html"), html, "utf8");
        await writePageUrl(page, taskOutDir, "page_url.txt");

        const cookies = await context.cookies();
        await fs.writeFile(path.join(taskOutDir, "cookies.json"), JSON.stringify(cookies, null, 2), "utf8");

        const storage = await page.evaluate(() => {
          const ls = Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)]));
          const ss = Object.fromEntries(Object.keys(sessionStorage).map((k) => [k, sessionStorage.getItem(k)]));
          return { localStorage: ls, sessionStorage: ss };
        });
        await fs.writeFile(path.join(taskOutDir, "storage.json"), JSON.stringify(storage, null, 2), "utf8");

        const tables = await page.evaluate(() => {
          const ts = Array.from(document.querySelectorAll("table")).map((t, i) => ({
            index: i,
            text: (t.innerText || "").trim(),
            html: (t.outerHTML || "").slice(0, 200000)
          }));
          return ts.filter((t) => t.text.length > 0);
        });
        await fs.writeFile(path.join(taskOutDir, "tables.json"), JSON.stringify(tables, null, 2), "utf8");

        await writeSummary({
          stamp,
          urlRequested: taskConfig.defaultUrl,
          finalUrl: page.url(),
          outDir: taskOutDir,
          profileDir,
          channel
        });

        result = {
          task: taskKey,
          name: taskConfig.name,
          ok: r.ok,
          outDir: taskOutDir,
          dataCaptured: true
        };

        console.log(`✅ [${index + 1}/${pages.length}] Data captured: ${taskConfig.name}`);
      } catch (err) {
        const message = err instanceof Error ? `${err.name}: ${err.message}\n${err.stack ?? ""}` : String(err);
        console.error(`❌ [${index + 1}/${pages.length}] Data failed: ${taskConfig.name}`);
        console.error(message);
        await fs.writeFile(path.join(taskOutDir, "error.txt"), message, "utf8");
        result = {
          task: taskKey,
          taskConfig,
          name: taskConfig.name,
          ok: false,
          error: message,
          outDir: taskOutDir,
          dataCaptured: false
        };
      }

      dataCompleted++;
      const progress = Math.round((dataCompleted / pages.length) * 100);
      console.log(`📊 Data progress: ${dataCompleted}/${pages.length} (${progress}%)`);

      return { ...item, result };
    }

    async function processDataInParallel(items, concurrencyLimit) {
      const results = [];
      const executing = [];
      let index = 0;

      while (index < items.length || executing.length > 0) {
        while (index < items.length && executing.length < concurrencyLimit) {
          const item = items[index];
          console.log(`🚀 [${index + 1}/${pages.length}] Starting data capture: ${item.taskConfig.name}`);
          const promise = captureDataOnly(item, index).then((result) => {
            results[index] = result;
            const idx = executing.indexOf(promise);
            if (idx > -1) executing.splice(idx, 1);
          });
          executing.push(promise);
          index++;
        }

        if (executing.length > 0) {
          await Promise.race(executing);
        }
      }

      return results;
    }

    console.log("--- Phase 1: Parallel data capture ---");
    const dataResults = await processDataInParallel(pages, dataConcurrency);

    console.log("");
    console.log("========================================");
    console.log("Step 3: Taking screenshots (serial)...");
    console.log("========================================");
    console.log("");

    for (let i = 0; i < pages.length; i++) {
      const pageItem = pages[i];
      const dataResult = dataResults[i];
      
      if (!dataResult || !dataResult.result) {
        console.log(`⏭️  [${i + 1}/${pages.length}] Skipping screenshot (no data): ${pageItem.taskConfig.name}`);
        continue;
      }

      const { taskConfig, page } = pageItem;
      const { result } = dataResult;

      if (!result.dataCaptured) {
        console.log(`⏭️  [${i + 1}/${pages.length}] Skipping screenshot (data failed): ${taskConfig.name}`);
        continue;
      }

      console.log(`📸 [${i + 1}/${pages.length}] Taking screenshot: ${taskConfig.name}`);
      try {
        await saveFullPageScreenshot(page, result.outDir, "page_full.png");
        console.log(`✅ [${i + 1}/${pages.length}] Screenshot done: ${taskConfig.name}`);
      } catch (err) {
        console.warn(`⚠️  [${i + 1}/${pages.length}] Screenshot failed: ${taskConfig.name}`);
      }

      taskResults.push(result);
    }

    console.log("");
    console.log("Closing all pages...");
    for (let i = 1; i < pages.length; i++) {
      const { page, taskConfig } = pages[i];
      try {
        await page.close();
        console.log(`🔄 Closed page for: ${taskConfig.name}`);
      } catch (closeErr) {
        console.warn(`⚠️  Failed to close page: ${closeErr instanceof Error ? closeErr.message : String(closeErr)}`);
      }
    }

    await writeJson(path.join(batchOutDir, "batch_summary.json"), {
      stamp,
      totalTasks: tasks.length,
      completedTasks: taskResults.filter(r => r.ok).length,
      failedTasks: taskResults.filter(r => !r.ok).length,
      results: taskResults
    });

    const successCount = taskResults.filter(r => r.ok).length;
    const failedCount = taskResults.filter(r => !r.ok).length;

    console.log("");
    console.log("╔════════════════════════════════════════════════════════════╗");
    console.log("║                    ✅ Blave 批次抓取完成！                      ║");
    console.log("╚════════════════════════════════════════════════════════════╝");
    console.log("");
    console.log("📊 抓取統計：");
    console.log(`   總任務數：${tasks.length}`);
    console.log(`   成功：${successCount}`);
    console.log(`   失敗：${failedCount}`);
    console.log("");
    console.log("📁 輸出目錄：");
    console.log(`   ${batchOutDir}`);
    console.log("");
    console.log("🚀 下一步：");
    console.log("   1. 使用終極SMC版提示詞進行分析");
    console.log("   2. 或查看 data/blave/ 目錄下的抓取結果");
    console.log("");
    console.log("════════════════════════════════════════════════════════════");
    console.log("");

    if (!keepOpen) {
      await context.close();
    }
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}\n${err.stack ?? ""}` : String(err);
    console.error("");
    console.error("╔════════════════════════════════════════════════════════════╗");
    console.error("║                    ❌ Blave 批次抓取失敗！                      ║");
    console.error("╚════════════════════════════════════════════════════════════╝");
    console.error("");
    console.error("錯誤訊息：");
    console.error(message);
    console.error("");
    console.error("📁 錯誤日誌已保存至：");
    console.error(`   ${batchOutDir}\\batch_error.txt`);
    console.error("");
    console.error("════════════════════════════════════════════════════════════");
    console.error("");
    process.exitCode = 1;
    try {
      await fs.writeFile(path.join(batchOutDir, "batch_error.txt"), message, "utf8");
    } catch {}
    try {
      if (!keepOpen && context) {
        await context.close();
      }
    } catch {}
  }
}

await main();
