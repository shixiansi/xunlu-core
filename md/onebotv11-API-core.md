# OneBot V11 — 完整 API 参考文档

> **协议**: OneBot V11 (基于 LLOneBot / NapCat 实现)
> **Spec Source**: `G:\默认模块 (1).md` — LLOneBot OpenAPI spec
> **Transport**: HTTP POST/GET, 统一返回 `{ status, retcode, data, message, wording }`

---

## 1. 目录

- **2. 系统 API**: get_login_info, get_version_info, get_status, clean_cache, get_cookies, set_online_status, set_restart, scan_qrcode
- **3. 用户 API**: send_like, get_friend_list, get_friends_with_category, delete_friend, set_friend_add_request, set_friend_remark, get_stranger_info, set_qq_avatar, friend_poke, get_profile_like, get_profile_like_me, get_robot_uin_range, set_friend_category, get_qq_avatar, set_qq_profile, set_input_status, get_doubt_friends_add_request, set_doubt_friends_add_request
- **4. 群组 API**: get_group_list, get_group_info, get_group_member_list, get_group_member_info, group_poke, get_group_system_msg, set_group_add_request, set_group_leave, set_group_admin, set_group_card, set_group_ban, set_group_whole_ban, get_group_shut_list, set_group_name, batch_delete_group_member, set_group_kick, set_group_special_title, get_group_honor_info, get_essence_msg_list, set_essence_msg, delete_essence_msg, get_group_at_all_remain, _send_group_notice, _get_group_notice, send_group_sign, set_group_msg_mask, set_group_remark, get_group_ignore_add_request, upload_group_album, get_group_album_list, create_group_album, delete_group_album, get_group_album_media_list, _delete_group_notice, set_group_portrait
- **5. 消息 API**: send_private_msg, send_private_forward_msg, send_group_msg, send_group_forward_msg, forward_friend_single_msg, forward_group_single_msg, get_msg, delete_msg, get_file, get_image, get_record, set_msg_emoji_like, send_poke, get_friend_msg_history, get_group_msg_history, get_forward_msg, mark_msg_as_read, voice_msg_to_text, send_group_ai_record, get_ai_characters
- **6. 文件 API**: upload_group_file, set_group_file_forever, delete_group_file, move_group_file, create_group_file_folder, delete_group_folder, get_group_file_system_info, get_group_root_files, get_group_files_by_folder, rename_group_file_folder, rename_group_file, get_group_file_url, get_private_file_url, upload_private_file, upload_flash_file, download_flash_file, get_flash_file_info, download_file, reshare_flash_file
- **7. 其他 API**: ocr_image, get_rkey, get_recommend_face, fetch_custom_face, send_pb
- **8. 消息段类型**: text, image, video, record, file, flash, at, reply, json, xml, face, mface, markdown, node, forward, poke, dice, rps, contact, shake, keyboard
- **9. 事件类型**: MessageEvent, PokeEvent, FriendRecallNoticeEvent, FriendRequestEvent, FriendAddNoticeEvent, ProfileLikeEvent, GroupUploadNoticeEvent, GroupRequestEvent, GroupDismissEvent, GroupIncreaseEvent, GroupDecreaseEvent, GroupTitleEvent, GroupCardEvent, GroupMsgEmojiLikeEvent, GroupRecallNoticeEvent, GroupAdminNoticeEvent, GroupBanEvent, EssenceEvent, FlashFileEvent, HeartbeatEvent, LifeCycleEvent

---

## 2. 系统 API

### GET /get_login_info

获取登录号信息。无请求参数。

**响应 data:**
| 字段 | 类型 | 说明 |
|------|------|------|
| user_id | int | 机器人 QQ 号 |
| nickname | string | 机器人昵称 |

### POST /get_login_info

同 GET 版本。

### GET /get_version_info

获取版本信息。无请求参数。

**响应 data:**
| 字段 | 类型 | 说明 |
|------|------|------|
| app_name | string | 应用名 (如 LLOneBot) |
| protocol_version | string | 协议版本 (v11) |
| app_version | string | 应用版本 |

### POST /get_status

获取机器人状态。

**响应 data:**
| 字段 | 类型 | 说明 |
|------|------|------|
| online | bool | 是否在线 |
| good | bool | 状态良好 |
| stat.message_received | int | 接收消息总数 |
| stat.message_sent | int | 发送消息总数 |
| stat.last_message_time | int | 最后消息时间 |
| stat.startup_time | int | 启动时间 |

