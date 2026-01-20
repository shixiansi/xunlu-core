import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

// 只做模块加载，不主动创建 express 对象或调用 register
// 调用方负责根据运行上下文决定是否调用 plugin.register(bot)
export async function loadPlugins(dir) {
  const plugins = [];
  if (!fs.existsSync(dir)) return plugins;
  const entries = fs.readdirSync(dir);
  const loadedTargets = new Set();
  for (const entry of entries) {
    try {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      let target = null;
      if (stat.isDirectory()) {
        const idx = path.join(full, "index.js");
        if (fs.existsSync(idx)) target = idx;
        else continue;
      } else if (entry.endsWith(".js")) {
        // if a directory with same basename exists (module split), prefer the directory
        const base = entry.replace(/\.js$/, "");
        const altDir = path.join(dir, base);
        if (fs.existsSync(altDir) && fs.statSync(altDir).isDirectory()) {
          const idx = path.join(altDir, "index.js");
          if (fs.existsSync(idx)) target = idx;
          else continue;
        } else {
          target = full;
        }
      } else {
        continue;
      }

      if (loadedTargets.has(pathToFileURL(target).href)) continue;
      const mod = await import(pathToFileURL(target).href);
      loadedTargets.add(pathToFileURL(target).href);
      const implementation = mod.default || mod;
      const name = implementation.name || path.basename(target, ".js");
      const plugin = { name, implementation };
      if (typeof implementation.onBotEvent === "function")
        plugin.onBotEvent = implementation.onBotEvent;
      plugins.push(plugin);
      console.info(`xunlu-core加载插件: ${name}`);
    } catch (err) {
      console.error(`Failed to load plugin entry ${entry}:`, err);
    }
  }
  return plugins;
}
