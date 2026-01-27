# 通用 Bot 方法完整文档

---

## 一、群聊模块

| 方法名称 | 功能概述 |
| :--- | :--- |
| `getGroupHistoryMsg` | 获取群聊历史消息记录 |
| `forwardMsg` | 制作并发送群聊消息转发 |
| `getGroupList` | 获取 Bot 已加入的群列表 |
| `getGroupInfo` | 获取指定群的详细信息 |
| `getGroupMemberList` | 获取群成员列表（支持分页） |
| `getGroupMemberInfo` | 获取群内指定成员的详细信息 |
| `sendGroupPoke` | 向群内成员发送“戳一戳” |

### 1. 获取历史消息记录 (getGroupHistoryMsg)

*   **核心说明**: 统一通过 Bot 关联数据库查询，确保不同协议端（如 OneBot 11、Milky）返回数据一致性，避免端侧数据差异。
*   **参数说明**:

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| `group_id` | number | ✅ | - | 指定要查询的群号 |
| `start_time` | number | ❌ | 近7天 | 起始时间戳（毫秒级） |
| `end_time` | number | ❌ | - | 结束时间戳（毫秒级），需晚于起始时间 |
| `page` | number | ❌ | 1 | 分页页码 |
| `page_size` | number | ❌ | 20 | 每页消息数，最大 50 |

*   **返回值说明**:

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "total": 120,
    "list": [
      {
        "msg_id": "xxx",
        "sender_id": 123456,
        "sender_name": "昵称",
        "sender_card": "群名片",
        "content": "消息内容",
        "msg_type": "text",
        "send_time": 1672531200000
      }
    ]
  }
}
```

*   **注意事项**:
    *   需 Bot 具备群聊消息存储权限，历史消息保留周期以数据库配置为准（默认 90 天）。
    *   超出分页限制将自动截断。

---

### 2. 制作消息转发 (forwardMsg)

*   **核心说明**: 支持将单条/多条群聊消息转发至目标群，保留原消息发送者信息与格式，适配主流协议的转发规则。
*   **参数说明**:

| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `target_group_id` | number | ✅ | 接收转发的目标群号 |
| `source_msg_list` | array | ✅ | 待转发消息列表，支持两种格式：<br>1. 消息ID数组: `["msg_id1", "msg_id2"]`<br>2. 完整消息对象(同 `getGroupHistoryMsg` 的 `list` 项) |
| `forward_title` | string | ❌ | 转发合并卡片标题，默认 "群聊消息转发" |

*   **返回值说明**:

```json
{
  "code": 0,
  "msg": "转发成功",
  "data": {
    "forward_id": "xxx",
    "target_group_id": 789012,
    "send_time": 1672531200000
  }
}
```

*   **注意事项**:
    *   待转发消息需为有效群聊消息（未撤回、未过期）。
    *   部分协议对单条转发消息数有限制（最大 50 条/次）。
    *   转发内容不含敏感信息审核，需自行过滤。

---

### 3. 获取群列表 (getGroupList)

*   **核心说明**: 获取 Bot 已加入的所有群聊基础信息，支持筛选是否返回详细字段。
*   **参数说明**:

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| `need_detail` | boolean | ❌ | false | 是否返回群详情，false 则仅返回核心字段 |

*   **返回值说明**:

```json
{
  "code": 0,
  "msg": "success",
  "data": [
    {
      "group_id": 789012,
      "group_name": "测试群",
      "member_count": 50,
      "owner_id": 123456,
      "create_time": 1672531200000,
      "notice": "群公告内容"
    }
  ]
}
```

*   **注意事项**:
    *   仅返回 Bot 当前已加入的群聊，未加入或已退出的群不会显示。
    *   获取详情可能增加响应耗时，非必要不开启。

---

### 4. 获取群信息 (getGroupInfo)

*   **核心说明**: 查询指定群的完整信息，包含群主、公告、成员数等关键字段，支持实时同步群最新状态。
*   **参数说明**:

| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `group_id` | number | ✅ | 目标群号 |

*   **返回值说明**:

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "group_id": 789012,
    "group_name": "测试群",
    "owner_id": 123456,
    "member_count": 50,
    "max_member_count": 200,
    "create_time": 1672531200000,
    "notice": "群公告内容",
    "is_all_mute": false,
    "group_avatar": "https://xxx.png/"
  }
}
```

*   **注意事项**:
    *   Bot 需已加入该群，否则返回 “无权限”。
    *   群公告若为空则返回空字符串。
    *   群头像 URL 有效期以协议端返回为准。

---

### 5. 获取群成员列表 (getGroupMemberList)

*   **核心说明**: 获取指定群的所有成员基础信息，支持分页查询，适配大群（千人群以上）场景。
*   **参数说明**:

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| `group_id` | number | ✅ | - | 目标群号 |
| `page` | number | ❌ | 1 | 分页页码 |
| `page_size` | number | ❌ | 50 | 每页成员数，最大 100 |

