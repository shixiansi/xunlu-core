import fetch from "node-fetch"
import fs from "fs"
import path from "path"
import Filemage from "./Filemage.js"

// 连接+响应头超时与流空闲超时：node-fetch@2 默认无任何超时，
// 服务器 stall 时 Promise 永久挂起并泄漏 socket。Node 18+ 原生 AbortController 全局可用。
const DOWNLOAD_TIMEOUT_MS = Number(process.env.XUNLU_DOWNLOAD_TIMEOUT_MS) || 30_000
const DOWNLOAD_IDLE_TIMEOUT_MS = Number(process.env.XUNLU_DOWNLOAD_IDLE_TIMEOUT_MS) || 60_000

function isPositiveFiniteNumber(value) {
  return Number.isFinite(value) && value > 0
}

function normalizeRootPath(rootPath) {
  const source = String(rootPath || "").trim()
  if (!source) return ""

  const resolved = path.resolve(source)
  return resolved.endsWith(path.sep) ? resolved : `${resolved}${path.sep}`
}

export default class Downloader {
  constructor(rootPath) {
    const normalizedRootPath = normalizeRootPath(rootPath)
    this.fileMage = new Filemage(normalizedRootPath || rootPath)
    this.rootPath = normalizeRootPath(this.fileMage.RootPath) || this.fileMage.RootPath
  }

  async downloadFile(url, savePath, options = {}) {
    const { resume = true, onProgress, maxBytes } = options
    const fullSavePath = path.join(this.rootPath, savePath)
    const saveDir = path.dirname(fullSavePath)
    this.fileMage.CreatDir(path.relative(this.rootPath, saveDir))

    const cleanupPartialFile = () => {
      try {
        if (fs.existsSync(fullSavePath)) fs.unlinkSync(fullSavePath)
      } catch {}
    }

    const sizeLimit = Number(maxBytes)
    const hasSizeLimit = isPositiveFiniteNumber(sizeLimit)

    let startByte = 0
    if (resume && this.fileMage.ExistsFile(path.relative(this.rootPath, fullSavePath))) {
      const stat = fs.statSync(fullSavePath)
      startByte = stat.size
    }

    if (hasSizeLimit && startByte > sizeLimit) {
      cleanupPartialFile()
      throw new Error(`download size exceeds limit before resume: ${startByte} > ${sizeLimit}`)
    }

    try {
      const headers = { ...options.headers }
      if (startByte > 0) headers.Range = `bytes=${startByte}-`

      // 超时控制：连接/响应头 DOWNLOAD_TIMEOUT_MS；下载流空闲 DOWNLOAD_IDLE_TIMEOUT_MS
      const controller = new AbortController()
      const timeoutTimer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)
      let idleTimer = null
      const armIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer)
        idleTimer = setTimeout(() => {
          try {
            response?.body?.destroy?.(new Error(`download idle timeout: ${DOWNLOAD_IDLE_TIMEOUT_MS}ms`))
          } catch {}
          controller.abort()
        }, DOWNLOAD_IDLE_TIMEOUT_MS)
      }

      let response
      try {
        response = await fetch(url, { headers, signal: controller.signal })
      } finally {
        clearTimeout(timeoutTimer)
      }
      if (!response.ok) {
        if (startByte > 0 && response.status !== 206) {
          return this.downloadFile(url, savePath, {
            ...options,
            resume: false,
          })
        }
        throw new Error(`request failed: ${response.status} ${response.statusText}`)
      }

      const contentLength = parseInt(response.headers.get("content-length") || "0", 10)
      const totalSize = startByte + contentLength
      if (hasSizeLimit && contentLength > 0 && totalSize > sizeLimit) {
        response.body?.destroy?.()
        cleanupPartialFile()
        throw new Error(`download size exceeds limit: ${totalSize} > ${sizeLimit}`)
      }

      const writeStream = fs.createWriteStream(fullSavePath, {
        flags: startByte > 0 ? "a" : "w",
      })

      let downloadedBytes = startByte
      try {
        await new Promise((resolve, reject) => {
          let settled = false
          let cleanupScheduled = false

          const rejectWithCleanup = err => {
            if (cleanupScheduled) return
            cleanupScheduled = true

            const finalize = () => {
              cleanupPartialFile()
              if (settled) return
              settled = true
              reject(err)
            }

            try {
              response.body?.unpipe?.(writeStream)
            } catch {}

            if (response.body && !response.body.destroyed) {
              response.body.destroy()
            }

            if (writeStream.closed) {
              finalize()
              return
            }

            writeStream.once("close", finalize)
            writeStream.destroy()
          }

          armIdleTimer()
          response.body.on("data", chunk => {
            armIdleTimer()
            downloadedBytes += chunk.length
            if (hasSizeLimit && downloadedBytes > sizeLimit) {
              rejectWithCleanup(
                new Error(`download size exceeds limit: ${downloadedBytes} > ${sizeLimit}`),
              )
              return
            }

            if (onProgress && totalSize > 0) {
              const progress = Math.min(downloadedBytes / totalSize, 1)
              onProgress(progress)
            }
          })

          response.body.pipe(writeStream)
          writeStream.on("finish", () => {
            if (settled) return
            settled = true
            resolve()
          })
          writeStream.on("error", err =>
            rejectWithCleanup(new Error(`file write failed: ${err.message}`)),
          )
          response.body.on("error", err => {
            if (cleanupScheduled || settled) return
            rejectWithCleanup(new Error(`network stream error: ${err.message}`))
          })
          response.body.on("close", () => {
            if (!settled && !cleanupScheduled) {
              rejectWithCleanup(new Error("network stream closed unexpectedly"))
            }
          })
        })
      } finally {
        if (idleTimer) clearTimeout(idleTimer)
      }

      return true
    } catch (error) {
      const reason = error?.name === "AbortError" ? `timeout after ${DOWNLOAD_TIMEOUT_MS}ms` : error?.message
      console.error(`download failed [${savePath}]: ${reason}`)
      throw new Error(`download failed [${savePath}]: ${reason}`)
    }
  }

  async batchDownload(tasks, parallel = false) {
    if (!Array.isArray(tasks) || tasks.length === 0) {
      throw new Error("download task list cannot be empty")
    }

    const results = []
    if (parallel) {
      const promises = tasks.map(async (task, index) => {
        try {
          await this.downloadFile(task.url, task.savePath, task.options)
          results[index] = undefined
        } catch (err) {
          results[index] = err
        }
      })
      await Promise.all(promises)
    } else {
      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i]
        try {
          await this.downloadFile(task.url, task.savePath, task.options)
          results[i] = undefined
        } catch (err) {
          results[i] = err
        }
      }
    }
    return results
  }

  async simpleDownload(url, savePath) {
    return this.downloadFile(url, savePath, { resume: true })
  }
}

export { normalizeRootPath }
