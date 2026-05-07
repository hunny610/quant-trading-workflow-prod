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
  let parseError = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (e) {
    parseError = e instanceof Error ? e.message : String(e);
    json = null;
  }

  await writeJson(path.join(outDir, `${outBaseName}_raw.json`), {
    status,
    url,
    body: json ?? text
  });

  if (status !== 200) {
    const isHtml = text.includes("<!doctype") || text.includes("<html");
    if (status === 404) {
      return { ok: false, reason: "api_not_found", errorCode: "ERR404", status };
    }
    if (status === 429) {
      return { ok: false, reason: "rate_limited", errorCode: "ERR429", status };
    }
    return { ok: false, reason: "http_error", errorCode: `ERR${status}`, status };
  }

  if (parseError) {
    const isHtml = text.includes("<!doctype") || text.includes("<html");
    if (isHtml) {
      return { ok: false, reason: "api_returned_html", errorCode: "ERR_HTML" };
    }
    return { ok: false, reason: "json_parse_error", errorCode: "ERR_PARSE", parseError };
  }

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
  "blave:x:trending": {
    platform: "blave",
    name: "𝕏 (Twitter)",
    defaultUrl: "https://blave.org/studio/zh/charts/x/trending",
    outDirPrefix: "blave_x_trending",
    capture: async (page, outDir) => {
      await writeJson(path.join(outDir, "task_result.json"), { ok: true, note: "no_api_available" });
      return { ok: true };
    }
  },
  "blave:holder_concentration:overview": {
    platform: "blave",
    name: "籌碼集中度 (HC)",
    defaultUrl: "https://blave.org/studio/zh/charts/holder_concentration/overview",
    outDirPrefix: "blave_holder_concentration_overview",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/holder_concentration/overview",
      outBaseName: "blave_holder_concentration_overview"
    })
  },
  "blave:whale_hunter:overview": {
    platform: "blave",
    name: "巨鯨警報 (WH)",
    defaultUrl: "https://blave.org/studio/zh/charts/whale_hunter/overview",
    outDirPrefix: "blave_whale_hunter_overview",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/whale_hunter/overview",
      outBaseName: "blave_whale_hunter_overview"
    })
  },
  "blave:unusual_movement:overview": {
    platform: "blave",
    name: "異常漲跌 (UM)",
    defaultUrl: "https://blave.org/studio/zh/charts/unusual_movement/overview",
    outDirPrefix: "blave_unusual_movement_overview",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/unusual_movement/overview",
      outBaseName: "blave_unusual_movement_overview"
    })
  },
  "blave:taker_intensity:overview": {
    platform: "blave",
    name: "多空力道 (TI)",
    defaultUrl: "https://blave.org/studio/zh/charts/taker_intensity/overview",
    outDirPrefix: "blave_taker_intensity_overview",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/taker_intensity/overview",
      outBaseName: "blave_taker_intensity_overview"
    })
  },
  "blave:sector_rotation:overview": {
    platform: "blave",
    name: "板塊輪動 (SR)",
    defaultUrl: "https://blave.org/studio/zh/charts/sector_rotation/overview",
    outDirPrefix: "blave_sector_rotation_overview",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/sector_rotation/overview",
      outBaseName: "blave_sector_rotation_overview"
    })
  },
  "blave:market_sentiment:overview": {
    platform: "blave",
    name: "市場情緒 (MS)",
    defaultUrl: "https://blave.org/studio/zh/charts/market_sentiment/overview",
    outDirPrefix: "blave_market_sentiment_overview",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/market_sentiment/overview",
      outBaseName: "blave_market_sentiment_overview"
    })
  },
  "blave:squeeze_momentum:history": {
    platform: "blave",
    name: "擠壓動能 (SM)",
    defaultUrl: "https://blave.org/studio/zh/charts/squeeze_momentum/history",
    outDirPrefix: "blave_squeeze_momentum_history",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/squeeze_momentum/history",
      outBaseName: "blave_squeeze_momentum_history"
    })
  },
  "blave:capital_shortage:history": {
    platform: "blave",
    name: "資金稀缺 (CS)",
    defaultUrl: "https://blave.org/studio/zh/charts/capital_shortage/history",
    outDirPrefix: "blave_capital_shortage_history",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/capital_shortage/history",
      outBaseName: "blave_capital_shortage_history"
    })
  },
  "blave:toptrader:exposure": {
    platform: "blave",
    name: "Blave 頂尖交易員 (BT)",
    defaultUrl: "https://blave.org/studio/zh/charts/blave_top_trader/exposure",
    outDirPrefix: "blave_top_trader_exposure",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/blave_top_trader/exposure",
      outBaseName: "blave_top_trader_exposure"
    })
  },
  "blave:funding_rate:overview": {
    platform: "blave",
    name: "資金費率 (FR)",
    defaultUrl: "https://blave.org/studio/zh/charts/funding_rate/overview",
    outDirPrefix: "blave_funding_rate_overview",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/funding_rate/overview",
      outBaseName: "blave_funding_rate_overview"
    })
  },
  "blave:oi_imbalance:overview": {
    platform: "blave",
    name: "OI 失衡 (OI)",
    defaultUrl: "https://blave.org/studio/zh/charts/oi_imbalance/overview",
    outDirPrefix: "blave_oi_imbalance_overview",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/oi_imbalance/overview",
      outBaseName: "blave_oi_imbalance_overview"
    })
  },
  "blave:gtrade:holder_concentration": {
    platform: "blave",
    name: "gTrade",
    defaultUrl: "https://blave.org/studio/zh/charts/gtrade/holder_concentration",
    outDirPrefix: "blave_gtrade_holder_concentration",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/gtrade/holder_concentration",
      outBaseName: "blave_gtrade_holder_concentration"
    })
  },
  "blave:liquidation:overview": {
    platform: "blave",
    name: "爆倉地圖 (LM)",
    defaultUrl: "https://blave.org/studio/zh/charts/liquidation/overview",
    outDirPrefix: "blave_liquidation_overview",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/liquidation/overview",
      outBaseName: "blave_liquidation_overview"
    })
  },
  "blave:hyperliquid:leaderboard": {
    platform: "blave",
    name: "Hyperliquid",
    defaultUrl: "https://blave.org/studio/zh/charts/hyperliquid/leaderboard",
    outDirPrefix: "blave_hyperliquid_leaderboard",
    capture: async (page, outDir) => captureBlaveOverview(page, outDir, {
      apiUrl: "https://api.blave.org/studio/charts/hyperliquid/leaderboard",
      outBaseName: "blave_hyperliquid_leaderboard"
    })
  }
};

