import { useCallback, useEffect, useState } from "react";
import { isMessageOfKind, sendRuntime, type AppMessage, type PageState } from "@/lib/messaging";

export function usePageContent() {
  const [state, setState] = useState<PageState | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = (await sendRuntime("GET_PAGE_STATE", undefined)) as AppMessage | null;
      if (res && isMessageOfKind(res, "PAGE_STATE_RESULT") && res.payload.state) {
        setState(res.payload.state);
      } else {
        setState(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { state, loading, refresh };
}
