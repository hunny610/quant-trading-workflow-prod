import { getArg } from "./capture_shared.mjs";

// 修改 process.argv 以注入默認的 preset，然後執行主腳本
const args = process.argv;
if (!args.some(a => a.startsWith("--preset"))) {
  args.push("--preset=2025");
}

console.log("🚀 Running 2025 Official Batch Capture...");

// 動態導入主腳本
await import("./blave_batch_capture.mjs");