### GET /clean_cache

清理缓存 (LLOneBot 5.0+ 后失效)。无请求参数。

### POST /get_cookies

获取 cookies。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| domain | string | 是 | 需要 cookies 的域名 |

**响应 data:** `{ cookies, bkn }`

### POST /set_online_status

设置在线状态。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| status | int | 是 | 10=在线, 30=离开, 40=忙碌, 50=请勿打扰, 60=隐身, 70=Q我吧 |
| ext_status | int | 是 | 扩展状态 |
| battery_status | int | 是 | 电量 |

### POST /set_restart

重启 (LLOneBot 5.0+ 后失效)。无请求参数。

### POST /scan_qrcode

扫描二维码 (需要 7.2.0+)。返回二维码中的文本内容。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | string | 是 | 支持 http(s)://, file://, base64:// |

**响应 data:** `[{ text }]`

---

## 3. 用户 API

### POST /send_like

点赞。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| user_id | int | 是 | 对方 QQ 号 |
| times | int | 否 | 赞的次数 |

### POST /get_friend_list

获取好友列表。无请求参数。

**响应 data:** `[{ user_id, nickname, remark, sex, birthday_year, birthday_month, birthday_day, age, qid, long_nick }]`

### GET /get_friends_with_category

获取好友列表（带分组）。无请求参数。

**响应 data:** `[{ categoryId, categorySortId, categoryName, categoryMbCount, onlineCount, buddyList: [{ user_id, nickname, remark, sex, birthday_year, age, qid, long_nick, level, uid, categoryId }] }]`

### POST /delete_friend

删除好友。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| user_id | int | 是 | 好友 QQ 号 |

### POST /set_friend_add_request

处理好友申请。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| flag | string | 是 | 请求 ID |
| approve | bool | 是 | 是否同意 |
| remark | string | 是 | 好友备注 |

### POST /set_friend_remark

设置好友备注。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| user_id | int | 是 | 好友 QQ 号 |
| remark | string | 否 | 备注名 |

### POST /get_stranger_info

获取陌生人信息。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| user_id | int | 是 | QQ 号 |

**响应 data:** `{ user_id, nickname, sex, age, qid, level, login_days, reg_time, long_nick, city, country, birthday_year, birthday_month, birthday_day, labels, is_vip, is_years_vip, vip_level, remark }`

### POST /set_qq_avatar

设置个人头像。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | string | 是 | 支持 file://, http://, base64:// |

### POST /friend_poke

好友戳一戳。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| user_id | int | 是 | 对方 QQ 号 |
| target_id | int | 否 | 目标 QQ 号 |

### POST /get_profile_like

获取我赞过谁列表。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| start | int | 否 | 从 0 开始, -1 获取全部 |
| count | int | 否 | 每页数量, 最多 30 |

**响应 data:** `{ users: [{ uid, src, latestTime, count, nick, gender, age, isFriend, isvip, isSvip, uin }], nextStart }`

### POST /get_profile_like_me

获取谁赞过我列表。参数同 get_profile_like。

### GET /get_robot_uin_range

获取官方机器人 QQ 号范围。无请求参数。

**响应 data:** `[{ minUin, maxUin }]`

### POST /set_friend_category

移动好友分组。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| user_id | int | 是 | 好友 QQ 号 |
| category_id | int | 是 | 分组 ID |

### POST /get_qq_avatar

获取 QQ 头像 URL。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| user_id | int | 否 | QQ 号 |
| group_id | int | 否 | 群号 |

**响应 data:** `{ url }`

### POST /set_qq_profile

设置登录号资料。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| nickname | string | 否 | 昵称 |
| personal_note | string | 否 | 个人说明 |

### POST /set_input_status

设置输入状态 (需要 LLBot 7.12.3+)。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| user_id | int | 是 | 对方 QQ 号 |
| event_type | int | 是 | 0=正在说话, 1=正在输入 |

### POST /get_doubt_friends_add_request

获取被过滤好友请求 (需要 LLOneBot 6.2.0+)。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| count | int | 否 | 好友请求数量 |

**响应 data:** `[{ flag, uin, nick, source, reason, msg, group_code, time, type }]`

### POST /set_doubt_friends_add_request

处理被过滤好友请求 (需要 LLOneBot 6.2.0+)。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| flag | string | 是 | 请求 flag |

---

## 4. 群组 API

