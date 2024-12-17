from pathlib import Path
import json
import os
import uuid
from typing import Dict, Any
from .utils import SteamPathFinder


class ConfigManager:
    """
    Manages KnoxKit configuration and directory structure.
    """

    def __init__(self):
        self.config_dir = Path(os.getenv("LOCALAPPDATA", ""), "knoxkit")
        self.config_file = self.config_dir / "config.json"
        self.steamcmd_dir = self.config_dir / "steamcmd"
        self.instances_dir = self.config_dir / "instances"
        self.first_run = not self.config_file.exists()
        self.ensure_dirs()
        self.load_config()
        self.is_ready = self.check_if_ready()

    def check_if_ready(self) -> bool:
        """Check if KnoxKit is ready to run"""
        if not self.config.get("steamcmd_setup"):
            return False
        steamcmd_exe = Path(self.steamcmd_dir) / "steamcmd.exe"
        return steamcmd_exe.exists()

    def ensure_dirs(self) -> None:
        """Creates necessary directory structure for KnoxKit"""
        for directory in [
            self.config_dir,  # Main application directory
            self.steamcmd_dir,  # SteamCMD installation
            self.instances_dir,  # Game instances
            self.config_dir / "logs",  # Application logs
            self.config_dir / "profiles",  # Mod profiles
        ]:
            directory.mkdir(parents=True, exist_ok=True)

    def load_config(self) -> Dict[str, Any]:
        """
        Loads or creates default configuration.
        """
        if not self.config_file.exists():
            # Get game installation info
            game_info = SteamPathFinder.find_project_zomboid()

            self.config = {
                "version": "0.1.0",
                "steamcmd_setup": False,
                "last_run": None,
                "websocket": {"host": "localhost", "port": 16271},
                "auth": {"token": str(uuid.uuid4())},
                "paths": {
                    "steamcmd": str(self.steamcmd_dir),
                    "instances": str(self.instances_dir),
                    "logs": str(self.config_dir / "logs"),
                    "game": game_info["path"] if game_info else None,
                    "game_executable": game_info["executable"] if game_info else None,
                },
                "instances": {
                    "default_settings": {
                        "memory": 4096,
                        "java_args": "-Xms2048m -Xmx4096m",
                        "priority": "normal",
                    }
                },
                "downloads": {
                    "concurrent_limit": 1,
                    "retry_attempts": 3,
                    "verify_integrity": True,
                },
                "performance": {
                    "auto_adjust": True,
                    "presets": {
                        "low": {"memory": 2048, "java_args": "-Xms1024m -Xmx2048m"},
                        "medium": {"memory": 4096, "java_args": "-Xms2048m -Xmx4096m"},
                        "high": {"memory": 8192, "java_args": "-Xms4096m -Xmx8192m"},
                    },
                },
            }
            self.save_config()
        else:
            with open(self.config_file) as f:
                self.config = json.load(f)

            # Update with new fields if needed
            self._update_config_structure()

        return self.config

    def _update_config_structure(self):
        """Update config with new fields while preserving existing values"""
        # Define default structure
        default_structure = {
            "version": "0.1.0",
            "websocket": {"host": "localhost", "port": 16271},
            "auth": {"token": str(uuid.uuid4())},
            "paths": {
                "steamcmd": str(self.steamcmd_dir),
                "instances": str(self.instances_dir),
                "logs": str(self.config_dir / "logs"),
            },
            "instances": {
                "default_settings": {
                    "memory": 4096,
                    "java_args": "-Xms2048m -Xmx4096m",
                    "priority": "normal",
                }
            },
        }

        # Recursively update missing fields
        def update_dict(current, default):
            updated = False
            for key, value in default.items():
                if key not in current:
                    current[key] = value
                    updated = True
                elif isinstance(value, dict) and isinstance(current[key], dict):
                    if update_dict(current[key], value):
                        updated = True
            return updated

        if update_dict(self.config, default_structure):
            self.save_config()

    def save_config(self):
        """Save configuration to file"""
        with open(self.config_file, "w") as f:
            json.dump(self.config, f, indent=2)

    def get_instance_path(self, instance_id: str) -> Path:
        """Get path for a specific instance"""
        return Path(self.config["paths"]["instances"]) / instance_id

    def get_value(self, key: str, default: Any = None) -> Any:
        """Get config value using dot notation"""
        keys = key.split(".")
        value = self.config
        for k in keys:
            if not isinstance(value, dict) or k not in value:
                return default
            value = value[k]
        return value

    def update_config(self, key: str, value: Any):
        """Update config value using dot notation"""
        keys = key.split(".")
        config = self.config
        for k in keys[:-1]:
            if k not in config:
                config[k] = {}
            config = config[k]
        config[keys[-1]] = value
        self.save_config()
