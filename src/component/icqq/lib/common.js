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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OnlineStatus = exports.MAX_UPLOAD_SIZE = exports.TMP_DIR = exports.IS_WIN = exports.PB_CONTENT = exports.DownloadTransform = void 0;
exports.uuid = uuid;
exports.md5Stream = md5Stream;
exports.shaStream = shaStream;
exports.fileHash = fileHash;
exports.code2uin = code2uin;
exports.uin2code = uin2code;
exports.parseFunString = parseFunString;
exports.escapeXml = escapeXml;
exports.log = log;
const fs = __importStar(require("fs"));
const crypto = __importStar(require("crypto"));
const stream = __importStar(require("stream"));
const util = __importStar(require("util"));
const os = __importStar(require("os"));
const pb = __importStar(require("./core/protobuf"));
/**
 * 生成UUID
 * @returns UUID字符串
 */
function uuid() {
    const hex = crypto.randomBytes(16).toString("hex");
    return [
        hex.substring(0, 8),
        hex.substring(8, 12),
        hex.substring(12, 16),
        hex.substring(16, 20),
        hex.substring(20),
    ].join("-");
}
/**
 * 计算流的MD5值
 * @param readable 可读流
 * @returns Promise<Buffer> MD5值
 */
function md5Stream(readable) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash("md5");
        readable.on("error", reject);
        hash.on("error", reject);
        hash.on("data", resolve);
        readable.pipe(hash);
    });
}
/**
 * 计算流的SHA1值
 * @param readable 可读流
 * @returns Promise<Buffer> SHA1值
 */
function shaStream(readable) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash("sha1");
        readable.on("error", reject);
        hash.on("error", reject);
        hash.on("data", resolve);
        readable.pipe(hash);
    });
}
/**
 * 计算文件的MD5和SHA1值
 * @param filepath 文件路径
 * @returns Promise<[Buffer, Buffer]> [MD5, SHA1]
 */
function fileHash(filepath) {
    const readable = fs.createReadStream(filepath);
    const sha1Promise = new Promise((resolve, reject) => {
        const hash = crypto.createHash("sha1");
        readable.on("error", reject);
        hash.on("error", reject);
        hash.on("data", resolve);
        readable.pipe(hash);
    });
    return Promise.all([md5Stream(readable), sha1Promise]);
}
/** 群号转uin */
function code2uin(code) {
    let left = Math.floor(code / 1000000);
    if (left >= 0 && left <= 10)
        left += 202;
    else if (left >= 11 && left <= 19)
        left += 469;
    else if (left >= 20 && left <= 66)
        left += 2080;
    else if (left >= 67 && left <= 156)
        left += 1943;
    else if (left >= 157 && left <= 209)
        left += 1990;
    else if (left >= 210 && left <= 309)
        left += 3890;
    else if (left >= 310 && left <= 335)
        left += 3490;
    else if (left >= 336 && left <= 386)
        left += 2265;
    else if (left >= 387 && left <= 599)
        left += 3490;
    return left * 1000000 + (code % 1000000);
}
/** uin转群号 */
function uin2code(uin) {
    let left = Math.floor(uin / 1000000);
    if (left >= 202 && left <= 212)
        left -= 202;
    else if (left >= 480 && left <= 488)
        left -= 469;
    else if (left >= 2100 && left <= 2146)
        left -= 2080;
    else if (left >= 2010 && left <= 2099)
        left -= 1943;
    else if (left >= 2147 && left <= 2199)
        left -= 1990;
    else if (left >= 2600 && left <= 2651)
        left -= 2265;
    else if (left >= 3800 && left <= 4099)
        left -= 3490;
    else if (left >= 4100 && left <= 4199)
        left -= 3890;
    return left * 1000000 + (uin % 1000000);
}
/** 解析彩色群名片 */
function parseFunString(buf) {
    if (buf[0] === 0xa) {
        let res = "";
        try {
            let arr = pb.decode(buf)[1];
            if (!Array.isArray(arr))
                arr = [arr];
            for (let v of arr) {
                if (v[2])
                    res += String(v[2]);
            }
        }
        catch { }
        return res;
    }
    else {
        return String(buf);
    }
}
/** xml转义 */
function escapeXml(str) {
    return str.replace(/[&"><]/g, function (s) {
        if (s === "&")
            return "&amp;";
        if (s === "<")
            return "&lt;";
        if (s === ">")
            return "&gt;";
        if (s === '"')
            return "&quot;";
        return "";
    });
}
function log(any) {
    if (any instanceof Buffer)
        any = any.toString("hex").replace(/(.)(.)/g, "$1$2 ");
    console.log(util.inspect(any, {
        depth: 20,
        showHidden: false,
        maxArrayLength: 1000,
        maxStringLength: 20000,
    }));
}
/** 用于下载限量 */
class DownloadTransform extends stream.Transform {
    constructor() {
        super(...arguments);
        this._size = 0;
    }
    _transform(data, encoding, callback) {
        this._size += data.length;
        let error = null;
        if (this._size <= exports.MAX_UPLOAD_SIZE)
            this.push(data);
        else
            error = new Error(`downloading over ${exports.MAX_UPLOAD_SIZE / 1024 / 1024}MB is refused`);
        callback(error);
    }
}
exports.DownloadTransform = DownloadTransform;
exports.PB_CONTENT = pb.encode({ 1: 1, 2: 0, 3: 0 });
exports.IS_WIN = os.platform() === "win32";
/** 系统临时目录，用于临时存放下载的图片等内容 */
exports.TMP_DIR = os.tmpdir();
/** 最大上传和下载大小 */
exports.MAX_UPLOAD_SIZE = 104857600;
/** 可设置的在线状态 */
var OnlineStatus;
(function (OnlineStatus) {
    /** 离线 */
    OnlineStatus[OnlineStatus["Offline"] = 0] = "Offline";
    /** 在线 */
    OnlineStatus[OnlineStatus["Online"] = 11] = "Online";
    /** 离开 */
    OnlineStatus[OnlineStatus["Absent"] = 31] = "Absent";
    /** 隐身 */
    OnlineStatus[OnlineStatus["Invisible"] = 41] = "Invisible";
    /** 忙碌 */
    OnlineStatus[OnlineStatus["Busy"] = 50] = "Busy";
    /** Q我吧 */
    OnlineStatus[OnlineStatus["Qme"] = 60] = "Qme";
    /** 请勿打扰 */
    OnlineStatus[OnlineStatus["DontDisturb"] = 70] = "DontDisturb";
})(OnlineStatus || (exports.OnlineStatus = OnlineStatus = {}));
__exportStar(require("./core/constants"), exports);