### POST /get_group_list

获取群列表。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| no_cache | bool | 否 | 是否不使用缓存 |

**响应 data:** `[{ group_id, group_name, group_memo, group_create_time, member_count, max_member_count, remark_name, avatar_url, owner_id, is_top, shut_up_all_timestamp, shut_up_me_timestamp }]`

### POST /get_group_info

获取群信息。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |

**响应 data (需 LLBot 7.8+):** `{ group_id, group_name, group_memo, group_create_time, member_count, max_member_count, remark_name, avatar_url, owner_id, is_top, shut_up_all_timestamp, shut_up_me_timestamp, is_freeze, active_member_count }`

### POST /get_group_member_list

获取群成员列表。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| no_cache | bool | 否 | 是否不使用缓存 |

**响应 data:** `[{ group_id, user_id, nickname, card, card_or_nickname, sex, age, area, level, qq_level, join_time, last_sent_time, title_expire_time, unfriendly, card_changeable, is_robot, shut_up_timestamp, role (owner/admin/member), title }]`

### POST /get_group_member_info

获取群成员信息。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| user_id | int | 是 | QQ 号 |
| no_cache | bool | 否 | 是否不使用缓存 |

**响应 data:** 单条成员信息，结构与 get_group_member_list 中的条目相同。

### POST /group_poke

群员戳一戳。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| user_id | int | 是 | QQ 号 |

### GET /get_group_system_msg

获取群系统消息。无请求参数。

**响应 data:** `{ invited_requests: [{ request_id, invitor_uin, invitor_nick, group_id, group_name, checked, actor }], join_requests: [{ request_id, requester_uin, requester_nick, message, group_id, group_name, checked, actor }] }`

### POST /set_group_add_request

处理加群请求。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| flag | string | 是 | 请求 flag |
| approve | bool | 否 | 是否同意 |
| reason | string | 否 | 拒绝理由 |

### POST /set_group_leave

退群。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |

### POST /set_group_admin

设置群管理员。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| user_id | int | 是 | 成员 QQ 号 |
| enable | bool | 是 | true=设置, false=取消 |

### POST /set_group_card

设置群名片。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| user_id | int | 是 | QQ 号 |
| card | string | 否 | 群名片, 空字符串取消 |

### POST /set_group_ban

群禁言。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| user_id | int | 是 | QQ 号 |
| duration | int | 是 | 禁言时长(秒), 0=取消 |

### POST /set_group_whole_ban

群全体禁言。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| enable | bool | 否 | 是否禁言 |

### POST /get_group_shut_list

获取被禁言成员列表。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |

**响应 data:** `[{ uid, uin, nick, remark, cardName, role, shutUpTime, ... }]`

### POST /set_group_name

设置群名。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| group_name | string | 是 | 新群名 |

### POST /batch_delete_group_member

批量踢出群成员 (需要 5.6.0+)。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| user_ids | [int] | 是 | QQ 号数组 |

### POST /set_group_kick

群踢人。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| user_id | int | 是 | 要踢的 QQ 号 |
| reject_add_request | bool | 是 | 是否禁止再次加群 |

### POST /set_group_special_title

设置群头衔。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| user_id | int | 是 | QQ 号 |
| special_title | string | 否 | 专属头衔, 空字符串取消 |

### POST /get_group_honor_info

群荣誉。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| type | string | 否 | talkative/performer/legend/strong_newbie/emotion/all |

**响应 data:** `{ group_id, current_talkative: { user_id, avatar, nickname, day_count, description }, talkative_list, performer_list, legend_list, emotion_list, strong_newbie_list }`

### POST /get_essence_msg_list

获取群精华消息列表。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |

**响应 data:** `[{ sender_id, sender_nick, sender_time, operator_id, operator_nick, operator_time, message_id }]`

### POST /set_essence_msg

设置群精华消息。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| message_id | int | 是 | 消息 ID |

### POST /delete_essence_msg

删除群精华消息。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| message_id | int | 是 | 消息 ID |

### POST /get_group_at_all_remain

获取群 @全体成员 剩余次数。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |

**响应 data:** `{ can_at_all, remain_at_all_count_for_group, remain_at_all_count_for_uin }`

### POST /_send_group_notice

