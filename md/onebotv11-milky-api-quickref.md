# OneBotV11 / ICQQ / Milky API 速查（按端拆分，xunlu-core 适配器视角）

用途：让后续 AI / Agent 不翻大段源码，也能快速知道：

1. OneBotV11、ICQQ、Milky 三端分别怎么连、怎么调 API
2. 常用 action / method / native API 的关键参数
3. 在 `xunlu-core` 插件里推荐怎么写，哪些差异已经被通用层抹平

> 这份文档偏“原生端速查”。
>
> 如果你要看统一签名、返回约定，以及每个通用 API 在三端下的完整映射，请优先读 `md/api.md`。
>
> 约定：
> - OneBotV11 的 API 动作名记作 `action`，例如 `send_group_msg`
> - Milky 的 API 方法名记作 `method`，例如 `send_group_message`
> - ICQQ 不是 HTTP / WS 网关协议，本文把 `Client / Group / Friend / User` 对象上的原生调用统称为 `native API`

---

## xunlu-dev simulate 协议说明

- `xunlu-dev simulate`、`simulate-event`、`simulate-task` 现在共用同一套测试执行器与严格协议 mock。
- `--protocol milky|onebotv11|icqq` 会启用 in-process strict mock：不真发 QQ，只做必填字段和类型校验，并返回成功假数据。
- `--protocol icqq-local` 才表示保留当前本地事件链路；适合对照旧行为。
- `--protocol both` 表示依次跑 `milky + onebotv11`；`--protocol all` 表示依次跑 `milky + onebotv11 + icqq`。
- `--json` 时 stdout 是纯 JSON；单协议和多协议都统一包含 `replies / apiCalls / renderCalls / warnings / errors / result`。
- 严格 mock 的 `calls` 结构统一为 `{ protocol, kind, name, params, target }`，适合 CLI、harness 和 `node:test` 共用断言。
- 更完整的测试说明见 `md/testing-handbook-ai.md`。

## 0) 总览（差异一眼看懂）

| 项 | OneBotV11（LLoneBot 常见） | ICQQ（进程内） | Milky（milky-node-sdk） |
|---|---|---|---|
| 事件通道 | 反向 WS 上报（`post_type=message/request/notice/...`） | Node.js 进程内事件 / 对象方法 | `/event`（WebSocket 或 SSE），事件里有 `event_type` |
| API 通道 | HTTP `POST /<action>` 或 WS `{"action","params","echo"}` | `Client / Group / Friend / User` 原生方法 | HTTP `POST /api/<method>` |
| 鉴权 | 通常无，取决于具体实现 | 无额外鉴权；同进程已登录 client 直接调用 | `access_token`，通过 `Authorization: Bearer ...` 传递 |
| 发消息 | `send_private_msg` / `send_group_msg` | `pickFriend()/pickUser().sendMsg()` / `pickGroup().sendMsg()` 或 `sendPrivateMsg()` / `sendGroupMsg()` | `send_private_message` / `send_group_message` |
| 撤回常用字段 | `message_id` | `seq / message_seq` 更常用；部分环境也暴露 `message_id` 兼容层 | `message_seq` + `user_id` 或 `group_id` |
| 表情回应 | `set_msg_emoji_like({ message_id, emoji_id })` | `pickGroup(group_id).setReaction(seq, emoji_id)` | `send_group_message_reaction({ group_id, message_seq, reaction, is_add? })` |

---

## 1) 在 xunlu-core 里怎么写最省事

### 1.1 插件侧优先用通用能力

- 发消息：`await ctx.reply("hello")`
- 指定目标发消息：`await botApi.sendMessage({ group_id }, "hi")`
- 撤回消息：
  - OneBotV11：`await botApi.recallMessage({ message_id })`
  - ICQQ / Milky：`await botApi.recallMessage({ group_id, message_seq })`
- 表情回应：
  - `await botApi.sendGroupMessageReaction({ group_id, message_seq, reaction })`
