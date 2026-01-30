"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bindInternalListeners = bindInternalListeners;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const pngjs_1 = require("pngjs");
const core_1 = require("../core");
const common_1 = require("../common");
const pbgetmsg_1 = require("./pbgetmsg");
const onlinepush_1 = require("./onlinepush");
const guild_1 = require("./guild");
async function pushNotifyListener(payload) {
    if (!this._sync_cookie || this.useQQNT)
        return;
    try {
        var nested = core_1.jce.decodeWrapper(payload.slice(4));
    }
    catch {
        var nested = core_1.jce.decodeWrapper(payload.slice(15));
    }
    onlinepush_1.pushNotify.call(this, nested[5]);
}
const events = {
    "trpc.msg.olpush.OlPushService.MsgPush": onlinepush_1.ntMsgListener,
    "trpc.msg.register_proxy.RegisterProxy.InfoSyncPush": onlinepush_1.syncPushListener,
    "OnlinePush.PbPushGroupMsg": onlinepush_1.groupMsgListener,
    "OnlinePush.PbPushDisMsg": onlinepush_1.discussMsgListener,
    "OnlinePush.ReqPush": onlinepush_1.onlinePushListener,
    "OnlinePush.PbPushTransMsg": onlinepush_1.onlinePushTransListener,
    "OnlinePush.PbC2CMsgSync": onlinepush_1.dmMsgSyncListener,
    "MessageSvc.PushNotify": pushNotifyListener,
    "MessageSvc.PushReaded": pbgetmsg_1.pushReadedListener,
    // "trpc.group_pro.synclogic.SyncLogic.PushFirstView": guildListPushListener,
    "MsgPush.PushGroupProMsg": guild_1.guildMsgListener,
};
/** 事件总线, 在这里捕获奇怪的错误 */
async function eventsListener(cmd, payload, seq) {
    try {
        await Reflect.get(events, cmd)?.call(this, payload, seq);
    }
    catch (e) {
        this.logger.trace(e);
    }
}
/** 上线后加载资源 */
async function onlineListener(token, nickname) {
    this.nickname = nickname;
    //this.age = age;
    //this.sex = gender ? (gender === 1 ? "male" : "female") : "unknown";
    // 存token
    tokenUpdatedListener.call(this, token);
    this.log_level = this.config.log_level;
    this.logger.mark(`正在加载资源...`);
    await this.getProfile(this.uid || this.uin).then(profile => {
        if (!profile)
            return;
        this.nickname = profile.nickname;
        this.age = profile.age;
        this.sex = profile.sex;
    }).catch(common_1.NOOP);
    // 恢复之前的状态
    if (!this.status) {
        this.getOnlineStatus().then(status => {
            this.status = status || common_1.OnlineStatus.Online;
            this.setOnlineStatus(this.status);
        });
    }
    else {
        this.setOnlineStatus(this.status);
    }
    await Promise.allSettled([
        this.reloadFriendList(),
        this.reloadGroupList(),
        this.reloadStrangerList(),
        this.reloadGuilds(),
        this.reloadBlackList(),
        this.refreshNTPicRkey()
    ]);
    this.logger.mark(`Welcome, ${this.nickname || this.uin} ! 加载了${this.fl.size}个好友，${this.gl.size}个群，${this.guilds.size}个频道，${this.sl.size}个陌生人`);
    pbgetmsg_1.pbGetMsg.call(this).catch(common_1.NOOP);
    this.em("system.online");
}
function tokenUpdatedListener(token) {
    if (token == common_1.BUF0)
        return;
    const token_path = path.join(this.dir, this.uin + "_" + this.apk.id.split(".").slice(2).join("-") + "_token");
    if (fs.existsSync(token_path))
        fs.renameSync(token_path, token_path + "_bak");
    fs.writeFile(token_path, token, () => {
        fs.unlink(token_path + "_bak", common_1.NOOP);
    });
    this.sig.token_retry_count = 0;
}
function offlineListener(message) {
    this.em("system.offline", { message });
}
function kickoffListener(message) {
    this.logger.warn(message);
    this.terminate();
    //fs.unlink(path.join(this.dir, this.uin + '_token'), NOOP)
    this.em("system.offline.kickoff", { message });
}
function logQrcode(img) {
    const png = pngjs_1.PNG.sync.read(img);
    const color_reset = "\x1b[0m";
    const color_fg_blk = "\x1b[30m";
    const color_bg_blk = "\x1b[40m";
    const color_fg_wht = "\x1b[37m";
    const color_bg_wht = "\x1b[47m";
    for (let i = 36; i < png.height * 4 - 36; i += 24) {
        let line = "";
        for (let j = 36; j < png.width * 4 - 36; j += 12) {
            let r0 = png.data[i * png.width + j];
            let r1 = png.data[i * png.width + j + png.width * 4 * 3];
            let bgcolor = r0 == 255 ? color_bg_wht : color_bg_blk;
            let fgcolor = r1 == 255 ? color_fg_wht : color_fg_blk;
            line += `${fgcolor + bgcolor}\u2584`;
        }
        console.log(line + color_reset);
    }
    console.log(`${color_fg_blk + color_bg_wht}       请使用 手机QQ 扫描二维码        ${color_reset}`);
    console.log(`${color_fg_blk + color_bg_wht}                                       ${color_reset}`);
}
function qrcodeListener(image, qrInfo) {
    const file = path.join(this.dir, "qrcode.png");
    fs.writeFile(file, image, () => {
        try {
            logQrcode(image);
        }
        catch { }
        this.logger.mark("二维码图片已保存到：" + file);
        this.em("system.login.qrcode", { image, qrInfo });
    });
}
function sliderListener(url) {
    this.logger.mark(`收到滑动验证码，请访问以下地址完成滑动，并从网络响应中取出ticket${this.sig.nt_captcha ? '和randstr参数以英文逗号拼接' : ''}输入：` + url);
    this.em("system.login.slider", { url });
}
function verifyListener(url, phone) {
    this.logger.mark(`收到登录保护，只需验证一次便长期有效，${phone ? '可以访问URL验证或发短信验证' : '请访问URL验证'}`);
    this.logger.mark("登录保护验证URL：" + url); //.replace("verify", "qrcode"));
    if (phone)
        this.logger.mark('发短信验证需要调用sendSmsCode()和submitSmsCode()方法。');
    if (phone)
        this.logger.mark("密保手机号：" + phone);
    return this.em("system.login.device", { url, phone });
}
function authListener(info) {
    const message = `[${info.title}]${info.content}`;
    if (!info.jump)
        return this.emit("internal.error.login", 237, message);
    this.logger.mark(message);
    this.logger.mark("访问URL完成验证后调用login()可直接登录（需要提交设备信息）。");
    this.logger.mark(`${info.jump.word}: ${info.jump.url}`);
    const device = {
        guid: this.device.guid.toString("hex"),
        qimei: this.device.qImei36,
        qimei36: this.device.qImei36,
        subappid: String(this.apk.subid),
        platform: String(core_1.NTLoginPlatform[this.apk.login_platform]),
        brand: this.device.brand,
        model: this.device.model,
        bssid: "",
        devInfo: `${this.device.brand} ${this.device.model}`,
        sysVersion: String(this.device.version.sdk),
    };
    return this.em("system.login.auth", {
        url: String(info.jump.url),
        device,
    });
}
/**
 * 登录相关错误
 * @param code -2服务器忙 -3上线失败(需要删token)
 */