*   **返回值说明**:

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "total": 150,
    "list": [
      {
        "user_id": 123456,
        "nickname": "昵称",
        "group_card": "群名片",
        "role": "owner",
        "join_time": 1672531200000
      }
    ]
  }
}
```

*   **注意事项**:
    *   大群分页查询时需按页码逐步获取，避免单次请求超时。
    *   成员权限以群内实际设置为准，实时同步。

---

### 6. 获取群成员信息 (getGroupMemberInfo)

*   **核心说明**: 查询指定群内单个成员的详细信息，包含权限、加入时间、群名片等字段，精度高于列表查询。
*   **参数说明**:

| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `group_id` | number | ✅ | 目标群号 |
| `user_id` | number | ✅ | 成员 QQ 号 |

*   **返回值说明**:

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "user_id": 123456,
    "nickname": "昵称",
    "group_card": "群名片",
    "role": "admin",
    "join_time": 1672531200000,
    "last_send_time": 1673000000000,
    "avatar": "https://xxx.png/",
    "is_mute": false
  }
}
```

*   **注意事项**:
    *   Bot 需已加入该群，且成员需在群内（未退出），否则返回 “成员不存在”。
    *   最后发言时间若未发言则返回 0。

---

### 7. 群戳一戳 (sendGroupPoke)

*   **核心说明**: 向指定群内成员发送 “戳一戳” 互动通知（对应 QQ 双击头像效果），无消息内容，仅触发互动提示。
*   **参数说明**:

| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `group_id` | number | ✅ | 目标群号 |
| `user_id` | array | ✅ | 被戳成员 QQ 号数组，最多 5 人/次 |

*   **返回值说明**:

```json
{
  "code": 0,
  "msg": "戳一戳发送成功",
  "data": {
    "group_id": 789012,
    "success_ids": [123456],
    "fail_ids": []
  }
}
```

*   **注意事项**:
    *   存在频率限制（同一群内 1 分钟最多发送 3 次），避免骚扰。
    *   批量发送时部分成员失败不影响其他成员。
    *   需 Bot 与被戳成员均在群内。

---

## 二、私聊模块

| 方法名称 | 功能概述 |
| :--- | :--- |
| `sendPrivateMsg` | 向指定好友发送私聊消息 |
| `getPrivateHistoryMsg` | 查询 Bot 与指定好友的私聊历史消息 |
| `getFriendList` | 获取 Bot 的所有好友信息 |
| `getFriendInfo` | 查询指定好友的详细信息 |
| `sendPrivatePoke` | 向指定好友发送“戳一戳” |
| `setFriendRemark` | 为指定好友设置或修改自定义备注 |
| `deleteFriend` | 将指定好友从 Bot 的好友列表中删除 |
| `handleFriendRequest` | 处理收到的好友申请（同意/拒绝） |

### 1. 发送私聊消息 (sendPrivateMsg)

*   **核心说明**: 向指定好友发送私聊消息，支持文本、图片、音视频等多种格式，适配主流协议的消息段规范。
*   **参数说明**:

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| `user_id` | number | ✅ | - | 接收方 QQ 号 |
| `msg_type` | string | ✅ | text | 消息类型 (`text`, `image`, `voice`, `video`, `music`, `file`) |
| `msg_content` | string/object | ✅ | - | 消息内容，格式随类型变化：<br>- text: 字符串<br>- media/file: 文件URL或本地路径<br>- music: JSON对象 `{"type":"qq/netease/custom","url":"音乐链接","title":"标题"}` |
| `reply_msg_id` | string | ❌ | - | 要回复的消息 ID |

*   **返回值说明**:

```json
{
  "code": 0,
  "msg": "发送成功",
  "data": {
    "msg_id": "xxx",
    "user_id": 123456,
    "send_time": 1672531200000
  }
}
```

*   **注意事项**:
    *   存在发送频率限制（单个好友 1 分钟最多 10 条），避免刷屏。
    *   视频/文件大小限制 ≤ 100M。
    *   音乐卡片需符合协议格式，自定义音乐需提供有效链接。

---

### 2. 获取私聊历史消息 (getPrivateHistoryMsg)

*   **核心说明**: 查询 Bot 与指定好友的私聊历史消息，统一从数据库获取，确保不同端数据一致。
*   **参数说明**:

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| `user_id` | number | ✅ | - | 好友 QQ 号 |
| `start_time` | number | ❌ | 近7天 | 起始时间戳（毫秒级） |
| `end_time` | number | ❌ | - | 结束时间戳（毫秒级），需晚于起始时间 |
| `page` | number | ❌ | 1 | 分页页码 |
| `page_size` | number | ❌ | 20 | 每页条数，最大 50 |

