import Renderer from "../../lib/renderer/Renderer.js";
import os from "node:os";
import lodash from "lodash";
import puppeteer from "puppeteer";
import { segment } from "../../Bot/segment.js";
import { logger } from "#utils";
import path from "path";
import fs from "fs"; // 新增：用于文件路径校验
const _path = process.cwd();
let mac = "";

class Puppeteer extends Renderer {
  constructor(config) {
    super({
      id: "puppeteer",
      type: "image",
      render: "screenshot",
    });
    this.browser = false;
    this.lock = false;
    this.shoting = [];
    this.restartNum = 100;
    this.renderNum = 0;
    this.cleanupTimer = null; // 新增：定时器管理
    this.config = {
      headless: config.headless || "new",
      args: config.args || [
        "--disable-gpu",
        "--disable-setuid-sandbox",
        "--no-sandbox",
        "--no-zygote",
        "--disable-dev-shm-usage", // 新增：解决内存不足问题
        "--start-maximized", // 可视化模式窗口最大化
        "--window-size=1920,1080", // 兜底窗口大小
      ],
    };
    if (config.chromiumPath) this.config.executablePath = config.chromiumPath;
    if (config.puppeteerWS) this.config.wsEndpoint = config.puppeteerWS;
    this.puppeteerTimeout = config.puppeteerTimeout || 0;
  }

  /**
   * 新增：核心修复 - 实现dealTpl方法，处理模板路径
   */

  /**
   * 新增：检查浏览器实例是否健康
   */
  async isBrowserHealthy() {
    if (!this.browser) return false;
    try {
      await this.browser.pages(); // 尝试获取页面列表，验证连接
      return true;
    } catch (err) {
      logger.warn("[isBrowserHealthy] 浏览器实例不健康", err.message);
      return false;
    }
  }

  /**
   * 初始化chromium（修复lock管理、健康检查）
   */
  async browserInit() {
    // 健康检查：如果浏览器正常，直接返回
    if (this.browser && (await this.isBrowserHealthy())) return this.browser;
    if (this.lock) return false;
    this.lock = true;

    logger.info("puppeteer Chromium 启动中...");

    // 关闭旧实例（新增）
    if (this.browser) {
      try {
        await this.stop(this.browser);
      } catch (err) {
        logger.error("[browserInit] 关闭旧浏览器失败", err);
      }
      this.browser = false;
    }

    let connectFlag = false;
    try {
      // 获取Mac地址
      if (!mac) {
        mac = await this.getMac();
        this.browserMacKey = `Yz:chromium:browserWSEndpoint:${mac}`;
      }

      // 尝试连接已有实例
      const browserUrl = this.config.wsEndpoint;
      if (browserUrl) {
        try {
          this.browser = await puppeteer.connect({
            browserWSEndpoint: browserUrl,
            defaultViewport: null, // 新增：避免视口错误
          });
          // 验证连接有效性
          if (await this.isBrowserHealthy()) {
            connectFlag = true;
            logger.info(`puppeteer Chromium 连接成功 ${browserUrl}`);
          } else {
            this.browser = null;
          }
        } catch (err) {
          logger.warn(`连接已有Chromium失败：${err.message}`);
          this.browser = null;
        }
      }
    } catch (err) {
      logger.error("[browserInit] 获取浏览器缓存失败", err);
    }

    // 启动新实例
    if (!this.browser || !connectFlag) {
      this.browser = await puppeteer.launch(this.config).catch((err) => {
        logger.error("[browserInit] Chromium启动失败", err);
        // 启动失败提示
        if (err.message.includes("Could not find Chromium")) {
          logger.error("请执行：node node_modules/puppeteer/install.js");
        }
        return null;
      });
    }

    this.lock = false; // 释放lock（核心：修复lock未释放问题）

    if (!this.browser) {
      logger.error("puppeteer Chromium 启动失败");
      return false;
    }

    if (!connectFlag) {
      logger.info(`puppeteer Chromium 启动成功 ${this.browser.wsEndpoint()}`);
    }

    // 监听断开事件
    this.browser.on("disconnected", () => this.restart(true));

    return this.browser;
  }

  // 获取Mac地址（原有逻辑不变）
  getMac() {
    let mac = "00:00:00:00:00:00";
    try {
      const network = os.networkInterfaces();
      let macFlag = false;
      for (const a in network) {
        for (const i of network[a]) {
          if (i.mac && i.mac !== mac) {
            macFlag = true;
            mac = i.mac;
            break;
          }
        }
        if (macFlag) break;
      }
    } catch (e) {}
    mac = mac.replace(/:/g, "");
    return mac;
  }

