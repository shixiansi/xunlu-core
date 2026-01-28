import fs from "fs/promises";
import path from "path";
import React from "react";
import { transform } from "sucrase";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { createCanvas, loadImage, Image as CanvasImage } from "@napi-rs/canvas";
import { Canvg } from "canvg";
import { DOMParser } from "xmldom";
import HtmlReactParser from "html-react-parser";

// 全局设置 DOMParser
global.DOMParser = DOMParser;

// 工具类常量
const AsyncFunction = (async () => 0).constructor;

/**
 * 图片处理工具
 */
class ImageProcessor {
  /**
   * 本地图片转 Base64
   */
  static async localImageToBase64(imagePath, baseDir = process.cwd()) {
    try {
      const absolutePath = path.isAbsolute(imagePath)
        ? imagePath
        : path.resolve(baseDir, imagePath);

      if (
        !(await fs
          .access(absolutePath)
          .then(() => true)
          .catch(() => false))
      ) {
        console.warn(`⚠️ 图片文件不存在：${absolutePath}`);
        return "";
      }

      const buffer = await fs.readFile(absolutePath);
      const mimeType = this.getMimeType(absolutePath);
      return `data:${mimeType};base64,${buffer.toString("base64")}`;
    } catch (e) {
      console.warn(`⚠️ 图片转Base64失败：${e.message}`);
      return "";
    }
  }

  /**
   * 获取文件 MIME 类型
   */
  static getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
    };
    return mimeMap[ext] || "application/octet-stream";
  }

  /**
   * 深度合并对象
   */
  static deepMerge(target, source) {
    const merged = { ...target };
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (
          source[key] &&
          typeof source[key] === "object" &&
          !Array.isArray(source[key]) &&
          target[key] &&
          typeof target[key] === "object"
        ) {
          merged[key] = this.deepMerge(target[key], source[key]);
        } else {
          merged[key] = source[key];
        }
      }
    }
    return merged;
  }

  /**
   * 补全 React 元素的 display 属性
   */
  static ensureDisplayProperty(element) {
    if (!React.isValidElement(element)) {
      return element;
    }

    const originalChildren = element.props.children;
    let processedChildren = [];

    if (originalChildren != null) {
      const childrenArray = React.Children.toArray(originalChildren);
      processedChildren = childrenArray.map((child) =>
        this.ensureDisplayProperty(child),
      );
    }

    if (element.type !== "div") {
      return React.cloneElement(
        element,
        { ...element.props },
        ...processedChildren,
      );
    }

    const { props } = element;
    const baseStyle = {
      display: "flex",
      flexDirection: "column",
      boxSizing: "border-box",
    };

    const newStyle = {
      ...baseStyle,
      ...props.style,
    };

    return React.cloneElement(
      element,
      {
        ...props,
        style: newStyle,
      },
      ...processedChildren,
    );
  }

  /**
   * 解析 JSX 为 React 元素
   */
  static async jsxToReactElement(jsxCode, data = {}) {
    const hCode = transform(jsxCode, {
      transforms: ["jsx"],
      jsxRuntime: "classic",
      production: true,
    }).code;

    const fn = AsyncFunction(
      "React",
      "_args_623601",
      "with (_args_623601) {\nreturn " + hCode.replace(/^\s+/, "") + "\n}",
    );

    let res;
    try {
      res = await fn(React, data);
    } catch (e) {
      e.message = fn.toString() + "\n" + e.message;
      throw e;
    }

    let i = 0;
    while (typeof res === "function" && i++ < 999) {
      res = await res();
    }

    return this.ensureDisplayProperty(res);
  }

  /**
   * HTML 转 React 元素
   */
  static htmlToReactElement(htmlCode) {
    const element = HtmlReactParser(htmlCode);
    return this.ensureDisplayProperty(element);
  }
}

/**
 * 模板预处理器
 */
class TemplatePreprocessor {
  constructor(config) {
    this.config = config;
  }

