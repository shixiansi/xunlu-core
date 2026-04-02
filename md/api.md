# Xunlu 通用 QQBot API（插件 / ctx / 全局 Bot）

本项目支持 `icqq / milky / onebotv11` 三种适配器。所有入站事件最终都会被标准化为 **通用消息段**：`ctx.message: UniversalMessageSegment[]`，并通过 `BaseBot.deal()` 分发到插件命令。

## TL;DR（推荐写法）

- **发消息**：优先用 `ctx.reply()` / `botApi.sendMessage()`（会自动按协议转换消息段）
- **跨协议能力**：优先用本文件列出的“通用 QQBot API”（`getGroupInfo/recallMessage/...`）
- **原生协议 API**：仅在必须时再用 `ctx.sendApi()/ctx.callApi()`（参数差异见 `md/onebotv11-milky-api-quickref.md`）
- **离线测试**：`xunlu-dev simulate --protocol milky|onebotv11|both` 会启用协议 mock 做“必填+类型”校验并返回假数据（见 `AGENTS.md`）

本文档描述：

- 插件入口规范（`register(botApi)` / `apiRoutes(router)` / `onBotEvent(event)`）
- `botApi`（注册期可用）的能力
- `ctx`（事件期可用）的字段/方法
- 通用消息段（UniversalMessageSegment）与推荐写法
- 常用事件名约定（用于 `registerCommand([... , eventName])`）
- 附录：通用 API 的参数/返回约定（含多协议差异）

---

## 1) 插件入口规范

插件入口文件：`src/plugins/<name>/index.js`（或 `src/plugins/<name>.js`）。

推荐结构：

```js
export default {
  name: "example",
  register(botApi) {
    botApi.registerCommand(["^hello$"], async ctx => {
      return await ctx.reply("world")
    })
  },
  apiRoutes(router) {
    // 可选：挂载到 /plugins/<name>/*
  },
  onBotEvent(event) {
    // 可选：配合 API server 的 /bot/event
  },
}
```

---

## 2) `botApi`（注册期可用）

`plugin.register(botApi)` 拿到的 `botApi` 同时包含：

- **命令注册/上下文/定时任务能力**
- **通用 QQBot API（与 ctx/全局 Bot 同语义）**

### 2.1 命令注册

`botApi.registerCommand(commandSpec, handler)`

- `commandSpec` 支持两种形式：
  - `string`：仅注册正则字符串（默认监听消息事件）
  - `array`：`[pattern, eventOrPriority?, priority?]`
    - `pattern`：正则字符串（例如 `^今日发言记录$`）
    - `eventOrPriority`：
      - 若为 `string`：事件名过滤（如 `request.group.add`）
      - 若为 `number`：优先级（越小越先匹配）
    - `priority`：优先级（number）
- `handler(ctx)`：返回值为真值时表示已处理；返回 `false` 表示继续匹配下一条命令。

### 2.2 其他能力

- `botApi.contextReply(ctx, callback, endMsg?)`：对同一用户/同一会话的“上下文对话”支持
- `botApi.setTask(cronExpr, taskFn)`：定时任务（基于 `node-schedule`）
- `botApi.callFnc(pluginId, ctxLike)`：调用其他插件的 handler（会自动补齐 `ctx.reply` 等能力）
- `botApi.onMount(asyncFn)`：插件初始化钩子（在所有插件加载完成后执行）

### 2.3 通用 QQBot API（注册期也可用）

以下方法会被注入到 `botApi`（也会在 `ctx` / 全局 `Bot` 上可用，语义一致）：

