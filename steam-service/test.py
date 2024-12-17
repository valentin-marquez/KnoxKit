import asyncio
import websockets
import json


async def test_websocket_commands():
    uri = "ws://localhost:16271"

    try:
        async with websockets.connect(uri) as websocket:
            print("Connected to WebSocket server")

            while True:
                # Get command from user
                command = input("Enter command (or 'exit' to quit): ")

                if command.lower() == "exit":
                    break

                # Send command to server
                await websocket.send(command)
                print(f"Sent: {command}")

                # Receive response
                response = await websocket.recv()
                try:
                    # Try to parse JSON response
                    parsed_response = json.loads(response)
                    print(f"Received: {json.dumps(parsed_response, indent=2)}")
                except json.JSONDecodeError:
                    # If not JSON, print raw response
                    print(f"Received: {response}")

    except Exception as e:
        print(f"Error: {str(e)}")


if __name__ == "__main__":
    asyncio.run(test_websocket_commands())
