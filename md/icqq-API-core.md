# icqq v1.10.18 — 完整 API 参考文档

> **项目**: `@icqqjs/icqq`
> **Source**: `F:\编程\QQBot\Miao-Yunzai\icqq copy`
> **Entry**: `lib/index.js` (CommonJS), `lib/index.mjs` (ESM)
> **Framework**: TypeScript → JavaScript (protobuf-based QQ protocol implementation)

---

## 1. 目录结构 (完整)

```
icqq copy/
├── CHANGELOG.md
├── LICENSE
├── README.md
├── package.json                 # main: ./lib/index.js
├── lib/                         # 编译输出 (JS + .d.ts 类型定义)
│   ├── index.d.ts / .js / .mjs  # 公开 API 入口
│   ├── client.d.ts              # Client 类 (核心)
│   ├── friend.d.ts              # User + Friend 类
│   ├── group.d.ts               # Discuss + Group 类
│   ├── member.d.ts              # Member 类
│   ├── guild.d.ts               # Guild 类 + GuildRole 枚举
│   ├── channel.d.ts             # Channel 类 + ChannelType/NotifyType 枚举
│   ├── gfs.d.ts                 # Gfs (群文件系统)
│   ├── common.d.ts              # 工具函数 + OnlineStatus/Gender/GroupRole
│   ├── entities.d.ts            # 数据实体 (StrangerInfo/FriendInfo/GroupInfo/MemberInfo)
│   ├── errors.d.ts              # ErrorCode + LoginErrorCode
│   ├── events.d.ts              # 事件接口和事件映射
│   ├── core/                    # 底层协议核心
│   │   ├── index.d.ts           # 聚合导出
│   │   ├── base-client.d.ts     # BaseClient 基类 (网络层/登录/发包)
│   │   ├── device.d.ts          # 设备/平台/Apk
│   │   ├── constants.d.ts       # 加密/哈希/工具
│   │   ├── network.d.ts         # 网络连接
│   │   ├── protobuf/index.d.ts  # Proto 编解码
│   │   ├── sign.d.ts            # 签名服务器
│   │   ├── tlv.d.ts             # TLV 编组 + Domain 类型
│   │   ├── tea.d.ts / ecdh.d.ts / qsign.d.ts / silk.d.ts / reader.d.ts / writer.d.ts
│   │   └── algo/ (aes, rsa)
│   ├── internal/                # 内部模块
│   │   ├── contactable.d.ts     # Contactable 抽象基类
│   │   ├── guild.d.ts           # 频道消息事件
│   │   ├── highway.d.ts         # Highway 上传
│   │   ├── internal.d.ts        # 内部 API (getStatus/getUserProfile/uid2uin等)
│   │   ├── listeners.d.ts       # 内部事件绑定
│   │   ├── onlinepush.d.ts      # 消息推送监听
│   │   ├── pbgetmsg.d.ts        # 拉取离线消息
│   │   ├── sysmsg.d.ts          # 系统消息 (好友/入群申请)
│   │   ├── enctyption.d.ts      # 加密 (t544)
│   │   └── index.d.ts           # 聚合导出
│   └── message/                 # 消息处理
│       ├── index.d.ts           # 聚合导出
│       ├── message.d.ts         # Message 基类 + PrivateMessage/GroupMessage/DiscussMessage/ForwardMessage
│       ├── elements.d.ts        # 消息元素类型 + segment 工厂
│       ├── converter.d.ts       # Converter (消息 → Protobuf)
│       ├── parser.d.ts          # Parser (Protobuf → 消息)
│       ├── image.d.ts           # Image 类
│       ├── ptt.d.ts             # Ptt (语音) 类
│       ├── video.d.ts           # Video 类
│       ├── file.d.ts            # File 类
│       ├── share.d.ts           # 分享相关
│       ├── face.d.ts            # 表情字典
│       └── cqCode.d.ts          # CQ码兼容
```

---

## 2. Client — 核心客户端

### 2.1 创建

```typescript
// 方式1: 构造函数
const client = new Client(config?: Config);
const client = new Client(uin: number, config?: Config);

// 方式2: 工厂函数
const client = createClient(config?: Config): Client;
```

### 2.2 Config 配置

```typescript
interface Config {
  log_level?: LogLevel;           // "trace"|"debug"|"info"|"warn"|"error"|"fatal"|"mark"|"off"
  platform?: Platform;            // 登录设备 (默认 Android)
  ver?: string;                   // 版本号
  log_config?: Configuration | string;
  ignore_self?: boolean;          // 过滤自己的消息 (默认 true)
  resend?: boolean;               // 风控时分片重发
  data_dir?: string;              // 数据存储目录
  reconn_interval?: number;       // 断线重连间隔 (秒, 0=不重连)
  sign_api_addr?: string;         // 签名服务器地址
  cache_group_member?: boolean;   // 缓存群员列表
  auto_server?: boolean;          // 自动选最优服务器
  ffmpeg_path?: string;
  ffprobe_path?: string;
  QQNT?: boolean;                 // 使用QQNT协议 (默认 true)
  NTLogin?: boolean;
}
```

### 2.3 Client 属性

```typescript
class Client extends BaseClient {
  // --- 实例选择器 ---
  readonly pickGroup:    (gid: number, strict?: boolean) => Group;
  readonly pickFriend:   (uin: number, strict?: boolean) => Friend;
  readonly pickMember:   (gid: number, uin: number, strict?: boolean) => Member;
  readonly pickUser:     (uin: number) => User;
  readonly pickDiscuss:  (gid: number) => Discuss;
  readonly pickGuild:    (guild_id: string) => Guild;

  // --- 状态 ---
  logger:      Logger | log4js.Logger;
  readonly dir: string;                 // 数据存储目录
  readonly config: Required<Config>;
  password_md5?: Buffer;
  status:      OnlineStatus | number;   // 在线状态
  sex:         Gender;                   // "male"|"female"|"unknown"
  age:         number;
  nickname:    string;
  bid:         string;
  tiny_id:     string;                   // 频道中的 QQ 号

  // --- 缓存列表 ---
  readonly fl:        Map<number, FriendInfo>;     // 好友列表
  readonly sl:        Map<number, StrangerInfo>;   // 陌生人列表
  readonly gl:        Map<number, GroupInfo>;      // 群列表
  readonly gml:       Map<number, Map<number, MemberInfo>>;  // 群员缓存
  readonly guilds:    Map<string, Guild>;           // 频道列表
  readonly blacklist: Set<number>;                  // 黑名单
  readonly classes:   Map<number, string>;          // 好友分组
  readonly uid2uinMap: Map<string, number>;

  // --- Cookie/Token ---
  get client_key(): any;
  get skey(): any;
  get bkn(): number;                      // CSRF token
  readonly g_tk: { [domain in Domain]: string };
  readonly cookies: { [domain in Domain]: string };

  // --- 统计 ---
  get stat(): Statistics;
}
```

