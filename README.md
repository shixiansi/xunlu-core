# xunlu-core 荨鹿核心

一个既能被云崽插件加载的插件，同时可以通过http连接到llonebot的插件，除此之外还可以单独当做api服务器使用

快速开始：

```bash
npm i  #安装依赖
node index  #直接运行
```

插件安装

```bash
#github
git clone --depth=1 https://github.com/shixiansi/xunlu-core plugins/xunlu-core
pnpm install -P
#gitee
git clone --depth=1 https://gitee.com/think-first-sxs/xunlu-core plugins/xunlu-core
pnpm install -P
```

QQ群：428596438

## Bot 适配器与启动

- `config/config/bot.config.yaml` 新增 `adapter: milky|onebotv11|icqq|auto`（默认 `milky`）
- 云崽/插件环境默认优先走 `icqq`（检测到 `Bot.isOnline()` 为 true 时）

## 云崽接管模式（Milky / OneBotV11）

当云崽未登录 ICQQ（常见于 `config/config/bot.yaml: skip_login: true`，或 `Bot.isOnline()` 长期为 `false`）时，`xunlu-core` 会尝试按自身配置连接 `milky/onebotv11`，并把入站事件 **注入到云崽 Bot**，从而让 **其它云崽插件也能正常收发消息**。

### 云崽侧配置

- `config/config/bot.yaml`：设置 `skip_login: true`（否则 icqq 登录失败时，云崽可能不会加载插件，无法接管）
- 可选：`ignore_self: true`（默认即为 true，用于过滤“机器人自己发出的回流消息”，避免触发循环）

### xunlu-core 侧配置

- `config/config/bot.config.yaml`：
  - `adapter: milky | onebotv11 | auto`
  - milky 参数：`authority/basePath/accessToken/useTLS/useSSE`
- `config/config/onebot.config.yaml`：`wsPort/wsPath`

### OneBot 连接说明

`onebotv11` 接管时，`xunlu-core` 会在云崽侧启动 **反向 WS 监听**。远端 onebot 实现需要配置为“反向 WS”，连接到：

`ws://<云崽IP>:<wsPort><wsPath>`

### 可选：启用 icqq bridge

接管模式下默认不会再额外启动 `xunlu-core` 自己的 icqq 监听（避免在 `skip_login` 场景引入额外覆写/噪音）。如确有需要，可在配置中开启：

`config/config/bot.config.yaml`：设置 `icqq_bridge_enable: true`

## CLI（开发/运维）

- 客户端：`xunlu --help`（或 `npm run xunlu -- --help`），支持 `xunlu send`/`xunlu log`
- 服务端控制台：`xunlubot --help`（或 `xunlu-bot --help`），需 bot 已启动
- 修改插件后重载：`xunlubot restart`（调用本地控制台 `/restart` 重载插件）
- 进阶工具：`xunlu-dev --help`（目录树/检查/报告等）

## 插件 ctx 标准（统一消息格式）

所有端（`milky / onebotv11 / icqq`）入站事件会先转换为统一标准，再交给插件处理。

### 常用字段

- `ctx.protocol`: `milky | onebotv11 | icqq`
- `ctx.message`: `UniversalMessageSegment[]`（统一段结构）
  - 文本：`{ type: "text", data: { content } }`
  - @某人：`{ type: "at", data: { target } }`
  - @全体：`{ type: "atAll", data: {} }`
  - 表情：`{ type: "face", data: { id } }`
  - 回复：`{ type: "reply", data: { msgId?, seq? } }`
  - 图片：`{ type: "image", data: { url, fileId?, path?, summary? } }`
  - 文件：`{ type: "file", data: { url?, fileId?, path?, name?, size? } }`
- 便捷派生（由框架自动计算）
  - `ctx.msg`: 拼接所有文本段
  - `ctx.url`: 从 `ctx.msg` 提取到的第一个 URL（若存在）
  - `ctx.img`: 所有图片 URL 数组
  - `ctx.atBot / ctx.at / ctx.atAll`
  - `ctx.messageRef`: 当前消息引用 `{ msgId?, seq? }`

### 统一方法

- `await ctx.reply(msg, quote=false, { recallMsg?: number, at?: string })`
- `await ctx.getMessage({ msgId?, seq? })`
- `await ctx.getReplyMessage()`

### 最小示例

```js
import { segment } from "../../Bot/segment.js"

export function register(bot) {
  bot.registerCommand(["^图片$"], async ctx => {
    const url = ctx.message.find(s => s.type === "image")?.data?.url
    if (!url) return ctx.reply("没有图片")
    return ctx.reply([segment.image(url), url])
  })
}
```

老插件保留的功能

- B站直播/动态推送
- B站链接解析
- 抖音解析
- 群聊学习表情包
- 引用撤回
- b站直播和动态推送
- 水群统计
- 伪装
- 随机段子/疯狂星期四
- 戳一戳

新功能

- 色图（按tag搜索）（完成 2026.1.27 瑟瑟是第一生产力）
- b站扫码获取ck
- Webui
- 复读机禁言（随机禁言时长1-10分钟）
- 学习功能随机发送
- 随机复读
