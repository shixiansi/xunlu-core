# xunlu 通用消息运行时格式

校对时间：2026-04-01

这份文档描述的是 `xunlu-core` 当前代码真正落地的“运行时通用消息格式”，不是一份面向未来的超大规格草案。

这次收敛后的目标很简单：

- 运行时只保留一套主字段，减少 `content/text`、`target/qq`、`msgId/id`、`url/fileId/path` 这种重复约定
- 三端转换都围绕同一套主字段实现
- 旧字段继续兼容，避免现有插件和工具链一次性断裂

## 1. 总体约定

`ctx.message`、`UniversalMessage.segments`、`coerceToUniversalMessage()` 的结果都遵循下面这套结构：

```json
[
  { "type": "text", "data": { "text": "hello" } },
  { "type": "at", "data": { "qq": "123456" } },
  { "type": "image", "data": { "file": "https://example.com/a.png", "id": "fid-1" } }
]
```

每个消息段都只有两层：

- `type`: 段类型
- `data`: 该类型的主字段

不再引入额外的 `extra/raw/meta` 运行时层；协议细节需要保留时，由适配器自己的原始段承担。

## 2. 运行时主字段

### 2.1 `text`

```json
{ "type": "text", "data": { "text": "hello" } }
```

主字段：

- `text: string`

### 2.2 `at`

```json
{ "type": "at", "data": { "qq": "123456", "name": "Alice" } }
```

主字段：

- `qq: string`
- `name?: string`

说明：

- 运行时继续沿用 `at` 作为类型名，避免影响现有插件
- `qq` 统一保存为字符串

### 2.3 `atAll`

```json
{ "type": "atAll", "data": {} }
```

### 2.4 `face`

```json
{ "type": "face", "data": { "id": 123 } }
```

主字段：

- `id: number`

### 2.5 `reply`

```json
{ "type": "reply", "data": { "id": "987654", "seq": 321 } }
```

主字段：

- `id?: string`
- `seq?: number`
- `text?: string`

说明：

- `id` 统一承载 `message_id`
- `seq` 统一承载 `message_seq`
- 至少要有一个

### 2.6 `image` / `record` / `video` / `file`

```json
{
  "type": "image",
  "data": {
    "file": "https://example.com/a.png",
    "id": "resource-id",
    "name": "a.png",
    "width": 640,
    "height": 480,
    "summary": "[图片]"
  }
}
```

主字段：

- `file: string`
- `id?: string`
- `name?: string`
- `size?: number`
- `width?: number`
- `height?: number`
- `duration?: number`
- `summary?: string`

说明：

- `file` 是统一的“主引用”，可以是：
  - `http(s)://...`
  - `file://...`
  - 本地绝对/相对路径
  - `base64://...`
  - 协议侧可直接发送的 opaque id
- `id` 是协议专属文件 ID 的保留位，例如 `resource_id / file_id / fid`
- 运行时发送优先使用 `file`，必要时再回退到 `id`

### 2.7 `forward`

```json
{
  "type": "forward",
  "data": {
    "id": "forward-id",
    "title": "聊天记录",
    "preview": ["Alice: hi", "Bob: hello"],
    "summary": "2 条转发消息"
  }
}
```

主字段：

- `id?: string`
- `title?: string`
- `preview?: string[]`
- `summary?: string`
- `prompt?: string`
- `messages?: any[]`

说明：

- 当前运行时只把 `forward` 当作“可识别的结构化段”
- 并不保证三端都能把它完整还原成原生合并转发

## 3. 兼容字段

为了不一次性打断历史代码，运行时构造出的 `data` 里仍会补一层兼容别名：

| 主字段 | 兼容别名 |
|---|---|
| `text` | `content` |
| `qq` | `target`, `user_id` |
| `id`（reply） | `msgId`, `message_id` |
| `seq`（reply） | `message_seq` |
| `file` | `url`, `path`, `uri`, `temp_url` 中的可推导值 |
| `id`（media） | `fileId` |

