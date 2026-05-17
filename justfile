set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]

# List all available recipes (default).
default:
    @just --list

# Install pinned toolchains, then remind to install JS deps.
setup:
    mise install
    @echo "Toolchains installed. Now run: bun install"

# Run the Tauri app in development mode.
dev:
    bun run tauri dev

# Build the Tauri app for release.
build:
    bun run tauri build

# Run Rust and frontend test suites.
test:
    cargo test --manifest-path src-tauri/Cargo.toml
    bun test

# Lint frontend (Biome) and Rust (clippy).
lint:
    bunx biome check .
    cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets

# Format frontend (Biome) and Rust (rustfmt).
format:
    bunx biome format --write .
    cargo fmt --manifest-path src-tauri/Cargo.toml

# Remove build artifacts.
clean:
    cargo clean --manifest-path src-tauri/Cargo.toml
    -Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
    -Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue

# Install SteamCMD into tools/ (script owned by Agent D).
steamcmd-install:
    pwsh scripts/install-steamcmd.ps1

# Run the installed SteamCMD, passing through any arguments.
steamcmd-run *ARGS:
    tools/steamcmd/steamcmd.exe {{ARGS}}
