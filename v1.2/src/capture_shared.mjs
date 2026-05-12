import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

export function getArg(name, fallback, argv = process.argv) {
  const prefix = `--${name}`;
  const equalPrefix = `--${name}=`;
  
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === prefix) {
      const value = argv[i + 1];
      if (value && !value.startsWith("--")) return value;
    } else if (arg.startsWith(equalPrefix)) {
      return arg.slice(equalPrefix.length);
    }
  }
  return fallback;
}

export function hasFlag(name, argv = process.argv) {
  return argv.includes(`--${name}`);
}

export function formatTaipeiTimestamp(date = new Date()) {
  const dtf = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}_${parts.hour}${parts.minute}${parts.second}`;
}

export async function waitForEnter(promptText) {
  if (!process.stdin.isTTY) return;
  process.stdout.write(`${promptText}\n`);
  await new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.once("data", () => resolve());
  });
}

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export async function clearOutputDirectory(outRoot) {
  try {
    const exists = await fs.stat(outRoot).catch(() => null);
    if (!exists) return;

    const items = await fs.readdir(outRoot);
    for (const item of items) {
      const itemPath = path.join(outRoot, item);
      const stat = await fs.stat(itemPath);
      if (stat.isDirectory()) {
        await fs.rm(itemPath, { recursive: true, force: true });
      } else {
        await fs.unlink(itemPath);
      }
    }
    process.stdout.write(`🧹 已清空舊的輸出目錄: ${outRoot}\n`);
  } catch (err) {
    process.stderr.write(`⚠️  清空輸出目錄時出錯: ${err}\n`);
  }
}

export function readCommonOptions({
  defaultUrl,
  outDirPrefix,
  manualPrompt,
  argv = process.argv
}) {
  const url = getArg("url", defaultUrl, argv);
  const outRoot = getArg("outDir", path.resolve("./data/blave"), argv);
  const profileDir = getArg("profileDir", path.resolve("./.profile"), argv);
  const channel = getArg("channel", process.env.COINCLASS_BROWSER_CHANNEL || "msedge", argv);
  const manual = !hasFlag("noManual", argv);
  const keepOpen = hasFlag("keepOpen", argv);
  const ignoreHttpsErrors = hasFlag("ignoreHttpsErrors", argv);
  const waitMsRaw = getArg("waitMs", "120000", argv);
  const waitMsParsed = Number.parseInt(waitMsRaw, 10);
  const waitMs = Number.isFinite(waitMsParsed) ? waitMsParsed : 120000;

  const stamp = formatTaipeiTimestamp();
  const outDir = path.join(outRoot, `${outDirPrefix}_${stamp}`);

  return {
    url,
    outRoot,
    profileDir,
    channel,
    manual,
    keepOpen,
    ignoreHttpsErrors,
    waitMs,
    stamp,
    outDirPrefix,
    outDir,
    manualPrompt
  };
}

export async function launchContext({ profileDir, channel, ignoreHttpsErrors }) {
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    channel,
    viewport: null,
    ignoreHTTPSErrors: !!ignoreHttpsErrors,
    timeout: 300000,
    args: [
      "--start-maximized",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      ...(ignoreHttpsErrors ? ["--ignore-certificate-errors"] : [])
    ]
  });
  const page = context.pages()[0] || (await context.newPage());
  return { context, page };
}

export async function gotoUrl(page, url) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  } catch {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  }
}

export async function waitForUserReady(page, { manual, waitMs, manualPrompt }) {
  if (manual) {
    await waitForEnter(manualPrompt);
    return;
  }
  await page.waitForTimeout(waitMs);
}

export async function stabilize(page, { networkIdleTimeoutMs = 30000, extraWaitMs = 1000 } = {}) {
  await page.waitForLoadState("networkidle", { timeout: networkIdleTimeoutMs }).catch(() => {});
  if (extraWaitMs > 0) {
    await page.waitForTimeout(extraWaitMs);
  }
}

export async function saveFullPageScreenshot(page, outDir, filename = "page_full.png") {
  const screenshotPath = path.join(outDir, filename);
  try {
    await page.screenshot({ path: screenshotPath, fullPage: true, timeout: 120000 });
  } catch (err1) {
    try {
      await page.screenshot({ path: screenshotPath, fullPage: false, timeout: 60000 });
    } catch (err2) {
      console.warn(`⚠️  截圖失敗，跳過截圖: ${err2 instanceof Error ? err2.message : String(err2)}`);
    }
  }
  return screenshotPath;
}

export async function writePageUrl(page, outDir, filename = "page_url.txt") {
  const pageUrl = page.url();
  await fs.writeFile(path.join(outDir, filename), pageUrl, "utf8");
  return pageUrl;
}

export async function writeSummary({ stamp, urlRequested, finalUrl, outDir, profileDir, channel }) {
  const summary = {
    utc8: stamp.replace("_", " "),
    urlRequested,
    finalUrl,
    outDir,
    profileDir,
    channel
  };
  await fs.writeFile(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
  return summary;
}

export async function checkBlaveLoginStatus(page) {
  try {
    const result = await page.evaluate(() => {
      const hasProfileLink = !!document.querySelector('a[href*="/profile"], a[href*="/account"]');
      
      const allElements = Array.from(document.body.querySelectorAll('*'));
      const hasLoginButton = allElements.some(el => {
        const text = el.innerText || el.textContent || '';
        return text.includes('登入') || text.includes('Login') || text.includes('Sign In');
      });
      
      const hasAccountButton = allElements.some(el => {
        const text = el.innerText || el.textContent || '';
        return text.includes('帳戶') || text.includes('Profile') || text.includes('Account');
      });
      
      const isLoggedIn = hasProfileLink || hasAccountButton || !hasLoginButton;
      
      const hasAuthCookie = document.cookie.includes('auth') || 
        document.cookie.includes('token') ||
        document.cookie.includes('session');
      
      return { isLoggedIn, hasAuthCookie, hasProfileLink, hasLoginButton, hasAccountButton };
    }).catch(() => ({ isLoggedIn: false, hasAuthCookie: false }));
    
    return result;
  } catch {
    return { isLoggedIn: false, hasAuthCookie: false };
  }
}

export async function createCaptureSession({ defaultUrl, outDirPrefix, manualPrompt, argv = process.argv }) {
  const options = readCommonOptions({ defaultUrl, outDirPrefix, manualPrompt, argv });
  await ensureDir(options.outDir);
  await ensureDir(options.profileDir);

  const { context, page } = await launchContext({
    profileDir: options.profileDir,
    channel: options.channel,
    ignoreHttpsErrors: options.ignoreHttpsErrors
  });
  await gotoUrl(page, options.url);
  
  await page.waitForTimeout(3000);
  
  const loginStatus = await checkBlaveLoginStatus(page);
  
  if (!loginStatus.isLoggedIn && !loginStatus.hasAuthCookie) {
    process.stdout.write("\n⚠️  偵測到未登入 Blave！\n");
    process.stdout.write("請在開啟的瀏覽器中手動登入 Blave\n");
    process.stdout.write("登入完成後，按 Enter 繼續...\n\n");
    await waitForEnter("登入完成後按 Enter 繼續...");
  } else {
    process.stdout.write("✅ 已確認 Blave 登入狀態\n\n");
  }

  return {
    options,
    stamp: options.stamp,
    outDir: options.outDir,
    profileDir: options.profileDir,
    channel: options.channel,
    urlRequested: options.url,
    context,
    page
  };
}
