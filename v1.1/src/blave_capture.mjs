import fs from "node:fs/promises";
import path from "node:path";
import {
  createCaptureSession,
  getArg,
  saveFullPageScreenshot,
  stabilize,
  waitForUserReady,
  writePageUrl,
  writeSummary
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

const BLAVE_FEATURE_MAP = [
  { key: "economic_calendar", name: "經濟行事曆", url: "https://blave.org/studio/zh/charts/economic_calendar", api: null },
  {
    key: "holder_concentration/overview",
    name: "籌碼集中度-總覽",
    url: "https://blave.org/studio/zh/charts/holder_concentration/overview",
    api: "https://api.blave.org/studio/charts/holder_concentration/overview"
  },
  {
    key: "holder_concentration/change",
    name: "籌碼集中度-變化",
    url: "https://blave.org/studio/zh/charts/holder_concentration/change",
    api: "https://api.blave.org/studio/charts/holder_concentration/change"
  },
  {
    key: "holder_concentration/sectors",
    name: "籌碼集中度-板塊",
    url: "https://blave.org/studio/zh/charts/holder_concentration/sectors",
    api: "https://api.blave.org/studio/charts/holder_concentration/sectors"
  },
  {
    key: "holder_concentration/history",
    name: "籌碼集中度-歷史",
    url: "https://blave.org/studio/zh/charts/holder_concentration/history",
    api: "https://api.blave.org/studio/charts/holder_concentration/history"
  },
  {
    key: "blave_top_trader/exposure",
    name: "Blave頂尖交易員-曝險",
    url: "https://blave.org/studio/zh/charts/blave_top_trader/exposure",
    api: "https://api.blave.org/studio/charts/blave_top_trader/exposure"
  },
  {
    key: "blave_top_trader/position",
    name: "Blave頂尖交易員-部位",
    url: "https://blave.org/studio/zh/charts/blave_top_trader/position",
    api: "https://api.blave.org/studio/charts/blave_top_trader/position"
  },
  {
    key: "blave_top_trader/watchlist",
    name: "Blave頂尖交易員-觀察清單",
    url: "https://blave.org/studio/zh/charts/blave_top_trader/watchlist",
    api: "https://api.blave.org/studio/charts/blave_top_trader/watchlist"
  },
  {
    key: "whale_hunter/scatter",
    name: "巨鯨警報-分佈",
    url: "https://blave.org/studio/zh/charts/whale_hunter/scatter",
    api: "https://api.blave.org/studio/charts/whale_hunter/scatter"
  },
  {
    key: "whale_hunter/overview",
    name: "巨鯨警報-總覽",
    url: "https://blave.org/studio/zh/charts/whale_hunter/overview",
    api: "https://api.blave.org/studio/charts/whale_hunter/overview"
  },
  {
    key: "whale_hunter/history",
    name: "巨鯨警報-歷史",
    url: "https://blave.org/studio/zh/charts/whale_hunter/history",
    api: "https://api.blave.org/studio/charts/whale_hunter/history"
  },
  {
    key: "liquidation/overview",
    name: "爆倉-總覽",
    url: "https://blave.org/studio/zh/charts/liquidation/overview",
    api: "https://api.blave.org/studio/charts/liquidation/overview"
  },
  {
    key: "liquidation/history",
    name: "爆倉-歷史",
    url: "https://blave.org/studio/zh/charts/liquidation/history",
    api: "https://api.blave.org/studio/charts/liquidation/history"
  },
  {
    key: "liquidation/map",
    name: "爆倉-地圖",
    url: "https://blave.org/studio/zh/charts/liquidation/map",
    api: "https://api.blave.org/studio/charts/liquidation/map"
  },
  {
    key: "liquidation/map_change",
    name: "爆倉-地圖變化",
    url: "https://blave.org/studio/zh/charts/liquidation/map_change",
    api: "https://api.blave.org/studio/charts/liquidation/map_change"
  },
  {
    key: "taker_intensity/overview",
    name: "多空力道-總覽",
    url: "https://blave.org/studio/zh/charts/taker_intensity/overview",
    api: "https://api.blave.org/studio/charts/taker_intensity/overview"
  },
  {
    key: "taker_intensity/history",
    name: "多空力道-歷史",
    url: "https://blave.org/studio/zh/charts/taker_intensity/history",
    api: "https://api.blave.org/studio/charts/taker_intensity/history"
  },
  {
    key: "funding_rate/overview",
    name: "資金費率-總覽",
    url: "https://blave.org/studio/zh/charts/funding_rate/overview",
    api: "https://api.blave.org/studio/charts/funding_rate/overview"
  },
  {
    key: "funding_rate/history",
    name: "資金費率-歷史",
    url: "https://blave.org/studio/zh/charts/funding_rate/history",
    api: "https://api.blave.org/studio/charts/funding_rate/history"
  },
  {
    key: "oi_imbalance/overview",
    name: "OI失衡-總覽",
    url: "https://blave.org/studio/zh/charts/oi_imbalance/overview",
    api: "https://api.blave.org/studio/charts/oi_imbalance/overview"
  },
  {
    key: "unusual_movement/overview",
    name: "異常漲跌-總覽",
    url: "https://blave.org/studio/zh/charts/unusual_movement/overview",
    api: "https://api.blave.org/studio/charts/unusual_movement/overview"
  },
  {
    key: "unusual_movement/history",
    name: "異常漲跌-歷史",
    url: "https://blave.org/studio/zh/charts/unusual_movement/history",
    api: "https://api.blave.org/studio/charts/unusual_movement/history"
  },
  {
    key: "main_alt/history",
    name: "主流/山寨-歷史",
    url: "https://blave.org/studio/zh/charts/main_alt/history",
    api: "https://api.blave.org/studio/charts/main_alt/history"
  },
  {
    key: "squeeze_momentum/history",
    name: "擠壓動能-歷史",
    url: "https://blave.org/studio/zh/charts/squeeze_momentum/history",
    api: "https://api.blave.org/studio/charts/squeeze_momentum/history"
  },
  {
    key: "market_sentiment/overview",
    name: "市場情緒-總覽",
    url: "https://blave.org/studio/zh/charts/market_sentiment/overview",
    api: "https://api.blave.org/studio/charts/market_sentiment/overview"
  },
  {
    key: "market_sentiment/sectors",
    name: "市場情緒-板塊",
    url: "https://blave.org/studio/zh/charts/market_sentiment/sectors",
    api: "https://api.blave.org/studio/charts/market_sentiment/sectors"
  },
  {
    key: "market_sentiment/history",
    name: "市場情緒-歷史",
    url: "https://blave.org/studio/zh/charts/market_sentiment/history",
    api: "https://api.blave.org/studio/charts/market_sentiment/history"
  },
  {
    key: "capital_shortage/history",
    name: "資金稀缺-歷史",
    url: "https://blave.org/studio/zh/charts/capital_shortage/history",
    api: "https://api.blave.org/studio/charts/capital_shortage/history"
  },
  {
    key: "hyperliquid/leaderboard",
    name: "Hyperliquid-排行榜",
    url: "https://blave.org/studio/zh/charts/hyperliquid/leaderboard",
    api: "https://api.blave.org/studio/charts/hyperliquid/leaderboard"
  },
  {
    key: "hyperliquid/trader_position",
    name: "Hyperliquid-交易員投資組合",
    url: "https://blave.org/studio/zh/charts/hyperliquid/trader_position",
    api: "https://api.blave.org/studio/charts/hyperliquid/trader_position"
  },
  {
    key: "hyperliquid/trader_cohort",
    name: "Hyperliquid-分群部位",
    url: "https://blave.org/studio/zh/charts/hyperliquid/trader_cohort",
    api: "https://api.blave.org/studio/charts/hyperliquid/trader_cohort"
  },
  {
    key: "hyperliquid/top_traders/exposure",
    name: "Hyperliquid-頂尖曝險",
    url: "https://blave.org/studio/zh/charts/hyperliquid/top_traders/exposure",
    api: "https://api.blave.org/studio/charts/hyperliquid/top_traders/exposure"
  },
  {
    key: "hyperliquid/top_traders/position",
    name: "Hyperliquid-頂尖部位",
    url: "https://blave.org/studio/zh/charts/hyperliquid/top_traders/position",
    api: "https://api.blave.org/studio/charts/hyperliquid/top_traders/position"
  },
  {
    key: "sector_rotation/overview",
    name: "板塊輪動-總覽",
    url: "https://blave.org/studio/zh/charts/sector_rotation/overview",
    api: "https://api.blave.org/studio/charts/sector_rotation/overview"
  },
  {
    key: "sector_rotation/symbols",
    name: "板塊輪動-板塊",
    url: "https://blave.org/studio/zh/charts/sector_rotation/symbols",
    api: "https://api.blave.org/studio/charts/sector_rotation/symbols"
  },
  {
    key: "sector_rotation/history",
    name: "板塊輪動-歷史",
    url: "https://blave.org/studio/zh/charts/sector_rotation/history",
    api: "https://api.blave.org/studio/charts/sector_rotation/history"
  },
  {
    key: "gtrade/holder_concentration",
    name: "gTrade-籌碼集中度",
    url: "https://blave.org/studio/zh/charts/gtrade/holder_concentration",
    api: "https://api.blave.org/studio/charts/gtrade/holder_concentration"
  },
  {
    key: "gtrade/top_trader_portfolio",
    name: "gTrade-頂尖交易員",
    url: "https://blave.org/studio/zh/charts/gtrade/top_trader_portfolio",
    api: "https://api.blave.org/studio/charts/gtrade/top_trader_portfolio"
  },
  {
    key: "gtrade/whale_hunter",
    name: "gTrade-巨鯨警報",
    url: "https://blave.org/studio/zh/charts/gtrade/whale_hunter",
    api: "https://api.blave.org/studio/charts/gtrade/whale_hunter"
  }
];

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

async function captureBlaveLiquidationOverview(page, outDir) {
  return captureBlaveOverview(page, outDir, {
    apiUrl: "https://api.blave.org/studio/charts/liquidation/overview",
    outBaseName: "blave_liquidation_overview"
  });
}

async function captureBlaveTakerIntensityOverview(page, outDir) {
  return captureBlaveOverview(page, outDir, {
    apiUrl: "https://api.blave.org/studio/charts/taker_intensity/overview",
    outBaseName: "blave_taker_intensity_overview"
  });
}

async function captureBlaveWhaleHunterOverview(page, outDir) {
  return captureBlaveOverview(page, outDir, {
    apiUrl: "https://api.blave.org/studio/charts/whale_hunter/overview",
    outBaseName: "blave_whale_hunter_overview"
  });
}

async function captureBlaveHolderConcentrationOverview(page, outDir) {
  return captureBlaveOverview(page, outDir, {
    apiUrl: "https://api.blave.org/studio/charts/holder_concentration/overview",
    outBaseName: "blave_holder_concentration_overview"
  });
}

async function captureBlaveMarketSentimentOverview(page, outDir) {
  return captureBlaveOverview(page, outDir, {
    apiUrl: "https://api.blave.org/studio/charts/market_sentiment/overview",
    outBaseName: "blave_market_sentiment_overview"
  });
}

async function captureBlaveFundingRateOverview(page, outDir) {
  return captureBlaveOverview(page, outDir, {
    apiUrl: "https://api.blave.org/studio/charts/funding_rate/overview",
    outBaseName: "blave_funding_rate_overview"
  });
}

async function captureBlaveFundingRateHistory(page, outDir) {
  return captureBlaveOverview(page, outDir, {
    apiUrl: "https://api.blave.org/studio/charts/funding_rate/history",
    outBaseName: "blave_funding_rate_history"
  });
}

async function captureBlaveOiImbalanceOverview(page, outDir) {
  return captureBlaveOverview(page, outDir, {
    apiUrl: "https://api.blave.org/studio/charts/oi_imbalance/overview",
    outBaseName: "blave_oi_imbalance_overview"
  });
}

async function captureBlaveSqueezeMomentumHistory(page, outDir) {
  return captureBlaveOverview(page, outDir, {
    apiUrl: "https://api.blave.org/studio/charts/squeeze_momentum/history",
    outBaseName: "blave_squeeze_momentum_history"
  });
}

async function main() {
  let session = null;
  try {
    const task = getArg("task", "", process.argv);
    const TASK_REGISTRY = {
      "blave:toptrader:position": {
        platform: "blave",
        name: "Blave頂尖交易員-部位",
        defaultUrl: "https://blave.org/studio/zh/charts/blave_top_trader/position",
        outDirPrefix: "blave_top_trader_position",
        capture: async (page, outDir) => captureBlaveTopTraderPosition(page, outDir)
      },
      "blave:liquidation:overview": {
        platform: "blave",
        name: "爆倉-總覽",
        defaultUrl: "https://blave.org/studio/zh/charts/liquidation/overview",
        outDirPrefix: "blave_liquidation_overview",
        capture: async (page, outDir) => captureBlaveLiquidationOverview(page, outDir)
      },
      "blave:taker_intensity:overview": {
        platform: "blave",
        name: "多空力道-總覽",
        defaultUrl: "https://blave.org/studio/zh/charts/taker_intensity/overview",
        outDirPrefix: "blave_taker_intensity_overview",
        capture: async (page, outDir) => captureBlaveTakerIntensityOverview(page, outDir)
      },
      "blave:whale_hunter:overview": {
        platform: "blave",
        name: "巨鯨警報-總覽",
        defaultUrl: "https://blave.org/studio/zh/charts/whale_hunter/overview",
        outDirPrefix: "blave_whale_hunter_overview",
        capture: async (page, outDir) => captureBlaveWhaleHunterOverview(page, outDir)
      },
      "blave:holder_concentration:overview": {
        platform: "blave",
        name: "籌碼集中度-總覽",
        defaultUrl: "https://blave.org/studio/zh/charts/holder_concentration/overview",
        outDirPrefix: "blave_holder_concentration_overview",
        capture: async (page, outDir) => captureBlaveHolderConcentrationOverview(page, outDir)
      },
      "blave:market_sentiment:overview": {
        platform: "blave",
        name: "市場情緒-總覽",
        defaultUrl: "https://blave.org/studio/zh/charts/market_sentiment/overview",
        outDirPrefix: "blave_market_sentiment_overview",
        capture: async (page, outDir) => captureBlaveMarketSentimentOverview(page, outDir)
      },
      "blave:funding_rate:overview": {
        platform: "blave",
        name: "資金費率-總覽",
        defaultUrl: "https://blave.org/studio/zh/charts/funding_rate/overview",
        outDirPrefix: "blave_funding_rate_overview",
        capture: async (page, outDir) => captureBlaveFundingRateOverview(page, outDir)
      },
      "blave:funding_rate:history": {
        platform: "blave",
        name: "資金費率-歷史",
        defaultUrl: "https://blave.org/studio/zh/charts/funding_rate/history",
        outDirPrefix: "blave_funding_rate_history",
        capture: async (page, outDir) => captureBlaveFundingRateHistory(page, outDir)
      },
      "blave:oi_imbalance:overview": {
        platform: "blave",
        name: "OI失衡-總覽",
        defaultUrl: "https://blave.org/studio/zh/charts/oi_imbalance/overview",
        outDirPrefix: "blave_oi_imbalance_overview",
        capture: async (page, outDir) => captureBlaveOiImbalanceOverview(page, outDir)
      },
      "blave:squeeze_momentum:history": {
        platform: "blave",
        name: "擠壓動能-歷史",
        defaultUrl: "https://blave.org/studio/zh/charts/squeeze_momentum/history",
        outDirPrefix: "blave_squeeze_momentum_history",
        capture: async (page, outDir) => captureBlaveSqueezeMomentumHistory(page, outDir)
      }
    };

    const taskConfig = task ? TASK_REGISTRY[task] ?? null : null;

    session = await createCaptureSession({
      defaultUrl: taskConfig?.defaultUrl ?? "https://blave.org/",
      outDirPrefix: taskConfig?.outDirPrefix ?? "blave",
      manualPrompt: "登入完成後按 Enter 繼續擷取..."
    });

    const { context, page, outDir, stamp, options } = session;

    await waitForUserReady(page, options);
    await stabilize(page, { extraWaitMs: 1500 });

    if (taskConfig) {
      const r = await taskConfig.capture(page, outDir);
      await writeJson(path.join(outDir, "task_result.json"), { task, ...r });
    } else if (isBlaveTopTraderPositionUrl(options.url)) {
      const r = await captureBlaveTopTraderPosition(page, outDir);
      await writeJson(path.join(outDir, "task_result.json"), { task: "auto:blave_top_trader_position", ...r });
    }

    await writeJson(path.join(outDir, "feature_map_blave.json"), BLAVE_FEATURE_MAP);

    await saveFullPageScreenshot(page, outDir, "page_full.png");

    const html = await page.content();
    await fs.writeFile(path.join(outDir, "page.html"), html, "utf8");
    const pageUrl = await writePageUrl(page, outDir, "page_url.txt");

    const cookies = await context.cookies();
    await fs.writeFile(path.join(outDir, "cookies.json"), JSON.stringify(cookies, null, 2), "utf8");

    const storage = await page.evaluate(() => {
      const ls = Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)]));
      const ss = Object.fromEntries(Object.keys(sessionStorage).map((k) => [k, sessionStorage.getItem(k)]));
      return { localStorage: ls, sessionStorage: ss };
    });
    await fs.writeFile(path.join(outDir, "storage.json"), JSON.stringify(storage, null, 2), "utf8");

    const tables = await page.evaluate(() => {
      const ts = Array.from(document.querySelectorAll("table")).map((t, i) => ({
        index: i,
        text: (t.innerText || "").trim(),
        html: (t.outerHTML || "").slice(0, 200000)
      }));
      return ts.filter((t) => t.text.length > 0);
    });
    await fs.writeFile(path.join(outDir, "tables.json"), JSON.stringify(tables, null, 2), "utf8");

    const exportCandidates = [
      "text=/export/i",
      "text=/download/i",
      "text=/csv/i",
      "text=/匯出/",
      "text=/下載/",
      "text=/導出/"
    ];

    for (const selector of exportCandidates) {
      const loc = page.locator(selector).first();
      const count = await loc.count();
      if (count < 1) continue;

      const downloadPromise = page.waitForEvent("download", { timeout: 5000 }).catch(() => null);
      await loc.click({ timeout: 2000 }).catch(() => null);
      const download = await downloadPromise;
      if (!download) continue;

      const suggested = download.suggestedFilename();
      const target = path.join(outDir, suggested || `download_${stamp}`);
      await download.saveAs(target).catch(() => null);
      break;
    }

    await writeSummary({
      stamp,
      urlRequested: options.url,
      finalUrl: pageUrl,
      outDir,
      profileDir: options.profileDir,
      channel: options.channel
    });

    if (options.keepOpen) return;
    await context.close();
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}\n${err.stack ?? ""}` : String(err);
    process.stderr.write(message + "\n");
    process.exitCode = 1;
    try {
      if (session?.outDir) {
        await fs.writeFile(path.join(session.outDir, "error.txt"), message, "utf8");
      }
    } catch {}
    try {
      await session?.context?.close();
    } catch {}
  }
}

await main();