- `botApi.getBot(): any`：返回运行时全局 `Bot`（可能为 `null`）
- `botApi.sendApi(action, params?)` / `botApi.callApi(action, params?)`：透传原生协议 API
- `botApi.getLoginInfo() => { user_id, nickname }`
- `botApi.getFriendList() => Map<user_id, friend>`
- `botApi.getFriendInfo({ user_id, no_cache? })`（保留 `getUserInfo`，两者语义尽量一致）
- `botApi.sendProfileLike({ user_id, times })`
- `botApi.getGroupList() => Map<group_id, group>`
- `botApi.getGroupInfo({ group_id, no_cache? })`
- `botApi.setGroupName({ group_id, group_name })`
- `botApi.setGroupMemberCard({ group_id, user_id, card })`
- `botApi.setGroupMemberAdmin({ group_id, user_id, enable })`
- `botApi.setGroupMemberSpecialTitle({ group_id, user_id, special_title, duration? })`
- `botApi.setGroupWholeMute({ group_id, enable })`
- `botApi.kickGroupMember({ group_id, user_id, reject_add_request? })`
- `botApi.quitGroup({ group_id, is_dismiss? })`
- `botApi.acceptFriendRequest(input)` / `botApi.rejectFriendRequest(input)`
- `botApi.pickUser(user_id)` / `botApi.pickGroup(group_id)`
- `botApi.sendMessage(target, message)`
- `botApi.recallMessage(params)`
- `botApi.sendGroupMessageReaction(params)`
- `botApi.getUserInfo({ user_id, no_cache? })`
- `botApi.getGroupMemberList(group_id) => Map<user_id, member>`
- `botApi.getGroupMemberInfo(group_id, user_id)`
- `botApi.getGroupMemberRoleFlags(group_id?, user_id?)`
- `botApi.isGroupOwner(group_id?, user_id?)` / `botApi.isGroupAdmin(group_id?, user_id?)`
- `botApi.getBotGroupRoleFlags(group_id?)`
- `botApi.isBotGroupOwner(group_id?)` / `botApi.isBotGroupAdmin(group_id?)`
- `botApi.acceptGroupRequest(input)` / `botApi.rejectGroupRequest(input)`
- `botApi.setGroupMemberMute({ group_id, user_id, duration })`
- `botApi.listCommands(options?)`
- `botApi.invokeCommandByText(rawCommand, options?)`
- `botApi.renderImg(name, data, options?)`
- `botApi.makeGroupForwardMsg(ctx, msgList, desc?, msgsscr?)`
- `botApi.makeGroupForwardMsgByUser(ctx, targetUserId, msgList, desc?)`
- `ctx.makeGroupForwardMsgByUser(targetUserId, msgList, desc?)`
- `botApi.getGroupChatHistory(group_id, date?)`

补充说明：

- 权限判断优先用 `isGroupAdmin / isGroupOwner / isBotGroupAdmin / isBotGroupOwner` 这组 helper；只有在你确实需要拿到角色原始标记时，再用 `getGroupMemberRoleFlags / getBotGroupRoleFlags`
- `listCommands()` 和 `invokeCommandByText()` 依赖 `BaseBot` 实例，适合做帮助系统、调度任务、指令回放
- `makeGroupForwardMsgByUser()` 会自动补齐转发节点里的 `nickname / sender_name / user_id`，避免插件手写身份映射
- `sendApi()` 与 `callApi()` 在 xunlu-core 中语义等价，都会走当前适配器的原生 API；仅在通用 API 不足时再使用

#### `renderImg(name, data, options?)`
使用 **HTML 模板渲染 → Chromium 截图** 生成图片消息，返回值可直接 `ctx.reply()` 发送。

- `name`：插件名（同时决定模板与资源目录）
- `data`：模板数据（会自动注入 `defaulthtml / _res_path / RootPath / botname / version` 等字段）
- `options.tpl`：模板名（不含 `.html`）。默认等于 `name`
  - 模板约定路径：`src/plugins/<name>/resources/html/<name>/<tpl>.html`

返回：成功时返回 `UniversalMessageSegment.image(...)`；失败时返回 `false`（也可能抛出异常，取决于运行环境）。

示例：

```js
const img = await ctx.renderImg("diaoyu", { title: "钓鱼帮助", lines: ["- 钓鱼", "- 钓鱼状态"] }, { tpl: "result" })
if (img) await ctx.reply(img)
else await ctx.reply("渲染失败")
```

详见附录。

---

## 3) `ctx`（事件期可用）

### 3.1 常用字段（统一）

