import { TASKS, PRESETS } from "./tasks.mjs";

/**
 * 解析任務鍵值列表，支持預設、明確指定與排除
 * @param {Object} options 
 * @param {string} options.preset 預設名稱 (all, optimized, high, medium, low)
 * @param {string} options.tasks 逗號分隔的任務鍵值
 * @param {string} options.exclude 逗號分隔的排除任務鍵值
 * @returns {string[]} 解析後的任務鍵值數組
 */
export function resolveBlaveTaskKeys({ preset = "all", tasks = "", exclude = "" } = {}) {
  let keys = [];

  // 1. 根據預設獲取基礎清單
  if (PRESETS[preset]) {
    keys = [...PRESETS[preset]];
  } else if (preset !== "all") {
    console.warn(`[TaskKeys] Unknown preset "${preset}", falling back to "all"`);
    keys = [...PRESETS.all];
  } else {
    keys = [...PRESETS.all];
  }

  // 2. 如果明確指定了任務，則覆蓋預設
  if (tasks) {
    keys = tasks.split(",").map(k => k.trim()).filter(Boolean);
  }

  // 3. 排除特定任務
  if (exclude) {
    const excludeSet = new Set(exclude.split(",").map(k => k.trim()).filter(Boolean));
    keys = keys.filter(k => !excludeSet.has(k));
  }

  // 4. 驗證所有 Key 是否有效
  const invalidKeys = keys.filter(k => !TASKS[k]);
  if (invalidKeys.length > 0) {
    throw new Error(`[TaskKeys] Found invalid task keys: ${invalidKeys.join(", ")}`);
  }

  if (keys.length === 0) {
    console.warn("[TaskKeys] Resolved task list is empty!");
  }

  return keys;
}
