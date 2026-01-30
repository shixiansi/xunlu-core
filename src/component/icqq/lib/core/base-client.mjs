import { fileURLToPath } from "url";
var _a, _b, _c, _d, _e, _f, _g, _h;
import { Trapper } from "triptrap";
import crypto, { randomBytes } from "crypto";
import { Readable } from "stream";
import Network from "./network.mjs";
import Ecdh from "./ecdh.mjs";
import Writer from "./writer.mjs";
import * as tlv from "./tlv.mjs";
import * as tea from "./tea.mjs";
import * as pb from "./protobuf/index.mjs";
import * as jce from "./jce/index.mjs";
import { aesGcmDecrypt, aesGcmEncrypt, BUF0, BUF16, BUF4, calcPoW, hide, int32ip2str, lock, md5, NOOP, parseTrpcRsp, readTlv, sha256, timestamp, unlock, unzip, } from "./constants.mjs";
import { Device, getApkInfoList, NTLoginPlatform, Platform } from "./device.mjs";
import log4js from "log4js";
import * as path from "path";
import * as fs from "fs";
import { ErrorCode } from "../errors.mjs";
import { deflateSync } from "zlib";
import { setInterval } from "timers";
import * as import_sign from "./sign.mjs";
import * as import_qsign from "./qsign.mjs";

