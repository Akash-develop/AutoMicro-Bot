import asyncio
from app.graph.agent import get_app
from langchain_core.messages import HumanMessage

async def test():
    app = await get_app()
    config = {"configurable": {"thread_id": "test_chain_456"}}
    input_messages = {"messages": [HumanMessage(content="create a folder called test_direct_dir")]}
    
    print("--- INVOKING GRAPH ---")
    output = await app.ainvoke(input_messages, config)
    for m in output["messages"]:
        print(f"[{type(m).__name__}]: {m.content}")

    print("--- STREAMING GRAPH ---")
    input_messages = {"messages": [HumanMessage(content="create a folder called test_direct_dir2")]}
    async for chunk, metadata in app.astream(input_messages, config, stream_mode="messages"):
        print(f"CHUNK: type={type(chunk).__name__}, content={getattr(chunk, 'content', None)}")
        
if __name__ == '__main__':
    asyncio.run(test())
