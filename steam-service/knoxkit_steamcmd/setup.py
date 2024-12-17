import asyncio
import subprocess
import json
import logging
from enum import Enum
from typing import Optional, Set
from pathlib import Path
from knoxkit_steamcmd.config import ConfigManager
from knoxkit_steamcmd.logmanager import LogManager

logger = LogManager.get_logger("SteamCMDSetup")


class SetupStatus(Enum):
    PENDING = "pending"
    DOWNLOADING = "downloading"
    EXTRACTING = "extracting"
    INITIALIZING = "initializing"
    COMPLETED = "completed"
    FAILED = "failed"


class SteamCMDSetup:
    def __init__(self):
        self.config = ConfigManager()
        self.websocket_clients: Set = set()
        self.current_status = SetupStatus.PENDING
        self.progress = 0
        self.error: Optional[str] = None
        logger.info("SteamCMDSetup initialized")

    async def broadcast_status(self):
        """Broadcast current setup status to all connected clients"""
        status = {
            "type": "setup_status",
            "status": self.current_status.value,
            "progress": self.progress,
            "error": self.error,
        }
        logger.debug(f"Broadcasting status: {status}")
        if self.websocket_clients:
            await asyncio.gather(
                *[client.send(json.dumps(status)) for client in self.websocket_clients]
            )

    async def _initialize_steamcmd(self) -> bool:
        """Initialize SteamCMD after download"""
        try:
            logger.info("Starting SteamCMD initialization")
            self.current_status = SetupStatus.INITIALIZING
            await self.broadcast_status()

            # First run to trigger update
            process = await asyncio.create_subprocess_exec(
                str(Path(self.config.steamcmd_dir) / "steamcmd.exe"),
                "+quit",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            while True:
                if process.stdout is None:
                    break
                line = await process.stdout.readline()
                if not line:
                    break

                line = line.decode().strip()
                if line:
                    # Track download progress
                    if "Downloading update" in line:
                        try:
                            progress = int(line.split("[")[1].split("%")[0])
                            self.progress = progress
                            await self.broadcast_status()
                        except:
                            logger.warning("Failed to parse progress from line")
                    logger.info(f"Download progress: {self.progress}%")

            return_code = await process.wait()

            # Check if steamcmd.exe exists and is executable
            if not (self.config.steamcmd_dir / "steamcmd.exe").exists():
                logger.error("SteamCMD executable not found after initialization")
                return False

            # Success if return code is 0 or 7 (7 means success but needs restart)
            if return_code in [0, 7]:
                logger.info("SteamCMD initialization completed")
                self.current_status = SetupStatus.COMPLETED
                await self.broadcast_status()
                return True

            logger.error(
                f"SteamCMD initialization failed with return code {return_code}"
            )
            return False

        except Exception as e:
            logger.exception("Error during SteamCMD initialization")
            return False

    async def setup(self):
        """Complete setup process for SteamCMD"""
        try:
            logger.info("Starting SteamCMD setup process")
            # Reset status
            self.current_status = SetupStatus.PENDING
            self.progress = 0
            self.error = None

            # Start download if not already present
            if not (self.config.steamcmd_dir / "steamcmd.exe").exists():
                logger.info("SteamCMD not found, starting download")
                self.current_status = SetupStatus.DOWNLOADING
                await self.broadcast_status()

                # Download logic remains in _download_steamcmd
                success = await self._download_steamcmd()
                if not success:
                    logger.error("SteamCMD download failed")
                    return False

            # Initialize SteamCMD
            success = await self._initialize_steamcmd()
            if success:
                logger.info("SteamCMD setup completed successfully")
                self.config.update_config("steamcmd_setup", True)
            else:
                logger.error("SteamCMD initialization failed")

            return success

        except Exception as e:
            logger.exception("Unexpected error during SteamCMD setup")
            self.current_status = SetupStatus.FAILED
            self.error = str(e)
            await self.broadcast_status()
            return False

    async def _download_steamcmd(self):
        """Download SteamCMD zip file and extract it"""
        try:
            import requests
            import zipfile

            logger.info("Starting SteamCMD download")
            steamcmd_zip = self.config.steamcmd_dir / "steamcmd.zip"

            # Download SteamCMD
            logger.debug("Downloading from steamcdn-a.akamaihd.net")
            response = requests.get(
                "https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip",
                stream=True,
            )
            response.raise_for_status()

            total_size = int(response.headers.get("content-length", 0))
            block_size = 8192
            downloaded = 0

            logger.info(f"Starting download of {total_size} bytes")
            with open(steamcmd_zip, "wb") as f:
                for data in response.iter_content(block_size):
                    downloaded += len(data)
                    f.write(data)
                    if total_size:
                        self.progress = int((downloaded / total_size) * 100)
                        await self.broadcast_status()

            logger.info("Download completed, starting extraction")
            # Extract files
            self.current_status = SetupStatus.EXTRACTING
            self.progress = 0
            await self.broadcast_status()

            with zipfile.ZipFile(steamcmd_zip) as zip_ref:
                zip_ref.extractall(self.config.steamcmd_dir)

            steamcmd_zip.unlink()
            logger.info("SteamCMD extracted successfully")
            return True

        except Exception as e:
            logger.exception("Error during SteamCMD download")
            self.current_status = SetupStatus.FAILED
            self.error = str(e)
            await self.broadcast_status()
            return False
