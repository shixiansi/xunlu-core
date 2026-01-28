import { fromJsx } from "@takumi-rs/helpers/jsx";
import sharp from "sharp";
import { Canvg } from "canvg";
import { JSDOM } from "jsdom";
import { Renderer as takumi } from "@takumi-rs/core";
import resvgJs from "@resvg/resvg-js";
import fs from "fs";
const fontPath = "./resources/font/zh-cn.ttf";

export class SkiaCanvasRenderer {
  getOption(options) {
    switch (options.format) {
      case "webp":
      case "jpeg": {
        return options.quality;
      }
      case "avif": {
        return options.cfg;
      }
      case "gif": {
        return options.quality;
      }
      default: {
        return undefined;
      }
    }
  }

  async render(source, options) {
    const img = await skiaCanvas.loadImage(source);
    const canvas = new skiaCanvas.Canvas(img.width, img.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    return await canvas.encode(options.format, this.getOption(options));
  }

  async renderByCanvg(svg, options) {
    const canvas = new skiaCanvas.Canvas(1, 1);
    const ctx = canvas.getContext("2d");
    const dom = new JSDOM();
    const v = Canvg.fromString(ctx, svg, {
      window: dom.window,
      DOMParser: dom.window.DOMParser,
      createCanvas: (w, h) => new skiaCanvas.Canvas(w, h),
      createImage: skiaCanvas.Image,
      ignoreDimensions: false,
    });
    await v.render();
    return await canvas.encode(options.format, this.getOption(options));
  }
}

export class SharpRenderer {
  async render({ source, sharpOptions, format, formatOptions }) {
    return await sharp(source, sharpOptions)
      .toFormat(format, formatOptions)
      .toBuffer();
  }
}

export class ResvgRenderer {
  async render(svg, options) {
    options ||= {};
    options.font = {
      fontFiles: [path.resolve(this.__dirname, fontPath)],
      defaultFontFamily: "默认中文",
    };
    const img = await resvgJs.renderAsync(svg, options);
    return img.asPng();
  }
}

export class TakumiRenderer {
  static async render(reactElement, options) {
    const fontBuffer = fs.readFileSync(fontPath);
    const renderer = new takumi({
      fonts: [
        {
          name: '"Source Han Sans CN"', // CSS中使用的字体族名
          data: fontBuffer, // 字体的二进制数据（Buffer/ArrayBuffer）
          weight: 400, // 字重，例如400对应normal，700对应bold
          style: "normal", // 字体样式，如'normal'或'italic'
          lang: "zh-CN", // 可选，指定语言范围以优化字体匹配
        },
      ],
    });
    return await renderer.render(await fromJsx(reactElement), options);
  }
}

export default {
  SkiaCanvasRenderer,
  SharpRenderer,
  ResvgRenderer,
  TakumiRenderer,
};
