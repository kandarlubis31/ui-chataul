"use client";

import { useState, useEffect, useRef } from "react";

/**
 * Returns a debounced version of the input value.
 * Updates at most once every `delay` ms.
 */
export function useDebouncedValue<T>(value: T, delay = 100): T {
  const [debounced, setDebounced] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => setDebounced(value), delay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, delay]);

  return debounced;
}