  /**
   * 预处理 JSX 模板 - 修复图片路径问题
   */
  async preprocessJsxTemplate(jsxTemplate, data = {}) {
    const resPath = data._res_path || this.config.resPath;

    // 1. 处理背景图片
    const bgImageRegex = /url\(['"]?\$\{_res_path\}\/img\/bg\/([^'"]+)['"]?\)/g;

    // 2. 处理 src 属性中的图片
    const srcRegex = /src=['"]?\$\{_res_path\}\/([^'"]+)['"]?/g;

    // 3. 处理内联样式的背景图片
    const inlineBgRegex =
      /backgroundImage:\s*['"]?url\(['"]?\$\{_res_path\}\/([^'"]+)['"]?\)['"]?/g;

    let processedTemplate = jsxTemplate;

    // 替换所有图片路径
    const patterns = [
      { pattern: bgImageRegex, type: "bg" },
      { pattern: srcRegex, type: "src" },
      { pattern: inlineBgRegex, type: "inline" },
    ];

    for (const { pattern, type } of patterns) {
      let match;
      while ((match = pattern.exec(jsxTemplate)) !== null) {
        const [fullMatch, imgPath] = match;

        try {
          // 构建完整的图片路径
          const fullPath =
            type === "bg"
              ? path.join(resPath, "img", "bg", imgPath)
              : path.join(resPath, imgPath);

          const base64Str = await ImageProcessor.localImageToBase64(
            fullPath,
            process.cwd(),
          );

          if (base64Str) {
            if (type === "bg") {
              processedTemplate = processedTemplate.replace(
                fullMatch,
                `url(${base64Str})`,
              );
            } else if (type === "src") {
              processedTemplate = processedTemplate.replace(
                fullMatch,
                `src="${base64Str}"`,
              );
            } else if (type === "inline") {
              processedTemplate = processedTemplate.replace(
                fullMatch,
                `backgroundImage: url(${base64Str})`,
              );
            }
          } else {
            console.warn(`⚠️ 无法加载图片：${fullPath}`);
            if (type === "bg") {
              processedTemplate = processedTemplate.replace(fullMatch, "none");
            }
          }
        } catch (error) {
          console.warn(`⚠️ 处理图片失败：${error.message}`);
        }
      }
    }

    return processedTemplate;
  }

  /**
   * 处理数据绑定
   */
  processDataBindings(template, data) {
    return template
      .replace(/\$\{_res_path\}/g, data._res_path || this.config.resPath || "")
      .replace(/\{data\.([\w.]+)\}/g, (_, key) => {
        const keys = key.split(".");
        let value = data;
        for (const k of keys) {
          value = value?.[k];
          if (value === undefined || value === null) break;
        }
        return value !== undefined && value !== null ? value : "";
      })
      .replace(/\{([\w.]+)\}/g, (_, key) => {
        const keys = key.split(".");
        let value = data;
        for (const k of keys) {
          value = value?.[k];
          if (value === undefined || value === null) break;
        }
        return value !== undefined && value !== null ? value : "";
      });
  }

  /**
   * 处理样式
   */
  processStyles(htmlStr) {
    return htmlStr
      .replace(/style={{([^}]+)}}/g, (_, styleContent) => {
        const fixedStyle = styleContent
          .replace(/['"]/g, "")
          .replace(/,/g, ";")
          .replace(/\s*:\s*/g, ":")
          .trim();
        return `style="${fixedStyle}"`;
      })
      .replace(
        /<div(?!.*\bstyle\b)/g,
        '<div style="display:flex;flex-direction:column;box-sizing:border-box"',
      )
      .replace(/style="([^"]*)"/g, (match, styleContent) => {
        if (!styleContent.includes("display")) {
          return `style="display:flex;flex-direction:column;box-sizing:border-box;${styleContent}"`;
        }
        return match;
      });
  }
}

/**
 * 主图片生成器类
 */
class ImageGenerator {
  constructor(options = {}) {
    const defaultConfig = {
      width: 1200,
      height: 800,
      font: {
        name: "Microsoft YaHei",
        path: "",
        data: null,
        weight: 400,
        style: "normal",
      },
      outputDir: "./output",
      resPath: "./resources",
      renderer: "satori", // 可选: satori, skia, sharp
      enableFallback: true,
    };

    this.config = ImageProcessor.deepMerge(defaultConfig, options);
    this.preprocessor = new TemplatePreprocessor(this.config);
    this.renderer = null;

    if (!this.config.font.path) {
      throw new Error("字体文件路径（font.path）为必填项，请在构造函数中传入");
    }
  }

  /**
   * 初始化
   */
  async initialize() {
    if (!this.config.font.data) {
      try {
        const fontPath = path.isAbsolute(this.config.font.path)
          ? this.config.font.path
          : path.resolve(process.cwd(), this.config.font.path);

        this.config.font.data = await fs.readFile(fontPath);
        console.log(`✅ 字体文件加载成功：${fontPath}`);
      } catch (e) {
        throw new Error(
          `字体文件加载失败：${e.message}，路径：${this.config.font.path}`,
        );
      }
    }
  }

