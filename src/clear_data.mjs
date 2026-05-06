import fs from "node:fs/promises";
import path from "node:path";

async function clearData() {
  const dataDir = path.resolve("./data/blave");
  
  console.log("========================================");
  console.log("清空 data/blave 目錄");
  console.log("========================================");
  console.log("");

  try {
    const exists = await fs.stat(dataDir).catch(() => null);
    
    if (!exists) {
      console.log("data/blave 目錄不存在，正在建立...");
      await fs.mkdir(dataDir, { recursive: true });
      console.log("✅ 已建立空的 data/blave 目錄");
    } else {
      console.log(`正在清空: ${dataDir}`);
      
      const items = await fs.readdir(dataDir);
      
      if (items.length === 0) {
        console.log("data/blave 目錄已經是空的");
      } else {
        console.log(`找到 ${items.length} 個項目`);
        
        for (const item of items) {
          const itemPath = path.join(dataDir, item);
          const stat = await fs.stat(itemPath);
          
          if (stat.isDirectory()) {
            await fs.rm(itemPath, { recursive: true, force: true });
          } else {
            await fs.unlink(itemPath);
          }
        }
        
        console.log("");
        console.log("✅ 已清空 data/blave 目錄");
      }
    }
  } catch (err) {
    console.error("❌ 清空 data/blave 目錄時出錯:", err);
    process.exit(1);
  }

  console.log("");
  console.log("========================================");
  console.log("完成！");
  console.log("========================================");
}

await clearData();
