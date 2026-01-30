import * as stream from "stream";
import * as net from "net";
import { randomBytes } from "crypto";
import http from "http";
import axios from "axios";
import { tea, pb, ApiRejection } from "../core/index.mjs";
import { ErrorCode } from "../errors.mjs";
import { md5, NOOP, BUF0, int32ip2str } from "../common.mjs";
import { refreshBigDataSession } from "./internal.mjs";
export var CmdID;
(function (CmdID) {
    CmdID[CmdID["DmImage"] = 1] = "DmImage";
    CmdID[CmdID["GroupImage"] = 2] = "GroupImage";
    CmdID[CmdID["SelfPortrait"] = 5] = "SelfPortrait";
    CmdID[CmdID["ShortVideo"] = 25] = "ShortVideo";
    CmdID[CmdID["DmPtt"] = 26] = "DmPtt";
    CmdID[CmdID["MultiMsg"] = 27] = "MultiMsg";
    CmdID[CmdID["GroupPtt"] = 29] = "GroupPtt";
    CmdID[CmdID["OfflineFile"] = 69] = "OfflineFile";
    CmdID[CmdID["GroupFile"] = 71] = "GroupFile";
    CmdID[CmdID["Ocr"] = 76] = "Ocr";
    CmdID[CmdID["NTDmVideo"] = 1001] = "NTDmVideo";
    CmdID[CmdID["NTDmImage"] = 1003] = "NTDmImage";
    CmdID[CmdID["NTGroupImage"] = 1004] = "NTGroupImage";
    CmdID[CmdID["NTGroupVideo"] = 1005] = "NTGroupVideo";
    CmdID[CmdID["NTDmPtt"] = 1007] = "NTDmPtt";
    CmdID[CmdID["NTGroupPtt"] = 1008] = "NTGroupPtt";
    //
})(CmdID || (CmdID = {}));
const __ = Buffer.from([41]);
class HighwayTransform extends stream.Transform {
    constructor(c, obj) {
        super();
        this.c = c;
        this.obj = obj;
        this.seq = randomBytes(2).readUInt16BE();
        this.offset = 0;
        if (!obj.ticket)
            this.obj.ticket = c.sig.bigdata.sig_session;
        if (obj.encrypt && obj.ext)
            this.obj.ext = tea.encrypt(obj.ext, c.sig.bigdata.session_key);
        this.on("error", NOOP);
    }
    _transform(data, encoding, callback) {
        let offset = 0, limit = 1048576;
        while (offset < data.length) {
            const chunk = data.slice(offset, limit + offset);
            const head = pb.encode({
                1: {
                    1: 1,
                    2: String(this.c.uin),
                    3: "PicUp.DataUp",
                    4: this.seq++,
                    6: this.c.apk.subid,
                    7: 4096,
                    8: this.obj.cmdid,
                    10: 2052,
                },
                2: {
                    2: this.obj.size,
                    3: this.offset + offset,
                    4: chunk.length,
                    6: this.obj.ticket,
                    8: md5(chunk),
                    9: this.obj.md5,
                },
                3: this.obj.ext,
            });
            offset += chunk.length;
            const _ = Buffer.allocUnsafe(9);
            _.writeUInt8(40);
            _.writeUInt32BE(head.length, 1);
            _.writeUInt32BE(chunk.length, 5);
            this.push(_);
            this.push(head);
            this.push(chunk);
            this.push(__);
        }
        this.offset += data.length;
        callback(null);
    }
}
/** highway上传数据 (只能上传流) */
export async function highwayUpload(readable, obj, ip, port) {
    port = port || this.sig.bigdata.port;
    if (!port)
        await refreshBigDataSession.call(this);
    port = port || this.sig.bigdata.port;
    ip = int32ip2str(ip || this.sig.bigdata.ip);
    if (!port)
        throw new ApiRejection(ErrorCode.NoUploadChannel, "没有上传通道，如果你刚刚登录，请等待几秒");
    if (!readable)
        throw new ApiRejection(ErrorCode.HighwayFileTypeError, "不支持的file类型");
    return new Promise((resolve, reject) => {
        const highway = new HighwayTransform(this, obj);
        let networkErrorCount = 0;
        const createSocket = (ip, port) => {
            this.logger.debug(`[${obj.md5.toString("hex")}]highway ip:${ip} port:${port}`);
            let upload_timeout = -1;
            const connect_timeout = setTimeout(() => {
                socket.destroy(new Error(`[${obj.md5.toString("hex")}]highway ip:${ip} port:${port} connect timeout`));
            }, 6000);
            const socket = net.connect(port, ip, () => {
                clearTimeout(connect_timeout);
                if (obj.timeout > 0) {
                    upload_timeout = setTimeout(() => {
                        readable.unpipe(highway).destroy();
                        highway.unpipe(socket).destroy();
                        socket.end();
                        reject(new ApiRejection(ErrorCode.HighwayTimeout, `[${obj.md5.toString("hex")}]上传超时(${obj.timeout}s)`));
                    }, obj.timeout * 1000);
                }
                readable.pipe(highway).pipe(socket, { end: false });
            });
            const handleRspHeader = (header) => {
                const rsp = pb.decode(header);
                if (typeof rsp[3] === "number" && rsp[3] !== 0) {
                    this.logger.warn(`[${obj.md5.toString("hex")}]highway upload failed (code: ${rsp[3]})`);
                    readable.unpipe(highway).destroy();
                    highway.unpipe(socket).destroy();
                    socket.end();
                    reject(new ApiRejection(rsp[3], `[${obj.md5.toString("hex")}]unknown highway error`));
                }
                else {
                    const percentage = (((rsp[2][3] + rsp[2][4]) / obj.size) * 100).toFixed(2);
                    this.logger.debug(`[${obj.md5.toString("hex")}]highway chunk uploaded (${percentage}%)`);
                    if (typeof obj.callback === "function")
                        obj.callback(percentage);
                    if ((rsp[2][3] + rsp[2][4]) >= obj.size) {
                        socket.end();
                        resolve(rsp);
                    }
                }
            };
            let buf = BUF0;
            socket.on("data", (chunk) => {
                try {
                    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
                    while (buf.length >= 5) {
                        const len = buf.readInt32BE(1);
                        if (buf.length >= len + 10) {
                            handleRspHeader(buf.slice(9, len + 9));
                            buf = buf.slice(len + 10);
                        }
                        else {
                            break;
                        }
                    }
                }
                catch (err) {
                    this.logger.error(err);
                }
            });
            socket.on("close", (had_error) => {
                clearTimeout(upload_timeout);
                if (had_error) {
                    if (ip != int32ip2str(this.sig.bigdata.ip) && this.sig.bigdata.port) {
                        this.logger.error(`[${obj.md5.toString("hex")}]highway ip:${ip} port:${port} network error`);
                        createSocket(int32ip2str(this.sig.bigdata.ip), this.sig.bigdata.port);
                        return;
                    }
                    else if (networkErrorCount < 3) {
                        networkErrorCount++;
                        refreshBigDataSession.call(this).finally(() => {
                            createSocket(int32ip2str(this.sig.bigdata.ip), this.sig.bigdata.port);
                        });
                        return;
                    }
                    reject(new ApiRejection(ErrorCode.HighwayNetworkError, `[${obj.md5.toString("hex")}]上传遇到网络错误`));
                }
            });
            socket.on("error", (err) => {
                this.logger.error(err);
            });
            readable.on("error", err => {
                this.logger.error(err);
                socket.end();
            });
        };
        createSocket(ip, port);
    });
}
const agent = new http.Agent({ maxSockets: 10 });
export async function highwayHttpUpload(readable, obj, ip, port) {
    port = port || this.sig.bigdata.port;
    if (!port)
        await refreshBigDataSession.call(this);
    port = port || this.sig.bigdata.port;
    ip = int32ip2str(ip || this.sig.bigdata.ip);
    if (!port)
        throw new ApiRejection(ErrorCode.NoUploadChannel, "没有上传通道，如果你刚刚登录，请等待几秒");
    this.logger.debug(`highway(http) ip:${ip} port:${port}`);
    const url = "http://" + ip + ":" + port + "/cgi-bin/httpconn?htcmd=0x6FF0087&uin=" + this.uin;
    let seq = 1;
    let offset = 0, limit = 524288;
    obj.ticket = this.sig.bigdata.sig_session;
    const tasks = new Set();
    const controller = new AbortController();
    const cancels = new Set();
    let finished = 0;
    readable.on("data", data => {
        let _offset = 0;
        while (_offset < data.length) {
            const chunk = data.slice(_offset, limit + _offset);
            const head = pb.encode({
                1: {
                    1: 1,
                    2: String(this.uin),
                    3: "PicUp.DataUp",
                    4: seq++,
                    5: 0,
                    6: this.apk.subid,
                    8: obj.cmdid,
                },
                2: {
                    1: 0,
                    2: obj.size,
                    3: offset + _offset,
                    4: chunk.length,
                    6: obj.ticket,
                    8: md5(chunk),
                    9: obj.md5,
                    10: 0,
                    13: 0,
                },
                3: obj.ext,
                4: Date.now(),
            });
            _offset += chunk.length;
            const _ = Buffer.allocUnsafe(9);
            _.writeUInt8(40);
            _.writeUInt32BE(head.length, 1);
            _.writeUInt32BE(chunk.length, 5);
            const buf = Buffer.concat([_, head, chunk, __]);
            const task = new Promise((resolve, reject) => {
                const c = axios.CancelToken.source();
                cancels.add(c);
                axios
                    .post(url, buf, {
                    responseType: "arraybuffer",
                    httpAgent: agent,
                    cancelToken: c.token,
                    headers: {
                        "Content-Length": String(buf.length),
                        "Content-Type": "application/octet-stream",
                    },
                })
                    .then(r => {
                    let percentage, rsp;
                    try {
                        const buf = Buffer.from(r?.data);
                        const header = buf.slice(9, buf.length - 1);
                        rsp = pb.decode(header);
                    }
                    catch (err) {
                        this.logger.error(err);
                        reject(err);
                        return;
                    }
                    if (rsp?.[3] !== 0) {
                        controller.abort();
                        reject(new ApiRejection(rsp[3], "unknown highway error"));
                        return;
                    }
                    ++finished;
                    percentage = ((finished / tasks.size) * 100).toFixed(2);
                    this.logger.debug(`[${obj.md5.toString("hex")}]highway(http) chunk uploaded (${percentage}%)`);
                    if (typeof obj.callback === "function" && percentage)
                        obj.callback(percentage);
                    if (finished < tasks.size && rsp[7]?.toBuffer().length > 0) {
                        cancels.forEach(c => c.cancel());
                        this.logger.debug(`[${obj.md5.toString("hex")}]highway(http) chunk uploaded (100.00%)`);
                        if (typeof obj.callback === "function")
                            obj.callback("100.00");
                    }
                    /*if (finished >= tasks.size && rsp[2][7] !== 1)
                        reject(
                            new ApiRejection(ErrorCode.UnsafeFile, `[${obj.md5.toString("hex")}]文件校验未通过，上传失败`),
                        );
                    */
                    resolve(rsp);
                })
                    .catch(reject);
            });
            tasks.add(task);
        }
        offset += data.length;
    });
    return new Promise((resolve, reject) => {
        readable.on("err", reject).on("end", () => {
            Promise.all(tasks)
                .then(resolve)
                .catch(err => {
                if (err instanceof axios.Cancel === false) {
                    cancels.forEach(c => c.cancel());
                    reject(err);
                }
                resolve(undefined);
            });
        });
    });
}
