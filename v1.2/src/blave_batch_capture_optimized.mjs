import { getArg } from "./capture_shared.mjs";

// 修改 process.argv 以注入默認的 preset，然後執行主腳本
// 這樣可以復用主腳本的所有邏輯，同時保持獨立的入口點
const args = process.argv;
if (!args.some(a => a.startsWith("--preset"))) {
  args.push("--preset=optimized");
}

console.log("🚀 Running Optimized Batch Capture...");

// 動態導入主腳本
await import("./blave_batch_capture.mjs");
