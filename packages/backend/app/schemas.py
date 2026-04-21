from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field


INTERACTIVE_AX_ROLES = (
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
)

InteractiveRole = Literal[
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
]

StepAction = Literal[
    "click",
    "type",
    "hover",
    "scroll",
    "waitForPageReady",
    "goBack",
    "goForward",
    "refresh",
    "navigate",
    "switchTab",
]


class ElementBounds(BaseModel):
    x: float
    y: float
    width: float
    height: float


class ElementState(BaseModel):
    disabled: Optional[bool] = None
    checked: Optional[bool] = None
    value: Optional[str] = None
    focused: Optional[bool] = None
    expanded: Optional[bool] = None
    haspopup: Optional[str] = None


class BrowserElementData(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: int
    role: str
    name: str
    tagName: str
    bounds: ElementBounds
    state: Optional[ElementState] = None


class Tab(BaseModel):
    id: int
    title: str
    url: Optional[str] = None


class PageState(BaseModel):
    interactiveElements: Dict[str, List[BrowserElementData]] = Field(default_factory=dict)
    interactiveElementsString: str = ""
    tab: Tab
    timestamp: str


class Step(BaseModel):
    stepNumber: int
    action: StepAction
    id: int
    name: str
    value: Optional[str] = None
    explanation: Optional[str] = None


class AgentMessage(BaseModel):
    completed: bool
    explanation: Optional[str] = None
    steps: Optional[List[Step]] = None
    error: Optional[str] = None


class StepFeedback(BaseModel):
    stepNumber: int
    success: bool
    error: Optional[str] = None


class FeedbackMessage(BaseModel):
    batchNumber: int
    success: bool
    updatedPageState: Optional[PageState] = None
    stepResults: Optional[List[StepFeedback]] = None
    reason: Optional[str] = None


class MessageToAgent(BaseModel):
    userPrompt: str
    pageState: Optional[PageState] = None
    feedback: Optional[FeedbackMessage] = None


def all_elements(state: Optional[PageState]) -> List[BrowserElementData]:
    if not state:
        return []
    out: List[BrowserElementData] = []
    for items in state.interactiveElements.values():
        out.extend(items)
    return out


__all__ = [
    "AgentMessage",
    "BrowserElementData",
    "ElementBounds",
    "ElementState",
    "FeedbackMessage",
    "INTERACTIVE_AX_ROLES",
    "InteractiveRole",
    "MessageToAgent",
    "PageState",
    "Step",
    "StepAction",
    "StepFeedback",
    "Tab",
    "all_elements",
]