- `ctx.protocol`: `"icqq" | "milky" | "onebotv11"`
- `ctx.adapterType`: 适配器标识（用于调试/显示）
- `ctx.post_type`: `"message" | "notice" | "request"`
- `ctx.message_type`: `"group" | "private"`（消息事件）
- `ctx.notice_type` / `ctx.request_type`: `"group" | "private"`（通知/请求事件）
- `ctx.sub_type`: 子类型（例如 `normal / increase / decrease / add / invite ...`）
- `ctx.group_id`: 群号（群相关事件）
- `ctx.user_id`: 用户 ID（统一后的发起者）
- `ctx.sender_id`: 部分协议额外提供的 sender 字段（会在 `BaseBot.dealMsg()` 内统一到 `ctx.user_id`）
- `ctx.self_id`: bot 自身 ID
- `ctx.message_id`: 消息 ID（onebot 常用）
- `ctx.seq` / `ctx.message_seq`: 消息序号（milky/icqq 常用）
- `ctx.messageRef`: `{ msgId?: string, seq?: number }`（统一引用）

**通用消息：**

- `ctx.message: UniversalMessageSegment[]`：通用消息段（最终真值）
- `ctx.rawSegments: any[]`：适配器原生段（用于调试/解析卡片等）

**派生字段（自动计算）：**

- `ctx.msg: string`：纯文本（已做 `＃ -> #` 等处理）
- `ctx.url: string`：从文本/分享卡片推导出的第一个链接
- `ctx.img: string[]`：图片 URL 列表（通用段）
- `ctx.atBot: boolean`：是否 @ 机器人
- `ctx.at: string`：最后一个 @ 的用户 ID
- `ctx.atAll: boolean`：是否 @ 全体
- `ctx.json: object | undefined`：分享卡片 JSON（onebot/icqq 的 `json` 段，milky 的 `light_app` 段）

### 3.2 常用方法（统一/建议）

- `await ctx.reply(msg, quote=false, { recallMsg?: number, at?: string })`
  - `msg` 支持：`string | UniversalMessage | UniversalMessageSegment | UniversalMessageSegment[] | 原生段数组`
  - `quote=true`：自动引用当前消息（会尽量在三协议下找到 msgId/seq）
  - `recallMsg`：多少秒后撤回（若协议支持）
- `await ctx.getMessage(ref)`：按 `{ msgId?, seq? }` 获取消息（跨协议统一）
- `await ctx.getReplyMessage()`：获取被回复的那条消息（基于 `reply` 段）
- `await ctx.sendApi(action, params?)` / `await ctx.callApi(action, params?)`：调用原生协议 API
- `await ctx.isGroupOwner(group_id?, user_id?)` / `await ctx.isGroupAdmin(group_id?, user_id?)`
- `await ctx.isBotGroupOwner(group_id?)` / `await ctx.isBotGroupAdmin(group_id?)`
- `ctx.listCommands(options?)` / `await ctx.invokeCommandByText(rawCommand, options?)`
- `await ctx.makeGroupForwardMsgByUser(targetUserId, msgList, desc?)`

**通用 QQBot API（同 botApi）：**

`ctx` 上同样会有附录中的通用方法（`sendMessage / acceptGroupRequest / getGroupMemberList ...`）。

---

## 4) 通用消息段（UniversalMessageSegment）

定义与转换实现：

- `src/Bot/message/universal-message.js`
- `src/Bot/message/message-converters.js`

通用类型（`UniversalSegmentType`）：

| type | 含义 | data 关键字段 |
|---|---|---|
| `text` | 文本 | `content` |
| `at` | @某人 | `target` |
| `atAll` | @全体 | - |
| `face` | 表情 | `id` |
| `reply` | 回复 | `msgId?` / `seq?` |
| `image` | 图片 | `url?` / `fileId?` / `path?` / `summary?` |
| `record` | 语音 | `url?` / `fileId?` / `path?` |
| `video` | 视频 | `url?` / `fileId?` / `path?` |
| `file` | 文件 | `url?` / `fileId?` / `path?` / `name?` |
| `forward` | 合并转发 | 建议用 `makeGroupForwardMsg` 生成原生格式 |

推荐：构造消息时优先使用 `segment` 工具（会自动处理本地文件 `file://` → `base64://`）：