- 权限判断：
  - 当前发起者：`await ctx.isGroupAdmin()` / `await ctx.isGroupOwner()`
  - bot 自己：`await ctx.isBotGroupAdmin()` / `await ctx.isBotGroupOwner()`

这些能力由 [`src/Bot/api/universal-bot-api.js`](../src/Bot/api/universal-bot-api.js) 统一做协议映射。

### 1.2 只有必须时再调原生 API

`xunlu-core` 会在 `ctx` / `botApi` / `global.Bot` 上提供：

```js
await ctx.sendApi("get_group_info", { group_id: 123 })
await ctx.callApi("get_group_info", { group_id: 123 })
```

注意：

- `sendApi/callApi` 适合 OneBotV11 / Milky 这种 action / method 风格接口。
- `icqq` 更偏“对象方法”风格；很多能力不走 `sendApi`，而是走 `pickGroup()` / `pickUser()` / `setGroupAddRequest()` 这类原生方法。
- “发消息”不要优先手调原生 API，统一用 `ctx.reply()` / `botApi.sendMessage()`，这样可以自动转换 `UniversalMessageSegment[]`。

---

## 2) ICQQ 端（进程内 Client / Group / Friend / User）

### 2.1 运行形态

- `icqq` 不是 OneBot / Milky 那种独立网关服务，而是 Node.js 进程里的 client 对象。
- 在 `xunlu-core` 里，检测到全局 `Bot` 时会优先走 `icqq` 适配。
- 关键入口：
  - [`src/Bot/icqq/EventListener.js`](../src/Bot/icqq/EventListener.js)
  - 本地 `icqq` 类型定义 / 源码

### 2.2 常用对象入口

- `Bot.pickGroup(group_id)` -> `Group`
- `Bot.pickFriend(user_id)` -> `Friend`
- `Bot.pickUser(user_id)` -> `User`
- `Bot` 本身通常就是 `Client`

### 2.3 常用 native API（参数速记）

说明：

- `Sendable` 支持字符串、元素数组、图片、语音、文件等原生段。
- `source?: Quotable` 表示“引用回复”的原生消息对象。
- raw client 侧有一部分 CQHTTP 兼容方法，但插件里一般不建议直接依赖。

**信息类**

- `getFriendList() => Map<number, FriendInfo>`
- `getGroupList() => Map<number, GroupInfo>`
- `getStrangerInfo(user_id)`
- `getGroupInfo(group_id, no_cache?)`
- `getGroupMemberList(group_id, no_cache?)`
- `getGroupMemberInfo(group_id, user_id, no_cache?)`

**消息类**

- `sendPrivateMsg(user_id, message, source?)`
- `sendGroupMsg(group_id, message, source?)`
- `pickFriend(user_id).sendMsg(message, source?)`
- `pickUser(user_id).sendMsg(message, source?)`
- `pickGroup(group_id).sendMsg(message, source?)`
- `deleteMsg(message_id)`：CQHTTP 风格撤回
- `getMsg(message_id)`
- `getChatHistory(message_id, count?)`
- `pickFriend(user_id).getChatHistory(time?, cnt?)`
- `pickGroup(group_id).getChatHistory(seq?, cnt?)`
- `pickFriend(user_id).recallMsg(seq, rand, time)`
- `pickGroup(group_id).recallMsg(seq, rand, pktnum?)`

**群管理 / 申请 / 点赞**

- `setGroupName(group_id, name)`
- `setGroupCard(group_id, user_id, card)`
- `setGroupAdmin(group_id, user_id, enable?)`
- `setGroupSpecialTitle(group_id, user_id, special_title, duration?)`
- `setGroupBan(group_id, user_id, duration?)`
- `setGroupWholeBan(group_id, enable?)`
- `setGroupKick(group_id, user_id, reject_add_request?, message?)`
- `setGroupLeave(group_id)`
- `setFriendAddRequest(flag, approve?, remark?, block?)`
- `setGroupAddRequest(flag, approve?, reason?, block?)`
- `sendLike(user_id, times?)`
- `pickFriend(user_id).thumbUp(times?)`

**表情回应 / 合并转发**

