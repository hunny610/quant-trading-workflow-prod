export class BlaveClient {
  constructor(options = {}) {
    this.options = options;
    this.session = null;
  }

  async connect() {
    console.log("BlaveClient.connect() - 使用舊版 blave_capture.mjs 實作");
    throw new Error("請使用舊版 blave_capture.mjs 或 blave_batch_capture.mjs");
  }

  async captureTask(taskKey, options = {}) {
    console.log("BlaveClient.captureTask() - 使用舊版實作");
    throw new Error("請使用舊版 blave_capture.mjs 或 blave_batch_capture.mjs");
  }

  async close() {
    if (this.session?.context) {
      await this.session.context.close();
    }
  }
}

export async function createBlaveClient(options = {}) {
  const client = new BlaveClient(options);
  return client;
}
