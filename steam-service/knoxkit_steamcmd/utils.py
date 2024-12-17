import os
import platform
import winreg
import vdf

def get_workshop_content_path(app_id: int, workshop_id: int) -> str:
    """Get the default Steam workshop content path for an item"""
    return os.path.join(
        os.getenv("LOCALAPPDATA", ""),
        "knoxkit", "steamcmd", "steamapps", "workshop",
        "content", str(app_id), str(workshop_id)
    )


class SteamPathFinder:
    @staticmethod
    def is_64bit_windows():
        return platform.machine().endswith('64')

    @staticmethod
    def get_steam_path():
        try:
            # Intentar primero el registro de 64 bits
            key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Wow6432Node\Valve\Steam")
            steam_path = winreg.QueryValueEx(key, "InstallPath")[0]
            winreg.CloseKey(key)
            return steam_path
        except:
            try:
                # Si falla, intentar el registro de 32 bits
                key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Valve\Steam")
                steam_path = winreg.QueryValueEx(key, "InstallPath")[0]
                winreg.CloseKey(key)
                return steam_path
            except:
                return None

    @staticmethod
    def get_library_folders(steam_path):
        library_folders = [steam_path]
        vdf_path = os.path.join(steam_path, 'steamapps', 'libraryfolders.vdf')

        try:
            with open(vdf_path) as f:
                data = vdf.load(f)
                # Manejar el nuevo formato de libraryfolders.vdf
                if 'libraryfolders' in data:
                    for _, library in data['libraryfolders'].items():
                        if isinstance(library, dict) and 'path' in library:
                            library_folders.append(library['path'])
                        elif isinstance(library, str) and not library.isdigit():
                            library_folders.append(library)
        except:
            pass

        return library_folders

    @staticmethod
    def find_game_installation(library_folders, app_id):
        for library in library_folders:
            # Buscar el archivo de manifiesto del juego
            manifest_path = os.path.join(library, 'steamapps', f'appmanifest_{app_id}.acf')
            if os.path.exists(manifest_path):
                game_path = os.path.join(library, 'steamapps', 'common', 'ProjectZomboid')
                if os.path.exists(game_path):
                    return game_path
        return None

    @staticmethod
    def find_project_zomboid():
        steam_path = SteamPathFinder.get_steam_path()
        if not steam_path:
            return None

        library_folders = SteamPathFinder.get_library_folders(steam_path)
        # Project Zomboid's Steam App ID
        pz_path = SteamPathFinder.find_game_installation(library_folders, "108600")

        if pz_path:
            is_64bit = SteamPathFinder.is_64bit_windows()
            exe_name = 'ProjectZomboid64.exe' if is_64bit else 'ProjectZomboid32.exe'
            exe_path = os.path.join(pz_path, exe_name)

            # Verificar que el ejecutable exista
            if os.path.exists(exe_path):
                return {
                    'path': pz_path,
                    'executable': exe_path,
                    'architecture': '64-bit' if is_64bit else '32-bit'
                }
        return None
