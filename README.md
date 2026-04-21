# xunlu-core

`xunlu-core` 是一个面向云崽生态的多协议核心插件，也可以独立运行。

它当前支持 3 种典型形态：

- 云崽插件模式：作为 `Miao-Yunzai/plugins/xunlu-core` 被云崽直接加载
- 独立 bot / API 模式：在插件目录单独启动，连接 `milky` 或 `onebotv11`
- 云崽 takeover 模式：当云崽未登录 `icqq` 时，由 `xunlu-core` 连接外部适配器并把事件注入云崽

如果你只想先跑起来，这份 README 会优先回答 5 个问题：

1. 这是什么
2. 怎么启动
3. 怎么接入云崽
4. 怎么连接适配器
5. 有哪些核心插件

更细的 API、WebUI 和协议细节请看文末“进阶文档”。

## 前置条件

- Node.js：见 [.nvmrc](./.nvmrc)，当前为 `22.21.1`
- 项目类型：原生 ESM，`package.json` 已声明 `"type": "module"`
- 配置目录：
  - 默认配置模板：[`config/default_config`](./config/default_config)
  - 运行配置：[`config/config`](./config/config)

推荐先安装依赖：

```bash
pnpm install
```

如果你是在云崽根目录接入插件，则使用云崽自己的安装方式，见下文。

## 快速开始

### 路线 A：独立运行 xunlu-core

适合你已经有 `milky` 或 `onebotv11` 适配器，想把 `xunlu-core` 当作独立 bot 跑起来。

1. 进入插件目录并安装依赖

```bash
cd plugins/xunlu-core
pnpm install
```

2. 修改 [`config/config/bot.config.yaml`](./config/config/bot.config.yaml)

常用字段：

```yaml
adapter: milky
authority: localhost
basePath: :3010
accessToken:
useTLS: false
useSSE: false
```

3. 按适配器需要补充配置：

- `milky`：主要改 `authority / basePath / accessToken`
- `onebotv11`：主要改 [`config/config/onebot.config.yaml`](./config/config/onebot.config.yaml) 里的 `wsPort / wsPath`
- `auto`：会自动按 `milky -> onebotv11 -> API-Server` 依次回退

4. 启动

```bash
node index.js
```

启动后常见入口：

- WebUI：默认 `http://127.0.0.1:3000/webui`
- Control Server：默认 `http://127.0.0.1:3081`

### 路线 B：作为云崽插件接入

适合你想把 `xunlu-core` 直接挂到 `Miao-Yunzai` 里使用。

1. 在云崽根目录安装插件

```bash
# GitHub
git clone --depth=1 https://github.com/shixiansi/xunlu-core plugins/xunlu-core

# 或 Gitee
git clone --depth=1 https://gitee.com/think-first-sxs/xunlu-core plugins/xunlu-core
```

2. 在云崽根目录安装依赖

```bash
pnpm install -P
```

3. 按需要调整云崽配置 [`bot.yaml`](../../config/config/bot.yaml)

最关键的是：

- `skip_login: false`
  - 云崽自己登录 `icqq`，`xunlu-core` 复用现成 `Bot`
- `skip_login: true`
  - 云崽不登录 `icqq`，由 `xunlu-core` 负责连接 `milky/onebotv11` 并 takeover

4. 从云崽根目录启动

```bash
node .
```

或：

```bash
npm run app
```

## 连接云崽

`xunlu-core` 在云崽环境里的实际逻辑不是“只认一种协议”，而是按运行状态自动切换。

### 1. 云崽 `icqq` 已在线

- `xunlu-core` 会直接复用全局 `Bot`
- 此时等价于“插件模式 + icqq 环境”
- 不需要单独再连 `milky/onebotv11`

适用场景：

- 你希望保留云崽自己的 `icqq` 登录链路
- 你只是想增加 `xunlu-core` 的插件能力

### 2. 云崽未在线，或 `skip_login: true`

- `xunlu-core` 会尝试读取自身的 [`bot.config.yaml`](./config/config/bot.config.yaml)
- 再按 `adapter` 配置连接 `milky` 或 `onebotv11`
- 连接成功后，把入站事件注入云崽 Bot，让其他云崽插件也能继续工作

