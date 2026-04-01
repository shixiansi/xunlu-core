# OneBotV11 / ICQQ / Milky 消息接收与发送完整格式说明

核对时间：2026-04-01

本文目标：

- 按“协议原始格式”整理 `OneBotV11`、`ICQQ` 与 `Milky` 的消息接收和发送格式。
- 单独标出 `xunlu-core` 当前实际的归一化/发送行为，避免把“官方 schema”误认为“仓库一定完整支持”。
- 让后续插件开发优先看这一份，不必来回翻 `llms.txt`、外部 schema 和源码。

> 说明：
> 1. “接收”指机器人上报给你的一条消息事件的原始 JSON 结构。
> 2. “发送”指你调用协议 API 发消息时的请求格式。
> 3. 文中若写“推断/实现差异”，表示这是根据外部文档与仓库源码对照后得出的结论，不是外部 schema 明写。

---

## 1. 快速对照

| 项 | OneBotV11 | ICQQ | Milky |
|---|---|---|---|
| 接收通道 | HTTP 上报 / HTTP SSE / WebSocket 事件推送 | 进程内事件回调，如 `client.on("message.*")` | `/event` WebSocket 或 SSE |
| 消息事件主键 | `message_id` + `message_seq` | `message_id` + `seq` + `rand` | `message_seq` |
| 接收消息容器 | `MessageEvent` | `PrivateMessageEvent \| GroupMessageEvent \| DiscussMessageEvent` | `Event(event_type=message_receive, data=IncomingMessage)` |
| 发送私聊 | `send_private_msg` | `Client.sendPrivateMsg()` / `Friend.sendMsg()` | `send_private_message` |
| 发送群聊 | `send_group_msg` | `Client.sendGroupMsg()` / `Group.sendMsg()` | `send_group_message` |
| 发送消息体 | `string` 或 OneBot 消息段数组 | `Sendable` | `OutgoingSegment[]` |
| 回复引用字段 | `reply.data.id = message_id` | `source?: Quotable` 或 `reply.id` / `quote` | `reply.data.message_seq = message_seq` |
| @某人字段 | `at.data.qq` | `at.qq` | `mention.data.user_id` |
| @全体字段 | `at.data.qq = "all"` | `at.qq = "all"` | `mention_all.data = {}` |
| 资源发送字段 | `image/record/video/file.data.file` | `image/record/video/file.file` | `image/record/video.data.uri` |
| 常见撤回参数 | `delete_msg({ message_id })` | `deleteMsg(message_id)` 或 `recallMsg(seq, rand, ...)` | `recall_*_message({ user_id/group_id, message_seq })` |

---

## 2. OneBotV11

### 2.1 接收消息的通道

- HTTP 上报：LLOneBot 在收到事件后，向你的 HTTP 服务 `POST` 一段事件 JSON。
- HTTP SSE：主动 `GET http://<host>:<port>/_events` 建立长连接，按 `data:` 逐条接收事件 JSON。
- WebSocket：无论正向还是反向 WS，连接建立后都能收到事件 JSON；发 API 时则发送 `{"action","params","echo"}`。

协议文档：