```typescript
interface Statistics {
  start_time:    number;
  lost_times:    number;
  recv_pkt_cnt:  number;
  sent_pkt_cnt:  number;
  lost_pkt_cnt:  number;
  recv_msg_cnt:  number;
  sent_msg_cnt:  number;
  msg_cnt_per_min: number;
  remote_ip:     string;
  remote_port:   number;
  ver:           string;
}
```

### 2.4 Client 方法

#### 登录

```typescript
login(): Promise<void>;                            // 扫码登录
login(password?: string | Buffer): Promise<void>;  // 密码登录
login(uin?: number, password?: string | Buffer): Promise<void>;
```

#### 资料设置

```typescript
setNickname(nickname: string): Promise<boolean>;
setGender(gender: 0 | 1 | 2): Promise<boolean>;    // 0未知 1男 2女
setBirthday(birthday: string | number): Promise<boolean>;  // YYYYMMDD
setDescription(description?: string): Promise<boolean>;
setSignature(signature?: string): Promise<boolean>;
setAvatar(file: ImageElem["file"]): Promise<void>;   // 设置头像
```

#### 在线状态

```typescript
getOnlineStatus(): Promise<OnlineStatus>;
setOnlineStatus(status?: number): Promise<unknown>;
getStatusInfo(uin?: number, usejce?: boolean): Promise<StatusInfo | null>;
```

#### 资料查询

```typescript
getProfile(uin_uid: number | string, idsParse?: Record<number, { key: string; parse: (val: any) => any }>): Promise<Record<string, any>>;
uid2uin(uid: string, group_id?: number): Promise<number>;
uid2uins(uids: string[], group_id?: number): Promise<number[]>;
uin2uid(uin: number, group_id?: number): Promise<string>;
uin2uids(uins: number[], group_id?: number): Promise<string[]>;
```

#### 好友/群/频道管理

```typescript
// 列表重载
reloadFriendList(): Promise<void>;
reloadStrangerList(): Promise<void>;
reloadGroupList(): Promise<void>;
reloadGuilds(): Promise<void>;
reloadBlackList(): Promise<void>;

// 好友分组
addClass(name: string): Promise<void>;
deleteClass(id: number): Promise<void>;
renameClass(id: number, name: string): Promise<void>;

// 系统消息
getSystemMsg(): Promise<(FriendRequestEvent | GroupInviteEvent | GroupRequestEvent)[]>;

// 漫游表情
getRoamingStamp(no_cache?: boolean): Promise<string[]>;
deleteStamp(id: string | string[]): Promise<void>;
```

#### 消息操作

```typescript
sendPrivateMsg(user_id: number, message: Sendable, source?: Quotable): Promise<MessageRet>;
sendGroupMsg(group_id: number, message: Sendable, source?: Quotable): Promise<MessageRet>;
sendDiscussMsg(discuss_id: number, message: Sendable, source?: Quotable): Promise<MessageRet>;
sendGuildMsg(guild_id: string, channel_id: string, message: Sendable): Promise<GuildMessageRet>;
sendTempMsg(group_id: number, user_id: number, message: Sendable): Promise<MessageRet>;
deleteMsg(message_id: string): Promise<boolean>;
getMsg(message_id: string): Promise<PrivateMessage | GroupMessage | undefined>;
getChatHistory(message_id: string, count?: number): Promise<PrivateMessage[] | GroupMessage[]>;
reportReaded(message_id: string): Promise<void>;
makeForwardMsg(fake: Forwardable[], dm?: boolean): Promise<JsonElem>;
getForwardMsg(resid: string, fileName?: string): Promise<ForwardMessage[]>;
```

#### 群操作 (cqhttp 兼容)

```typescript
setGroupName(group_id: number, name: string): Promise<boolean>;
setGroupCard(group_id: number, user_id: number, card: string): Promise<boolean>;
setGroupAdmin(group_id: number, user_id: number, enable?: boolean): Promise<boolean>;
setGroupSpecialTitle(group_id: number, user_id: number, special_title: string, duration?: number): Promise<boolean>;
setGroupBan(group_id: number, user_id: number, duration?: number): Promise<boolean>;
setGroupKick(group_id: number, user_id: number, reject_add_request?: boolean, message?: string): Promise<boolean>;
setGroupLeave(group_id: number): Promise<boolean>;
setGroupWholeBan(group_id: number, enable?: boolean): Promise<boolean>;
setGroupAnonymous(group_id: number, enable?: boolean): Promise<boolean>;
setGroupAnonymousBan(group_id: number, flag: string, duration?: number): Promise<void>;
setGroupPortrait(group_id: number, file: ImageElem["file"]): Promise<void>;
sendGroupNotice(group_id: number, content: string): Promise<boolean>;
sendGroupPoke(group_id: number, user_id: number): Promise<boolean>;
sendGroupSign(group_id: number): Promise<{ result: number }>;
setEssenceMessage(message_id: string): Promise<string>;
removeEssenceMessage(message_id: string): Promise<string>;
getGroupShareJson(group_id: number): Promise<any>;
setGroupMemberScreenMsg(group_id: number, member_id: number, isScreen?: boolean): Promise<boolean>;
```

#### 好友操作 (cqhttp 兼容)

```typescript
deleteFriend(user_id: number, block?: boolean): Promise<boolean>;
sendLike(user_id: number, times?: number): Promise<boolean>;
addFriend(group_id: number, user_id: number, comment?: string): Promise<boolean>;
inviteFriend(group_id: number, user_id: number): Promise<boolean>;
setFriendAddRequest(flag: string, approve?: boolean, remark?: string, block?: boolean): Promise<boolean>;
setGroupAddRequest(flag: string, approve?: boolean, reason?: string, block?: boolean): Promise<boolean>;
```

#### 其他

```typescript
getClientKey(): Promise<{ client_key: string; expire_time: number }>;
getPSkey(domains: string | string[]): Promise<Array<{ domain: string; p_skey: string; expire_time: number; g_tk: number; uskey?: string }>>;
refreshNTPicRkey(force?: boolean): Promise<{ [type: number]: RkeyInfo }>;
imageOcr(file: ImageElem["file"]): Promise<OcrResult>;
getVideoUrl(fid: string, md5: string | Buffer): Promise<string | null>;
getForumUrl(guild_id: string, channel_id: string, forum_id: string): Promise<string>;
cleanCache(): void;
group(...group_ids: number[]): (listener: (event: GroupInviteEvent | GroupMessageEvent) => void) => ToDispose<this>;
user(...user_ids: number[]): (listener: (event: PrivateMessageEvent | GroupMessageEvent) => void) => ToDispose<this>;
em(name?: string, data?: any): void;
```

### 2.5 Client 事件系统

```typescript
interface Client extends BaseClient {
  on<T extends keyof EventMap>(event: T, listener: EventMap[T]): ToDispose<this>;
  once<T extends keyof EventMap>(event: T, listener: EventMap[T]): ToDispose<this>;
  off<T extends keyof EventMap>(event: T): void;
  trap<T extends keyof EventMap>(event: T, listener: EventMap[T]): ToDispose<this>;  // 优先捕获
  trip<E extends keyof EventMap>(event: E, ...args): boolean;                        // 触发
  trapOnce<T extends keyof EventMap>(event: T, listener: EventMap[T]): ToDispose<this>;
}
```

