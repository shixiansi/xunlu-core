# plugin-api

这是一个可以既作为机器人插件（被宿主加载），又能独立启动为 HTTP API 服务器的项目模板。

快速开始：

```bash
cd plugin-api
npm install
npm run dev   # 开发热替换
npm start     # 生产运行
```

结构说明：

- `src/index.js` - 启动 API 服务器并加载插件
- `src/pluginLoader.js` - 插件加载与对接逻辑
- `src/plugins/*` - 插件放置目录（每个插件导出 `name`、`register(bot)` 和 `apiRoutes(router)`）

示例：已包含 `src/plugins/example-plugin/` 示例插件目录。

## 示例：作为宿主插件的 shim

项目内提供了一个演示脚本 `examples/host-shim.js`，用于示范如何把本项目当作插件加载到宿主中：

运行示例：

```bash
cd plugin-api
npm install
node examples/host-shim.js
```

该脚本会调用插件的 `register(bot)`（传入简单的 bot shim），并演示调用 `onBotEvent` 来处理文本命令。

## 插件：reset-qianyu-plugin（命令 & API）

该仓库包含 `reset-qianyu-plugin` 插件的示例实现，主要功能如下：

- 命令（可由宿主通过 `register(bot)` 注册）:

  - `千羽帮助`：显示插件帮助与当前前缀/尾缀。
  - `#设置前缀<前缀>` / `#设置尾缀<尾缀>`：设置群前缀或尾缀（以群为单位持久化）。
  - `水群统计` / `今日发言记录`：返回该群发言排行（基于已记录的消息）。
  - `解析视频 <url>`：识别视频来源（bilibili/douyin/qq 等），返回站点与 id。
  - `下载视频 <url>`：在宿主上调用 `yt-dlp` 下载视频，保存在插件 `downloads` 目录（需宿主环境安装 `yt-dlp`）。
  - `复读开启` / `复读关闭`：开启/关闭群复读功能（状态持久化）。
  - `开启早安` / `开启晚安`：设置默认早/晚安定时（简化命令，可通过 API 精确设置）。

- HTTP API（通过宿主将插件的 `apiRoutes(router)` 挂载到 `/plugins/reset-qianyu-plugin`）：
  - GET `/plugins/reset-qianyu-plugin/info` — 插件元信息
  - GET `/plugins/reset-qianyu-plugin/config/:groupId` — 获取群配置（前缀/尾缀）
  - POST `/plugins/reset-qianyu-plugin/config/:groupId` — 更新群配置（body: { prefix, suffix }）
  - GET `/plugins/reset-qianyu-plugin/stats/:groupId/top?limit=10` — 群发言总榜
  - GET `/plugins/reset-qianyu-plugin/stats/:groupId/today` — 今日发言榜
  - POST `/plugins/reset-qianyu-plugin/parse` — 简单视频解析（body: { url }）
  - POST `/plugins/reset-qianyu-plugin/download` — 触发下载（body: { url }），在服务器端调用 `yt-dlp`
  - GET `/plugins/reset-qianyu-plugin/downloads` — 列出已下载文件
  - GET `/plugins/reset-qianyu-plugin/download/file/:name` — 安全下载单个文件（防目录遍历）
  - GET `/plugins/reset-qianyu-plugin/schedules/:groupId` — 查询定时任务
  - POST `/plugins/reset-qianyu-plugin/schedules/:groupId` — 设置定时任务（body: { type, hour, minute, enabled })
    - GET `/plugins/reset-qianyu-plugin/schedules/:groupId?page=1&limit=20` — 分页查询该群的定时任务（返回 `page, limit, total`）
    - GET `/plugins/reset-qianyu-plugin/schedules/:groupId/:id` — 查询指定 id 的定时任务
    - DELETE `/plugins/reset-qianyu-plugin/schedules/:groupId/:id` — 删除指定 id 的定时任务（删除后会重新加载调度）

## 下载说明与注意事项

示例：触发一次下载（API）

```bash
curl -X POST -H "Content-Type: application/json" -d '{"url":"https://www.bilibili.com/video/xxx"}' http://localhost:3000/plugins/reset-qianyu-plugin/download
```

示例：列出下载文件

```bash
curl http://localhost:3000/plugins/reset-qianyu-plugin/downloads
```

## 静态访问下载文件（可选）

主服务器已将插件的 `downloads` 目录作为静态资源暴露到：

- `http://localhost:3000/plugins/reset-qianyu-plugin/downloads/<filename>`

示例（直接下载文件）：

```bash
curl -O http://localhost:3000/plugins/reset-qianyu-plugin/downloads/example-video.mp4
```

安全提示：该静态路由简单暴露文件，建议仅在受信网络或配合访问控制时启用。

可选的访问控制：`PLUGIN_DOWNLOAD_TOKEN`