发送群公告。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| content | string | 是 | 公告内容 |
| image | string | 否 | 图片 (http/file/base64) |
| pinned | bool | 否 | 是否置顶 |
| confirm_required | bool | 否 | 是否需要确认 |
| is_show_edit_card | bool | 否 | 是否引导修改群昵称 |
| tip_window | bool | 否 | 是否弹窗展示 |
| send_new_member | bool | 否 | 是否发送给新成员 |

### POST /_get_group_notice

获取群公告。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |

**响应 data:** `[{ notice_id, sender_id, publish_time, message: { text, images }, settings: { is_show_edit_card, tip_window, confirm_required, pinned, send_new_member } }]`

### POST /send_group_sign

群打卡。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |

### POST /set_group_msg_mask

设置群消息接收方式。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| mask | int | 是 | 1=接收并提醒, 2=收进群助手, 3=屏蔽, 4=接收不提醒 |

### POST /set_group_remark

设置群备注。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| remark | string | 否 | 备注名, 空字符串取消 |

### POST /get_group_ignore_add_request

获取已过滤的加群通知。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |

### POST /upload_group_album

上传群相册。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| album_id | string | 是 | 相册 ID |
| files | [string] | 是 | 文件路径数组 |

**响应 data:** `{ success_count, fail_count, fail_indexes }`

### POST /get_group_album_list

获取群相册列表。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |

**响应 data:** `[{ album_id, owner, name, desc, create_time, modify_time, last_upload_time, upload_number, cover, creator, ... }]`

### POST /create_group_album

创建群相册。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| name | string | 是 | 相册名称 |
| desc | string | 否 | 相册描述 |

**响应 data:** `{ album_id, owner, name, ... }`

### POST /delete_group_album

删除群相册。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| album_id | string | 是 | 相册 ID |

### POST /get_group_album_media_list

获取群相册媒体列表 (需要 LLBot 7.12.3+)。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| album_id | string | 是 | 相册 ID |
| attach_info | string | 否 | 分页参数 |

**响应 data:** `{ album: {...}, media_list: [...], next_attach_info, next_has_more }`

### POST /_delete_group_notice

删除群公告。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| notice_id | string | 是 | 公告 ID |

### POST /set_group_portrait

设置群头像。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| file | string | 是 | 头像文件 URI |

---

## 5. 消息 API

### POST /send_private_msg

发送私聊消息 (支持 array 消息段)。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| user_id | int | 是 | 对方 QQ 号 |
| message | [object] | 是 | 消息段数组 |

**响应 data:** `{ message_id }`

### POST /send_private_forward_msg

发送私聊合并转发。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| user_id | int | 是 | 对方 QQ 号 |
| messages | [object] | 是 | node 数组 |
| source | string | 否 | 标题 |
| news | [object] | 否 | 预览文本 (1-4 条) |
| summary | string | 否 | 摘要 |
| prompt | string | 否 | 预览外显文本 |

**响应 data:** `{ message_id }`

### POST /send_group_msg

发送群聊消息。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| message | [object] | 是 | 消息段数组 |

**响应 data:** `{ message_id }`

### POST /send_group_forward_msg

发送群聊合并转发。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| messages | [object] | 是 | node 数组 |
| source/ news/ summary/ prompt | - | 否 | 同私聊合并转发 |

**响应 data:** `{ message_id, forward_id }`

### POST /forward_friend_single_msg

转发单条好友消息。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| message_id | int | 是 | 消息 ID |
| user_id | int | 是 | 对方 QQ 号 |

**响应 data:** `{ message_id }`

### POST /forward_group_single_msg

转发单条群消息。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| message_id | int | 是 | 消息 ID |
| group_id | int | 是 | 群号 |

**响应 data:** `{ message_id }`

### POST /get_msg

获取消息详情。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| message_id | int | 是 | 消息 ID |

**响应 data:** `{ self_id, user_id, time, message_id, real_id, message_seq, message_type, sender: { user_id, nickname, card, role, title }, raw_message, font, sub_type, message: [{ type, data }], message_format, post_type, group_id, status (normal/deleted) }`

### POST /delete_msg

撤回消息。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| message_id | int | 是 | 消息 ID |

### POST /get_file

获取消息文件详情。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | string | 是 | 收到的文件名 |
| download | bool | 否 | 是否下载到 QQ 目录 |

**响应 data:** `{ file (path), url, file_size, file_name, base64 (需配置开启) }`

### POST /get_image

获取消息图片详情。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | string | 是 | 图片文件名 |

**响应 data:** `{ file, url, file_size, file_name }`

### POST /get_record

