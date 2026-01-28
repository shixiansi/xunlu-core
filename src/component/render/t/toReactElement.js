import { transform } from "sucrase";
import React from "react";
import HtmlReactParser from "html-react-parser";

// 正确获取 AsyncFunction 构造函数
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

export const toReactElement = {
  async jsxToReactElement(jsxCode, data) {
    try {
      // 1. 转换 JSX
      const hCode = transform(jsxCode, {
        transforms: ["jsx"],
        jsxRuntime: "classic",
        production: true,
      }).code;

      // 2. 安全地创建异步函数
      const functionBody = `
        try {
          with (_args_623601) {
            return ${hCode.replace(/^\s+/, "")}
          }
        } catch(error) {
          throw new Error(\`JSX执行错误: $\{error.message}\`);
        }
      `;

      let fn;
      try {
        fn = new AsyncFunction("React", "_args_623601", functionBody);
      } catch (parseError) {
        throw new Error(
          `函数创建失败: ${parseError.message}\n生成的代码: ${functionBody}`,
        );
      }

      // 3. 验证 fn 确实是函数
      if (typeof fn !== "function") {
        throw new Error(`AsyncFunction 未返回有效函数，实际类型: ${typeof fn}`);
      }

      // 4. 执行函数并处理结果
      let res;
      try {
        res = await fn(React, data || {});
      } catch (e) {
        e.message = `函数执行错误: ${e.message}\n函数定义: ${fn.toString()}`;
        throw e;
      }

      // 5. 处理可能的函数返回值（递归执行）
      let i = 0;
      while (typeof res === "function" && i++ < 999) {
        res = await res();
      }

      return res;
    } catch (error) {
      console.error("JSX转换错误详情:", {
        originalCode: jsxCode,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  },

  htmlToReactElement(htmlCode) {
    return HtmlReactParser(htmlCode);
  },
};
