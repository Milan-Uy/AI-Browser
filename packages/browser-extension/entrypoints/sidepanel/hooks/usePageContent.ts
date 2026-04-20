import { useCallback, useEffect, useState } from "react";
import { isMessageOfKind, sendRuntime, type AppMessage, type PageContent } from "@/lib/messaging";

export function usePageContent() {
  const [content, setContent] = useState<PageContent | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = (await sendRuntime("GET_PAGE_CONTENT", undefined)) as AppMessage | null;
      if (res && isMessageOfKind(res, "PAGE_CONTENT_RESULT")) {
        setContent(res.payload.content);
      } else {
        setContent(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { content, loading, refresh };
}
