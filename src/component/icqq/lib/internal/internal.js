"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OcrResult = void 0;
exports.getStatus = getStatus;
exports.getStatusInfo = getStatusInfo;
exports.setStatus = setStatus;
exports.setSign = setSign;
exports.setPersonalSign = setPersonalSign;
exports.getUserProfile = getUserProfile;
exports.uid2uins = uid2uins;
exports.uid2uin = uid2uin;
exports.uin2uids = uin2uids;
exports.uin2uid = uin2uid;
exports.refreshBigDataSession = refreshBigDataSession;
exports.setAvatar = setAvatar;
exports.getStamp = getStamp;
exports.delStamp = delStamp;
exports.addClass = addClass;
exports.delClass = delClass;
exports.renameClass = renameClass;
exports._loadFL = _loadFL;
exports.loadFL = loadFL;
exports.loadSL = loadSL;
exports.loadGPL = loadGPL;
exports.loadGL = loadGL;
exports._loadBL = _loadBL;
exports.loadBL = loadBL;
exports.imageOcr = imageOcr;
exports.refreshNTPicRkey = refreshNTPicRkey;
exports.getPSkey = getPSkey;
exports.getClientKey = getClientKey;
const core_1 = require("../core");
const errors_1 = require("../errors");
const common_1 = require("../common");
const highway_1 = require("./highway");
const guild_1 = require("../guild");
const d50 = core_1.pb.encode({
    1: 10002,
    91001: 1,
    101001: 1,
    151001: 1,
    181001: 1,
    251001: 1,
});
async function getStatus() {
    return (await getStatusInfo.call(this))?.onlineStatus || this.status;
}
async function getStatusInfo(uin, usejce) {
    try {
        if (!usejce) {
            const proto = await this.sendOidbSvcTrpcTcp("OidbSvcTrpcTcp.0x116c_1", {
                1: uin || this.uin,
                2: 1,
            }, { message_type: 0 });
            return {
                uin: proto[1],
                status: proto[2],
                termType: proto[3],
                abiFlag: proto[4],
                networkType: proto[5] || 0,
                iconType: proto[6],
                interval: proto[7],
                termDesc: String(proto[8]),
                customOnlineStatusDesc: core_1.pb.decode(proto[9]?.encoded || common_1.BUF0),
                extOnlineStatus: proto[10],
                batteryStatus: proto[11],
                musicInfo: core_1.pb.decode(proto[12]?.encoded || common_1.BUF0),
                poiInfo: core_1.pb.decode(proto[13]?.encoded || common_1.BUF0),
                extOnlineBusinessInfo: core_1.pb.decode(proto[14]?.encoded || common_1.BUF0),
                extInfo: core_1.pb.decode(proto[15]?.encoded || common_1.BUF0),
                unknown: proto[16],
                onlineStatus: proto[17],
            };
        }
        else {
            const GetOnlineInfoReq = core_1.jce.encodeStruct([0, uin || this.uin, null, 41, 1]);
            const body = core_1.jce.encodeWrapper({ GetOnlineInfoReq }, "mqq.IMService.FriendListServiceServantObj", "GetOnlineInfoReq");
            const payload = await this.sendUni("friendlist.GetOnlineInfoReq", body);
            const data = core_1.jce.decodeWrapper(payload);
            return {
                result: data[0],
                errorCode: data[1],
                status: data[2],
                termType: data[3],
                abiFlag: data[4],
                networkType: data[5] || 0,
                iconType: data[6],
                interval: data[7],
                uin: data[8],
                termDesc: String(data[9]),
                customOnlineStatusDesc: core_1.pb.decode(Buffer.from(data[10] || common_1.BUF0)),
                extOnlineStatus: data[11],
                batteryStatus: data[12],
                musicInfo: core_1.pb.decode(data[13] || common_1.BUF0),
                poiInfo: core_1.pb.decode(data[14] || common_1.BUF0),
                extOnlineBusinessInfo: core_1.pb.decode(data[15] || common_1.BUF0),
                extInfo: core_1.pb.decode(data[16] || common_1.BUF0),
            };
        }
    }
    catch { }
    return null;
}
async function setStatus(status) {
    if (!status || [core_1.Platform.Watch].includes(this.config.platform))
        return true;
    const d = this.device;
    const SvcReqRegister = core_1.jce.encodeStruct([
        this.uin,
        7,
        0,
        "",
        Number(status),
        0,
        0,
        0,
        0,
        0,
        248,
        d.version.sdk,
        0,
        "",
        0,
        null,
        d.guid,
        2052,
        0,
        d.model,
        d.model,
        d.version.release,
        1,
        473,
        0,
        null,
        0,
        0,
        "",
        0,
        "",
        "",
        "",
        null,
        1,
        null,
        0,
        null,
        0,
        0,
    ]);
    const body = core_1.jce.encodeWrapper({ SvcReqRegister }, "PushService", "SvcReqRegister");
    /*const payload = await this.sendUni("StatSvc.SetStatusFromClient", body)
    const ret = !!jce.decodeWrapper(payload)[9]
    if (ret)
        this.status = Number(status)
    return ret*/
    return await new Promise(resolve => {
        const timer = setTimeout(async () => {
            listen();
            resolve((await getStatus.call(this)) == status);
        }, 3000);
        const listen = this.trapOnce("internal.onlineStatusChange", e => {
            clearTimeout(timer);
            resolve(Number(status) === Number(e.status));
        });
        this.writeUni("StatSvc.SetStatusFromClient", body);
    });
}
/**
 * 设置个性签名
 * @deprecated 请使用 setPersonalSign
 * @param sign {string} 签名
 */
