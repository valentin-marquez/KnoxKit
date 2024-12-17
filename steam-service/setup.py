from cx_Freeze import setup, Executable

build_exe_options = {
    "packages": [
        "asyncio",
        "websockets",
        "aiohttp",
        "logging",
        "json",
        "requests",
        "vdf",
    ],
    "includes": ["queue", "winreg", "platform"],
    "build_exe": "knoxkit-steamcmd",
    "include_msvcr": True,
}

setup(
    name="knoxkit-steamcmd",
    version="0.1",
    packages=["knoxkit_steamcmd"],
    description="KnoxKit SteamCMD Manager",
    options={"build_exe": build_exe_options},
    executables=[
        Executable(
            "steam-service/main.py",
            target_name="knoxkit-steamcmd.exe",
            base="Win32GUI",
            icon="icon.ico",
        )
    ],
)
