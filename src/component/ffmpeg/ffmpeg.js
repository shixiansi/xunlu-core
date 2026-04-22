import { createRequire } from "module"
import fs from "node:fs"

const require = createRequire(import.meta.url)
const { execFile, spawn } = require("child_process")

function truncateOutput(text = "", maxLength = 1200) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim()
  if (!normalized) return ""
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 1)}…`
}

function buildFfmpegFailure(label, args = [], { code, signal, stderr, stdout } = {}) {
  const stderrText = truncateOutput(stderr)
  const stdoutText = truncateOutput(stdout)
  const detail = stderrText || stdoutText
  const message = `${label}失败：ffmpeg exited with code ${code}${signal ? ` (signal: ${signal})` : ""}${detail ? ` | ${detail}` : ""}`
  const err = new Error(message)
  err.label = label
  err.exitCode = code
  err.signal = signal
  err.stderr = String(stderr || "")
  err.stdout = String(stdout || "")
  err.command = ["ffmpeg", ...args]
  return err
}

function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch {}
}

class ffmpeg {
  run(args = [], { label = "ffmpeg" } = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn("ffmpeg", args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      })
      let stdout = ""
      let stderr = ""

      child.stdout?.on("data", chunk => {
        stdout += String(chunk || "")
      })
      child.stderr?.on("data", chunk => {
        stderr += String(chunk || "")
      })

      child.once("error", err => {
        const wrapped = new Error(`${label}失败：${err?.message || err}`)
        wrapped.cause = err
        wrapped.label = label
        wrapped.command = ["ffmpeg", ...args]
        reject(wrapped)
      })

      child.once("close", code => {
        if (code !== 0) {
          const err = buildFfmpegFailure(label, args, { code, stdout, stderr })
          reject(err)
          return
        }
        resolve({
          ok: true,
          code: 0,
          stdout,
          stderr,
        })
      })
    })
  }

  checkEnv() {
    return new Promise(resolve => {
      execFile("ffmpeg", ["-version"], err => {
        if (err) {
          logger.error("ffmpeg 未安装或不可用")
          resolve(false)
          return
        }
        resolve(true)
      })
    })
  }

  async muxVideoAndAudio(videoPath = "", audioPath = "", resultPath = "") {
    const attempts = [
      {
        label: "视频合成(直拷贝)",
        args: [
          "-y",
          "-i",
          videoPath,
          "-i",
          audioPath,
          "-map",
          "0:v:0",
          "-map",
          "1:a:0",
          "-c:v",
          "copy",
          "-c:a",
          "copy",
          "-movflags",
          "+faststart",
          "-shortest",
          resultPath,
        ],
      },
      {
        label: "视频合成(音频转码)",
        args: [
          "-y",
          "-i",
          videoPath,
          "-i",
          audioPath,
          "-map",
          "0:v:0",
          "-map",
          "1:a:0",
          "-c:v",
          "copy",
          "-c:a",
          "aac",
          "-b:a",
          "192k",
          "-movflags",
          "+faststart",
          "-shortest",
          resultPath,
        ],
      },
      {
        label: "视频合成(全量转码)",
        args: [
          "-y",
          "-i",
          videoPath,
          "-i",
          audioPath,
          "-map",
          "0:v:0",
          "-map",
          "1:a:0",
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-b:a",
          "192k",
          "-movflags",
          "+faststart",
          "-shortest",
          resultPath,
        ],
      },
    ]

    let lastError = null
    for (let index = 0; index < attempts.length; index += 1) {
      const attempt = attempts[index]
      try {
        safeUnlink(resultPath)
        const result = await this.run(attempt.args, { label: attempt.label })
        return {
          ...result,
          attempt: attempt.label,
        }
      } catch (err) {
        lastError = err
        safeUnlink(resultPath)
        if (index < attempts.length - 1) {
          logger.warn?.(
            `[ffmpeg] ${attempt.label}失败，尝试兜底方案：${err?.message || err}`,
          )
        }
      }
    }

    throw lastError || new Error("视频合成失败：未知 ffmpeg 错误")
  }

  VideoComposite(path = "", path2 = "", resultPath = "", suc, faith = () => {}) {
    return this.muxVideoAndAudio(path, path2, resultPath)
      .then(async result => {
        logger.info(`[ffmpeg] 视频合成成功：${result?.attempt || "默认策略"}`)
        await suc()
      })
      .catch(async err => {
        logger.error("[ffmpeg] 视频合成失败", err)
        await faith(err)
      })
  }

  async saveVideoClip(input = "", resultPath = "", options = {}) {
    const durationSec = Math.max(1, Math.floor(Number(options.durationSec) || 10))
    return await this.run(
      [
        "-y",
        "-i",
        input,
        "-t",
        String(durationSec),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        resultPath,
      ],
      { label: "直播切片" },
    )
  }
}

export default new ffmpeg()
