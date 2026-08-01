export interface KeyedSerializer<K> {
  run<T>(
    key: K,
    task: () => Promise<T>,
    options?: { onCurrentSettled?: () => void },
  ): Promise<T>;
}

/**
 * Serialize work per key while allowing independent keys to proceed. Rejection
 * of an earlier task never blocks the next task, and only the current tail can
 * clear its key's ownership or run its settlement callback.
 */
export function createKeyedSerializer<K>(): KeyedSerializer<K> {
  const tails = new Map<K, Promise<unknown>>();

  return {
    run<T>(
      key: K,
      task: () => Promise<T>,
      options?: { onCurrentSettled?: () => void },
    ) {
      const previous = tails.get(key) ?? Promise.resolve();
      const next = previous.catch(() => undefined).then(task);
      tails.set(key, next);
      const settle = () => {
        if (tails.get(key) !== next) return;
        tails.delete(key);
        options?.onCurrentSettled?.();
      };
      void next.then(settle, settle);
      return next;
    },
  };
}
