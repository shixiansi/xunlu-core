import { createHash, randomBytes, createCipheriv, createDecipheriv } from "crypto";
import { promisify } from "util";
import * as zlib from "zlib";
import * as stream from "stream";
import { VerboseLevel } from "./base-client.mjs";
import { Readable } from "stream";
import Writer from "./writer.mjs";
import { pb } from "./index.mjs";
export function hrtimeToMs(time) {
    return Math.ceil(time[1] / 1000000) + time[0] * 1000;
}
/** 一个0长buf */
export const BUF0 = Buffer.alloc(0);
/** 4个0的buf */
export const BUF4 = Buffer.alloc(4);
/** 16个0的buf */
export const BUF16 = Buffer.alloc(16);
/** no operation */
export const NOOP = () => { };
/** promisified unzip */
export const unzip = promisify(zlib.unzip);
/** promisified gzip */
export const gzip = promisify(zlib.gzip);
/** promisified pipeline */
export const pipeline = promisify(stream.pipeline);
/** md5 hash */
export const md5 = (data) => createHash("md5").update(data).digest();
/** sha hash */
export const sha = (data) => createHash("sha1").update(data).digest();
export const randomString = (n, template = "abcdef1234567890") => {
    const len = template.length;
    return new Array(n)
        .fill(false)
        .map(() => template.charAt(Math.floor(Math.random() * len)))
        .join("");
};
/** sha256 hash */
export const sha256 = (data) => createHash('sha256').update(data).digest();
export const calculateSha1StreamBytes = (readable) => {
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
export const randomInt = (min = 0, max = 1) => {
    return Math.floor(Math.random() * (max - min + 1) + min);
};
export const aesGcmEncrypt = (data, key) => {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = cipher.update(data);
    const final = cipher.final();
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, encrypted, final, tag]);
};
export const aesGcmDecrypt = (data, key) => {
    const iv = data.slice(0, 12);
    const tag = data.slice(-16);
    const cipher = data.slice(12, data.length - 16);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plain = decipher.update(cipher);
    const final = decipher.final();
    return Buffer.concat([plain, final]);
};
export function formatTime(value, template = "yyyy-MM-dd HH:mm:ss") {
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
export const timestamp = () => Math.floor(Date.now() / 1000);
/** 数字ip转通用ip */
export function int32ip2str(ip) {
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
export function lock(obj, prop) {
    Reflect.defineProperty(obj, prop, {
        configurable: false,
        enumerable: false,
        writable: false,
    });
}
export function unlock(obj, prop) {
    Reflect.defineProperty(obj, prop, {
        configurable: false,
        enumerable: false,
        writable: true,
    });
}
/** 隐藏一个属性 */
export function hide(obj, prop) {
    Reflect.defineProperty(obj, prop, {
        configurable: false,
        enumerable: false,
        writable: true,
    });
}
export function readTlv(r) {
    const t = {};
    while (r.readableLength > 2) {
        const k = r.read(2).readUInt16BE();
        t[k] = r.read(r.read(2).readUInt16BE());
    }
    return t;
}
export function calcPoW(data) {
    if (!data || data.length === 0)
        return Buffer.alloc(0);
    const stream = Readable.from(data, { objectMode: false });
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
        this.emit("internal.verbose", `Unsupported tlv546 hash type ${hashType}`, VerboseLevel.Warn);
        return Buffer.alloc(0);
    }
    let inputNum = BigInt("0x" + src.toString("hex"));
    switch (typ) {
        case 1:
            // TODO
            // See https://github.com/mamoe/mirai/blob/cc7f35519ea7cc03518a57dc2ee90d024f63be0e/mirai-core/src/commonMain/kotlin/network/protocol/packet/login/wtlogin/WtLoginExt.kt#L207
            this.emit("internal.verbose", `Unsupported tlv546 algorithm type ${typ}`, VerboseLevel.Warn);
            break;
        case 2:
            // Calc SHA256
            let dst;
            let elp = 0, cnt = 0;
            if (tgt.length === 32) {
                const start = Date.now();
                let hash = createHash("sha256")
                    .update(Buffer.from(inputNum.toString(16).padStart(256, "0"), "hex"))
                    .digest();
                while (Buffer.compare(hash, tgt) !== 0) {
                    inputNum++;
                    hash = createHash("sha256")
                        .update(Buffer.from(inputNum.toString(16).padStart(256, "0"), "hex"))
                        .digest();
                    cnt++;
                    if (cnt > 6000000) {
                        this.emit("internal.verbose", "Calculating PoW cost too much time, maybe something wrong", VerboseLevel.Error);
                        throw new Error("Calculating PoW cost too much time, maybe something wrong");
                    }
                }
                ok = true;
                dst = Buffer.from(inputNum.toString(16).padStart(256, "0"), "hex");
                elp = Date.now() - start;
                this.emit("internal.verbose", `Calculating PoW of plus ${cnt} times cost ${elp} ms`, VerboseLevel.Debug);
            }
            if (!ok)
                return Buffer.alloc(0);
            const body = new Writer()
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
            this.emit("internal.verbose", `Unsupported tlv546 algorithm type ${typ}`, VerboseLevel.Warn);
            break;
    }
    return Buffer.alloc(0);
}
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck 
export class Sha1Stream {
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
export class CalculateStreamBytesTransform extends stream.Transform {
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
export function parseTrpcRsp(reserve) {
    const rsp = pb.decode(reserve || BUF0)?.[22];
    if (!rsp)
        return null;
    return { ret: rsp[1], func_ret: rsp[2], error_msg: String(rsp[3]) };
}
export const calcBkn = (skey) => {
    skey = Buffer.from(skey);
    let bkn = 5381;
    for (let v of skey)
        bkn = bkn + (bkn << 5) + v;
    bkn &= 2147483647;
    return bkn;
};
