import asyncio
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage
from langchain_core.tools import tool

# Use an API key specifically for testing (this is just to test the error response)
# We will use the key from the DB.
import sqlite3
import os

async def main():
    conn = sqlite3.connect("automicro.db")
    c = conn.cursor()
    # Find the gemini active setting
    c.execute("SELECT api_key, model FROM llm_history WHERE provider='gemini' ORDER BY id DESC LIMIT 1")
    row = c.fetchone()
    if not row:
        print("No gemini key found")
        return
    api_key, model = row
    
    os.environ["GOOGLE_API_KEY"] = api_key
    
    # Init LLM
    print(f"Testing model: {model}")
    llm = ChatGoogleGenerativeAI(model=model, google_api_key=api_key)
    
    @tool
    def dummy_tool(text: str) -> str:
        """Saves text"""
        return text
        
    llm_with_tools = llm.bind_tools([dummy_tool])
    
    print("Invoking...")
    try:
        res = await llm_with_tools.ainvoke([HumanMessage(content="Use the tool to save the word 'hello'")])
        print("Success:", res)
    except Exception as e:
        print("Exception caught:", str(e))

if __name__ == "__main__":
    asyncio.run(main())
