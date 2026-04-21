export const INTERACTIVE_AX_ROLES = [
  "button",
  "link",
  "textbox",
  "combobox",
  "checkbox",
  "radio",
  "menuitem",
  "tab",
  "switch",
  "slider",
  "searchbox",
  "listbox",
  "option",
  "spinbutton",
] as const;
export type InteractiveRole = (typeof INTERACTIVE_AX_ROLES)[number];

export interface ElementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElementState {
  disabled?: boolean;
  checked?: boolean;
  value?: string;
  focused?: boolean;
  expanded?: boolean;
  haspopup?: string;
}

export interface BrowserElementData {
  role: string;
  id: number;
  name: string;
  tagName: string;
  bounds: ElementBounds;
  state?: ElementState;
  [key: string]: unknown;
}

export interface InteractiveElementsMap {
  [role: string]: BrowserElementData[];
}

export interface Tab {
  id: number;
  title: string;
  url?: string;
}

export interface PageState {
  interactiveElements: InteractiveElementsMap;
  interactiveElementsString: string;
  tab: Tab;
  timestamp: string;
}

export type StepAction =
  | "click"
  | "type"
  | "hover"
  | "scroll"
  | "waitForPageReady"
  | "goBack"
  | "goForward"
  | "refresh"
  | "navigate"
  | "switchTab";

export interface Step {
  stepNumber: number;
  action: StepAction;
  id: number;
  name: string;
  value?: string;
  explanation?: string;
}

export interface AgentMessage {
  completed: boolean;
  explanation?: string;
  steps?: Step[];
  error?: string;
}

export interface StepFeedback {
  stepNumber: number;
  success: boolean;
  error?: string;
}

export interface FeedbackMessage {
  batchNumber: number;
  success: boolean;
  updatedPageState?: PageState;
  stepResults?: StepFeedback[];
  reason?: string;
}

export interface MessageToAgent {
  userPrompt: string;
  pageState?: PageState;
  feedback?: FeedbackMessage;
}

export interface StepResult {
  ok: boolean;
  message?: string;
}

export type BatchStatus = "running" | "completed" | "error";

export interface BatchUpdate {
  turn: number;
  status: BatchStatus;
  explanation?: string;
  steps?: Step[];
  stepResults?: StepFeedback[];
  error?: string;
}

type Payloads = {
  GET_PAGE_STATE: void;
  PAGE_STATE_RESULT: { state: PageState | null };
  CHAT_MESSAGE: { text: string; includePage: boolean };
  AGENT_UPDATE: { update: BatchUpdate };
  CONFIRM_STEP: { requestId: string; step: Step };
  STEP_APPROVED: { requestId: string; approved: boolean };
  EXECUTE_STEP: { requestId: string; step: Step };
  EXECUTE_STEP_RESULT: { requestId: string; result: StepResult };
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
): m is Extract<AppMessage, { kind: K }> {
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
