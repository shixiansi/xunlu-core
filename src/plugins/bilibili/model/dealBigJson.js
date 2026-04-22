import fs from "fs"
import bigJson from "big-json"
import { statSync } from "fs"
import path from "path"

import { getRuntimePaths } from "../../../runtime/runtime-context.js"

/**
 * 从超大 JSON 文件（数组结构）中流式搜索指定关键词（低内存占用，支持GB级文件）
 * 适配结构：数组 → 元素为 { "关键词": { target_id, target_name... } }
 * @param {Object} options - 搜索配置项
 * @param {string} options.filePath - JSON文件路径（必填）
 * @param {string} options.keyword - 要搜索的关键词（必填）
 * @param {boolean} [options.showProgress=true] - 是否显示解析进度
 * @param {number} [options.chunkSize=1024*1024] - 解析块大小（默认1MB）
 * @returns {Promise<Array>} 匹配的结果数组，每个元素包含path/key/value/fullItem
 * @throws {Error} 当文件不存在、解析失败时抛出错误
 */
async function searchBigJson({ filePath, keyword, showProgress = true, chunkSize = 1024 * 1024 }) {
  // 校验必填参数
  if (!filePath) throw new Error("❌ 缺少必填参数：filePath（JSON文件路径）")
  if (!keyword) throw new Error("❌ 缺少必填参数：keyword（搜索关键词）")

  // 初始化变量
  const matchedResults = [] // 存储最终匹配结果
  let fileTotalSize = 0 // 文件总大小（用于计算进度）
  let readBytes = 0 // 已读取字节数
  let currentArrayItem = null // 临时存储当前数组元素（完整对象）

  // 1. 获取文件大小（用于进度计算）
  try {
    fileTotalSize = statSync(filePath).size
  } catch (err) {
    throw new Error(`❌ 获取文件信息失败：${err.message}`)
  }

  // 2. 创建流式解析器
  const parseStream = bigJson.createParseStream({ chunkSize })
  const readStream = fs.createReadStream(filePath, "utf8")
  const medallistDir = getRuntimePaths().getPluginDataDir("bilibili", "medallist")

  // 返回Promise，封装流式操作（异步等待解析完成）
  return new Promise((resolve, reject) => {
    // ========== 核心：适配数组+键值对象的解析逻辑 ==========
    parseStream.on("data", node => {
      console.log(node)

      try {
        let list = []
        let idx = 1
        for (let n of node) {
          list.push(n)
          if (list.length >= 10000) {
            fs.writeFileSync(path.join(medallistDir, `medal_${idx}.json`), JSON.stringify(list))
            idx += 1
            list = []
          }
        }
      } catch (err) {
        console.error(`\n⚠️ 处理节点 ${node} 时出错：${err.message}`)
      }
    })

    // ========== 错误处理 ==========
    parseStream.on("error", err => {
      readStream.destroy()
      reject(new Error(`❌ JSON解析失败：${err.message}`))
    })
    readStream.on("error", err => {
      parseStream.destroy()
      reject(new Error(`❌ 读取文件失败：${err.message}`))
    })

    // ========== 解析完成 ==========
    parseStream.on("end", () => {
      if (showProgress) console.log("\n")
      console.log(`\n✅ 搜索完成！共找到 ${matchedResults.length} 个匹配结果`)
      resolve(matchedResults)
    })

    // 启动流式解析
    readStream.pipe(parseStream)
  })
}

// 导出搜索方法
export default searchBigJson
