"""
Custom template filters for the chat page.

`agent_events_json` safely embeds the raw `ChatMessage.agent_events` JSON string
inside a `<script type="application/json">` tag. The stored value is already a
JSON string, so we only need to escape the `</script` sequence to prevent an
HTML injection breakout.
"""

from django import template
from django.utils.safestring import mark_safe

register = template.Library()


@register.filter(name="agent_events_json")
def agent_events_json(value: str | None) -> str:
    if not value:
        return "[]"
    # Escape closing script tags — the only HTML-dangerous sequence when the
    # payload lives inside <script type="application/json">.
    safe = value.replace("</", "<\\/")
    return mark_safe(safe)