async function setSign(sign) {
    return await setPersonalSign.call(this, sign);
}
/**
 * 设置个性签名
 * @param sign {string} 签名
 */
async function setPersonalSign(sign) {
    const buf = Buffer.from(String(sign)).slice(0, 254);
    const body = core_1.pb.encode({
        1: 2,
        2: Date.now(),
        3: {
            1: 109,
            2: { 6: 825110830 },
            3: this.apk.ver,
        },
        5: {
            1: this.uin,
            2: 0,
            3: 27 + buf.length,
            4: Buffer.concat([
                Buffer.from([0x3, buf.length + 1, 0x20]),
                buf,
                Buffer.from([
                    0x91, 0x04, 0x00, 0x00, 0x00, 0x00, 0x92, 0x04, 0x00, 0x00, 0x00, 0x00, 0xa2,
                    0x04, 0x00, 0x00, 0x00, 0x00, 0xa3, 0x04, 0x00, 0x00, 0x00, 0x00,
                ]),
            ]),
            5: 0,
        },
        6: 1,
    });
    const payload = await this.sendUni("Signature.auth", body);
    return core_1.pb.decode(payload)[1] === 0;
}
async function fe1_2(userids, ids, isUID = false) {
    const body = {
        1: userids.map(userid => (isUID ? userid : Number(userid))),
        3: {
            1: ids,
        },
    };
    try {
        const proto = await this.sendOidbSvcTrpcTcp("OidbSvcTrpcTcp.0xfe1_2", body, {
            message_type: isUID ? 32 : 0,
        });
        return Array.isArray(proto[1]) ? proto[1] : proto[1] ? [proto[1]] : [];
    }
    catch {
        return [];
    }
}
/**
 * 获取用户资料
 * @param uin_uid {number | string} 用户uin或uid
 * @param [idsParse]
 * @example
 * getUserProfile.call(client, 123456, { 20002: { key: "nickname", parse: (val: any) => val?.toString ? val.toString() : val } })
 */
