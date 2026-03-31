# OneBotV11 / Milky API 速查（按端拆分，xunlu-core 适配器视角）

用途：让后续 AI/Agent **不翻大段源码**也能快速知道：
1) OneBotV11 与 Milky 两端分别怎么连、怎么鉴权、怎么调用 API  
2) 常用 action/method 的**关键参数**（尤其是 `message_id` vs `message_seq`）  
3) 在 `xunlu-core` 插件里推荐怎么写（优先用通用 API；需要时再走原生 API）

> 约定：本文把 OneBotV11 的“API 动作名”称为 **action**（例如 `send_group_msg`），把 Milky 的“API 方法名”称为 **method**（例如 `send_group_message`）。

---

## xunlu-dev simulate 协议 mock（离线更贴近真实）

- `xunlu-dev simulate` 在 `--protocol milky|onebotv11` 下会启用 **in-process mock**：不真发 QQ，只做 **必填字段 + 类型**校验并返回“成功假数据”。
- 多余字段不会失败，但会记录 `warning`；未知 action/method **直接报错**（避免“假通过”）。
- `--protocol both` 会对同一条输入依次跑 `milky` 与 `onebotv11` 两次；`--json` 输出为 `{ ok, results: { milky, onebotv11 } }`。

## 0) 总览（差异一眼看懂）

|项|OneBotV11（LLOneBot 常见）|Milky（milky-node-sdk）|
|---|---|---|
|事件通道|反向 WS 上报（`post_type=message/request/notice/...`）|`/event`（WebSocket 或 SSE），事件里有 `event_type`|
|API 通道|HTTP `POST /<action>` 或 WS `{"action","params","echo"}`|HTTP `POST /api/<method>`（SDK 同时维护事件连接）|
|鉴权|通常无（看实现）|`access_token`（Header `Authorization: Bearer ...`），缺失/错误返回 401|
|发消息动作名|`send_private_msg` / `send_group_msg`|`send_private_message` / `send_group_message`|
|撤回所需字段|`message_id`（数值）|`message_seq` +（`user_id` 或 `group_id`）|
|表情回应（点赞/emoji）|`set_msg_emoji_like({ message_id, emoji_id })`（实现相关）|`send_group_message_reaction({ group_id, message_seq, reaction, is_add? })`|

---

## 1) 在 xunlu-core 里“怎么用”最省事（推荐写法）

### 1.1 插件侧：优先使用通用能力（跨端自动转）

- 发消息：`await ctx.reply("hello")`
- 需要指定目标：`await botApi.sendMessage({ group_id }, "hi")`
- 需要撤回：`await botApi.recallMessage({ message_id })`（OneBot）或 `await botApi.recallMessage({ group_id, message_seq })`（Milky）

这些通用能力由 `src/Bot/api/universal-bot-api.js` 负责把参数差异“抹平”。

### 1.2 插件侧：需要调原生 API 时再用 `sendApi/callApi`

`xunlu-core` 会在 `ctx` / `botApi` / `global.Bot` 上提供：

```js
await ctx.sendApi("get_group_info", { group_id: 123 })
await ctx.callApi("get_group_info", { group_id: 123 }) // 同义
```

注意点（很关键）：
- `sendApi/callApi` **不会**把 `UniversalMessageSegment[]` 自动转成 OneBot/Milky 的原生 message 段；  
  “发消息”请优先用 `ctx.reply()` / `botApi.sendMessage()`。
- action/method 名容错：
  - OneBotV11：支持 `"send_like"` / `"/send_like"`
  - Milky：支持 `"get_login_info"` / `"api/get_login_info"` / `"/api/get_login_info"`

---

## 2) Milky 端（LLoneBot Milky 标准）

### 2.1 连接参数（xunlu-core 配置）

文件：`config/config/bot.config.yaml`（首次运行会从 `config/default_config` 同步）

关键字段（会原样传入 `new MilkyClient(authority, basePath, accessToken, useTLS, useSSE)`）：

```yaml
adapter: milky

# MilkyClient(authority, basePath, ...) 内部会拼成：http(s)://{authority}{basePath}
# 你可以写成两段（推荐保留默认风格）：
authority: localhost
basePath: :3010

# 或写成一段（更直观）：
# authority: localhost:3010
# basePath: /

accessToken: ""  # 可空；不为空时需在请求头携带 Authorization: Bearer <token>
useTLS: false    # true => https + wss
useSSE: false    # true => /event 用 SSE；false => /event 用 WebSocket
```

Milky 端 URL 规则（来自 `@saltify/milky-node-sdk` 的实现）：
- Base：`http(s)://{authority}{basePath}`
- API：`POST {Base}/api/<method>`（JSON body）
- Event：
  - `useSSE=false`：对 `{Base}/event` 发起 WebSocket 连接
  - `useSSE=true`：`GET {Base}/event`（SSE）