---

## 3. EventMap — 所有事件定义

```typescript
interface EventMap {
  // ===== 消息事件 =====
  "message":              (event: PrivateMessageEvent | GroupMessageEvent | DiscussMessageEvent) => void;
  "message.private":      (event: PrivateMessageEvent) => void;
  "message.private.friend": (event: PrivateMessageEvent) => void;
  "message.private.group":  (event: PrivateMessageEvent) => void;  // 群临时会话
  "message.private.other":  (event: PrivateMessageEvent) => void;
  "message.private.self":   (event: PrivateMessageEvent) => void;  // 我的设备
  "message.group":        (event: GroupMessageEvent) => void;
  "message.group.normal": (event: GroupMessageEvent) => void;
  "message.group.anonymous": (event: GroupMessageEvent) => void;
  "message.discuss":      (event: DiscussMessageEvent) => void;
  "message.guild":        (event: GuildMessageEvent) => void;

  // ===== 通知事件 =====
  "notice":               (event: FriendNoticeEvent | GroupNoticeEvent) => void;
  "notice.friend":        (event: FriendNoticeEvent) => void;
  "notice.friend.increase": (event: FriendIncreaseEvent) => void;
  "notice.friend.decrease": (event: FriendDecreaseEvent) => void;
  "notice.friend.recall":   (event: FriendRecallEvent) => void;
  "notice.friend.poke":     (event: FriendPokeEvent) => void;
  "notice.group":         (event: GroupNoticeEvent) => void;
  "notice.group.increase":  (event: MemberIncreaseEvent) => void;
  "notice.group.decrease":  (event: MemberDecreaseEvent) => void;
  "notice.group.recall":    (event: GroupRecallEvent) => void;
  "notice.group.admin":     (event: GroupAdminEvent) => void;
  "notice.group.ban":       (event: GroupMuteEvent) => void;
  "notice.group.sign":      (event: GroupSignEvent) => void;
  "notice.group.transfer":  (event: GroupTransferEvent) => void;
  "notice.group.poke":      (event: GroupPokeEvent) => void;

  // ===== 请求事件 =====
  "request":              (event: FriendRequestEvent | GroupRequestEvent | GroupInviteEvent) => void;
  "request.friend":       (event: FriendRequestEvent) => void;
  "request.friend.add":   (event: FriendRequestEvent) => void;
  "request.friend.single": (event: FriendRequestEvent) => void;
  "request.friend.invite": (event: GroupInviteEvent) => void;
  "request.group":        (event: GroupRequestEvent | GroupInviteEvent) => void;
  "request.group.add":    (event: GroupRequestEvent) => void;
  "request.group.invite": (event: GroupInviteEvent) => void;

  // ===== 系统事件 =====
  "system.login.qrcode":  (event: { image: Buffer; qrInfo: pb.Proto }) => void;
  "system.login.slider":  (event: { url: string }) => void;
  "system.login.device":  (event: { url: string; phone: string }) => void;
  "system.login.auth":    (event: { url: string; device: { ... } }) => void;
  "system.login.error":   (event: { code: LoginErrorCode | number; message: string }) => void;
  "system.online":        (event: undefined) => void;
  "system.offline.network": (event: { message: string }) => void;  // 自动重连
  "system.offline.kickoff": (event: { message: string }) => void;  // 被踢
  "system.offline":       (event?: { message: string }) => void;

  // ===== 同步事件 =====
  "sync.message":         (event: PrivateMessage) => void;
  "sync.read":            (event: { user_id: number; time: number } | { group_id: number; seq: number }) => void;
  "sync.read.private":    (event: { user_id: number; time: number }) => void;
  "sync.read.group":      (event: { group_id: number; seq: number }) => void;

  // ===== 内部事件 =====
  "internal.sso":         (cmd: string, payload: Buffer, seq: number) => void;
  "internal.input":       (event: { user_id: number; end: boolean }) => void;

  // ===== 其他 =====
  "send":                 (messageRet: MessageRet) => void;
}
```

### 事件数据结构

```typescript
// --- 消息事件 ---
interface MessageEvent {
  reply(content: Sendable, quote?: boolean): Promise<MessageRet>;
}
interface PrivateMessageEvent extends PrivateMessage, MessageEvent {
  friend: Friend;
}
interface GroupMessageEvent extends GroupMessage, MessageEvent {
  group: Group;
  member: Member;
  recall(): Promise<boolean>;
}
interface DiscussMessageEvent extends DiscussMessage, MessageEvent {
  discuss: Discuss;
}

// --- 消息返回值 ---
interface MessageRet {
  message_id: string;
  seq: number;
  rand: number;
  time: number;
}

// --- 请求事件 ---
interface RequestEvent {
  post_type: "request";
  user_id: number;
  nickname: string;
  flag: string;
  seq: number;
  time: number;
  approve(yes?: boolean): Promise<boolean>;  // 快速同意/拒绝
}
interface FriendRequestEvent extends RequestEvent {
  request_type: "friend";
  sub_type: "add" | "single";
  comment: string;
  source: string;
  age: number;
  sex: Gender;
}
interface GroupRequestEvent extends RequestEvent {
  request_type: "group";
  sub_type: "add";
  group_id: number;
  group_name: string;
  comment: string;
  inviter_id?: number;
}
interface GroupInviteEvent extends RequestEvent {
  request_type: "group";
  sub_type: "invite";
  group_id: number;
  group_name: string;
  role: GroupRole;
}

// --- 通知事件 ---
interface FriendNoticeEvent {
  post_type: "notice";
  notice_type: "friend";
  user_id: number;
  friend: Friend;
}
interface FriendIncreaseEvent extends FriendNoticeEvent { sub_type: "increase"; nickname: string; }
interface FriendDecreaseEvent extends FriendNoticeEvent { sub_type: "decrease"; nickname: string; }
interface FriendRecallEvent extends FriendNoticeEvent { sub_type: "recall"; operator_id: number; message_id: string; seq: number; rand: number; time: number; }
interface FriendPokeEvent extends FriendNoticeEvent { sub_type: "poke"; operator_id: number; target_id: number; action: string; suffix: string; }

interface GroupNoticeEvent {
  post_type: "notice";
  notice_type: "group";
  group_id: number;
  group: Group;
}
interface MemberIncreaseEvent extends GroupNoticeEvent { sub_type: "increase"; user_id: number; nickname: string; }
interface MemberDecreaseEvent extends GroupNoticeEvent { sub_type: "decrease"; operator_id: number; user_id: number; dismiss: boolean; member?: MemberInfo; }
interface GroupRecallEvent extends GroupNoticeEvent { sub_type: "recall"; user_id: number; operator_id: number; message_id: string; seq: number; rand: number; time: number; }
interface GroupPokeEvent extends GroupNoticeEvent { sub_type: "poke"; user_id: number; operator_id: number; target_id: number; action: string; suffix: string; }
interface GroupAdminEvent extends GroupNoticeEvent { sub_type: "admin"; user_id: number; set: boolean; }
interface GroupMuteEvent extends GroupNoticeEvent { sub_type: "ban"; operator_id: number; user_id: number; duration: number; nickname?: string; }
interface GroupTransferEvent extends GroupNoticeEvent { sub_type: "transfer"; operator_id: number; user_id: number; }
interface GroupSignEvent extends GroupNoticeEvent { sub_type: "sign"; user_id: number; nickname: string; sign_text: string; }
interface GroupReactionEvent extends GroupNoticeEvent { sub_type: "reaction"; user_id: number; id: string; type: number; set: boolean; seq: number; }
```

