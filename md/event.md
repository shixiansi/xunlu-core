# 事件（event）速查：插件如何过滤事件类型

在 `xunlu-core` 中，插件通常注册“消息命令”（`message` 事件）。当你需要监听更具体的事件时，可以在 `registerCommand` 的 `commandSpec` 中指定 `event` 过滤字符串。

核心规则（用于匹配）：

```
<post_type>.<kind_type>.<sub_type>
```

- `post_type`：`message | notice | request`
- `kind_type`：
  - 当 `post_type=message`：取 `message_type`（`group | private`）
  - 当 `post_type=notice`：取 `notice_type`
  - 当 `post_type=request`：取 `request_type`
- `sub_type`：子类型（例如 `normal` 等，取决于协议/适配器）

支持通配：`*`

---

## 示例

```js
// 仅群消息
botApi.registerCommand(["^hello$", "message.group.normal"], async ctx => {
  return await ctx.reply("world")
})

// 所有消息（群/私聊）
botApi.registerCommand(["^ping$", "message.*.*"], async ctx => {
  return await ctx.reply("pong")
})
```

> 绝大多数插件无需写 `event`，默认监听消息事件即可；更完整的 `ctx` 字段与通用 API 见 `md/api.md`。

