import path from "node:path";
import { writeJson, parseNumber, captureApiData } from "../../capture_utils.mjs";

/**
 * 捕獲無 API 接口的頁面（僅標記為完成）
 */
export async function captureNoApi(page, outDir, meta) {
  await writeJson(path.join(outDir, "task_result.json"), { ok: true, note: "no_api_available" });
  return { ok: true };
}

/**
 * 捕獲 Blave 概覽型數據（如籌碼集中度、市場情緒等）
 */
export async function captureOverview(page, outDir, meta) {
  const { apiUrl, outDirPrefix: outBaseName } = meta;
  if (!apiUrl) {
    return captureNoApi(page, outDir, meta);
  }

  const result = await captureApiData(page, apiUrl);
  if (!result.ok) {
    await writeJson(path.join(outDir, `${outBaseName}_capture.json`), result);
    return result;
  }

  const { status, url, text, json } = result;

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

/**
 * 捕獲 Blave 頂尖交易員持倉數據
 */
export async function captureTopTrader(page, outDir, meta) {
  const apiUrl = meta.apiUrl || "https://api.blave.org/studio/charts/blave_top_trader/position";
  const result = await captureApiData(page, apiUrl);

  if (!result.ok) {
    await writeJson(path.join(outDir, "blave_top_trader_position_capture.json"), result);
    return result;
  }

  const { status, url, text, json } = result;

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