function loginErrorListener(code, message) {
    if (message)
        this.logger.error(message);
    if (this.login_timer)
        return;
    // token expired
    if (!code || code < -100) {
        this.logger.mark("登录token过期");
        this.em("system.token.expire");
        this.sig.token_retry_count++;
        //fs.unlink(path.join(this.dir, this.uin + "_token"), NOOP)
        this.logger.mark("3秒后重新连接");
        this.login_timer = setTimeout(this.login.bind(this), 3000);
    }
    // network error
    else if (code < 0) {
        this.terminate();
        if (code === -3) {
            //register failed
            //fs.unlink(path.join(this.dir, this.uin + "_token"), NOOP)
            this.sig.token_retry_count = this.token_retry_num - 1;
        }
        const t = this.config.reconn_interval;
        if (t >= 1) {
            this.logger.mark(t + "秒后重新连接");
            this.login_timer = setTimeout(this.login.bind(this, this.uin), t * 1000);
        }
        this.em("system.offline.network", { message });
    }
    // login error
    else if (code > 0) {
        this.em("system.login.error", { code, message });
    }
}
function qrcodeErrorListener(code, message) {
    this.logger.error(`二维码扫码遇到错误: ${code} (${message})`);
    switch (code) {
        case core_1.QrcodeResult.Timeout:
        case core_1.QrcodeResult.Canceled:
            this.sig.qrsig = common_1.BUF0;
            this.logger.mark("二维码已更新");
            this.login();
            break;
        default:
            process.stdin.once("data", () => {
                this.login();
            });
    }
}
function bindInternalListeners() {
    this.on("internal.online", onlineListener);
    this.on("internal.offline", offlineListener);
    this.on("internal.kickoff", kickoffListener);
    this.on("internal.token", tokenUpdatedListener);
    this.on("internal.qrcode", qrcodeListener);
    this.on("internal.slider", sliderListener);
    this.on("internal.verify", verifyListener);
    this.on("internal.auth", authListener);
    this.on("internal.error.token", loginErrorListener);
    this.on("internal.error.login", loginErrorListener);
    this.on("internal.error.qrcode", qrcodeErrorListener);
    this.on("internal.error.network", loginErrorListener);
    this.on("internal.sso", eventsListener);
}