async function getUserProfile(uin_uid, idsParse) {
    //[20002, 27394, 20009, 20031, 101, 103, 102, 20022, 20023, 20024, 24002, 27037, 27049, 20011, 20016, 20021, 20003, 20004, 20005, 20006, 20020, 20026, 24007, 104, 105, 42432, 42362, 41756, 41757, 42257, 27372, 42315, 107, 45160, 45161, 27406, 62026, 20037]
    idsParse = {
        101: {
            key: "avatar",
            parse: (val) => {
                return {
                    changeTimestamp: val[3],
                    url: val[5]?.toString ? val[5].toString() + "0" : "",
                };
            },
        },
        102: {
            key: "signature",
            parse: (val) => val?.toString ? val.toString() : val,
        },
        105: {
            key: "level",
            parse: (val) => val,
        },
        20002: {
            key: "nickname",
            parse: (val) => val?.toString ? val.toString() : val,
        },
        20009: {
            key: "sex",
            parse: (val) => ["unknown", "male", "female"][val] || "unknown",
        },
        20011: {
            key: "mail",
            parse: (val) => val?.toString ? val.toString() : val,
        },
        20026: {
            key: "regTimestamp",
            parse: (val) => val,
        },
        20037: {
            key: "age",
            parse: (val) => val,
        },
        27394: {
            key: "QID",
            parse: (val) => val?.toString ? val.toString() : val,
        },
        ...(idsParse || {}),
    };
    const ids = Object.keys(idsParse).map(val => parseInt(val));
    const isUID = typeof uin_uid === "string" && uin_uid.startsWith("u_");
    const proto = await fe1_2.call(this, [uin_uid], ids, isUID);
    if (!proto.length)
        return {};
    const info = proto[0][2];
    const profile = {};
    if (!Array.isArray(info[1]))
        info[1] = !info[1] ? [] : [info[1]];
    info[1]
        .concat(!Array.isArray(info[2]) ? [] : info[2])
        .forEach((item) => {
        profile[parseInt(item[1])] = item[2];
    });
    const ret = {
        uin: proto[0][3],
    };
    for (let id in profile) {
        let val = profile[id];
        let parse = idsParse[id];
        if (parse)
            ret[parse.key] = parse.parse(val, proto[0]);
    }
    return ret;
}
async function uid2uins(uids, group_id) {
    uids = uids.map(uid => String(uid));
    const query_uids = [];
    for (let uid of uids) {
        if (!this.uid2uinMap.has(uid))
            query_uids.push(uid);
    }
    if (query_uids.length) {
        for (let val of this.fl.values()) {
            const index = query_uids.indexOf(val.user_uid);
            if (index > -1) {
                this.uid2uinMap.set(val.user_uid, val.user_id);
                query_uids.splice(index, 1);
            }
        }
    }
    if (query_uids.length && group_id && this.gml.has(group_id)) {
        for (let val of this.gml.get(group_id)?.values() || []) {
            const index = query_uids.indexOf(val.user_uid);
            if (index > -1) {
                this.uid2uinMap.set(val.user_uid, val.user_id);
                query_uids.splice(index, 1);
            }
        }
    }
    if (query_uids.length) {
        const proto = await fe1_2.call(this, query_uids, [20002], true);
        for (let val of proto) {
            this.uid2uinMap.set(val[1]?.toString(), val[3]);
        }
    }
    return uids.map(uid => this.uid2uinMap.get(uid) || 0);
}
async function uid2uin(uid, group_id) {
    const uins = await uid2uins.call(this, [uid], group_id);
    return uins[0];
}
async function uin2uids(uins, group_id) {
    const query_uins = [];
    for (let uin of uins) {
        if (!Array.from(this.uid2uinMap.values()).includes(uin))
            query_uins.push(uin);
    }
    if (query_uins.length) {
        for (let val of this.fl.values()) {
            const index = query_uins.indexOf(val.user_id);
            if (index > -1) {
                this.uid2uinMap.set(val.user_uid, val.user_id);
                query_uins.splice(index, 1);
            }
        }
    }
    if (query_uins.length && group_id && this.gml.has(group_id)) {
        for (let val of this.gml.get(group_id)?.values() || []) {
            const index = query_uins.indexOf(val.user_id);
            if (index > -1) {
                this.uid2uinMap.set(val.user_uid, val.user_id);
                query_uins.splice(index, 1);
            }
        }
    }
    if (query_uins.length && group_id) {
        try {
            const proto = await this.sendOidbSvcTrpcTcp("OidbSvcTrpcTcp.0xfe7_3", {
                1: group_id,
                2: 3,
                3: 0,
                4: { 10: 1 },
                5: query_uins.map(uin => {
                    return { 1: uin };
                }),
            }, { message_type: 0 });
            for (let val of Array.isArray(proto[2]) ? proto[2] : [proto[2]]) {
                this.uid2uinMap.set(val[1][2].toString(), val[1][4]);
            }
        }
        catch { }
    }
    const list = Array.from(this.uid2uinMap.entries());
    return uins.map(uin => (list.find(val => val[1] === uin) || ["", 0])[0]);
}
async function uin2uid(uin, group_id) {
    const uids = await uin2uids.call(this, [uin], group_id);
    return uids[0];
}
async function refreshBigDataSession() {
    const body = core_1.pb.encode({
        1281: {
            1: this.uin,
            2: 0,
            3: this.apk.appid,
            4: 1,
            6: 3,
            7: [10, 21],
            10: 9
        },
    });
    const payload = await this.sendUni("HttpConn.0x6ff_501", body);
    const decoded = core_1.pb.decode(payload)[1281];
    try {
        this.sig.bigdata.sig_session = decoded[1].toBuffer();
        this.sig.bigdata.session_key = decoded[2].toBuffer();
        for (let v of Array.isArray(decoded[3]) ? decoded[3] : [decoded[3]]) {
            if (v[1] === 10) {
                const port = v[2][0][3];
                const ip = (0, common_1.int32ip2str)(v[2][0][2]);
                if (this.sig.bigdata.port !== port && this.sig.bigdata.ip !== ip) {
                    this.sig.bigdata.port = port;
                    this.sig.bigdata.ip = ip;
                    break;
                }
            }
        }
    }
    catch {
        this.sig.bigdata.sig_session = common_1.BUF0;
        this.sig.bigdata.session_key = common_1.BUF0;
        this.sig.bigdata.port = 0;
        this.sig.bigdata.ip = "";
    }
}
async function setAvatar(img) {
    await img.task;
    const body = core_1.pb.encode({
        1281: {
            1: this.uin,
            2: 0,
            3: this.apk.appid,
            4: 1,
            6: 3,
            7: 5,
        },
    });
    const payload = await this.sendUni("HttpConn.0x6ff_501", body);
    const rsp = core_1.pb.decode(payload)[1281];
    await highway_1.highwayUpload.call(this, img.readable, {
        cmdid: highway_1.CmdID.SelfPortrait,
        md5: img.md5,
        size: img.size,
        ticket: rsp[1].toBuffer(),
    }, rsp[3][2][0][2], rsp[3][2][0][3]);
    img.deleteTmpFile();
}
async function getStamp(no_cache = false) {
    if (this.stamp.size > 0 && !no_cache)
        return Array.from(this.stamp).map(x => `https://p.qpic.cn/${this.bid}/${this.uin}/${x}/0`);
    const body = core_1.pb.encode({
        1: {
            1: 109,
            2: "7.1.2",
            3: this.apk.ver,
        },
        2: this.uin,
        3: 1,
    });
    const payload = await this.sendUni("Faceroam.OpReq", body);
    const rsp = core_1.pb.decode(payload);
    if (rsp[1] !== 0)
        (0, errors_1.drop)(rsp[1], rsp[2]);
    if (rsp[4][1]) {
        this.bid = String(rsp[4][3]);
        this.stamp = new Set((Array.isArray(rsp[4][1]) ? rsp[4][1] : [rsp[4][1]]).map(x => String(x)));
    }
    else {
        this.stamp = new Set();
    }
    return Array.from(this.stamp).map(x => `https://p.qpic.cn/${this.bid}/${this.uin}/${x}/0`);
}
async function delStamp(id) {
    const body = core_1.pb.encode({
        1: {
            1: 109,
            2: "7.1.2",
            3: this.apk.ver,
        },
        2: this.uin,
        3: 2,
        5: {
            1: id,
        },
    });
    await this.sendUni("Faceroam.OpReq", body);
    for (let s of id)
        this.stamp.delete(s);
}
async function addClass(name) {
    const len = Buffer.byteLength(name);
    const buf = Buffer.allocUnsafe(2 + len);
    buf.writeUInt8(0xd);
    buf.writeUInt8(len, 1);
    buf.fill(name, 2);
    const SetGroupReq = core_1.jce.encodeStruct([0, this.uin, buf]);
    const body = core_1.jce.encodeWrapper({ SetGroupReq }, "mqq.IMService.FriendListServiceServantObj", "SetGroupReq");
    await this.sendUni("friendlist.SetGroupReq", body);
}
async function delClass(id) {
    const SetGroupReq = core_1.jce.encodeStruct([2, this.uin, Buffer.from([Number(id)])]);
    const body = core_1.jce.encodeWrapper({ SetGroupReq }, "mqq.IMService.FriendListServiceServantObj", "SetGroupReq");
    await this.sendUni("friendlist.SetGroupReq", body);
}
async function renameClass(id, name) {
    const len = Buffer.byteLength(name);
    const buf = Buffer.allocUnsafe(2 + len);
    buf.writeUInt8(Number(id));
    buf.writeUInt8(len, 1);
    buf.fill(name, 2);
    const SetGroupReq = core_1.jce.encodeStruct([1, this.uin, buf]);
    const body = core_1.jce.encodeWrapper({ SetGroupReq }, "mqq.IMService.FriendListServiceServantObj", "SetGroupReq");
    await this.sendUni("friendlist.SetGroupReq", body);
}
async function _loadFL() {
    const set = new Set();
    let start = 0, limit = 150;
    while (true) {
        const FL = core_1.jce.encodeStruct([
            3,
            1,
            this.uin,
            start,
            limit,
            0,
            1,
            0,
            100,
            0,
            1,
            41,
            null,
            0,
            0,
            0,
            d50,
            null,
            [13580, 13581, 13582],
        ]);
        const body = core_1.jce.encodeWrapper({ FL }, "mqq.IMService.FriendListServiceServantObj", "GetFriendListReq");
        const payload = await this.sendUni("friendlist.getFriendGroupList", body, 10);
        const nested = core_1.jce.decodeWrapper(payload);
        this.classes.clear();
        for (let v of nested[14])
            this.classes.set(v[0], v[1]);
        for (let v of nested[7]) {
            const uin = v[0];
            const info = {
                user_id: uin,
                nickname: v[14] || "",
                sex: v[31] ? (v[31] === 1 ? "male" : "female") : "unknown",
                remark: v[3] || "",
                class_id: v[1],
                user_uid: v[63] || "",
            };
            this.fl.set(uin, Object.assign(this.fl.get(uin) || {}, info));
            set.add(uin);
        }
        start += limit;
        const num = nested[5];
        if (start + limit > num)
            limit = num - start;
        if (start >= num)
            break;
    }
    for (const [uin, _] of this.fl) {
        if (!set.has(uin))
            this.fl.delete(uin);
    }
}
async function loadFL() {
    const set = new Set();
    const limit = 300;
    const body = {
        2: limit,
        4: 0,
        6: 1,
        7: 0,
        10: 4,
        10001: [{ 1: 1, 2: { 1: [103, 20002, 20009] } }]
    };
    this.classes.clear();
    try {
        while (true) {
            const proto = await this.sendOidbSvcTrpcTcp("OidbSvcTrpcTcp.0xfd4_1", body, { message_type: 32 });
            body[4] = proto[1];
            body[5] = proto[2];
            if (proto[101])
                proto[101] = Array.isArray(proto[101]) ? proto[101] : [proto[101]];
            if (proto[102])
                proto[102] = Array.isArray(proto[102]) ? proto[102] : [proto[102]];
            for (let v of proto[101]) {
                const uid = v[1]?.encoded ? String(v[1]) : "";
                const class_id = v[2];
                const uin = v[3];
                v[10001] = v[10001] ? (Array.isArray(v[10001]) ? v[10001] : [v[10001]]) : [];
                v = v[10001].find((v) => v[1] === 1)?.[2] || {};
                v[1] = v[1] ? (Array.isArray(v[1]) ? v[1] : [v[1]]) : [];
                v[2] = v[2] ? (Array.isArray(v[2]) ? v[2] : [v[2]]) : [];
                const list = v[1].concat(v[2]);
                this.fl.set(uin, Object.assign(this.fl.get(uin) || {}, {
                    user_id: uin,
                    nickname: String(list.find(v => v[1] === 20002)?.[2] || ""),
                    sex: (["unknown", "male", "female"][list.find(v => v[1] === 20009)?.[2]] || "unknown"),
                    remark: String(list.find(v => v[1] === 103)?.[2] || ""),
                    class_id: class_id ?? 0,
                    user_uid: uid || "",
                }));
                set.add(uin);
            }
            for (let v of proto[102])
                this.classes.set(v[1] ?? 0, String(v[2]));
            if (proto[3] === 1)
                break;
        }
        for (const [uin, _] of this.fl) {
            if (!set.has(uin))
                this.fl.delete(uin);
        }
    }
    catch {
        return _loadFL.call(this);
    }
}
async function loadSL() {
    const body = core_1.pb.encode({
        1: 1,
        2: {
            1: this.sig.seq + 1,
        },
    });
    const payload = await this.sendOidb("OidbSvc.0x5d2_0", body, 10);
    let protos = core_1.pb.decode(payload)[4][2][2];
    if (!protos)
        return;
    if (!Array.isArray(protos))
        protos = [protos];
    const set = new Set();
    for (const proto of protos) {
        this.sl.set(proto[1], {
            user_id: proto[1],
            nickname: String(proto[2]),
        });
        set.add(proto[1]);
    }
    for (const [uin, _] of this.sl) {
        if (!set.has(uin))
            this.sl.delete(uin);
    }
}
function loadGPL() {
    this.sendUni("trpc.group_pro.synclogic.SyncLogic.SyncFirstView", core_1.pb.encode({ 1: 0, 2: 0, 3: 0 }))
        .then(payload => {
        this.tiny_id = String(core_1.pb.decode(payload)[6]);
    })
        .catch(common_1.NOOP);
    return new Promise((resolve, reject) => {
        const id = setTimeout(reject, 5000);
        this.on("internal.sso", (cmd, payload) => {
            if (cmd === "trpc.group_pro.synclogic.SyncLogic.PushFirstView") {
                const proto = core_1.pb.decode(payload);
                if (proto[3]) {
                    if (!Array.isArray(proto[3]))
                        proto[3] = [proto[3]];
                    const tmp = new Set();
                    for (let p of proto[3]) {
                        const id = String(p[1]), name = String(p[4]);
                        tmp.add(id);
                        if (!this.guilds.has(id))
                            this.guilds.set(id, new guild_1.Guild(this, id));
                        const guild = this.guilds.get(id);
                        guild._renew(name, p[3]);
                    }
                    for (let [id, _] of this.guilds) {
                        if (!tmp.has(id))
                            this.guilds.delete(id);
                    }
                }
                clearTimeout(id);
                resolve();
            }
        });
    });
}
async function loadGL() {
    const GetTroopListReqV2Simplify = core_1.jce.encodeStruct([this.uin, 0, null, [], 1, 8, 0, 1, 1]);
    const body = core_1.jce.encodeWrapper({ GetTroopListReqV2Simplify }, "mqq.IMService.FriendListServiceServantObj", "GetTroopListReqV2Simplify");
    const payload = await this.sendUni("friendlist.GetTroopListReqV2", body, 10);
    const nested = core_1.jce.decodeWrapper(payload);
    const set = new Set();
    for (let v of nested[5]) {
        const gid = v[1];
        const info = {
            group_id: gid,
            group_name: v[4] || "",
            member_count: v[19],
            max_member_count: v[29],
            owner_id: v[23],
            last_join_time: v[27],
            shutup_time_whole: v[9] ? 0xffffffff : 0,
            shutup_time_me: v[10] > (0, common_1.timestamp)() ? v[10] : 0,
            admin_flag: !!v[11],
            update_time: 0,
        };
        this.gl.set(gid, Object.assign(this.gl.get(gid) || {}, info));
        set.add(gid);
    }
    for (const [gid, _] of this.gl) {
        if (!set.has(gid)) {
            this.gl.delete(gid);
            this.gml.delete(gid);
        }
    }
}
/*export async function loadGL(this: Client) {
    const set = new Set<number>();
    const proto = await this.sendOidbSvcTrpcTcp("OidbSvcTrpcTcp.0xfe5_2", {
        1: {
            1: [1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 39, 40, 41]
                .map(v => { return { [v]: 1 } }),
        }
    });

    for (let v of proto[2]) {
        const gid = v[3];
        v = v[4];
        const info = {
        group_id: gid,
            group_name: gid,
            member_count: v[4],
            max_member_count: v[3],
            //owner_id: v[23],
            last_join_time: v[9],
            last_sent_time: v[40],
            //shutup_time_whole: v[9] ? 0xffffffff : 0,
            //shutup_time_me: v[10] > timestamp() ? v[10] : 0,
            //admin_flag: !!v[11],
            update_time: 0,
        };
        this.gl.set(gid, Object.assign(this.gl.get(gid) || {}, info));
        set.add(gid);
    }
    for (const [gid, _] of this.gl) {
        if (!set.has(gid)) {
            this.gl.delete(gid);
            this.gml.delete(gid);
        }
    }
}*/
async function _loadBL() {
    let body = core_1.pb.encode({
        1: {
            1: this.uin,
            3: 0,
            4: 1000,
        },
    });
    let len = Buffer.allocUnsafe(4);
    len.writeUInt32BE(body.length);
    body = Buffer.concat([Buffer.alloc(4), len, body]);
    const payload = await this.sendUni("SsoSnsSession.Cmd0x3_SubCmd0x1_FuncGetBlockList", body);
    let protos = core_1.pb.decode(payload.slice(8))[1][6];
    this.blacklist.clear();
    if (!protos)
        return;
    if (!Array.isArray(protos))
        protos = [protos];
    for (let proto of protos)
        this.blacklist.add(proto[1]);
}
async function loadBL() {
    const body = {
        1: 0,
        2: 0,
        3: 1000
    };
    try {
        const proto = await this.sendOidbSvcTrpcTcp("OidbSvcTrpcTcp.0x1225_0", body);
        let protos = proto[3];
        this.blacklist.clear();
        if (!protos)
            return;
        if (!Array.isArray(protos))
            protos = [protos];
        for (let proto of protos)
            this.blacklist.add(proto[1][3]);
    }
    catch {
        return _loadBL.call(this);
    }
}
class OcrResult {
    constructor(proto) {
        this.wordslist = [];
        this.language = proto[2]?.toString() || "unknown";
        if (!Array.isArray(proto[1]))
            proto[1] = [proto[1]];
        for (let p of proto[1]) {
            this.wordslist.push({
                words: p[1]?.toString() || "",
                confidence: Number(p[2]),
                polygon: p[3][1].map((v) => ({
                    x: Number(v[1]) || 0,
                    y: Number(v[2]) || 0,
                })),
            });
        }
    }
    toString() {
        let str = "";
        for (const elem of this.wordslist)
            str += elem.words;
        return str;
    }
}
exports.OcrResult = OcrResult;
async function imageOcr(img) {
    await img.task;
    const url = String((await highway_1.highwayUpload.call(this, img.readable, {
        cmdid: highway_1.CmdID.Ocr,
        md5: img.md5,
        size: img.size,
        ext: core_1.pb.encode({
            1: 0,
            2: (0, common_1.uuid)(),
        }),
    }))?.[7]?.[2]);
    const body = core_1.pb.encode({
        1: 1,
        2: 0,
        3: 1,
        10: {
            1: url,
            10: img.md5.toString("hex"),
            11: img.md5.toString("hex"),
            12: img.size,
            13: img.width,
            14: img.height,
            15: 0,
        },
    });
    const payload = await this.sendOidb("OidbSvc.0xe07_0", body, 10);
    const rsp = core_1.pb.decode(payload);
    if (rsp[3] !== 0)
        (0, errors_1.drop)(rsp[3], rsp[5]);
    if (rsp[4]?.[1])
        (0, errors_1.drop)(rsp[4][1], rsp[4][3] || rsp[4][2]);
    return new OcrResult(rsp[4][10]);
}
async function refreshNTPicRkey(force = false) {
    const types = [10, 20, 34];
    if (!force && !types.filter(type => (this.sig.rkey_info[type]?.expire_time ?? 0) - (0, common_1.timestamp)() < 600).length) {
        return this.sig.rkey_info;
    }
    const body = {
        1: {
            1: {
                1: 1,
                2: 202
            },
            2: {
                101: 2,
                102: 1,
                103: 0,
                200: 0
            },
            3: {
                1: 2
            },
        },
        4: {
            1: types,
            2: 2
        }
    };
    try {
        const proto = await this.sendOidbSvcTrpcTcp("OidbSvcTrpcTcp.0x9067_202", body);
        let rkeyInfos = proto[4][1];
        if (!Array.isArray(rkeyInfos))
            rkeyInfos = [rkeyInfos];
        for (let rkeyInfo of rkeyInfos) {
            this.sig.rkey_info[rkeyInfo[5]] = {
                rkey: String(rkeyInfo[1]),
                expire_time: rkeyInfo[4] + rkeyInfo[2],
                store_id: rkeyInfo[3],
                type: rkeyInfo[5]
            };
        }
    }
    catch {
    }
    return this.sig.rkey_info;
}
async function getPSkey(domains) {
    const proto = await this.sendOidbSvcTrpcTcp("OidbSvcTrpcTcp.0x102a_0", {
        1: domains,
        2: 3
    });
    const list = Array.isArray(proto[1]) ? proto[1] : [proto[1]];
    return list.map(v => {
        return {
            domain: v[1].toString(),
            p_skey: String(v[2]), expire_time: v[3],
            g_tk: (0, common_1.calcBkn)(v[2].toBuffer()),
            ...(v.checkTag(4) ? {
                uskey: v[4].toString(), expire_time_uskey: v[5]
            } : {})
        };
    });
}
async function getClientKey() {
    let proto = await this.sendOidbSvcTrpcTcp("OidbSvcTrpcTcp.0x9a2_12", {
        2: this.apk.appid,
        3: {},
        4: 0,
        8: this.device.guid.toString("hex"),
        12: this.apk.subid
    });
    return { client_key: proto[10].toHex(), expire_time: proto[11][2] };
}
