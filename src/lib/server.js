import path from "path";
import express from "express";
import { fileURLToPath, pathToFileURL } from "url";
import { loadPlugins } from "./pluginLoader.js";
import { logger } from "../utils/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function startServer(port = process.env.PORT || 3000) {
  const app = express();
  app.use(express.json());

  // 基本健康检查
  app.get("/health", (req, res) => res.json({ status: "ok" }));

  // 加载本地插件并挂载其 API 路由
  const plugins = await loadPlugins(path.join(__dirname, "plugins"));
  for (const p of plugins) {
    const impl = p.implementation;
    // 如果插件需要注册 bot，可传入一个简单的 bot shim
    if (typeof impl.register === "function") {
      try {
        impl.register({});
      } catch (e) {
        logger.error(e);
      }
    }

    if (typeof impl.apiRoutes === "function") {
      const router = express.Router();
      console.log(router);

      impl.apiRoutes(router);
      console.log(router);

      app.use(`/plugins/${p.name}`, router);
      logger.info(`Mounted API routes for plugin: ${p.name}`);
    }
  }

  // 将 reset-qianyu 插件的 downloads 目录作为静态资源暴露（可选的 token 访问控制）
  try {
    const downloadsDir = path.join(
      __dirname,
      "plugins",
      "reset-qianyu-plugin",
      "downloads"
    );

    const DOWNLOAD_TOKEN = process.env.PLUGIN_DOWNLOAD_TOKEN || null;
    if (!DOWNLOAD_TOKEN) {
      logger.info(
        "No PLUGIN_DOWNLOAD_TOKEN set — downloads route will be publicly accessible"
      );
    } else {
      logger.info(
        `PLUGIN_DOWNLOAD_TOKEN is set — downloads will require token`
      );
    }

    const checkDownloadToken = (req, res, next) => {
      // 如果没有配置 token，则允许访问（兼容开发环境）
      if (!DOWNLOAD_TOKEN) return next();

      const headerToken = req.get("x-download-token");
      const auth = req.get("authorization");
      const bearerToken =
        auth && auth.startsWith("Bearer ") ? auth.slice(7) : null;
      const queryToken = req.query && req.query.token;
      const got = headerToken || bearerToken || queryToken;

      if (got && got === DOWNLOAD_TOKEN) return next();
      res.status(401).json({ error: "Unauthorized" });
    };

    app.use(
      "/plugins/reset-qianyu-plugin/downloads",
      checkDownloadToken,
      express.static(downloadsDir)
    );

    logger.info(
      `Serving plugin downloads at /plugins/reset-qianyu-plugin/downloads from ${downloadsDir}`
    );
  } catch (e) {
    logger.error("Failed to mount downloads static route", e);
  }

  app.post("/bot/event", (req, res) => {
    const event = req.body;
    for (const p of plugins) {
      if (p.onBotEvent) {
        try {
          p.onBotEvent(event);
        } catch (e) {
          logger.error(e);
        }
      }
    }
    res.json({ ok: true });
  });

  const server = app.listen(port, () =>
    logger.info(`plugin-api listening on ${port}`)
  );
  return { app, server };
}
