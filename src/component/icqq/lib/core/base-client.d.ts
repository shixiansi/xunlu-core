import { Listener, Matcher, ToDispose, Trapper } from "triptrap";
import * as pb from "./protobuf";
import { Apk, Device, Platform, ShortDevice } from "./device";
import { Config } from "../client";
declare const FN_NEXT_SEQ: unique symbol;
declare const FN_SEND: unique symbol;
declare const FN_SEND_LOGIN: unique symbol;
declare const HANDLERS: unique symbol;
declare const NET: unique symbol;
declare const ECDH: unique symbol;
declare const IS_ONLINE: unique symbol;
declare const LOGIN_LOCK: unique symbol;
declare const HEARTBEAT: unique symbol;
declare const SSO_HEARTBEAT: unique symbol;
declare const MergeSendList: unique symbol;
declare const MergeSendListHandler: unique symbol;
declare const MergeSendTimer: unique symbol;
export type NTCAPTCHA = {
    url: string;
    ticket?: string;
    randStr?: string;
};
export type NTSession = {
    key: Buffer;
    ticket: Buffer;
    expire_time: number;
};
export type RkeyInfo = {
    rkey: String;
    expire_time: number;
    store_id: number;
    type: number;
};
export type Sig = {
    tlvs: Record<number, Buffer>;
    nt_captcha: NTCAPTCHA | null;
    nt_session: NTSession | null;
    rkey_info: {
        [type: number]: RkeyInfo;
    };
    [key: string]: any;
} & Record<string, any>;
type Packet = {
    cmd: string;
    type: number;
    callbackId?: number;
    body: Buffer;
};
export declare enum VerboseLevel {
    Fatal = 0,
    Mark = 1,
    Error = 2,
    Warn = 3,
    Info = 4,
    Debug = 5
}
export declare class ApiRejection {
    code: number;
    message: string;
    constructor(code: number, message?: string);
}
export declare enum NTLoginErrorCode {
    AccountNotUin = 140022018,
    AccountOrPasswordError = 140022013,
    BlackAccount = 150022021,
    CookieExpired = 150022039,
    CookieUsedExceedUpperLimit = 150022040,
    Default = 140022000,
    ExpireTicket = 140022014,
    Frozen = 140022005,
    IllegalTicket = 140022016,
    IllegalAccount = 150022030,
    InterfaceUnavailable = 150022031,
    InvalidCookie = 140022012,
    InvalidParameter = 140022001,
    KickedTicket = 140022015,
    LhrEfundFreeze = 150022033,
    LongTimeOfNoOperation = 150022035,
    MultiplePasswordIncorrect = 150022029,
    NeedUpdate = 140022004,
    NeedVerifyRealName = 140022019,
    NewDevice = 140022010,
    NiceAccountExpired = 150022020,
    NiceAccountParentChildExpired = 150022025,
    Password = 2,
    PasswordModifiedDuringLogin = 150022032,
    ProofWater = 140022008,
    Protect = 140022006,
    RefusePasswordLogin = 140022009,
    RemindCancelledStatus = 150022028,
    Scan = 1,
    Success = 0,
    SecBeat = 140022017,
    SmsInvalid = 150022026,
    Strict = 140022007,
    SystemFailed = 140022002,
    TestUinLoginNeedChangePwdLimit = 150022034,
    TgtGtExchangeA1Forbid = 150022027,
    TimeoutRetry = 140022003,
    TooManyTimesToday = 150022023,
    TooOften = 150022022,
    Unregistered = 150022024,
    UnusualDevice = 140022011
}
export declare enum QrcodeResult {
    OtherError = 0,
    Timeout = 17,
    WaitingForScan = 48,
    WaitingForConfirm = 53,
    Canceled = 54
}
export declare enum SSOErrorCode {
    UserExtired = -12003,
    BanStateForbidWriteReq = -10203,
    BanStateForbidWriteCmd = -10201,
    BanStateEnd = -10200,
    BanStateBegin = -10300,
    RateLimitExceeded = -10132,
    ConnectAccessDenied = -10131,
    SendA2CheckReqFailed = -10130,
    A2RspTimeout = -10129,
    UncompressedFailed = -10128,
    GuestModeSafeHit = -10127,
    GuestModeNoRight = -10126,
    TeaEmptyButHasA2 = -10125,
    TeaEmptyButHasUid = -10124,
    WebjsapiLoginCheckFail = -10123,
    ProductNoRight = -10122,
    NotTestUin = -10121,
    InvalidPressure = -10120,
    V20Disabled = -10119,
    ParseFailed = -10118,
    AppidInvalid = -10117,
    RsNoInstance = -10116,
    CmdNotConfiged = -10115,
    SubConnFailed = -10114,
    DecryptPingFailed = -10113,
    BlackIPv6Cmd = -10112,
    NotWhiteIPv6Cmd = -10111,
    NotWhiteIPv6Uin = -10110,
    LoginMergeFailed = -10107,
    ForceResetKey = -10106,
    InvalidCookie = -10009,
    RequireA2D2 = -10008,
    VerifyTimeout = -10007,
    D2UinNotMatch = -10006,
    RequireD2Encrypted = -10005,
    InvalidA2Conn = -10004,
    InvalidA2D2 = -10003,
    VerifyCode = -10000,
    D2Expired = -10001,
    ConnectionFull = -302,
    A3Error = 210,
    DocComm = 60,
    TimComm = 50,
    NtFuncMessage = 32,
    ProtoV21 = 21,
    DeviceApp = 21,
    ProtoV20 = 20,
    DeviceComm = 20,
    PressureMessage = 16,
    QcallGuest = 11,
    QcallComm = 10,
    GrayMessage = 8,
    ConnectComm = 6,
    QqGuest = 5,
    MultiEnvMessage = 4,
    NeedSignatureFlag = 4,
    QqGidForTeaKeyemp = 4,
    IpOriginDispatchDomain = 4,
    IpDualStack = 3,
    WifiXgNetwork = 3,
    UnencryptedVerifyD2 = 3,
    SecSignSome = 2,
    EmptyKeyEncrypted = 2,
    PoorNetworkFlag = 2,
    IPv6Stack = 2,
    TraceMessage = 2,
    XgNetwork = 2,
    SecSignAll = 1,
    DyeingMessage = 1,
    QqMail = 1,
    WifiNetwork = 1,
    NoWifiBssidFlag = 1,
    IpOriginHardcodeIp = 1,
    IPv4Stack = 1,
    D2Encrypted = 1,
    SecSignNone = 0,
    ProtoV0 = 0,
    IpUndefined = 0,
    IpOriginDefault = 0,
    DefaultFlag = 0,
    Default = 0,
    UndefinedNetwork = 0,
    Unencrypted = 0,
    Success = 0
}
export interface BaseClient {
    uin: number;
    uid: string;
    /** 昵称 */
    nickname: string;
    /** 收到二维码 */
    on(name: "internal.qrcode", listener: (this: this, qrcode: Buffer, qrInfo: pb.Proto) => void): ToDispose<this>;
    /** 收到滑动验证码 */
    on(name: "internal.slider", listener: (this: this, url: string) => void): ToDispose<this>;
    /** 登录保护验证 */
    on(name: "internal.verify", listener: (this: this, url: string, phone?: string) => void): ToDispose<this>;
    /** 身份验证事件 */
    on(name: "internal.auth", listener: (this: this, info: {
        title: string;
        content: string;
        jump?: {
            word: string;
            url: string;
        };
    }) => void): ToDispose<this>;
    /** token过期(此时已掉线) */
    on(name: "internal.error.token", listener: (this: this) => void): ToDispose<this>;
    /** 网络错误 */
    on(name: "internal.error.network", listener: (this: this, code: number, message: string) => void): ToDispose<this>;
    /** 密码登录相关错误 */
    on(name: "internal.error.login", listener: (this: this, code: number, message: string) => void): ToDispose<this>;
    /** 扫码登录相关错误 */
    on(name: "internal.error.qrcode", listener: (this: this, code: QrcodeResult, message: string) => void): ToDispose<this>;
    /** 登录成功 */
    on(name: "internal.online", listener: (this: this, token: Buffer, nickname: string) => void): ToDispose<this>;
    /** token更新 */
    on(name: "internal.token", listener: (this: this, token: Buffer) => void): ToDispose<this>;
    /** 下线 */
    on(name: "internal.offline", listener: (this: this, reason: string) => void): ToDispose<this>;
    /** 服务器强制下线 */
    on(name: "internal.kickoff", listener: (this: this, reason: string) => void): ToDispose<this>;
    /** 业务包 */
    on(name: "internal.sso", listener: (this: this, cmd: string, payload: Buffer, seq: number) => void): ToDispose<this>;
    /** 日志信息 */
    on(name: "internal.verbose", listener: (this: this, verbose: unknown, level: VerboseLevel) => void): ToDispose<this>;
    on(name: string | symbol, listener: (this: this, ...args: any[]) => void): ToDispose<this>;
}
export declare class BaseClient extends Trapper {
    config: Required<Config>;
    nickname: string;
    QQNT: boolean;
    NTLogin: boolean;
    get useQQNT(): boolean;
    get useNTLogin(): boolean;
    sign_type: string;
    private [IS_ONLINE];
    private [LOGIN_LOCK];
    private [HEARTBEAT];
    private [SSO_HEARTBEAT]?;
    private [MergeSendListHandler];
    private [MergeSendTimer];
    get defaultCmdWhiteList(): string[];
    private [ECDH];
    private readonly [NET];
    private readonly [HANDLERS];
    apk: Apk;
    readonly device: Device;
    readonly sig: Sig;
    readonly pkg: any;
    readonly pskey: {
        [domain: string]: Buffer;
    };
    readonly pt4token: {
        [domain: string]: Buffer;
    };
    /** 心跳间隔(秒) */
    protected interval: number;
    protected ssoInterval: number;
    /** token刷新间隔(秒) */
    emp_interval: number;
    /** 随心跳一起触发的函数，可以随意设定 */
    protected heartbeat: () => void;
    /** token登录重试次数 */
    protected token_retry_num: number;
    /** 上线失败重试次数 */
    protected register_retry_num: number;
    protected login_timer: NodeJS.Timeout | null;
    /** 数据统计 */
    protected readonly statistics: {
        start_time: number;
        lost_times: number;
        recv_pkt_cnt: number;
        sent_pkt_cnt: number;
        lost_pkt_cnt: number;
        recv_msg_cnt: number;
        sent_msg_cnt: number;
        msg_cnt_per_min: number;
        remote_ip: string;
        remote_port: number;
        ver: string;
    };
    protected signCmd: String[];
    private ssoPacketList;
    private [MergeSendList];
    constructor(p: Platform | undefined, d: ShortDevice, config: Required<Config>);
    /** 设置连接服务器，不设置则自动搜索 */
    setRemoteServer(host?: string, port?: number): void;
    setSignServer(addr: string, extSign?: Partial<typeof import("./sign")> & Required<Pick<typeof import("./sign"), "sign_type">>): void;
    once(matcher: Matcher, listener: Listener): Trapper.Dispose;
    off(matcher: Matcher): void;
    emit(matcher: Matcher, ...args: any[]): void;
    /** 是否为在线状态 (可以收发业务包的状态) */
    isOnline(): boolean;
    /** 下线 (keepalive: 是否保持tcp连接) */
    logout(keepalive?: boolean): Promise<void>;
    /** 关闭连接 */
    terminate(): void;
    getApkInfo(platform: Platform, ver?: string): Apk;
    getApkInfoList(platform: Platform): Apk[];
    switchQQVer(ver?: string, force?: boolean): Promise<boolean>;
    updateCmdWhiteList(): Promise<void>;
    getCmdWhiteList(): Promise<string[]>;
    getApiQQVer(): Promise<string>;
    getT544(cmd: string): Promise<Buffer>;
    getSign(cmd: string, seq: number, body: Buffer): Promise<Buffer>;
    apiPing(pathname: string): Promise<{
        code: number;
    }>;
    requestSignToken(): Promise<never[]>;
    submitSsoPacket(cmd: string, callbackId: number, body: Buffer): Promise<Packet[]>;
    refreshToken(force?: boolean): Promise<boolean | undefined>;
    /** 使用接收到的token登录 */
    tokenLogin(token?: Buffer, subcmd?: number): Promise<Buffer>;
    /**
     * 使用密码登录
     * @param uin 登录账号
     * @param md5pass 密码的md5值
     */
    passwordLogin(uin: number, md5pass: Buffer): Promise<void>;
    /** 收到滑动验证码后，用于提交滑动验证码 */
    submitSlider(ticket: string): Promise<void>;
    /** 收到设备锁验证请求后，用于发短信 */
    sendSmsCode(): Promise<void>;
    /** 提交短信验证码 */
    submitSmsCode(code: string): Promise<void>;
    /** 获取登录二维码 */
    fetchQrcode(): Promise<void>;
    fetchLogin(sig: Buffer): Promise<{
        retcode: any;
        retmsg: string;
        qrsig?: undefined;
        t?: undefined;
    } | {
        retcode: any;
        qrsig: any;
        t: {
            [tag: number]: Buffer;
        };
        retmsg?: undefined;
    } | {
        retcode: number;
        qrsig: Buffer;
        retmsg?: undefined;
        t?: undefined;
    }>;
    /** 扫码后调用此方法登录 */
    qrcodeLogin(): Promise<void>;
    /** 获取扫码结果(可定时查询，retcode为0则调用qrcodeLogin登录) */
    queryQrcodeResult(): Promise<{
        retcode: number;
        uin: number | undefined;
        t106: Buffer | undefined;
        t16a: Buffer | undefined;
        t318: Buffer | undefined;
        tgtgt: Buffer | undefined;
    }>;
    keyExchange(): Promise<boolean>;
    ntPasswordLogin(md5pass: Buffer): Promise<void>;
    ntSubmitCaptcha(ticket: string, randStr: string): Promise<void>;
    ntTokenLogin(refresh?: boolean): Promise<Buffer>;
    private [FN_NEXT_SEQ];
    private [FN_SEND];
    sendPacket(body: Uint8Array | Buffer, timeout?: number, seq?: number, build?: {
        type: PacketType;
        encrypt: PacketEncrypt;
        cmd: LoginCmd | string;
        extra?: any;
    }): Promise<Buffer>;
    private [FN_SEND_LOGIN];
    /** 多个业务包合并发送
     * @param list 业务包列表（等待返回包时seq参数自动生成，填写无效）
     * @param timeout 超时时间（秒），默认6秒，为0时不等待返回
     */
    sendMergeUni(list: {
        cmd: string;
        body: Uint8Array;
        seq?: number;
        needResp?: boolean;
    }[], timeout?: number, extra?: any): Promise<unknown>;
    /** 发送一个业务包不等待返回 */
    writeUni(cmd: string, body: Uint8Array, seq?: number, extra?: any): Promise<void>;
    /** dont use it if not clear the usage */
    sendOidb(cmd: string, body: Uint8Array | object, timeout?: number, extra?: any): Promise<Buffer>;
    /** 发送一个业务包并等待返回 */
    sendUni(cmd: string, body: Uint8Array, timeout?: number, extra?: any): Promise<Buffer>;
    sendOidbSvcTrpcTcp(cmd: string | object[], body: Uint8Array | object, extra?: any): Promise<pb.Proto>;
    register(logout?: boolean, reflush?: boolean): Promise<number>;
    syncTimeDiff(): void;
    token_expire(data?: any): Promise<void>;
    sendHeartbeat(): Promise<unknown>;
    startSsoHeartBeat(): void;
    sendSsoHeartBeat(): false | Promise<unknown>;
    generateT544Packet(cmd: String, sign: Buffer): Buffer;
    generateSignPacket(sign: String, token: String, extra: String): Buffer;
    ssoPacketListHandler(list: Packet[] | null): Promise<void>;
    requestToken(): Promise<void>;
}
export type LoginCmd = "wtlogin.login" | "wtlogin.exchange_emp" | "wtlogin.trans_emp" | "wtlogin.qrlogin" | "StatSvc.register" | "Client.CorrectTime" | "Heartbeat.Alive" | "trpc.msg.register_proxy.RegisterProxy.SsoInfoSync" | "trpc.qq_new_tech.status_svc.StatusService.SsoHeartBeat" | "trpc.qq_new_tech.status_svc.StatusService.UnRegister" | "trpc.login.ecdh.EcdhService.SsoNTLoginPasswordLogin" | "trpc.login.ecdh.EcdhService.SsoNTLoginPasswordLoginUnusualDevice" | "trpc.login.ecdh.EcdhService.SsoNTLoginEasyLogin" | "trpc.login.ecdh.EcdhService.SsoNTLoginRefreshA2" | "trpc.login.ecdh.EcdhService.SsoNTLoginRefreshTicket";
export type LoginCmdType = 0 | 1 | 2;
export type PacketType = 0xa | 0xb | 0xd;
export type PacketEncrypt = 0 | 1 | 2;
export declare function buildPacket(this: BaseClient, type: PacketType, encrypt: PacketEncrypt, cmd: string, body: Buffer, seq: number, extra?: any): Promise<Buffer>;
export declare function buildLoginPacket(this: BaseClient, cmdid: number, body: Buffer): Buffer;
export declare function decryptLoginPacket(this: BaseClient, payload: Buffer): Buffer;
export declare function buildNTLoginPacket(this: BaseClient, cmd: LoginCmd | string, params?: pb.Encodable): Promise<Buffer>;
export declare function decryptNTLoginPacket(this: BaseClient, payload: Buffer): any;
export declare function buildLoginTLV(this: BaseClient, subcmd: number, add_tlvs: [number, ...any] | Buffer[], use544?: boolean, t544cmd?: string): Promise<Buffer>;
export declare function buildTransPacket(this: BaseClient, appid: number, role: number, body: Buffer, encrypt?: boolean): Buffer;
export declare function buildCode2dPacket(this: BaseClient, cmdid: number, enable_close: boolean, body: Buffer, seq?: number): Buffer;
export declare function buildQrcodePacket(this: BaseClient, cmdid: number, body: Buffer, seq?: number): Buffer;
export declare function buildReserveField(this: BaseClient, cmd: string, sec_info: Buffer | Uint8Array, extra?: any): Buffer;
export declare function decodeT119(this: BaseClient, t119: Buffer, key?: Buffer | null): ParseTokenRet | null;
/**
 * 0=wtlogin 1=ntlogin 2=local
*/
export type TokenType = 0 | 1 | 2;
export type TokenInfo = {
    emp_time: any;
    icqq_ver: any;
    token_ver: number;
    apk: {
        name: string;
        id: string;
        ver: string;
        version: string;
        subid: number;
        sdkver: string;
        app_key: string;
    };
    device: {
        guid: string;
        qImei16: string | undefined;
        qImei36: string | undefined;
    };
    user: {
        uin: number;
        uid: string;
        nickname: string;
    };
    sig: {
        randkey: any;
        session: any;
    };
};
export type ParseTokenRet = {
    token: Buffer;
    info: TokenInfo;
};
export declare function decodeLoginResponse(this: BaseClient, cmd: LoginCmd, payload: Buffer): any;
export declare function decodeNTLoginResponse(this: BaseClient, cmd: LoginCmd, payload: Buffer): any;
export {};
