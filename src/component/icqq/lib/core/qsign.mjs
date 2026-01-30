import _axios from "axios";
import { VerboseLevel } from "./base-client.mjs";
import { BUF0, hrtimeToMs } from "./constants.mjs";
import http from "http";
import https from "https";
export const sign_type = "qsign";
const axios = _axios.create({
    httpAgent: new http.Agent({
        keepAlive: true,
        keepAliveMsecs: 60000,
    }),
    httpsAgent: new https.Agent({
        keepAlive: true,
        keepAliveMsecs: 60000,
    }),
    timeout: 30000,
    headers: {
        "Connection": "keep-alive",
    },
});
export async function getT544(cmd) {
    let sign = BUF0;
    if (this.sig.sign_api_addr && this.apk.fekit_ver) {
        const time = process.hrtime();
        const qImei36 = this.device.qImei36 || this.device.qImei16;
        let post_params = {
            ver: this.apk.ver,
            fekit_ver: this.apk.fekit_ver,
            uin: this.uin || 0,
            data: cmd,
            android_id: this.device.android_id,
            qimei36: qImei36 || this.device.android_id,
            guid: this.device.guid.toString("hex"),
            version: this.apk.sdkver,
        };
        const url = new URL(this.sig.sign_api_addr);
        url.pathname += "energy";
        const data = await get.bind(this)(url.href, post_params);
        const log = `[qsign]getT544:${cmd} result(${hrtimeToMs(process.hrtime(time))}ms):${JSON.stringify(data)}`;
        if (data.code === 0) {
            this.emit("internal.verbose", log, VerboseLevel.Debug);
            if (typeof data.data === "string") {
                sign = Buffer.from(data.data, "hex");
            }
            else if (typeof data.data?.sign === "string") {
                sign = Buffer.from(data.data.sign, "hex");
            }
        }
        else {
            if (data.code === 1) {
                if (data.msg.includes("Uin is not registered.")) {
                    if (await register.call(this)) {
                        return await this.getT544(cmd);
                    }
                }
            }
            this.emit("internal.verbose", `签名api异常：${log}`, VerboseLevel.Error);
        }
    }
    return this.generateT544Packet(cmd, sign);
}
export async function getSign(cmd, seq, body) {
    let params = BUF0;
    if (this.sig.sign_api_addr && this.apk.fekit_ver) {
        const qImei36 = this.device.qImei36 || this.device.qImei16;
        const time = process.hrtime();
        let post_params = {
            ver: this.apk.ver,
            fekit_ver: this.apk.fekit_ver,
            qua: this.apk.qua,
            uin: this.uin || 0,
            cmd: cmd,
            seq: seq,
            android_id: this.device.android_id,
            qimei36: qImei36 || this.device.android_id,
            buffer: body.toString("hex"),
            guid: this.device.guid.toString("hex"),
        };
        const url = new URL(this.sig.sign_api_addr);
        url.pathname += "sign";
        const data = await get.bind(this)(url.href, post_params, true);
        const log = `[qsign]sign:${cmd} seq:${seq} result(${hrtimeToMs(process.hrtime(time))}ms):${JSON.stringify(data)}`;
        if (data.code === 0) {
            this.emit("internal.verbose", log, VerboseLevel.Debug);
            const Data = data.data || {};
            params = this.generateSignPacket(Data.sign, Data.token, Data.extra);
            let list = Data.ssoPacketList || Data.requestCallback || [];
            if (list.length > 0)
                this.ssoPacketListHandler(list);
        }
        else {
            if (data.code === 1) {
                if (data.msg.includes("Uin is not registered.")) {
                    if (await register.call(this)) {
                        return await this.getSign(cmd, seq, body);
                    }
                }
            }
            this.emit("internal.verbose", `签名api异常：${log}`, VerboseLevel.Error);
        }
    }
    return params;
}
export async function requestSignToken() {
    if (this.sig.sign_api_addr && this.apk.fekit_ver) {
        const qImei36 = this.device.qImei36 || this.device.qImei16;
        const time = process.hrtime();
        let post_params = {
            ver: this.apk.ver,
            fekit_ver: this.apk.fekit_ver,
            uin: this.uin || 0,
            android_id: this.device.android_id,
            qimei36: qImei36 || this.device.android_id,
            guid: this.device.guid.toString("hex"),
        };
        const url = new URL(this.sig.sign_api_addr);
        url.pathname += "request_token";
        const data = await get.bind(this)(url.href, post_params);
        this.emit("internal.verbose", `[qsign]requestSignToken result(${hrtimeToMs(process.hrtime(time))}ms): ${JSON.stringify(data)}`, VerboseLevel.Debug);
        if (data.code === 0) {
            let ssoPacketList = data.data?.ssoPacketList || data.data?.requestCallback || data.data;
            if (!ssoPacketList || ssoPacketList.length < 1)
                return [];
            return ssoPacketList;
        }
        else if (data.code === 1) {
            if (data.msg.includes("Uin is not registered.")) {
                if (await register.call(this)) {
                    return await this.requestSignToken();
                }
            }
        }
    }
    return [];
}
export async function submitSsoPacket(cmd, callbackId, body) {
    if (this.sig.sign_api_addr && this.apk.fekit_ver) {
        const qImei36 = this.device.qImei36 || this.device.qImei16;
        const time = process.hrtime();
        let post_params = {
            ver: this.apk.ver,
            fekit_ver: this.apk.fekit_ver,
            qua: this.apk.qua,
            uin: this.uin || 0,
            cmd: cmd,
            callback_id: callbackId,
            android_id: this.device.android_id,
            qimei36: qImei36 || this.device.android_id,
            buffer: body.toString("hex"),
            guid: this.device.guid.toString("hex"),
        };
        const url = new URL(this.sig.sign_api_addr);
        url.pathname += "submit";
        const data = await get.bind(this)(url.href, post_params);
        this.emit("internal.verbose", `[qsign]submitSsoPacket result(${hrtimeToMs(process.hrtime(time))}ms): ${JSON.stringify(data)}`, VerboseLevel.Debug);
        if (data.code === 0) {
            let ssoPacketList = data.data?.ssoPacketList || data.data?.requestCallback || data.data;
            if (!ssoPacketList || ssoPacketList.length < 1)
                return [];
            return ssoPacketList;
        }
    }
    return [];
}
async function register() {
    const qImei36 = this.device.qImei36 || this.device.qImei16;
    const time = process.hrtime();
    let post_params = {
        ver: this.apk.ver,
        fekit_ver: this.apk.fekit_ver,
        uin: this.uin || 0,
        android_id: this.device.android_id,
        qimei36: qImei36,
        guid: this.device.guid.toString("hex"),
    };
    const url = new URL(this.sig.sign_api_addr);
    url.pathname += "register";
    const data = await get.bind(this)(url.href, post_params);
    this.emit("internal.verbose", `[qsign]register result(${hrtimeToMs(process.hrtime(time))}ms): ${JSON.stringify(data)}`, VerboseLevel.Debug);
    if (data.code == 0) {
        return true;
    }
    this.emit("internal.verbose", `[qsign]签名api注册异常：result(${hrtimeToMs(process.hrtime(time))}ms): ${JSON.stringify(data)}`, VerboseLevel.Error);
    return false;
}
export async function getApiQQVer() {
    let QQVer = this.config.ver;
    if (!this.sig.sign_api_addr)
        return QQVer;
    const apks = this.getApkInfoList(this.config.platform);
    const packageName = this.apk.id;
    const data = await get.bind(this)(this.sig.sign_api_addr);
    if (data.code === 0) {
        const ver = data?.data?.protocol?.version;
        if (ver) {
            if (apks.find(val => val.ver === ver)) {
                QQVer = ver;
            }
        }
    }
    return QQVer;
}
export async function apiPing(pathname = "") {
    if (!this.sig.sign_api_addr || !pathname)
        return false;
    const url = new URL(this.sig.sign_api_addr);
    url.pathname += pathname;
    const ret = await axios
        .get(url.href, {
        headers: {
            "User-Agent": `icqq@${this.pkg.version} (Released on ${this.pkg.upday})`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
    })
        .catch(err => ({ data: { code: -1, msg: err?.message } }));
    return ret?.data || { code: -1 };
}
async function get(url, params = {}, post = false) {
    let data = { code: -1 };
    let num = 0;
    while (data.code == -1 && num < 3) {
        if (num > 0)
            await new Promise(resolve => setTimeout(resolve, 2000));
        num++;
        if (post) {
            data = await axios
                .post(url, params, {
                headers: {
                    "User-Agent": `icqq@${this.pkg.version} (Released on ${this.pkg.upday})`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            })
                .catch(err => ({ data: { code: -1, msg: err?.message } }));
        }
        else {
            data = await axios
                .get(url, {
                params,
                headers: {
                    "User-Agent": `icqq@${this.pkg.version} (Released on ${this.pkg.upday})`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            })
                .catch(err => ({ data: { code: -1, msg: err?.message } }));
        }
        data = data.data;
    }
    return data;
}