```js
import { segment } from "../../Bot/segment.js"

await ctx.reply([
  segment.at(ctx.user_id),
  "你好",
  segment.image("https://example.com/a.png"),
])
```

---

## 5) 事件名约定（用于 registerCommand 的 event 过滤）

事件过滤字符串格式：`post_type.request_type.sub_type`（或 `post_type.message_type.sub_type`）。

常用示例：

- 群消息：`message.group.normal`
- 私聊消息：`message.private.normal`
- 群成员增加：`notice.group.increase`
- 群成员减少：`notice.group.decrease`
- 群申请入群：`request.group.add`
- 邀请入群：`request.group.invite`

> 说明：事件名最终由 `BaseBot.filtEvent()` 组合字段得到；不同协议下字段来源不同，但输出约定一致。

---

## 附录 A：通用 QQBot API 参考

### A.1 sendMessage(target, message)

发送消息（跨协议统一）。

- `target` 支持：
  - `{ group_id }`
  - `{ user_id }`
  - `number|string`（私聊 user_id）
  - 直接传 `ctx`（会自动从 `ctx.group_id/ctx.user_id` 推断）
- `message` 支持：
  - `string|number`
  - `UniversalMessage`
  - `UniversalMessageSegment|UniversalMessageSegment[]`
  - 适配器原生段数组
  - onebot 转发 `node` 段数组（会原样透传）

返回值：适配器原生返回（保证尽量包含 `message_id` 或 `seq` 的其中一个，用于撤回）。

### A.2 recallMessage(params)

撤回消息（跨协议统一）。

推荐参数：

```json
{
  "peer_id": 123,
  "message_seq": 456,
  "message_id": "789",
  "isGroup": true
}
```

- onebotv11 主要用 `message_id`
- milky/icqq 主要用 `message_seq/seq`

### A.3 sendGroupMessageReaction(params)

群消息表情回应（跨协议统一）。

插件侧推荐按 onebot 风格传参：

```json
{
  "group_id": 123,
  "message_id": "xxx",
  "message_seq": 456,
  "reaction": 277
}
```

实现会自动映射为：

- milky：`{ group_id, message_seq, reaction: string, is_add? }`（`reaction` 必须为字符串）
- onebotv11：`{ message_id, emoji_id }`
- icqq：优先 `pickGroup().setReaction(seq, emoji_id)`，否则尝试 `sendApi("set_msg_emoji_like", ...)`

### A.4 getUserInfo({ user_id, no_cache? })

获取用户信息（跨协议统一）。

- milky：`get_user_profile`
- onebotv11：`get_stranger_info`
- icqq：尽量调用原生 API，失败则降级返回 `{ user_id, nickname }`

### A.5 getGroupMemberList(group_id) => Map

统一返回 `Map<user_id, member>`，便于插件直接：

```js
for (const [uid, info] of await ctx.getGroupMemberList(ctx.group_id)) {
  // ...
}
```

### A.6 acceptGroupRequest(input) / rejectGroupRequest(input)

统一输入（建议）：

```json
{
  "flag": "xxx",
  "group_id": 123,
  "type": "join_request",
  "sub_type": "add",
  "reason": "可选"
}
```

自动映射：

- onebotv11：`type=join_request -> sub_type=add`，`type=invited_join_request -> sub_type=invite`
- milky：需要 `notification_seq(=flag) + notification_type(=type) + group_id`
- icqq：尽量走 `set_group_add_request`（不同环境能力差异较大）

### A.7 setGroupMemberMute({ group_id, user_id, duration })

设置群成员禁言：

- `duration`：秒（`0` 表示解除禁言）

### A.8 makeGroupForwardMsg(ctx, msgList, desc?, msgsscr?)

构造合并转发（由适配器输出原生格式；不要依赖 `UniversalSegmentType.forward` 直接发送）。

`msgList` 常用形态：

- `string[]`
- `UniversalMessageSegment[]` / 混合数组（字符串 + segment）
- `{ content, time }[]`（用于转发历史消息）

示例：

```js
import { segment } from "../../Bot/segment.js"

const forward = await ctx.makeGroupForwardMsg(ctx, [
  "测试转发",
  segment.image("https://example.com/a.png"),
], "标题")

await ctx.reply(forward)
```

