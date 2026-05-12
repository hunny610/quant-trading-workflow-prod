import fs from "node:fs/promises";
import path from "node:path";

export async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

export function parseNumber(value) {
  if (value == null) return null;
  const s = String(value).replace(/[,\s$]/g, "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function captureApiData(page, apiUrl) {
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
      return { ok: false, reason: "api_unavailable", apiUrl, direct };
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

  return { ok: true, status, url, text, json };
}

export async function savePageData(page, context, outDir) {
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
}
