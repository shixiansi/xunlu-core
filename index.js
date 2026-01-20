// import path from "path";
// import { fileURLToPath, pathToFileURL } from "url";
// import { loadPlugins } from "./src/pluginLoader.js";

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// // 判断是否作为 CLI 直接运行（对等于 node 启动的脚本路径）
// const isMain =
//   process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
// console.log(isMain);

// // 导出为插件时使用的默认导出对象（不主动导入 express）
// const plugin = {
//   name: "plugin-api",
//   async register(bot) {
//     const plugins = await loadPlugins(path.join(__dirname, "src", "plugins"));
//     for (const p of plugins) {
//       const impl = p.implementation;
//       if (typeof impl.register === "function") {
//         try {
//           impl.register(bot);
//         } catch (e) {
//           /* 忽略插件注册错误 */
//         }
//       }
//     }
//   },
//   async apiRoutes(router) {
//     const plugins = await loadPlugins(path.join(__dirname, "src", "plugins"));
//     for (const p of plugins) {
//       const impl = p.implementation;
//       if (typeof impl.apiRoutes === "function") {
//         impl.apiRoutes(router);
//       }
//     }
//   },
// };
// console.log(plugin);

// export default plugin;

// if (isMain) {
//   // 作为独立服务器运行：按需加载 server（其中会导入 express）
//   const { startServer } = await import("./src/server.js");
//   startServer();
// }
import Bot from "./src/index.js";
