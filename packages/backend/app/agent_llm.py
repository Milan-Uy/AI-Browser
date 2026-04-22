import logging
import os
from typing import List, Optional

from .schemas import (
    AgentMessage,
    BrowserElementData,
    FeedbackMessage,
    MessageToAgent,
    PageState,
    Step,
    all_elements,
)

logger = logging.getLogger(__name__)


def _is_denial_feedback(feedback: FeedbackMessage) -> bool:
    if feedback.reason == "denied_by_user":
        return True
    for sf in feedback.stepResults or []:
        if sf.error == "denied by user":
            return True
    return False


async def run_agent(msg: MessageToAgent) -> AgentMessage:
    backend = os.environ.get("AIB_LLM_BACKEND", "mock").lower()
    logger.info("agent backend: %s", backend)
    logger.info("agent request: %s", msg.model_dump_json())

    if backend == "mock":
        response = _mock_agent(msg)
    else:
        response = await _real_agent(msg)

    logger.info("agent response: %s", response.model_dump_json())
    return response


def _mock_agent(msg: MessageToAgent) -> AgentMessage:
    if msg.feedback and _is_denial_feedback(msg.feedback):
        return AgentMessage(
            completed=True,
            explanation="Stopped because a step was denied.",
        )

    if msg.feedback and msg.feedback.success:
        return AgentMessage(
            completed=True,
            explanation="Previous batch succeeded. Nothing else to do.",
        )

    prompt = msg.userPrompt.lower()
    target = _best_match(prompt, all_elements(msg.pageState))
    if not target:
        return AgentMessage(
            completed=True,
            explanation=f"I looked at the page but couldn't find anything matching {msg.userPrompt!r}.",
        )

    step = Step(
        stepNumber=1,
        action="click",
        id=target.id,
        name=target.name,
        explanation=f"Click '{target.name}' because it best matches the user's request.",
    )
    return AgentMessage(
        completed=False,
        explanation=f"I'll click the {target.role} named '{target.name}'.",
        steps=[step],
    )


def _best_match(prompt: str, elements: List[BrowserElementData]) -> Optional[BrowserElementData]:
    tokens = [t for t in prompt.split() if len(t) >= 3]
    best: Optional[BrowserElementData] = None
    best_score = 0
    for el in elements:
        name = el.name.lower()
        score = sum(1 for t in tokens if t in name)
        if el.role in ("button", "link") and score == 0 and not best:
            best = el
            continue
        if score > best_score:
            best = el
            best_score = score
    return best


async def _real_agent(msg: MessageToAgent) -> AgentMessage:
    # Placeholder for real LLM integration. Replace with a call to the
    # configured provider (Anthropic / OpenAI / local) that returns an
    # AgentMessage-shaped JSON object, then validate it.
    return AgentMessage(
        completed=True,
        error="AIB_LLM_BACKEND=real is not configured. Set up the real provider in agent_llm.py.",
    )


def page_summary(state: Optional[PageState]) -> str:
    if not state:
        return "(no page context)"
    return state.interactiveElementsString or "(no interactive elements)"


__all__ = ["run_agent", "page_summary"]