推荐规则：

- 新代码只读主字段
- 老代码可以继续读兼容字段
- 只要开始改某个模块，就顺手把它切到主字段

## 4. 三端入站映射

### 4.1 OneBotV11 -> 运行时

| OneBotV11 | 运行时 |
|---|---|
| `text` | `text` |
| `at(qq!=all)` | `at` |
| `at(qq=all)` | `atAll` |
| `face` / `mface` | `face` |
| `reply` | `reply` |
| `image` | `image` |
| `record` | `record` |
| `video` | `video` |
| `file` | `file` |
| `forward` | `forward` |
| 其他 | 降级为 `text(JSON.stringify(...))` |

### 4.2 Milky -> 运行时

| Milky | 运行时 |
|---|---|
| `text` | `text` |
| `mention` | `at` |
| `mention_all` | `atAll` |
| `face` | `face` |
| `reply` | `reply` |
| `image` | `image` |
| `record` | `record` |
| `video` | `video` |
| `file` | `file` |
| `forward` | `forward` |
| 其他 | 降级为 `text(JSON.stringify(...))` |

### 4.3 ICQQ -> 运行时

| ICQQ | 运行时 |
|---|---|
| `string` / `text` | `text` |
| `at(qq!=all)` | `at` |
| `at(qq=all)` | `atAll` |
| `face` / `sface` / `bface` | `face` |
| `reply` / `quote` / `source` | `reply` |
| `image` / `flash` | `image` |
| `record` | `record` |
| `video` / `bubble` | `video` |
| `file` | `file` |
| `multimsg` / `node` / `long_msg` | `forward` |
| 其他 | 降级为 `text(JSON.stringify(...))` |

## 5. 三端出站映射

### 5.1 运行时 -> OneBotV11

- `text.text -> data.text`
- `at.qq -> data.qq`
- `atAll -> at(all)`
- `face.id -> data.id`
- `reply.id/seq -> data.id`
- `image/record/video/file -> data.file`

### 5.2 运行时 -> Milky

- `text.text -> data.text`
- `at.qq -> mention.user_id`
- `atAll -> mention_all`
- `face.id -> face.face_id`
- `reply.seq -> reply.message_seq`
- `image/record/video/file -> data.uri`

说明：

- `Milky reply` 发送侧必须尽量提供 `seq`
- 只有 `id` 没有 `seq` 时，会尝试把 `id` 转成数字再发送

### 5.3 运行时 -> ICQQ

- `text.text -> text`
- `at.qq -> at`
- `atAll -> at(all)`
- `face.id -> face`
- `reply.id/seq -> reply.id`
- `image/record/video/file -> file`

## 6. 推荐写法

推荐始终通过这些入口构造消息：

```js
UniversalMessageSegment.text("hello")
UniversalMessageSegment.mention("123456")
UniversalMessageSegment.reply({ id: "987654", seq: 321 })
UniversalMessageSegment.image({ file: "https://example.com/a.png", id: "fid-1" })
```

如果手写 plain object，也优先写主字段：

```js
[
  { type: "text", data: { text: "hello" } },
  { type: "at", data: { qq: "123456" } },
  { type: "image", data: { file: "./temp/a.png" } }
]
```

不推荐再新增这类旧写法：

```js
{ type: "text", data: { content: "hello" } }
{ type: "at", data: { target: "123456" } }
{ type: "image", data: { url: "...", fileId: "...", path: "..." } }
```

虽然现在仍兼容，但它们已经不再是主格式。

## 7. 结论

现在的通用消息层可以把它理解成：

- 类型名继续保持现有运行时兼容：`text / at / atAll / face / reply / image / record / video / file / forward`
- 字段定义切到更小的主集：`text / qq / id / seq / file`
- 老字段只作为兼容层保留，不再作为规范继续扩张

这也是后续继续补 `json/xml/button/app` 等高阶段时的基础：先把运行时核心收紧，再决定是否真的需要扩规格。
