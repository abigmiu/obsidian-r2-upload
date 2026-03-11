import { LocalizedError } from "./errors";

export class StableFileTracker {
  private lastChangeAtByPath = new Map<string, number>();

  noteChange(path: string) {
    this.lastChangeAtByPath.set(path, Date.now());
  }

  migratePath(oldPath: string, newPath: string) {
    const old = this.lastChangeAtByPath.get(oldPath);
    this.lastChangeAtByPath.delete(oldPath);
    this.lastChangeAtByPath.set(newPath, Date.now());
    if (old !== undefined) {
      // keep a record of oldPath changes too, so any late readers can detect activity
      this.lastChangeAtByPath.set(oldPath, old);
    }
  }

  getLastChangeAt(path: string): number {
    return this.lastChangeAtByPath.get(path) ?? 0;
  }

  async waitUntilStable(getPath: () => string, stableForMs: number, timeoutMs: number): Promise<void> {
    const start = Date.now();
    return await new Promise<void>((resolve, reject) => {
      let timer: number | null = null;

      const schedule = () => {
        const now = Date.now();
        if (now - start > timeoutMs) {
          if (timer !== null) window.clearTimeout(timer);
          reject(new LocalizedError("err.wait_timeout"));
          return;
        }

        const path = getPath();
        const last = this.getLastChangeAt(path);
        const since = now - last;
        if (since >= stableForMs) {
          if (timer !== null) window.clearTimeout(timer);
          resolve();
          return;
        }

        const waitMs = Math.max(50, stableForMs - since);
        timer = window.setTimeout(() => {
          schedule();
        }, waitMs);
      };

      schedule();
    });
  }
}
