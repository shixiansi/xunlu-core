# xunlu-core：AI/Agent 快速上手（流程 / 操作 / 离线&联调测试）

目标：让 AI 在尽量少翻源码的情况下，能直接通过文档理解本项目的**运行流程**、常用**操作命令**与可脚本化的**离线测试**。

## 0) 关键事实（先看这 30 秒）

- Node 版本：见 `.nvmrc`（当前 `22.21.1`），项目为 ESM（`package.json` 里 `"type":"module"`）
- 入口：`index.js` → `src/index.js`
- 协议/适配器：`milky | onebotv11 | icqq | auto`
- 统一消息：所有入站事件最终会整理为 `ctx.message: UniversalMessageSegment[]`
  - 定义/转换：`src/Bot/message/universal-message.js`、`src/Bot/message/context.js`
- 推荐写法：插件优先用 `ctx.reply()` / 通用 API（见 `md/api.md`），尽量少直接拼 OneBot/Milky 原生段与 raw API 参数

## 1) 文档地图（AI 按需读）

- 项目流程 / 运行 / 测试入口：本文件 `AGENTS.md`
- 通用 API（`ctx` / `botApi` / 全局 `Bot`）：`md/api.md`
- 插件编写（模板/最佳实践/如何测试）：`md/plugin-handbook-ai.md`
- 测试基建（harness / CLI / node:test）：`md/testing-handbook-ai.md`
- OneBotV11 / ICQQ / Milky 原生 API 速查（参数差异）：`md/onebotv11-milky-api-quickref.md`
- 通用消息段速查：`md/message.md`
- 目录树快照：`md/dir-tree.md`

## 2) 目录结构（只列关键入口）

- `bin/`：CLI（`xunlu-dev` / `xunlu` / `xunlubot`）
- `src/index.js`：主入口（判断云崽环境/独立运行、启动 adapter）
- `src/Bot/`：协议适配 + 插件分发（`BaseBot`）
- `src/plugins/`：插件目录
- `src/lib/controlServer.js`：控制台 Control Server（给 CLI / 联调）
- `src/lib/server.js`：插件 API Server（Express）
- `config/`：默认配置与运行配置（首次运行会同步/补齐）

完整目录树见 `md/dir-tree.md`；可用以下命令重建（忽略 `.git/node_modules/logs/temp/data`）：

```bash
node ./bin/xunlu-dev.js tree --path . --max-depth 6 --output md/dir-tree.md
```

## 3) 运行形态与启动

### 3.1 云崽/插件环境（Yunzai）

- 检测到全局 `Bot` 时，强制走 `icqq` 适配（见 `src/index.js`）

### 3.2 独立运行（Standalone）

- 适配器选择优先级：
  1) 环境变量 `XUNLU_ADAPTER`
  2) `config/config/bot.config.yaml:adapter`
- 常用启动：

```bash
node index.js
```

## 4) 消息处理主流程（从入站到回复）

1) adapter 上报事件 → `BaseBot.deal(e)`（`src/Bot/index.js`）
2) `dealMsg()`：推断协议、构建 `universalMessage`，统一 `ctx.message`，并派生 `ctx.msg/url/img/at*` 等字段
3) 命令匹配：`registerCommand()` 的正则匹配的是 `ctx.msg`
4) handler 里调用 `ctx.reply()`：
   - 普通消息会自动处理 suffix/quote，并按协议转换发送
   - forward/raw（如 onebot 的 `node`）会透传，避免被“误转文本”
5) 协议差异（`message_id` vs `message_seq` 等）由通用 API/适配层抹平（见 `md/api.md`、`md/onebotv11-milky-api-quickref.md`）

## 5) 两类 HTTP 服务（联调/外部调用）

### 5.1 Control Server（控制台，默认 `127.0.0.1:3081`）

用途：给 `xunlu` / `xunlubot` / `xunlu-dev bot` 使用；并提供 `POST /send` 做联调模拟。

- 健康检查：`GET /health`
- 查看状态：`GET /status`
- 热重载插件：`POST /restart`（或 `/reload`）
- 拉取日志：`GET /log?...`
- 联调模拟入站消息：`POST /send`

鉴权：当 `config/config/bot.config.yaml:ctl_token` 非空时
- Header：`Authorization: Bearer <token>`
- 或 Query：`?token=<token>`

### 5.2 插件 API Server（Express，默认 `localhost:3000`）

用途：对外提供插件 REST API（`/plugins/<name>/*`）与事件广播（`/bot/event`）。

启动（项目未内置 script 时可直接 Node 起）：

```bash
node --input-type=module -e "import('./src/lib/server.js').then(m=>m.startServer(process.env.PORT||3000))"
```

## 6) CLI 与测试（推荐工作流）

### 6.1 离线测试（最快，推荐做自动化）

1) 列出插件名：

```bash
node ./bin/xunlu-dev.js plugins list
```

2) 轻量自检（导入/文件存在性）：

```bash
node ./bin/xunlu-dev.js dev check
```

3) 离线模拟一条入站消息（重点）：

