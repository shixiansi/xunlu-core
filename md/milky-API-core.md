# Milky — 完整 API 参考文档

> **项目**: LLOneBot (Milky Protocol Implementation)
> **Source**: LLOneBot OpenAPI Spec
> **Protocol Version**: Milky 1.0
> **Transport**: HTTP POST (JSON body), response `{ status, retcode, data, message }`

---

## 1. 目录

- [2. 系统 API](#2-系统-api)
- [3. 消息 API](#3-消息-api)
- [4. 好友 API](#4-好友-api)
- [5. 群聊 API](#5-群聊-api)
- [6. 文件 API](#6-文件-api)
- [7. 消息段类型](#7-消息段类型)
- [8. 事件类型](#8-事件类型)
- [9. 数据实体](#9-数据实体)

---

## 2. 系统 API

### POST /api/get_login_info

获取当前登录账号信息。

**请求参数**: 无

**响应 data**:
| 字段 | 类型 | 说明 |
|------|------|------|
| uin | int | 登录 QQ 号 |
| nickname | string | 登录昵称 |

### POST /api/get_impl_info

获取协议端实现信息。

**请求参数**: 无

**响应 data**:
| 字段 | 类型 | 说明 |
|------|------|------|
| impl_name | string | 协议端名称 |
| impl_version | string | 协议端版本 |
| qq_protocol_version | string | QQ 协议版本 |
| qq_protocol_type | string | 协议平台 (windows/linux/macos/android_pad/android_phone/ipad/iphone/harmony/watch) |
| milky_version | string | Milky 版本 (当前 "1.0") |

### POST /api/get_user_profile

获取指定用户的个人信息。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| user_id | int | 是 | 用户 QQ 号 |

**响应 data**:
| 字段 | 类型 | 说明 |
|------|------|------|
| nickname | string | 昵称 |
| qid | string | QID |
| age | int | 年龄 |
| sex | string | 性别 (male/female/unknown) |
| remark | string | 备注 |
| bio | string | 个性签名 |
| level | int | QQ 等级 |
| country | string | 国家/地区 |
| city | string | 城市 |
| school | string | 学校 |

### POST /api/get_friend_list

获取好友列表。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| no_cache | bool | 否 | 是否强制不使用缓存 |

**响应 data**: `{ friends: [FriendEntity] }`

### POST /api/get_friend_info

获取指定好友信息。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| user_id | int | 是 | 好友 QQ 号 |
| no_cache | bool | 否 | 是否强制不使用缓存 |

**响应 data**: `{ friend: FriendEntity }`

### POST /api/get_group_list

获取群列表。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| no_cache | bool | 否 | 是否强制不使用缓存 |

**响应 data**: `{ groups: [GroupEntity] }`

### POST /api/get_group_info

获取指定群信息。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| no_cache | bool | 否 | 是否强制不使用缓存 |

**响应 data**: `{ group: GroupEntity }`

### POST /api/get_group_member_list

获取群成员列表。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| no_cache | bool | 否 | 是否强制不使用缓存 |

**响应 data**: `{ members: [GroupMemberEntity] }`

### POST /api/get_group_member_info

获取指定群成员信息。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| user_id | int | 是 | 群成员 QQ 号 |
| no_cache | bool | 否 | 是否强制不使用缓存 |

**响应 data**: `{ member: GroupMemberEntity }`

### POST /api/get_peer_pins

获取置顶的好友和群列表。

**请求参数**: 无

**响应 data**:
| 字段 | 类型 | 说明 |
|------|------|------|
| friends | [FriendEntity] | 置顶的好友列表 |
| groups | [GroupEntity] | 置顶的群列表 |

### POST /api/set_peer_pin

设置好友或群的置顶状态。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| message_scene | string | 是 | 会话场景 (friend/group/temp) |
| peer_id | int | 是 | 好友 QQ 号或群号 |
| is_pinned | bool | 否 | 是否置顶，false 为取消 |

### POST /api/set_avatar

设置 QQ 账号头像。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| uri | string | 是 | 头像文件 URI (file:///http(s):///base64://) |

### POST /api/set_nickname

设置 QQ 账号昵称。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| new_nickname | string | 是 | 新昵称 |

### POST /api/set_bio

设置 QQ 账号个性签名。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| new_bio | string | 是 | 新个性签名 |

### POST /api/get_custom_face_url_list

获取自定义表情 URL 列表。

**请求参数**: 无

**响应 data**: `{ urls: [string] }`

### POST /api/get_cookies

获取指定域名的 Cookies。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| domain | string | 是 | 域名 |

**响应 data**: `{ cookies: string }`

### POST /api/get_csrf_token

获取 CSRF Token (bkn/g_tk)。

**请求参数**: 无

**响应 data**: `{ csrf_token: string }`

---

## 3. 消息 API

### POST /api/send_private_message

发送私聊消息。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| user_id | int | 是 | 好友 QQ 号 |
| message | [OutgoingSegment] | 是 | 消息段数组 |

**响应 data**:
| 字段 | 类型 | 说明 |
|------|------|------|
| message_seq | int | 消息序列号 |
| time | int | 消息发送时间 (Unix 秒) |

### POST /api/send_group_message

发送群聊消息。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| message | [OutgoingSegment] | 是 | 消息段数组 |

**响应 data**:
| 字段 | 类型 | 说明 |
|------|------|------|
| message_seq | int | 消息序列号 |
| time | int | 消息发送时间 (Unix 秒) |

### POST /api/recall_private_message

撤回私聊消息。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| user_id | int | 是 | 好友 QQ 号 |
| message_seq | int | 是 | 消息序列号 |

### POST /api/recall_group_message

撤回群聊消息。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| message_seq | int | 是 | 消息序列号 |

### POST /api/get_message

获取消息内容。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| message_scene | string | 是 | 消息场景 (friend/group/temp) |
| peer_id | int | 是 | 好友 QQ 号或群号 |
| message_seq | int | 是 | 消息序列号 |

**响应 data**: `{ message: IncomingMessage }`

### POST /api/get_history_messages

获取历史消息列表。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| message_scene | string | 是 | 消息场景 (friend/group/temp) |
| peer_id | int | 是 | 好友 QQ 号或群号 |
| start_message_seq | int | 否 | 起始消息序列号，从新到旧查询 |
| limit | int | 否 | 消息数量，最多 30 条 |

**响应 data**:
| 字段 | 类型 | 说明 |
|------|------|------|
| messages | [IncomingMessage] | 消息列表 (message_seq 升序) |
| next_message_seq | int | 下一页起始序列号 |

### POST /api/get_resource_temp_url

获取临时资源链接（图片/语音/视频）。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| resource_id | string | 是 | 资源 ID |

**响应 data**: `{ url: string }`

### POST /api/get_forwarded_messages

获取合并转发消息内容。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| forward_id | string | 是 | 转发消息 ID |

**响应 data**: `{ messages: [IncomingForwardedMessage] }`

### POST /api/mark_message_as_read

标记消息为已读。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| message_scene | string | 是 | 消息场景 (friend/group/temp) |
| peer_id | int | 是 | 好友 QQ 号或群号 |
| message_seq | int | 是 | 该消息及更早消息标记为已读 |

---

## 4. 好友 API

### POST /api/send_friend_nudge

发送好友戳一戳。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| user_id | int | 是 | 好友 QQ 号 |
| is_self | bool | 否 | 是否戳自己 |

### POST /api/send_profile_like

发送名片点赞。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| user_id | int | 是 | 好友 QQ 号 |
| count | int | 否 | 点赞数量 |

### POST /api/delete_friend

删除好友。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| user_id | int | 是 | 好友 QQ 号 |

### POST /api/get_friend_requests

获取好友请求列表。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| limit | int | 否 | 最大请求数量 |
| is_filtered | bool | 否 | true=只取被过滤的请求，false=只取未被过滤的 |

**响应 data**: `{ requests: [FriendRequestEntity] }`

### POST /api/accept_friend_request

同意好友请求。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| initiator_uid | string | 是 | 请求发起者 UID |
| is_filtered | bool | 否 | 是否是被过滤的请求 |

### POST /api/reject_friend_request

拒绝好友请求。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| initiator_uid | string | 是 | 请求发起者 UID |
| is_filtered | bool | 否 | 是否是被过滤的请求 |
| reason | string | 否 | 拒绝理由 |

---

## 5. 群聊 API

### POST /api/set_group_name

设置群名称。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| new_group_name | string | 是 | 新群名称 |

### POST /api/set_group_avatar

设置群头像。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| image_uri | string | 是 | 头像文件 URI (file:///http(s):///base64://) |

### POST /api/set_group_member_card

设置群名片。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| user_id | int | 是 | 成员 QQ 号 |
| card | string | 是 | 新群名片 |

### POST /api/set_group_member_special_title

设置群成员专属头衔。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| user_id | int | 是 | 成员 QQ 号 |
| special_title | string | 是 | 新专属头衔 |

### POST /api/set_group_member_admin

设置群管理员。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| user_id | int | 是 | 成员 QQ 号 |
| is_set | bool | 否 | 是否设置为管理员，false 为取消 |

### POST /api/set_group_member_mute

设置群成员禁言。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| user_id | int | 是 | 成员 QQ 号 |
| duration | int | 否 | 禁言时长（秒），0 为取消禁言 |

### POST /api/set_group_whole_mute

设置群全员禁言。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| is_mute | bool | 否 | 是否开启全员禁言，false 为取消 |

### POST /api/kick_group_member

踢出群成员。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| user_id | int | 是 | 被踢的 QQ 号 |
| reject_add_request | bool | 否 | 是否拒绝加群申请 |

### POST /api/get_group_announcements

获取群公告列表。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |

**响应 data**: `{ announcements: [AnnouncementEntity] }`

### POST /api/send_group_announcement

发送群公告。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| content | string | 是 | 公告内容 |
| image_uri | string | 否 | 公告附带图片 URI |

### POST /api/delete_group_announcement

删除群公告。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| announcement_id | string | 是 | 公告 ID |

### POST /api/get_group_essence_messages

获取群精华消息列表。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| page_index | int | 是 | 页码索引（从 0 开始） |
| page_size | int | 是 | 每页数量 |

**响应 data**:
| 字段 | 类型 | 说明 |
|------|------|------|
| messages | [GroupEssenceMessage] | 精华消息列表 |
| is_end | bool | 是否最后一页 |

### POST /api/set_group_essence_message

设置/取消群精华消息。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| message_seq | int | 是 | 消息序列号 |
| is_set | bool | 否 | 是否设置为精华，false 为取消 |

### POST /api/quit_group

退出群。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |

### POST /api/send_group_message_reaction

发送群消息表情回应。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| message_seq | int | 是 | 要回应的消息序列号 |
| reaction | string | 是 | 表情 ID |
| reaction_type | string | 否 | 回应类型 (face/emoji) |
| is_add | bool | 否 | 是否添加表情，false 为取消 |

### POST /api/send_group_nudge

发送群戳一戳。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| user_id | int | 是 | 被戳的成员 QQ 号 |

### POST /api/get_group_notifications

获取群通知列表（入群/邀请请求等）。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| start_notification_seq | int | 否 | 起始通知序列号 |
| is_filtered | bool | 否 | 是否只取被过滤的通知 |
| limit | int | 否 | 最大通知数量 |

**响应 data**:
| 字段 | 类型 | 说明 |
|------|------|------|
| notifications | [GroupNotification] | 通知列表 (降序) |
| next_notification_seq | int | 下一页起始序列号 |

### POST /api/accept_group_request

同意入群/邀请他人入群请求。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| notification_seq | int | 是 | 通知序列号 |
| notification_type | string | 是 | 通知类型 (join_request/invited_join_request) |
| group_id | int | 是 | 群号 |
| is_filtered | bool | 否 | 是否是被过滤的请求 |

### POST /api/reject_group_request

拒绝入群/邀请他人入群请求。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| notification_seq | int | 是 | 通知序列号 |
| notification_type | string | 是 | 通知类型 (join_request/invited_join_request) |
| group_id | int | 是 | 群号 |
| is_filtered | bool | 否 | 是否是被过滤的请求 |
| reason | string | 否 | 拒绝理由 |

### POST /api/accept_group_invitation

同意他人邀请自身入群。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| invitation_seq | int | 是 | 邀请序列号 |

### POST /api/reject_group_invitation

拒绝他人邀请自身入群。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| invitation_seq | int | 是 | 邀请序列号 |

---

## 6. 文件 API

### POST /api/upload_private_file

上传私聊文件。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| user_id | int | 是 | 好友 QQ 号 |
| file_uri | string | 是 | 文件 URI (file:///http(s):///base64://) |
| file_name | string | 是 | 文件名称 |

**响应 data**: `{ file_id: string }`

### POST /api/upload_group_file

上传群文件。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| parent_folder_id | string | 否 | 目标文件夹 ID，默认为根目录 "/" |
| file_uri | string | 是 | 文件 URI (file:///http(s):///base64://) |
| file_name | string | 是 | 文件名称 |

**响应 data**: `{ file_id: string }`

### POST /api/get_private_file_download_url

获取私聊文件下载链接。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| user_id | int | 是 | 好友 QQ 号 |
| file_id | string | 是 | 文件 ID |
| file_hash | string | 是 | 文件的 TriSHA1 哈希值 |

**响应 data**: `{ download_url: string }`

### POST /api/get_group_file_download_url

获取群文件下载链接。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| file_id | string | 是 | 文件 ID |

**响应 data**: `{ download_url: string }`

### POST /api/get_group_files

获取群文件列表。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| parent_folder_id | string | 否 | 父文件夹 ID，默认为根目录 "/" |

**响应 data**:
| 字段 | 类型 | 说明 |
|------|------|------|
| files | [GroupFileEntity] | 文件列表 |
| folders | [GroupFolderEntity] | 文件夹列表 |

### POST /api/move_group_file

移动群文件。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| file_id | string | 是 | 文件 ID |
| parent_folder_id | string | 否 | 文件当前所在文件夹 ID |
| target_folder_id | string | 否 | 目标文件夹 ID |

### POST /api/rename_group_file

重命名群文件。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| file_id | string | 是 | 文件 ID |
| parent_folder_id | string | 否 | 文件所在文件夹 ID |
| new_file_name | string | 是 | 新文件名称 |

### POST /api/delete_group_file

删除群文件。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| file_id | string | 是 | 文件 ID |

### POST /api/create_group_folder

创建群文件夹。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| folder_name | string | 是 | 文件夹名称 |

**响应 data**: `{ folder_id: string }`

### POST /api/rename_group_folder

重命名群文件夹。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| folder_id | string | 是 | 文件夹 ID |
| new_folder_name | string | 是 | 新文件夹名 |

### POST /api/delete_group_folder

删除群文件夹。

**请求参数**:
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| folder_id | string | 是 | 文件夹 ID |

---

## 7. 消息段类型

### 7.1 接收消息段 (IncomingSegment)

| 类型 | 字段 | 说明 |
|------|------|------|
| **text** | text: string | 文本内容 |
| **mention** | user_id: int, name: string | 提及的 QQ 号和名称 |
| **mention_all** | — | 提及全体 |
| **face** | face_id: string, is_large: bool | 表情 ID，是否为超级表情 |
| **reply** | message_seq: int, sender_id: int, sender_name: string|null, time: int, segments: [IncomingSegment] | 引用回复 |
| **image** | resource_id: string, temp_url: string, width: int, height: int, summary: string, sub_type: string (normal/sticker) | 图片 |
| **record** | resource_id: string, temp_url: string, duration: int | 语音，时长（秒） |
| **video** | resource_id: string, temp_url: string, width: int, height: int, duration: int | 视频 |
| **file** | file_id: string, file_name: string, file_size: int, file_hash: string|null | 文件 |
| **forward** | forward_id: string, title: string, preview: [string], summary: string | 合并转发 |
| **market_face** | emoji_package_id: int, emoji_id: string, key: string, summary: string, url: string | 市场表情 |
| **light_app** | app_name: string, json_payload: string | 小程序 |
| **xml** | service_id: int, xml_payload: string | XML 卡片 |

### 7.2 发送消息段 (OutgoingSegment)

| 类型 | 字段 | 说明 |
|------|------|------|
| **text** | text: string | 文本内容 |
| **mention** | user_id: int | 提及的 QQ 号 |
| **mention_all** | — | 提及全体 |
| **face** | face_id: string, is_large: bool|null | 表情 ID |
| **reply** | message_seq: int | 引用回复（仅需消息序列号） |
| **image** | uri: string, sub_type: string|null, summary: string|null | 图片 URI (file:///http(s):///base64://) |
| **record** | uri: string | 语音 URI |
| **video** | uri: string, thumb_uri: string|null | 视频 URI + 封面 URI |
| **forward** | messages: [OutgoingForwardedMessage], title: string|null, preview: [string]|null, summary: string|null, prompt: string|null | 合并转发 |
| **light_app** | json_payload: string | 小程序 JSON 数据 |

---

## 8. 事件类型

### 事件通用结构

```json
{ "event_type": "string", "time": int, "self_id": int, "data": {} }
```

| 字段 | 类型 | 说明 |
|------|------|------|
| event_type | string | 事件类型 |
| time | int | Unix 时间戳（秒） |
| self_id | int | 机器人 QQ 号 |
| data | object | 事件具体数据 |

### 事件类型列表

#### bot_offline
机器人离线事件。
| 字段 | 类型 | 说明 |
|------|------|------|
| reason | string | 下线原因 |

#### message_receive
消息接收事件。data 为 [IncomingMessage](#incomingmessage) 对象。
| 子类型 | 说明 |
|--------|------|
| message_scene=friend | 好友消息，含 friend 字段 |
| message_scene=group | 群消息，含 group + group_member 字段 |
| message_scene=temp | 临时会话消息，含 group 字段 |

#### message_recall
消息撤回事件。
| 字段 | 类型 | 说明 |
|------|------|------|
| message_scene | string | 消息场景 (friend/group/temp) |
| peer_id | int | 好友 QQ 号或群号 |
| message_seq | int | 被撤回消息序列号 |
| sender_id | int | 被撤回消息的发送者 |
| operator_id | int | 操作者 QQ 号 |
| display_suffix | string | 撤回提示后缀文本 |

#### peer_pin_change
会话置顶变更事件。
| 字段 | 类型 | 说明 |
|------|------|------|
| message_scene | string | 会话场景 |
| peer_id | int | 好友 QQ 号或群号 |
| is_pinned | bool | 是否被置顶 |

#### friend_request
好友请求事件。
| 字段 | 类型 | 说明 |
|------|------|------|
| initiator_id | int | 申请者 QQ 号 |
| initiator_uid | string | 用户 UID |
| comment | string | 附加信息 |
| via | string | 申请来源 |

#### group_join_request
入群请求事件。
| 字段 | 类型 | 说明 |
|------|------|------|
| group_id | int | 群号 |
| notification_seq | int | 通知序列号 |
| is_filtered | bool | 是否被过滤（风险账户） |
| initiator_id | int | 申请者 QQ 号 |
| comment | string | 附加信息 |

#### group_invited_join_request
群成员邀请他人入群请求事件。
| 字段 | 类型 | 说明 |
|------|------|------|
| group_id | int | 群号 |
| notification_seq | int | 通知序列号 |
| initiator_id | int | 邀请者 QQ 号 |
| target_user_id | int | 被邀请者 QQ 号 |

#### group_invitation
他人邀请自身入群事件。
| 字段 | 类型 | 说明 |
|------|------|------|
| group_id | int | 群号 |
| invitation_seq | int | 邀请序列号 |
| initiator_id | int | 邀请者 QQ 号 |
| source_group_id | int|null | 来源群号 |

#### friend_nudge
好友戳一戳事件。
| 字段 | 类型 | 说明 |
|------|------|------|
| user_id | int | 好友 QQ 号 |
| is_self_send | bool | 自己发出的戳一戳 |
| is_self_receive | bool | 自己接收的戳一戳 |
| display_action | string | 动作文本 |
| display_suffix | string | 后缀文本 |
| display_action_img_url | string | 动作图片 URL |

#### friend_file_upload
好友文件上传事件。
| 字段 | 类型 | 说明 |
|------|------|------|
| user_id | int | 好友 QQ 号 |
| file_id | string | 文件 ID |
| file_name | string | 文件名称 |
| file_size | int | 文件大小（字节） |
| file_hash | string | TriSHA1 哈希值 |
| is_self | bool | 是否自己发送 |

#### group_admin_change
群管理员变更事件。
| 字段 | 类型 | 说明 |
|------|------|------|
| group_id | int | 群号 |
| user_id | int | 发生变更的用户 |
| operator_id | int | 操作者 |
| is_set | bool | 是否被设置为管理员 |

#### group_essence_message_change
群精华消息变更事件。
| 字段 | 类型 | 说明 |
|------|------|------|
| group_id | int | 群号 |
| message_seq | int | 消息序列号 |
| operator_id | int | 操作者 |
| is_set | bool | 是否设置为精华 |

#### group_member_increase
群成员增加事件。
| 字段 | 类型 | 说明 |
|------|------|------|
| group_id | int | 群号 |
| user_id | int | 新成员 |
| operator_id | int|null | 管理员（同意入群） |
| invitor_id | int|null | 邀请者（邀请入群） |

#### group_member_decrease
群成员减少事件。
| 字段 | 类型 | 说明 |
|------|------|------|
| group_id | int | 群号 |
| user_id | int | 退出的成员 |
| operator_id | int|null | 管理员（踢出） |

#### group_name_change
群名称变更事件。
| 字段 | 类型 | 说明 |
|------|------|------|
| group_id | int | 群号 |
| new_group_name | string | 新名称 |
| operator_id | int | 操作者 |

#### group_message_reaction
群消息表情回应事件。
| 字段 | 类型 | 说明 |
|------|------|------|
| group_id | int | 群号 |
| user_id | int | 发送回应者 |
| message_seq | int | 消息序列号 |
| face_id | string | 表情 ID |
| reaction_type | string | 回应类型 (face/emoji) |
| is_add | bool | 是否为添加，false 为取消 |

#### group_mute
群禁言事件。
| 字段 | 类型 | 说明 |
|------|------|------|
| group_id | int | 群号 |
| user_id | int | 被禁言用户 |
| operator_id | int | 操作者 |
| duration | int | 禁言时长（秒），0 为取消禁言 |

#### group_whole_mute
群全体禁言事件。
| 字段 | 类型 | 说明 |
|------|------|------|
| group_id | int | 群号 |
| operator_id | int | 操作者 |
| is_mute | bool | 是否全员禁言 |

#### group_nudge
群戳一戳事件。
| 字段 | 类型 | 说明 |
|------|------|------|
| group_id | int | 群号 |
| sender_id | int | 发送者 |
| receiver_id | int | 接收者 |
| display_action | string | 动作文本 |
| display_suffix | string | 后缀文本 |
| display_action_img_url | string | 动作图片 URL |

#### group_file_upload
群文件上传事件。
| 字段 | 类型 | 说明 |
|------|------|------|
| group_id | int | 群号 |
| user_id | int | 上传者 |
| file_id | string | 文件 ID |
| file_name | string | 文件名称 |
| file_size | int | 文件大小（字节） |

---

## 9. 数据实体

### IncomingMessage

| 字段 | 类型 | 说明 |
|------|------|------|
| message_scene | string | friend/group/temp |
| peer_id | int | 好友 QQ 号或群号 |
| message_seq | int | 消息序列号 |
| sender_id | int | 发送者 QQ 号 |
| time | int | 消息 Unix 时间戳 |
| segments | [IncomingSegment] | 消息段列表 |

场景特有字段：
- **friend**: `friend: FriendEntity`
- **group**: `group: GroupEntity`, `group_member: GroupMemberEntity`
- **temp**: `group: GroupEntity`（发送者所在的群）

### IncomingForwardedMessage

| 字段 | 类型 | 说明 |
|------|------|------|
| message_seq | int | 消息序列号 |
| sender_name | string | 发送者名称 |
| avatar_url | string | 头像 URL |
| time | int | 消息时间戳 |
| segments | [IncomingSegment] | 消息段列表 |

### GroupEssenceMessage

| 字段 | 类型 | 说明 |
|------|------|------|
| group_id | int | 群号 |
| message_seq | int | 消息序列号 |
| message_time | int | 发送时间 |
| sender_id | int | 发送者 QQ 号 |
| sender_name | string | 发送者名称 |
| operator_id | int | 操作者 QQ 号 |
| operator_name | string | 操作者名称 |
| operation_time | int | 设置精华时间 |
| segments | [IncomingSegment] | 消息段列表 |

### OutgoingForwardedMessage

| 字段 | 类型 | 说明 |
|------|------|------|
| user_id | int | 发送者 QQ 号 |
| sender_name | string | 发送者名称 |
| segments | [OutgoingSegment] | 消息段列表 |

### FriendEntity

| 字段 | 类型 | 说明 |
|------|------|------|
| user_id | int | QQ 号 |
| nickname | string | 昵称 |
| sex | string | male/female/unknown |
| qid | string | QID |
| remark | string | 备注 |
| category | object | { category_id, category_name } |

### GroupEntity

| 字段 | 类型 | 说明 |
|------|------|------|
| group_id | int | 群号 |
| group_name | string | 群名称 |
| member_count | int | 成员数 |
| max_member_count | int | 最大成员数 |
| remark | string | 群备注 |
| created_time | int | 创建时间 |
| description | string | 群描述 |
| question | string | 入群问题 |
| announcement | string | 群公告 |

### GroupMemberEntity

| 字段 | 类型 | 说明 |
|------|------|------|
| user_id | int | QQ 号 |
| nickname | string | 昵称 |
| sex | string | male/female/unknown |
| group_id | int | 群号 |
| card | string | 群名片 |
| title | string | 群头衔 |
| level | int | 等级 |
| role | string | owner/admin/member |
| join_time | int | 入群时间 |
| last_sent_time | int | 最后发言时间 |
| shut_up_end_time | int | 禁言结束时间 |

### GroupFileEntity

| 字段 | 类型 | 说明 |
|------|------|------|
| group_id | int | 群号 |
| file_id | string | 文件 ID |
| file_name | string | 文件名称 |
| parent_folder_id | string | 父文件夹 ID |
| file_size | int | 文件大小 |
| uploaded_time | int | 上传时间 |
| expire_time | int | 过期时间 |
| uploader_id | int | 上传者 QQ 号 |
| downloaded_times | int | 下载次数 |

### GroupFolderEntity

| 字段 | 类型 | 说明 |
|------|------|------|
| group_id | int | 群号 |
| folder_id | string | 文件夹 ID |
| parent_folder_id | string | 父文件夹 ID |
| folder_name | string | 文件夹名称 |
| created_time | int | 创建时间 |
| last_modified_time | int | 最后修改时间 |
| creator_id | int | 创建者 QQ 号 |
| file_count | int | 文件数量 |

### AnnouncementEntity

| 字段 | 类型 | 说明 |
|------|------|------|
| group_id | int | 群号 |
| announcement_id | string | 公告 ID |
| user_id | int | 发布者 QQ 号 |
| time | int | 发布时间 |
| content | string | 公告内容 |
| image_url | string | 公告图片 URL |

### FriendRequestEntity

| 字段 | 类型 | 说明 |
|------|------|------|
| time | int | 请求时间 |
| initiator_id | int | 请求发起者 QQ 号 |
| initiator_uid | string | 请求发起者 UID |
| target_user_id | int | 目标 QQ 号 |
| target_user_uid | string | 目标 UID |
| state | string | pending/accepted/rejected/ignored |
| comment | string | 附加信息 |
| via | string | 来源 |
| is_filtered | bool | 是否被过滤 |

### GroupNotification

| 字段 | 类型 | 说明 |
|------|------|------|
| type | string | join_request/admin_change/kick/quit/invited_join_request |
| group_id | int | 群号 |
| notification_seq | int | 通知序列号 |
| is_filtered | bool | 是否被过滤 |
| initiator_id | int | 发起者 QQ 号 |
| state | string | pending/accepted/rejected/ignored |
| operator_id | int | 操作者 QQ 号 |
| comment | string | 附加信息 |
