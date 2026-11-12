import { useEffect, useState } from "react";

// Same window and server, with a separate workspace for each operator.
export function useOperatorDraft<T>(key: string, empty: T) {
  const [draft, setDraft] = useState<T>(() => {
    try {
      const saved = sessionStorage.getItem(key);
      return saved ? JSON.parse(saved) as T : empty;
    } catch {
      return empty;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(draft));
    } catch {
      // While this page is open the draft remains in memory.
    }
  }, [key, draft]);

  return [draft, setDraft] as const;
}