// ESM globals
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 读取 package.json（动态require，兼容 ESM 和 CJS）
const pkgJson = (() => {
    const filePath = path.resolve(__dirname, '../../package.json');
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
})();
const FN_NEXT_SEQ = Symbol("FN_NEXT_SEQ");
const FN_SEND = Symbol("FN_SEND");
const FN_SEND_LOGIN = Symbol("FN_SEND_LOGIN");
const HANDLERS = Symbol("HANDLERS");
const NET = Symbol("NET");
const ECDH = Symbol("ECDH");
const IS_ONLINE = Symbol("IS_ONLINE");
const LOGIN_LOCK = Symbol("LOGIN_LOCK");
const HEARTBEAT = Symbol("HEARTBEAT");
const SSO_HEARTBEAT = Symbol("SSO_HEARTBEAT");
const MergeSendList = Symbol("MergeSendList");
const MergeSendListHandler = Symbol("MergeSendListHandler");
const MergeSendTimer = Symbol("MergeSendTimer");
const defaultCmdWhiteList = [
    "wtlogin.*",
    "trpc.login.ecdh.EcdhService.*",
    "MessageSvc.PbSendMsg",
    "MsgProxy.SendMsg",
    "OidbSvcTrpcTcp.0x6d9_2",
    "OidbSvcTrpcTcp.0x6d9_4",
    "trpc.o3.ecdh_access.EcdhAccess.*",
    "ProfileService.Pb.ReqSystemMsgAction.Group",
    "ProfileService.Pb.ReqSystemMsgNew.Group",
];
const TlvTags = new Map([
    ['a1', 0x106],
    ['a1_key', 0x10c],
    ['a2', 0x10a],
    ['a2_key', 0x10d],
    ['d2', 0x143],
    ['d2_key', 0x305],
    ['device_token', 0x322],
    ['ksid', 0x108],
    ['no_pic_sig', 0x16a],
    ['st', 0x114],
    ['st_key', 0x10e],
    ['st_web', 0x103],
    ['srm_token', 0x16a],
    ['skey', 0x120],
    ['tgt', 0x10a],
    ['tgt_key', 0x10d],
    ['ticket_key', 0x134],
    ['t104', 0x104],
    ['t174', 0x174],
    ['t546', 0x546],
    ['t547', 0x547],
    ['t553', 0x553],
    ['t402', 0x402],
    ['randomSeed', 0x403]
]);
export var VerboseLevel;
(function (VerboseLevel) {
    VerboseLevel[VerboseLevel["Fatal"] = 0] = "Fatal";
    VerboseLevel[VerboseLevel["Mark"] = 1] = "Mark";
    VerboseLevel[VerboseLevel["Error"] = 2] = "Error";
    VerboseLevel[VerboseLevel["Warn"] = 3] = "Warn";
    VerboseLevel[VerboseLevel["Info"] = 4] = "Info";
    VerboseLevel[VerboseLevel["Debug"] = 5] = "Debug";
})(VerboseLevel || (VerboseLevel = {}));
export class ApiRejection {
    constructor(code, message = "unknown") {
        this.code = code;
        this.message = message;
        this.code = Number(this.code);
        this.message = String(this.message || "unknown");
    }
}
export var NTLoginErrorCode;
(function (NTLoginErrorCode) {
    NTLoginErrorCode[NTLoginErrorCode["AccountNotUin"] = 140022018] = "AccountNotUin";
    NTLoginErrorCode[NTLoginErrorCode["AccountOrPasswordError"] = 140022013] = "AccountOrPasswordError";
    NTLoginErrorCode[NTLoginErrorCode["BlackAccount"] = 150022021] = "BlackAccount";
    NTLoginErrorCode[NTLoginErrorCode["CookieExpired"] = 150022039] = "CookieExpired";
    NTLoginErrorCode[NTLoginErrorCode["CookieUsedExceedUpperLimit"] = 150022040] = "CookieUsedExceedUpperLimit";
    NTLoginErrorCode[NTLoginErrorCode["Default"] = 140022000] = "Default";
    NTLoginErrorCode[NTLoginErrorCode["ExpireTicket"] = 140022014] = "ExpireTicket";
    NTLoginErrorCode[NTLoginErrorCode["Frozen"] = 140022005] = "Frozen";
    NTLoginErrorCode[NTLoginErrorCode["IllegalTicket"] = 140022016] = "IllegalTicket";
    NTLoginErrorCode[NTLoginErrorCode["IllegalAccount"] = 150022030] = "IllegalAccount";
    NTLoginErrorCode[NTLoginErrorCode["InterfaceUnavailable"] = 150022031] = "InterfaceUnavailable";
    NTLoginErrorCode[NTLoginErrorCode["InvalidCookie"] = 140022012] = "InvalidCookie";
    NTLoginErrorCode[NTLoginErrorCode["InvalidParameter"] = 140022001] = "InvalidParameter";
    NTLoginErrorCode[NTLoginErrorCode["KickedTicket"] = 140022015] = "KickedTicket";
    NTLoginErrorCode[NTLoginErrorCode["LhrEfundFreeze"] = 150022033] = "LhrEfundFreeze";
    NTLoginErrorCode[NTLoginErrorCode["LongTimeOfNoOperation"] = 150022035] = "LongTimeOfNoOperation";
    NTLoginErrorCode[NTLoginErrorCode["MultiplePasswordIncorrect"] = 150022029] = "MultiplePasswordIncorrect";
    NTLoginErrorCode[NTLoginErrorCode["NeedUpdate"] = 140022004] = "NeedUpdate";
    NTLoginErrorCode[NTLoginErrorCode["NeedVerifyRealName"] = 140022019] = "NeedVerifyRealName";
    NTLoginErrorCode[NTLoginErrorCode["NewDevice"] = 140022010] = "NewDevice";
    NTLoginErrorCode[NTLoginErrorCode["NiceAccountExpired"] = 150022020] = "NiceAccountExpired";
    NTLoginErrorCode[NTLoginErrorCode["NiceAccountParentChildExpired"] = 150022025] = "NiceAccountParentChildExpired";
    NTLoginErrorCode[NTLoginErrorCode["Password"] = 2] = "Password";
    NTLoginErrorCode[NTLoginErrorCode["PasswordModifiedDuringLogin"] = 150022032] = "PasswordModifiedDuringLogin";
    NTLoginErrorCode[NTLoginErrorCode["ProofWater"] = 140022008] = "ProofWater";
    NTLoginErrorCode[NTLoginErrorCode["Protect"] = 140022006] = "Protect";
    NTLoginErrorCode[NTLoginErrorCode["RefusePasswordLogin"] = 140022009] = "RefusePasswordLogin";
    NTLoginErrorCode[NTLoginErrorCode["RemindCancelledStatus"] = 150022028] = "RemindCancelledStatus";
    NTLoginErrorCode[NTLoginErrorCode["Scan"] = 1] = "Scan";
    NTLoginErrorCode[NTLoginErrorCode["Success"] = 0] = "Success";
    NTLoginErrorCode[NTLoginErrorCode["SecBeat"] = 140022017] = "SecBeat";
    NTLoginErrorCode[NTLoginErrorCode["SmsInvalid"] = 150022026] = "SmsInvalid";
    NTLoginErrorCode[NTLoginErrorCode["Strict"] = 140022007] = "Strict";
    NTLoginErrorCode[NTLoginErrorCode["SystemFailed"] = 140022002] = "SystemFailed";
    NTLoginErrorCode[NTLoginErrorCode["TestUinLoginNeedChangePwdLimit"] = 150022034] = "TestUinLoginNeedChangePwdLimit";
    NTLoginErrorCode[NTLoginErrorCode["TgtGtExchangeA1Forbid"] = 150022027] = "TgtGtExchangeA1Forbid";
    NTLoginErrorCode[NTLoginErrorCode["TimeoutRetry"] = 140022003] = "TimeoutRetry";
    NTLoginErrorCode[NTLoginErrorCode["TooManyTimesToday"] = 150022023] = "TooManyTimesToday";
    NTLoginErrorCode[NTLoginErrorCode["TooOften"] = 150022022] = "TooOften";
    NTLoginErrorCode[NTLoginErrorCode["Unregistered"] = 150022024] = "Unregistered";
    NTLoginErrorCode[NTLoginErrorCode["UnusualDevice"] = 140022011] = "UnusualDevice";
})(NTLoginErrorCode || (NTLoginErrorCode = {}));
export var QrcodeResult;
(function (QrcodeResult) {
    QrcodeResult[QrcodeResult["OtherError"] = 0] = "OtherError";
    QrcodeResult[QrcodeResult["Timeout"] = 17] = "Timeout";
    QrcodeResult[QrcodeResult["WaitingForScan"] = 48] = "WaitingForScan";
    QrcodeResult[QrcodeResult["WaitingForConfirm"] = 53] = "WaitingForConfirm";
    QrcodeResult[QrcodeResult["Canceled"] = 54] = "Canceled";
})(QrcodeResult || (QrcodeResult = {}));
export var SSOErrorCode;
(function (SSOErrorCode) {
    SSOErrorCode[SSOErrorCode["UserExtired"] = -12003] = "UserExtired";
    SSOErrorCode[SSOErrorCode["BanStateForbidWriteReq"] = -10203] = "BanStateForbidWriteReq";
    SSOErrorCode[SSOErrorCode["BanStateForbidWriteCmd"] = -10201] = "BanStateForbidWriteCmd";
    SSOErrorCode[SSOErrorCode["BanStateEnd"] = -10200] = "BanStateEnd";
    SSOErrorCode[SSOErrorCode["BanStateBegin"] = -10300] = "BanStateBegin";
    SSOErrorCode[SSOErrorCode["RateLimitExceeded"] = -10132] = "RateLimitExceeded";
    SSOErrorCode[SSOErrorCode["ConnectAccessDenied"] = -10131] = "ConnectAccessDenied";
    SSOErrorCode[SSOErrorCode["SendA2CheckReqFailed"] = -10130] = "SendA2CheckReqFailed";
    SSOErrorCode[SSOErrorCode["A2RspTimeout"] = -10129] = "A2RspTimeout";
    SSOErrorCode[SSOErrorCode["UncompressedFailed"] = -10128] = "UncompressedFailed";
    SSOErrorCode[SSOErrorCode["GuestModeSafeHit"] = -10127] = "GuestModeSafeHit";
    SSOErrorCode[SSOErrorCode["GuestModeNoRight"] = -10126] = "GuestModeNoRight";
    SSOErrorCode[SSOErrorCode["TeaEmptyButHasA2"] = -10125] = "TeaEmptyButHasA2";
    SSOErrorCode[SSOErrorCode["TeaEmptyButHasUid"] = -10124] = "TeaEmptyButHasUid";
    SSOErrorCode[SSOErrorCode["WebjsapiLoginCheckFail"] = -10123] = "WebjsapiLoginCheckFail";
    SSOErrorCode[SSOErrorCode["ProductNoRight"] = -10122] = "ProductNoRight";
    SSOErrorCode[SSOErrorCode["NotTestUin"] = -10121] = "NotTestUin";
    SSOErrorCode[SSOErrorCode["InvalidPressure"] = -10120] = "InvalidPressure";
    SSOErrorCode[SSOErrorCode["V20Disabled"] = -10119] = "V20Disabled";
    SSOErrorCode[SSOErrorCode["ParseFailed"] = -10118] = "ParseFailed";
    SSOErrorCode[SSOErrorCode["AppidInvalid"] = -10117] = "AppidInvalid";
    SSOErrorCode[SSOErrorCode["RsNoInstance"] = -10116] = "RsNoInstance";
    SSOErrorCode[SSOErrorCode["CmdNotConfiged"] = -10115] = "CmdNotConfiged";
    SSOErrorCode[SSOErrorCode["SubConnFailed"] = -10114] = "SubConnFailed";
    SSOErrorCode[SSOErrorCode["DecryptPingFailed"] = -10113] = "DecryptPingFailed";
    SSOErrorCode[SSOErrorCode["BlackIPv6Cmd"] = -10112] = "BlackIPv6Cmd";
    SSOErrorCode[SSOErrorCode["NotWhiteIPv6Cmd"] = -10111] = "NotWhiteIPv6Cmd";
    SSOErrorCode[SSOErrorCode["NotWhiteIPv6Uin"] = -10110] = "NotWhiteIPv6Uin";
    SSOErrorCode[SSOErrorCode["LoginMergeFailed"] = -10107] = "LoginMergeFailed";
    SSOErrorCode[SSOErrorCode["ForceResetKey"] = -10106] = "ForceResetKey";
    SSOErrorCode[SSOErrorCode["InvalidCookie"] = -10009] = "InvalidCookie";
    SSOErrorCode[SSOErrorCode["RequireA2D2"] = -10008] = "RequireA2D2";
    SSOErrorCode[SSOErrorCode["VerifyTimeout"] = -10007] = "VerifyTimeout";
    SSOErrorCode[SSOErrorCode["D2UinNotMatch"] = -10006] = "D2UinNotMatch";
    SSOErrorCode[SSOErrorCode["RequireD2Encrypted"] = -10005] = "RequireD2Encrypted";
    SSOErrorCode[SSOErrorCode["InvalidA2Conn"] = -10004] = "InvalidA2Conn";
    SSOErrorCode[SSOErrorCode["InvalidA2D2"] = -10003] = "InvalidA2D2";
    SSOErrorCode[SSOErrorCode["VerifyCode"] = -10000] = "VerifyCode";
    SSOErrorCode[SSOErrorCode["D2Expired"] = -10001] = "D2Expired";
    SSOErrorCode[SSOErrorCode["ConnectionFull"] = -302] = "ConnectionFull";
    SSOErrorCode[SSOErrorCode["A3Error"] = 210] = "A3Error";
    SSOErrorCode[SSOErrorCode["DocComm"] = 60] = "DocComm";
    SSOErrorCode[SSOErrorCode["TimComm"] = 50] = "TimComm";
    SSOErrorCode[SSOErrorCode["NtFuncMessage"] = 32] = "NtFuncMessage";
    SSOErrorCode[SSOErrorCode["ProtoV21"] = 21] = "ProtoV21";
    SSOErrorCode[SSOErrorCode["DeviceApp"] = 21] = "DeviceApp";
    SSOErrorCode[SSOErrorCode["ProtoV20"] = 20] = "ProtoV20";
    SSOErrorCode[SSOErrorCode["DeviceComm"] = 20] = "DeviceComm";
    SSOErrorCode[SSOErrorCode["PressureMessage"] = 16] = "PressureMessage";
    SSOErrorCode[SSOErrorCode["QcallGuest"] = 11] = "QcallGuest";
    SSOErrorCode[SSOErrorCode["QcallComm"] = 10] = "QcallComm";
    SSOErrorCode[SSOErrorCode["GrayMessage"] = 8] = "GrayMessage";
    SSOErrorCode[SSOErrorCode["ConnectComm"] = 6] = "ConnectComm";
    SSOErrorCode[SSOErrorCode["QqGuest"] = 5] = "QqGuest";
    SSOErrorCode[SSOErrorCode["MultiEnvMessage"] = 4] = "MultiEnvMessage";
    SSOErrorCode[SSOErrorCode["NeedSignatureFlag"] = 4] = "NeedSignatureFlag";
    SSOErrorCode[SSOErrorCode["QqGidForTeaKeyemp"] = 4] = "QqGidForTeaKeyemp";
    SSOErrorCode[SSOErrorCode["IpOriginDispatchDomain"] = 4] = "IpOriginDispatchDomain";
    SSOErrorCode[SSOErrorCode["IpDualStack"] = 3] = "IpDualStack";
    SSOErrorCode[SSOErrorCode["WifiXgNetwork"] = 3] = "WifiXgNetwork";
    SSOErrorCode[SSOErrorCode["UnencryptedVerifyD2"] = 3] = "UnencryptedVerifyD2";
    SSOErrorCode[SSOErrorCode["SecSignSome"] = 2] = "SecSignSome";
    SSOErrorCode[SSOErrorCode["EmptyKeyEncrypted"] = 2] = "EmptyKeyEncrypted";
    SSOErrorCode[SSOErrorCode["PoorNetworkFlag"] = 2] = "PoorNetworkFlag";
    SSOErrorCode[SSOErrorCode["IPv6Stack"] = 2] = "IPv6Stack";
    SSOErrorCode[SSOErrorCode["TraceMessage"] = 2] = "TraceMessage";
    SSOErrorCode[SSOErrorCode["XgNetwork"] = 2] = "XgNetwork";
    SSOErrorCode[SSOErrorCode["SecSignAll"] = 1] = "SecSignAll";
    SSOErrorCode[SSOErrorCode["DyeingMessage"] = 1] = "DyeingMessage";
    SSOErrorCode[SSOErrorCode["QqMail"] = 1] = "QqMail";
    SSOErrorCode[SSOErrorCode["WifiNetwork"] = 1] = "WifiNetwork";
    SSOErrorCode[SSOErrorCode["NoWifiBssidFlag"] = 1] = "NoWifiBssidFlag";
    SSOErrorCode[SSOErrorCode["IpOriginHardcodeIp"] = 1] = "IpOriginHardcodeIp";
    SSOErrorCode[SSOErrorCode["IPv4Stack"] = 1] = "IPv4Stack";
    SSOErrorCode[SSOErrorCode["D2Encrypted"] = 1] = "D2Encrypted";
    SSOErrorCode[SSOErrorCode["SecSignNone"] = 0] = "SecSignNone";
    SSOErrorCode[SSOErrorCode["ProtoV0"] = 0] = "ProtoV0";
    SSOErrorCode[SSOErrorCode["IpUndefined"] = 0] = "IpUndefined";
    SSOErrorCode[SSOErrorCode["IpOriginDefault"] = 0] = "IpOriginDefault";
    SSOErrorCode[SSOErrorCode["DefaultFlag"] = 0] = "DefaultFlag";
    SSOErrorCode[SSOErrorCode["Default"] = 0] = "Default";
    SSOErrorCode[SSOErrorCode["UndefinedNetwork"] = 0] = "UndefinedNetwork";
    SSOErrorCode[SSOErrorCode["Unencrypted"] = 0] = "Unencrypted";
    SSOErrorCode[SSOErrorCode["Success"] = 0] = "Success";
})(SSOErrorCode || (SSOErrorCode = {}));
export class BaseClient extends Trapper {
    get useQQNT() {
        return !!(this.QQNT && this.apk.nt);
    }
    get useNTLogin() {
        return !!(this.useQQNT && this.NTLogin && this.apk.nt_login && this.sig.nt_session);
    }
    get defaultCmdWhiteList() {
        return defaultCmdWhiteList.concat();
    }
    ;
    constructor(p = Platform.Android, d, config) {
        super();
        this.config = config;
        this.nickname = "";
        this.QQNT = true;
        this.NTLogin = true;
        this.sign_type = "";
        this[_a] = false;
        this[_b] = false;
        this[_c] = () => {
            if (!this.isOnline())
                return;
            const list = this[MergeSendList].splice(0, 30);
            if (list.length)
                list.length > 1
                    ? this.sendMergeUni(list, 0)
                    : this.writeUni(list[0].cmd, list[0].body, list[0].seq);
        };
        this[_d] = setInterval(this[MergeSendListHandler], 1000);
        this[_e] = new Ecdh();
        this[_f] = new Network();
        // 回包的回调函数
        this[_g] = new Map();
        this.sig = new Proxy({
            seq: randomBytes(4).readUInt32BE() & 0xfff,
            req_id: 0,
            qrsig: BUF0,
            session: randomBytes(4),
            randkey: randomBytes(16),
            tgtgt: randomBytes(16),
            d2_key_old: BUF16,
            tlvs: {
                0x103: BUF0,
                0x104: BUF0,
                0x106: BUF0,
                0x108: BUF0,
                0x10a: BUF0,
                0x10c: BUF0,
                0x10d: BUF0,
                0x10e: BUF0,
                0x114: BUF0,
                0x120: BUF0,
                0x133: BUF0,
                0x134: BUF0,
                0x143: BUF0,
                0x16a: BUF0,
                0x174: BUF0,
                0x305: BUF0,
                0x322: BUF0,
                0x402: BUF0,
                0x403: BUF0,
                0x512: BUF0,
                0x543: BUF0,
                0x546: BUF0,
                0x547: BUF0,
                0x550: BUF0,
                0x553: BUF0,
            },
            nt_captcha: null,
            nt_session: {
                key: BUF0,
                ticket: BUF0,
                expire_time: 0
            },
            nt_login_cookie: null,
            nt_unusual_device_check_sig: null,
            /** 大数据上传通道 */
            bigdata: {
                ip: "",
                port: 0,
                sig_session: BUF0,
                session_key: BUF0,
            },
            /** 心跳包 */
            hb480: () => {
                const buf = Buffer.alloc(9);
                buf.writeUInt32BE(this.uin);
                buf.writeInt32BE(0x19e39, 5);
                return pb.encode({
                    1: 1152,
                    2: 9,
                    4: buf,
                });
            },
            last_sso_heartbeat: 0,
            ssoHeartBeat: () => {
                return pb.encode({
                    1: 1,
                    2: {
                        1: 1,
                    },
                    3: 100,
                    4: this.sig.last_sso_heartbeat,
                });
            },
            hb_time: 0,
            /** 签名api地址 */
            sign_api_addr: "",
            /** 上次cookie刷新时间 */
            emp_time: 0,
            time_diff: 0,
            request_token_time: 0,
            /** token登录重试计数 */
            token_retry_count: 0,
            /** 上线失败重试计数 */
            register_retry_count: 0,
            rkey_info: {},
        }, {
            get(target, name) {
                const key = name.toString();
                if (TlvTags.has(key)) {
                    const value = target.tlvs[TlvTags.get(key)];
                    return value instanceof Buffer ? Buffer.from(value) : value;
                }
                else {
                    return target[key];
                }
            },
            set(target, name, newValue, receiver) {
                const key = name.toString();
                if (TlvTags.has(key)) {
                    const oldValue = target.tlvs[TlvTags.get(key)];
                    target.tlvs[TlvTags.get(key)] = newValue || oldValue;
                }
                else {
                    target[key] = newValue;
                }
                return true;
            },
        });
        this.pkg = pkgJson;
        this.pskey = {};
        this.pt4token = {};
        /** 心跳间隔(秒) */
        this.interval = 60;
        this.ssoInterval = 270;
        /** token刷新间隔(秒) */
        this.emp_interval = 12 * 3600;
        /** 随心跳一起触发的函数，可以随意设定 */
        this.heartbeat = NOOP;
        /** token登录重试次数 */
        this.token_retry_num = 2;
        /** 上线失败重试次数 */
        this.register_retry_num = 3;
        this.login_timer = null;
        /** 数据统计 */
        this.statistics = {
            start_time: timestamp(),
            lost_times: 0,
            recv_pkt_cnt: 0,
            sent_pkt_cnt: 0,
            lost_pkt_cnt: 0,
            recv_msg_cnt: 0,
            sent_msg_cnt: 0,
            msg_cnt_per_min: 0,
            remote_ip: "",
            remote_port: 0,
            ver: "",
        };
        this.signCmd = [];
        this.ssoPacketList = [];
        this[_h] = [];
        if (Object.keys(config).includes("QQNT"))
            this.QQNT = config.QQNT;
        if (Object.keys(config).includes("NTLogin"))
            this.NTLogin = config.NTLogin;
        if (config.log_config)
            log4js.configure(config.log_config);
        this.apk = this.getApkInfo(p, config.ver);
        this.device = new Device(this.apk, d);
        this[NET].on("error", err => this.emit("internal.verbose", err.message, VerboseLevel.Error));
        this[NET].on("close", () => {
            this.statistics.remote_ip = "";
            this.statistics.remote_port = 0;
            this[NET].remoteAddress &&
                this.emit("internal.verbose", `${this[NET].remoteAddress}:${this[NET].remotePort} closed`, VerboseLevel.Mark);
        });
        this[NET].on("connect2", () => {
            this.statistics.remote_ip = this[NET].remoteAddress;
            this.statistics.remote_port = this[NET].remotePort;
            this.emit("internal.verbose", `${this[NET].remoteAddress}:${this[NET].remotePort} connected`, VerboseLevel.Mark);
            this.syncTimeDiff();
        });
        this[NET].on("packet", packetListener.bind(this));
        this[NET].on("lost", lostListener.bind(this));
        this.on("internal.online", onlineListener);
        this.on("internal.sso", ssoListener);
        Object.defineProperty(this, "apk", { writable: false });
        lock(this, "device");
        lock(this, "sig");
        lock(this, "pskey");
        lock(this, "pt4token");
        lock(this, "statistics");
        hide(this, "heartbeat");
        hide(this, "interval");
    }
    /** 设置连接服务器，不设置则自动搜索 */
    setRemoteServer(host, port) {
        if (host && port) {
            this[NET].host = host;
            this[NET].port = port;
            this[NET].auto_search = false;
        }
        else {
            this[NET].auto_search = true;
        }
    }
    setSignServer(addr, extSign = { sign_type: "" }) {
        unlock(this, "sig");
        try {
            // 规范化URL
            const url = new URL(addr.includes("://") ? addr : `http://${addr}`);
            // 规范化路径
            url.pathname = url.pathname.replace(/\/?$/, "/").replace(/sign\/$/, "");
            this.sig.sign_api_addr = url.href;
            // 选择sign实现
            const sign = extSign?.sign_type?.length
                ? extSign
                : url.searchParams.has("key") ? import_qsign : import_sign;
            Object.assign(this, sign);
        }
        finally {
            lock(this, "sig");
            this.emit("internal.verbose", `SignServer: ${this.sign_type}`, VerboseLevel.Mark);
        }
    }
    on(matcher, listener) {
        return this.trap(matcher, listener);
    }
    once(matcher, listener) {
        return this.trapOnce(matcher, listener);
    }
    off(matcher) {
        return this.offTrap(matcher);
    }
    emit(matcher, ...args) {
        return this.trip(matcher, ...args);
    }
    /** 是否为在线状态 (可以收发业务包的状态) */
    isOnline() {
        return this[IS_ONLINE];
    }
    /** 下线 (keepalive: 是否保持tcp连接) */
    async logout(keepalive = false) {
        await this.register(true).catch(err => err);
        if (!keepalive && this[NET].connected) {
            this.terminate();
            await new Promise(resolve => this[NET].once("close", resolve));
        }
        this.emit("internal.offline", "主动下线");
    }
    /** 关闭连接 */
    terminate() {
        this[IS_ONLINE] = false;
        this[NET].destroy();
    }
    getApkInfo(platform, ver) {
        //if (platform == Platform.iPad) platform = Platform.aPad
        const apks = this.getApkInfoList(platform);
        return apks.find(val => val.ver === ver || val.version === ver) || apks[0];
    }
    getApkInfoList(platform) {
        return getApkInfoList.call(this, platform);
    }
    async switchQQVer(ver = "", force) {
        if (this.config.ver && !force) {
            this.statistics.ver = this.config.ver;
            return false;
        }
        if (!this.sign_type && this.config.sign_api_addr)
            await this.setSignServer(this.config.sign_api_addr);
        const old_ver = this.statistics.ver || this.config.ver;
        ver = ver || (await this.getApiQQVer());
        if (old_ver != ver) {
            const new_apk = this.getApkInfo(this.config.platform, ver);
            if (new_apk.ver === ver || new_apk.version === ver) {
                Object.defineProperty(this, "apk", { writable: true });
                this.apk = new_apk;
                Object.defineProperty(this, "apk", { writable: false });
                this.device.apk = this.apk;
                this.statistics.ver = ver;
                return true;
            }
        }
        return false;
    }
    async updateCmdWhiteList() {
        let list = await this.getCmdWhiteList();
        if (list?.length)
            this.signCmd = Array.from(new Set(this.signCmd.concat(list)));
    }
    async getCmdWhiteList() {
        return this.defaultCmdWhiteList;
    }
    async getApiQQVer() {
        return this.config.ver;
    }
    async getT544(cmd) {
        return this.generateT544Packet(cmd, BUF0);
    }
    async getSign(cmd, seq, body) {
        return BUF0;
    }
    async apiPing(pathname) {
        return { code: -1 };
    }
    async requestSignToken() {
        return [];
    }
    async submitSsoPacket(cmd, callbackId, body) {
        return [];
    }
    refreshToken(force = false) {
        return refreshToken.call(this, force);
    }
    /** 使用接收到的token登录 */
    async tokenLogin(token = BUF0, subcmd = 15) {
        if (token?.length) {
            this.sig.randkey = randomBytes(16);
            this.sig.session = randomBytes(4);
            this[ECDH] = new Ecdh();
            try {
                const stream = Readable.from(token, { objectMode: false });
                let info = stream.read(stream.read(2).readUInt16BE());
                if ((String(info) || "").includes("icqq")) {
                    const parseTokenRet = parseToken.call(this, token, 2);
                    if (parseTokenRet === null)
                        throw new Error("无效的token");
                    info = parseTokenRet.info;
                    if (info.token_ver <= 3 || !this.sig.a1_key?.length) {
                        subcmd = 11;
                        this.sig.tgtgt = md5(this.sig.d2_key);
                    }
                    if (info.token_ver >= 5 &&
                        info.apk.app_key?.length &&
                        info.apk.app_key === this.apk.app_key &&
                        info.device.guid === this.device.guid.toString("hex")) {
                        this.device.qImei16 = info.device.qImei16;
                        this.device.qImei36 = info.device.qImei36;
                    }
                    if (info.apk.version != this.apk.version) {
                        if (info.apk.id != this.apk.id) {
                            this.sig.token_retry_count = this.token_retry_num;
                            await this.token_expire({ source: "login" });
                            return BUF0;
                        }
                        else if (!this.statistics.ver) {
                            if (await this.switchQQVer(info.apk.ver)) {
                                this.emit("internal.verbose", `[${this.uin}]获取到token协议版本：${this.statistics.ver}`, VerboseLevel.Mark);
                                const apk_info = `${this.apk.display}_${this.apk.version}`;
                                this.emit("internal.verbose", `[${this.uin}]使用协议：${apk_info}`, VerboseLevel.Mark);
                                await this.device.getQIMEI();
                            }
                        }
                    }
                    if (this.sig.token_retry_count === 0 && info.token_ver >= 3) {
                        const { nickname } = info.user;
                        const ret = await this.register();
                        if (ret === 1) {
                            this.sig.emp_time = info.emp_time;
                            this.sig.register_retry_count = 0;
                            await this.updateCmdWhiteList();
                            await this.ssoPacketListHandler(null);
                            this.emit("internal.online", BUF0, nickname);
                        }
                        else {
                            this.token_expire({ source: "login" });
                        }
                        return BUF0;
                    }
                }
                else {
                    this.sig.d2_key = info;
                    this.sig.d2 = stream.read(stream.read(2).readUInt16BE());
                    this.sig.tgt = stream.read(stream.read(2).readUInt16BE());
                    this.sig.ticket_key = stream.read(stream.read(2).readUInt16BE());
                    this.sig.sig_key = stream.read(stream.read(2).readUInt16BE());
                    this.sig.srm_token = stream.read(stream.read(2).readUInt16BE());
                    this.sig.tgt = stream.read(stream.read(2).readUInt16BE());
                    this.sig.md5Pass = stream.read(stream.read(2).readUInt16BE());
                    this.sig.device_token = stream.read(stream.read(2).readUInt16BE());
                    try {
                        this.sig.t543 = stream.read(stream.read(2).readUInt16BE()) || BUF0;
                    }
                    catch { }
                }
            }
            catch (err) {
                this.emit("internal.verbose", "旧版token于当前版本不兼容，请手动删除token后重新运行", VerboseLevel.Error);
                this.emit("internal.verbose", "若非无法登录，请勿随意升级版本", VerboseLevel.Warn);
                this.emit("internal.error.login", 123456, `token不兼容`);
                return BUF0;
            }
        }
        if (this.useQQNT && this.useNTLogin && this.sig.a1?.length && this.apk.appid !== 16)
            return await this.ntTokenLogin(!token?.length);
        subcmd =
            this.sig.srm_token?.length && this.sig.a1?.length && this.sig.a1_key?.length
                ? subcmd
                : 11;
        this.sig.tgtgt = subcmd === 15 ? this.sig.a1_key : md5(this.sig.d2_key);
        const tlvs = [
            [0x8],
            [0x18],
            [0x100],
            [0x116],
            [0x141],
            [0x142],
            [0x144],
            [0x145],
            [0x147],
            [0x154],
            [0x177],
            [0x187],
            [0x188],
            [0x511],
            //[0x542],
            //[0x548],
        ];
        tlvs.push(...(subcmd === 15
            ? [[0x1], [0x106], [0x107], [0x16a], [0x516], [0x521, 0], [0x525]]
            : [[0x108], [0x10a], [0x112], [0x143]]));
        const body = await buildLoginTLV.call(this, subcmd, tlvs, true, subcmd === 11 ? "810_a" : "810_f");
        if (token != BUF0) {
            await this[FN_SEND_LOGIN]("wtlogin.exchange_emp", body);
            return BUF0;
        }
        return body;
    }
    /**
     * 使用密码登录
     * @param uin 登录账号
     * @param md5pass 密码的md5值
     */
    async passwordLogin(uin, md5pass) {
        this.uin = uin;
        this.sig.session = randomBytes(4);
        this.sig.randkey = randomBytes(16);
        this.sig.tgtgt = randomBytes(16);
        this[ECDH] = new Ecdh();
        if (this.useQQNT && this.useNTLogin)
            return this.ntPasswordLogin(md5pass);
        const t = tlv.getPacker(this);
        const tlvs = [
            [0x1],
            [0x8],
            [0x18],
            [0x100],
            [0x106, md5pass],
            [0x107],
            [0x116],
            [0x141],
            [0x142],
            [0x144],
            [0x145],
            [0x147],
            [0x154],
            [0x177],
            [0x187],
            [0x188],
            [0x191],
            [0x511],
            [0x516],
            [0x521, 0],
            [0x525],
            [0x542],
            [0x548],
        ];
        this[FN_SEND_LOGIN]("wtlogin.login", await buildLoginTLV.call(this, 0x9, tlvs));
    }
    /** 收到滑动验证码后，用于提交滑动验证码 */
    async submitSlider(ticket) {
        ticket = String(ticket).trim();
        if (this.sig.nt_captcha)
            return this.ntSubmitCaptcha(...ticket.split(','));
        try {
            if (this.sig.t546.length)
                this.sig.t547 = calcPoW.call(this, this.sig.t546);
        }
        catch (err) {
            this.sig.t547 = BUF0;
        }
        const tlvs = [[0x8], [0x104], [0x116], [0x193, ticket], [0x542], [0x547]];
        this[FN_SEND_LOGIN]("wtlogin.login", await buildLoginTLV.call(this, 0x2, tlvs));
    }
    /** 收到设备锁验证请求后，用于发短信 */
    async sendSmsCode() {
        const tlvs = [[0x8], [0x104], [0x116], [0x174], [0x17a], [0x197]];
        this[FN_SEND_LOGIN]("wtlogin.login", await buildLoginTLV.call(this, 0x8, tlvs, false));
    }
    /** 提交短信验证码 */
    async submitSmsCode(code) {
        code = String(code).trim();
        if (Buffer.byteLength(code) !== 6)
            code = "123456";
        const tlvs = [[0x8], [0x104], [0x116], [0x174], [0x17c, code], [0x198], [0x401], [0x547]];
        this[FN_SEND_LOGIN]("wtlogin.login", await buildLoginTLV.call(this, 0x7, tlvs));
    }
    /** 获取登录二维码 */
    async fetchQrcode() {
        this.uin = 0;
        const t = tlv.getPacker(this);
        const tlvs = [
            t(0x16),
            t(0x1b),
            t(0x1d),
            t(0x1f),
            t(0x33),
            t(0x35, this.apk.device_type),
            t(0x66, this.apk.device_type),
            t(0xd1),
        ];
        let writer = new Writer()
            .writeU16(0)
            .writeU32(this.apk.appid)
            .writeU64(0)
            .writeU8(8)
            .writeTlv(BUF0)
            .writeU16(tlvs.length);
        for (let tlv of tlvs) {
            writer.writeBytes(tlv);
        }
        const pkt = buildQrcodePacket.call(this, 0x31, writer.read());
        this.sendPacket(pkt, 6, -1, { cmd: "wtlogin.trans_emp", type: 0xa, encrypt: 0x2 })
            .then(payload => {
            payload = decryptLoginPacket.call(this, payload);
            const stream = Readable.from(payload, { objectMode: false });
            stream.read(2);
            stream.read(2).readUInt16BE(); //length
            stream.read(1);
            //read(length)
            stream.read(1); //0x2
            stream.read(2).readUInt16BE();
            stream.read(2).readUInt16BE(); //cmdid
            stream.read(21 + 1 + 2 + 2 + 4 + 8 + 2 + 4);
            const retcode = stream.read(1).readUInt8();
            const qrsig = stream.read(stream.read(2).readUInt16BE());
            if (retcode === 0) {
                stream.read(2);
                const t = readTlv(stream);
                if (t[0x17]) {
                    this.sig.qrsig = qrsig;
                    this.emit("internal.qrcode", t[0x17], pb.decode(t[0xd1]));
                }
                else {
                    this.emit("internal.error.qrcode", retcode, "获取二维码失败，请重试");
                }
            }
            else {
                this.emit("internal.error.qrcode", retcode, String(qrsig || "获取二维码失败，请重试"));
            }
        })
            .catch(() => this.emit("internal.error.network", -2, "server is busy"));
    }
    async fetchLogin(sig) {
        const t = tlv.getPacker(this);
        const tlvs = [
            t(0x11, sig),
            t(0x16),
            t(0x1b),
            t(0x1d),
            t(0x1f),
            t(0x33),
            t(0x35, this.apk.device_type),
            t(0x66, this.apk.device_type),
            t(0xd1),
        ];
        let writer = new Writer()
            .writeU16(0)
            .writeU32(this.apk.appid)
            .writeU64(0)
            .writeU8(8)
            .writeTlv(BUF0)
            .writeU16(tlvs.length);
        for (let tlv of tlvs) {
            writer.writeBytes(tlv);
        }
        const pkt = buildQrcodePacket.call(this, 0x31, writer.read());
        try {
            let payload = await this.sendPacket(pkt, 6, -1, {
                cmd: "wtlogin.trans_emp",
                type: 0xa,
                encrypt: 0x2,
            });
            payload = decryptLoginPacket.call(this, payload);
            const stream = Readable.from(payload, { objectMode: false });
            stream.read(2);
            stream.read(2).readUInt16BE(); //length
            stream.read(1);
            //read(length)
            stream.read(1); //0x2
            stream.read(2).readUInt16BE();
            stream.read(2).readUInt16BE(); //cmdid
            stream.read(21 + 1 + 2 + 2 + 4 + 8 + 2 + 4);
            const retcode = stream.read(1).readUInt8();
            const qrsig = stream.read(stream.read(2).readUInt16BE());
            if (retcode !== 0)
                return { retcode, retmsg: String(qrsig) };
            stream.read(2);
            const t = readTlv(stream);
            return { retcode, qrsig, t };
        }
        catch { }
        return { retcode: -1, qrsig: BUF0 };
    }
    /** 扫码后调用此方法登录 */
    async qrcodeLogin() {
        const { retcode, uin, t106, t16a, t318, tgtgt } = await this.queryQrcodeResult();
        if (retcode < 0) {
            this.emit("internal.error.network", -2, "server is busy");
        }
        else if (retcode === 0 && t106 && t16a && t318 && tgtgt) {
            this.uin = uin;
            this.sig.qrsig = BUF0;
            this.sig.tgtgt = this.sig.a1_key = tgtgt;
            this.sig.a1 = t106;
            this.sig.srm_token = t16a;
            const tlvs = [
                [0x1],
                [0x8],
                [0x18],
                [0x100],
                [0x106],
                [0x107],
                [0x116, []],
                [0x141],
                [0x142],
                [0x144],
                [0x145],
                [0x147],
                [0x154],
                [0x16a],
                [0x177],
                [0x187],
                [0x188],
                [0x191],
                [0x511],
                [0x516],
                [0x521, this.apk.device_type],
                new Writer().writeU16(0x318).writeTlv(t318).read(),
            ];
            this[FN_SEND_LOGIN]("wtlogin.login", await buildLoginTLV.call(this, 0x9, tlvs));
        }
        else {
            let message;
            switch (retcode) {
                case QrcodeResult.Timeout:
                    message = "二维码超时，请重新获取";
                    break;
                case QrcodeResult.WaitingForScan:
                    message = "二维码尚未扫描";
                    break;
                case QrcodeResult.WaitingForConfirm:
                    message = "二维码尚未确认";
                    break;
                case QrcodeResult.Canceled:
                    message = "二维码被取消，请重新获取";
                    break;
                default:
                    message = "扫码遇到未知错误，请重新获取";
                    break;
            }
            this.emit("internal.error.qrcode", retcode, message);
        }
    }
    /** 获取扫码结果(可定时查询，retcode为0则调用qrcodeLogin登录) */
    async queryQrcodeResult() {
        let retcode = -1, uin, t106, t16a, t318, tgtgt;
        if (!this.sig.qrsig.length)
            return { retcode, uin, t106, t16a, t318, tgtgt };
        const body = new Writer()
            /*.writeU16(5)
            .writeU8(1)
            .writeU32(8)*/
            .writeU16(0)
            .writeU32(this.apk.appid)
            .writeTlv(this.sig.qrsig)
            .writeU64(0)
            .writeU8(8)
            .writeTlv(BUF0)
            .writeU16(0)
            .read();
        const pkt = buildQrcodePacket.call(this, 0x12, body);
        try {
            let payload = await this.sendPacket(pkt, 6, -1, {
                cmd: "wtlogin.trans_emp",
                type: 0xa,
                encrypt: 0x2,
            });
            payload = decryptLoginPacket.call(this, payload);
            const stream = Readable.from(payload, { objectMode: false });
            stream.read(2);
            stream.read(2).readUInt16BE(); //length
            stream.read(1);
            //read(length)
            stream.read(1); //0x2
            stream.read(2).readUInt16BE();
            stream.read(2).readUInt16BE(); //cmdid
            stream.read(21 + 1 + 2 + 2 + 4 + 8 + 2 + 4);
            retcode = stream.read(1).readUInt8();
            if (retcode === 0) {
                stream.read(4);
                uin = stream.read(4).readUInt32BE();
                stream.read(6);
                const t = readTlv(stream);
                t106 = t[0x18];
                t16a = t[0x19];
                t318 = t[0x65] || BUF0;
                tgtgt = t[0x1e];
            }
        }
        catch { }
        return { retcode, uin, t106, t16a, t318, tgtgt };
    }
    async keyExchange() {
        this.sig.nt_session = null;
        const uin = 0;
        const plain1 = pb.encode({
            1: "",
            2: this.device.guid
        });
        const gcmCalc1 = aesGcmEncrypt(plain1, this[ECDH].nt_share_key);
        const ts = Date.now();
        const plain2 = new Writer()
            .writeBytes(this[ECDH].public_key)
            .writeU32(1) // type
            .writeBytes(gcmCalc1)
            .writeU64(ts);
        const hash = sha256(plain2.read());
        const gcmCalc2 = aesGcmEncrypt(hash, Buffer.from('e2733bf403149913cbf80c7a95168bd4ca6935ee53cd39764beebe2e007e3aee', 'hex'));
        const packet = pb.encode({
            1: this[ECDH].public_key,
            2: 1,
            3: gcmCalc1,
            4: ts,
            5: gcmCalc2,
        });
        const seq = this[FN_NEXT_SEQ]();
        const resp = await this.sendPacket(packet, 6, seq, {
            cmd: 'trpc.login.ecdh.EcdhService.SsoKeyExchange', type: 0xa, encrypt: 0x2, extra: {
                uin
            }
        });
        const pbResp = pb.decode(resp);
        if (!(pbResp[1]?.length && pbResp[3]?.length))
            return false;
        const shareKey = this[ECDH].ntExchange(pbResp[3].toBuffer());
        const decrypted = aesGcmDecrypt(pbResp[1].toBuffer(), shareKey);
        const pbDecrypted = pb.decode(decrypted);
        this.sig.nt_session = {
            key: pbDecrypted[1].toBuffer(),
            ticket: pbDecrypted[2].toBuffer(),
            expire_time: timestamp() + pbDecrypted[3]
        };
        this.emit('internal.verbose', `key xchg successfully, session: ${pbDecrypted[3]}s`, VerboseLevel.Debug);
        return true;
    }
    async ntPasswordLogin(md5pass) {
        const t = tlv.getPacker(this);
        this.sig.a1 = t(0x106, md5pass, true).subarray(4);
        return this[FN_SEND_LOGIN](`trpc.login.ecdh.EcdhService.${this.sig.nt_unusual_device_check_sig ? "SsoNTLoginPasswordLoginUnusualDevice" : "SsoNTLoginPasswordLogin"}`, this.sig.a1);
    }
    async ntSubmitCaptcha(ticket, randStr) {
        if (!this.sig.nt_captcha || !this.sig.a1?.length)
            return;
        this.sig.nt_captcha.ticket = ticket;
        this.sig.nt_captcha.randStr = randStr;
        return this[FN_SEND_LOGIN]("trpc.login.ecdh.EcdhService.SsoNTLoginPasswordLogin", this.sig.a1);
    }
    async ntTokenLogin(refresh = false) {
        const cmd = `trpc.login.ecdh.EcdhService.${this.sig.no_pic_sig.length ? "SsoNTLoginRefreshTicket" : "SsoNTLoginEasyLogin"}`;
        if (refresh)
            return await buildNTLoginPacket.call(this, cmd);
        await this[FN_SEND_LOGIN](cmd, this.sig.a1);
        return BUF0;
    }
    [(_a = IS_ONLINE, _b = LOGIN_LOCK, _c = MergeSendListHandler, _d = MergeSendTimer, _e = ECDH, _f = NET, _g = HANDLERS, _h = MergeSendList, FN_NEXT_SEQ)]() {
        if (++this.sig.seq >= 0x8000)
            this.sig.seq = 1;
        return this.sig.seq;
    }
    [FN_SEND](pkt, timeout = 6, seq = -1) {
        this.statistics.sent_pkt_cnt++;
        if (typeof seq !== "number" || seq < 0)
            seq = this.sig.seq;
        return new Promise((resolve, reject) => {
            const id = setTimeout(() => {
                this[HANDLERS].delete(seq);
                this.statistics.lost_pkt_cnt++;
                reject(new ApiRejection(-2, `packet timeout (seq: ${seq})`));
            }, timeout * 1000);
            this[NET].join(() => {
                this[NET].write(pkt, () => {
                    this[HANDLERS].set(seq, payload => {
                        clearTimeout(id);
                        this[HANDLERS].delete(seq);
                        if (payload instanceof ApiRejection)
                            return reject(payload);
                        resolve(payload);
                    });
                });
            });
        });
    }
    async sendPacket(body, timeout = 6, seq = -1, build) {
        if (typeof seq !== "number" || seq < 0)
            seq = build ? this[FN_NEXT_SEQ]() : this.sig.seq;
        if (!(body instanceof Buffer))
            body = Buffer.from(body);
        return this[FN_SEND](build
            ? await buildPacket.call(this, build.type, build.encrypt, build.cmd, body, seq, build.extra)
            : body, timeout, seq);
    }
    async [FN_SEND_LOGIN](cmd, body) {
        if (this[IS_ONLINE] || this[LOGIN_LOCK])
            return;
        if (cmd.startsWith("wtlogin.")) {
            const cmdid = ["wtlogin.trans_emp", "wtlogin.qrlogin"].includes(cmd) ? 0x812 : 0x810;
            const pkt = buildLoginPacket.call(this, cmdid, body);
            try {
                this[LOGIN_LOCK] = true;
                decodeLoginResponse.call(this, cmd, await this.sendPacket(pkt, 5, -1, { cmd, type: 0xa, encrypt: 0x2 }));
            }
            catch (e) {
                this[LOGIN_LOCK] = false;
                this.emit("internal.error.network", -2, "server is busy");
                this.emit("internal.verbose", e.message, VerboseLevel.Error);
                this.emit("internal.verbose", e.stack, VerboseLevel.Debug);
            }
        }
        else {
            this.sig.a1 = body;
            const pkt = await buildNTLoginPacket.call(this, cmd);
            try {
                this[LOGIN_LOCK] = true;
                decodeNTLoginResponse.call(this, cmd, await this.sendPacket(pkt, 5, -1, { cmd, type: 0xa, encrypt: 0x2 }));
            }
            catch (e) {
                this[LOGIN_LOCK] = false;
                this.emit("internal.error.network", -2, "server is busy");
                this.emit("internal.verbose", e.message, VerboseLevel.Error);
                this.emit("internal.verbose", e.stack, VerboseLevel.Debug);
            }
        }
    }
    /** 多个业务包合并发送
     * @param list 业务包列表（等待返回包时seq参数自动生成，填写无效）
     * @param timeout 超时时间（秒），默认6秒，为0时不等待返回
     */
    sendMergeUni(list, timeout = 6, extra) {
        list = list.map(val => {
            if (timeout)
                val.seq = this[FN_NEXT_SEQ]();
            return val;
        });
        const body = deflateSync(pb.encode({
            1: list.map(val => {
                return {
                    1: val.seq,
                    2: val.cmd,
                    3: val.body.length + 4,
                    4: val.body,
                    5: val.needResp ? 1 : 0,
                };
            }),
        }));
        return new Promise((resolve, reject) => {
            if (timeout) {
                const respList = list.map(val => {
                    return { seq: val.seq, cmd: val.cmd, payload: BUF0, recv: false };
                });
                const timer = setTimeout(() => {
                    listen();
                    resolve(respList);
                }, timeout * 1000);
                const listen = this.trap("internal.sso", (cmd, payload, seq) => {
                    const sso = respList.find(val => val.seq === seq);
                    if (sso) {
                        sso.payload = payload;
                        sso.recv = true;
                    }
                    if (!respList.find(val => !val.recv)) {
                        listen();
                        clearTimeout(timer);
                        resolve(respList);
                    }
                });
            }
            this.writeUni("SSO.LoginMerge", body, -1, extra);
            if (!timeout)
                resolve([]);
        });
    }
    /** 发送一个业务包不等待返回 */
    async writeUni(cmd, body, seq = -1, extra) {
        if (typeof seq !== "number" || seq < 0)
            seq = this[FN_NEXT_SEQ]();
        this.statistics.sent_pkt_cnt++;
        extra || (extra = {});
        const pkt = await buildPacket.call(this, 0xb, 0x1, cmd, Buffer.from(body), seq, extra);
        if (pkt.length > 0)
            this[NET].write(pkt);
    }
    /** dont use it if not clear the usage */
    sendOidb(cmd, body, timeout = 6, extra) {
        const sp = cmd //OidbSvc.0x568_22
            .replace("OidbSvc.", "")
            .replace("oidb_", "")
            .split("_");
        const type1 = parseInt(sp[0], 16), type2 = parseInt(sp[1]);
        body = pb.encode({
            1: type1,
            2: isNaN(type2) ? 1 : type2,
            3: 0,
            4: body,
            6: "android " + this.apk.ver,
        });
        return this.sendUni(cmd, body, timeout, extra);
    }
    /*async sendPacket(type: string, cmd: string, body: any, extra?: any): Promise<Buffer> {
        if (type === "Uni") return await this.sendUni(cmd, body);
        else return await this.sendOidb(cmd, body, 5, extra);
    }*/
    /** 发送一个业务包并等待返回 */
    async sendUni(cmd, body, timeout = 6, extra) {
        if (!this[IS_ONLINE])
            throw new ApiRejection(-1, `client not online (cmd: ${cmd})`);
        const seq = this[FN_NEXT_SEQ]();
        extra || (extra = {});
        if (extra?.merge === true) {
            timeout += 1;
            return new Promise((resolve, reject) => {
                const id = setTimeout(() => {
                    this[HANDLERS].delete(seq);
                    reject(new ApiRejection(-2, `packet timeout (seq: ${seq})`));
                }, timeout * 1000);
                this[HANDLERS].set(seq, payload => {
                    clearTimeout(id);
                    this[HANDLERS].delete(seq);
                    if (payload instanceof ApiRejection)
                        return reject(payload);
                    resolve(payload);
                });
                this[MergeSendList].push({ cmd, body, seq });
                if (this[MergeSendList].length >= 30)
                    this[MergeSendListHandler]();
            });
        }
        return this.sendPacket(body, timeout, seq, { cmd, type: 0xb, encrypt: 0x1, extra });
    }
    async sendOidbSvcTrpcTcp(cmd, body, extra) {
        let type1, type2;
        if (Array.isArray(cmd) && cmd.length > 2) {
            (type1 = cmd[1]), (type2 = cmd[2]);
            cmd = String(cmd[0]);
        }
        else {
            cmd = Array.isArray(cmd) ? String(cmd[0]) : cmd;
            const sp = cmd //OidbSvcTrpcTcp.0xf5b_1
                .replace("OidbSvcTrpcTcp.", "")
                .split("_");
            (type1 = parseInt(sp[0], 16)), (type2 = parseInt(sp[1]));
        }
        const _body = pb.encode({
            1: type1,
            2: type2,
            4: body,
            6: "android " + this.apk.ver,
        });
        const payload = await this.sendUni(cmd, _body, 5, extra);
        //log(payload)
        const rsp = pb.decode(payload);
        if (rsp[3] === 0)
            return rsp[4];
        throw new ApiRejection(rsp[3], rsp[5]);
    }
    async register(logout = false, reflush = false) {
        const ret = await new Promise(async (resolve) => {
            const re_register = async () => {
                const ret = this.useQQNT
                    ? await register.call(this, logout, reflush)
                    : await old_register.call(this, logout, reflush);
                if (ret === 1) {
                    this.sig.register_retry_count = 0;
                    resolve(ret);
                }
                else if (ret === -1 && !logout) {
                    if (this.register_retry_num > this.sig.register_retry_count) {
                        this.sig.register_retry_count++;
                        this.emit("internal.verbose", "上线失败，第" + this.sig.register_retry_count + "次重试", VerboseLevel.Warn);
                        setTimeout(() => {
                            re_register();
                        }, 2000);
                    }
                    else {
                        this.sig.register_retry_count = 0;
                        this.sig.token_retry_count = this.token_retry_num;
                        resolve(ret);
                    }
                }
                else {
                    this.sig.register_retry_count = 0;
                    resolve(ret);
                }
            };
            re_register();
        });
        //if (!logout && (ret === 1 || ret === 2)) this.emit("internal.error.token")
        //if (!logout && ret === 3) this.emit("internal.error.network", -3, "server is busy(register)")
        return ret;
    }
    syncTimeDiff() {
        if (!this[IS_ONLINE])
            return;
        const seq = this[FN_NEXT_SEQ]();
        this.sendPacket(BUF4, 6, seq, { cmd: "Client.CorrectTime", type: 0xa, encrypt: 0x0 })
            .then(buf => {
            try {
                this.sig.time_diff = buf.readInt32BE() - timestamp();
            }
            catch { }
        })
            .catch(NOOP);
    }
    async token_expire(data = {}) {
        this.terminate();
        this.emit("internal.error.token", data?.retcode, data?.retmsg);
    }
    sendHeartbeat() {
        this.syncTimeDiff();
        return new Promise((resolve, reject) => {
            if (!this[IS_ONLINE])
                return reject(new ApiRejection(-1, `client not online (cmd: Heartbeat.Alive)`));
            const success = (payload) => {
                if (typeof this.heartbeat === "function")
                    this.heartbeat();
                const time = timestamp();
                if (time - this.sig.hb_time >= 300) {
                    this.sig.hb_time = time;
                    if (!this.useQQNT)
                        this.writeUni("StatSvc.SimpleGet", BUF0);
                    /*let hb480_cmd = [Platform.Tim].includes(this.config.platform as Platform) ? "OidbSvc.0x480_9" : "OidbSvc.0x480_9_IMCore"
                    this.sendUni(hb480_cmd, this.sig.hb480()).catch(async () => {
                        this.emit("internal.verbose", hb480_cmd + " timeout", VerboseLevel.Warn)
                    })*/
                    this.refreshToken();
                }
                resolve(true);
            };
            const seq = this[FN_NEXT_SEQ]();
            this.sendPacket(BUF0, 10, seq, { cmd: "Heartbeat.Alive", type: 0xa, encrypt: 0x0 })
                .then(success)
                .catch(e => {
                this.emit("internal.verbose", "Heartbeat.Alive timeout", VerboseLevel.Warn);
                if (!this[IS_ONLINE])
                    return reject(new ApiRejection(-1, `client not online (cmd: Heartbeat.Alive)`));
                reject(e);
            });
        });
    }
    startSsoHeartBeat() {
        clearTimeout(this[SSO_HEARTBEAT]);
        if (this.ssoInterval > 0) {
            this[SSO_HEARTBEAT] = setTimeout(() => {
                this.sendSsoHeartBeat();
            }, this.ssoInterval * 1000);
        }
    }
    sendSsoHeartBeat() {
        if (!this.useQQNT)
            return false;
        return new Promise(async (resolve, reject) => {
            this.sendUni("trpc.qq_new_tech.status_svc.StatusService.SsoHeartBeat", this.sig.ssoHeartBeat(), 6, { message_type: 32 })
                .then(payload => {
                this.sig.last_sso_heartbeat = timestamp();
                const proto = pb.decode(payload);
                this.ssoInterval = proto[3] || this.ssoInterval;
                this.startSsoHeartBeat();
                resolve(true);
            })
                .catch(e => {
                this.emit("internal.verbose", "SsoHeartBeat timeout", VerboseLevel.Warn);
                reject(e);
            });
        });
    }
    generateT544Packet(cmd, sign) {
        const t = tlv.getPacker(this);
        let getLocalT544 = (cmd) => {
            switch (cmd) {
                case "810_2":
                    return t(0x544, 0, 2);
                case "810_7":
                    return t(0x544, 0, 7);
                case "810_9":
                    return t(0x544, 2, 9);
                case "810_a":
                    return t(0x544, 2, 10);
                case "810_f":
                    return t(0x544, 2, 15);
            }
            return BUF0;
        };
        if (!sign?.length)
            sign = BUF0; //return getLocalT544(cmd);
        return t(0x544, -1, -1, sign);
    }
    generateSignPacket(sign, token, extra) {
        let sec_info = {
            1: Buffer.from(sign || "", "hex"),
            2: Buffer.from(token || "", "hex"),
            3: Buffer.from(extra || "", "hex"),
        };
        return Buffer.from(pb.encode(sec_info));
    }
    async ssoPacketListHandler(list) {
        let handle = (list) => {
            let new_list = [];
            for (let val of list) {
                try {
                    let data = pb.decode(Buffer.from(val.body, "hex"));
                    val.type = data[1].toString();
                }
                catch (err) { }
                new_list.push(val);
            }
            return new_list;
        };
        if (list === null && this.isOnline()) {
            if (this.ssoPacketList.length > 0) {
                list = this.ssoPacketList;
                this.ssoPacketList = [];
            }
        }
        if (!list || !list.length)
            return;
        if (!this.isOnline()) {
            list = handle(list);
            if (this.ssoPacketList.length > 0) {
                let list1 = this.ssoPacketList;
                this.ssoPacketList = [];
                for (let val of list) {
                    let ssoPacket = list1.find((data) => {
                        return data.cmd === val.cmd && data.type === val.type;
                    });
                    if (ssoPacket) {
                        ssoPacket.body = val.body;
                    }
                    else {
                        list1.push(val);
                    }
                }
            }
            else {
                this.ssoPacketList = this.ssoPacketList.concat(list);
            }
            return;
        }
        for (let ssoPacket of list) {
            const allowedCallbackCmds = [
                "trpc.o3.ecdh_access.EcdhAccess.SsoEstablishShareKey",
                "trpc.o3.ecdh_access.EcdhAccess.SsoSecureA2Access",
                "trpc.o3.ecdh_access.EcdhAccess.SsoSecureA2Establish",
                "trpc.o3.ecdh_access.EcdhAccess.SsoSecureAccess",
                "trpc.o3.report.Report.SsoReport",
            ];
            if (!allowedCallbackCmds.includes(ssoPacket.cmd))
                break;
            let cmd = ssoPacket.cmd;
            let body = Buffer.from(ssoPacket.body, "hex");
            let callbackId = ssoPacket.callbackId;
            let payload = await this.sendUni(cmd, body);
            this.emit("internal.verbose", `sendUni:${cmd} result: ${payload.toString("hex")}`, VerboseLevel.Debug);
            if (callbackId > -1) {
                await this.submitSsoPacket(cmd, callbackId, payload);
            }
        }
    }
    async requestToken() {
        if (Date.now() - this.sig.request_token_time >= 60 * 60 * 1000) {
            this.sig.request_token_time = Date.now();
            let list = await this.requestSignToken();
            await this.ssoPacketListHandler(list);
        }
    }
}
const EVENT_KICKOFF = Symbol("EVENT_KICKOFF");
function ssoListener(cmd, payload, seq) {
    if (!payload)
        return;
    switch (cmd) {
        case "StatSvc.QueryHB":
            this.sendHeartbeat();
            break;
        case "StatSvc.MsfConnProbe":
            this.sendSsoHeartBeat();
            break;
        case "StatSvc.ReqMSFOffline":
        case "MessageSvc.PushForceOffline":
            {
                this.register(true).catch(err => err);
                let msg;
                try {
                    const nested = jce.decodeWrapper(payload);
                    msg = nested[4] ? `[${nested[4]}]${nested[3]}` : `[${nested[1]}]${nested[2]}`;
                }
                catch (err) {
                    this.emit("internal.verbose", err, VerboseLevel.Error);
                }
                this.emit(EVENT_KICKOFF, msg);
            }
            break;
        case "trpc.qq_new_tech.status_svc.StatusService.KickNT":
            {
                this.register(true).catch(err => err);
                let msg;
                try {
                    const proto = pb.decode(payload);
                    msg = `[${proto[4]}]${proto[3]}`;
                }
                catch (err) {
                    this.emit("internal.verbose", err, VerboseLevel.Error);
                }
                this.emit(EVENT_KICKOFF, msg);
            }
            break;
        case "QualityTest.PushList":
            this.writeUni(cmd, BUF0, seq);
            break;
        case "OnlinePush.SidTicketExpired":
            this.writeUni(cmd, BUF0, seq);
            break;
        case "ConfigPushSvc.PushReq":
            {
                if (payload[0] === 0)
                    payload = payload.slice(4);
                const nested = jce.decodeWrapper(payload);
                if (nested[1] === 2 && nested[2]) {
                    const buf = jce.decode(nested[2])[5][5];
                    const decoded = pb.decode(buf)[1281];
                    try {
                        this.sig.bigdata.sig_session = decoded[1].toBuffer();
                        this.sig.bigdata.session_key = decoded[2].toBuffer();
                        for (let v of decoded[3]) {
                            if (v[1] === 10) {
                                this.sig.bigdata.port = v[2][0][3];
                                this.sig.bigdata.ip = int32ip2str(v[2][0][2]);
                                break;
                            }
                        }
                    }
                    catch {
                        this.sig.bigdata.sig_session = BUF0;
                        this.sig.bigdata.session_key = BUF0;
                        this.sig.bigdata.port = 0;
                        this.sig.bigdata.ip = "";
                    }
                }
                ConfigPushSvc_PushResp.call(this, [nested[1], nested[3]]);
            }
            break;
    }
}
async function ConfigPushSvc_PushResp(data) {
    const MainServant = jce.encodeStruct(data);
    const body = jce.encodeWrapper({ MainServant }, "QQService.ConfigPushSvc.MainServant", "PushResp");
    this.writeUni("ConfigPushSvc.PushResp", body);
}
function onlineListener() {
    if (!this.listeners(EVENT_KICKOFF).length) {
        this.trapOnce(EVENT_KICKOFF, (msg) => {
            this[IS_ONLINE] = false;
            clearInterval(this[HEARTBEAT]);
            this.emit("internal.kickoff", msg);
        });
    }
}
function lostListener() {
    clearInterval(this[HEARTBEAT]);
    if (this[IS_ONLINE]) {
        this[IS_ONLINE] = false;
        this.statistics.lost_times++;
        setTimeout(() => {
            this.register().then(ret => {
                if (ret === -1 || ret === -2)
                    this.token_expire({ type: "register" });
                if (ret === -3)
                    this.emit("internal.error.network", -3, "server is busy(register)");
            });
        }, 50);
    }
}
async function parseSso(buf) {
    const stream = Readable.from(buf, { objectMode: false });
    const header = Readable.from(stream.read(stream.read(4).readUInt32BE() - 4) || BUF0, { objectMode: false });
    const seq = header.read(4).readInt32BE();
    const retcode = header.read(4).readInt32BE();
    const retmsg = header.read(header.read(4).readUInt32BE() - 4)?.toString();
    const cmd = (header.read(header.read(4).readUInt32BE() - 4) || "")?.toString();
    const session = header.read(header.read(4).readUInt32BE() - 4);
    const flag = header.read(4).readInt32BE();
    const reserve = header.read(header.read(4).readUInt32BE() - 4) || BUF0;
    let payload = stream.read(stream.read(4).readUInt32BE() - 4) || BUF0;
    if (retcode !== 0) {
        switch (retcode) {
            case SSOErrorCode.D2Expired:
            case SSOErrorCode.InvalidA2D2:
            case SSOErrorCode.InvalidA2Conn:
            case SSOErrorCode.D2UinNotMatch:
                if ([
                    "StatSvc.register",
                    "trpc.msg.register_proxy.RegisterProxy.SsoInfoSync",
                    "trpc.qq_new_tech.status_svc.StatusService.UnRegister",
                ].includes(cmd))
                    break;
                await this.token_expire({
                    type: "parseSso",
                    seq,
                    retcode,
                    retmsg,
                    cmd,
                    session,
                    flag,
                });
                break;
            case SSOErrorCode.RequireA2D2:
                this.register();
                break;
            case SSOErrorCode.BanStateForbidWriteCmd:
            case SSOErrorCode.BanStateForbidWriteReq:
                this.emit("internal.verbose", `账号[${this.uin}]功能受限，请使用QQ客户端解除！(错误码：${retcode})`, VerboseLevel.Error);
                break;
            default:
        }
    }
    else {
        switch (flag) {
            case 0:
                break;
            case 1:
                payload = await unzip(payload);
                break;
            case 8:
                break;
            default:
                throw new Error("unknown compressed flag: " + flag);
        }
    }
    return {
        retcode,
        retmsg,
        seq,
        reserve,
        cmd,
        payload,
    };
}
async function packetListener(pkt) {
    this.statistics.recv_pkt_cnt++;
    this[LOGIN_LOCK] = false;
    try {
        const flag = pkt.readUInt8(4);
        const encrypted = pkt.slice(pkt.readUInt32BE(6) + 6);
        let decrypted;
        switch (flag) {
            case 0:
                decrypted = encrypted;
                break;
            case 1:
                try {
                    decrypted = tea.decrypt(Buffer.from(encrypted), this.sig.d2_key);
                }
                catch {
                    decrypted = tea.decrypt(Buffer.from(encrypted), this.sig.d2_key_old);
                }
                break;
            case 2:
                decrypted = tea.decrypt(encrypted, BUF16);
                break;
            default:
                await this.token_expire({ source: "packetListener", flag });
                throw new Error("unknown flag:" + flag);
        }
        const sso = await parseSso.call(this, decrypted);
        this.emit("internal.verbose", `recv:${sso.cmd} seq:${sso.seq}${sso.retcode !== 0 ? ` retcode:${sso.retcode}` : ""}`, sso.retcode !== 0 ? VerboseLevel.Error : VerboseLevel.Debug);
        const trpc_rsp = parseTrpcRsp(sso.reserve);
        if (trpc_rsp && (trpc_rsp.ret !== 0 || trpc_rsp.func_ret !== 0)) {
            if (trpc_rsp.func_ret === 140022008)
                this.keyExchange();
            sso.retcode = trpc_rsp.ret !== 0 ? trpc_rsp.ret : trpc_rsp.func_ret;
            sso.retmsg = trpc_rsp.error_msg;
        }
        ssoPushAck.call(this, sso);
        parseLoginMerge.call(this, sso);
        if (this[HANDLERS].has(sso.seq))
            this[HANDLERS].get(sso.seq)?.(sso.retcode !== 0 ? new ApiRejection(sso.retcode, sso.retmsg) : sso.payload);
        else
            this.emit("internal.sso", sso.cmd, sso.payload, sso.seq);
    }
    catch (e) {
        this.emit("internal.verbose", e.message, VerboseLevel.Error);
        this.emit("internal.verbose", e.stack, VerboseLevel.Debug);
    }
}
function parseLoginMerge(sso) {
    if (sso.retcode !== 0 || sso.cmd !== "SSO.LoginMerge")
        return;
    const proto = pb.decode(sso.payload);
    const list = (Array.isArray(proto[1]) ? proto[1] : [proto[1]])
        .map(proto => {
        return { seq: proto[1], cmd: String(proto[2]), payload: proto[4]?.encoded };
    })
        .sort((a, b) => a.seq - b.seq);
    for (let sso of list) {
        this.emit("internal.verbose", `[merge]recv:${sso.cmd} seq:${sso.seq}`, VerboseLevel.Debug);
        if (this[HANDLERS].has(sso.seq)) {
            this[HANDLERS].get(sso.seq)?.(sso.payload);
        }
        else {
            this.emit("internal.sso", sso.cmd, sso.payload, sso.seq);
        }
    }
}
async function ssoPushAck(sso) {
    if (sso.retcode === 0 && sso.cmd === "trpc.msg.olpush.OlPushService.MsgPush") {
        try {
            const proto = pb.decode(sso.payload);
            if (proto[4]) {
                this.writeUni("trpc.msg.olpush.OlPushService.SsoPushAck", pb.encode({ 1: proto }), 0, { message_type: 32, trans_info: pb.decode(sso.reserve)[23] });
            }
        }
        catch { }
    }
}
async function register(logout = false, reflush = false) {
    this[IS_ONLINE] = false;
    clearInterval(this[HEARTBEAT]);
    clearTimeout(this[SSO_HEARTBEAT]);
    let ret = 1;
    try {
        const d = this.device;
        const buildVer = this.apk.version.split(".").pop() || "";
        const body = !logout ? {
            1: 1759,
            2: crypto.randomBytes(4).readUInt32BE(),
            4: 2,
            5: 0,
            6: {
                1: {},
                2: 0,
                3: {},
            },
            8: {
                1: [
                    { 1: 46, 2: 0 },
                    { 1: 283, 2: 0 },
                ],
            },
            9: {
                1: d.guid.toString("hex"),
                2: 0,
                3: buildVer.length > 3 ? buildVer : "",
                4: 0,
                5: 2052,
                6: {
                    1: d.brand + "-" + d.model,
                    2: d.device,
                    3: d.version.release,
                    4: d.brand,
                    5: `${d.product}-user ${d.version.release} ${d.display} ${d.version.incremental} release-keys`,
                },
                7: 0,
                8: 6,
                9: 1,
                10: {
                    1: 1,
                    2: 1,
                },
                11: 0,
            },
            10: {
                2: 2,
                4: {
                    1: 0,
                },
            },
            11: {
                1: 0,
                2: 1,
                3: 0,
            },
        } : {
            1: 0,
            2: {
                1: d.brand + "-" + d.model,
                2: d.device,
                3: d.version.release,
                4: d.brand,
                5: `${d.product}-user ${d.version.release} ${d.display} ${d.version.incremental} release-keys`,
            },
            3: 0,
        };
        const seq = this[FN_NEXT_SEQ]();
        const payload = await this.sendPacket(pb.encode(body), 6, seq, {
            cmd: !logout ? "trpc.msg.register_proxy.RegisterProxy.SsoInfoSync" : "trpc.qq_new_tech.status_svc.StatusService.UnRegister",
            type: 0xa,
            encrypt: 0x1,
            extra: { message_type: 32 },
        });
        if (logout)
            return ret;
        if (!payload?.length)
            return -2;
        const proto = pb.decode(payload);
        /*if (logout && proto[7]?.[2] === "unregister success") {
            return ret;
        }*/
        if ((!proto[7]?.[2] || proto[7][2].toString() !== "register success") && !reflush) {
            ret = -1;
        }
        else {
            this.ssoInterval = proto[7][4] || this.ssoInterval;
            this[IS_ONLINE] = true;
            this.startSsoHeartBeat();
            if (this.interval > 0) {
                this[HEARTBEAT] = setInterval(() => {
                    this.sendHeartbeat().catch(() => {
                        if (this[IS_ONLINE]) {
                            this[NET].destroy();
                        }
                    });
                }, this.interval * 1000);
            }
        }
    }
    catch (err) {
        ret = err?.code === -2 ? -3 : -2;
    }
    return ret;
}
async function old_register(logout = false, reflush = false) {
    this[IS_ONLINE] = false;
    clearInterval(this[HEARTBEAT]);
    let ret = 1;
    const pb_buf = pb.encode({
        1: [
            { 1: 46, 2: timestamp() },
            { 1: 283, 2: 0 },
        ],
    });
    const d = this.device;
    const SvcReqRegister = jce.encodeStruct([
        this.uin,
        logout ? 0 : 7,
        0,
        "",
        logout ? 21 : 11,
        0,
        0,
        0,
        0,
        0,
        logout ? 44 : 0,
        d.version.sdk,
        1,
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
        0,
        0,
        null,
        0,
        0,
        "",
        0,
        d.brand,
        d.brand,
        "",
        pb_buf,
        0,
        null,
        0,
        null,
        1000,
        98,
    ]);
    const body = jce.encodeWrapper({ SvcReqRegister }, "PushService", "SvcReqRegister");
    const seq = this[FN_NEXT_SEQ]();
    try {
        const payload = await this.sendPacket(body, 6, seq, {
            cmd: "StatSvc.register",
            type: 0xa,
            encrypt: 0x1,
        });
        if (logout)
            return 1;
        if (!payload?.length)
            return -2;
        const rsp = jce.decodeWrapper(payload);
        const result = !!rsp[9];
        if (!result && !reflush) {
            ret = -1;
        }
        else {
            this[IS_ONLINE] = true;
            this.sendHeartbeat();
            if (this.interval > 0) {
                this[HEARTBEAT] = setInterval(() => {
                    this.sendHeartbeat().catch(() => {
                        if (this[IS_ONLINE]) {
                            this[NET].destroy();
                        }
                    });
                }, this.interval * 1000);
            }
        }
    }
    catch (err) {
        ret = err?.code === -2 ? -3 : -2;
    }
    return ret;
}
async function refreshToken(force = false) {
    if ((!this.isOnline() ||
        this.emp_interval === 0 ||
        timestamp() - this.sig.emp_time < this.emp_interval) &&
        !force)
        return;
    const seq = this[FN_NEXT_SEQ]();
    try {
        let payload;
        let token_type = 0;
        let code = -1;
        let t;
        if (this.apk.appid !== 16 && this.sig.useNTLogin) {
            token_type = 1;
            const cmd = `trpc.login.ecdh.EcdhService.${this.sig.no_pic_sig.length ? "SsoNTLoginRefreshTicket" : "SsoNTLoginEasyLogin"}`;
            payload = decryptNTLoginPacket.call(this, await this.sendPacket(await buildNTLoginPacket.call(this, cmd), 5, -1, { cmd, type: 0xa, encrypt: 0x2 }));
            const proto = pb.decode(payload);
            const error_info = proto[1] ? proto[1][4] : null;
            code = error_info ? (error_info[1] ?? -1) : 0;
            t = proto[2];
        }
        else {
            token_type = 0;
            payload = await this.sendPacket(buildLoginPacket.call(this, 0x810, await this.tokenLogin()), 6, seq, { cmd: "wtlogin.exchange_emp", type: 0xa, encrypt: 0x2 });
            payload = decryptLoginPacket.call(this, payload);
            const stream = Readable.from(payload, { objectMode: false });
            stream.read(2);
            code = stream.read(1).readUInt8() ?? code;
            stream.read(2);
            t = readTlv(stream);
        }
        this.emit("internal.verbose", "refresh token type: " + code, VerboseLevel.Debug);
        if (code === 0) {
            const { token } = (token_type === 1 ? parseToken.call(this, t, token_type) : decodeT119.call(this, t[0x119]));
            await this.register(false, true);
            if (this[IS_ONLINE]) {
                this.emit("internal.token", token);
                return true;
            }
        }
    }
    catch (e) {
        this.emit("internal.verbose", "refresh token error: " + e?.message, VerboseLevel.Error);
    }
    return false;
}
export async function buildPacket(type, encrypt, cmd, body, seq, extra) {
    this.emit("internal.verbose", `send:${cmd} seq:${seq}`, VerboseLevel.Debug);
    const uin = extra?.uin ?? this.uin;
    let sso;
    let sec_info = BUF0;
    if ([0xa, 0xb, 0xd].includes(type) &&
        (this.signCmd.some(val => new RegExp(`^${val.replace(/\./g, '\\.').replace(/\*/g, '.*')}$`).test(cmd)) || ["wtlogin.*", "trpc.login.ecdh.EcdhService.*"].some(val => new RegExp(`^${val.replace(/\./g, '\\.').replace(/\*/g, '.*')}$`).test(cmd)))) {
        sec_info = await this.getSign(cmd, seq, Buffer.from(body));
        if (!sec_info?.length && this.sig.sign_api_addr && this.apk.fekit_ver)
            throw new ApiRejection(ErrorCode.SignApiError, "签名api异常");
    }
    switch (type) {
        case 0xa: {
            const ksid = Buffer.from(`||` + this.apk.name);
            sso = new Writer()
                .writeWithLength(new Writer()
                .write32(seq)
                .writeU32(this.apk.subid)
                .writeU32(this.apk.subid)
                .writeBytes(Buffer.from([
                0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01,
                0x00,
            ]))
                .writeWithLength(this.sig.tgt)
                .writeWithLength(cmd)
                .writeWithLength(this.sig.session)
                .writeWithLength(this.device.imei)
                .writeU32(4)
                .writeU16(ksid.length + 2)
                .writeBytes(ksid)
                .writeWithLength(buildReserveField.call(this, cmd, sec_info, extra))
                .read())
                .writeWithLength(body)
                .read();
            break;
        }
        case 0xd:
        case 0xb: {
            sso = new Writer()
                .writeWithLength(new Writer()
                .writeWithLength(cmd)
                .writeWithLength(this.sig.session)
                .writeWithLength(buildReserveField.call(this, cmd, sec_info, extra))
                .read())
                .writeWithLength(body)
                .read();
            break;
        }
        default:
            sso = body;
    }
    let encrypted;
    switch (encrypt) {
        case 1:
            encrypted = tea.encrypt(sso, this.sig.d2_key);
            break;
        case 2:
            encrypted = tea.encrypt(sso, BUF16);
            break;
        default:
            encrypted = sso;
    }
    return new Writer()
        .writeWithLength(new Writer()
        .writeU32(type)
        .writeU8(encrypt)
        .writeBytes(([0xa].includes(type)
        ? new Writer().writeWithLength(this.sig.d2)
        : new Writer().writeU32(seq)).read())
        .writeU8(0)
        .writeWithLength(String(uin))
        .writeBytes(encrypted)
        .read())
        .read();
}
export function buildLoginPacket(cmdid, body) {
    if (!cmdid)
        throw new Error("cmdid");
    body = new Writer()
        .writeU8(0x02)
        .writeU8(0x01)
        .writeBytes(this.sig.randkey)
        .writeU16(0x131)
        .writeU16(0x01)
        .writeTlv(this[ECDH].public_key)
        .writeBytes(tea.encrypt(body, this[ECDH].share_key))
        .read();
    body = new Writer()
        .writeU8(0x02)
        .writeU16(29 + body.length) // 1 + 27 + body.length + 1
        .writeU16(8001) // protocol ver
        .writeU16(cmdid) // command id
        .writeU16(1) // const
        .writeU32(this.uin)
        .writeU8(3) // const
        .writeU8(0x87) // encrypt type 7:0 69:emp 0x87:4
        .writeU8(0) // const
        .writeU32(2) // const
        .writeU32(this.apk.client_ver) // app client ver
        .writeU32(0) // const
        .writeBytes(body)
        .writeU8(0x03)
        .read();
    return body;
}
export function decryptLoginPacket(payload) {
    return tea.decrypt(payload.slice(16, -1), this[ECDH].share_key);
}
export async function buildNTLoginPacket(cmd, params = {}) {
    const uin = this.uin;
    if (!this.device.qImei36 || !this.device.qImei16)
        await this.device.getQIMEI();
    if (!this.sig.nt_session || this.sig.nt_session.expire_time - timestamp() < 60)
        await this.keyExchange();
    if (!this.sig.nt_session)
        throw new Error("key error");
    const head = {
        1: {
            1: String(uin),
        },
        2: {
            1: String(NTLoginPlatform[this.apk.login_platform]).toUpperCase(),
            2: this.device.model,
            3: this.apk.login_platform,
            4: this.device.guid
        },
        3: {
            1: cmd.includes("SsoNTLoginPasswordLogin") ? "" : this.apk.ver,
            2: this.apk.appid,
            3: this.apk.id,
            5: this.apk.qua
        },
        ...(cmd.includes("SsoNTLoginPasswordLogin") ? {
            7: {
                1: 1
            }
        } : {})
    };
    if (this.sig.nt_login_cookie) {
        head[5] = { 1: this.sig.nt_login_cookie };
    }
    const proto = {
        1: head
    };
    switch (cmd.split('.').pop()) {
        case "SsoNTLoginPasswordLogin": {
            proto[2] = {
                1: this.sig.a1,
                2: this.sig.nt_captcha ? {
                    1: this.sig.nt_captcha.ticket,
                    2: this.sig.nt_captcha.randStr,
                    3: this.sig.nt_captcha.url.split('&sid=')[1].split('&')[0]
                } : undefined,
                5: {
                    1: 1
                }
            };
            this.sig.nt_captcha = null;
            break;
        }
        case "SsoNTLoginPasswordLoginUnusualDevice": {
            proto[2] = {
                1: this.sig.a1,
                2: this.sig.nt_unusual_device_check_sig
            };
            this.sig.nt_unusual_device_check_sig = null;
            break;
        }
        case "SsoNTLoginEasyLogin": {
            proto[2] = {
                1: this.sig.a1
            };
            break;
        }
        case "SsoNTLoginRefreshTicket": {
            proto[2] = {
                1: this.sig.a1,
                2: this.sig.no_pic_sig
            };
            break;
        }
        case "SsoNTLoginRefreshA2": {
            proto[2] = {
                1: this.sig.a2,
                2: this.sig.d2,
                3: this.sig.d2_key
            };
            break;
        }
        default: {
            Object.assign(proto, params || {});
        }
    }
    const encrypted = aesGcmEncrypt(pb.encode(this.apk.appid === 16 ? { 2: proto, 3: { 1: 0, 2: String(uin) } } : proto), this.sig.nt_session.key);
    return Buffer.from(pb.encode({
        1: this.sig.nt_session.ticket,
        [this.apk.appid === 16 ? 5 : 3]: encrypted,
        4: 1,
    }));
}
export function decryptNTLoginPacket(payload) {
    if (!this.sig.nt_session)
        return BUF0;
    const decrypted = aesGcmDecrypt(pb.decode(payload)[this.apk.appid === 16 ? 5 : 3].toBuffer(), this.sig.nt_session.key);
    return this.apk.appid === 16 ? pb.decode(decrypted)[2].toBuffer() : decrypted;
}
export async function buildLoginTLV(subcmd, add_tlvs, use544 = true, t544cmd) {
    if (!this.device.qImei36 || !this.device.qImei16) {
        await this.device.getQIMEI();
    }
    const t = tlv.getPacker(this);
    const tlvs = add_tlvs.map(val => val instanceof Buffer ? val : t(...val));
    if (this.apk.ssover >= 12 && use544) {
        tlvs.push(await this.getT544(t544cmd || `810_${subcmd.toString(16)}`));
        if (this.sig.t553)
            tlvs.push(t(0x553));
    }
    if (this.device.qImei16) {
        tlvs.push(t(0x545, this.device.qImei16));
    }
    else {
        tlvs.push(t(0x194));
        tlvs.push(t(0x202));
    }
    let writer = new Writer().writeU16(subcmd).writeU16(tlvs.length);
    for (let tlv of tlvs) {
        writer.writeBytes(tlv);
    }
    return writer.read();
}
export function buildTransPacket(appid, role, body, encrypt) {
    body = new Writer().writeU32(timestamp()).writeBytes(body).read();
    body = encrypt ? tea.encrypt(body, this.sig.st_key) : body;
    return new Writer()
        .writeU8(encrypt ? 0x1 : 0x0)
        .writeU16(body.length)
        .writeU32(appid)
        .writeU32(role)
        .writeTlv(encrypt ? this.sig.st : Buffer.alloc(0))
        .writeU8(0)
        .writeBytes(body)
        .read();
}
export function buildCode2dPacket(cmdid, enable_close, body, seq = this.sig.seq) {
    const version = 50, uin = this.uin || 0;
    return new Writer()
        .writeU8(2)
        .writeU16(44 + body.length)
        .writeU16(cmdid)
        .writeBytes(Buffer.alloc(21))
        .writeU8(3)
        .writeU16(enable_close ? 0 : 1)
        .writeU16(version)
        .writeU32(seq)
        .writeU64(uin)
        .writeBytes(body)
        .writeU8(3)
        .read();
}
export function buildQrcodePacket(cmdid, body, seq = this[FN_NEXT_SEQ]()) {
    if (typeof seq !== "number" || seq < 0)
        seq = this[FN_NEXT_SEQ]();
    return buildLoginPacket.call(this, 0x812, buildTransPacket.call(this, this.apk.appid, 0x72, buildCode2dPacket.call(this, cmdid, true, body, seq)));
}
export function buildReserveField(cmd, sec_info, extra) {
    extra || (extra = {});
    const qImei36 = this.device.qImei36 || this.device.qImei16;
    const reserveField = {};
    const fieldMap = {
        client_ipcookie: 8, //byte
        flag: 9, //int
        env_id: 10, //int
        locale_id: 11, //int
        qimei: 12, //byte
        env: 13, //string
        newconn_flag: 14, //int
        trace_parent: 15, //string
        uid: 16, //string
        imsi: 18, //int
        network_type: 19, //int
        ip_stack_type: 20, //int
        message_type: 21, //int
        trpc_rsp: 22, //SsoTrpcResponse
        trans_info: 23, //SsoMapEntry
        sec_info: 24, //SsoSecureInfo
        sec_sig_flag: 25, //int
        nt_core_version: 26, //int
        sso_route_cost: 27, //int
        sso_ip_origin: 28, //int
        presure_token: 30, //byte
        rsp_timestamp_ms: 31, //int64
    };
    reserveField[fieldMap.flag] = 1;
    reserveField[fieldMap.locale_id] = 2052;
    reserveField[fieldMap.qimei] = qImei36;
    reserveField[fieldMap.newconn_flag] = 0;
    reserveField[fieldMap.trace_parent] = "";
    reserveField[fieldMap.uid] = extra?.uid || this.uid || "";
    reserveField[fieldMap.imsi] = 0;
    reserveField[fieldMap.network_type] = 1;
    reserveField[fieldMap.ip_stack_type] = 3; //1;
    reserveField[fieldMap.message_type] = cmd.includes("trpc") ? 32 : 0;
    reserveField[fieldMap.trans_info] = [];
    reserveField[fieldMap.sec_info] = sec_info?.length ? sec_info : { 1: {}, 2: {}, 3: {} };
    reserveField[fieldMap.nt_core_version] = 100;
    reserveField[fieldMap.sso_ip_origin] = 2; //3;
    const extraKeys = Object.keys(extra);
    if (extraKeys.includes("message_type"))
        reserveField[fieldMap.message_type] |= extra.message_type;
    if (extraKeys.includes("trans_info"))
        reserveField[fieldMap.trans_info] = extra.trans_info;
    if ((reserveField[fieldMap.message_type] & 32) === 32) {
        reserveField[fieldMap.uid] = extra?.uid || this.uid || "";
        reserveField[fieldMap.nt_core_version] = 100;
    }
    else if (!this.useQQNT) {
        reserveField[fieldMap.uid] = extra?.uin ?? this.uin;
        reserveField[fieldMap.message_type] = 0;
        reserveField[fieldMap.nt_core_version] = 0;
    }
    return Buffer.from(pb.encode(reserveField));
}
export function decodeT119(t119, key = null) {
    const t119key = Buffer.from(key || this.sig.tgtgt);
    const r = Readable.from(tea.decrypt(Buffer.from(t119), Buffer.from(t119key)), {
        objectMode: false,
    });
    r.read(2);
    const t = readTlv(r);
    return parseToken.call(this, t, 0);
}
function parseToken(t, type) {
    this.sig.emp_time = timestamp();
    this.sig.d2_key_old = this.sig.d2_key.length ? this.sig.d2_key : BUF16;
    const info = {
        emp_time: this.sig.emp_time,
        icqq_ver: this.pkg.version,
        token_ver: 6,
        apk: {
            name: this.apk.name,
            id: this.apk.id,
            ver: this.apk.ver,
            version: this.apk.version,
            subid: this.apk.subid,
            sdkver: this.apk.sdkver,
            app_key: this.apk.app_key,
        },
        device: {
            guid: this.device.guid.toString("hex"),
            qImei16: this.device.qImei16,
            qImei36: this.device.qImei36,
        },
        user: {
            uin: this.uin,
            uid: this.uid,
            nickname: this.nickname
        },
        sig: {
            randkey: this.sig.randkey.toString("hex"),
            session: this.sig.session.toString("hex")
        }
    };
    switch (type) {
        case 0: {
            for (let tag in t) {
                this.sig.tlvs[tag] = t[tag] || this.sig.tlvs[tag] || BUF0;
            }
            if (t[0x543]?.length) {
                try {
                    let decoded = pb.decode(t[0x543]);
                    this.uid = decoded[9][11][1].toString() || "";
                }
                catch { }
            }
            if (!this.uid && t[0x550]?.length) {
                try {
                    let decoded = pb.decode(t[0x550]);
                    this.uid = decoded[19][1].toString() || "";
                }
                catch { }
            }
            this.uid = this.uid || "";
            if (t[0x512]) {
                const r = Readable.from(t[0x512], { objectMode: false });
                let len = r.read(2).readUInt16BE();
                while (len-- > 0) {
                    const domain = String(r.read(r.read(2).readUInt16BE()));
                    this.pskey[domain] = r.read(r.read(2).readUInt16BE());
                    this.pt4token[domain] = r.read(r.read(2).readUInt16BE());
                }
            }
            const age = t[0x11a].slice(2, 3).readUInt8();
            const gender = t[0x11a].slice(3, 4).readUInt8();
            const nickname = String(t[0x11a].slice(5));
            info.user = {
                uin: this.uin,
                uid: this.uid,
                nickname: nickname
            };
            break;
        }
        case 1: {
            this.sig.a1 = t[1][3] ? t[1][3].toBuffer() : this.sig.a1;
            this.sig.a1_key = t[1][14] ? t[1][14].toBuffer() : this.sig.a1_key;
            this.sig.a2 = t[1][4] ? t[1][4].toBuffer() : this.sig.a2;
            this.sig.a2_key = t[1][17] ? t[1][17].toBuffer() : this.sig.a2_key;
            this.sig.d2 = t[1][5] ? t[1][5].toBuffer() : this.sig.d2;
            this.sig.d2_key = t[1][6] ? t[1][6].toBuffer() : this.sig.d2_key;
            this.sig.no_pic_sig = t[1][13] ? t[1][13].toBuffer() : this.sig.no_pic_sig;
            this.uid = t[4]?.[2] ? t[4][2].toString() : (t[2]?.[2] ? t[2][2].toString() : this.uid);
            Object.assign(info.user, {
                uid: this.uid,
                nickname: t[4]?.[3] ? t[4]?.[3]?.[1]?.toString() : info.user.nickname
            });
            break;
        }
        case 2: {
            try {
                const stream = Readable.from(t, { objectMode: false });
                const token_info = JSON.parse(String(stream.read(stream.read(2).readUInt16BE())));
                info.emp_time = token_info.emp_time;
                Object.assign(info.apk, token_info.apk || {});
                Object.assign(info.device, token_info.device || {});
                Object.assign(info.user, token_info.user || {});
                Object.assign(info.sig, token_info.sig || {});
                if (token_info.token_ver < 6) {
                    const t119 = stream.read(stream.read(2).readUInt16BE());
                    const t119key = stream.read(stream.read(2).readUInt16BE());
                    this.sig.a1_key = token_info.token_ver >= 4 ? stream.read(stream.read(2).readUInt16BE()) : this.sig.a1_key;
                    this.sig.tgtgt = this.sig.a1_key?.length ? this.sig.a1_key : t119key;
                    this.sig.a1 = stream.read(stream.read(2).readUInt16BE());
                    this.sig.d2 = stream.read(stream.read(2).readUInt16BE());
                    this.sig.d2_key = stream.read(stream.read(2).readUInt16BE());
                    this.sig.tgt = stream.read(stream.read(2).readUInt16BE());
                    this.sig.tgt_key = stream.read(stream.read(2).readUInt16BE());
                    this.sig.ticket_key = stream.read(stream.read(2).readUInt16BE());
                    this.sig.sig_key = stream.read(stream.read(2).readUInt16BE());
                    this.sig.srm_token = stream.read(stream.read(2).readUInt16BE());
                    this.sig.device_token = stream.read(stream.read(2).readUInt16BE());
                    this.sig.t543 = stream.read(stream.read(2).readUInt16BE());
                    if (token_info.token_ver >= 3) {
                        this.sig.randkey = stream.read(stream.read(2).readUInt16BE());
                        this.sig.session = stream.read(stream.read(2).readUInt16BE());
                    }
                    const ret = decodeT119.call(this, t119, t119key);
                    ret.info = info;
                    return ret;
                }
                else {
                    const tlvs = pb.decode(stream.read(stream.read(2).readUInt16BE()));
                    for (let tag in tlvs) {
                        if (tag === "encoded")
                            continue;
                        this.sig.tlvs[tag] = tlvs[tag].toBuffer();
                    }
                    this.sig.randkey = Buffer.from(info.sig.randkey, "hex");
                    this.sig.session = Buffer.from(info.sig.session, "hex");
                    this.uid = info.user.uid;
                    if (this.sig.tlvs[0x512].length) {
                        const r = Readable.from(this.sig.tlvs[0x512], { objectMode: false });
                        let len = r.read(2).readUInt16BE();
                        while (len-- > 0) {
                            const domain = String(r.read(r.read(2).readUInt16BE()));
                            this.pskey[domain] = r.read(r.read(2).readUInt16BE());
                            this.pt4token[domain] = r.read(r.read(2).readUInt16BE());
                        }
                    }
                    break;
                }
            }
            catch {
                return null;
            }
        }
        default:
            return null;
    }
    this.sig.tgtgt = this.sig.a1_key.length ? this.sig.a1_key : (this.sig.d2_key.length ? md5(this.sig.d2_key) : BUF16);
    const token = new Writer()
        .writeTlv(JSON.stringify(info))
        .writeTlv(pb.encode(this.sig.tlvs))
        .read();
    return { token, info };
}
export function decodeLoginResponse(cmd, payload) {
    payload = decryptLoginPacket.call(this, payload);
    const r = Readable.from(payload, { objectMode: false });
    r.read(2);
    const type = r.read(1).readUInt8();
    r.read(2);
    const t = readTlv(r);
    if (t[0x402]) {
        this.sig.dPwd = crypto.randomBytes(16);
        this.sig.t402 = t[0x402];
        this.sig.g = md5(Buffer.concat([
            Buffer.concat([Buffer.from(this.device.guid), this.sig.dPwd]),
            this.sig.t402,
        ]));
    }
    if (t[0x546])
        this.sig.t546 = t[0x546];
    if (type === 204) {
        this.sig.t104 = t[0x104];
        this.emit("internal.verbose", "unlocking...", VerboseLevel.Mark);
        const tt = tlv.getPacker(this);
        const body = new Writer()
            .writeU16(20)
            .writeU16(4)
            .writeBytes(tt(0x8))
            .writeBytes(tt(0x104))
            .writeBytes(tt(0x116))
            .writeBytes(tt(0x401))
            .read();
        return this[FN_SEND_LOGIN]("wtlogin.login", body);
    }
    if (type === 0) {
        this.sig.t104 = BUF0;
        this.sig.t174 = BUF0;
        if (t[0x403]) {
            this.sig.randomSeed = t[0x403];
        }
        const { token, info } = decodeT119.call(this, t[0x119]);
        const { nickname } = info.user;
        this.register().then(async (ret) => {
            if (this[IS_ONLINE]) {
                this.sig.register_retry_count = 0;
                await this.updateCmdWhiteList();
                await this.ssoPacketListHandler(null);
                this.emit("internal.online", token, nickname);
            }
            else if (ret < 1) {
                if (ret === -1 || ret === -2)
                    this.token_expire({ source: "register" });
                if (ret === -3)
                    this.emit("internal.error.network", -3, "server is busy(register)");
            }
        });
        return;
    }
    if (type === 15 || type === 16) {
        return this.token_expire({ source: "login" });
    }
    if (type === 2) {
        this.sig.t104 = t[0x104];
        if (t[0x192])
            return this.emit("internal.slider", String(t[0x192]));
        return this.emit("internal.error.login", type, "[登陆失败]未知格式的验证码");
    }
    if (type === 40) {
        if (t[0x146]) {
            const stream = Readable.from(t[0x146], { objectMode: false });
            const version = stream.read(4);
            const title = stream.read(stream.read(2).readUInt16BE()).toString();
            const content = stream.read(stream.read(2).readUInt16BE()).toString();
            const message = `[${title}]${content}`;
            this.emit("internal.verbose", message + "(错误码：" + type + ")", VerboseLevel.Warn);
        }
        return this.emit("internal.error.login", type, "账号被冻结");
    }
    if (type === 45 && t[0x146]) {
        const stream = Readable.from(t[0x146], { objectMode: false });
        const version = stream.read(4);
        const title = stream.read(stream.read(2).readUInt16BE()).toString();
        const content = stream.read(stream.read(2).readUInt16BE()).toString();
        const message = `[${title}]${content}`;
        this.emit("internal.verbose", message + "(错误码：" + type + ")", VerboseLevel.Warn);
        if (content.includes("你当前使用的QQ版本过低")) {
            this.emit("internal.error.login", type, "QQ版本过低，请更新！");
        }
        return;
    }
    if (type === 160 || type === 162 || type === 239) {
        if (!t[0x204] && !t[0x174])
            return this.emit("internal.verbose", "已向密保手机发送短信验证码", VerboseLevel.Mark);
        let phone = "";
        if (t[0x174] && t[0x178]) {
            this.sig.t104 = t[0x104];
            this.sig.t174 = t[0x174];
            phone = String(t[0x178]).substr(t[0x178].indexOf("\x0b") + 1, 11);
        }
        return this.emit("internal.verify", t[0x204]?.toString() || "", phone);
    }
    if (type === 235) {
        let dir = path.resolve(this.config.data_dir);
        let device_path = path.join(dir, `device.json`);
        //fs.unlink(device_path)
        //this.log("warn",`[${type}]当前设备信息被拉黑，已为您重置设备信息，请重新登录！`)
        return this.emit("internal.error.login", type, `[登陆失败](${type})当前设备信息被拉黑，建议删除"${device_path}"后重新登录！`);
    }
    if (type === 237) {
        const proto = pb.decode(t[0x543] || BUF0);
        console.log(proto.toJSON());
        if (proto[60]) {
            const jump = proto[60][6]?.[3] ? {
                word: String(proto[60][6][1]),
                url: String(proto[60][6][3])
            } : null;
            return this.emit("internal.auth", {
                title: String(proto[60][7]),
                content: String(proto[60][8]),
                jump
            });
        }
        return this.emit("internal.error.login", type, `[登陆失败](${type})当前QQ登录频繁，暂时被限制登录，建议更换QQ或稍后再尝试登录！`);
    }
    if (t[0x149]) {
        const stream = Readable.from(t[0x149], { objectMode: false });
        stream.read(2);
        const title = stream.read(stream.read(2).readUInt16BE()).toString();
        const content = stream.read(stream.read(2).readUInt16BE()).toString();
        return this.emit("internal.error.login", type, `[${title}]${content}`);
    }
    if (t[0x146]) {
        const stream = Readable.from(t[0x146], { objectMode: false });
        const version = stream.read(4);
        const title = stream.read(stream.read(2).readUInt16BE()).toString();
        const content = stream.read(stream.read(2).readUInt16BE()).toString();
        const message = `[${title}]${content}`;
        this.emit("internal.verbose", message + "(错误码：" + type + ")", VerboseLevel.Warn);
        return cmd.includes("wtlogin.login")
            ? this.emit("internal.error.login", type, message)
            : this.token_expire({ source: "login" });
    }
    this.emit("internal.error.login", type, `[登陆失败]未知错误`);
}
export function decodeNTLoginResponse(cmd, payload) {
    payload = decryptNTLoginPacket.call(this, payload);
    this.sig.NTLoginResponse = payload;
    const proto = pb.decode(payload);
    const error_info = proto[1] ? proto[1][4] : null;
    const code = error_info ? (error_info[1] ?? -1) : 0;
    if (proto[1]?.[5]?.[1]) {
        this.sig.nt_login_cookie = proto[1][5][1].toString();
    }
    else {
        this.sig.nt_login_cookie = null;
    }
    switch (code) {
        case NTLoginErrorCode.Success: {
            const { token, info } = parseToken.call(this, proto[2], 1);
            if (this.apk.appid === 16)
                return this.tokenLogin(BUF0).then(body => this[FN_SEND_LOGIN]("wtlogin.exchange_emp", body));
            const { nickname } = info.user;
            this.register().then(async (ret) => {
                if (this[IS_ONLINE]) {
                    this.sig.register_retry_count = 0;
                    await this.updateCmdWhiteList();
                    await this.ssoPacketListHandler(null);
                    this.emit("internal.online", token, nickname);
                }
                else if (ret < 1) {
                    if (ret === -1 || ret === -2)
                        this.token_expire({ source: "register" });
                    if (ret === -3)
                        this.emit("internal.error.network", -3, "server is busy(register)");
                }
            });
            return;
        }
        case NTLoginErrorCode.Strict: {
            const type = 237;
            let jump = null;
            if (error_info[7]?.length && error_info[7][0][2]) {
                jump = {
                    word: String(error_info[7][0][1]),
                    url: String(error_info[7][0][2]),
                };
            }
            else if (error_info[5]) {
                jump = {
                    word: String(error_info[4]),
                    url: String(error_info[5])
                };
            }
            return this.emit("internal.auth", {
                title: String(error_info[2]),
                content: String(error_info[3]),
                jump
            });
        }
        case NTLoginErrorCode.ProofWater: {
            const type = 2;
            if (error_info?.[5]) {
                this.sig.nt_captcha = {
                    url: error_info[5].toString()
                };
            }
            else if (proto[2]?.[2]?.[3]) {
                this.sig.nt_captcha = {
                    url: proto[2][2][3].toString()
                };
            }
            if (this.sig.nt_captcha?.url)
                return this.emit("internal.slider", this.sig.nt_captcha.url);
            return this.emit("internal.error.login", type, "[登陆失败]未知格式的验证码");
        }
        case NTLoginErrorCode.NewDevice: {
            return this.emit("internal.verify", String(error_info[5]));
        }
        case NTLoginErrorCode.UnusualDevice: {
            //this.sig.nt_unusual_device_check_sig = proto[2][3][2].toBuffer();
            //this.fetchLogin(proto[2][3][2].toBuffer());
            this.emit("internal.verbose", "[登陆失败]当前设备环境异常，请使用扫码登录", VerboseLevel.Warn);
            //const url = `https://accounts.qq.com/safe/verify?_wv=2&_wwv=128&from=nt${proto[2][3][4] ? `&uin-token=${String(proto[2][3][4])}` : ''}&sig=${String(proto[2][3][3])}`;
            if (this.apk.device_type !== -1)
                this.fetchQrcode();
            return;
        }
        case NTLoginErrorCode.NeedUpdate: {
            let message = "";
            if (error_info[2]) {
                const title = error_info[2].toString();
                const content = error_info[3].toString();
                message = `[${title}]${content}`;
            }
            return this.emit("internal.verbose", message + "(错误码：" + code + ")", VerboseLevel.Warn);
        }
        default: {
            if (["trace", "debug"].includes(this.config.log_level))
                console.log('NTLoginResponse:', proto.toJSON());
            if (!error_info)
                break;
            let message = '[登陆失败]未知错误';
            if (error_info[2]) {
                const title = error_info[2].toString();
                const content = error_info[3].toString();
                message = `[${title}]${content}`;
            }
            this.emit("internal.verbose", message + "(错误码：" + code + ")", VerboseLevel.Warn);
            return cmd.includes("LoginPasswordLogin")
                ? this.emit("internal.error.login", code, message)
                : this.token_expire({ source: "login" });
        }
    }
    this.emit("internal.error.login", code, `[登陆失败]未知错误`);
}
