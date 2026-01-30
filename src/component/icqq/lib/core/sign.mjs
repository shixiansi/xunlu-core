import _axios from "axios";
import { VerboseLevel } from "./base-client.mjs";
import { BUF0, hrtimeToMs } from "./constants.mjs";
import http from "http";
import https from "https";
import WebSocket from "ws";
export const sign_type = "default";
const axios = _axios.create({
    httpAgent: new http.Agent({
        keepAlive: true,
        keepAliveMsecs: 60000,
    }),
    httpsAgent: new https.Agent({
        keepAlive: true,
        keepAliveMsecs: 60000,
    }),
    timeout: 20000,
    headers: {
        "Connection": "keep-alive",
    },
});
const ws = {
    seq: 1000,
    webSocket: null,
    map: new Map(),
    message: (data) => {
        try {
            data = JSON.parse(data.toString());
            ws.map.get(data.ws_seq)?.(data);
        }
        catch { }
    },
};
export async function getT544(cmd) {
    let sign = BUF0;
    if (this.sig.sign_api_addr && this.apk.fekit_ver) {
        const time = process.hrtime();
        let post_params = {
            ver: this.apk.ver,
            fekit_ver: this.apk.fekit_ver,
            uin: this.uin || 0,
            data: cmd,
            guid: this.device.guid.toString("hex"),
            version: this.apk.sdkver,
        };
        const ret = await get.bind(this)("energy", post_params, true);
        const log = `getT544:${cmd} result(${hrtimeToMs(process.hrtime(time))}ms):${JSON.stringify(ret)}`;
        if (ret.code === 0) {
            this.emit("internal.verbose", log, VerboseLevel.Debug);
            if (typeof ret.data === "string") {
                sign = Buffer.from(ret.data, "hex");
            }
            else if (typeof ret.data?.sign === "string") {
                sign = Buffer.from(ret.data.sign, "hex");
                if (typeof ret.data.t553 === "string")
                    this.sig.t553 = Buffer.from(ret.data.t553, "hex");
            }
        }
        else {
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
            androidId: this.device.android_id,
            qimei36: qImei36 || this.device.android_id,
            guid: this.device.guid.toString("hex"),
            buffer: body.toString("hex"),
        };
        const ret = await get.bind(this)("sign", post_params, true);
        const log = `getSign:${cmd} seq:${seq} result(${hrtimeToMs(process.hrtime(time))}ms):${JSON.stringify(ret)}`;
        if (ret.code === 0) {
            this.emit("internal.verbose", log, VerboseLevel.Debug);
            const data = ret.data || {};
            params = this.generateSignPacket(data.sign, data.token, data.extra);
            let list = data.ssoPacketList || data.requestCallback || [];
            if (list.length > 0)
                this.ssoPacketListHandler(list);
        }
        else {
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
            qua: this.apk.qua,
            uin: this.uin || 0,
            androidId: this.device.android_id,
            qimei36: qImei36 || this.device.android_id,
            guid: this.device.guid.toString("hex"),
        };
        const ret = await get.bind(this)("request_token", post_params, true);
        this.emit("internal.verbose", `requestSignToken result(${hrtimeToMs(process.hrtime(time))}ms): ${JSON.stringify(ret)}`, VerboseLevel.Debug);
        if (ret.code === 0) {
            let ssoPacketList = ret.data?.ssoPacketList || ret.data?.requestCallback || ret.data;
            if (!ssoPacketList || ssoPacketList.length < 1)
                return [];
            return ssoPacketList;
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
            callbackId: callbackId,
            androidId: this.device.android_id,
            qimei36: qImei36 || this.device.android_id,
            buffer: body.toString("hex"),
            guid: this.device.guid.toString("hex"),
        };
        const ret = await get.bind(this)("submit", post_params, true);
        this.emit("internal.verbose", `submitSsoPacket result(${hrtimeToMs(process.hrtime(time))}ms): ${JSON.stringify(ret)}`, VerboseLevel.Debug);
        if (ret.code === 0) {
            let ssoPacketList = ret.data?.ssoPacketList || ret.data?.requestCallback || ret.data;
            if (!ssoPacketList || ssoPacketList.length < 1)
                return [];
            return ssoPacketList;
        }
    }
    return [];
}
export async function getApiQQVer() {
    let QQVer = this.config.ver;
    if (!this.sig.sign_api_addr)
        return QQVer;
    const apks = this.getApkInfoList(this.config.platform);
    const packageName = this.apk.id;
    const ret = await get.bind(this)("ver");
    if (ret.code === 0) {
        const vers = ret?.data[packageName];
        if (vers && vers.length > 0) {
            for (let ver of vers) {
                if (apks.find(val => val.ver === ver)) {
                    QQVer = ver;
                    break;
                }
            }
        }
    }
    return QQVer;
}
export async function getCmdWhiteList() {
    let whiteList = this.defaultCmdWhiteList;
    if (!this.sig.sign_api_addr)
        return whiteList;
    const ret = await get.bind(this)("cmd_whitelist", {
        ver: this.apk.ver,
        fekit_ver: this.apk.fekit_ver,
        uin: this.uin || 0,
    });
    if (ret.code === 0)
        whiteList = ret?.data?.list || whiteList;
    return whiteList;
}
export async function apiPing(pathname = "ping") {
    if (!this.sig.sign_api_addr)
        return false;
    const url = new URL(this.sig.sign_api_addr);
    url.pathname += pathname;
    const ret = (await ws_get.bind(this)(pathname)) ||
        (await axios
            .get(url.href, {
            headers: {
                "User-Agent": `icqq@${this.pkg.version} (Released on ${this.pkg.upday})`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
        })
            .catch(err => ({ data: { code: -1, msg: err?.message } })));
    return ret?.data || { code: -1 };
}
async function get(path, params = {}, post = false) {
    const url = new URL(this.sig.sign_api_addr);
    if (url.pathname.includes("/ws"))
        url.pathname = url.pathname.substring(0, url.pathname.length - 3);
    url.pathname += path;
    let data = { code: -1 };
    let num = 0;
    while (data.code === -1 && num < 3) {
        if (num > 0)
            await new Promise(resolve => setTimeout(resolve, 2000));
        num++;
        const ws_data = await ws_get.bind(this)(path, params);
        if (ws_data === null) {
            if (post) {
                data = await axios
                    .post(url.href, params, {
                    headers: {
                        "User-Agent": `icqq@${this.pkg.version} (Released on ${this.pkg.upday})`,
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                })
                    .catch(err => ({ data: { code: -1, msg: err?.message } }));
            }
            else {
                data = await axios
                    .get(url.href, {
                    params,
                    headers: {
                        "User-Agent": `icqq@${this.pkg.version} (Released on ${this.pkg.upday})`,
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                })
                    .catch(err => ({ data: { code: -1, msg: err?.message } }));
            }
        }
        else {
            data = ws_data;
        }
        data = data.data || data;
    }
    return data;
}
async function ws_get(path, params = {}) {
    if (ws.seq < 1 || !(this.sig.sign_api_addr && this.sig.sign_api_addr.includes("/ws")))
        return null;
    const url = new URL(this.sig.sign_api_addr);
    try {
        return await new Promise(async (resolve, reject) => {
            if (!ws.webSocket || ws.webSocket.readyState > 1) {
                ws.webSocket = new WebSocket(`${url.protocol === "https:" ? "wss" : "ws"}://${url.host}/ws`);
                ws.webSocket.on("error", error => {
                    reject(error);
                });
                ws.webSocket.on("ping", data => ws.webSocket?.pong(data));
                ws.webSocket.on("message", data => ws.message(data));
            }
            if (ws.webSocket.readyState === 0) {
                await new Promise(_resolve => {
                    const timer = setInterval(() => {
                        if (ws.webSocket?.readyState !== 0) {
                            clearInterval(timer);
                            _resolve("");
                        }
                    }, 1);
                });
            }
            const ws_seq = ++ws.seq;
            const id = setTimeout(() => {
                ws.map.delete(ws_seq);
                resolve({ data: { code: -1, msg: "api等待超时" } });
            }, 20000);
            params = { path: `/${path}`, ws_seq, ...params };
            ws.map.set(ws_seq, data => {
                clearTimeout(id);
                ws.map.delete(ws_seq);
                resolve({ data: data });
            });
            try {
                ws.webSocket?.send(new URLSearchParams(Object.entries(params)).toString());
            }
            catch (err) {
                resolve({ data: { code: -1, msg: err } });
            }
        });
    }
    catch {
        //ws.seq = -1;
        return null;
    }
}
