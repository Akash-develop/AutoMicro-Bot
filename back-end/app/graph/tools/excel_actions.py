import csv
from langchain_core.tools import tool
from app.graph.tools.permission_manager import check_permission

@tool
@check_permission("create_excel_with_sample_data")
def create_excel_with_sample_data(file_path: str) -> str:
    """Creates an Excel-compatible CSV file with sample data."""
    try:
        if not file_path.endswith('.csv'):
            file_path += '.csv'
            
        sample_data = [
            ["ID", "Name", "Role", "Department"],
            [1, "Alice Smith", "Software Engineer", "Engineering"],
            [2, "Bob Johnson", "Product Manager", "Product"],
            [3, "Charlie Brown", "UX Designer", "Design"],
            [4, "Diana Prince", "Data Scientist", "Data"]
        ]
        
        with open(file_path, mode='w', newline='') as file:
            writer = csv.writer(file)
            writer.writerows(sample_data)
            
        return f"Sample data file '{file_path}' created successfully."
    except Exception as e:
        return f"Failed to create sample data file: {str(e)}"