---

## 4. User / Friend — 用户与好友

### 4.1 User (基类)

```typescript
class User extends Contactable {
  readonly uin: number;                        // QQ号
  get user_id(): number;                       // uin别名
  get info(): FriendInfo | MemberInfo | undefined;
  get user_uid(): string;

  // --- 实例转换 ---
  asFriend(strict?: boolean): Friend;
  asMember(gid: number, strict?: boolean): Member;

  // --- 资料 ---
  getAvatarUrl(size?: 0 | 40 | 100 | 140): string;
  getSimpleInfo(): Promise<{ user_id: number; nickname: string; sex: Gender; age: number; area: string }>;
  getProfile(idsParse?): Promise<Record<string, any>>;
  getStatusInfo(usejce?: boolean): Promise<StatusInfo | null>;
  getAddFriendSetting(): Promise<number>;

  // --- 交互 ---
  thumbUp(times?: number): Promise<boolean>;   // 点赞
  sendMsg(content: Sendable, source?: Quotable): Promise<MessageRet>;
  recallMsg(msg: PrivateMessage): Promise<boolean>;
  recallMsg(msgid: string): Promise<boolean>;
  recallMsg(seq: number, rand: number, time: number): Promise<boolean>;
  getChatHistory(time?: number, cnt?: number): Promise<PrivateMessage[]>;
  markRead(time?: number): Promise<void>;

  // --- 请求处理 ---
  addFriendBack(seq: number, remark?: string): Promise<boolean>;
  setFriendReq(seq: number, yes?: boolean, remark?: string, block?: boolean): Promise<boolean>;
  setGroupReq(gid: number, seq: number, yes?: boolean, reason?: string, block?: boolean): Promise<boolean>;
  setGroupInvite(gid: number, seq: number, yes?: boolean, block?: boolean): Promise<boolean>;

  // --- 文件 ---
  getFileInfo(fid: string): Promise<Omit<FileElem, "type"> & Record<"url", string>>;
  getFileUrl(fid: string): Promise<string>;
}
```

### 4.2 Friend

```typescript
class Friend extends User {
  static as(this: Client, uin: number, strict?: boolean): Friend;

  get info(): FriendInfo | undefined;
  get nickname(): string | undefined;
  get sex(): Gender | undefined;
  get remark(): string | undefined;
  get class_id(): number | undefined;
  get class_name(): string | undefined;

  // --- 操作 ---
  setRemark(remark: string): Promise<void>;
  setClass(id: number): Promise<void>;
  poke(self?: boolean): Promise<boolean>;       // 戳一戳
  delete(block?: boolean): Promise<boolean>;    // 删除好友
  searchSameGroup(): Promise<any>;              // 查找共群

  // --- 文件 ---
  uploadFile(file: string | Buffer | File, name?: string, callback?: (pct: string) => void): Promise<Omit<FileElem, "type"> & Record<"url", string>>;
  sendFile(file: string | Buffer | File, filename?: string, callback?: (pct: string) => void): Promise<string>;
  recallFile(fid: string): Promise<boolean>;
  forwardFile(fid: string, group_id?: number, send?: boolean): Promise<string>;
}
```

---

## 5. Discuss / Group — 讨论组与群

### 5.1 Discuss

```typescript
class Discuss extends Contactable {
  readonly gid: number;
  static as(this: Client, gid: number): Discuss;
  get group_id(): number;                      // gid别名
  sendMsg(content: Sendable): Promise<MessageRet>;
}
```

### 5.2 Group

```typescript
class Group extends Discuss {
  private _info?;
  static as(this: Client, gid: number, strict?: boolean): Group;

  get info(): GroupInfo | undefined;
  get name(): string | undefined;               // 群名
  get is_owner(): boolean;                      // 我是否是群主
  get is_admin(): boolean;                      // 我是否是管理
  get all_muted(): boolean;                     // 是否全员禁言
  get mute_left(): number;                      // 我的禁言剩余
  readonly fs: Gfs;                             // 群文件系统

  // --- 成员 ---
  pickMember(uin: number, strict?: boolean): Member;
  getMemberMap(no_cache?: boolean): Promise<Map<number, MemberInfo>>;
  getMuteMemberList(): Promise<Array<{ uin: number | null; unMuteTime: string | null } | null>>;

  // --- 资料 ---
  getAvatarUrl(size?: 0 | 40 | 100 | 140, history?: number): string;
  renew(): Promise<GroupInfo>;
  setAvatar(file: ImageElem["file"]): Promise<void>;
  setName(name: string): Promise<boolean>;
  setRemark(remark?: string): Promise<void>;
  getShareJson(): Promise<any>;

  // --- 消息 ---
  sendMsg(content: Sendable, source?: Quotable, anony?: Omit<Anonymous, "flag"> | boolean): Promise<MessageRet>;
  recallMsg(msg: GroupMessage): Promise<boolean>;
  recallMsg(msgid: string): Promise<boolean>;
  recallMsg(seq: number, rand: number, pktnum?: number): Promise<boolean>;
  getChatHistory(seq?: number, cnt?: number): Promise<GroupMessage[]>;
  markRead(seq?: number): Promise<void>;
  getAtAllRemainder(): Promise<number>;         // @全体余量

  // --- 精华消息 ---
  addEssence(seq: number, rand: number): Promise<string>;
  removeEssence(seq: number, rand: number): Promise<string>;

  // --- 管理 ---
  muteAll(yes?: boolean): Promise<boolean>;     // 全员禁言
  allowAnony(yes?: boolean): Promise<boolean>;  // 允许匿名
  muteAnony(flag: string, duration?: number): Promise<void>;
  getAnonyInfo(): Promise<Omit<Anonymous, "flag">>;
  announce(content: string): Promise<boolean>;  // 发送公告
  invite(uin: number): Promise<boolean>;         // 邀请好友
  sign(): Promise<{ result: number }>;           // 打卡
  quit(): Promise<boolean>;                      // 退群/解散
  setAdmin(uin: number, yes?: boolean): Promise<boolean>;
  setTitle(uin: number, title?: string, duration?: number): Promise<boolean>;
  setCard(uin: number, card?: string): Promise<boolean>;
  kickMember(uin: number, msg?: string, block?: boolean): Promise<boolean>;
  muteMember(uin: number, duration?: number): Promise<boolean>;
  pokeMember(uin: number): Promise<boolean>;
  setMessageRateLimit(times: number): Promise<boolean>;
  setGroupJoinType(type: string, question?: string, answer?: string): Promise<boolean | undefined>;
  setScreenMemberMsg(member_id: number, isScreen?: boolean): Promise<boolean>;

  // --- 表情回应 ---
  setReaction(seq: number, id: string, type?: number): Promise<pb.Proto>;
  delReaction(seq: number, id: string, type?: number): Promise<pb.Proto>;

  // --- 文件 ---
  getFileInfo(fid: string): Promise<GfsFileStat | GfsDirStat>;
  getFileUrl(fid: string): Promise<string>;
  uploadFile(file: string | Buffer | File, pid?: string, name?: string, callback?: (pct: string) => void): Promise<GfsFileStat>;
  sendFile(file: string | Buffer | File, pid?: string, name?: string, callback?: (pct: string) => void): Promise<GfsFileStat>;
}
```