- `pickGroup(group_id).setReaction(seq, emoji_id, type?)`
- `pickGroup(group_id).makeForwardMsg(msgList)`
- `pickFriend(user_id).makeForwardMsg(msgList)`

### 2.4 xunlu-core 通用 API 在 ICQQ 下的映射

| xunlu-core 通用 API | ICQQ 实际调用 |
|---|---|
| `getLoginInfo()` | 返回 `{ user_id: Bot.uin, nickname: Bot.nickname }` |
| `getFriendInfo({ user_id })` | 优先 `getStrangerInfo(user_id)`，失败时降级返回 `{ user_id, nickname }` |
| `getUserInfo({ user_id })` | 同上 |
| `sendMessage({ group_id }, msg)` | `pickGroup(group_id).sendMsg(...)` |
| `sendMessage({ user_id }, msg)` | 优先 `pickFriend(user_id).sendMsg(...)`，否则 `pickUser(user_id).sendMsg(...)` |
| `recallMessage({ group_id / user_id, message_seq })` | `pickGroup/pickFriend/pickUser(...).recallMsg(seq)` |
| `sendGroupMessageReaction({ group_id, message_seq, reaction })` | `pickGroup(group_id).setReaction(message_seq, reaction)`；若运行环境暴露 onebot 风格 `sendApi` 且有 `message_id`，再回退 `set_msg_emoji_like` |
| `sendProfileLike({ user_id, times })` | 优先 `sendLike(user_id, times)`，否则尝试 `pickFriend(user_id).thumbUp(times)` |
| `setGroupName` | `setGroupName(group_id, group_name)` |
| `setGroupMemberCard` | `setGroupCard(group_id, user_id, card)` |
| `setGroupMemberAdmin` | `setGroupAdmin(group_id, user_id, enable)` |
| `setGroupMemberSpecialTitle` | `setGroupSpecialTitle(group_id, user_id, special_title, duration?)` |
| `setGroupMemberMute` | 优先 `pickGroup(group_id).muteMember(user_id, duration)`，再兼容其他 group mute 方法 |
| `setGroupWholeMute` | `setGroupWholeBan(group_id, enable)` |
| `kickGroupMember` | `setGroupKick(group_id, user_id, reject_add_request?, message?)` |
| `quitGroup` | `setGroupLeave(group_id)` |
| `acceptFriendRequest` / `rejectFriendRequest` | `setFriendAddRequest(flag, approve, remark?, block?)` |
| `acceptGroupRequest` / `rejectGroupRequest` | 原生 `icqq` 优先 `setGroupAddRequest(flag, approve, reason?, block?)`；云崽 onebot 包装环境下可回退 `set_group_add_request` |
| `pickUser(user_id)` | `pickUser(user_id)`，若不存在则回退 `pickFriend(user_id)` |
| `pickGroup(group_id)` | `pickGroup(group_id)` |

### 2.5 ICQQ 侧几个容易混淆的点

1. `icqq` raw client 有 `deleteMsg(message_id)`，但在 `xunlu-core` 插件里，撤回时更建议优先保留 `seq / message_seq`，因为 `ctx` 和通用消息引用更容易拿到它。
2. 引用回复时，raw icqq 更推荐传 `source: Quotable`，或者直接让 `ctx.reply(..., true)` 自动处理；不要自己硬拼 OneBot 风格 `reply.data.id`。
3. `pickFriend` 和 `pickUser` 在不同运行环境里的暴露情况可能不同，所以通用层会优先 `pickFriend`，再回退 `pickUser`。

---

## 3) Milky 端（LLoneBot Milky 标准）

### 3.1 连接参数（xunlu-core 配置）

文件：`config/config/bot.config.yaml`

关键字段会原样传给 `new MilkyClient(authority, basePath, accessToken, useTLS, useSSE)`：

```yaml
adapter: milky

authority: localhost
basePath: :3010

# 也可以写成：
# authority: localhost:3010
# basePath: /

accessToken: ""
useTLS: false
useSSE: false
```

Milky URL 规则：