这就是 README 里说的 takeover 模式。

适用场景：

- 你不想让云崽自己走 `icqq`
- 你已经有外部适配器服务
- 你想让云崽插件统一消费外部消息事件

### 云崽侧建议配置

云崽 [`bot.yaml`](../../config/config/bot.yaml) 常用项：

```yaml
ignore_self: true
skip_login: true
```

说明：

- `ignore_self`
  - 默认建议保持 `true`
  - 用来过滤机器人自己发出的回流消息，减少循环触发
- `skip_login`
  - takeover 模式下通常设为 `true`
  - 否则云崽可能卡在 `icqq` 登录阶段

### xunlu-core 侧建议配置

[`config/config/bot.config.yaml`](./config/config/bot.config.yaml) 常用项：

```yaml
adapter: auto
icqq_bridge_enable: true
ctl_enable: true
ctl_port: 3081
webui_enable: true
webui_port: 3000
```

说明：

- `adapter`
  - takeover 或独立运行时使用的适配器类型
- `icqq_bridge_enable`
  - 是否额外启动 `xunlu-core` 自己的 `icqq` 监听
  - 默认建议关闭或按需开启；只有你明确需要额外桥接时再打开
- `ctl_enable / ctl_port`
  - 控制台服务开关与端口，供 `xunlu` 和 `xunlubot` 调用
- `webui_enable / webui_port`
  - 内置后台开关与端口

## 连接适配器

### `milky`

配置文件：[`config/config/bot.config.yaml`](./config/config/bot.config.yaml)

常用配置：

```yaml
adapter: milky
authority: localhost
basePath: :3010
accessToken:
useTLS: false
useSSE: false
```

连接规则：

- Base URL：`http(s)://{authority}{basePath}`
- API：`POST {Base}/api/<method>`
- Event：
  - `useSSE: false` 时走 WebSocket `/{Base}/event`
  - `useSSE: true` 时走 SSE `GET {Base}/event`

示例：

- `authority: localhost`
- `basePath: :3010`

组合后等价于：

- `http://localhost:3010/api/...`
- `http://localhost:3010/event`

适合场景：

- 你已经有 `milky` 服务
- 你需要 `xunlu-core` 独立运行或为云崽 takeover

### `onebotv11`

配置文件：[`config/config/onebot.config.yaml`](./config/config/onebot.config.yaml)

默认配置：

```yaml
wsPort: 2955
wsPath: /OneBotV11
```

`xunlu-core` 在 `onebotv11` 模式下会启动反向 WS 监听，等待远端 OneBot 实现主动连入。

远端配置时，应让它连接：

```text
ws://<xunlu-core所在机器IP>:2955/OneBotV11
```

如果你改了 `wsPort / wsPath`，远端也要同步修改。

适合场景：

- 你手里已有 OneBot v11 实现
- 你希望外部协议端主动连到 `xunlu-core`

### `auto`

配置：

```yaml
adapter: auto
```

回退顺序：

1. `milky`
2. `onebotv11`
3. `API-Server`

适用情况：

- 你还没完全确定最终接哪个适配器
- 你想先尽量自动连通，再做精确配置

### `icqq`

`icqq` 仅推荐用于云崽或插件环境。

原因很简单：

- 当前入口逻辑里，`icqq` 本身依赖云崽全局 `Bot` 或插件环境
- 独立运行时不建议把它当成首选接入路径

如果你的目标是独立部署，请优先选 `milky` 或 `onebotv11`。

## 常用入口与工具

### CLI

`xunlu-core` 自带 3 个常用 CLI：

- `xunlu`
  - 面向“发消息 / 拉日志”的客户端工具
  - 常用：`xunlu send 你好`、`xunlu log --lines 50`
- `xunlubot`
  - 面向控制服务的管理工具
  - 常用：`xunlubot status`、`xunlubot restart`
- `xunlu-dev`
  - 面向开发和测试的工具
  - 常用：`xunlu-dev plugins list`、`xunlu-dev dev check`

如果没有全局安装，也可以直接运行：