---

## 6. Member — 群成员

```typescript
class Member extends User {
  readonly gid: number;
  static as(this: Client, gid: number, uin: number, strict?: boolean): Member;

  get info(): MemberInfo | undefined;
  get group_id(): number;                       // gid别名
  get card(): string | undefined;               // 名片
  get title(): string | undefined;              // 头衔
  get is_friend(): boolean;                     // 是否是我好友
  get is_owner(): boolean;                      // 是否是群主
  get is_admin(): boolean;                      // 是否是管理
  get mute_left(): number;                      // 禁言剩余
  get group(): Group;                           // 所在群实例
  get update_time(): number;

  // --- 操作 ---
  renew(): Promise<MemberInfo>;
  setAdmin(yes?: boolean): Promise<boolean>;
  setTitle(title?: string, duration?: number): Promise<boolean>;
  setCard(card?: string): Promise<boolean>;
  kick(msg?: string, block?: boolean): Promise<boolean>;
  mute(duration?: number): Promise<boolean>;
  poke(): Promise<boolean>;
  setScreenMsg(isScreen?: boolean): Promise<boolean>;
  addFriend(comment?: string): Promise<boolean>;
}
```

---

## 7. Guild / Channel — 频道与子频道

### 7.1 GuildRole 枚举

```typescript
enum GuildRole {
  Member       = 1,   // 成员
  GuildAdmin   = 2,   // 频道管理员
  Owner        = 4,   // 频道主
  ChannelAdmin = 5,   // 子频道管理员
}
```

### 7.2 Guild

```typescript
class Guild {
  readonly c: Client;
  readonly guild_id: string;
  guild_name: string;
  channels: Map<string, Channel>;         // 子频道字典

  static as(this: Client, guild_id: string): Guild;

  sendMsg(channel_id: string, message: Sendable): Promise<GuildMessageRet>;
  getMemberList(): Promise<GuildMember[]>;
}
```

### 7.3 GuildMember

```typescript
interface GuildMember {
  tiny_id: string;     // 账号
  card: string;        // 名片
  nickname: string;    // 昵称
  role: GuildRole;     // 权限
  join_time: number;   // 加入时间
}
```

### 7.4 ChannelType / NotifyType 枚举

```typescript
enum ChannelType {
  Unknown = 0,
  Text    = 1,    // 文字频道
  Voice   = 2,    // 语音频道
  Live    = 5,    // 直播频道
  App     = 6,
  Forum   = 7,    // 论坛频道
}
enum NotifyType {
  Unknown      = 0,
  AllMessages  = 1,
  Nothing      = 2,
}
```

### 7.5 Channel

```typescript
class Channel {
  readonly guild: Guild;
  readonly channel_id: string;
  channel_name: string;
  channel_type: ChannelType;
  notify_type: NotifyType;

  get c(): Client;

  share(content: ShareContent, config?: ShareConfig): Promise<void>;
  sendMsg(content: Sendable): Promise<GuildMessageRet>;
  recallMsg(seq: number): Promise<boolean>;
}
```

---

## 8. Gfs — 群文件系统

```typescript
class Gfs {
  readonly gid: number;
  get group_id(): number;
  get group(): Group;
  get client(): Client;

  // --- 空间信息 ---
  df(): Promise<{ total: number; used: number; free: number; file_count: number; max_file_count: number }>;

  // --- 文件操作 ---
  stat(fid: string): Promise<GfsFileStat | GfsDirStat>;
  dir(pid?: string, start?: number, limit?: number): Promise<(GfsFileStat | GfsDirStat)[]>;  // 列出目录
  ls(pid?: string, start?: number, limit?: number): Promise<(GfsFileStat | GfsDirStat)[]>;  // dir别名
  mkdir(name: string): Promise<GfsDirStat>;
  rm(fid: string): Promise<void>;
  rename(fid: string, name: string): Promise<void>;
  mv(fid: string, pid: string): Promise<void>;

  // --- 上传/转发/下载 ---
  upload(file: string | Buffer | File, pid?: string, name?: string, callback?: (pct: string) => void, send?: boolean): Promise<GfsFileStat>;
  forward(stat: GfsFileStat, pid?: string, name?: string, send?: boolean): Promise<GfsFileStat>;
  forwardOfflineFile(fid: string | Object, name?: string, send?: boolean): Promise<GfsFileStat>;
  download(fid: string): Promise<Omit<FileElem, "type"> & { url: string }>;
}
```

### GfsBaseStat / GfsFileStat / GfsDirStat

```typescript
interface GfsBaseStat {
  fid: string;          // 文件/目录id
  pid: string;          // 父目录id
  name: string;
  user_id: number;
  create_time: number;
  modify_time: number;
  is_dir: boolean;
}
interface GfsFileStat extends GfsBaseStat {
  size: number;
  busid: number;
  md5: string;
  sha1: string;
  duration: number;
  download_times: number;
}
interface GfsDirStat extends GfsBaseStat {
  file_count: number;
}
```

---

## 9. Contactable — 抽象基类

所有可联络对象的基类（User, Discuss 都继承于此）：

```typescript
abstract class Contactable {
  protected c: Client;
  protected uin?: number;
  protected gid?: number;

  get target(): number;
  get dm(): boolean;                            // 是否私聊
  get client(): Client;

  uploadImages(imgs: Image[] | ImageElem[]): Promise<PromiseRejectedResult[]>;
  share(content: ShareContent | ShareElem, config?: ShareConfig): Promise<void>;
  uploadVideo(elem: VideoElem | BubbleElem): Promise<VideoElem | BubbleElem>;
  uploadPtt(elem: PttElem): Promise<PttElem>;
  makeForwardMsg(msglist: Forwardable[] | Forwardable, isNT?: boolean): Promise<JsonElem>;
  getForwardMsg(resid: string, fileName?: string, isNT?: boolean): Promise<ForwardMessage[]>;
  getPicUrl(elem: ImageElem): Promise<string | undefined>;
  getVideoUrl(elem: VideoElem | string, md5?: string | Buffer): Promise<string | null>;
  getPttUrl(elem: PttElem): Promise<string | null | undefined>;
  getNTPicRkey(): Promise<{ offNTPicRkey: string; groupNTPicRkey: string }>;
  // ... 更多 NT 相关 API
}
```

