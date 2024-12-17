from typing import Dict, List, Optional
import os
import subprocess
import logging
import shutil
from knoxkit_steamcmd.models import (
    BatchDownloadResult,
    WorkshopItemResult,
    DownloadStatus,
)


class SteamCMDWrapper:
    def __init__(self, steamcmd_path: Optional[str] = None):
        self.steamcmd_path = steamcmd_path or os.path.join(
            os.getenv("LOCALAPPDATA", ""), "knoxkit", "steamcmd", "steamcmd.exe"
        )
        self.logger = logging.getLogger("SteamCMDWrapper")

    def _move_mod_contents(self, workshop_path: str, destination: str) -> bool:
        """Move mod contents to destination and cleanup workshop folder"""
        try:
            mods_path = os.path.join(workshop_path, "mods")
            if not os.path.exists(mods_path):
                return False

            mod_folders = [
                f
                for f in os.listdir(mods_path)
                if os.path.isdir(os.path.join(mods_path, f))
            ]

            if not mod_folders:
                return False

            mod_name = mod_folders[0]
            mod_source = os.path.join(mods_path, mod_name)
            mod_destination = os.path.join(destination, "mods", mod_name)

            os.makedirs(os.path.join(destination, "mods"), exist_ok=True)

            if os.path.exists(mod_destination):
                shutil.rmtree(mod_destination)
            shutil.move(mod_source, mod_destination)

            shutil.rmtree(workshop_path)
            return True

        except Exception as e:
            self.logger.error(f"Error moving mod contents: {e}")
            return False

    async def download_workshop_item(
        self,
        app_id: int,
        workshop_id: int,
        destination: Optional[str] = None,
        websocket=None,
    ) -> WorkshopItemResult:
        """Download a single workshop item using SteamCMD"""
        result: WorkshopItemResult = {
            "success": False,
            "path": "",
            "size": 0,
            "status": DownloadStatus.PENDING.value,
            "error": None,
            "info": None,
        }

        cmd = [
            self.steamcmd_path,
            "+@NoPromptForPassword",
            "1",
            "+login",
            "anonymous",
            "+workshop_download_item",
            str(app_id),
            str(workshop_id),
            "+quit",
        ]

        try:
            result["status"] = DownloadStatus.DOWNLOADING.value

            async def send_status():
                if websocket:
                    await websocket.send(
                        {
                            "type": "download_progress",
                            "workshop_id": workshop_id,
                            "status": result["status"],
                        }
                    )

            await send_status()

            with subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
                universal_newlines=True,
            ) as process:
                if process.stdout is None:
                    raise Exception("Failed to get process output")

                download_failed = False
                download_path = ""
                download_size = 0

                for line in process.stdout:
                    line = line.strip()

                    if "ERROR! Download item" in line and "failed" in line:
                        download_failed = True
                        result["error"] = line
                        break

                    elif "Success. Downloaded item" in line:
                        try:
                            parts = line.split('"')
                            download_path = parts[1]
                            size_part = parts[2].strip(" ()").split()[0]
                            download_size = int(size_part)
                        except (IndexError, ValueError) as e:
                            self.logger.error(f"Failed to parse success line: {line}")
                            download_failed = True
                            result["error"] = f"Failed to parse download info: {e}"
                            break

                return_code = process.wait()

                if return_code == 0 and not download_failed:
                    result["success"] = True
                    result["path"] = download_path
                    result["size"] = download_size
                    result["status"] = DownloadStatus.COMPLETED.value

                    if destination and download_path:
                        move_success = self._move_mod_contents(
                            download_path, destination
                        )
                        if move_success:
                            result["path"] = os.path.join(destination, "mods")
                        else:
                            result["success"] = False
                            result["error"] = "Failed to move mod contents"
                            result["status"] = DownloadStatus.FAILED.value
                else:
                    result["status"] = DownloadStatus.FAILED.value
                    if not result["error"]:
                        result["error"] = (
                            f"Process failed with return code: {return_code}"
                        )

                await send_status()

        except Exception as e:
            result["error"] = str(e)
            result["status"] = DownloadStatus.FAILED.value
            self.logger.error(f"Error downloading workshop item {workshop_id}: {e}")
            await send_status()

        return result

    async def download_batch(
        self,
        app_id: int,
        workshop_ids: List[int],
        destination: Optional[str] = None,
        websocket=None,
    ) -> BatchDownloadResult:
        """Download multiple workshop items in sequence"""
        results = {}
        failed = 0
        total = len(workshop_ids)

        for index, workshop_id in enumerate(workshop_ids, 1):
            if websocket:
                await websocket.send(
                    {
                        "type": "batch_progress",
                        "current": index,
                        "total": total,
                        "workshop_id": workshop_id,
                    }
                )

            result = await self.download_workshop_item(
                app_id, workshop_id, destination, websocket
            )
            results[workshop_id] = result
            if not result["success"]:
                failed += 1

        return {
            "items": results,
            "total": total,
            "completed": total - failed,
            "failed": failed,
        }
