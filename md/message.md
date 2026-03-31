# 消息与消息段（UniversalMessageSegment）速查

在 `xunlu-core` 中，插件 handler 收到的消息**最终形态**统一为：

- `ctx.message: UniversalMessageSegment[]`
- `ctx.msg: string`（从 `text` 段拼接得到的纯文本，用于正则匹配）

定义与转换：
- 通用段定义：`src/Bot/message/universal-message.js`
- 派生字段计算：`src/Bot/message/context.js`

> 推荐：发消息优先用 `ctx.reply()` / `botApi.sendMessage()`，让框架按 `ctx.protocol` 自动转换；仅在必须时再用 `ctx.sendApi()/ctx.callApi()` 调协议原生 API（参数差异见 `md/onebotv11-milky-api-quickref.md`）。

---

## 1) 通用段类型（UniversalSegmentType）

| type | 含义 | data（最小字段） |
|---|---|---|
| `text` | 文本 | `{ content: string }` |
| `at` | @某人 | `{ target: string\|number }` |
| `atAll` | @全体 | `{}` |
| `face` | 表情 | `{ id?: number\|string }` |
| `reply` | 引用/回复 | `{ msgId?: string, seq?: number }`（二选一） |
| `image` | 图片 | `{ url\|fileId\|path 之一 }` |
| `record` | 语音 | `{ url\|fileId\|path 之一 }` |
| `video` | 视频 | `{ url\|fileId\|path 之一 }` |
| `file` | 文件 | `{ url\|fileId\|path 之一, name?, size? }` |
| `forward` | 合并转发 | 建议用 `ctx.makeGroupForwardMsg(...)` 生成原生结构后透传 |

---

## 2) 构造与发送（推荐）

### 2.1 直接发字符串（最常用）

```js
await ctx.reply("hello")
```

### 2.2 用 `UniversalMessageSegment` 快捷方法

```js
import { UniversalMessageSegment as U } from "../../Bot/message/universal-message.js"

await ctx.reply([U.mention(ctx.user_id), U.text("你好")])
```

### 2.3 用通用 API 发送到指定目标

```js
await botApi.sendMessage({ group_id: 123 }, "hi")
await botApi.sendMessage({ user_id: 10001 }, "hi")
```

---

## 3) 重要差异：`reply/sendMessage` vs `sendApi/callApi`

- `ctx.reply()` / `botApi.sendMessage()`：接收通用段（或字符串），并**自动转换**到当前协议：
  - OneBotV11：`[{ type, data }]`
  - Milky：`[{ type, data }]`
- `ctx.sendApi()/ctx.callApi()`：只负责调用“原生 action/method”，**不会**把通用段自动转成原生段。
  - 例如 `send_group_msg/send_group_message` 的 `message` 参数需要传协议原生段结构（见 `md/onebotv11-milky-api-quickref.md`）。

离线测试提示：
- `xunlu-dev simulate --protocol milky|onebotv11|both` 会启用协议 mock，对这些原生参数做“必填+类型”校验（见 `AGENTS.md`）。

