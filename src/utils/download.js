import fetch from "node-fetch"
import fs from "fs"
import path from "path"
import Filemage from "./Filemage.js"

function isPositiveFiniteNumber(value) {
  return Number.isFinite(value) && value > 0
}

export default class Downloader {
  constructor(rootPath) {
    this.fileMage = new Filemage(rootPath)
    this.rootPath = this.fileMage.RootPath
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

      const response = await fetch(url, { headers })
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

        response.body.on("data", chunk => {
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
      })

      return true
    } catch (error) {
      console.error(`download failed [${savePath}]: ${error.message}`)
      throw error
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
