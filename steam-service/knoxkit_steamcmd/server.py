import asyncio
import datetime
import json
import logging
import aiohttp
import websockets
from typing import Dict, Set
from queue import Queue
from knoxkit_steamcmd.models import DownloadRequest
from knoxkit_steamcmd.wrapper import SteamCMDWrapper
from knoxkit_steamcmd.logmanager import LogManager
from knoxkit_steamcmd.setup import SteamCMDSetup
from knoxkit_steamcmd.workshop import WorkshopScraper

logger = LogManager.get_logger("SteamCMDManager")


class SteamCMDWebSocketServer:
    def __init__(self, host: str = "localhost", port: int = 16271):
        logger.info("Initializing SteamCMD WebSocket Server")
        self.host = host
        self.port = port
        self.clients: Set = set()
        self.status_queue = Queue()
        self.active_downloads: Dict[int, Dict] = {}
        self.wrapper = SteamCMDWrapper()
        self.setup_manager = SteamCMDSetup()
        self.is_ready = False

    async def initialize(self):
        """Initialize the server and SteamCMD setup"""
        try:
            logger.info("Starting server initialization")
            setup_success = await self.setup_manager.setup()
            self.is_ready = setup_success
            await self.broadcast_message(
                {
                    "type": "server_status",
                    "status": "ready" if setup_success else "failed",
                    "message": (
                        "Server initialization complete"
                        if setup_success
                        else "Server initialization failed"
                    ),
                }
            )
            return setup_success
        except Exception as e:
            logger.error(f"Initialization error: {e}")
            self.is_ready = False
            return False

    async def broadcast_message(self, message: dict) -> None:
        """Broadcast a message to all connected clients."""
        if self.clients:
            await asyncio.gather(
                *[client.send(json.dumps(message)) for client in self.clients]
            )

    async def handle_workshop_request(self, data: dict, websocket) -> None:
        """Handle workshop collection/item requests"""

        try:
            item_id = data["workshop_id"]
            scraper = WorkshopScraper()

            cached_info = scraper.cache.get_item(item_id)
            await websocket.send(
                json.dumps(
                    {
                        "type": "initial_info",
                        "item_id": item_id,
                        "data": cached_info or {"id": item_id, "status": "processing"},
                    }
                )
            )

            if data.get("is_collection"):
                task = self._process_collection(item_id, scraper, websocket)
            else:
                task = self._process_single_item(item_id, scraper, websocket)

            asyncio.create_task(task)
        except Exception as e:
            await websocket.send(json.dumps({"type": "error", "message": str(e)}))

    async def _process_single_item(
        self, item_id: str, scraper: WorkshopScraper, websocket
    ) -> None:
        async with aiohttp.ClientSession() as session:
            item = await scraper.process_item_recursively(session, item_id)
            if item:
                await websocket.send(
                    json.dumps(
                        {"type": "item_info", "item_id": item_id, "data": item.__dict__}
                    )
                )

                # Start download if needed
                await self.handle_download_request(
                    {
                        "type": "download",
                        "app_id": "108600",
                        "workshop_ids": [item_id],
                        "destination": "mods/",
                    },
                    websocket,
                )

    async def _process_collection(
        self, collection_id: str, scraper: WorkshopScraper, websocket
    ) -> None:
        collection = await scraper.get_collection_info(collection_id)
        if collection:
            await websocket.send(
                json.dumps(
                    {
                        "type": "collection_info",
                        "collection_id": collection_id,
                        "data": collection.__dict__,
                    }
                )
            )

            if collection.items:
                workshop_ids = [item.id for item in collection.items]
                await self.handle_download_request(
                    {
                        "type": "download",
                        "app_id": "108600",
                        "workshop_ids": workshop_ids,
                        "destination": "mods/",
                    },
                    websocket,
                )

    async def handle_download_request(self, message: dict, websocket) -> None:
        """Handle download requests for Steam Workshop items."""
        try:
            logger.info(f"Processing download request: {message}")

            # Validate required fields
            required_fields = ["app_id", "workshop_ids", "destination"]
            if not all(field in message for field in required_fields):
                raise ValueError(
                    f"Missing required fields. Required: {required_fields}"
                )

            # Create download request
            request = DownloadRequest(
                type=message["type"],
                app_id=message["app_id"],
                workshop_ids=message["workshop_ids"],
                destination=message["destination"],
            )

            logger.info(
                f"Starting download for app_id: {request.app_id}, "
                f"workshop_ids: {request.workshop_ids}"
            )

            # Update active downloads
            download_id = len(self.active_downloads) + 1
            self.active_downloads[download_id] = {
                "status": "in_progress",
                "app_id": request.app_id,
                "workshop_ids": request.workshop_ids,
            }

            # Broadcast download start
            await self.broadcast_message(
                {
                    "type": "download_started",
                    "download_id": download_id,
                    "details": self.active_downloads[download_id],
                }
            )

            result = await self.wrapper.download_batch(
                request.app_id, request.workshop_ids, request.destination, websocket
            )

            # Update download status
            self.active_downloads[download_id]["status"] = "completed"

            logger.info(f"Download completed successfully: {result}")
            await websocket.send(
                json.dumps(
                    {
                        "type": "download_complete",
                        "download_id": download_id,
                        "result": result,
                    }
                )
            )

        except Exception as e:
            logger.error(f"Download error: {e}")
            if "download_id" in locals():
                self.active_downloads[download_id]["status"] = "failed"
                self.active_downloads[download_id]["error"] = str(e)

            await websocket.send(json.dumps({"type": "error", "message": str(e)}))

    async def handle_status_request(self, websocket) -> None:
        """Handle status request with active downloads info."""
        status = {
            "type": "status",
            "active_downloads": self.active_downloads,
            "server_status": "ready",
        }
        await websocket.send(json.dumps(status))

    async def handle_server_status_request(self, websocket) -> None:
        """Handle server status request to check if server is operational."""
        status = {
            "type": "server_status",
            "operational": self.is_ready,
            "message": (
                "Server is operational and ready"
                if self.is_ready
                else "Server is not ready or initialization failed"
            ),
            "timestamp": datetime.datetime.now().isoformat(),
        }
        await websocket.send(json.dumps(status))

    async def handle_client(self, websocket):
        """Handle individual client connections and messages."""
        try:
            logger.info("New client connected")
            self.clients.add(websocket)

            async for message in websocket:
                try:
                    logger.info(f"Received Message: {type(message)}")

                    # Ensure data is a dictionary
                    if isinstance(message, str):
                        data = json.loads(message)
                        if isinstance(data, str):  # If still string, try parsing again
                            data = json.loads(data)
                    else:
                        data = message

                    logger.info(f"Processed Message: {type(data)}")
                    logger.info(f"Received data: {data}")

                    message_type = data.get("type") if isinstance(data, dict) else None

                    if message_type == "download":
                        await self.handle_download_request(data, websocket)
                    elif message_type == "status":
                        await self.handle_status_request(websocket)
                    elif message_type == "server_status":
                        await self.handle_server_status_request(websocket)
                    elif message_type == "workshop":
                        await self.handle_workshop_request(data, websocket)
                    else:
                        logger.warning(f"Unknown message type received: {message_type}")
                        await websocket.send(
                            json.dumps(
                                {"type": "error", "message": "Unknown message type"}
                            )
                        )
                except json.JSONDecodeError as e:
                    logger.error(f"Invalid JSON received: {e}")
                    await websocket.send(
                        json.dumps({"type": "error", "message": "Invalid JSON format"})
                    )
                except Exception as e:
                    logger.error(f"Error handling message: {e}")
                    await websocket.send(
                        json.dumps({"type": "error", "message": str(e)})
                    )
        finally:
            self.clients.remove(websocket)

    def start(self):
        """Start the WebSocket server."""
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        try:
            loop.run_until_complete(self.initialize())  # Initialize first
            loop.run_until_complete(self._start_server())
        except Exception as e:
            logger.error(f"Server error occurred: {str(e)}")
        finally:
            loop.close()

    async def _start_server(self):
        """Internal method to start websocket server."""
        logger.info("Initializing WebSocket server")
        async with websockets.serve(self.handle_client, self.host, self.port) as server:
            logger.info(
                f"WebSocket server is running and listening on {self.host}:{self.port}"
            )
            await asyncio.Future()  # run forever
