/**
 * @Author: 时先思
 * @Date: 2025-12-13 14:29:26
 * @LastEditTime: 2025-12-13 14:29:32
 * @LastEditors: 时先思
 * @Description:
 * @FilePath: \plugin-api\src\plugins\example-plugin\routes\index.js
 * @版权声明
 **/
import express from "express";

export function createRouter(pluginContext) {
  const router = express.Router();
  const base = pluginContext.name || "example";

  router.get("/info", (req, res) => {
    res.json({
      plugin: base,
      description: "示例插件，既提供 bot 集成也提供 REST API",
    });
  });

  router.post("/echo", (req, res) => {
    res.json({ youSent: req.body });
  });

  return router;
}
