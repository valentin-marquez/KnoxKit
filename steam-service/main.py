# main.py
import os
import sys
import signal
from pathlib import Path
from knoxkit_steamcmd.server import SteamCMDWebSocketServer
from knoxkit_steamcmd.config import ConfigManager
from knoxkit_steamcmd.logmanager import LogManager

logger = LogManager.get_logger("SteamCMDManager")


def signal_handler(sig, frame):
    logger.info("Shutting down KnoxKit SteamCMD Manager...")
    logger.debug(f"Received signal: {sig}")
    sys.exit(0)


def main():
    logger.info("Initializing KnoxKit SteamCMD Manager")

    # Register signal handlers
    logger.debug("Registering signal handlers")
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    try:
        logger.info("Loading configuration or creating default")
        ConfigManager()

        logger.info("Creating WebSocket server")
        server = SteamCMDWebSocketServer()

        logger.info("Starting WebSocket server")
        server.start()

    except KeyboardInterrupt:
        logger.info("Received keyboard interrupt")
        sys.exit(0)
    except Exception as e:
        logger.error(f"Failed to start server: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