*   **返回值说明**:

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "total": 80,
    "list": [
      {
        "msg_id": "xxx",
        "sender_id": 789012,
        "content": "消息内容",
        "msg_type": "image",
        "send_time": 1672531200000,
        "is_self": true
      }
    ]
  }
}
```

*   **注意事项**:
    *   仅查询 Bot 与该好友的私聊记录，未添加好友或已删除好友无法获取。
    *   历史消息保留周期默认 90 天，需提前配置数据库存储规则。

---

### 3. 获取好友列表 (getFriendList)

*   **核心说明**: 获取 Bot 的所有好友信息，支持按分组筛选，返回核心字段或详细信息。
*   **参数说明**:

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| `group_id` | number | ❌ | - | 好友分组 ID（筛选指定分组好友） |
| `need_detail` | boolean | ❌ | false | 是否返回详情 |

*   **返回值说明**:

```json
{
  "code": 0,
  "msg": "success",
  "data": [
    {
      "user_id": 123456,
      "nickname": "好友昵称",
      "remark": "自定义备注",
      "group_name": "家人",
      "add_time": 1672531200000,
      "avatar": "https://xxx.png/",
      "sex": "male",
      "signature": "个性签名"
    }
  ]
}
```

*   **注意事项**:
    *   仅返回已通过验证的好友，待验证/已删除好友不显示。
    *   筛选分组时需传入正确分组 ID（可通过 `getFriendGroupList` 获取）。

---

### 4. 获取好友信息 (getFriendInfo)

*   **核心说明**: 查询指定好友的详细信息，包含备注、分组、头像等字段，实时同步好友最新状态。
*   **参数说明**:

| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `user_id` | number | ✅ | 好友 QQ 号 |

*   **返回值说明**:

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "user_id": 123456,
    "nickname": "好友昵称",
    "remark": "自定义备注",
    "group_name": "同事",
    "add_time": 1672531200000,
    "avatar": "https://xxx.png/",
    "sex": "female",
    "signature": "个性签名",
    "is_online": true
  }
}
```

*   **注意事项**:
    *   需 Bot 与该用户为好友关系，否则返回 “非好友”。
    *   在线状态依赖协议返回，部分场景可能无法实时更新。

---

### 5. 私聊戳一戳 (sendPrivatePoke)

*   **核心说明**: 向指定好友发送 “戳一戳” 互动通知（对应 QQ 双击头像效果），无消息内容，仅触发互动提示。
*   **参数说明**:

| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `user_id` | number | ✅ | 好友 QQ 号（仅支持单个） |

*   **返回值说明**:

```json
{
  "code": 0,
  "msg": "戳一戳发送成功",
  "data": {
    "user_id": 123456,
    "send_time": 1672531200000
  }
}
```

*   **注意事项**:
    *   频率限制（单个好友 1 分钟最多 5 次），避免骚扰。
    *   需好友未拉黑 Bot，否则返回 “发送失败”。

---

### 6. 设置好友备注 (setFriendRemark)

*   **核心说明**: 为指定好友设置或修改自定义备注，备注会同步到 Bot 的好友列表中。
*   **参数说明**:

| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `user_id` | number | ✅ | 好友 QQ 号 |
| `remark` | string | ✅ | 备注内容，长度 ≤ 30 字符 |

*   **返回值说明**:

```json
{
  "code": 0,
  "msg": "备注设置成功",
  "data": {
    "user_id": 123456,
    "old_remark": "旧备注",
    "new_remark": "新备注"
  }
}
```

*   **注意事项**:
    *   备注不可包含敏感词。
    *   设置成功后，通过 `getFriendList`/`getFriendInfo` 可查询到新备注。
    *   部分协议需同步时间（≤ 1 分钟）。

---

### 7. 删除好友 (deleteFriend)

*   **核心说明**: 将指定好友从 Bot 的好友列表中删除，删除后无法接收该用户私聊消息，需重新添加。
*   **参数说明**:

| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `user_id` | number | ✅ | 好友 QQ 号 |

*   **返回值说明**:

```json
{
  "code": 0,
  "msg": "删除好友成功",
  "data": {
    "user_id": 123456,
    "delete_time": 1672531200000
  }
}
```

*   **注意事项**:
    *   操作不可逆，删除前需确认。
    *   删除后 Bot 将无法主动给该用户发消息，除非对方重新添加 Bot 为好友。

---

### 8. 处理好友请求 (handleFriendRequest)

*   **核心说明**: 处理收到的好友申请（同意/拒绝），支持批量处理，需先通过 `getFriendRequestList` 获取请求 ID。
*   **参数说明**:

| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `request_id` | string/array | ✅ | 好友请求 ID，支持单个或数组 |
| `action` | string | ✅ | 处理动作 (`agree`: 同意 / `reject`: 拒绝) |
| `reject_reason` | string | ❌ | 拒绝理由，仅 `action=reject` 时有效，长度 ≤ 50 字符 |

*   **返回值说明**:

```json
{
  "code": 0,
  "msg": "处理成功",
  "data": {
    "success_ids": ["req123"],
    "fail_ids": [],
    "action": "agree"
  }
}
```

*   **注意事项**:
    *   好友请求有效期通常为 72 小时，过期后无法处理。
    *   批量处理最多 10 个请求/次。
    *   同意后自动添加为好友，可立即发送私聊消息。

---