```bash
# 单协议
node ./bin/xunlu-dev.js simulate "示例" --plugin example-plugin --protocol milky --scene group --group 123 --user 10001

# 同一输入分别跑 milky + onebotv11（两次独立加载插件并输出两段结果）
node ./bin/xunlu-dev.js simulate "示例" --plugin example-plugin --protocol both --scene group --group 123 --user 10001

# 同一输入分别跑 milky + onebotv11 + icqq
node ./bin/xunlu-dev.js simulate "示例" --plugin example-plugin --protocol all --scene group --group 123 --user 10001
```

也支持用 `--raw-segments <json>` 直接覆盖入站段（便于测试 reply/image/at 等复杂输入）。

4) 直接模拟非消息事件：

```bash
node ./bin/xunlu-dev.js simulate-event notice.group.increase --plugin group --protocol all --group 123 --user 10001 --operator 10002
node ./bin/xunlu-dev.js simulate-event request.group.add --plugin group --protocol milky --group 123 --user 10001 --flag 456 --comment "申请入群"
```

5) 直接触发定时任务：

```bash
node ./bin/xunlu-dev.js simulate-task 0 --plugin other --protocol icqq-local
```

#### 6.1.1 统一 harness / 严格协议 mock

推荐总入口：`md/testing-handbook-ai.md`

- harness：`src/dev/plugin-test-harness.js`
  - `createPluginTestHarness({ plugins, protocol, selfId, mockMode, renderMode, schedulerMode })`
  - 对外固定提供：`emitMessage()` / `emitEvent()` / `runTask()` / `flushTimeouts()` / `resetCaptures()`
- 严格协议 mock：`src/dev/protocol-mock.js`
  - 统一返回 `{ bot, warnings, errors, calls }`
  - `calls` 统一结构为 `{ protocol, kind, name, params, target }`
- fake 组件：
  - fake scheduler 记录任务注册，可直接按索引触发
  - fake timers 可用 `flushTimeouts()` 手动冲刷
  - fake renderer 记录 `renderCalls`，并返回可继续 `ctx.reply()` 的图片段

协议策略：

- `--protocol icqq`：严格 mock
- `--protocol icqq-local`：保留当前本地链路
- `--protocol both`：`milky + onebotv11`
- `--protocol all`：`milky + onebotv11 + icqq`

输出与退出码：

- 单协议和多协议都统一输出 `replies / apiCalls / renderCalls / warnings / errors / result`
- `--json` 时 stdout 保证是纯 JSON；执行过程中的 `console.log/logger` 走 stderr
- mock 校验失败或插件执行错误退出码为 `1`
- 非法协议、非法事件名、非法 task index 退出码为 `2`

#### 6.1.2 node:test 回归

```bash
npm test
npm run test:unit
npm run test:render
```

说明：

- `npm test`：跑全部回归；真实 Chromium smoke 默认允许按环境变量跳过
- `npm run test:unit`：跑 harness / 协议 / CLI / 代表性插件 smoke
- `npm run test:render`：显式启用真实 Chromium smoke

#### 6.1.3 自动化 smoke（建议做法）

通用策略：为每个插件维护 1~N 条“触发文本”，至少用 `--protocol both` 跑一遍；依赖 ICQQ native 行为的插件，再补 `--protocol icqq` 或 `--protocol all`。

PowerShell 示例（手工维护测试表）：

```powershell
$tests = @(
  @{ plugin = "example-plugin"; text = "示例" }
)

foreach ($t in $tests) {
  node ./bin/xunlu-dev.js simulate $t.text --plugin $t.plugin --protocol both --scene group --group 123 --user 10001
  if ($LASTEXITCODE -ne 0) { throw "simulate failed: $($t.plugin)" }
}
```

### 6.2 联调测试（需要先启动 xunlu-core）

1) 启动：

```bash
node index.js
```

2) 验证控制台：

```bash
node ./bin/xunlubot.js health
node ./bin/xunlubot.js status
```

3) 通过 Control Server 的 `/send` 发测试消息：

```bash
node ./bin/xunlu.js send "测试" --group 428596438
```

4) 修改插件后热重载：

```bash
node ./bin/xunlubot.js restart
```

## 7) 插件开发（最小规则）

- 插件入口：`src/plugins/<name>/index.js`（或 `src/plugins/<name>.js`）
- 默认导出结构：`{ name, register(botApi), apiRoutes?(router), onBotEvent?(event) }`
- handler 入参 `ctx` 的最终消息永远是：`ctx.message: UniversalMessageSegment[]`
- 写插件优先参考：`md/plugin-handbook-ai.md`（模板/规范）、`md/api.md`（ctx/botApi/Bot 能力）与 `md/testing-handbook-ai.md`（测试入口）

## 8) 已知问题/注意事项（截至 2026-04-02）

- `package.json` 的 `npm run init-db` 指向 `scripts/init-dbs.js`，但仓库未发现 `scripts/` 目录
- 许多模块依赖全局 `logger`（由 `src/component/logger/log.js` 初始化）；独立调用模块时需注意先初始化日志