- [HTTP 调用/接收消息](https://api.luckylillia.com/doc-5416163.md)
- [Websocket 发送/接受消息](https://api.luckylillia.com/doc-5416167.md)

### 2.2 接收消息事件：`MessageEvent`

OneBotV11 的消息上报主体是 `MessageEvent`。常见群消息大致如下：

```json
{
  "time": 1710000000,
  "self_id": 123456789,
  "post_type": "message",
  "message_id": 1001,
  "message_seq": 1001,
  "user_id": 10001,
  "group_id": 123456,
  "message_type": "group",
  "sub_type": "normal",
  "sender": {
    "user_id": 10001,
    "nickname": "Alice",
    "card": "AliceCard",
    "sex": "female",
    "age": 20,
    "level": "1",
    "role": "member",
    "title": ""
  },
  "message": [
    { "type": "text", "data": { "text": "hello" } }
  ],
  "message_format": "array",
  "raw_message": "hello",
  "font": 14
}
```

关键字段：

- `time`: Unix 秒级时间戳。
- `self_id`: 机器人 QQ 号。
- `post_type`: `message` 或 `message_sent`。
- `message_id`: 消息短 ID，OneBot 常用引用字段。
- `message_seq`: 消息序列号，LLOneBot 扩展字段。
- `user_id`: 发送者 QQ 号。
- `group_id`: 仅群消息存在。
- `message_type`: `private | group`。
- `sub_type`: 文档列出 `friend | group | normal`。
- `sender`: 发送者资料，群消息时常带 `card/role/title/level`。
- `message`: 消息段数组。
- `message_format`: 文档列出 `array | string`，但 `MessageEvent` schema 中 `message` 字段本身写成了数组。
- `raw_message`: CQ 码形式的原始字符串。
- `font`: 字体 ID。
- `target_id`: 仅“已发送消息”场景可出现。
- `temp_source`: 临时会话来源。

来源：

- [MessageEvent](https://api.luckylillia.com/schema-189483988.md)
- [MessageSender](https://api.luckylillia.com/schema-189483989.md)

### 2.3 OneBotV11 接收消息段格式

OneBot 文档把消息段总集定义为 `MessageSegment`。虽然 `MessageEvent.message` 页面列举项略少，但结合 `MessageSegment` 总 schema 与本仓库实现，接收消息可按下面这套总集理解。

> 推断说明：`MessageEvent.message` 页面没有把 `image` 等所有类型全部列齐，但 [MessageSegment](https://api.luckylillia.com/schema-189483990.md) 给出了完整联合类型；`xunlu-core` 的 `fromOnebotV11()` 也明确处理了 `image/record/video/file/forward`。

| `type` | `data` 结构 | 说明 |
|---|---|---|
| `text` | `{ text: string }` | 文本 |
| `image` | `{ file: string, url?: string, file_size?: string, summary?: string, subType?: number, type?: "flash"\|"show", thumb?: string, name?: string }` | 图片 |
| `music` | `{ type?: "qq"\|"163"\|"xm"\|"custom", id?: string, url?: string, audio?: string, title?: string, content?: string, image?: string }` | 音乐卡片 |
| `video` | `{ file: string, url?: string, path?: string, file_size?: string, thumb?: string, name?: string }` | 视频 |
| `record` | `{ file: string, url?: string, path?: string, file_size?: string, thumb?: string, name?: string }` | 语音 |
| `file` | `{ file: string, url?: string, path?: string, file_size?: string, file_id?: string, thumb?: string, name?: string }` | 文件 |
| `flash_file` | `{ title: string, file_set_id: string, scene_type: integer }` | 闪传文件 |
| `at` | `{ qq: string\|number, name?: string }` | `qq="all"` 表示 @全体 |
| `reply` | `{ id: string }` | 引用回复，引用的是 `message_id` |
| `json` | `{ data: string }` | JSON 卡片 |
| `xml` | `{ data: string }` | XML 卡片 |
| `face` | `{ id: string }` | 系统表情 |
| `mface` | `{ emoji_package_id: integer, emoji_id: string, key: string, summary?: string, url?: string }` | 商城表情 |
| `markdown` | `{ content: string }` | Markdown |
| `node` | `{ id?: string\|number, content?: string\|MessageSegment[], user_id?: integer, nickname?: string, name?: string, uin?: string\|number }` | 转发节点 |
| `forward` | `{ id: string }` | 转发消息 ID |
| `poke` | `{ qq?: integer, id?: integer }` | 戳一戳 |
| `dice` | `{ result: integer\|string }` | 骰子 |
| `rps` | `{ result: integer\|string }` | 猜拳 |
| `contact` | `{ type: "qq"\|"group", id: string }` | 联系人/群推荐 |
| `shake` | `{}` | 窗口抖动 |
| `keyboard` | `{ rows: [{ buttons: KeyboardButton[] }] }` | 按钮键盘 |

其中 `KeyboardButton` 结构为：

```json
{
  "id": "btn-1",
  "render_data": {
    "label": "点我",
    "visited_label": "已点",
    "style": 1
  },
  "action": {
    "type": 0,
    "permission": {
      "type": 2,
      "specify_role_ids": [],
      "specify_user_ids": []
    },
    "unsupport_tips": "当前客户端不支持",
    "data": "payload",
    "reply": true,
    "enter": false
  }
}
```

### 2.4 发送消息的请求格式

#### 2.4.1 HTTP

HTTP 调用时，通常是：

```http
POST /send_private_msg
POST /send_group_msg
POST /send_msg
POST /send_private_forward_msg
POST /send_group_forward_msg
Content-Type: application/json
```

请求体示例：

```json
{
  "group_id": 123456,
  "message": [
    { "type": "text", "data": { "text": "hello" } }
  ]
}
```

#### 2.4.2 WebSocket

WS 调用时，外层统一是：

```json
{
  "action": "send_group_msg",
  "params": {
    "group_id": 123456,
    "message": [
      { "type": "text", "data": { "text": "hello" } }
    ]
  },
  "echo": "uuid-or-any-unique-string"
}
```

WS 响应一般是：

```json
{
  "status": "ok",
  "retcode": 0,
  "data": {
    "message_id": 1002
  },
  "echo": "uuid-or-any-unique-string"
}
```

### 2.5 OneBotV11 发送 API 的消息体

常用发送入口：

- `send_private_msg({ user_id, message })`
- `send_group_msg({ group_id, message })`
- `send_msg({ message_type: "private"|"group", user_id?, group_id?, message })`
- `send_private_forward_msg({ user_id, messages })`
- `send_group_forward_msg({ group_id, messages })`

发送返回值通常至少含：

```json
{ "message_id": 1002 }
```

### 2.6 OneBotV11 发送 `message` 的完整格式

OneBot 发送端常见有三种写法：

1. 普通字符串。
2. 消息段数组。
3. 某些实现也接受单个消息段对象，但在 `xunlu-core` 中建议统一按“字符串或数组”理解。

消息段格式沿用前面的 `MessageSegment` 联合类型。最常用发送写法如下：

```json
[
  { "type": "text", "data": { "text": "hello" } },
  { "type": "at", "data": { "qq": "all" } },
  { "type": "image", "data": { "file": "file:///C:/a.png" } },
  { "type": "reply", "data": { "id": "1001" } }
]
```

合并转发发送则一般走 `node`：

```json
[
  {
    "type": "node",
    "data": {
      "uin": 10001,
      "name": "Alice",
      "content": [
        { "type": "text", "data": { "text": "第一条" } }
      ]
    }
  },
  {
    "type": "node",
    "data": {
      "uin": 10002,
      "name": "Bob",
      "content": "第二条"
    }
  }
]
```

---

## 3. ICQQ

### 3.1 接收消息的通道

`icqq` 不是 HTTP / WS 协议网关风格，而是 Node.js 进程内事件风格。

常见监听方式：

- `client.on("message", (event) => ...)`
- `client.on("message.friend", (event) => ...)`
- `client.on("message.group", (event) => ...)`
- `client.on("message.other", (event) => ...)`
- `client.on("message.self", (event) => ...)`
- `client.on("message.normal", (event) => ...)`
- `client.on("message.anonymous", (event) => ...)`

对应 typings：

- `PrivateMessageEventMap`
- `GroupMessageEventMap`
- `Discuss.EventMap`

### 3.2 接收消息事件对象

`icqq` 的消息事件对象主要分三类：

- `PrivateMessageEvent`
- `GroupMessageEvent`
- `DiscussMessageEvent`

它们都继承消息基类 `Message`，并额外挂载快捷方法/实体对象。

#### 3.2.1 公共消息基类：`Message`

常见字段：

- `post_type: "message"`
- `nt: boolean`
- `time: number`
- `message: MessageElem[]`
- `raw_message: string`
- `font: string`
- `message_id: string`
- `seq: number`
- `rand: number`
- `msg_id: bigint`
- `user_id: number`
- `user_uid: string`
- `sender?: object`
- `source?: Quotable`

关键说明：

- `message_id` 是 `cqhttp` 风格字符串 ID。
- 群消息里 `seq` 通常可视为更直接的消息序号。
- 私聊消息唯一性更建议联合 `time + seq + rand` 判断。
- `source` 表示引用回复来源，它本身满足 `Quotable` 结构。

一个典型群消息在运行时常可近似理解为：

```js
{
  post_type: "message",
  message_type: "group",
  sub_type: "normal",
  group_id: 123456,
  group_name: "TestGroup",
  user_id: 10001,
  time: 1710000000,
  message_id: "AAEAA...",
  seq: 321,
  rand: 654321,
  raw_message: "hello",
  message: [
    { type: "text", text: "hello" }
  ],
  sender: {
    user_id: 10001,
    nickname: "Alice",
    card: "",
    level: 1,
    role: "member",
    title: ""
  }
}
```

#### 3.2.2 私聊消息：`PrivateMessageEvent`

`PrivateMessageEvent extends PrivateMessage, MessageEvent`

额外字段：

- `message_type: "private"`
- `sub_type: "friend" | "group" | "other" | "self"`
- `from_id: number`
- `from_uid: string`
- `to_id: number`
- `to_uid: string`
- `auto_reply: boolean`
- `friend: Friend`
- `sender: { user_id, user_uid, nickname, group_id?, discuss_id? }`

额外方法：

- `reply(content: Sendable, quote?: boolean): Promise<MessageRet>`

#### 3.2.3 群消息：`GroupMessageEvent`

`GroupMessageEvent extends GroupMessage, MessageEvent`

额外字段：

- `message_type: "group"`
- `sub_type: "normal" | "anonymous"`
- `group_id: number`
- `group_name: string`
- `anonymous: Anonymous | null`
- `block: boolean`
- `atme: boolean`
- `atall: boolean`
- `group: Group`
- `member: Member`
- `sender: { user_id, user_uid, nickname, sub_id, card, sex, age, area, level, role, title }`

额外方法：

- `reply(content: Sendable, quote?: boolean): Promise<MessageRet>`
- `recall(): Promise<boolean>`

#### 3.2.4 讨论组消息：`DiscussMessageEvent`

`DiscussMessageEvent extends DiscussMessage, MessageEvent`

额外字段：

- `message_type: "discuss"`
- `discuss_id: number`
- `discuss_name: string`
- `atme: boolean`
- `discuss: Discuss`
- `sender: { user_id, nickname, card }`

### 3.3 ICQQ 消息元素定义

`icqq` 的消息元素是“平铺字段”风格，不是 OneBot / Milky 那种 `{ type, data }` 结构。

最重要的类型关系：

- `MessageElem`: 单个消息元素联合类型
- `Sendable = string | MessageElem | (string | MessageElem)[]`
- `ChainElem`: 可安全组合发送的元素子集

特别注意：

- `elements.d.ts` 明确写了“只有 `ChainElem` 中的元素可以组合发送，其他元素只能单独发送”。
- 因此虽然类型层面 `Sendable` 看起来很宽，真正发送时还是要注意组合限制。

#### 3.3.1 常见元素

| `type` | 核心字段 | 备注 |
|---|---|---|
| `text` | `{ type: "text", text: string }` | 发送时也可直接用字符串代替 |
| `at` | `{ type: "at", qq: number \| "all", id?: string \| "all", text?: string, dummy?: boolean }` | `text` 为接收时有效；`qq="all"` 表示 @全体 |
| `face` / `sface` | `{ type, id: number, text?: string, big?: boolean, stickerId?: string, stickerType?: number }` | 表情 |
| `bface` | `{ type: "bface", file: string, text: string }` | 原创表情 |
| `rps` / `dice` | `{ type: "rps"|"dice", id?: number }` | 猜拳 / 骰子 |
| `image` | `{ type: "image", file, cache?, timeout?, headers?, name?, url?, asface?, origin?, summary?, fid?, md5?, sha1?, height?, width?, size?, nt? }` | `file` 发送时可为路径/Buffer/流；`url/name/宽高/size` 多为接收时有效 |
| `flash` | `ImageElem` 同结构但 `type: "flash"` | 闪照 |
| `record` | `{ type: "record", file, url?, fid?, md5?, sha1?, size?, brief?, seconds?, transcode?, temp?, nt? }` | 语音 |
| `video` | `{ type: "video", file, name?, fid?, md5?, sha1?, height?, width?, size?, seconds?, temp?, nt? }` | 视频 |
| `bubble` | `VideoElem` 同结构但 `type: "bubble"` | 泡泡消息 |
| `file` | `{ type: "file", file, name?, fid?, md5?, sha1?, size?, duration?, temp? }` | 文件 |

#### 3.3.2 卡片 / 结构化元素

| `type` | 核心字段 | 备注 |
|---|---|---|
| `json` | `{ type: "json", data: any }` | JSON 卡片 |
| `xml` | `{ type: "xml", data: string, id?: number }` | XML 卡片 |
| `markdown` | `{ type: "markdown", content: string, config?: { unknown?: number, time: number, token: string } }` | Markdown |
| `button` | `{ type: "button", content: { appid: number, rows: [{ buttons: Button[] }] } }` | 按钮消息 |
| `share` | `{ type: "share", ...ShareContent }` | 链接分享 |
| `location` | `{ type: "location", address: string, lat: number, lng: number, name?: string, id?: string }` | 位置分享 |
| `forum` | `{ type: "forum", id: string, create_time: number }` | forum 消息 |
| `poke` | `{ type: "poke", id: number, text?: string }` | 戳一戳 |
| `mirai` | `{ type: "mirai", data: string }` | 特殊消息，官方客户端无法解析 |

其中 `button.content.rows[].buttons[]` 的按钮结构为：

```json
{
  "id": "btn-1",
  "render_data": {
    "label": "点我",
    "visited_label": "已点",
    "style": 1
  },
  "action": {
    "type": 0,
    "permission": {
      "type": 2,
      "specify_user_ids": [],
      "specify_role_ids": []
    },
    "data": "payload",
    "reply": false,
    "enter": false,
    "unsupport_tips": "当前客户端不支持"
  }
}
```

#### 3.3.3 回复 / 引用 / 转发相关元素

| `type` | 核心字段 | 备注 |
|---|---|---|
| `reply` | `{ type: "reply", id: string, text?: string }` | 旧版 cqhttp 风格回复，类型上仍保留，但已标记 deprecated |
| `quote` | `{ type: "quote", user_id: number, time: number, seq: number, rand: number, message: Sendable }` | 真正可引用回复的结构 |
| `node` | `{ type: "node", user_id: number, message: Sendable, nickname?: string, time?: number, seq?: number, rand?: number, preview?: string }` | 转发节点 |
| `multimsg` | `{ type: "multimsg", resid: string, filename: string, title?: string, content?: string, preview?: string[] \| string, prompt?: string, compressed?: string }` | 合并转发卡片 |
| `long_msg` | `{ type: "long_msg", resid: string }` | 长消息 |

辅助结构：

- `Quotable = { user_id, time, seq, rand, message }`
- `Forwardable = { user_id, message, nickname?, time?, seq?, rand?, preview? }`

### 3.4 ICQQ 发送消息的参数与返回

#### 3.4.1 常用发送入口

客户端级 API：

- `Client.sendPrivateMsg(user_id: number, message: Sendable, source?: Quotable)`
- `Client.sendGroupMsg(group_id: number, message: Sendable, source?: Quotable)`
- `Client.sendDiscussMsg(discuss_id: number, message: Sendable, source?: Quotable)`
- `Client.sendTempMsg(group_id: number, user_id: number, message: Sendable)`

实体级 API：

- `Friend.sendMsg(content: Sendable, source?: Quotable)`
- `Group.sendMsg(content: Sendable, source?: Quotable, anony?: boolean | object)`
- `Discuss.sendMsg(content: Sendable)`

#### 3.4.2 返回值：`MessageRet`

```json
{
  "message_id": "AAEAA...",
  "seq": 321,
  "rand": 654321,
  "time": 1710000100
}
```

字段说明：

- `message_id`: 字符串消息 ID。
- `seq`: 消息序号。
- `rand`: 消息随机数。
- `time`: 发送时间。

#### 3.4.3 发送示例

普通群消息：

```js
await client.sendGroupMsg(123456, [
  "你好",
  { type: "at", qq: 10001 },
  { type: "image", file: "file:///C:/a.png" }
])
```

带引用的私聊消息：

```js
await client.sendPrivateMsg(10001, "收到", {
  user_id: 10001,
  time: 1710000000,
  seq: 321,
  rand: 654321,
  message: "原消息"
})
```

转发消息节点：

```js
await client.sendGroupMsg(123456, [
  {
    type: "node",
    user_id: 10001,
    nickname: "Alice",
    message: "第一条"
  },
  {
    type: "node",
    user_id: 10002,
    nickname: "Bob",
    message: [{ type: "text", text: "第二条" }]
  }
])
```

---

## 4. Milky

### 4.1 接收消息的通道

Milky 通过统一事件流 `/event` 推送事件：

- `useSSE=false`: 对 `{Base}/event` 建立 WebSocket 连接。
- `useSSE=true`: `GET {Base}/event` 建立 SSE 长连接。

事件外层统一是：

```json
{
  "event_type": "message_receive",
  "time": 1710000000,
  "self_id": 123456789,
  "data": { ... }
}
```

其中真正的消息内容在 `data` 里，类型是 `IncomingMessage`。

来源：

- [Milky 接口说明](https://api.luckylillia.com/doc-7842052.md)
- [Event](https://api.luckylillia.com/schema-228985044.md)
- [IncomingMessage](https://api.luckylillia.com/schema-228985054.md)

### 4.2 `message_receive` 的 `IncomingMessage`

Milky 把消息分成三种场景：

- `friend`
- `group`
- `temp`

#### 4.2.1 好友消息

```json
{
  "message_scene": "friend",
  "peer_id": 10001,
  "message_seq": 2001,
  "sender_id": 10001,
  "time": 1710000000,
  "segments": [
    { "type": "text", "data": { "text": "hello" } }
  ],
  "friend": {
    "user_id": 10001,
    "nickname": "Alice",
    "sex": "female",
    "qid": "",
    "remark": "",
    "category": {
      "category_id": 0,
      "category_name": "默认"
    }
  }
}
```

#### 4.2.2 群消息

```json
{
  "message_scene": "group",
  "peer_id": 123456,
  "message_seq": 2002,
  "sender_id": 10001,
  "time": 1710000001,
  "segments": [
    { "type": "mention", "data": { "user_id": 123456789, "name": "bot" } },
    { "type": "text", "data": { "text": "你好" } }
  ],
  "group": {
    "group_id": 123456,
    "group_name": "TestGroup",
    "member_count": 20,
    "max_member_count": 500
  },
  "group_member": {
    "user_id": 10001,
    "nickname": "Alice",
    "sex": "female",
    "group_id": 123456,
    "card": "",
    "title": "",
    "level": 1,
    "role": "member",
    "join_time": 1710000000,
    "last_sent_time": 1710000000,
    "shut_up_end_time": null
  }
}
```

#### 4.2.3 临时会话消息

```json
{
  "message_scene": "temp",
  "peer_id": 10001,
  "message_seq": 2003,
  "sender_id": 10001,
  "time": 1710000002,
  "segments": [
    { "type": "text", "data": { "text": "temp message" } }
  ],
  "group": {
    "group_id": 123456,
    "group_name": "SourceGroup",
    "member_count": 20,
    "max_member_count": 500
  }
}
```

关键字段：

- `message_scene`: `friend | group | temp`。
- `peer_id`: 当前会话对端 ID。群消息时就是群号。
- `message_seq`: Milky 的消息引用主键。
- `sender_id`: 发送者 QQ 号。
- `segments`: 原始消息段数组。
- `friend / group / group_member`: 场景相关附加实体。

### 4.3 Milky 接收消息段：`IncomingSegment`

| `type` | `data` 结构 | 说明 |
|---|---|---|
| `text` | `{ text: string }` | 文本 |
| `mention` | `{ user_id: integer, name: string }` | @某人 |
| `mention_all` | `{}` | @全体 |
| `face` | `{ face_id: string, is_large: boolean }` | 表情/超级表情 |
| `reply` | `{ message_seq: integer, sender_id: integer, sender_name?: string|null, time: integer, segments: IncomingSegment[] }` | 引用回复，内嵌被引用内容 |
| `image` | `{ resource_id: string, temp_url: string, width: integer, height: integer, summary: string, sub_type: "normal"\|"sticker" }` | 图片 |
| `record` | `{ resource_id: string, temp_url: string, duration: integer }` | 语音 |
| `video` | `{ resource_id: string, temp_url: string, width: integer, height: integer, duration: integer }` | 视频 |
| `file` | `{ file_id: string, file_name: string, file_size: integer, file_hash?: string|null }` | 文件 |
| `forward` | `{ forward_id: string, title: string, preview: string[], summary: string }` | 合并转发消息卡片 |
| `market_face` | `{ url: string, emoji_package_id: integer, emoji_id: string, key: string, summary: string }` | 市场表情 |
| `light_app` | `{ app_name: string, json_payload: string }` | 小程序/轻应用 |
| `xml` | `{ service_id: integer, xml_payload: string }` | XML 卡片 |

### 4.4 Milky 发送消息的请求格式

Milky 的消息发送是 HTTP API：

```http
POST /api/send_private_message
POST /api/send_group_message
Content-Type: application/json
Authorization: Bearer <access_token>
```

其中鉴权是否必须取决于服务端是否配置了 `access_token`。

#### 4.4.1 发送私聊

```json
{
  "user_id": 10001,
  "message": [
    { "type": "text", "data": { "text": "hello" } }
  ]
}
```

返回值：

```json
{
  "message_seq": 3001,
  "time": 1710000100
}
```

#### 4.4.2 发送群聊

```json
{
  "group_id": 123456,
  "message": [
    { "type": "text", "data": { "text": "hello group" } }
  ]
}
```

返回值：

```json
{
  "message_seq": 3002,
  "time": 1710000101
}
```

来源：

- [Api_send_private_message_input](https://api.luckylillia.com/schema-228985082.md)
- [Api_send_private_message_output](https://api.luckylillia.com/schema-228985083.md)
- [Api_send_group_message_input](https://api.luckylillia.com/schema-228985084.md)
- [Api_send_group_message_output](https://api.luckylillia.com/schema-228985085.md)

### 4.5 Milky 发送消息段：`OutgoingSegment`

Milky 官方 `OutgoingSegment` schema 列出的发送段类型如下：

| `type` | `data` 结构 | 说明 |
|---|---|---|
| `text` | `{ text: string }` | 文本 |
| `mention` | `{ user_id: integer }` | @某人 |
| `mention_all` | `{}` | @全体 |
| `face` | `{ face_id: string, is_large?: boolean }` | 表情 |
| `reply` | `{ message_seq: integer }` | 回复引用 |
| `image` | `{ uri: string, summary?: string|null, sub_type?: "normal"\|"sticker"|null }` | 图片，`uri` 支持 `file://` `http(s)://` `base64://` |
| `record` | `{ uri: string }` | 语音 |
| `video` | `{ uri: string, thumb_uri?: string|null }` | 视频 |
| `forward` | `{ messages: OutgoingForwardedMessage[], title?: string|null, preview?: string[]|null, summary?: string|null, prompt?: string|null }` | 合并转发 |
| `light_app` | `{ json_payload: string }` | 小程序 |

发送合并转发时，`OutgoingForwardedMessage` 结构是：

```json
{
  "user_id": 10001,
  "sender_name": "Alice",
  "segments": [
    { "type": "text", "data": { "text": "第一条" } }
  ]
}
```

完整的转发消息段示例：

```json
{
  "type": "forward",
  "data": {
    "title": "聊天记录",
    "preview": ["Alice: 第一条", "Bob: 第二条"],
    "summary": "2 条转发消息",
    "messages": [
      {
        "user_id": 10001,
        "sender_name": "Alice",
        "segments": [
          { "type": "text", "data": { "text": "第一条" } }
        ]
      },
      {
        "user_id": 10002,
        "sender_name": "Bob",
        "segments": [
          { "type": "text", "data": { "text": "第二条" } }
        ]
      }
    ]
  }
}
```



---

## 6. 推荐的通用段映射

如果你是按 `xunlu-core` 的 `UniversalMessageSegment` 写插件，最常见的映射关系如下：

| 通用段 | OneBotV11 | ICQQ | Milky |
|---|---|---|---|
| `text` | `text.data.text` | `text.text` | `text.data.text` |
| `at` | `at.data.qq` | `at.qq` | `mention.data.user_id` |
| `atAll` | `at.data.qq="all"` | `at.qq="all"` | `mention_all.data={}` |
| `face` | `face.data.id` | `face.id` | `face.data.face_id` |
| `reply` | `reply.data.id=message_id` | `reply.id` 或 `source: Quotable` | `reply.data.message_seq=message_seq` |
| `image` | `image.data.file` | `image.file` | `image.data.uri` |
| `record` | `record.data.file` | `record.file` | `record.data.uri` |
| `video` | `video.data.file` | `video.file` | `video.data.uri` |
| `file` | `file.data.file` | `file.file` | 官方更推荐独立文件 API；仓库内额外兼容 `file.data.uri` |
| `forward` | `node[]` / `forward.id` | `node[]` / `multimsg.resid` | `forward.messages[]` |