获取消息语音详情。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | string | 是 | 语音文件名 |
| out_format | string | 否 | mp3/amr/wma/m4a/spx/ogg/wav/flac |

**响应 data:** `{ file, file_size, file_name, base64 }`

### POST /set_msg_emoji_like

表情回应消息 (仅群聊)。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| message_id | int | 是 | 消息 ID |
| emoji_id | int | 是 | 表情 ID |
| set | bool | 否 | 是否回应 |

### POST /send_poke

发送戳一戳 (需要 LLBot 7.11.3+)。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 否 | 群号 (不填则为私聊戳) |
| user_id | int | 是 | 用户 QQ 号 |
| target_id | int | 否 | 目标 QQ 号 (仅私聊) |

### POST /get_friend_msg_history

获取好友历史消息。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| user_id | int | 是 | QQ 号 |
| message_seq | int | 否 | 起始消息序号 |
| count | int | 否 | 消息数量 |
| reverseOrder | bool | 否 | 排序方向 |

**响应 data:** `{ messages: [{ self_id, user_id, time, message_id, real_id, message_seq, message_type, sender, raw_message, message: [{ type, data }], ... }] }`

### POST /get_group_msg_history

获取群历史消息。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| message_seq | int | 否 | 起始消息序号 |
| count | int | 否 | 消息数量 |
| reverseOrder | bool | 否 | 排序方向 |

**响应 data:** 类似好友历史消息，额外包含 group_id。

### POST /get_forward_msg

获取转发消息详情。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| message_id | string | 是 | 长 ID (来自转发消息上报) |

**响应 data:** `{ messages: [{ content: [{ type, data }], sender: { nickname, user_id }, time, message_format, message_type }] }`

### POST /mark_msg_as_read

标记消息已读。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| message_id | int | 是 | 消息 ID |

### POST /voice_msg_to_text

语音消息转文字 (LLOneBot 5.1+)。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| message_id | int | 是 | 消息 ID |

**响应 data:** `{ text }`

### POST /send_group_ai_record

发送群 AI 语音 (需要 LLOneBot 5.6.1+)。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| character | string | 是 | 语音声色 ID |
| group_id | int | 是 | 群号 |
| text | string | 是 | 语音文本 |
| chat_type | int | 否 | 1 或 2 |

**响应 data:** `{ message_id }`

### POST /get_ai_characters

获取 AI 语音可用声色列表 (需要 LLOneBot 5.6.1+)。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 否 | 群号 |
| chat_type | int | 否 | 1 或 2 |

**响应 data:** `[{ type (分类名), characters: [{ character_id, character_name, preview_url }] }]`

---

## 6. 文件 API

### POST /upload_group_file