---

## 10. 消息系统

### 10.1 Message — 消息基类

```typescript
abstract class Message implements Quotable, Forwardable {
  protected client: Client;
  protected proto: pb.Proto;
  readonly parsed: Parser;

  user_id: number;          // 发送者
  user_uid: string;         // 发送者uid
  get nickname(): string;
  post_type: "message";
  nt: boolean;              // 是否NT版本
  time: number;             // 消息时间
  message: MessageElem[];   // 消息元素数组
  raw_message: string;      // 纯文本
  message_id: string;       // cqhttp消息id
  seq: number;              // 消息序号
  rand: number;             // 随机数
  msg_id: bigint;           // 消息id
  pktnum: number;
  source?: Quotable;        // 引用回复

  static deserialize(client: Client, serialized: Buffer, uin?: number, nt?: boolean): PrivateMessage | GroupMessage | DiscussMessage;
  static combine(msgs: Message[]): Message;
  serialize(): Buffer;
  toString(): string;
}
```

### 10.2 PrivateMessage

```typescript
class PrivateMessage extends Message {
  message_type: "private";
  sub_type: "friend" | "group" | "other" | "self";
  from_id: number;
  from_uid: string;
  to_id: number;
  to_uid: string;
  auto_reply: boolean;
  sender: {
    user_id: number;
    user_uid: string;
    nickname: string;
    group_id: number | undefined;
    discuss_id: number | undefined;
  };
}
```

### 10.3 GroupMessage

```typescript
class GroupMessage extends Message {
  message_type: "group";
  sub_type: "normal" | "anonymous";
  group_id: number;
  group_name: string;
  anonymous: Anonymous | null;
  atme: boolean;
  atall: boolean;
  sender: {
    user_id: number;
    user_uid: string;
    nickname: string;
    card: string;
    sex: Gender;
    age: number;
    area: string;
    level: number;
    role: GroupRole;
    title: string;
  };
}
```

### 10.4 DiscussMessage / ForwardMessage

```typescript
class DiscussMessage extends Message {
  message_type: "discuss";
  discuss_id: number;
  discuss_name: string;
  atme: boolean;
}

class ForwardMessage implements Forwardable {
  message_type: "private" | "group" | "discuss";
  user_id: number;
  user_uid?: string;
  nickname: string;
  group_id?: number;
  time: number;
  seq: number;
  message: MessageElem[];
  raw_message: string;
  static deserialize(client, serialized, nt?): ForwardMessage;
  serialize(): Buffer;
}
```

### 10.5 Anonymous

```typescript
interface Anonymous {
  enable: boolean;
  flag: string;
  id: number;
  id2: number;
  name: string;
  expire_time: number;
  color: string;
}
```

### 10.6 消息元素类型 (MessageElem)

```typescript
type MessageElem =
  | TextElem       // 文本
  | FaceElem       // 表情/小表情
  | ForumElem      // 论坛
  | BfaceElem      // 原创表情
  | MfaceElem      // 猜拳/骰子
  | ImageElem      // 图片
  | AtElem         // @提及
  | MiraiElem      // 特殊消息
  | ReplyElem      // 引用回复 (deprecated)
  | FlashElem      // 闪照
  | PttElem        // 语音
  | VideoElem      // 视频
  | BubbleElem     // 泡泡
  | JsonElem       // JSON
  | XmlElem        // XML
  | PokeElem       // 戳一戳
  | LocationElem   // 位置
  | ShareElem      // 分享
  | FileElem       // 文件
  | ForwardNodeElem // 转发节点
  | QuoteElem      // 引用回复
  | MarkdownElem   // Markdown
  | ButtonElem     // 按钮
  | LongMsgElem    // 长消息
  | MultiMsgElem;  // 合并转发

// 可组合发送的元素
type ChainElem = TextElem | FaceElem | BfaceElem | MfaceElem | ImageElem
               | AtElem | MiraiElem | ReplyElem | ForwardNodeElem
               | QuoteElem | MarkdownElem | ButtonElem;

// 可通过 sendMsg 发送的类型
type Sendable = string | MessageElem | (string | MessageElem)[];
```

### 10.7 `segment` 工厂 — 构造消息元素

```typescript
const segment = {
  long_msg(resid: string): LongMsgElem;
  text(text: string): TextElem;                      // @deprecated
  face(id: number, big?: boolean): FaceElem;          // 表情 0~324
  sface(id: number, text?: string): FaceElem;         // 小表情
  bface(file: string, text: string): BfaceElem;       // 原创表情
  rps(id?: number): MfaceElem;                        // 猜拳
  dice(id?: number): MfaceElem;                       // 骰子
  at(qq: number | "all" | string, text?: string, dummy?: boolean): AtElem;
  image(file: string | Buffer | Readable, cache?: boolean, timeout?: number, headers?: OutgoingHttpHeaders): ImageElem;
  flash(file: ImageElem["file"], cache?: boolean, timeout?: number, headers?: OutgoingHttpHeaders): FlashElem;
  record(file: string | Buffer, data?: Partial<Omit<PttElem, "type" | "file">>): PttElem;
  video(file: string | Buffer, data?: Partial<Omit<VideoElem, "type" | "file">>): VideoElem;
  bubble(file: string | Buffer, data?: Partial<Omit<BubbleElem, "type" | "file">>): BubbleElem;
  json(data: any): JsonElem;
  xml(data: string, id?: number): XmlElem;
  markdown(content: string, config?: MarkdownElem["config"]): MarkdownElem;
  button(content: ButtonElem["content"]): ButtonElem;
  mirai(data: string): MiraiElem;
  fake(user_id: number, message: Sendable, nickname?: string, time?: number): ForwardNodeElem;
  share(url: string, title: string, image?: string, content?: string, audio?: string): ShareElem;
  location(lat: number, lng: number, address: string, id?: string): LocationElem;
  poke(id: number): PokeElem;                         // id 0~6
  node(user_id: number, message: Sendable, nickname?: string, time?: number, seq?: number, rand?: number, preview?: string): ForwardNodeElem;
  multimsg(resid: string, filename: string, preview?: string[] | string, title?: string, content?: string, prompt?: string): MultiMsgElem;
  fromCqcode(str: string): MessageElem[];             // @deprecated
};
```

### 10.8 消息元素接口详情

