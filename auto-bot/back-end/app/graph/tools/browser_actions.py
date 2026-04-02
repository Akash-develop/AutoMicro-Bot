import webbrowser
import urllib.parse
from langchain_core.tools import tool
from app.graph.tools.permission_manager import check_permission

@tool
@check_permission("open_url")
def open_url(url: str) -> str:
    """Opens a specific URL in the default web browser."""
    try:
        if not url.startswith('http'):
            url = 'https://' + url
        webbrowser.open(url)
        return f"Successfully opened {url} in the browser."
    except Exception as e:
        return f"Failed to open URL: {str(e)}"

@tool
@check_permission("search_web")
def search_web(query: str, engine: str = "google") -> str:
    """Searches the web for a given query (supports 'google' or 'youtube')."""
    try:
        encoded_query = urllib.parse.quote_plus(query)
        if engine.lower() == "youtube":
            url = f"https://www.youtube.com/results?search_query={encoded_query}"
        else:
            url = f"https://www.google.com/search?q={encoded_query}"
        
        webbrowser.open(url)
        return f"Successfully searched {engine} for '{query}'."
    except Exception as e:
        return f"Failed to search: {str(e)}"
