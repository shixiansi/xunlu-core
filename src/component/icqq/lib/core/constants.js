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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.calcBkn = exports.CalculateStreamBytesTransform = exports.Sha1Stream = exports.timestamp = exports.aesGcmDecrypt = exports.aesGcmEncrypt = exports.randomInt = exports.calculateSha1StreamBytes = exports.sha256 = exports.randomString = exports.sha = exports.md5 = exports.pipeline = exports.gzip = exports.unzip = exports.NOOP = exports.BUF16 = exports.BUF4 = exports.BUF0 = void 0;
exports.hrtimeToMs = hrtimeToMs;
exports.formatTime = formatTime;
exports.int32ip2str = int32ip2str;
exports.lock = lock;
exports.unlock = unlock;
exports.hide = hide;
exports.readTlv = readTlv;
exports.calcPoW = calcPoW;
exports.parseTrpcRsp = parseTrpcRsp;
const crypto_1 = require("crypto");
const util_1 = require("util");
const zlib = __importStar(require("zlib"));
const stream = __importStar(require("stream"));
const base_client_1 = require("./base-client");
const stream_1 = require("stream");
const writer_1 = __importDefault(require("./writer"));
const _1 = require(".");
function hrtimeToMs(time) {
    return Math.ceil(time[1] / 1000000) + time[0] * 1000;
}
/** 一个0长buf */
exports.BUF0 = Buffer.alloc(0);
/** 4个0的buf */
exports.BUF4 = Buffer.alloc(4);
/** 16个0的buf */
exports.BUF16 = Buffer.alloc(16);
/** no operation */
const NOOP = () => { };
exports.NOOP = NOOP;
/** promisified unzip */
exports.unzip = (0, util_1.promisify)(zlib.unzip);
/** promisified gzip */
exports.gzip = (0, util_1.promisify)(zlib.gzip);
/** promisified pipeline */
exports.pipeline = (0, util_1.promisify)(stream.pipeline);
/** md5 hash */
const md5 = (data) => (0, crypto_1.createHash)("md5").update(data).digest();
exports.md5 = md5;
/** sha hash */
const sha = (data) => (0, crypto_1.createHash)("sha1").update(data).digest();
exports.sha = sha;
const randomString = (n, template = "abcdef1234567890") => {
    const len = template.length;
    return new Array(n)
        .fill(false)
        .map(() => template.charAt(Math.floor(Math.random() * len)))
        .join("");
};
exports.randomString = randomString;
/** sha256 hash */
const sha256 = (data) => (0, crypto_1.createHash)('sha256').update(data).digest();
exports.sha256 = sha256;
const calculateSha1StreamBytes = (readable) => {
    return new Promise((resolve, reject) => {
        const calculateStreamBytes = new CalculateStreamBytesTransform();
        const byteArrayList = [];
        calculateStreamBytes.on('data', (chunk) => {
            byteArrayList.push(chunk);
        });
        calculateStreamBytes.on('end', () => {
            resolve(byteArrayList);
        });
        calculateStreamBytes.on('error', (err) => {
            reject(err);
        });
        readable.pipe(calculateStreamBytes);
    });
};
exports.calculateSha1StreamBytes = calculateSha1StreamBytes;
const randomInt = (min = 0, max = 1) => {
    return Math.floor(Math.random() * (max - min + 1) + min);
};
exports.randomInt = randomInt;
const aesGcmEncrypt = (data, key) => {
    const iv = (0, crypto_1.randomBytes)(12);
    const cipher = (0, crypto_1.createCipheriv)('aes-256-gcm', key, iv);
    const encrypted = cipher.update(data);
    const final = cipher.final();
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, encrypted, final, tag]);
};
exports.aesGcmEncrypt = aesGcmEncrypt;
const aesGcmDecrypt = (data, key) => {
    const iv = data.slice(0, 12);
    const tag = data.slice(-16);
    const cipher = data.slice(12, data.length - 16);
    const decipher = (0, crypto_1.createDecipheriv)('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plain = decipher.update(cipher);
    const final = decipher.final();
    return Buffer.concat([plain, final]);
};
exports.aesGcmDecrypt = aesGcmDecrypt;
function formatTime(value, template = "yyyy-MM-dd HH:mm:ss") {
    const date = new Date();
    const o = {
        "M+": date.getMonth() + 1, //月份
        "d+": date.getDate(), //日
        "H+": date.getHours(), //小时
        "m+": date.getMinutes(), //分
        "s+": date.getSeconds(), //秒
        "q+": Math.floor((date.getMonth() + 3) / 3), //季度
        "S": date.getMilliseconds(), //毫秒
    };
    if (/(y+)/.test(template))
        template = template.replace(/(y+)/, sub => (date.getFullYear() + "").slice(0, sub.length));
    for (let k in o) {
        const reg = new RegExp("(" + k + ")");
        if (reg.test(template)) {
            template = template.replace(reg, v => `${o[k]}`.padStart(v.length, ""));
        }
    }
    return template;
}
/** unix timestamp (second) */
const timestamp = () => Math.floor(Date.now() / 1000);
exports.timestamp = timestamp;
/** 数字ip转通用ip */
function int32ip2str(ip) {
    if (typeof ip === "string")
        return ip;
    ip = ip & 0xffffffff;
    return [
        ip & 0xff,
        (ip & 0xff00) >> 8,
        (ip & 0xff0000) >> 16,
        ((ip & 0xff000000) >> 24) & 0xff,
    ].join(".");
}
/** 隐藏并锁定一个属性 */
function lock(obj, prop) {
    Reflect.defineProperty(obj, prop, {
        configurable: false,
        enumerable: false,
        writable: false,
    });
}
function unlock(obj, prop) {
    Reflect.defineProperty(obj, prop, {
        configurable: false,
        enumerable: false,
        writable: true,
    });
}
/** 隐藏一个属性 */
function hide(obj, prop) {
    Reflect.defineProperty(obj, prop, {
        configurable: false,
        enumerable: false,
        writable: true,
    });
}
function readTlv(r) {
    const t = {};
    while (r.readableLength > 2) {
        const k = r.read(2).readUInt16BE();
        t[k] = r.read(r.read(2).readUInt16BE());
    }
    return t;
}
function calcPoW(data) {
    if (!data || data.length === 0)
        return Buffer.alloc(0);
    const stream = stream_1.Readable.from(data, { objectMode: false });
    const version = stream.read(1).readUInt8();
    const typ = stream.read(1).readUInt8();
    const hashType = stream.read(1).readUInt8();
    let ok = stream.read(1).readUInt8() === 0;
    const maxIndex = stream.read(2).readUInt16BE();
    const reserveBytes = stream.read(2);
    const src = stream.read(stream.read(2).readUInt16BE());
    const tgt = stream.read(stream.read(2).readUInt16BE());
    const cpy = stream.read(stream.read(2).readUInt16BE());
    if (hashType !== 1) {
        this.emit("internal.verbose", `Unsupported tlv546 hash type ${hashType}`, base_client_1.VerboseLevel.Warn);
        return Buffer.alloc(0);
    }
    let inputNum = BigInt("0x" + src.toString("hex"));
    switch (typ) {
        case 1:
            // TODO
            // See https://github.com/mamoe/mirai/blob/cc7f35519ea7cc03518a57dc2ee90d024f63be0e/mirai-core/src/commonMain/kotlin/network/protocol/packet/login/wtlogin/WtLoginExt.kt#L207
            this.emit("internal.verbose", `Unsupported tlv546 algorithm type ${typ}`, base_client_1.VerboseLevel.Warn);
            break;
        case 2:
            // Calc SHA256
            let dst;
            let elp = 0, cnt = 0;
            if (tgt.length === 32) {
                const start = Date.now();
                let hash = (0, crypto_1.createHash)("sha256")
                    .update(Buffer.from(inputNum.toString(16).padStart(256, "0"), "hex"))
                    .digest();
                while (Buffer.compare(hash, tgt) !== 0) {
                    inputNum++;
                    hash = (0, crypto_1.createHash)("sha256")
                        .update(Buffer.from(inputNum.toString(16).padStart(256, "0"), "hex"))
                        .digest();
                    cnt++;
                    if (cnt > 6000000) {
                        this.emit("internal.verbose", "Calculating PoW cost too much time, maybe something wrong", base_client_1.VerboseLevel.Error);
                        throw new Error("Calculating PoW cost too much time, maybe something wrong");
                    }
                }
                ok = true;
                dst = Buffer.from(inputNum.toString(16).padStart(256, "0"), "hex");
                elp = Date.now() - start;
                this.emit("internal.verbose", `Calculating PoW of plus ${cnt} times cost ${elp} ms`, base_client_1.VerboseLevel.Debug);
            }
            if (!ok)
                return Buffer.alloc(0);
            const body = new writer_1.default()
                .writeU8(version)
                .writeU8(typ)
                .writeU8(hashType)
                .writeU8(ok ? 1 : 0)
                .writeU16(maxIndex)
                .writeBytes(reserveBytes)
                .writeTlv(src)
                .writeTlv(tgt)
                .writeTlv(cpy);
            if (dst)
                body.writeTlv(dst);
            body.writeU32(elp).writeU32(cnt);
            return body.read();
        default:
            this.emit("internal.verbose", `Unsupported tlv546 algorithm type ${typ}`, base_client_1.VerboseLevel.Warn);
            break;
    }
    return Buffer.alloc(0);
}
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck 
class Sha1Stream {
    constructor() {
        this.Sha1BlockSize = 64;
        this.Sha1DigestSize = 20;
        this._padding = Buffer.concat([Buffer.from([0x80]), Buffer.alloc(63)]);
        this._state = new Uint32Array(5);
        this._count = new Uint32Array(2);
        this._buffer = Buffer.allocUnsafe(this.Sha1BlockSize);
        this._w = new Uint32Array(80);
        this.reset();
    }
    reset() {
        this._state[0] = 0x67452301;
        this._state[1] = 0xEFCDAB89;
        this._state[2] = 0x98BADCFE;
        this._state[3] = 0x10325476;
        this._state[4] = 0xC3D2E1F0;
        this._count[0] = 0;
        this._count[1] = 0;
        this._buffer.fill(0);
    }
    rotateLeft(v, o) {
        return ((v << o) | (v >>> (32 - o))) >>> 0;
    }
    transform(chunk, offset) {
        const w = this._w;
        const view = new DataView(chunk.buffer, chunk.byteOffset + offset, 64);
        for (let i = 0; i < 16; i++) {
            w[i] = view.getUint32(i * 4, false);
        }
        for (let i = 16; i < 80; i++) {
            w[i] = this.rotateLeft(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1) >>> 0;
        }
        let a = this._state[0];
        let b = this._state[1];
        let c = this._state[2];
        let d = this._state[3];
        let e = this._state[4];
        for (let i = 0; i < 80; i++) {
            let temp;
            if (i < 20) {
                temp = ((b & c) | (~b & d)) + 0x5A827999;
            }
            else if (i < 40) {
                temp = (b ^ c ^ d) + 0x6ED9EBA1;
            }
            else if (i < 60) {
                temp = ((b & c) | (b & d) | (c & d)) + 0x8F1BBCDC;
            }
            else {
                temp = (b ^ c ^ d) + 0xCA62C1D6;
            }
            temp += ((this.rotateLeft(a, 5) + e + w[i]) >>> 0);
            e = d;
            d = c;
            c = this.rotateLeft(b, 30) >>> 0;
            b = a;
            a = temp;
        }
        this._state[0] = (this._state[0] + a) >>> 0;
        this._state[1] = (this._state[1] + b) >>> 0;
        this._state[2] = (this._state[2] + c) >>> 0;
        this._state[3] = (this._state[3] + d) >>> 0;
        this._state[4] = (this._state[4] + e) >>> 0;
    }
    update(data, len) {
        let index = ((this._count[0] >>> 3) & 0x3F) >>> 0;
        const dataLen = len ?? data.length;
        this._count[0] = (this._count[0] + (dataLen << 3)) >>> 0;
        if (this._count[0] < (dataLen << 3))
            this._count[1] = (this._count[1] + 1) >>> 0;
        this._count[1] = (this._count[1] + (dataLen >>> 29)) >>> 0;
        const partLen = (this.Sha1BlockSize - index) >>> 0;
        let i = 0;
        if (dataLen >= partLen) {
            data.copy(this._buffer, index, 0, partLen);
            this.transform(this._buffer, 0);
            for (i = partLen; (i + this.Sha1BlockSize) <= dataLen; i = (i + this.Sha1BlockSize) >>> 0) {
                this.transform(data, i);
            }
            index = 0;
        }
        data.copy(this._buffer, index, i, dataLen);
    }
    hash(bigEndian = true) {
        const digest = Buffer.allocUnsafe(this.Sha1DigestSize);
        if (bigEndian) {
            for (let i = 0; i < 5; i++)
                digest.writeUInt32BE(this._state[i], i * 4);
        }
        else {
            for (let i = 0; i < 5; i++)
                digest.writeUInt32LE(this._state[i], i * 4);
        }
        return digest;
    }
    final() {
        const digest = Buffer.allocUnsafe(this.Sha1DigestSize);
        const bits = Buffer.allocUnsafe(8);
        bits.writeUInt32BE(this._count[1], 0);
        bits.writeUInt32BE(this._count[0], 4);
        const index = ((this._count[0] >>> 3) & 0x3F) >>> 0;
        const padLen = ((index < 56) ? (56 - index) : (120 - index)) >>> 0;
        this.update(this._padding, padLen);
        this.update(bits);
        for (let i = 0; i < 5; i++) {
            digest.writeUInt32BE(this._state[i], i * 4);
        }
        return digest;
    }
}
exports.Sha1Stream = Sha1Stream;
class CalculateStreamBytesTransform extends stream.Transform {
    constructor() {
        super();
        this.blockSize = 1024 * 1024;
        this.sha1 = new Sha1Stream();
        this.buffer = Buffer.alloc(0);
        this.bytesRead = 0;
        this.byteArrayList = [];
    }
    // eslint-disable-next-line no-undef
    _transform(chunk, _, callback) {
        try {
            this.buffer = Buffer.concat([this.buffer, chunk]);
            let offset = 0;
            while (this.buffer.length - offset >= this.sha1.Sha1BlockSize) {
                const block = this.buffer.subarray(offset, offset + this.sha1.Sha1BlockSize);
                this.sha1.update(block);
                offset += this.sha1.Sha1BlockSize;
                this.bytesRead += this.sha1.Sha1BlockSize;
                if (this.bytesRead % this.blockSize === 0) {
                    const digest = this.sha1.hash(false);
                    this.byteArrayList.push(Buffer.from(digest));
                }
            }
            this.buffer = this.buffer.subarray(offset);
            callback(null);
        }
        catch (err) {
            callback(err);
        }
    }
    _flush(callback) {
        try {
            if (this.buffer.length > 0)
                this.sha1.update(this.buffer);
            const finalDigest = this.sha1.final();
            this.byteArrayList.push(Buffer.from(finalDigest));
            for (const digest of this.byteArrayList) {
                this.push(digest);
            }
            callback(null);
        }
        catch (err) {
            callback(err);
        }
    }
}
exports.CalculateStreamBytesTransform = CalculateStreamBytesTransform;
function parseTrpcRsp(reserve) {
    const rsp = _1.pb.decode(reserve || exports.BUF0)?.[22];
    if (!rsp)
        return null;
    return { ret: rsp[1], func_ret: rsp[2], error_msg: String(rsp[3]) };
}
const calcBkn = (skey) => {
    skey = Buffer.from(skey);
    let bkn = 5381;
    for (let v of skey)
        bkn = bkn + (bkn << 5) + v;
    bkn &= 2147483647;
    return bkn;
};
exports.calcBkn = calcBkn;
