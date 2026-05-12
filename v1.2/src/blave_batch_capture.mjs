import fs from "node:fs/promises";
import path from "node:path";
import {
  getArg,
  saveFullPageScreenshot,
  stabilize,
  writePageUrl,
  writeSummary,
  hasFlag,
  launchContext,
  gotoUrl,
  checkBlaveLoginStatus,
  waitForEnter,
  ensureDir,
  formatTaipeiTimestamp
} from "./capture_shared.mjs";
import { writeJson } from "./capture_utils.mjs";
import { buildBlaveTaskRegistry } from "./providers/blave/task_registry.mjs";
import { resolveBlaveTaskKeys } from "./providers/blave/task_keys.mjs";

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
  const ignoreHttpsErrors = hasFlag("ignoreHttpsErrors", process.argv);
  const keepOpen = hasFlag("keepOpen", process.argv);
  const waitMsRaw = getArg("waitMs", "60000", process.argv);
  const waitMsParsed = Number.parseInt(waitMsRaw, 10);
  const waitMs = Number.isFinite(waitMsParsed) ? waitMsParsed : 60000;
  const pagePoolSizeRaw = getArg("pagePoolSize", "2", process.argv);
  const pagePoolSizeParsed = Number.parseInt(pagePoolSizeRaw, 10);
  const pagePoolSize = Number.isFinite(pagePoolSizeParsed) && pagePoolSizeParsed > 0 ? pagePoolSizeParsed : 2;
  const manual = !hasFlag("noManual", process.argv);
  const auditLevel = getArg("auditLevel", "failure-only", process.argv);

  // 1. 初始化註冊表
  const TASK_REGISTRY = buildBlaveTaskRegistry();

  // 2. 解析任務列表
  const tasks = resolveBlaveTaskKeys({
    preset: getArg("preset", "all", process.argv),
    tasks: getArg("tasks", "", process.argv),
    exclude: getArg("exclude", "", process.argv)
  });

  // 3. 支持 --listTasks
  if (hasFlag("listTasks", process.argv)) {
    console.log("\nResolved Task List:");
    console.log("========================================");
    tasks.forEach((key, idx) => {
      const config = TASK_REGISTRY[key];
      console.log(`${idx + 1}. [${key}] ${config.name}`);
      console.log(`   URL: ${config.defaultUrl}`);
      console.log(`   Dir: ${config.outDirPrefix}`);
    });
    console.log("========================================");
    console.log(`Total: ${tasks.length} tasks\n`);
    return;
  }

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
    if (manual) {
      console.log("========================================");
      console.log("步驟 1：開啟 Blave 並登入");
      console.log("========================================");
      console.log("");
      console.log("💡 請在開啟的瀏覽器中登入 Blave");
      console.log("💡 登入完成後，按 Enter 繼續...");
      console.log("");
    }

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
    if (manual) {
      console.log("👉 請在瀏覽器中手動登入 Blave");
      console.log("👉 登入完成後，按 Enter 繼續...");
      console.log("");
      await waitForEnter("登入完成後按 Enter 繼續...");
    } else {
      console.log("⏩ 跳過手動登入確認 (--noManual)\n");
    }

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
    let apiOkCount = 0;

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
      let apiOk = false;

      try {
        if (workerIndex === 0) {
          page = mainPage;
        } else {
          page = await context.newPage();
        }

        console.log(`🚀 [Worker ${workerIndex}] Starting: ${taskConfig.name}`);
        
        await gotoUrl(page, taskConfig.defaultUrl);
        await stabilize(page, { extraWaitMs: 2000 });

        try {
          const r = await taskConfig.capture(page, taskOutDir);
          await writeJson(path.join(taskOutDir, "task_result.json"), { task: taskKey, ...r });
          apiOk = r.ok;
        } catch (apiErr) {
          const apiErrMsg = apiErr instanceof Error ? `${apiErr.name}: ${apiErr.message}` : String(apiErr);
          console.warn(`⚠️  [Worker ${workerIndex}] API capture failed, but continuing: ${apiErrMsg}`);
          await writeJson(path.join(taskOutDir, "task_result.json"), { task: taskKey, ok: false, error: apiErrMsg });
          apiOk = false;
        }

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
          ok: true,
          apiOk: apiOk,
          outDir: taskOutDir
        };

        failed = false;

        console.log(`✅ [Worker ${workerIndex}] Completed: ${taskConfig.name} (API: ${apiOk ? "OK" : "Failed"})`);
      } catch (err) {
        const message = err instanceof Error ? `${err.name}: ${err.message}\n${err.stack ?? ""}` : String(err);
        console.error(`❌ [Worker ${workerIndex}] Failed: ${taskConfig.name}`);
        console.error(message);
        await fs.writeFile(path.join(taskOutDir, "error.txt"), message, "utf8");
        
        if (page) {
          try {
            await saveFullPageScreenshot(page, taskOutDir, "page_full.png");
          } catch {}
        }
        
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
        try {
          await writeAuditArtifacts({ page, context, outDir: taskOutDir, level: auditLevel, failed });
        } catch {}
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
                if (result.apiOk) {
                  apiOkCount++;
                }
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
        console.log(`📊 Progress: ${index - executing.length}/${taskList.length} (${progress}%) | ✅ ${completedCount} (API: ${apiOkCount}) | ❌ ${failedCount}`);
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
    const apiSuccessCount = taskResults.filter(r => r.ok && r.apiOk).length;
    const failedCountFinal = taskResults.filter(r => !r.ok).length;

    console.log("");
    console.log("╔════════════════════════════════════════════════════════════╗");
    console.log("║                    ✅ Blave 批次抓取完成！                      ║");
    console.log("╚════════════════════════════════════════════════════════════╝");
    console.log("");
    console.log("📊 抓取統計：");
    console.log(`   總任務數：${tasks.length}`);
    console.log(`   截圖成功：${successCount}`);
    console.log(`   API 成功：${apiSuccessCount}`);
    console.log(`   完全失敗：${failedCountFinal}`);
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
    if (!keepOpen && context) {
      await context.close();
    }
  }
}

main().catch(console.error);
