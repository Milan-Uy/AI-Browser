export interface InteractiveElement {
  selector: string;
  tag: string;
  text: string;
  type?: string;
  placeholder?: string;
}

export interface PageContent {
  url: string;
  title: string;
  text: string;
  selection?: string;
  elements: InteractiveElement[];
}

export type LLMAction =
  | { kind: "click"; selector: string }
  | { kind: "fill"; selector: string; value: string }
  | { kind: "scroll"; selector?: string; direction?: "up" | "down" | "top" | "bottom"; amount?: number }
  | { kind: "navigate"; url: string }
  | { kind: "select"; selector: string; value: string };

export interface TurnRecord {
  actions: LLMAction[];
  page: PageContent | null;
}

export type StreamChunk =
  | { type: "text"; content: string }
  | { type: "action"; action: LLMAction }
  | { type: "done"; completed?: boolean }
  | { type: "error"; message: string };

export interface ActionResult {
  ok: boolean;
  message?: string;
}

type Payloads = {
  GET_PAGE_CONTENT: void;
  PAGE_CONTENT_RESULT: { content: PageContent };
  CHAT_MESSAGE: { text: string; includePage: boolean };
  STREAM_CHUNK: { requestId: string; chunk: StreamChunk };
  EXECUTE_ACTION: { requestId: string; action: LLMAction };
  EXECUTE_ACTION_RESULT: { requestId: string; result: ActionResult };
};

export type MessageKind = keyof Payloads;

export type Message<K extends MessageKind = MessageKind> = {
  kind: K;
  payload: Payloads[K];
};

export type AppMessage = { [K in MessageKind]: Message<K> }[MessageKind];

export function makeMessage<K extends MessageKind>(
  kind: K,
  payload: Payloads[K],
): Message<K> {
  return { kind, payload };
}

export function isMessageOfKind<K extends MessageKind>(
  m: AppMessage,
  kind: K,
): m is Message<K> {
  return m.kind === kind;
}

export function sendRuntime<K extends MessageKind>(
  kind: K,
  payload: Payloads[K],
): Promise<unknown> {
  return chrome.runtime.sendMessage(makeMessage(kind, payload));
}

export function sendToTab<K extends MessageKind>(
  tabId: number,
  kind: K,
  payload: Payloads[K],
): Promise<unknown> {
  return chrome.tabs.sendMessage(tabId, makeMessage(kind, payload));
}