### 2.2 鉴权（access_token）

当 `accessToken` 非空时：
- Header：`Authorization: Bearer <accessToken>`
- 未携带或错误：HTTP 401

### 2.2.1 HTTP 调用示例（curl）

```bash
# 以 Base=http://localhost:3010 为例（见上面的 authority/basePath）

# get_login_info
curl.exe -s -X POST "http://localhost:3010/api/get_login_info" -H "Content-Type: application/json" -H "Authorization: Bearer <accessToken>" -d "{}"

# send_group_message（最小可用：只发 text 段）
curl.exe -s -X POST "http://localhost:3010/api/send_group_message" -H "Content-Type: application/json" -H "Authorization: Bearer <accessToken>" -d "{\"group_id\":123,\"message\":[{\"type\":\"text\",\"data\":{\"text\":\"hi\"}}]}"
```

### 2.3 常用 method（参数速记）

说明：
- `no_cache` 多数为可选布尔值（默认 false）
- `message_scene` 取值：`friend | group | temp`
- `peer_id`：会话对端 ID（群=群号；私聊/临时=对方 user_id）

**信息类**
- `get_login_info()` -> `{ user_id, nickname }`
- `get_impl_info()` -> `{ app_name, app_version, milky_version, ... }`
- `get_user_profile({ user_id })`
- `get_friend_list({ no_cache? })`
- `get_friend_info({ user_id, no_cache? })`
- `get_group_list({ no_cache? })`
- `get_group_info({ group_id, no_cache? })`
- `get_group_member_list({ group_id, no_cache? })`
- `get_group_member_info({ group_id, user_id, no_cache? })`

**消息类（重点：Milky 用 `message_seq`）**
- `send_private_message({ user_id, message })` -> `{ message_seq, time }`
- `send_group_message({ group_id, message })` -> `{ message_seq, time }`
- `recall_private_message({ user_id, message_seq })`
- `recall_group_message({ group_id, message_seq })`
- `get_message({ message_scene, peer_id, message_seq })`
- `get_history_messages({ message_scene, peer_id, start_message_seq?, limit? })`
- `get_forwarded_messages({ forward_id })`（获取合并转发内容）
- `mark_message_as_read({ message_scene, peer_id, message_seq })`

**群管理类（常用）**
- `set_group_name({ group_id, new_group_name })`
- `set_group_member_card({ group_id, user_id, card })`
- `set_group_member_admin({ group_id, user_id, is_set })`
- `set_group_member_special_title({ group_id, user_id, special_title })`
- `set_group_member_mute({ group_id, user_id, duration })`
- `set_group_whole_mute({ group_id, is_mute })`
- `kick_group_member({ group_id, user_id, reject_add_request? })`
- `quit_group({ group_id })`

**群请求/邀请**
- `get_group_notifications({ start_notification_seq?, is_filtered?, limit? })`
- `accept_group_request({ notification_seq, notification_type, group_id, is_filtered? })`（`notification_type=join_request|invited_join_request`）
- `reject_group_request({ notification_seq, notification_type, group_id, is_filtered?, reason? })`（`notification_type=join_request|invited_join_request`）
- `accept_group_invitation({ group_id, invitation_seq })`
- `reject_group_invitation({ group_id, invitation_seq })`

**表情回应**
- `send_group_message_reaction({ group_id, message_seq, reaction, is_add? })`  
  - `reaction`：字符串（例如 `"128512"`），`is_add` 默认 true

### 2.4 Milky message 段（用于 `send_*_message`）

Milky 发送消息的 `message` 是数组：`OutgoingSegment[]`（最常用如下）：

```json
[
  { "type": "text", "data": { "text": "hello" } },
  { "type": "mention", "data": { "user_id": 10001 } },
  { "type": "mention_all", "data": {} },
  { "type": "reply", "data": { "message_seq": 123 } },
  { "type": "image", "data": { "uri": "file:///C:/path/to/a.png" } }
]
```

提示：
- Milky 的资源段（image/record/video）发送侧用 `uri`；接收侧常见的是 `resource_id/temp_url`（由服务端返回临时链接）。
- 在 `xunlu-core` 插件里，一般不需要自己拼 Milky 段；用 `UniversalMessageSegment`/`ctx.reply()` 更省心（见 `md/message.md`）。

---

## 3) OneBotV11 端（xunlu-core 反向 WS + OneBot Action）

### 3.1 连接参数（xunlu-core 配置）

文件：`config/config/onebot.config.yaml`

```yaml
wsPort: 2955
wsPath: /OneBotV11
```

启动 OneBotV11 适配器后（`XUNLU_ADAPTER=onebotv11`），`xunlu-core` 会监听：
- `ws://127.0.0.1:<wsPort><wsPath>`

