"""Example automation plugin — register `plugin` instance for hooks."""

import logging

logger = logging.getLogger(__name__)


class ExampleAutomationPlugin:
    name = "example"

    def on_before_action(self, context: dict) -> None:
        logger.debug("example plugin before: %s", context.get("intent"))

    def on_after_action(self, context: dict, result: dict) -> None:
        logger.debug("example plugin after: layer=%s", context.get("layer"))


plugin = ExampleAutomationPlugin()
