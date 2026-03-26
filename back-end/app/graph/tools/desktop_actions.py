import os
import time
import pyautogui
from PIL import Image
from langchain_core.tools import tool
from app.graph.tools.permission_manager import check_permission
import logging

logger = logging.getLogger(__name__)

# Ensure screenshots directory exists
SCREENSHOTS_DIR = os.path.join(os.getcwd(), "screenshots")
if not os.path.exists(SCREENSHOTS_DIR):
    os.makedirs(SCREENSHOTS_DIR)

@tool
@check_permission("mouse_click")
def mouse_click(x: int, y: int, button: str = "left", clicks: int = 1):
    """
    Clicks the mouse at the specified (x, y) coordinates.
    - x, y: Screen coordinates.
    - button: 'left', 'right', or 'middle'.
    - clicks: Number of clicks.
    """
    try:
        pyautogui.click(x=x, y=y, button=button, clicks=clicks)
        return f"Successfully clicked {button} button at ({x}, {y}) {clicks} times."
    except Exception as e:
        return f"Error clicking mouse: {str(e)}"

@tool
@check_permission("mouse_move")
def mouse_move(x: int, y: int, duration: float = 0.5):
    """
    Moves the mouse to the specified (x, y) coordinates over a duration.
    """
    try:
        pyautogui.moveTo(x, y, duration=duration)
        return f"Successfully moved mouse to ({x}, {y})."
    except Exception as e:
        return f"Error moving mouse: {str(e)}"

@tool
@check_permission("type_text")
def type_text(text: str, interval: float = 0.1):
    """
    Types the given text as if entered from a keyboard.
    - text: The string to type.
    - interval: Delay between each character.
    """
    try:
        pyautogui.write(text, interval=interval)
        return f"Successfully typed text: '{text}'"
    except Exception as e:
        return f"Error typing text: {str(e)}"

@tool
@check_permission("key_press")
def key_press(key: str, presses: int = 1):
    """
    Presses a specific keyboard key (e.g., 'enter', 'tab', 'esc', 'up', 'down').
    - key: The key name (refer to pyautogui documentation for valid names).
    """
    try:
        pyautogui.press(key, presses=presses)
        return f"Successfully pressed key: '{key}' {presses} times."
    except Exception as e:
        return f"Error pressing key: {str(e)}"

@tool
@check_permission("take_screenshot")
def take_screenshot():
    """
    Takes a screenshot of the entire screen and saves it.
    Returns the path to the saved screenshot and the screen resolution.
    """
    try:
        timestamp = int(time.time())
        filename = f"screenshot_{timestamp}.png"
        filepath = os.path.join(SCREENSHOTS_DIR, filename)
        
        screenshot = pyautogui.screenshot()
        screenshot.save(filepath)
        
        width, height = screenshot.size
        return {
            "status": "success",
            "path": filepath,
            "filename": filename,
            "resolution": f"{width}x{height}",
            "message": f"Screenshot saved to {filepath}"
        }
    except Exception as e:
        return f"Error taking screenshot: {str(e)}"

@tool
@check_permission("get_screen_size")
def get_screen_size():
    """
    Returns the current screen resolution (width and height).
    Useful for calculating click coordinates.
    """
    try:
        width, height = pyautogui.size()
        return {"width": width, "height": height}
    except Exception as e:
        return f"Error getting screen size: {str(e)}"
