import {
  isMessageOfKind,
  makeMessage,
  sendToTab,
  type AppMessage,
  type BatchUpdate,
  type FeedbackMessage,
  type MessageToAgent,
  type PageState,
  type Step,
  type StepFeedback,
} from "@/lib/messaging";
import { callAgent } from "@/lib/api-client";
import { createRateLimiter, validateStep } from "@/lib/security";

const BACKEND_URL = "http://localhost:8000/agent";
const MAX_TURNS = 10;

type Pending = {
  resolve: (approved: boolean) => void;
};

export default defineBackground(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error("[bg] setPanelBehavior failed", err));

  const rateLimiter = createRateLimiter(500);

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "chat") return;
    const controller = new AbortController();
    const pending = new Map<string, Pending>();
    let aborted = false;

    port.onDisconnect.addListener(() => {
      aborted = true;
      controller.abort();
      for (const p of pending.values()) p.resolve(false);
      pending.clear();
    });

    const waitForApproval = (requestId: string, step: Step) =>
      new Promise<boolean>((resolve) => {
        pending.set(requestId, { resolve });
        port.postMessage(makeMessage("CONFIRM_STEP", { requestId, step }));
      });

    const postUpdate = (update: BatchUpdate) =>
      port.postMessage(makeMessage("AGENT_UPDATE", { update }));

    port.onMessage.addListener(async (msg: AppMessage) => {
      if (isMessageOfKind(msg, "STEP_APPROVED")) {
        const p = pending.get(msg.payload.requestId);
        if (p) {
          pending.delete(msg.payload.requestId);
          p.resolve(msg.payload.approved);
        }
        return;
      }
      if (!isMessageOfKind(msg, "CHAT_MESSAGE")) return;

      const userPrompt = msg.payload.text;
      const includePage = msg.payload.includePage;

      try {
        let pageState: PageState | undefined = includePage
          ? (await getActivePageState()) ?? undefined
          : undefined;
        let feedback: FeedbackMessage | undefined;

        for (let turn = 1; turn <= MAX_TURNS; turn++) {
          if (aborted) return;

          const agentReq: MessageToAgent = { userPrompt, pageState, feedback };
          const reply = await callAgent(BACKEND_URL, agentReq, controller.signal);
          if (aborted) return;

          if (reply.error) {
            postUpdate({ turn, status: "error", error: reply.error, explanation: reply.explanation });
            return;
          }

          postUpdate({
            turn,
            status: reply.completed ? "completed" : "running",
            explanation: reply.explanation,
            steps: reply.steps,
          });

          if (reply.completed || !reply.steps?.length) return;

          const stepResults: StepFeedback[] = [];
          let batchOk = true;

          for (const step of reply.steps) {
            if (aborted) return;

            const validation = validateStep(step);
            if (!validation.ok) {
              stepResults.push({ stepNumber: step.stepNumber, success: false, error: validation.message });
              batchOk = false;
              break;
            }

            if (!(await rateLimiter.acquire())) {
              await new Promise((r) => setTimeout(r, 500));
            }

            const actionId = `${turn}-${step.stepNumber}-${Math.random().toString(36).slice(2, 8)}`;
            const approved = await waitForApproval(actionId, step);
            if (!approved) {
              stepResults.push({ stepNumber: step.stepNumber, success: false, error: "denied by user" });
              if (!aborted) {
                postUpdate({
                  turn,
                  status: "completed",
                  explanation: `Stopped — you denied step ${step.stepNumber}.`,
                  stepResults,
                });
              }
              return;
            }

            const result = await dispatchStep(step);
            stepResults.push({
              stepNumber: step.stepNumber,
              success: result.ok,
              error: result.ok ? undefined : result.message,
            });
            if (!result.ok) {
              batchOk = false;
              break;
            }
          }

          postUpdate({ turn, status: "running", stepResults });

          const updatedPageState = (await getActivePageState()) ?? undefined;
          pageState = updatedPageState;

          feedback = {
            batchNumber: turn,
            success: batchOk,
            updatedPageState,
            stepResults,
          };
        }

        postUpdate({ turn: MAX_TURNS, status: "error", error: `max turns (${MAX_TURNS}) reached` });
      } catch (err) {
        if (!aborted) {
          postUpdate({ turn: 0, status: "error", error: (err as Error).message });
        }
      }
    });
  });

  chrome.runtime.onMessage.addListener((msg: AppMessage, _sender, sendResponse) => {
    if (isMessageOfKind(msg, "GET_PAGE_STATE")) {
      (async () => {
        const state = await getActivePageState();
        sendResponse(makeMessage("PAGE_STATE_RESULT", { state }));
      })();
      return true;
    }
    return false;
  });
});

async function getActivePageState(): Promise<PageState | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) return null;

    const queryTab = async () => {
      const res = (await sendToTab(tab.id!, "GET_PAGE_STATE", undefined)) as AppMessage | null;
      if (res && isMessageOfKind(res, "PAGE_STATE_RESULT") && res.payload.state) {
        const state = res.payload.state;
        return {
          ...state,
          tab: {
            id: tab.id!,
            title: tab.title ?? state.tab.title,
            url: tab.url ?? state.tab.url,
          },
        };
      }
      return null;
    };

    try {
      return await queryTab();
    } catch (err) {
      if (!(err as Error).message?.toLowerCase().includes("receiving end does not exist")) throw err;
      // Content script not yet running on this tab (opened before extension loaded).
      // Inject it now and retry once.
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content-scripts/content.js"],
      });
      return await queryTab();
    }
  } catch (err) {
    console.error("[bg] getActivePageState failed", err);
    return null;
  }
}

async function dispatchStep(step: Step): Promise<{ ok: boolean; message?: string }> {
  if (step.action === "switchTab") {
    try {
      await chrome.tabs.update(step.id, { active: true });
      return { ok: true };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) return { ok: false, message: "no active tab" };
  const res = (await sendToTab(tab.id, "EXECUTE_STEP", {
    requestId: `${step.stepNumber}`,
    step,
  })) as AppMessage | null;
  if (res && isMessageOfKind(res, "EXECUTE_STEP_RESULT")) return res.payload.result;
  return { ok: false, message: "no response from content script" };
}