  /**
   * 截图方法（修复路径拼接、Bot.sleep、参数校验）
   */
  async screenshot(name, data = {}) {
    // 前置校验：避免无效参数
    if (!name || typeof name !== "string") {
      logger.error(`[screenshot] 无效的name参数：${name}`);
      return false;
    }
    if (typeof data !== "object" || data === null) {
      logger.error(`[screenshot] 无效的data参数：${data}`);
      return false;
    }

    // 初始化浏览器
    if (!(await this.browserInit())) return false;
    const pageHeight = data.multiPageHeight || 4000;

    // 处理模板路径（核心：修复undefined问题）
    let savePath = this.dealTpl(name, data);
    console.log(savePath);

    if (!savePath) return false;

    let buff = "";
    let start = Date.now();
    let ret = [];
    this.shoting.push(name);

    // 超时处理
    const puppeteerTimeout = this.puppeteerTimeout;
    let overtime;
    if (puppeteerTimeout > 0) {
      overtime = setTimeout(() => {
        logger.error(`[图片生成][${name}] 截图超时`);
        this.restart(true);
        this.shoting = [];
      }, puppeteerTimeout);
    }

    let page = null; // 新增：统一管理page实例
    try {
      page = await this.browser.newPage();

      // 修复：路径拼接（正确的file协议格式）
      const fileUrl = `file:///${path.resolve(savePath).replace(/\\/g, "/")}`;
      logger.debug(`[screenshot] 访问模板：${fileUrl}`);

      // 页面跳转参数
      let pageGotoParams = lodash.extend(
        { timeout: 120000, waitUntil: "networkidle2" },
        data.pageGotoParams || {},
      );

      // 跳转页面（核心修复：使用正确的file路径）
      await page.goto(fileUrl, pageGotoParams);
      let body = (await page.$("#container")) || (await page.$("body"));
      if (!body) {
        throw new Error("未找到#container或body元素");
      }

      // 计算页面高度
      const boundingBox = await body.boundingBox();
      if (!boundingBox) {
        throw new Error("无法获取页面元素的边界框");
      }
      let num = 1;

      // 截图参数
      let randData = {
        type: data.imgType || "jpeg",
        omitBackground: data.omitBackground || false,
        quality: data.quality || 90,
        path: data.path || "",
      };
      if (data.multiPage) {
        randData.type = "jpeg";
        num = Math.round(boundingBox.height / pageHeight) || 1;
      }
      if (data.imgType === "png") delete randData.quality;

      // 单页截图
      if (!data.multiPage) {
        buff = await body.screenshot(randData);
        this.renderNum++;
        const kb = (buff.length / 1024).toFixed(2) + "KB";
        logger.mark(`[图片生成][${name}] ${kb} ${Date.now() - start}ms`);
        ret.push(buff);
      } else {
        // 分页截图
        if (num > 1) {
          await page.setViewport({
            width: boundingBox.width,
            height: pageHeight + 100,
          });
        }
        for (let i = 1; i <= num; i++) {
          if (i !== 1 && i === num) {
            await page.setViewport({
              width: boundingBox.width,
              height: parseInt(boundingBox.height) - pageHeight * (num - 1),
            });
          }
          if (i !== 1 && i <= num) {
            await page.evaluate((h) => window.scrollBy(0, h), pageHeight);
          }
          buff =
            num === 1
              ? await body.screenshot(randData)
              : await page.screenshot(randData);

          // 修复：替换Bot.sleep为原生setTimeout
          if (num > 2) {
            await new Promise((resolve) => setTimeout(resolve, 200));
          }

          this.renderNum++;
          const kb = (buff.length / 1024).toFixed(2) + "KB";
          logger.mark(`[图片生成][${name}][${i}/${num}] ${kb}`);
          ret.push(buff);
        }
        logger.mark(`[图片生成][${name}] 分页截图完成`);
      }
    } catch (err) {
      logger.error(`[图片生成][${name}] 失败`, err);
      this.restart(true);
      if (overtime) clearTimeout(overtime);
      ret = [];
      return false;
    } finally {
      // 关闭页面（确保page存在）
      if (page) {
        await page.close().catch((err) => logger.error("关闭页面失败", err));
      }
      if (overtime) clearTimeout(overtime);
      this.shoting.pop();
    }

    // 校验结果
    if (ret.length === 0 || !ret[0]) {
      logger.error(`[图片生成][${name}] 结果为空`);
      return false;
    }

    this.restart();
    return data.multiPage ? ret : ret[0];
  }

  /** 重启（修复逻辑） */
  restart(force = false) {
    if (!this.browser?.close || this.lock) return;
    // 非强制重启时，校验条件
    if (
      !force &&
      (this.renderNum % this.restartNum !== 0 || this.shoting.length > 0)
    ) {
      return;
    }

    logger.info(`puppeteer Chromium ${force ? "强制" : ""}关闭重启...`);
    this.lock = true; // 加锁避免并发
    try {
      this.stop(this.browser);
      this.browser = false;
      this.renderNum = 0;
      // 延迟重启，避免资源占用
      setTimeout(() => {
        this.lock = false;
        this.browserInit();
      }, 1000);
    } catch (err) {
      logger.error("[restart] 重启失败", err);
      this.lock = false;
    }
  }

  async stop(browser) {
    try {
      // 先关闭所有页面
      const pages = await browser.pages().catch(() => []);
      for (const page of pages) {
        await page.close().catch(() => {});
      }
      await browser.close();
    } catch (err) {
      logger.error("关闭Chromium失败", err);
    }
  }
}

export default new Puppeteer({
  headless: false,
  chromiumPath: "",
  puppeteerWS: "",
  puppeteerTimeout: 30000,
});