- Base：`http(s)://{authority}{basePath}`
- API：`POST {Base}/api/<method>`
- Event：
  - `useSSE=false`：对 `{Base}/event` 发起 WebSocket 连接
  - `useSSE=true`：`GET {Base}/event`（SSE）

### 3.2 鉴权（access_token）

- Header：`Authorization: Bearer <accessToken>`
- 缺失或错误：HTTP 401

### 3.3 HTTP 调用示例

```bash
curl.exe -s -X POST "http://localhost:3010/api/get_login_info" ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer <accessToken>" ^
  -d "{}"

curl.exe -s -X POST "http://localhost:3010/api/send_group_message" ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer <accessToken>" ^
  -d "{\"group_id\":123,\"message\":[{\"type\":\"text\",\"data\":{\"text\":\"hi\"}}]}"
```

### 3.4 常用 method（参数速记）

说明：

- `no_cache` 多数为可选布尔值。
- `message_scene` 取值：`friend | group | temp`
- `peer_id`：会话对端 ID
- `reaction` 在 Milky 里是字符串；`xunlu-core` 会兼容把 `emoji_id` 转成 `reaction`

**信息类**

- `get_login_info()`
- `get_impl_info()`
- `get_user_profile({ user_id })`
- `get_friend_list({ no_cache? })`
- `get_friend_info({ user_id, no_cache? })`
- `get_group_list({ no_cache? })`
- `get_group_info({ group_id, no_cache? })`
- `get_group_member_list({ group_id, no_cache? })`
- `get_group_member_info({ group_id, user_id, no_cache? })`

**消息类**

- `send_private_message({ user_id, message })` -> `{ message_seq, time }`
- `send_group_message({ group_id, message })` -> `{ message_seq, time }`
- `recall_private_message({ user_id, message_seq })`
- `recall_group_message({ group_id, message_seq })`
- `get_message({ message_scene, peer_id, message_seq })`
- `get_history_messages({ message_scene, peer_id, start_message_seq?, limit? })`
- `get_forwarded_messages({ forward_id })`
- `mark_message_as_read({ message_scene, peer_id, message_seq })`

**群管理 / 申请**

- `set_group_name({ group_id, new_group_name })`
- `set_group_member_card({ group_id, user_id, card })`
- `set_group_member_admin({ group_id, user_id, is_set })`
- `set_group_member_special_title({ group_id, user_id, special_title })`
- `set_group_member_mute({ group_id, user_id, duration })`
- `set_group_whole_mute({ group_id, is_mute })`
- `kick_group_member({ group_id, user_id, reject_add_request? })`
- `quit_group({ group_id })`
- `accept_group_request({ notification_seq, notification_type, group_id, is_filtered? })`
- `reject_group_request({ notification_seq, notification_type, group_id, is_filtered?, reason? })`

**表情回应**

- `send_group_message_reaction({ group_id, message_seq, reaction, is_add? })`

### 3.5 Milky message 段（`send_*_message`）

```json
[
  { "type": "text", "data": { "text": "hello" } },
  { "type": "mention", "data": { "user_id": 10001 } },
  { "type": "mention_all", "data": {} },
  { "type": "reply", "data": { "message_seq": 123 } },
  { "type": "image", "data": { "uri": "file:///C:/path/to/a.png" } }
]
```

---

## 4) OneBotV11 端（xunlu-core 反向 WS + OneBot Action）

### 4.1 连接参数（xunlu-core 配置）

文件：`config/config/onebot.config.yaml`

```yaml
wsPort: 2955
wsPath: /OneBotV11
```

启动 OneBotV11 适配器后，`xunlu-core` 会监听：

- `ws://127.0.0.1:<wsPort><wsPath>`

并要求 OneBot 侧以反向 WS 客户端连入。路径必须精确匹配 `wsPath`。

### 4.2 WS 调用格式

请求：

```json
{ "action": "get_login_info", "params": {}, "echo": "any-string" }
```

响应：

```json
{
  "status": "ok",
  "retcode": 0,
  "data": { "user_id": 123, "nickname": "bot" },
  "echo": "any-string"
}
```