上传群文件。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| file | string | 是 | 文件路径 (file:// 或 http://) |
| name | string | 否 | 储存名称 |
| folder_id | string | 否 | 文件夹 ID |

**响应 data:** `{ file_id }`

### POST /set_group_file_forever

群文件转永久 (需要 6.5.0+)。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| file_id | string | 是 | 文件 ID |

### POST /delete_group_file

删除群文件。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| file_id | string | 是 | 文件 ID |

### POST /move_group_file

移动群文件。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| file_id | string | 是 | 文件 ID |
| parent_directory | string | 是 | 当前文件夹 ID |
| target_directory | string | 是 | 目标文件夹 ID |

### POST /create_group_file_folder

创建群文件文件夹。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| name | string | 是 | 文件夹名称 |

**响应 data:** `{ folder_id }`

### POST /delete_group_folder

删除群文件文件夹。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| folder_id | string | 是 | 文件夹 ID |

### POST /get_group_file_system_info

获取群文件系统信息。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |

**响应 data:** `{ file_count, limit_count, used_space, total_space }`

### POST /get_group_root_files

获取群根目录文件列表。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |

**响应 data:** `{ files: [FileEntity], folders: [FolderEntity] }`

**FileEntity:** `{ group_id, file_id, file_name, busid, file_size, upload_time, dead_time, modify_time, download_times, uploader, uploader_name }`

**FolderEntity:** `{ group_id, folder_id, folder_name, create_time, creator, creator_name, total_file_count }`

### POST /get_group_files_by_folder

获取群子目录文件列表。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| folder_id | string | 是 | 文件夹 ID |

**响应 data:** 同 get_group_root_files。

### POST /rename_group_file_folder

重命名群文件文件夹。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| folder_id | string | 是 | 文件夹 ID |
| new_folder_name | string | 是 | 新名称 |

### POST /rename_group_file

重命名群文件 (需要 LLBot 7.10.1+)。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| file_id | string | 是 | 文件 ID |
| current_parent_directory | string | 是 | 当前父目录 |
| new_name | string | 是 | 新文件名 |

### POST /get_group_file_url

获取群文件资源链接。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group_id | int | 是 | 群号 |
| file_id | string | 是 | 文件 ID |

**响应 data:** `{ url }`

### POST /get_private_file_url

获取私聊文件资源链接 (需要 LLOneBot 5.9.0+)。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file_id | string | 是 | 文件 ID |

**响应 data:** `{ url }`

### POST /upload_private_file

上传私聊文件。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| user_id | int | 是 | 对方 QQ 号 |
| file | string | 是 | 文件路径 (http/file/base64) |
| name | string | 否 | 文件名称 |

**响应 data:** `{ file_id }`

### POST /upload_flash_file

上传闪传文件 (需要 LLOneBot 5.3.0+)。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| title | string | 否 | 标题 |
| paths | [string] | 是 | 文件路径数组 |

**响应 data:** `{ file_set_id, share_link, expire_time }`

### POST /download_flash_file

下载闪传文件 (需要 LLOneBot 5.3.0+)。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| share_link | string | 否 | 分享链接 (和 file_set_id 二选一) |
| file_set_id | string | 否 | 文件集 ID |

### POST /get_flash_file_info

获取闪传文件详情 (需要 LLOneBot 5.3.0+)。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| share_link | string | 否 | 分享链接 |
| file_set_id | string | 否 | 文件集 ID |

**响应 data:** `{ file_set_id, title, share_link, total_file_size, files: [{ name, size }] }`

### POST /download_file

下载文件到缓存目录。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| url | string | 否 | 链接 |
| base64 | string | 否 | Base64 编码 |
| name | string | 否 | 文件名 |
| headers | [string] | 否 | 自定义请求头 |

### POST /reshare_flash_file

重新分享闪传文件 (需要 LLBot 7.11.0+)。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file_set_id | string | 否 | 文件集 ID |

**响应 data:** `{ file_set_id, share_link, expire_time }`

---

## 7. 其他 API

### POST /ocr_image

图片 OCR。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| image | string | 是 | 支持 http://, file://, base64:// |

**响应 data:** `{ texts: [{ text, confidence, coordinates: [{ x, y }] }], language }`

### GET /get_rkey

获取图片 rkey。无请求参数。

**响应 data:** `{ private_key, group_key, expired_time, updated_time }`

### POST /get_recommend_face

获取推荐表情 (需要 5.5.0+)。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| word | string | 是 | 关键词 |

**响应 data:** `{ url: [string] }`

### GET /fetch_custom_face

获取收藏表情。无请求参数。

**响应 data:** `[string]` (URL 数组)

### POST /send_pb

发送 Protobuf 数据包。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| cmd | string | 是 | 命令 (如 OidbSvcTrpcTcp.0xed3_1) |
| hex | string | 是 | Protobuf 16 进制字符串 |

**响应 data:** `{ cmd, hex, echo }`

---

## 8. 消息段类型

消息段统一格式: `{ type: string, data: object }`

### text

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| data.text | string | 是 | 文本内容 |

### image

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| data.file | string | 是 | 图片文件/路径/URL |
| data.url | string | 否 | 图片 URL |
| data.file_size | string | 否 | 文件大小 |
| data.summary | string | 否 | 摘要 |
| data.subType | int | 否 | 子类型 |
| data.type | string | 否 | flash/show/普通 |
| data.thumb | string | 否 | 缩略图 URL |
| data.name | string | 否 | 图片名称 |

### video

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| data.file | string | 是 | 视频文件 |
| data.url | string | 否 | 视频 URL |
| data.path | string | 否 | 本地路径 |
| data.file_size | string | 否 | 大小 |
| data.thumb | string | 否 | 缩略图 |
| data.name | string | 否 | 名称 |

### record

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| data.file | string | 是 | 语音文件 |
| data.url | string | 否 | URL |
| data.file_size | string | 否 | 大小 |
| data.file_name | string | 否 | 名称 |
| data.base64 | string | 否 | Base64 |

### file

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| data.file | string | 是 | 文件 |
| data.url | string | 否 | URL |
| data.file_size | string | 否 | 大小 |
| data.file_name | string | 否 | 名称 |

### flash (flash_file)

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| data.name | string | 是 | 文件名 |
| data.size | int | 是 | 大小 |
| data.path | string | 否 | 路径 |

### at

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| data.qq | string | 是 | QQ 号, 或 "all" 表示 @全体成员 |

### reply

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| data.id | string | 是 | 回复的消息 ID |

### json

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| data.data | string | 是 | JSON 内容字符串 |

### xml

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| data.data | string | 是 | XML 内容字符串 |

### face

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| data.id | string | 是 | 表情 ID |

### mface (商城表情)

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| data.id | string | 是 | 表情 ID |
| data.url | string | 否 | URL |
| data.emoji_package_id | int | 否 | 包 ID |
| data.emoji_id | string | 否 | 表情 ID |
| data.key | string | 否 | 表情 Key |

### markdown

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| data.content | string | 是 | Markdown 内容 |

### node (合并转发节点)

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| data.id | string | 否 | 转发消息 ID |
| data.name | string | 否 | 发送者显示名 |
| data.uin | int | 否 | 发送者 QQ |
| data.content | [object] | 否 | 具体消息段 |

### forward (合并转发)

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| data.id | string | 是 | 转发 ID |

### poke

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| data.type | string | 是 | 戳一戳类型 |

### dice

骰子。data 为空。

### rps

石头剪刀布。data 为空。

### contact

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| data.type | string | 是 | friend 或 group |
| data.id | string | 是 | 目标 ID |

### shake

窗口抖动。data 为空。

### keyboard (按钮)

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| data.rows | [object] | 是 | 行数组 |
| data.rows[].buttons | [[KeyboardButton]] | 是 | 按钮数组 |

**KeyboardButton:** `{ id, render_data: { label, visited_label, style }, action: { type, permission: { type, specify_role_ids, specify_user_ids }, unsupport_tips, data, reply, enter } }`

---

## 9. 事件类型

所有事件通用字段: `{ time, self_id, post_type }`

### MessageEvent (post_type: message)

| 字段 | 类型 | 说明 |
|------|------|------|
| message_id | int | 消息 ID |
| message_seq | int | 消息序列号 |
| user_id | int | 发送者 QQ |
| group_id | int | 群号 (仅群消息) |
| message_type | string | private / group |
| sub_type | string | friend / group / normal |
| sender | MessageSender | 发送者信息 |
| message | [MessageSegment] | 消息内容 |
| message_format | string | array / string |
| raw_message | string | 原始消息 |
| font | int | 字体 ID |
| target_id | int | 目标 ID |
| temp_source | int | 临时聊天来源 (0-9) |

### PokeEvent (post_type: notice, notice_type: notify, sub_type: poke)

| 字段 | 类型 | 说明 |
|------|------|------|
| user_id | int | 发送戳一戳的用户 |
| target_id | int | 被戳的目标 |
| group_id | int | 群号 (仅群聊) |
| raw_info | string | 原始 XML |

### FriendRecallNoticeEvent (post_type: notice, notice_type: friend_recall)

| 字段 | 类型 | 说明 |
|------|------|------|
| user_id | int | 撤回消息的好友 |
| message_id | int | 被撤回的消息 ID |

### FriendRequestEvent (post_type: request, request_type: friend)

| 字段 | 类型 | 说明 |
|------|------|------|
| user_id | int | 请求者 QQ |
| comment | string | 请求消息 |
| flag | string | 请求标识 |
| via | string | 请求来源 |

### FriendAddNoticeEvent (post_type: notice, notice_type: friend_add)

| 字段 | 类型 | 说明 |
|------|------|------|
| user_id | int | 新好友 QQ |

### ProfileLikeEvent (post_type: notice, notice_type: notify, sub_type: profile_like)

| 字段 | 类型 | 说明 |
|------|------|------|
| operator_id | int | 点赞用户 |
| operator_nick | string | 点赞用户昵称 |
| times | int | 点赞次数 |

### GroupUploadNoticeEvent (post_type: notice, notice_type: group_upload)

| 字段 | 类型 | 说明 |
|------|------|------|
| group_id | int | 群号 |
| user_id | int | 上传者 |
| file | GroupUploadFile | { id, name, size, busid } |

### GroupRequestEvent (post_type: request, request_type: group)

| 字段 | 类型 | 说明 |
|------|------|------|
| sub_type | string | add / invite |
| group_id | int | 群号 |
| user_id | int | 请求者 |
| comment | string | 请求消息 |
| flag | string | 请求标识 |
| invitor_id | int | 邀请者 (invite 时) |

### GroupIncreaseEvent (post_type: notice, notice_type: group_increase)

| 字段 | 类型 | 说明 |
|------|------|------|
| sub_type | string | approve / invite |
| group_id | int | 群号 |
| user_id | int | 新成员 |
| operator_id | int | 操作者 |

### GroupDecreaseEvent (post_type: notice, notice_type: group_decrease)

| 字段 | 类型 | 说明 |
|------|------|------|
| sub_type | string | leave / kick / kick_me |
| group_id | int | 群号 |
| user_id | int | 离开者 |
| operator_id | int | 操作者 |

### GroupAdminNoticeEvent (post_type: notice, notice_type: group_admin)

| 字段 | 类型 | 说明 |
|------|------|------|
| sub_type | string | set / unset |
| group_id | int | 群号 |
| user_id | int | 被操作者 |

### GroupBanEvent (post_type: notice, notice_type: group_ban)

| 字段 | 类型 | 说明 |
|------|------|------|
| sub_type | string | ban / lift_ban |
| group_id | int | 群号 |
| user_id | int | 被禁言者 |
| operator_id | int | 操作者 |
| duration | int | 禁言时长 (秒) |

### GroupRecallNoticeEvent (post_type: notice, notice_type: group_recall)

| 字段 | 类型 | 说明 |
|------|------|------|
| group_id | int | 群号 |
| user_id | int | 原消息发送者 |
| operator_id | int | 撤回者 |
| message_id | int | 被撤回消息 ID |

### EssenceEvent (post_type: notice, notice_type: essence)

| 字段 | 类型 | 说明 |
|------|------|------|
| sub_type | string | add / delete |
| group_id | int | 群号 |
| user_id | int | 消息发送者 |
| operator_id | int | 操作者 |
| message_id | int | 精华消息 ID |

### GroupTitleEvent (post_type: notice, notice_type: notify, sub_type: title)

| 字段 | 类型 | 说明 |
|------|------|------|
| group_id | int | 群号 |
| user_id | int | 获得头衔用户 |
| title | string | 专属头衔 |

### GroupCardEvent (post_type: notice, notice_type: group_card)

| 字段 | 类型 | 说明 |
|------|------|------|
| group_id | int | 群号 |
| user_id | int | 名片被修改者 |
| card_new | string | 新名片 |
| card_old | string | 旧名片 |

### GroupMsgEmojiLikeEvent (post_type: notice, notice_type: group_msg_emoji_like)

| 字段 | 类型 | 说明 |
|------|------|------|
| group_id | int | 群号 |
| user_id | int | 回应者 |
| message_id | int | 被回应消息 |
| likes | [{ emoji_id, count }] | 回应列表 |
| is_add | bool | 添加/取消 |

### GroupDismissEvent (post_type: notice, notice_type: group_dismiss)

| 字段 | 类型 | 说明 |
|------|------|------|
| group_id | int | 群号 |
| user_id | int | 群主 QQ |

### FlashFileEvent (post_type: notice, notice_type: flash_file)

| 字段 | 类型 | 说明 |
|------|------|------|
| sub_type | string | downloaded / downloading / uploaded / uploading |
| title | string | 标题 |
| share_link | string | 分享链接 |
| file_set_id | string | 文件集 ID |
| files | [FlashFile] | 文件列表 |
| downloaded_size / uploaded_size / total_size / speed / remain_seconds | int | 传输进度 |

### HeartbeatEvent (post_type: meta_event, meta_event_type: heartbeat)

| 字段 | 类型 | 说明 |
|------|------|------|
| status | { online, good } | 状态 |
| interval | int | 心跳间隔 (ms) |

### LifeCycleEvent (post_type: meta_event, meta_event_type: lifecycle)

| 字段 | 类型 | 说明 |
|------|------|------|
| sub_type | string | enable / disable / connect |

---

## 附录：通用响应结构

```json
{
  "status": "ok" | "failed",
  "retcode": 0,
  "data": { /* 见各 API */ },
  "message": "",
  "wording": ""
}
```

- `retcode`: 0=成功, 非0=失败
- HTTP 状态码统一返回 200
- 鉴权: Header `Authorization: Bearer <token>` 或 Query `?token=<token>`