```bash
node ./bin/xunlu.js --help
node ./bin/xunlubot.js --help
node ./bin/xunlu-dev.js --help
```

### 控制服务

默认监听：`127.0.0.1:3081`

常用接口：

- `GET /health`
- `GET /status`
- `POST /restart`
- `POST /send`
- `GET /log`

配置位置：[`config/config/bot.config.yaml`](./config/config/bot.config.yaml)

### WebUI

默认地址：

```text
http://127.0.0.1:3000/webui
```

相关配置同样在 [`config/config/bot.config.yaml`](./config/config/bot.config.yaml)：

- `webui_enable`
- `webui_host`
- `webui_port`

## 核心插件功能概览

详细命令建议直接在 bot 里发送：

- `帮助`
- `<插件名>帮助`

这里先列最常用的一批能力。

### 内容解析

- `B站`
  - 发送 B 站视频或直播链接可自动解析，也支持直播和动态订阅
  - 代表命令：`#查询up最新动态 2233`
- `抖音`
  - 发送抖音链接可自动解析视频、图文和热门评论
  - 代表命令：`#抖音登录 <cookie>`
- `Pixiv`
  - 支持随机图和按 tag 获取色图
  - 代表命令：`来张萝莉色图`
- `反钓鱼`
  - 自动扫描群消息中的风险链接，也支持手动检测源码或域名
  - 代表用法：贴一个可疑链接到群里，或手动执行检测命令

### 群管理与互动

- `群管`
  - 提供禁言、踢人、头衔、申请处理、撤回等群管理能力
  - 代表命令：`#禁言 @用户 60秒`
- `学习聊天`
  - 支持群聊学习、主动发言、学习黑名单等互动能力
  - 代表命令：`@bot 开启学习`
- `复读禁言`
  - 自动识别复读并按规则禁言，也支持全局或单群开关
  - 代表命令：`#复读禁言设置`
- `戳一戳`
  - 响应群里的 `poke` 事件
  - 代表触发：戳一戳 bot
- `点赞`
  - 给触发者资料卡点赞，自动按可用能力选择点赞次数
  - 代表命令：`#点赞`

### 娱乐与状态

- `钓鱼`
  - 带签到、商店、仓库、出售、升级的一套小游戏
  - 代表命令：`钓鱼状态`
- `状态卡片`
  - 生成系统状态图片，查看 bot 当前运行情况
  - 代表命令：`系统状态`
- `群日报`
  - 统计群消息、词频、指令使用情况，并支持定时推送
  - 代表命令：`水群统计 7天`
- `TTS`
  - 根据角色模型生成声音文件
  - 代表命令：`可莉说你好`

## 推荐排查顺序

如果你已经装好了但没反应，建议按这个顺序查：

1. 先看配置文件是否在 `config/config`，而不是只改了 `default_config`
2. 再确认当前模式是“云崽在线复用 `icqq`”还是“takeover 外部适配器”
3. 检查 `adapter`、`authority / basePath` 或 `wsPort / wsPath` 是否和远端一致
4. 看 Control Server 是否可访问：`/health`
5. 看 WebUI 是否能打开：`/webui`
6. 用 CLI 拉状态或日志：
   - `xunlubot status`
   - `xunlu log --lines 100`

## 进阶文档

- 通用 API：[`md/api.md`](./md/api.md)
- 协议速查：[`md/onebotv11-milky-api-quickref.md`](./md/onebotv11-milky-api-quickref.md)
- WebUI 接入：[`md/webui-handbook-ai.md`](./md/webui-handbook-ai.md)
- 插件编写：[`md/plugin-handbook-ai.md`](./md/plugin-handbook-ai.md)
- 测试说明：[`md/testing-handbook-ai.md`](./md/testing-handbook-ai.md)
- [`AGENTS.md`](./AGENTS.md)：项目运行说明

## 说明

这次 README 优先解决“快速上手”和“实际接入路径”问题，因此没有把所有插件的全部命令都铺在首页。

如果你已经在 bot 内运行：

- 先发 `帮助`
- 再发 `<插件名>帮助`

通常会比翻源码更快。