并要求 OneBot 侧（例如 LLOneBot）**以反向 WS 客户端**连接进来；路径必须精确等于 `wsPath`，否则会被拒绝（见 `src/Bot/onebotV11/onebot.js` 的 `verifyClient`）。

注意：连接 URL 不能携带 querystring（例如 `/OneBotV11?token=...`），否则会被 `verifyClient` 拒绝。

### 3.2 WS 调用格式（action/params/echo）

请求（xunlu-core -> OneBot 实现）：
```json
{ "action": "get_login_info", "params": {}, "echo": "any-string" }
```

响应（OneBot 实现 -> xunlu-core）：
```json
{ "status": "ok", "retcode": 0, "data": { "user_id": 123, "nickname": "bot" }, "echo": "any-string" }
```

### 3.2.1 HTTP 调用示例（可选：取决于 OneBot 实现）

很多 OneBot 实现同时提供 HTTP API（并不由 xunlu-core 提供），格式通常是：
- `POST http://<host>:<port>/<action>`（JSON body）

```bash
# 以 http://127.0.0.1:3000 为例（请按你的 OneBot HTTP 端口调整）

curl.exe -s -X POST "http://127.0.0.1:3000/get_login_info" -H "Content-Type: application/json" -d "{}"

curl.exe -s -X POST "http://127.0.0.1:3000/send_group_msg" -H "Content-Type: application/json" -d "{\"group_id\":123,\"message\":\"hi\"}"
```

### 3.3 常用 action（参数速记）

**信息类**
- `get_login_info()`
- `get_status()`
- `get_version_info()`

**列表/查询**
- `get_friend_list()`
- `get_stranger_info({ user_id, no_cache? })`
- `get_group_list()`
- `get_group_info({ group_id, no_cache? })`
- `get_group_member_list({ group_id, no_cache? })`
- `get_group_member_info({ group_id, user_id, no_cache? })`

**发消息（重点：OneBot 用 `message_id`）**
- `send_private_msg({ user_id, message })`
- `send_group_msg({ group_id, message })`
- `delete_msg({ message_id })`（撤回）
- `get_msg({ message_id })`
- `get_forward_msg({ message_id })`
- `mark_msg_as_read({ message_id })`

**群管理/请求**
- `set_friend_add_request({ flag, approve, remark? })`
- `set_group_add_request({ flag, sub_type, approve, reason? })`（`sub_type=add|invite`）
- `set_group_name({ group_id, group_name })`
- `set_group_card({ group_id, user_id, card })`
- `set_group_admin({ group_id, user_id, enable })`
- `set_group_special_title({ group_id, user_id, special_title, duration? })`
- `set_group_ban({ group_id, user_id, duration })`
- `set_group_whole_ban({ group_id, enable })`
- `set_group_kick({ group_id, user_id, reject_add_request? })`
- `set_group_leave({ group_id, is_dismiss? })`

**表情回应（实现相关）**
- `set_msg_emoji_like({ message_id, emoji_id })`

### 3.4 OneBot message 段（两种常见写法）

1) OneBot 段数组（推荐给程序用）：
```json
[
  { "type": "text", "data": { "text": "hello" } },
  { "type": "at", "data": { "qq": "all" } },
  { "type": "image", "data": { "file": "file:///C:/path/to/a.png" } }
]
```

2) CQCode 字符串（兼容性最好）：
```text
hello [CQ:at,qq=all][CQ:image,file=file:///C:/path/to/a.png]
```

`xunlu-core` 在发送时会优先尝试 CQCode（兼容性更好），失败再退回 segments（见 `src/Bot/onebotV11/onebot.js` 的 `sendPrivateMessage/sendGroupMessage`）。

---

## 4) 最常见的“坑”（写插件时避免踩）

1) **撤回参数**
   - OneBot：`delete_msg({ message_id })`
   - Milky：`recall_*_message({ user_id/group_id, message_seq })`

2) **原生 sendApi 发消息不会自动转换 message 段**
   - 你传 `UniversalMessageSegment[]` 给 `send_private_msg` / `send_private_message` 基本会出问题  
   - 统一用 `ctx.reply()` / `botApi.sendMessage()`（自动转 OneBot/Milky）

3) **路径/前缀容错**
   - OneBot：`"/send_like"` 与 `"send_like"` 都能用
   - Milky：`"/api/get_login_info"`、`"api/get_login_info"`、`"get_login_info"` 都能用

---

## 5) 进一步阅读（源码入口）

- Milky 适配器：`src/Bot/llonebot/milky-adapter.js`
- OneBotV11 适配器：`src/Bot/onebotV11/onebot.js`
- 通用 API 封装：`src/Bot/api/universal-bot-api.js`
- 通用消息段：`src/Bot/message/universal-message.js`（另见 `md/message.md`）
