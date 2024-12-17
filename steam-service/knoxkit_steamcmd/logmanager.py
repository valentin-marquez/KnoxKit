import logging
import os
from pathlib import Path
from typing import Optional


class LogManager:
    _instance: Optional["LogManager"] = None

    def __init__(self):
        self.log_dir = Path(os.getenv("LOCALAPPDATA", "")) / "knoxkit" / "logs"
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.log_file = self.log_dir / "knoxkit-steamcmd.log"

        # Set up root logger
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s [%(name)s] [%(levelname)s] %(message)s",
            handlers=[logging.FileHandler(self.log_file), logging.StreamHandler()],
        )

    @classmethod
    def get_logger(cls, module_name: str) -> logging.Logger:
        """Get a logger for a specific module"""
        if not cls._instance:
            cls._instance = LogManager()

        logger = logging.getLogger(module_name)
        return logger