```typescript
interface TextElem      { type: "text"; text: string; }
interface AtElem        { type: "at"; qq: number | "all"; id?: string | "all"; text?: string; dummy?: boolean; }
interface FaceElem      { type: "face" | "sface"; id: number; text?: string; big?: boolean; stickerId?: string; stickerType?: number; }
interface BfaceElem     { type: "bface"; file: string; text: string; }
interface MfaceElem     { type: "rps" | "dice"; id?: number; }
interface ImageElem     { type: "image"; file: string | Buffer | Readable; cache?: boolean; timeout?: number; headers?: OutgoingHttpHeaders; name?: string; url?: string; asface?: boolean; origin?: boolean; summary?: string; fid?: string | number; md5?: string; sha1?: string; height?: number; width?: number; size?: number; nt?: boolean; }
interface FlashElem     extends Omit<ImageElem, "type"> { type: "flash"; }
interface PttElem       { type: "record"; file: string | Buffer; url?: string; fid?: string; md5?: string; brief?: string; seconds?: number; transcode?: boolean; temp?: boolean; nt?: boolean; }
interface VideoElem     { type: "video"; file: string | Buffer; name?: string; fid?: string; md5?: string; height?: number; width?: number; size?: number; seconds?: number; temp?: boolean; nt?: boolean; }
interface BubbleElem    extends Omit<VideoElem, "type"> { type: "bubble"; }
interface FileElem      { type: "file"; file: string | Buffer; name?: string; fid?: string; md5?: string; size?: number; duration?: number; temp?: boolean; }
interface JsonElem      { type: "json"; data: any; }
interface XmlElem       { type: "xml"; data: string; id?: number; }
interface PokeElem      { type: "poke"; id: number; text?: string; }
interface LocationElem  { type: "location"; address: string; lat: number; lng: number; name?: string; id?: string; }
interface ShareElem     extends ShareContent { type: "share"; }
interface MarkdownElem  { type: "markdown"; content: string; config?: { unknown?: number; time: number; token: string; }; }
interface ButtonElem    { type: "button"; content: { appid: number; rows: { buttons: Button[] }[]; }; }
interface QuoteElem     extends Quotable { type: "quote"; }
interface ForwardNodeElem extends Forwardable { type: "node"; }
interface LongMsgElem   { type: "long_msg"; resid: string; }
interface MultiMsgElem  { type: "multimsg"; resid: string; filename: string; title?: string; content?: string; preview?: string[] | string; prompt?: string; compressed?: string; }
```

### 10.9 Quotable / Forwardable

```typescript
interface Quotable {
  user_id: number;
  time: number;
  seq: number;
  rand: number;        // 私聊必须
  message: Sendable;
}
interface Forwardable {
  user_id: number;
  message: Sendable;
  nickname?: string;
  time?: number;
  seq?: number;
  rand?: number;
  preview?: string;
}
```

---

## 11. BaseClient — 底层客户端

```typescript
class BaseClient extends Trapper {
  config: Required<Config>;
  nickname: string;
  QQNT: boolean;
  NTLogin: boolean;
  sign_type: string;
  apk: Apk;
  readonly device: Device;
  readonly sig: Sig;
  interval: number;             // 心跳间隔(秒)
  ssoInterval: number;
  emp_interval: number;         // token刷新间隔

  // --- 在线状态 ---
  isOnline(): boolean;
  logout(keepalive?: boolean): Promise<void>;
  terminate(): void;

  // --- 登录 ---
  login(password?: string | Buffer): Promise<void>;
  login(uin?: number, password?: string | Buffer): Promise<void>;
  tokenLogin(token?: Buffer, subcmd?: number): Promise<Buffer>;
  passwordLogin(uin: number, md5pass: Buffer): Promise<void>;
  fetchQrcode(): Promise<void>;
  qrcodeLogin(): Promise<void>;
  queryQrcodeResult(): Promise<{ retcode: number; uin: number | undefined; ... }>;
  submitSlider(ticket: string): Promise<void>;
  sendSmsCode(): Promise<void>;
  submitSmsCode(code: string): Promise<void>;
  ntPasswordLogin(md5pass: Buffer): Promise<void>;
  ntTokenLogin(refresh?: boolean): Promise<Buffer>;
  ntSubmitCaptcha(ticket: string, randStr: string): Promise<void>;

  // --- 连接 ---
  setRemoteServer(host?: string, port?: number): void;
  setSignServer(addr: string, extSign?): void;

  // --- 发包 ---
  sendUni(cmd: string, body: Uint8Array, timeout?: number, extra?): Promise<Buffer>;
  sendOidb(cmd: string, body: Uint8Array | object, timeout?, extra?): Promise<Buffer>;
  sendOidbSvcTrpcTcp(cmd: string | object[], body: Uint8Array | object, extra?): Promise<pb.Proto>;
  writeUni(cmd: string, body: Uint8Array, seq?, extra?): Promise<void>;
  sendMergeUni(list: { cmd: string; body: Uint8Array; seq?: number; needResp?: boolean }[], timeout?, extra?): Promise<unknown>;
  sendPacket(body: Uint8Array | Buffer, timeout?, seq?, build?): Promise<Buffer>;

  // --- 签名服务器 ---
  getSign(cmd: string, seq: number, body: Buffer): Promise<Buffer>;
  getT544(cmd: string): Promise<Buffer>;
  apiPing(pathname: string): Promise<{ code: number }>;
  requestSignToken(): Promise<never[]>;

  // --- 其他 ---
  getApkInfo(platform: Platform, ver?: string): Apk;
  getApkInfoList(platform: Platform): Apk[];
  switchQQVer(ver?: string, force?: boolean): Promise<boolean>;
  refreshToken(force?: boolean): Promise<boolean | undefined>;
  register(logout?, reflush?): Promise<number>;
  sendHeartbeat(): Promise<unknown>;
}

// BaseClient 内部事件 (on)
interface BaseClient {
  on(name: "internal.qrcode",   listener: (this, qrcode: Buffer, qrInfo: pb.Proto) => void): ToDispose<this>;
  on(name: "internal.slider",   listener: (this, url: string) => void): ToDispose<this>;
  on(name: "internal.verify",   listener: (this, url: string, phone?: string) => void): ToDispose<this>;
  on(name: "internal.auth",     listener: (this, info: { title: string; content: string; jump?: { word: string; url: string } }) => void): ToDispose<this>;
  on(name: "internal.error.token",   listener: (this) => void): ToDispose<this>;
  on(name: "internal.error.network", listener: (this, code: number, message: string) => void): ToDispose<this>;
  on(name: "internal.error.login",   listener: (this, code: number, message: string) => void): ToDispose<this>;
  on(name: "internal.error.qrcode",  listener: (this, code: QrcodeResult, message: string) => void): ToDispose<this>;
  on(name: "internal.online",   listener: (this, token: Buffer, nickname: string) => void): ToDispose<this>;
  on(name: "internal.token",    listener: (this, token: Buffer) => void): ToDispose<this>;
  on(name: "internal.offline",  listener: (this, reason: string) => void): ToDispose<this>;
  on(name: "internal.kickoff",  listener: (this, reason: string) => void): ToDispose<this>;
  on(name: "internal.sso",      listener: (this, cmd: string, payload: Buffer, seq: number) => void): ToDispose<this>;
  on(name: "internal.verbose",  listener: (this, verbose, level: VerboseLevel) => void): ToDispose<this>;
}
```

---

## 12. 数据实体

