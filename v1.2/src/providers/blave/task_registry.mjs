import { TASKS } from "./tasks.mjs";
import { captureNoApi, captureOverview, captureTopTrader } from "./capturers.mjs";

const CAPTURERS_BY_TYPE = {
  info: captureNoApi,
  overview: captureOverview,
  topTrader: captureTopTrader
};

/**
 * 構建 Blave 任務註冊表，將靜態任務定義映射為運行期配置（包含捕獲函數）
 * @returns {Object} 任務註冊表
 */
export function buildBlaveTaskRegistry() {
  const registry = {};

  for (const [key, meta] of Object.entries(TASKS)) {
    const capturer = CAPTURERS_BY_TYPE[meta.type];
    
    if (!capturer) {
      throw new Error(`[TaskRegistry] No capturer found for type "${meta.type}" in task "${key}"`);
    }

    registry[key] = {
      platform: "blave",
      name: meta.name,
      defaultUrl: meta.url,
      outDirPrefix: meta.outDirPrefix,
      // 綁定元數據到捕獲函數，讓腳本調用時只需傳入 page 和 outDir
      capture: (page, outDir) => capturer(page, outDir, meta)
    };
  }

  return registry;
}
