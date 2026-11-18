import fetch from "node-fetch"
import fs from "fs"
import path from "path"
import Filemage from "./Filemage.js"

// 连接+响应头超时与流空闲超时：node-fetch@2 默认无任何超时，
// 服务器 stall 时 Promise 永久挂起并泄漏 socket。Node 18+ 原生 AbortController 全局可用。
const DOWNLOAD_TIMEOUT_MS = Number(process.env.XUNLU_DOWNLOAD_TIMEOUT_MS) || 30_000
const DOWNLOAD_IDLE_TIMEOUT_MS = Number(process.env.XUNLU_DOWNLOAD_IDLE_TIMEOUT_MS) || 60_000
// 网络类失败（超时/停滞/断流）的自动断点续传重试次数
const DOWNLOAD_RETRIES = Number(process.env.XUNLU_DOWNLOAD_RETRIES ?? 2)

function isPositiveFiniteNumber(value) {
  return Number.isFinite(value) && value > 0
}

function normalizeRootPath(rootPath) {
  const source = String(rootPath || "").trim()
  if (!source) return ""

  const resolved = path.resolve(source)
  return resolved.endsWith(path.sep) ? resolved : `${resolved}${path.sep}`
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export default class Downloader {
  constructor(rootPath) {
    const normalizedRootPath = normalizeRootPath(rootPath)
    this.fileMage = new Filemage(normalizedRootPath || rootPath)
    this.rootPath = normalizeRootPath(this.fileMage.RootPath) || this.fileMage.RootPath
  }

  /**
   * 下载入口：网络类失败自动保留半截文件并断点续传重试（默认 2 次）。
   * 不可重试的错误（HTTP 状态错误、超限、写盘失败）立即删除残留并抛出。
   */
  async downloadFile(url, savePath, options = {}) {
    const maxRetries = Number.isFinite(Number(options.retries))
      ? Math.max(0, Number(options.retries))
      : DOWNLOAD_RETRIES

    let lastError = null
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.#downloadOnce(url, savePath, options)
      } catch (err) {
        lastError = err
        const cleanupOnly = () => {
          try {
            const fullPath = path.join(this.rootPath, savePath)
            if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath)
          } catch {}
        }
        if (!err.retryable) {
          cleanupOnly()
          break
        }
        if (attempt < maxRetries) {
          try {
            globalThis.logger?.debug?.(
              `[download] ${savePath} 第${attempt + 1}次失败（${err.message}），断点续传重试…`,
            )
          } catch {}
          await sleep(300 * (attempt + 1))
        }
      }
    }

    // 重试耗尽：清掉残留的部分文件，避免下次同名请求拿到坏半截
    try {
      const fullPath = path.join(this.rootPath, savePath)
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath)
    } catch {}

    const reason = lastError?.message || String(lastError)
    console.error(`download failed [${savePath}]: ${reason}`)
    const wrapped = new Error(`download failed [${savePath}]: ${reason}`)
    wrapped.cause = lastError
    throw wrapped
  }

  async #downloadOnce(url, savePath, options = {}) {
    const {
      resume = true,
      onProgress,
      maxBytes,
      timeoutMs = DOWNLOAD_TIMEOUT_MS,
      idleTimeoutMs = DOWNLOAD_IDLE_TIMEOUT_MS,
    } = options
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
      const err = new Error(
        `download size exceeds limit before resume: ${startByte} > ${sizeLimit}`,
      )
      err.retryable = false
      throw err
    }

    const headers = { ...options.headers }
    if (startByte > 0) headers.Range = `bytes=${startByte}-`

    // 超时控制：连接/响应头 timeoutMs；下载流空闲 idleTimeoutMs。
    // abort 前先记录原因，报错时映射成人话，避免 "The user aborted a request" 这种黑话
    let abortedBy = ""
    const controller = new AbortController()
    const timeoutTimer = setTimeout(() => {
      abortedBy = "connect"
      controller.abort()
    }, timeoutMs)
    let idleTimer = null
    const clearIdleTimer = () => {
      if (idleTimer) {
        clearTimeout(idleTimer)
        idleTimer = null
      }
    }
    const armIdleTimer = () => {
      clearIdleTimer()
      idleTimer = setTimeout(() => {
        abortedBy = "idle"
        controller.abort()
      }, idleTimeoutMs)
    }

    let response
    try {
      response = await fetch(url, { headers, signal: controller.signal })
    } catch (err) {
      clearTimeout(timeoutTimer)
      clearIdleTimer()
      const retryable = err?.name === "AbortError" || abortedBy !== ""
      const message =
        abortedBy === "connect"
          ? `连接超时：${timeoutMs}ms 内未收到响应`
          : `请求失败：${err?.message || err}`
      const wrapped = new Error(message)
      wrapped.retryable = retryable
      throw wrapped
    } finally {
      clearTimeout(timeoutTimer)
    }

    if (!response.ok) {
      if (startByte > 0 && response.status !== 206) {
        // 服务器不支持 Range：清掉半截，从头重下一次（不计入重试次数）
        cleanupPartialFile()
        return this.#downloadOnce(url, savePath, { ...options, resume: false })
      }
      const err = new Error(`request failed: ${response.status} ${response.statusText}`)
      err.retryable = false
      throw err
    }

    const contentLength = parseInt(response.headers.get("content-length") || "0", 10)
    const totalSize = startByte + contentLength
    if (hasSizeLimit && contentLength > 0 && totalSize > sizeLimit) {
      response.body?.destroy?.()
      const err = new Error(`download size exceeds limit: ${totalSize} > ${sizeLimit}`)
      err.retryable = false
      throw err
    }

    const writeStream = fs.createWriteStream(fullSavePath, {
      flags: startByte > 0 ? "a" : "w",
    })

    let downloadedBytes = startByte
    try {
      await new Promise((resolve, reject) => {
        let settled = false
        let cleanupScheduled = false
        let streamEnded = false

        const rejectWith = err => {
          if (cleanupScheduled) return
          cleanupScheduled = true

          const finalize = () => {
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

          // 只负责关流；半截文件的删除/保留统一交给 downloadFile 按 err.retryable 决定
          if (writeStream.closed) {
            finalize()
            return
          }

          writeStream.once("close", finalize)
          writeStream.destroy()
        }

        const finishOk = () => {
          if (settled || cleanupScheduled) return
          settled = true
          streamEnded = true
          clearIdleTimer()
          try {
            response.body?.unpipe?.(writeStream)
          } catch {}
          if (!writeStream.writableEnded) {
            writeStream.end(() => {
              if (!response.body.destroyed) response.body.destroy()
              resolve()
            })
          } else {
            if (!response.body.destroyed) response.body.destroy()
            resolve()
          }
        }

        armIdleTimer()
        response.body.on("data", chunk => {
          armIdleTimer()
          downloadedBytes += chunk.length

          // 快速完成判定：已收满 content-length 声明的字节即视为成功。
          // 部分 CDN（如 B 站）传完后不发 end、提前半关 socket，
          // node-fetch@2 对此不触发任何事件，只能等空闲超时误报 "user aborted"。
          // 用 setImmediate 延后收尾，让 pipe 先把当前 chunk 写入文件。
          if (contentLength > 0 && downloadedBytes >= totalSize) {
            setImmediate(finishOk)
            return
          }

          if (hasSizeLimit && downloadedBytes > sizeLimit) {
            const err = new Error(
              `download size exceeds limit: ${downloadedBytes} > ${sizeLimit}`,
            )
            err.retryable = false
            rejectWith(err)
            return
          }

          if (onProgress && totalSize > 0) {
            const progress = Math.min(downloadedBytes / totalSize, 1)
            onProgress(progress)
          }
        })

        response.body.pipe(writeStream)
        response.body.on("end", () => {
          // 传输完整：后续 close 属正常收尾，不得判为截断
          streamEnded = true
          clearIdleTimer()
        })
        writeStream.on("finish", () => {
          if (settled) return
          if (contentLength > 0 && downloadedBytes < totalSize) {
            // end/finish 都发了但字节数不足（异常代理/服务端 bug）→ 可续传重试
            const err = new Error(
              `传输不完整：${downloadedBytes}/${totalSize} 字节，等待断点续传`,
            )
            err.retryable = true
            rejectWith(err)
            return
          }
          settled = true
          resolve()
        })
        writeStream.on("error", err => {
          const wrapped = new Error(`file write failed: ${err.message}`)
          wrapped.retryable = false
          rejectWith(wrapped)
        })
        response.body.on("error", err => {
          if (cleanupScheduled || settled) return
          let message
          if (abortedBy === "idle") {
            message = `下载停滞：${idleTimeoutMs}ms 无数据传输（已下载 ${downloadedBytes}${
              contentLength > 0 ? `/${totalSize}` : ""
            } 字节）`
          } else if (abortedBy === "connect" || err?.name === "AbortError") {
            message = `请求被中止：${err?.message || err}`
          } else {
            message = `网络传输错误：${err?.message || err}（已下载 ${downloadedBytes} 字节）`
          }
          const wrapped = new Error(message)
          wrapped.retryable = true
          rejectWith(wrapped)
        })
        response.body.on("close", () => {
          // close 在成功路径上常先于 writeStream.finish 触发，
          // 只有 end 从未触发（真截断/提前关连接）才视为异常
          if (!streamEnded && !settled && !cleanupScheduled) {
            const err = new Error(
              `连接在传输完成前被关闭：${downloadedBytes}/${
                contentLength > 0 ? totalSize : "?"
              } 字节（已下载部分将用于断点续传）`,
            )
            err.retryable = true
            rejectWith(err)
          }
        })
      })
    } finally {
      clearIdleTimer()
      // 失败且可重试：保留半截文件；其余情况由 downloadFile 决定删除，
      // 这里统一不删，避免 downloadFile 与这里双重语义打架
    }

    return true
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
