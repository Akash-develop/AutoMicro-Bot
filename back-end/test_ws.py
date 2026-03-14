import asyncio
import json
import websockets

async def test():
    async with websockets.connect('ws://localhost:8000/ws/test_chain_123') as ws:
        await ws.send(json.dumps({'message': 'create a folder called test_chain_dir'}))
        while True:
            try:
                resp = await ws.recv()
                print('RCV:', resp)
                parsed = json.loads(resp)
                if parsed.get('type') in ['done', 'error']:
                    break
            except Exception as e:
                print('ERR:', e)
                break

if __name__ == '__main__':
    asyncio.run(test())