  /**
   * 解析模板
   */
  async parseTemplate(template, data = {}, type = "jsx") {
    if (type === "jsx") {
      const processedTemplate = await this.preprocessor.preprocessJsxTemplate(
        template,
        data,
      );
      console.log("✅ 模板预处理完成，开始解析为 React 元素");
      return await ImageProcessor.jsxToReactElement(processedTemplate, data);
    } else {
      const processedTemplate = this.preprocessor.processDataBindings(
        template,
        data,
      );
      const styledTemplate = this.preprocessor.processStyles(processedTemplate);
      return ImageProcessor.htmlToReactElement(styledTemplate);
    }
  }

  /**
   * 使用 Satori + Resvg 渲染
   */
  async renderWithSatori(reactElement) {
    const { width, height, font } = this.config;

    console.log("🔄 开始使用 Satori 渲染...");

    const svgStr = await satori(reactElement, {
      width,
      height,
      fonts: [
        {
          name: font.name,
          data: font.data,
          weight: font.weight,
          style: font.style,
        },
      ],
      strict: false,
    });
    console.log(svgStr);
    fs.writeFile(process.cwd() + "./debug.svg", svgStr);
    console.log("✅ Satori 渲染 SVG 成功");

    const resvg = new Resvg(svgStr, {
      fitTo: { mode: "width", value: width },
      font: {
        fontFiles: [font.path],
        defaultFontFamily: font.name,
        loadSystemFonts: false,
      },
    });

    const pngBuffer = resvg.render().asPng();
    return await sharp(pngBuffer)
      .png({ quality: 80, compressionLevel: 6 })
      .resize(width, height, { fit: "contain", background: "#fff" })
      .toBuffer();
  }