async function writeAuditArtifacts({ page, context, outDir, level, failed }) {
  if (level === "minimal") return;
  if (level === "failure-only" && !failed) return;

  try {
    await writePageUrl(page, outDir, "page_url.txt");

    const html = await page.content();
    await fs.writeFile(path.join(outDir, "page.html"), html, "utf8");

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
  } catch (err) {
    console.warn(`⚠️  Failed to write audit artifacts: ${err instanceof Error ? err.message : String(err)}`);
  }
}

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
  const pagePoolSizeRaw = getArg("pagePoolSize", "2", process.argv);
  const pagePoolSizeParsed = Number.parseInt(pagePoolSizeRaw, 10);
  const pagePoolSize = Number.isFinite(pagePoolSizeParsed) && pagePoolSizeParsed > 0 ? pagePoolSizeParsed : 2;
  const auditLevel = getArg("auditLevel", "failure-only", process.argv);

  const tasks = [
    "blave:x:trending",
    "blave:holder_concentration:overview",
    "blave:whale_hunter:overview",
    "blave:unusual_movement:overview",
    "blave:taker_intensity:overview",
    "blave:sector_rotation:overview",
    "blave:market_sentiment:overview",
    "blave:squeeze_momentum:history",
    "blave:capital_shortage:history",
    "blave:toptrader:exposure",
    "blave:funding_rate:overview",
    "blave:oi_imbalance:overview",
    "blave:gtrade:holder_concentration",
    "blave:liquidation:overview",
    "blave:hyperliquid:leaderboard"
  ];

  const stamp = formatTaipeiTimestamp();
  const batchOutDir = path.join(outRoot, `batch_2025_${stamp}`);
  await ensureDir(batchOutDir);
  await ensureDir(profileDir);

  console.log("========================================");
  console.log("Blave Batch Capture System (2025 Updated)");
  console.log("========================================");
  console.log(`Total tasks: ${tasks.length} (from official Notion docs)`);
  console.log(`Output directory: ${batchOutDir}`);
  console.log(`Page pool size: ${pagePoolSize}`);
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
    console.log("Step 1: Starting controlled page pool capture");
    console.log("========================================");
    console.log(`Page pool size: ${pagePoolSize}`);
    console.log(`Audit level: ${auditLevel}`);
    console.log("");

    let completedCount = 0;
    let failedCount = 0;

    async function runSingleTask(taskKey, workerIndex) {
      const taskConfig = TASK_REGISTRY[taskKey];
      if (!taskConfig) {
        console.log(`⚠️  Skipping unknown task: ${taskKey}`);
        return null;
      }

      let page = null;
      const taskOutDir = path.join(batchOutDir, `${taskConfig.outDirPrefix}_${stamp}`);
      await ensureDir(taskOutDir);

      let result = null;
      let failed = false;

      try {
        if (workerIndex === 0) {
          page = mainPage;
        } else {
          page = await context.newPage();
        }

        console.log(`🚀 [Worker ${workerIndex}] Starting: ${taskConfig.name}`);
        
        await gotoUrl(page, taskConfig.defaultUrl);
        await stabilize(page, { extraWaitMs: 1500 });

        const r = await taskConfig.capture(page, taskOutDir);
        await writeJson(path.join(taskOutDir, "task_result.json"), { task: taskKey, ...r });

        await saveFullPageScreenshot(page, taskOutDir, "page_full.png");

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
          outDir: taskOutDir
        };

        failed = !r.ok;

        console.log(`✅ [Worker ${workerIndex}] Completed: ${taskConfig.name}`);
      } catch (err) {
        const message = err instanceof Error ? `${err.name}: ${err.message}\n${err.stack ?? ""}` : String(err);
        console.error(`❌ [Worker ${workerIndex}] Failed: ${taskConfig.name}`);
        console.error(message);
        await fs.writeFile(path.join(taskOutDir, "error.txt"), message, "utf8");
        
        result = {
          task: taskKey,
          name: taskConfig.name,
          ok: false,
          error: message,
          outDir: taskOutDir
        };
        
        failed = true;
      } finally {
        if (page && page !== mainPage) {
          try {
            await page.close();
          } catch {}
        }
      }

      if (page) {
        await writeAuditArtifacts({ page, context, outDir: taskOutDir, level: auditLevel, failed });
      }

      return result;
    }

    async function processWithPagePool(taskList, poolSize) {
      const results = new Array(taskList.length);
      const executing = [];
      let index = 0;

      while (index < taskList.length || executing.length > 0) {
        while (index < taskList.length && executing.length < poolSize) {
          const taskIndex = index;
          const taskKey = taskList[taskIndex];
          const workerIndex = taskIndex % poolSize;
          
          console.log(`[${taskIndex + 1}/${taskList.length}] Scheduling: ${TASK_REGISTRY[taskKey]?.name || taskKey}`);
          
          const promise = runSingleTask(taskKey, workerIndex).then((result) => {
            if (result) {
              results[taskIndex] = result;
              if (result.ok) {
                completedCount++;
              } else {
                failedCount++;
              }
            }
          }).finally(() => {
            const idx = executing.indexOf(promise);
            if (idx > -1) executing.splice(idx, 1);
          });
          
          executing.push(promise);
          index++;
          
          if (index < taskList.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }

        if (executing.length > 0) {
          await Promise.race(executing);
        }

        const progress = Math.round(((index - executing.length) / taskList.length) * 100);
        console.log(`📊 Progress: ${index - executing.length}/${taskList.length} (${progress}%) | ✅ ${completedCount} | ❌ ${failedCount}`);
      }

      return results;
    }

    const taskResultsFromPool = await processWithPagePool(tasks, pagePoolSize);
    
    taskResults.push(...taskResultsFromPool.filter(Boolean));

    await writeJson(path.join(batchOutDir, "batch_summary.json"), {
      stamp,
      totalTasks: tasks.length,
      completedTasks: taskResults.filter(r => r.ok).length,
      failedTasks: taskResults.filter(r => !r.ok).length,
      results: taskResults
    });

    const successCount = taskResults.filter(r => r.ok).length;
    const failedCountFinal = taskResults.filter(r => !r.ok).length;

    console.log("");
    console.log("╔════════════════════════════════════════════════════════════╗");
    console.log("║                    ✅ Blave 批次抓取完成！                      ║");
    console.log("╚════════════════════════════════════════════════════════════╝");
    console.log("");
    console.log("📊 抓取統計：");
    console.log(`   總任務數：${tasks.length}`);
    console.log(`   成功：${successCount}`);
    console.log(`   失敗：${failedCountFinal}`);
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
