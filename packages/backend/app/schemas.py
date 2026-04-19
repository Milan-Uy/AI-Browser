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


class ChatRequest(BaseModel):
    message: str
    page: Optional[PageContent] = None


class ClickAction(BaseModel):
    kind: Literal["click"] = "click"
    selector: str


class FillAction(BaseModel):
    kind: Literal["fill"] = "fill"
    selector: str
    value: str


class ScrollAction(BaseModel):
    kind: Literal["scroll"] = "scroll"
    selector: Optional[str] = None
    direction: Optional[Literal["up", "down", "top", "bottom"]] = None
    amount: Optional[int] = None


class NavigateAction(BaseModel):
    kind: Literal["navigate"] = "navigate"
    url: str


class SelectAction(BaseModel):
    kind: Literal["select"] = "select"
    selector: str
    value: str


Action = Union[ClickAction, FillAction, ScrollAction, NavigateAction, SelectAction]