  /**
   * 兜底渲染 - 修复版
   */
  async fallbackRender(template, data = {}, type = "jsx") {
    const { width, height } = this.config;

    console.log("🔄 触发兜底渲染...");

    let htmlStr = "";
    if (type === "jsx") {
      htmlStr = await this.preprocessor.preprocessJsxTemplate(template, data);
    } else {
      htmlStr = template;
    }

    const processedHtml = this.preprocessor.processDataBindings(htmlStr, data);
    const styledHtml = this.preprocessor.processStyles(processedHtml);

    console.log("📄 处理后的 HTML 长度:", styledHtml.length);

    try {
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");

      // 清空画布
      ctx.fillStyle = "#f5f5f5";
      ctx.fillRect(0, 0, width, height);

      // 使用 Canvg 渲染
      const v = await Canvg.from(ctx, styledHtml, {
        ignoreMouse: true,
        ignoreAnimation: true,
        ignoreDimensions: true,
        ignoreClear: true,
        DOMParser: global.DOMParser, // 显式传递 DOMParser
        // 图片加载器
        loadImages: async (src) => {
          try {
            console.log(`🔄 加载图片: ${src.substring(0, 50)}...`);

            // 如果是 data URL
            if (src.startsWith("data:")) {
              const matches = src.match(
                /data:image\/([a-zA-Z]*);base64,([^"]*)/,
              );
              if (matches && matches.length === 3) {
                const buffer = Buffer.from(matches[2], "base64");
                return await loadImage(buffer);
              }
            }

            // 如果是本地文件路径
            if (src.startsWith("file://")) {
              const filePath = src.replace("file://", "");
              if (
                await fs
                  .access(filePath)
                  .then(() => true)
                  .catch(() => false)
              ) {
                const buffer = await fs.readFile(filePath);
                return await loadImage(buffer);
              }
            }

            // 如果是相对路径
            if (!src.startsWith("http") && !src.startsWith("data:")) {
              const localPath = path.resolve(process.cwd(), src);
              if (
                await fs
                  .access(localPath)
                  .then(() => true)
                  .catch(() => false)
              ) {
                const buffer = await fs.readFile(localPath);
                return await loadImage(buffer);
              }
            }

            console.warn(`⚠️ 无法加载图片: ${src.substring(0, 50)}...`);
            return null;
          } catch (error) {
            console.warn(`⚠️ 图片加载失败: ${error.message}`);
            return null;
          }
        },
      });

      await v.render();
      const fallbackPng = canvas.toBuffer("image/png");

      console.log("✅ 兜底渲染成功");
      return fallbackPng;
    } catch (error) {
      console.error(`❌ 兜底渲染失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 渲染图片
   */
  async render(options = {}) {
    const { data = {}, template, templateType = "jsx" } = options;

    await this.initialize();

    let reactElement;
    try {
      reactElement = await this.parseTemplate(template, data, templateType);
      console.log("✅ 模板解析成功，开始渲染...");
    } catch (error) {
      console.error(`❌ 模板解析失败: ${error.message}`);
      reactElement = this.buildDefaultReactElement(data);
    }

    try {
      // 首先尝试使用 Satori 渲染
      return await this.renderWithSatori(reactElement);
    } catch (satoriError) {
      console.warn(`⚠️ Satori 渲染失败: ${satoriError.message}`);

      if (this.config.enableFallback && template) {
        console.log("🔄 尝试使用兜底渲染...");
        try {
          return await this.fallbackRender(template, data, templateType);
        } catch (fallbackError) {
          console.error(`❌ 兜底渲染失败: ${fallbackError.message}`);
          return await this.generateErrorImage(
            "图片生成失败，请检查模板和资源",
          );
        }
      } else {
        return await this.generateErrorImage("Satori 渲染失败，已禁用兜底渲染");
      }
    }
  }

  /**
   * 生成错误图片
   */
  async generateErrorImage(message) {
    const { width, height } = this.config;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // 背景
    ctx.fillStyle = "#ffe6e6";
    ctx.fillRect(0, 0, width, height);

    // 边框
    ctx.strokeStyle = "#ff9999";
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 20, width - 40, height - 40);

    // 错误图标
    ctx.fillStyle = "#ff3333";
    ctx.font = "bold 60px Arial";
    ctx.textAlign = "center";
    ctx.fillText("⚠️", width / 2, height / 2 - 60);

    // 错误标题
    ctx.fillStyle = "#cc0000";
    ctx.font = "bold 40px Arial";
    ctx.fillText("图片生成失败", width / 2, height / 2);

    // 错误信息
    ctx.fillStyle = "#666666";
    ctx.font = "24px Arial";

    // 分割长文本
    const maxWidth = width - 80;
    const words = message.split("");
    let line = "";
    let lines = [];

    for (let i = 0; i < words.length; i++) {
      const testLine = line + words[i];
      const metrics = ctx.measureText(testLine);

      if (metrics.width > maxWidth && i > 0) {
        lines.push(line);
        line = words[i];
      } else {
        line = testLine;
      }
    }
    lines.push(line);

    // 绘制多行文本
    lines.forEach((lineText, index) => {
      ctx.fillText(lineText, width / 2, height / 2 + 60 + index * 35);
    });

    return canvas.toBuffer("image/png");
  }

  /**
   * 构建默认 React 元素
   */
  buildDefaultReactElement(data = {}) {
    const { font } = this.config;
    return React.createElement(
      "div",
      {
        style: {
          width: "100%",
          height: "100%",
          backgroundColor: "#f5f5f5",
          padding: "40px",
          fontFamily: font.name,
          display: "flex",
          flexDirection: "column",
        },
      },
      React.createElement(
        "div",
        { style: { display: "flex", flexDirection: "column" } },
        React.createElement(
          "h1",
          { style: { color: "#2d3748", margin: 0, fontSize: "36px" } },
          data.title || "默认标题",
        ),
        React.createElement(
          "p",
          { style: { color: "#718096", fontSize: "18px", marginTop: "16px" } },
          `生成时间：${new Date().toLocaleString()}`,
        ),
      ),
    );
  }

  /**
   * 保存图片
   */
  async save(imageBuffer, customPath) {
    try {
      let outputPath;
      if (customPath) {
        outputPath = path.isAbsolute(customPath)
          ? customPath
          : path.resolve(process.cwd(), customPath);

        // 确保目录存在
        const dir = path.dirname(outputPath);
        await fs.mkdir(dir, { recursive: true });
      } else {
        const outputDir = path.resolve(process.cwd(), this.config.outputDir);
        await fs.mkdir(outputDir, { recursive: true });
        outputPath = path.join(outputDir, `image-${Date.now()}.png`);
      }

      await fs.writeFile(outputPath, imageBuffer);
      console.log(`✅ 图片保存成功：${outputPath}`);
      return outputPath;
    } catch (e) {
      throw new Error(`图片保存失败：${e.message}`);
    }
  }

  /**
   * 快捷生成方法
   */
  async generateAndSave(options = {}) {
    const { data = {}, template, templateType = "jsx", customPath } = options;

    if (!template) {
      throw new Error("template 参数是必需的");
    }

    const buffer = await this.render({
      data,
      template,
      templateType,
    });

    return await this.save(buffer, customPath);
  }
}

// 导出工具函数
export const toReactElement = {
  async jsxToReactElement(jsxCode, data = {}) {
    return await ImageProcessor.jsxToReactElement(jsxCode, data);
  },
  htmlToReactElement(htmlCode) {
    return ImageProcessor.htmlToReactElement(htmlCode);
  },
};

export default ImageGenerator;