如果你希望保护下载目录，可以在运行服务器时设置环境变量 `PLUGIN_DOWNLOAD_TOKEN`，当该变量存在时，静态路由会要求客户端携带相同的 token：

- 支持的方式：HTTP 头 `x-download-token`，或 `Authorization: Bearer <token>`，或查询参数 `?token=<token>`。

示例（在 PowerShell 中设置 token 并启动）：

```powershell
$env:PLUGIN_DOWNLOAD_TOKEN="secret123"
npm start
```

示例（带 header 的 curl 请求）：

```bash
curl -H "x-download-token: secret123" -O http://localhost:3000/plugins/reset-qianyu-plugin/downloads/example-video.mp4
```

如果未设置 `PLUGIN_DOWNLOAD_TOKEN`，路由仍然会被挂载并公开访问（便于开发）。

示例：分页查询定时任务（第 2 页，每页 5 条）

```bash
curl "http://localhost:3000/plugins/reset-qianyu-plugin/schedules/mygroup?page=2&limit=5"
```

示例：查询单个定时任务

```bash
curl "http://localhost:3000/plugins/reset-qianyu-plugin/schedules/mygroup/42"
```

示例：删除定时任务

```bash
curl -X DELETE "http://localhost:3000/plugins/reset-qianyu-plugin/schedules/mygroup/42"
```

## 宿主集成示例

使用 `examples/host-shim.js` 可以快速模拟宿主加载插件并执行 `register(bot)`：

```bash
node examples/host-shim.js
```

## AI 集成（OpenAI）

该项目支持通过环境变量 `OPENAI_API_KEY` 使用 OpenAI Chat Completions 接口。设置后可使用插件提供的 API 与命令：

- API: `POST /plugins/reset-qianyu-plugin/ai/chat` — body: `{ "prompt": "你好" }`。
- 命令：群内发送 `千羽对话 <你的问题>`，插件会向 OpenAI 请求并回复结果。

示例（curl）:

```bash
export OPENAI_API_KEY="sk-..."
curl -X POST -H "Content-Type: application/json" -d '{"prompt":"帮我写一段晚安祝福"}' http://localhost:3000/plugins/reset-qianyu-plugin/ai/chat
```

注意：请在受信环境中使用 API key，并将 `OPENAI_API_KEY` 保密。

## Cron 与时区示例

本项目支持在 `POST /plugins/reset-qianyu-plugin/schedules/:groupId` 使用 `cron` 表达式或 `hour`/`minute` + `days` 设置定时任务。后端使用 `cron`（IANA tz 支持）和 `node-schedule` 两种方式：当请求中提供 `cron` 或 `timezone` 时会使用 `CronJob`（支持时区），否则使用 `hour`/`minute` 与 `days`。

注意：`CronJob` 使用的表达格式为 6 字段：`Seconds Minutes Hours DayOfMonth Month DayOfWeek`（例如 `0 0 8 * * *` 表示每天 08:00:00）。`

常见示例：

- 每天 08:00（上海时区）:

```bash
curl -X POST -H "Content-Type: application/json" -d '{"type":"morning","cron":"0 0 8 * * *","timezone":"Asia/Shanghai","enabled":true}' http://localhost:3000/plugins/reset-qianyu-plugin/schedules/mygroup
```

- 工作日（周一到周五）09:30（使用 cron）:

```bash
curl -X POST -H "Content-Type: application/json" -d '{"type":"morning","cron":"0 30 9 * * 1-5","timezone":"Asia/Shanghai","enabled":true}' http://localhost:3000/plugins/reset-qianyu-plugin/schedules/mygroup
```

- 使用 `hour`/`minute` 与 `days`（days 为数字数组：0=周日,6=周六）：周一到周五 08:00

```bash
curl -X POST -H "Content-Type: application/json" -d '{"type":"morning","hour":8,"minute":0,"days":[1,2,3,4,5],"enabled":true}' http://localhost:3000/plugins/reset-qianyu-plugin/schedules/mygroup
```

- 每小时整点（秒字段必须填 0）:

```bash
curl -X POST -H "Content-Type: application/json" -d '{"type":"reminder","cron":"0 0 * * * *","enabled":true}' http://localhost:3000/plugins/reset-qianyu-plugin/schedules/mygroup
```

时区说明：`timezone` 请使用 IANA 时区数据库名称（例如 `Asia/Shanghai`, `UTC`, `America/Los_Angeles`）。时区列表参考：https://en.wikipedia.org/wiki/List_of_tz_database_time_zones 。

兼容性提示：如果你的 Node 环境没有全局 `Intl` 或时区支持，请在受支持的平台/版本上运行，或在部署环境中测试时区行为。

如需我将 README 中的这些新节再精简或翻译成英文，或把下载目录通过 `src/server.js` 暴露为静态路由，请告诉我。
