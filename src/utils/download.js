import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import Filemage from "./Filemage.js"; // 引入你已有的文件操作类

/**
 * 下载工具类
 * 基于 node-fetch + Filemage 实现网络文件下载、断点续传、批量下载等功能
 */
export default class Downloader {
  /**
   * 构造函数
   * @param {string} rootPath 下载文件的根目录（默认当前工作目录）
   */
  constructor(rootPath) {
    this.fileMage = new Filemage(rootPath); // 复用Filemage处理文件操作
    this.rootPath = this.fileMage.RootPath;
  }

  /**
   * 单个文件下载（核心方法）
   * @param {string} url 下载链接
   * @param {string} savePath 相对根目录的保存路径（如 "downloads/test.jpg"）
   * @param {Object} options 可选配置
   * @param {boolean} options.resume 是否断点续传（默认true）
   * @param {Function} options.onProgress 进度回调函数 (progress) => {}，progress为0-1的小数
   * @returns {Promise<void>}
   */
  async downloadFile(url, savePath, options = {}) {
    const { resume = true, onProgress } = options;
    // 拼接完整保存路径
    const fullSavePath = path.join(this.rootPath, savePath);
    // 确保保存目录存在
    const saveDir = path.dirname(fullSavePath);
    this.fileMage.CreatDir(path.relative(this.rootPath, saveDir));

    let startByte = 0;
    // 断点续传：如果文件已存在，获取已下载的字节数
    if (
      resume &&
      this.fileMage.ExistsFile(path.relative(this.rootPath, fullSavePath))
    ) {
      const stat = fs.statSync(fullSavePath);
      startByte = stat.size;
    }

    try {
      // 构建请求头：断点续传需要Range
      const headers = {};
      if (startByte > 0) {
        headers.Range = `bytes=${startByte}-`;
      }

      // 发起请求
      const response = await fetch(url, { headers });
      if (!response.ok) {
        // 处理断点续传不支持的情况（状态码206是部分内容，200是完整内容）
        if (startByte > 0 && response.status !== 206) {
          console.warn(`【${savePath}】服务器不支持断点续传，重新下载整个文件`);
          return this.downloadFile(url, savePath, {
            ...options,
            resume: false,
          });
        }
        throw new Error(`请求失败：${response.status} ${response.statusText}`);
      }

      // 获取文件总大小
      const contentLength = parseInt(
        response.headers.get("content-length") || "0",
        10
      );
      const totalSize = startByte + contentLength;

      // 创建可写流（断点续传用append模式，否则用write模式）
      const writeStream = fs.createWriteStream(fullSavePath, {
        flags: startByte > 0 ? "a" : "w",
      });

      // 监听下载进度
      let downloadedBytes = startByte;
      response.body.on("data", (chunk) => {
        downloadedBytes += chunk.length;
        if (onProgress && totalSize > 0) {
          const progress = Math.min(downloadedBytes / totalSize, 1);
          onProgress(progress); // 回调进度（0-1）
        }
      });

      // 管道传输：将响应流写入文件
      await new Promise((resolve, reject) => {
        response.body.pipe(writeStream);
        // 流结束/完成
        writeStream.on("finish", resolve);
        // 错误处理
        writeStream.on("error", (err) =>
          reject(new Error(`文件写入失败：${err.message}`))
        );
        response.body.on("error", (err) =>
          reject(new Error(`网络流错误：${err.message}`))
        );
      });

      console.log(`【${savePath}】下载完成`);
    } catch (error) {
      console.error(`【${savePath}】下载失败：${error.message}`);
      throw error; // 抛出错误让调用方处理
    }
  }

  /**
   * 批量下载文件
   * @param {Array<Object>} tasks 下载任务列表，格式：[{ url: "", savePath: "", options: {} }]
   * @param {boolean} parallel 是否并行下载（默认false，串行）
   * @returns {Promise<Array>} 每个任务的执行结果（成功undefined，失败Error）
   */
  async batchDownload(tasks, parallel = false) {
    if (!Array.isArray(tasks) || tasks.length === 0) {
      throw new Error("下载任务列表不能为空");
    }

    const results = [];
    if (parallel) {
      // 并行下载
      const promises = tasks.map(async (task, index) => {
        try {
          await this.downloadFile(task.url, task.savePath, task.options);
          results[index] = undefined;
        } catch (err) {
          results[index] = err;
        }
      });
      await Promise.all(promises);
    } else {
      // 串行下载
      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        try {
          await this.downloadFile(task.url, task.savePath, task.options);
          results[i] = undefined;
        } catch (err) {
          results[i] = err;
        }
      }
    }
    return results;
  }

  /**
   * 简化版下载（无进度回调，快速下载）
   * @param {string} url 下载链接
   * @param {string} savePath 保存路径
   * @returns {Promise<void>}
   */
  async simpleDownload(url, savePath) {
    return this.downloadFile(url, savePath, { resume: true });
  }
}