```typescript
interface StrangerInfo {
  user_id: number;
  nickname: string;
}
interface FriendInfo extends StrangerInfo {
  sex: Gender;
  remark: string;
  class_id: number;
  user_uid: string;
}
interface GroupInfo {
  group_id: number;
  group_name: string;
  member_count: number;
  max_member_count: number;
  owner_id: number;
  admin_flag: boolean;
  last_join_time: number;
  last_sent_time?: number;
  shutup_time_whole: number;
  shutup_time_me: number;
  create_time?: number;
  grade?: number;
  max_admin_count?: number;
  active_member_count?: number;
  update_time: number;
}
interface MemberInfo {
  group_id: number;
  user_id: number;
  nickname: string;
  sex?: Gender;
  card: string;
  age?: number;
  area?: string;
  join_time: number;
  last_sent_time: number;
  level: number;
  rank?: string;
  role: GroupRole;       // "owner" | "admin" | "member"
  title: string;
  title_expire_time: number;
  shutup_time: number;
  update_time: number;
  user_uid: string;
}
```

---

## 13. 枚举与类型常量

### OnlineStatus

```typescript
enum OnlineStatus {
  Offline     = 0,
  Online      = 11,
  Absent      = 31,     // 离开
  Invisible   = 41,     // 隐身
  Busy        = 50,
  Qme         = 60,
  DontDisturb = 70,     // 请勿打扰
}
```

### Platform (登录设备)

```typescript
enum Platform {
  Android = 1,     // 安卓手机
  aPad    = 2,     // 安卓平板
  Watch   = 3,     // 安卓手表
  iMac    = 4,     // MacOS
  iPad    = 5,
  Tim     = 6,
  Custom  = 7,
}
```

### ErrorCode / LoginErrorCode

```typescript
enum ErrorCode {
  ClientNotOnline     = -1,
  PacketTimeout       = -2,
  UserNotExists       = -10,
  GroupNotJoined      = -20,
  MemberNotExists     = -30,
  MessageBuilderError = -60,
  RiskMessageError    = -70,
  SensitiveWordsError = -80,
  SignApiError        = -90,
  HighwayTimeout      = -110,
  HighwayNetworkError = -120,
  NoUploadChannel     = -130,
  HighwayFileTypeError = -140,
  UnsafeFile          = -150,
  OfflineFileNotExists = -160,
  GroupFileNotExists  = -170,
  FFmpegVideoThumbError = -210,
  FFmpegPttTransError = -220,
}
enum LoginErrorCode {
  WrongPassword  = 1,
  AccountFrozen  = 40,
  TooManySms     = 162,
  WrongSmsCode   = 163,
  WrongTicket    = 237,
}
```

### Gender / GroupRole

```typescript
type Gender = "male" | "female" | "unknown";
type GroupRole = "owner" | "admin" | "member";
```

---

## 14. 其他类型

### ShareContent / ShareConfig

```typescript
interface ShareContent {
  url: string;              // 跳转地址 (必须有)
  title: string;            // 分享标题
  summary?: string;         // 分享描述
  content?: string;         // 列表显示文字
  image?: string;           // 预览图URL
  audio?: string;           // 分享音频地址
  config?: ShareConfig;
}
interface ShareConfig {
  appid: number;
  appname?: string;
  appsign?: string;
}
```

### Proto (protobuf)

```typescript
interface Encodable { [tag: number]: any; }
class Proto implements Encodable {
  get length(): number;
  constructor(encoded: Buffer, decoded?: Proto);
  checkTag(...tags: number[]): boolean;
  toString(): string;
  toHex(): string;
  toBase64(): string;
  toBuffer(): Buffer;
  toJSONString(replacer?, space?): string;
  toJSON(convertBigInt?): any;
}
// 编解码
function encode(obj: Encodable): Buffer;
function decode(encoded: Buffer): Proto;
```

### Domain (Cookie域名)

```typescript
type Domain = "aq.qq.com" | "buluo.qq.com" | "connect.qq.com" | "docs.qq.com"
            | "game.qq.com" | "gamecenter.qq.com" | "haoma.qq.com" | "id.qq.com"
            | "kg.qq.com" | "mail.qq.com" | "mma.qq.com" | "office.qq.com"
            | "openmobile.qq.com" | "qqweb.qq.com" | "qun.qq.com" | "qzone.qq.com"
            | "ti.qq.com" | "v.qq.com" | "vip.qq.com" | "y.qq.com" | "";
```

---

## 15. 工具函数 (common)

```typescript
function uuid(): string;
function md5Stream(readable: stream.Readable): Promise<Buffer>;
function shaStream(readable: stream.Readable): Promise<Buffer>;
function fileHash(filepath: string): Promise<[Buffer, Buffer]>;  // [MD5, SHA1]
function code2uin(code: number): number;      // 群号 → uin
function uin2code(uin: number): number;       // uin → 群号
function parseFunString(buf: Buffer): string;  // 解析彩色群名片
function escapeXml(str: string): string;
const TMP_DIR: string;                        // 系统临时目录
const MAX_UPLOAD_SIZE = 104857600;            // 100MB
```

### Message ID 工具函数

```typescript
function genDmMessageId(uin: number, seq: number, rand: number, time: number, flag?: number): string;
function parseDmMessageId(msgid: string): { user_id: number; seq: number; rand: number; time: number; flag: number };
function genGroupMessageId(gid: number, uin: number, seq: number, rand: number, time: number, pktnum?: number): string;
function parseGroupMessageId(msgid: string): { group_id: number; user_id: number; seq: number; rand: number; time: number; pktnum: number };
function getGroupImageUrl(md5: string): string;
function parseImageFileParam(file: string): { md5: string; sha1: string; size: number; width: number; height: number; ext: string };
```

---

## 16. OcrResult

```typescript
class OcrResult {
  language: string;
  wordslist: Array<{
    words: string;
    confidence: number;
    polygon: Array<{ x: number; y: number }>;
  }>;
  toString(): string;
}
```

---

## 17. Highway 上传

```typescript
enum CmdID {
  DmImage     = 1,
  GroupImage  = 2,
  ShortVideo  = 25,
  DmPtt       = 26,
  MultiMsg    = 27,
  GroupPtt    = 29,
  OfflineFile = 69,
  GroupFile   = 71,
  Ocr         = 76,
  NTDmVideo   = 1001,
  NTDmImage   = 1003,
  NTGroupImage = 1004,
  NTGroupVideo = 1005,
  NTDmPtt     = 1008,
  NTGroupPtt  = 1008,
}
interface HighwayUploadExt {
  cmdid: CmdID;
  size: number;
  md5: Buffer;
  ticket?: Buffer;
  ext?: Uint8Array;
  encrypt?: boolean;
  callback?: (percentage: string) => void;
  timeout?: number;
}
function highwayUpload(this: Client, readable: stream.Readable, obj: HighwayUploadExt, ip?, port?): Promise<pb.Proto>;
```

---

本 API 参考涵盖了 icqq v1.10.18 的全部公开 API 类型定义。所有文件均位于 `lib/` 目录下，对应的 `.d.ts` 文件作为类型声明，`.mjs` 为 ESM 入口，`.js` 为 CJS 入口。
