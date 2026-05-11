from typing import Literal, Optional, List, Union
from pydantic import BaseModel, Field


class InteractiveElement(BaseModel):
    index: int
    tag: str
    text: str
    type: Optional[str] = None
    placeholder: Optional[str] = None
    value: Optional[str] = None
    role: Optional[str] = None
    name: Optional[str] = None


class PageContent(BaseModel):
    url: str
    title: str
    text: str
    selection: Optional[str] = None
    elements: List[InteractiveElement] = Field(default_factory=list)


class ClickAction(BaseModel):
    kind: Literal["click"] = "click"
    index: int
    role: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None


class FillAction(BaseModel):
    kind: Literal["fill"] = "fill"
    index: int
    value: str
    role: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None


class ScrollAction(BaseModel):
    kind: Literal["scroll"] = "scroll"
    index: Optional[int] = None
    direction: Optional[Literal["up", "down", "top", "bottom"]] = None
    amount: Optional[int] = None
    role: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None


class NavigateAction(BaseModel):
    kind: Literal["navigate"] = "navigate"
    url: str
    description: Optional[str] = None


class SelectAction(BaseModel):
    kind: Literal["select"] = "select"
    index: int
    value: str
    role: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None


Action = Union[ClickAction, FillAction, ScrollAction, NavigateAction, SelectAction]


class ActionResult(BaseModel):
    ok: bool
    message: Optional[str] = None


class TurnActionRecord(BaseModel):
    action: Action
    result: ActionResult


class TurnRecord(BaseModel):
    message: str
    actions: List[TurnActionRecord] = Field(default_factory=list)
    page: Optional[PageContent] = None


class ChatRequest(BaseModel):
    message: str
    page: Optional[PageContent] = None
    history: List[TurnRecord] = Field(default_factory=list)
