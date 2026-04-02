import os
from langchain_core.tools import tool
from app.graph.tools.permission_manager import check_permission

@tool
@check_permission("create_folder")
def create_folder(folder_path: str) -> str:
    """Creates a new folder at the specified path."""
    try:
        os.makedirs(folder_path, exist_ok=True)
        return f"Folder '{folder_path}' created successfully."
    except Exception as e:
        return f"Failed to create folder: {str(e)}"

@tool
@check_permission("create_file")
def create_file(file_path: str, content: str = "") -> str:
    """Creates a new file with optional content."""
    try:
        with open(file_path, 'w') as f:
            f.write(content)
        return f"File '{file_path}' created successfully."
    except Exception as e:
        return f"Failed to create file: {str(e)}"
