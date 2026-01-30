"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitGroupNoticeEvent = emitGroupNoticeEvent;
exports.onlinePushListener = onlinePushListener;
exports.onlinePushTransListener = onlinePushTransListener;
exports.ntMsgListener = ntMsgListener;
exports.dmMsgSyncListener = dmMsgSyncListener;
exports.groupMsgListener = groupMsgListener;
exports.discussMsgListener = discussMsgListener;
exports.syncPushListener = syncPushListener;
exports.pushNotify = pushNotify;
const core_1 = require("../core");
const common_1 = require("../common");
const message_1 = require("../message");
const protobuf_1 = require("../core/protobuf");
const internal_1 = require("./internal");
const pbgetmsg_1 = require("./pbgetmsg");
const sysmsg_1 = require("./sysmsg");
/** OnlinePush回执 */
function handleOnlinePush(svrip, seq, items = []) {
    const resp = core_1.jce.encodeStruct([this.uin, items, svrip & 0xffffffff, null, 0]);
    const body = core_1.jce.encodeWrapper({ resp }, "OnlinePush", "SvcRespPushMsg", seq);
    this.writeUni("OnlinePush.RespPush", body);
}
const statuslist = [
    null,
    common_1.OnlineStatus.Online,
    null,
    common_1.OnlineStatus.Absent,
    common_1.OnlineStatus.Invisible,
    common_1.OnlineStatus.Busy,
    common_1.OnlineStatus.Qme,
    common_1.OnlineStatus.DontDisturb,
];
const sub0x27 = {
    0: function (data) {
        //add
        this.classes.set(data[3][1], String(data[3][3]));
    },
    1: function (data) {
        //delete
        this.classes.delete(data[4][1]);
    },
    2: function (data) {
        //rename
        this.classes.set(data[5][1], String(data[5][2]));
    },
    4: function (data) {
        //move
        const arr = Array.isArray(data[7][1]) ? data[7][1] : [data[7][1]];
        for (let v of arr)
            this.fl.get(v[1]).class_id = v[3];
    },
    80: function (data) {
        const o = data[12];
        const gid = o[3];
        if (!o[4])
            return;
        this.gl.get(gid).group_name = String(o[2][2]);
    },
    5: function (data) {
        const user_id = data[14][1];
        const nickname = this.fl.get(user_id)?.nickname || "";
        this.fl.delete(user_id);
        this.logger.info(`更新了好友列表，删除了好友 ${user_id}(${nickname})`);
        return {
            sub_type: "decrease",
            user_id,
            nickname,
        };
    },
    20: function (data) {
        // 20002昵称 20009性别 20031生日 23109农历生日 20019说明 20032地区 24002故乡 27372在线状态
        const uin = data[8][1];
        let o = data[8][2];
        if (Array.isArray(o))
            o = o[0];
        let key, value;
        if (o[1] === 20002) {
            key = "nickname";
            value = String(o[2]);
            this.fl.get(uin).nickname = value;
        }
        else if (o[1] === 20009) {
            key = "sex";
            value = ["unknown", "male", "female"][o[2].toBuffer()[0]];
        }
        else if (o[1] === 20031) {
            key = "age";
            value = new Date().getFullYear() - o[2].toBuffer().readUInt16BE();
        }
        else if (o[1] === 27372 && uin === this.uin) {
            const value = o[2].toBuffer().readUint32LE();
            const status = value >> 24;
            this.status = statuslist[status] || 11;
            this.em("internal.onlineStatusChange", { status: this.status });
            return;
        }
        else {
            return;
        }
        if (uin === this.uin)
            this[key] = value;
    },
    40: function (data) {
        const o = data[9][1], uin = o[2];
        if (o[1] > 0)
            return; //0好友备注 1群备注
        this.fl.get(uin).remark = String(o[3]);
    },
};
// 好友事件解析
const push528 = {
    0x8a: function (buf) {
        let data = core_1.pb.decode(buf)[1];
        if (Array.isArray(data))
            data = data[0];
        let user_id = data[1], operator_id = data[1], flag = 0;
        if (user_id === this.uin) {
            user_id = data[2];
            flag = 1;
        }
        return {
            sub_type: "recall",
            message_id: (0, message_1.genDmMessageId)(user_id, data[3], data[6], data[5], flag),
            operator_id,
            user_id, //永远指向对方
            seq: data[3],
            rand: data[6],
            time: data[5],
        };
    },
    0x8b: function (buf) {
        return push528[0x8a].call(this, buf);
    },
    0xb3: function (buf) {
        const data = core_1.pb.decode(buf)[2];
        const user_id = data[1], nickname = String(data[5]);
        this.fl.set(user_id, {
            user_id: user_id,
            nickname,
            sex: "unknown",
            remark: nickname,
            class_id: data[7],
            user_uid: "", //getuid ?
        });
        this.sl.delete(user_id);
        this.logger.info(`更新了好友列表，新增了好友 ${user_id}(${nickname})`);
        return {
            sub_type: "increase",
            user_id,
            nickname,
        };
    },
    0xd4: function (buf) {
        const gid = core_1.pb.decode(buf)[1];
        this.pickGroup(gid).renew().catch(common_1.NOOP);
    },
    0x27: function (buf) {
        let data = core_1.pb.decode(buf)[1];
        if (Array.isArray(data))
            data = data[0];
        return sub0x27[data[2]]?.call(this, data);
    },
    0x122: function (buf) {
        const data = core_1.pb.decode(buf);
        const e = parsePoke(data);
        if (e.action) {
            e.operator_id = e.operator_id || this.uin;
            e.target_id = e.target_id || this.uin;
            return Object.assign(e, { sub_type: "poke" });
        }
    },
    0x115: function (buf) {
        const data = core_1.pb.decode(buf);
        const user_id = data[1];
        const end = data[3][4] === 2;
        this.emit("internal.input", { user_id, end });
    },
};
function parsePoke(data) {
    if (!data?.length || !data.checkTag(7))
        return {};
    let target_id = 0, operator_id = 0, action = "", suffix = "";
    let o;
    for (o of Array.isArray(data[7]) ? data[7] : [data[7]]) {
        if (!o.checkTag(1, 2))
            continue;
        const name = String(o[1]), val = String(o[2]);
        switch (name) {
            case "action_str":
            case "alt_str1":
                action = action || val;
                break;
            case "uin_str1":
                operator_id = parseInt(val);
                break;
            case "uin_str2":
                target_id = parseInt(val);
                break;
            case "suffix_str":
                suffix = val;
                break;
        }
    }
    return { target_id, operator_id, action, suffix };
}
function parseSign(data) {
    if (!data?.length || !data.checkTag(7))
        return {};
    let user_id = this.uin, nickname = "", sign_text = "";
    for (let o of Array.isArray(data[7]) ? data[7] : [data[7]]) {
        if (!o.checkTag(1, 2))
            continue;
        const name = String(o[1]), val = String(o[2]);
        switch (name) {
            case "user_sign":
                sign_text = sign_text || val;
                break;
            case "mqq_uin":
                user_id = parseInt(val);
                break;
            case "mqq_nick":
                nickname = val;
                break;
        }
    }
    return { user_id, nickname, sign_text };
}
// 群事件解析
const push732 = {
    0x0c: function (gid, buf) {
        const operator_id = buf.readUInt32BE(6);
        const user_id = buf.readUInt32BE(16);
        let duration = buf.readUInt32BE(20);
        try {
            if (user_id === 0) {
                duration = duration ? 0xffffffff : 0;
                this.gl.get(gid).shutup_time_whole = duration;
            }
            else if (user_id === this.uin)
                this.gl.get(gid).shutup_time_me = duration ? (0, common_1.timestamp)() + duration : 0;
            this.gml.get(gid).get(user_id).shutup_time = duration
                ? (0, common_1.timestamp)() + duration
                : 0;
        }
        catch { }
        this.logger.info(`用户${user_id}在群${gid}被禁言${duration}秒`);
        return {
            sub_type: "ban",
            operator_id,
            user_id,
            duration,
        };
    },
    0x11: function (gid, buf) {
        const data = core_1.pb.decode(buf.slice(7))[11];
        const operator_id = data[1];
        const msg = Array.isArray(data[3]) ? data[3][0] : data[3];
        const user_id = msg[6];
        const message_id = (0, message_1.genGroupMessageId)(gid, user_id, msg[1], msg[3], msg[2], Array.isArray(data[3]) ? data[3].length : 1);
        return {
            sub_type: "recall",
            user_id,
            operator_id,
            message_id,
            seq: msg[1],
            rand: msg[3],
            time: msg[2],
        };
    },
    0x14: function (gid, buf) {
        const data = core_1.pb.decode(buf.slice(7))[26];
        let e = parsePoke(data);
        if (e.action) {
            e.operator_id = e.operator_id || this.uin;
            e.target_id = e.target_id || this.uin;
            return Object.assign(e, {
                sub_type: "poke",
                /** @deprecated */
                user_id: e.target_id,
            });
        }
        const sign = { gid };
        Object.assign(sign, parseSign.call(this, data));
        if (sign.sign_text)
            return {
                sub_type: "sign",
                ...sign,
            };
    },
    0x0e: function (gid, buf) {
        if (buf[5] !== 1)
            return;
        const duration = buf.readInt32BE(10);
        if (buf[14] !== 0) {
            const nickname = String(buf.slice(15, 15 + buf[14]));
            const operator_id = buf.readUInt32BE(6);
            this.logger.info(`匿名用户${nickname}在群${gid}被禁言${duration}秒`);
            return {
                sub_type: "ban",
                operator_id,
                user_id: 80000000,
                nickname,
                duration,
            };
        }
    },
};
function emitFriendNoticeEvent(c, uin, e) {
    if (!e)
        return;
    const name = "notice.friend." + e.sub_type;
    const f = c.pickFriend(uin);
    const event = Object.assign({
        post_type: "notice",
        notice_type: "friend",
        user_id: uin,
        friend: f,
    }, e);
    c.em(name, event);
}
function emitGroupNoticeEvent(c, gid, e) {
    if (!e)
        return;
    const name = "notice.group." + e.sub_type;
    const group = c.pickGroup(gid);
    const event = Object.assign({
        post_type: "notice",
        notice_type: "group",
        group_id: gid,
        group: group,
    }, e);
    c.em(name, event);
}
function onlinePushListener(payload, seq) {
    const nested = core_1.jce.decodeWrapper(payload);
    const list = nested[2], v = list[0];
    const rubbish = core_1.jce.encodeNested([this.uin, v[1], v[3], v[8], 0, 0, 0, 0, 0, 0, 0]);
    handleOnlinePush.call(this, nested[3], seq, [rubbish]);
    if (!this._sync_cookie && !this.useQQNT)
        return;
    if (v[2] === 528) {
        const uin = v[0];
        const nested = core_1.jce.decode(v[6]);
        const type = nested[0], buf = nested[10];
        if (!this.useQQNT)
            emitFriendNoticeEvent(this, uin, push528[type]?.call(this, buf));
        if (core_1.pb.decode(buf)[1]?.[2] == 214) {
            /** 214上报 */
            const req = core_1.jce.encodeStruct([this.uin, this.device.android_id, 0]);
            const servant = "VIP.CustomOnlineStatusServer.CustomOnlineStatusObj";
            const func = "GetCustomOnlineStatus";
            const body = core_1.jce.encodeWrapper({ req }, servant, func);
            this.writeUni(`VipCustom.${func}`, body);
        }
    }
    else if (v[2] === 732) {
        const gid = v[6].readUInt32BE();
        const type = v[6][4];
        if (!this.useQQNT)
            emitGroupNoticeEvent(this, gid, push732[type]?.call(this, gid, v[6]));
    }
}
function onlinePushTransListener(payload, seq) {
    const proto = core_1.pb.decode(payload);
    handleOnlinePush.call(this, proto[11], seq);
    if (!this._sync_cookie || this.useQQNT)
        return;
    const buf = proto[10].toBuffer();
    const gid = buf.readUInt32BE();
    if (proto[3] === 44) {
        if (buf[5] === 0 || buf[5] === 1) {
            const user_id = buf.readUInt32BE(6);
            const set = buf[10] > 0;
            this.logger.info(`群${gid}设置管理员${user_id}: ` + set);
            emitGroupNoticeEvent(this, gid, {
                sub_type: "admin",
                user_id,
                set,
            });
            if (user_id === this.uin)
                this.gl.get(gid).admin_flag = set;
            this.gml.get(gid).get(user_id).role = set ? "admin" : "member";
        }
        else if (buf[5] === 0xff) {
            const operator_id = buf.readUInt32BE(6);
            const user_id = buf.readUInt32BE(10);
            this.logger.info(`群${gid}被转让给` + user_id);
            emitGroupNoticeEvent(this, gid, {
                sub_type: "transfer",
                operator_id,
                user_id,
            });
            this.gl.get(gid).owner_id = user_id;
            this.gml.get(gid).get(user_id).role = "owner";
            this.gml.get(gid).get(operator_id).role = "member";
        }
    }
    else if (proto[3] === 34) {
        const user_id = buf.readUInt32BE(5);
        let operator_id, dismiss = false;
        let member = this.gml.get(gid)?.get(user_id);
        if (buf[9] === 0x82 || buf[9] === 0x2) {
            operator_id = user_id;
            this.gml.get(gid)?.delete(user_id);
            this.logger.info(`${user_id}离开了群${gid}`);
        }
        else {
            operator_id = buf.readUInt32BE(10);
            if (buf[9] === 0x01 || buf[9] === 0x81)
                dismiss = true;
            if (user_id === this.uin) {
                this.gl.delete(gid);
                this.gml.delete(gid);
                this.logger.info(`更新了群列表，删除了群：${gid}`);
            }
            else {
                this.gml.get(gid)?.delete(user_id);
                this.logger.info(`${user_id}离开了群${gid}`);
            }
        }
        emitGroupNoticeEvent(this, gid, {
            sub_type: "decrease",
            user_id,
            operator_id,
            dismiss,
            member,
        });
        this.gl.get(gid).member_count--;
    }
}
function ntMsgListener(payload, seq) {
    const proto = core_1.pb.decode(payload);
    if (proto[4])
        ssoPushAck.call(this, proto[4]);
    const type = proto[1][2][1];
    const sub_type = proto[1][2][2];
    pushNotify.call(this, type);
    switch (type) {
        case 33:
        case 34:
        case 38:
        case 44:
        case 85: {
            const gid = (0, common_1.uin2code)(proto[1][1][1]);
            return ntGroupEvent.call(this, gid, type, proto[1][3][2]);
        }
        case 82: {
            return groupMsgListener.call(this, payload, seq, true);
        }
        case 529:
        case 141:
        case 166: {
            return privateMsgListener.call(this, proto[1].toBuffer(), seq, true);
        }
        case 528: {
            const uin = proto[1][1][1];
            return ntPush528.call(this, uin, sub_type, proto[1][3]);
        }
        case 732: {
            const gid = (0, common_1.uin2code)(proto[1][1][1]);
            return ntPush732.call(this, gid, sub_type, proto[1][3]);
        }
        default:
            if (["trace", "debug"].includes(this.config.log_level))
                this.logger.debug(`不支持的消息类型：${type},${sub_type},${payload?.length ? `${payload.toString("hex")},${core_1.pb.decode(payload).toJSONString(undefined, 1)}` : payload}`);
    }
}
async function ntGroupEvent(gid, type, proto) {
    let event;
    try {
        switch (type) {
            case 33: {
                const user_uid = String(proto[3]);
                const user_id = await internal_1.uid2uin.call(this, user_uid, gid);
                let nickname = "";
                const g = this.pickGroup(gid);
                if (user_id === this.uin) {
                    nickname = this.nickname;
                    await g.renew().catch(common_1.NOOP);
                    this.config.cache_group_member && g.getMemberMap();
                    this.logger.info(`更新了群列表，新增了群：${gid}`);
                }
                else {
                    try {
                        g.info.member_count++;
                        g.info.last_join_time = (0, common_1.timestamp)();
                    }
                    catch { }
                    this.config.cache_group_member &&
                        (await g.pickMember(user_id).renew().catch(common_1.NOOP));
                    nickname = g.pickMember(user_id).card || "";
                    this.logger.info(`${user_id}(${nickname}) 加入了群 ${gid}`);
                }
                event = {
                    sub_type: "increase",
                    user_id,
                    nickname,
                };
                break;
            }
            case 34: {
                const operator_uid = proto[5]?.[1] ? String(proto[5][1][1]) : "", user_uid = String(proto[3]);
                const [operator_id, user_id] = await internal_1.uid2uins.call(this, [operator_uid, user_uid], gid);
                const dismiss = [1, 129].includes(proto[4]);
                let member = this.gml.get(gid)?.get(user_id);
                if (user_id === this.uin) {
                    this.gl.delete(gid);
                    this.gml.delete(gid);
                    this.logger.info(`更新了群列表，删除了群：${gid}`);
                }
                else {
                    this.logger.info(`${user_id}离开了群${gid}`);
                    try {
                        this.gml.get(gid)?.delete(user_id);
                        this.gl.get(gid).member_count--;
                    }
                    catch { }
                }
                event = {
                    sub_type: "decrease",
                    user_id,
                    operator_id,
                    dismiss,
                    member,
                };
                break;
            }
            case 38:
            case 85: {
                const user_id = this.uin;
                const nickname = this.nickname;
                const g = this.pickGroup(gid);
                await g.renew().catch(common_1.NOOP);
                this.config.cache_group_member && g.getMemberMap();
                this.logger.info(`更新了群列表，新增了群：${gid}`);
                event = {
                    sub_type: "increase",
                    user_id,
                    nickname,
                };
                break;
            }
            case 44: {
                if (proto[3] === 0 || proto[3] === 1) {
                    const data = proto[4][proto[3] === 0 ? 1 : 2];
                    const user_uid = String(data[1]);
                    const user_id = await internal_1.uid2uin.call(this, user_uid, gid);
                    const set = data[2] === 1;
                    this.logger.info(`群${gid}设置管理员${user_id}: ` + set);
                    try {
                        if (user_id === this.uin)
                            this.gl.get(gid).admin_flag = set;
                        this.gml.get(gid).get(user_id).role = set ? "admin" : "member";
                    }
                    catch { }
                    event = {
                        sub_type: "admin",
                        user_id,
                        set,
                    };
                }
                else if (proto[3] === 0xff) {
                    const operator_uid = String(proto[4][3][1]), user_uid = String(proto[4][3][2]);
                    const [operator_id, user_id] = await internal_1.uid2uins.call(this, [operator_uid, user_uid], gid);
                    this.logger.info(`群${gid}被转让给` + user_id);
                    try {
                        this.gl.get(gid).owner_id = user_id;
                        this.gml.get(gid).get(user_id).role = "owner";
                        this.gml.get(gid).get(operator_id).role = "member";
                    }
                    catch { }
                    event = {
                        sub_type: "transfer",
                        operator_id,
                        user_id,
                    };
                }
                break;
            }
            default:
                if (["trace", "debug"].includes(this.config.log_level))
                    this.logger.debug(`不支持的群事件：${type},${proto.toHex()},${proto instanceof protobuf_1.Proto ? `${proto.toJSONString(undefined, 1)}` : proto}`);
        }
    }
    catch (err) {
        this.logger.error(err);
        this.logger.error(`事件处理异常：${type},${proto instanceof protobuf_1.Proto ? proto.toHex() : proto}`);
    }
    if (event)
        emitGroupNoticeEvent(this, gid, event);
}
async function ntPush528(uin, sub_type, proto) {
    let event;
    try {
        switch (sub_type) {
            case 0x8: {
                let data = proto[2][1];
                if (Array.isArray(data))
                    data = data[0];
                this.em("sync.read.private", {
                    user_id: await internal_1.uid2uin.call(this, String(data[1])),
                    timestamp: data[2],
                });
                break;
            }
            case 0x27: {
                event = await ntSub0x27.call(this, uin, proto[2]);
                break;
            }
            case 0x8a:
            case 0x8b: {
                let data = proto[2][1];
                if (Array.isArray(data))
                    data = data[0];
                const operator_uid = String(data[1]), user_uid = String(data[2]);
                const uins = await internal_1.uid2uins.call(this, [operator_uid, user_uid]);
                let user_id = uins[0], operator_id = uins[0], flag = 0;
                if (user_id === this.uin) {
                    user_id = uins[1];
                    flag = 1;
                }
                event = {
                    sub_type: "recall",
                    message_id: (0, message_1.genDmMessageId)(user_id, data[3], data[6], data[5], flag),
                    operator_id,
                    user_id, //永远指向对方
                    seq: data[3],
                    rand: data[6],
                    time: data[5],
                };
                break;
            }
            case 0xb3: {
                const data = proto[2][2];
                const user_uid = String(data[1]), nickname = String(data[5]);
                const user_id = await internal_1.uid2uin.call(this, user_uid);
                if (typeof user_id === "number") {
                    this.fl.set(user_id, {
                        user_id: user_id,
                        nickname,
                        sex: "unknown",
                        remark: nickname,
                        class_id: data[7],
                        user_uid: user_uid || "",
                    });
                    this.sl.delete(user_id);
                }
                else {
                    this.reloadFriendList();
                }
                this.logger.info(`更新了好友列表，新增了好友 ${user_id}(${nickname})`);
                event = {
                    sub_type: "increase",
                    user_id,
                    nickname,
                };
                break;
            }
            case 0xd4: {
                this.logger.debug(`[push528]${sub_type},${proto instanceof protobuf_1.Proto ? proto.toHex() : proto}`);
                const gid = proto[2];
                this.pickGroup(gid).renew().catch(common_1.NOOP);
                break;
            }
            case 0x122: {
                if (!proto || !proto[2])
                    break;
                const data = proto[2];
                const e = parsePoke(data);
                if (e.action) {
                    e.operator_id = e.operator_id || this.uin;
                    e.target_id = e.target_id || this.uin;
                    event = Object.assign(e, { sub_type: "poke" });
                }
                break;
            }
            case 0x115: {
                const data = proto[2];
                const user_uid = String(data[1]);
                const user_id = await internal_1.uid2uin.call(this, user_uid);
                const end = data[3][4] === 2;
                this.emit("internal.input", { user_id, end });
                break;
            }
            default:
                if (["trace", "debug"].includes(this.config.log_level))
                    this.logger.debug(`[push528]不支持的事件：${sub_type},${proto instanceof protobuf_1.Proto ? `${proto.toHex()},${proto.toJSONString(undefined, 1)}` : proto}`);
        }
    }
    catch (err) {
        this.logger.error(err);
        this.logger.error(`[push528]事件处理异常：${sub_type},${proto instanceof protobuf_1.Proto ? proto.toHex() : proto}`);
    }
    if (event)
        emitFriendNoticeEvent(this, uin, event);
}
async function ntSub0x27(uin, proto) {
    const type = proto[1][2];
    let event;
    try {
        switch (type) {
            case 0: {
                const data = proto[1];
                this.classes.set(await internal_1.uid2uin.call(this, String(data[3][1])), String(data[3][3]));
                break;
            }
            case 1: {
                const data = proto[1];
                this.classes.delete(await internal_1.uid2uin.call(this, String(data[4][1])));
                break;
            }
            case 2: {
                const data = proto[1];
                this.classes.set(await internal_1.uid2uin.call(this, String(data[5][1])), String(data[5][2]));
                break;
            }
            case 4: {
                const data = proto[1];
                const arr = Array.isArray(data[7][1]) ? data[7][1] : [data[7][1]];
                const uins = await internal_1.uid2uins.call(this, arr.map(val => String(val[1])));
                for (let v of arr.map((val, i) => {
                    val[1] = uins[i];
                    return val;
                }))
                    this.fl.get(v[1]).class_id = v[3];
                break;
            }
            case 5: {
                const data = proto[1];
                const user_uid = String(data[14][1]);
                const user_id = await internal_1.uid2uin.call(this, user_uid);
                let nickname = "";
                if (typeof user_id === "number") {
                    nickname = this.fl.get(user_id)?.nickname || "";
                    this.fl.delete(user_id);
                }
                else {
                    this.reloadFriendList();
                }
                this.logger.info(`更新了好友列表，删除了好友 ${user_id}(${nickname})`);
                event = {
                    sub_type: "decrease",
                    user_id,
                    nickname,
                };
                break;
            }
            case 20: {
                // 20002昵称 20009性别 20031生日 23109农历生日 20019说明 20032地区 24002故乡 27372在线状态
                const data = proto[1];
                const user_uid = String(data[8][1]);
                const user_uin = await internal_1.uid2uin.call(this, user_uid);
                const list = Array.isArray(data[8][2]) ? data[8][2] : [data[8][2]];
                for (let o of list) {
                    let key, value;
                    if (o[1] === 20002) {
                        key = "nickname";
                        value = String(o[2]);
                        if ((user_uin == this.uin || user_uid === this.uid) && key)
                            this.nickname = value;
                        try {
                            this.fl.get(user_uin).nickname = value;
                        }
                        catch { }
                    }
                    else if (o[1] === 20009) {
                        key = "sex";
                        value = ["unknown", "male", "female"][o[2].toBuffer()[0]];
                    }
                    else if (o[1] === 20031) {
                        key = "age";
                        value = new Date().getFullYear() - o[2].toBuffer().readUInt16BE();
                    }
                    else if (o[1] === 27372 && user_uin === this.uin) {
                        const value = o[2].toBuffer().readUint32LE();
                        const status = value >> 24;
                        this.status = statuslist[status] || 11;
                        this.em("internal.onlineStatusChange", { status: this.status });
                    }
                }
                break;
            }
            case 40: {
                const data = proto[1];
                const o = data[9][1];
                if (o[1] > 0)
                    return; //0好友备注 1群备注
                const user_uid = String(o[2]);
                const user_id = await internal_1.uid2uin.call(this, user_uid, o[1] ? o[4] : 0);
                this.fl.get(user_id).remark = String(o[3]);
                break;
            }
            case 80: {
                const data = proto[1];
                const o = data[12];
                const gid = o[3];
                if (!o[4])
                    break;
                this.gl.get(gid).group_name = String(o[2][2]);
                break;
            }
            default:
                if (["trace", "debug"].includes(this.config.log_level))
                    this.logger.debug(`[sub0x27]不支持的事件：${type},${proto instanceof protobuf_1.Proto ? `${proto.toHex()},${proto.toJSONString(undefined, 1)}` : proto}`);
        }
    }
    catch (err) {
        this.logger.error(err);
        this.logger.error(`[sub0x27]事件处理异常：${type},${proto instanceof protobuf_1.Proto ? proto.toHex() : proto}`);
    }
    return event;
}
async function ntPush732(gid, sub_type, proto) {
    if (!(proto instanceof protobuf_1.Proto && proto.checkTag(2)))
        return;
    let buf = proto[2].toBuffer(), event;
    try {
        proto = core_1.pb.decode(buf) || core_1.pb.decode(buf.subarray(7));
    }
    catch {
        proto = core_1.pb.decode(buf.subarray(7));
    }
    try {
        switch (sub_type) {
            case 0x1: {
                this.em("sync.read.group", {
                    group_id: proto[1],
                    seq: proto[4],
                });
                break;
            }
            case 0x10: {
                if (proto.checkTag(13, 44) && proto[13] === 35) {
                    const data = proto[44];
                    const user_uid = String(data[1][1][3][4]);
                    const user_id = await internal_1.uid2uin.call(this, user_uid, gid);
                    const set = data[1][1][3][5] === 1;
                    event = {
                        sub_type: "reaction",
                        id: String(data[1][1][3][1]),
                        type: data[1][1][3][2],
                        seq: data[1][1][2][1],
                        set,
                        user_id,
                    };
                }
                break;
            }
            case 0x11: {
                const data = proto[11] || proto;
                const operator_uid = String(data[1] || this.uid);
                const msg = Array.isArray(data[3]) ? data[3][0] : data[3];
                const user_uid = String(msg[6]);
                const uins = await internal_1.uid2uins.call(this, [operator_uid, user_uid], gid);
                const operator_id = uins[0], user_id = uins[1];
                const message_id = (0, message_1.genGroupMessageId)(gid, user_id, msg[1], msg[3], msg[2], Array.isArray(data[3]) ? data[3].length : 1);
                event = {
                    sub_type: "recall",
                    user_id,
                    operator_id,
                    message_id,
                    seq: msg[1],
                    rand: msg[3],
                    time: msg[2],
                };
                break;
            }
            case 0x14: {
                const data = proto[26];
                let e = parsePoke(data);
                if (e.action) {
                    e.operator_id = e.operator_id || this.uin;
                    e.target_id = e.target_id || this.uin;
                    event = Object.assign(e, {
                        sub_type: "poke",
                        /** @deprecated */
                        user_id: e.target_id,
                    });
                }
                else {
                    const sign = { gid };
                    Object.assign(sign, parseSign.call(this, data));
                    if (sign.sign_text) {
                        event = {
                            sub_type: "sign",
                            ...sign,
                        };
                    }
                }
                break;
            }
            case 0x0c: {
                if (!(proto instanceof protobuf_1.Proto && proto.checkTag(4, 5)))
                    break;
                const time = (0, common_1.timestamp)();
                let duration = proto[5][3][2];
                const operator_uid = String(proto[4]), user_uid = String(proto[5][3][1]);
                const [operator_id, user_id] = await internal_1.uid2uins.call(this, [operator_uid, user_uid], gid);
                try {
                    if (user_id === 0) {
                        duration = duration ? 0xffffffff : 0;
                        this.gl.get(gid).shutup_time_whole = duration;
                    }
                    else if (user_id === this.uin) {
                        this.gl.get(gid).shutup_time_me = duration ? time + duration : 0;
                    }
                    this.gml.get(gid).get(user_id).shutup_time = duration ? time + duration : 0;
                }
                catch { }
                this.logger.info(`用户${user_id}在群${gid}被禁言${duration}秒`);
                event = {
                    sub_type: "ban",
                    operator_id,
                    user_id,
                    duration,
                };
                break;
            }
            case 0x0e: {
                //没有匿名聊天了，就不用补了吧。
                break;
            }
            default:
                if (["trace", "debug"].includes(this.config.log_level))
                    this.logger.debug(`[push732]不支持的事件：${sub_type},${proto instanceof protobuf_1.Proto ? `${proto.toHex()},${proto.toJSONString(undefined, 1)}` : proto}`);
        }
    }
    catch (err) {
        this.logger.error(err);
        this.logger.error(`[push732]事件处理异常：${sub_type},${proto instanceof protobuf_1.Proto ? proto.toHex() : proto}`);
    }
    if (event)
        emitGroupNoticeEvent(this, gid, event);
}
function ssoPushAck(proto) { }
function privateMsgListener(payload, seq, nt = false) {
    const proto = core_1.pb.decode(payload);
    this.stat.recv_msg_cnt++;
    const msg = new message_1.PrivateMessage(this, proto, this.uin, nt);
    if (msg.raw_message) {
        msg.friend = this.pickFriend(msg.from_id);
        if (msg.sub_type === "friend")
            msg.sender.nickname =
                msg.friend.info?.nickname || this.sl.get(msg.from_id)?.nickname || "";
        else if (msg.sub_type === "self")
            msg.sender.nickname = this.nickname;
        msg.reply = function (content, quote = false) {
            if (this.sender.group_id)
                return this.friend
                    .asMember(this.sender.group_id)
                    .sendMsg(content, quote ? this : undefined);
            return this.friend.sendMsg(content, quote ? this : undefined);
        };
        this.logger.info(`recv from: [Private: ${msg.from_id}(${msg.sub_type})] ` + msg);
        this.em("message.private." + msg.sub_type, msg);
    }
}
function dmMsgSyncListener(payload, seq) {
    const proto = core_1.pb.decode(payload);
    handleOnlinePush.call(this, proto[2], seq);
    const msg = new message_1.PrivateMessage(this, proto[1], this.uin);
    msg.sender.nickname = this.nickname;
    this.em("sync.message", msg);
}
const fragmap = new Map();
function groupMsgListener(payload, seq, nt = false) {
    this.stat.recv_msg_cnt++;
    if (!this._sync_cookie && !this.useQQNT)
        return;
    let msg = new message_1.GroupMessage(this, core_1.pb.decode(payload)[1], nt);
    this.emit(`internal.${msg.group_id}.${msg.rand}`, msg.message_id);
    if (msg.user_id === this.uin && this.config.ignore_self)
        return;
    //分片专属屎山
    if (msg.pktnum > 1) {
        const k = [this.uin, msg.group_id, msg.user_id, msg.div].join();
        if (!fragmap.has(k))
            fragmap.set(k, []);
        const arr = fragmap.get(k);
        arr.push(msg);
        setTimeout(() => fragmap.delete(k), 5000);
        if (arr.length !== msg.pktnum)
            return;
        msg = message_1.GroupMessage.combine(arr);
    }
    if (msg.raw_message) {
        const group = this.pickGroup(msg.group_id);
        const member = group.pickMember(msg.sender.user_id);
        msg.group = group;
        msg.member = member;
        msg.reply = function (content, quote = false) {
            return this.group.sendMsg(content, quote ? this : undefined);
        };
        msg.recall = function () {
            return this.group.recallMsg(this);
        };
        const sender = msg.sender;
        if (msg.member.info) {
            const info = msg.member.info;
            sender.nickname = info.nickname;
            sender.sex = info.sex || "unknown";
            sender.age = info.age ?? 0;
            sender.area = info.area || "";
            info.card = sender.card;
            info.title = sender.title;
            info.level = sender.level;
            info.last_sent_time = (0, common_1.timestamp)();
        }
        this.logger.info(`recv from: [Group: ${msg.group_name}(${msg.group_id}), Member: ${sender.card || sender.nickname}(${sender.user_id})] ` +
            msg);
        this.em("message.group." + msg.sub_type, msg);
        msg.group.info.last_sent_time = (0, common_1.timestamp)();
    }
}
function discussMsgListener(payload, seq) {
    this.statistics.recv_msg_cnt++;
    const proto = core_1.pb.decode(payload);
    handleOnlinePush.call(this, proto[2], seq);
    if (!this._sync_cookie && !this.useQQNT)
        return;
    const msg = new message_1.DiscussMessage(this, proto[1]);
    if (msg.user_id === this.uin && this.config.ignore_self)
        return;
    if (msg.raw_message) {
        msg.discuss = this.pickDiscuss(msg.discuss_id);
        msg.reply = msg.discuss.sendMsg.bind(msg.discuss);
        this.logger.info(`recv from: [Discuss: ${msg.discuss_name}(${msg.discuss_id}), Member: ${msg.sender.card}(${msg.sender.user_id})] ` +
            msg);
        this.em("message.discuss", msg);
    }
}
function syncPushListener(payload) {
    //console.log('syncPushListener:', pb.decode(payload).toJSON())
}
async function pushNotify(type) {
    switch (type) {
        case 33: //群员入群
        case 38: //建群
        case 85: //群申请被同意
        case 141: //陌生人
        case 166: //好友
        case 167: //单向好友
        case 208: //好友语音
        case 529: //离线文件
            return pbgetmsg_1.pbGetMsg.call(this);
        case 84: //群请求
        case 87: //群邀请
        case 525: //群请求(来自群员的邀请)
            return sysmsg_1.getGrpSysMsg.call(this);
        case 187: //好友请求
        case 191: //单向好友增加
            return sysmsg_1.getFrdSysMsg.call(this);
        case 528: //黑名单同步
            return this.reloadBlackList();
    }
}