### A.9 getLoginInfo()

获取 bot 登录信息（跨协议统一）。

返回值（最小可用结构）：`{ user_id: number, nickname: string }`

- milky/onebotv11：透传适配器 `getLoginInfo()`
- icqq：返回 `{ user_id: Bot.uin, nickname: Bot.nickname }`

### A.10 getFriendList() => Map

统一返回 `Map<user_id, friend>`。

- milky：`getFriendList()` 的 `{ friends }` → Map
- onebotv11：`getFriendList()` 返回的列表 → Map
- icqq：`getFriendList()`（原生 Map）直接返回

### A.11 getFriendInfo({ user_id, no_cache? })

获取好友/陌生人信息（跨协议统一）。

- milky：`getFriendInfo({ user_id, no_cache })`（取 `friend` 字段）
- onebotv11：`getFriendInfo({ user_id, no_cache })`
- icqq：优先 `getStrangerInfo(user_id)`，失败时降级返回 `{ user_id, nickname }`

> 备注：同时保留 `getUserInfo({ user_id })`，两者语义尽量一致。

### A.12 getGroupList() => Map

统一返回 `Map<group_id, group>`。

- milky：`getGroupList()` 的 `{ groups }` → Map
- onebotv11：`getGroupList()` 返回的列表 → Map
- icqq：`getGroupList()`（原生 Map）直接返回

示例：

```js
for (const [gid, group] of await ctx.getGroupList()) {
  // ...
}
```

### A.13 getGroupInfo({ group_id, no_cache? })

获取群信息（跨协议统一）。

- milky：`getGroupInfo({ group_id, no_cache })`（取 `group` 字段）
- onebotv11：`getGroupInfo({ group_id })`
- icqq：`getGroupInfo(group_id, no_cache)`

### A.14 setGroupName({ group_id, group_name })

设置群名称（跨协议统一）。

- milky：映射为 `{ group_id, new_group_name: group_name }`
- onebotv11：`{ group_id, group_name }`
- icqq：映射到 `setGroupName(group_id, group_name)`

### A.15 setGroupMemberCard({ group_id, user_id, card })

设置群成员名片（跨协议统一）。

- milky/onebotv11：同名同参
- icqq：映射到 `setGroupCard(group_id, user_id, card)`

### A.16 setGroupMemberAdmin({ group_id, user_id, enable })

设置/取消群管理员（跨协议统一）。

- milky：映射到 `{ group_id, user_id, is_set: enable }`
- onebotv11：`{ group_id, user_id, enable }`
- icqq：映射到 `setGroupAdmin(group_id, user_id, enable)`

### A.17 setGroupMemberSpecialTitle({ group_id, user_id, special_title, duration? })

设置群成员头衔（跨协议统一）。

- milky：忽略 `duration`（types 不支持），只传 `{ group_id, user_id, special_title }`
- onebotv11/icqq：透传 `duration`

### A.18 setGroupWholeMute({ group_id, enable })

设置全员禁言（跨协议统一）。

- milky：映射到 `{ group_id, is_mute: enable }`
- onebotv11：`{ group_id, enable }`
- icqq：映射到 `setGroupWholeBan(group_id, enable)`

### A.19 kickGroupMember({ group_id, user_id, reject_add_request? })

踢出群成员（跨协议统一）。

- milky/onebotv11：同名同参
- icqq：映射到 `setGroupKick(group_id, user_id, reject_add_request, message?)`

### A.20 quitGroup({ group_id, is_dismiss? })

退出群（跨协议统一）。

- milky：只传 `{ group_id }`
- onebotv11：`{ group_id, is_dismiss }`
- icqq：映射到 `setGroupLeave(group_id)`

### A.21 acceptFriendRequest(input) / rejectFriendRequest(input)

处理好友请求（跨协议统一）。

支持两种输入形态（按协议分流）：

- onebotv11/icqq：`{ flag, remark?, block?, reason? }`
- milky：`{ initiator_uid, is_filtered?, reason? }`

> 说明：通用 API 默认会抛异常（reject）。插件侧请 `await` 或显式 `.catch()`，避免未处理的 Promise 导致进程异常退出。
