import AsyncStorage from "@react-native-async-storage/async-storage";

// ============================================================
// AsyncStorage 写串行化封装：
// RKStorage(SQLite) 并发写会导致事务错乱 / SQLITE_FULL，
// 这里把所有写操作排进全局队列依次执行，读操作直接放行（并发读安全）。
// 接口与 AsyncStorage 完全兼容。
// ============================================================

let writeChain: Promise<void> = Promise.resolve();

function enqueue(fn: () => Promise<void>): Promise<void> {
  const p = writeChain.then(fn).catch(() => {});
  writeChain = p;
  return p;
}

// ============================================================
// 读-改-写互斥锁：
// setItem 串行化只保证单键写入原子，但「读旧快照→改→写」跨多个键
// 的流程并发时仍会互相覆盖（例如添加角色时 requesting/done 状态、
// 会话列表被旧快照覆盖）。这里提供一把可重入的进程内互斥锁，
// 所有模块的读-改-写流程都排队执行。
// ============================================================

let lockChain: Promise<unknown> = Promise.resolve();
let lockHeld = false;

export function withStorageLock<T>(fn: () => Promise<T>): Promise<T> {
  // 可重入：锁内再调用不会排队（避免嵌套死锁）
  if (lockHeld) {
    return fn();
  }
  const run = lockChain.then(async () => {
    lockHeld = true;
    try {
      return await fn();
    } finally {
      lockHeld = false;
    }
  });
  lockChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export function getItem(key: string): Promise<string | null> {
  return AsyncStorage.getItem(key);
}

export function setItem(key: string, value: string): Promise<void> {
  return enqueue(() => AsyncStorage.setItem(key, value));
}

export function removeItem(key: string): Promise<void> {
  return enqueue(() => AsyncStorage.removeItem(key));
}

export function getAllKeys(): Promise<string[]> {
  return AsyncStorage.getAllKeys();
}

export function multiGet(
  keys: string[]
): Promise<[string, string | null][]> {
  return AsyncStorage.multiGet(keys);
}

export function multiSet(pairs: [string, string][]): Promise<void> {
  return enqueue(() => AsyncStorage.multiSet(pairs));
}

export function multiRemove(keys: string[]): Promise<void> {
  return enqueue(() => AsyncStorage.multiRemove(keys));
}

export function clear(): Promise<void> {
  return enqueue(() => AsyncStorage.clear());
}

const AsyncStorageSerialized = {
  getItem,
  setItem,
  removeItem,
  getAllKeys,
  multiGet,
  multiSet,
  multiRemove,
  clear,
};

export default AsyncStorageSerialized;