### 4.3 HTTP 调用示例（取决于 OneBot 实现）

```bash
curl.exe -s -X POST "http://127.0.0.1:3000/get_login_info" ^
  -H "Content-Type: application/json" ^
  -d "{}"

curl.exe -s -X POST "http://127.0.0.1:3000/send_group_msg" ^
  -H "Content-Type: application/json" ^
  -d "{\"group_id\":123,\"message\":\"hi\"}"
```

### 4.4 常用 action（参数速记）

**信息类**

- `get_login_info()`
- `get_status()`
- `get_version_info()`

**列表 / 查询**

- `get_friend_list()`
- `get_stranger_info({ user_id, no_cache? })`
- `get_group_list()`
- `get_group_info({ group_id, no_cache? })`
- `get_group_member_list({ group_id, no_cache? })`
- `get_group_member_info({ group_id, user_id, no_cache? })`

**消息类**

- `send_private_msg({ user_id, message })`
- `send_group_msg({ group_id, message })`
- `delete_msg({ message_id })`
- `get_msg({ message_id })`
- `get_forward_msg({ message_id })`
- `mark_msg_as_read({ message_id })`

**群管理 / 请求**

- `set_friend_add_request({ flag, approve, remark? })`
- `set_group_add_request({ flag, sub_type, approve, reason? })`
- `set_group_name({ group_id, group_name })`
- `set_group_card({ group_id, user_id, card })`
- `set_group_admin({ group_id, user_id, enable })`
- `set_group_special_title({ group_id, user_id, special_title, duration? })`
- `set_group_ban({ group_id, user_id, duration })`
- `set_group_whole_ban({ group_id, enable })`
- `set_group_kick({ group_id, user_id, reject_add_request? })`
- `set_group_leave({ group_id, is_dismiss? })`

**表情回应**

- `set_msg_emoji_like({ message_id, emoji_id })`

### 4.5 OneBot message 段（两种常见写法）

1. 段数组：

```json
[
  { "type": "text", "data": { "text": "hello" } },
  { "type": "at", "data": { "qq": "all" } },
  { "type": "image", "data": { "file": "file:///C:/path/to/a.png" } }
]
```

2. CQCode：

```text
hello [CQ:at,qq=all][CQ:image,file=file:///C:/path/to/a.png]
```

---

## 5) 最常见的坑

1. 撤回参数不通用：
   - OneBotV11 主要记 `message_id`
   - ICQQ / Milky 在 `xunlu-core` 通用层里更建议记 `message_seq / seq`

2. `sendApi/callApi` 不会自动把 `UniversalMessageSegment[]` 转成原生消息段：
   - 发消息统一用 `ctx.reply()` / `botApi.sendMessage()`

3. `icqq` 不是 HTTP / WS 网关：
   - 不要把 `pickGroup().setReaction()`、`setGroupAddRequest()` 这类对象方法当成 action / method 去拼 URL

4. `pickFriend` 和 `pickUser` 不一定同时可用：
   - 插件里优先用通用 API 或 `ctx.pickUser()`，不要假设底层一定有 `pickFriend`

5. 群申请参数风格不同：
   - OneBotV11 需要 `sub_type=add|invite`
   - Milky 需要 `notification_seq + notification_type + group_id`
   - ICQQ raw client 直接是 `setGroupAddRequest(flag, approve, reason?, block?)`

---

## 6) 进一步阅读

- 通用 API 封装：[`src/Bot/api/universal-bot-api.js`](../src/Bot/api/universal-bot-api.js)
- ICQQ 事件桥：[`src/Bot/icqq/EventListener.js`](../src/Bot/icqq/EventListener.js)
- Milky 适配器：[`src/Bot/llonebot/milky-adapter.js`](../src/Bot/llonebot/milky-adapter.js)
- OneBotV11 适配器：[`src/Bot/onebotV11/onebot.js`](../src/Bot/onebotV11/onebot.js)
- 通用消息段：[`src/Bot/message/universal-message.js`](../src/Bot/message/universal-message.js)
- 消息格式差异：`md/onebotv11-milky-message-format.md`
