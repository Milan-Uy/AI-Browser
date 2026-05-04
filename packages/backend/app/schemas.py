from typing import Literal, Optional, List, Union
from pydantic import BaseModel, Field


class InteractiveElement(BaseModel):
    selector: str
    tag: str
    text: str
    type: Optional[str] = None
    placeholder: Optional[str] = None


class PageContent(BaseModel):
    url: str
    title: str
    text: str
    selection: Optional[str] = None
    elements: List[InteractiveElement] = Field(default_factory=list)


class ClickAction(BaseModel):
    kind: Literal["click"] = "click"
    selector: str
    description: Optional[str] = None


class FillAction(BaseModel):
    kind: Literal["fill"] = "fill"
    selector: str
    value: str
    description: Optional[str] = None


class ScrollAction(BaseModel):
    kind: Literal["scroll"] = "scroll"
    selector: Optional[str] = None
    direction: Optional[Literal["up", "down", "top", "bottom"]] = None
    amount: Optional[int] = None
    description: Optional[str] = None


class NavigateAction(BaseModel):
    kind: Literal["navigate"] = "navigate"
    url: str
    description: Optional[str] = None


class SelectAction(BaseModel):
    kind: Literal["select"] = "select"
    selector: str
    value: str
    description: Optional[str] = None


Action = Union[ClickAction, FillAction, ScrollAction, NavigateAction, SelectAction]


class ActionResult(BaseModel):
    ok: bool
    message: Optional[str] = None


class TurnActionRecord(BaseModel):
    action: Action
    result: ActionResult


class TurnRecord(BaseModel):
    actions: List[TurnActionRecord] = Field(default_factory=list)
    page: Optional[PageContent] = None


class ChatRequest(BaseModel):
    message: str
    page: Optional[PageContent] = None
    history: List[TurnRecord] = Field(default_factory=list)
