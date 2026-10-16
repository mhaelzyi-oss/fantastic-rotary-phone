/** Trailing debounce. Uses a generic timer so it is testable without a DOM. */
export function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let handle: ReturnType<typeof setTimeout> | undefined;
  const wrapped = ((...args: Parameters<T>) => {
    if (handle !== undefined) clearTimeout(handle);
    handle = setTimeout(() => {
      fn(...args);
    }, ms);
  }) as T;
  return wrapped;
}
