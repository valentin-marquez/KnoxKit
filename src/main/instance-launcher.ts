import { spawn } from "child_process"
import path from "path"
import { readConfig } from "./config"

interface LaunchOptions {
  instanceId: string
  instancePath: string
  memory?: number
  javaArgs?: string
}

export class InstanceLauncher {
  private config = readConfig()

  private sanitizePath(path: string): string {
    return path.replace(/['"]/g, "").replace(/\\/g, "/")
  }

  async launch({
    instanceId,
    instancePath,
    memory = 4096,
    javaArgs = ""
  }: LaunchOptions): Promise<{ success: boolean; processId?: number; error?: string }> {
    if (!this.config.paths.game_executable) {
      throw new Error("Game executable path not configured")
    }

    // Sanitize paths
    const sanitizedInstancePath = this.sanitizePath(instancePath)
    const cacheDir = this.sanitizePath(path.join(sanitizedInstancePath))
    const modsPath = this.sanitizePath(path.join(sanitizedInstancePath, "mods"))

    // Build the arguments array
    const args: string[] = [
      // JVM arguments for memory
      `-Xms${memory}m`,
      `-Xmx${memory}m`,
      // Add any custom JVM arguments
      ...javaArgs.split(" ").filter((arg) => arg),
      // Separator between JVM and game arguments
      "--",
      // Game arguments
      `-cachedir=${cacheDir}`, // Removed quotes here
      "-modfolders",
      "mods"
      // Additional game parameters can be added here
    ]

    try {
      const gameProcess = spawn(this.config.paths.game_executable, args, {
        cwd: path.dirname(this.config.paths.game_executable),
        env: {
          ...process.env,
          PZ_INSTANCE_ID: instanceId,
          PZ_MODS_PATH: modsPath
        },
        stdio: ["ignore", "pipe", "pipe"]
      })

      // Handle process events
      gameProcess.on("error", (error) => {
        console.error("Failed to start game process:", error)
        throw error
      })

      gameProcess.stdout?.on("data", (data) => {
        console.log(`Game stdout: ${data}`)
      })

      gameProcess.stderr?.on("data", (data) => {
        console.error(`Game stderr: ${data}`)
      })

      gameProcess.on("close", (code) => {
        console.log(`Game process exited with code ${code}`)
      })

      return {
        success: true,
        processId: gameProcess.pid
      }
    } catch (error) {
      console.error("Error launching instance:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred"
      }
    }
  }

  async stop(processId: number): Promise<{ success: boolean; error?: string }> {
    try {
      process.kill(processId)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to stop process"
      }
    }
  }
}
