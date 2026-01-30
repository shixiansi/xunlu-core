import { Readable } from "stream";
import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import probe from "probe-image-size";
import axios from "axios";
import { md5, md5Stream, sha, shaStream, pipeline, uuid, NOOP, TMP_DIR, IS_WIN, MAX_UPLOAD_SIZE, DownloadTransform, BUF0, int32ip2str, } from "../common.mjs";
import { CmdID } from "../internal/index.mjs";
import { pb, constants } from "../core/index.mjs";
const TYPE = {
    jpg: 1000,
    png: 1001,
    webp: 1002,
    bmp: 1005,
    gif: 2000,
    face: 4,
};
const EXT = {
    3: "png",
    4: "face",
    1000: "jpg",
    1001: "png",
    1002: "webp",
    1003: "jpg",
    1005: "bmp",
    2000: "gif",
    2001: "png",
};
/** 构造图片file */
export function buildImageFileParam(md5, sha1, size, width, height, type) {
    sha1 = sha1?.length ? `_${sha1}` : "";
    size = size ?? 0;
    width = width ?? 0;
    height = height ?? 0;
    const ext = EXT[type] || "jpg";
    return md5 + sha1 + size + "-" + width + "-" + height + "." + ext;
}
/** 从图片的file中解析出图片属性参数 */
export function parseImageFileParam(file) {
    let md5, sha1, size, width, height, ext;
    let sp = file.split("-");
    md5 = sp[0].slice(0, 32);
    sha1 = (sp[0].length > 32 && sp[0].slice(32, 33) === '_') ? sp[0].slice(33, 73) : "";
    size = Number(sp[0].slice(32)) || 0;
    width = Number(sp[1]) || 0;
    height = parseInt(sp[2]) || 0;
    sp = file.split(".");
    ext = sp[1] || "jpg";
    return { md5, sha1, size, width, height, ext };
}
export class Image {
    set proto(proto) {
        this.setProto(proto);
    }
    get proto() {
        return this._proto;
    }
    get uploadInfo() {
        return this._uploadInfo;
    }
    /** 从服务端拿到fid后必须设置此值，否则图裂 */
    set fid(val) {
        this._fid = val;
        this.setProto();
    }
    get fid() {
        return this._fid;
    }
    /**
     * @param elem
     * @param cachedir
     @param dm 是否私聊图片 */
    constructor(client, elem, dm = false, cachedir) {
        this.dm = dm;
        this.cachedir = cachedir;
        /** 最终用于发送的对象 */
        this._proto = {};
        /** 图片属性 */
        this.elem_type = "image";
        this.md5 = randomBytes(16);
        this.sha1 = randomBytes(0);
        this.sha1Stream = [];
        this.size = 0xffff;
        this.width = 320;
        this.height = 240;
        this.type = 1000;
        this.nt = false;
        this.uploaded = false;
        this.client = client;
        this.nt = this.client.useQQNT;
        let { type, file, cache, timeout, headers, asface, origin, summary, fid, width, height, nt = this.nt } = elem;
        this.elem_type = type;
        this.origin = origin;
        this.asface = asface;
        this.summary = summary;
        /** 尝试从elem中获取宽高 */
        this.width = width;
        this.height = height;
        this.nt = nt;
        if (!nt && fid)
            this._fid = typeof fid === "number" ? fid : Buffer.from(fid, "hex");
        if (nt && typeof (fid) === "string")
            this.fileid = fid;
        if (file instanceof Buffer) {
            this.task = this.fromProbeSync(file);
        }
        else if (file instanceof Readable) {
            this.task = this.fromReadable(file);
        }
        else if (typeof file !== "string") {
            throw new Error("bad file param: " + file);
        }
        else if (file.startsWith("base64://")) {
            this.task = this.fromProbeSync(Buffer.from(file.slice(9), "base64"));
        }
        else if (file.startsWith("http://") || file.startsWith("https://")) {
            this.task = this.fromWeb(file, cache, headers, timeout);
        }
        else {
            this.task = this.fromLocal(file);
        }
    }
    setUrl(url) {
        return this.task = this.fromWeb(url);
    }
    get name() {
        return `${this.md5.toString("hex")}.${EXT[this.type] || "jpg"}`;
    }
    setProperties(dimensions) {
        if (!dimensions)
            throw new Error("bad image file");
        this.type = TYPE[dimensions.type] || 1000;
        this.width = dimensions.width;
        this.height = dimensions.height;
    }
    parseFileParam(file) {
        const { md5, sha1, size, width, height, ext } = parseImageFileParam(file);
        const hash = Buffer.from(md5, "hex");
        if (hash.length !== 16)
            throw new Error("bad file param: " + file);
        this.md5 = hash;
        this.sha1 = sha1.length ? Buffer.from(sha1, "hex") : BUF0;
        if (!this.sha1.length)
            this.nt = false;
        this.size = size > 0 ? size : this.size;
        /** 优先使用elem中的宽高 */
        this.width = this.width || width;
        this.height = this.height || height;
        TYPE[ext] & (this.type = TYPE[ext]);
    }
    async fromProbeSync(buf) {
        const dimensions = probe.sync(buf);
        this.setProperties(dimensions);
        this.md5 = md5(buf);
        this.sha1 = sha(buf);
        this.sha1Stream = this.nt ? await constants.calculateSha1StreamBytes(Readable.from(buf, { objectMode: false, highWaterMark: 1024 * 256 })) : [];
        this.size = buf.length;
        this.readable = Readable.from(buf, { objectMode: false, highWaterMark: 1024 * 256 });
    }
    async fromReadable(readable, timeout) {
        try {
            readable = readable.pipe(new DownloadTransform());
            timeout = timeout > 0 ? timeout : 60;
            this.tmpfile = path.join(TMP_DIR, uuid());
            var id = setTimeout(() => {
                readable.destroy();
            }, timeout * 1000);
            const [dimensions, md5, sha1] = await Promise.all([
                // @ts-ignore
                probe(readable, true),
                md5Stream(readable),
                shaStream(readable),
                pipeline(readable, fs.createWriteStream(this.tmpfile)),
            ]);
            this.setProperties(dimensions);
            this.md5 = md5;
            this.sha1 = sha1;
            this.sha1Stream = this.nt ? await constants.calculateSha1StreamBytes(fs.createReadStream(this.tmpfile, { highWaterMark: 1024 * 256 })) : [];
            this.size = (await fs.promises.stat(this.tmpfile)).size;
            this.readable = fs.createReadStream(this.tmpfile, { highWaterMark: 1024 * 256 });
        }
        catch (e) {
            this.deleteTmpFile();
            throw e;
        }
        finally {
            clearTimeout(id);
        }
    }
    fromWeb(url, cache, headers, timeout) {
        if (this.cachedir) {
            this.cachefile = path.join(this.cachedir, md5(url).toString("hex"));
            if (cache) {
                try {
                    this.parseFileParam(fs.readFileSync(this.cachefile, "utf8"));
                    return new Promise(resolve => resolve());
                }
                catch { }
            }
        }
        return new Promise(async (resolve) => {
            const readable = (await axios.get(url, {
                headers,
                responseType: "stream",
            })).data;
            await this.fromReadable(readable, timeout);
            this.cachefile &&
                fs.writeFile(this.cachefile, buildImageFileParam(this.md5.toString("hex"), this.nt ? this.sha1.toString("hex") : "", this.size, this.width, this.height, this.type), NOOP);
            resolve();
        });
    }
    fromLocal(file) {
        try {
            //收到的图片
            this.parseFileParam(file);
            return new Promise(resolve => resolve());
        }
        catch {
            return new Promise(async (resolve) => {
                //本地图片
                file.startsWith("file://") && (file = file.slice(7).replace(/%20/g, " "));
                IS_WIN && file.startsWith("/") && (file = file.slice(1));
                const stat = await fs.promises.stat(file);
                if (stat.size <= 0 || stat.size > MAX_UPLOAD_SIZE)
                    throw new Error("bad file size: " + stat.size);
                const readable = fs.createReadStream(file, { highWaterMark: 1024 * 256 });
                const [dimensions, md5, sha1] = await Promise.all([
                    // @ts-ignore
                    probe(readable, true),
                    md5Stream(readable),
                    shaStream(readable)
                ]);
                readable.destroy();
                this.setProperties(dimensions);
                this.md5 = md5;
                this.sha1 = sha1;
                this.sha1Stream = this.nt ? await constants.calculateSha1StreamBytes(fs.createReadStream(file, { highWaterMark: 1024 * 256 })) : [];
                this.size = stat.size;
                this.readable = fs.createReadStream(file, { highWaterMark: 1024 * 256 });
                resolve();
            });
        }
    }
    setUploadResp(resp) {
        let retcode = 0, message, ip, port, ukey, cmdid, ticket, ext;
        if (this.nt) {
            cmdid = this.dm ? CmdID.NTDmImage : CmdID.NTGroupImage;
            resp = resp[2];
            this.proto = resp[6];
            const msgInfos = Array.isArray(resp[6][1]) ? resp[6][1] : [resp[6][1]];
            const msgInfo = msgInfos.find(msgInfo => String(msgInfo[1][1][3]).toLowerCase() === this.sha1.toString("hex").toLowerCase());
            if (!resp[1] || !msgInfo) {
                this.uploaded = true;
            }
            else {
                ukey = resp[1];
                const ipv4s = Array.isArray(resp[3]) ? resp[3] : [resp[3]];
                ext = {
                    1: msgInfo[1][2].toString(),
                    2: ukey.toString(),
                    5: {
                        1: ipv4s.map((val) => {
                            return {
                                1: {
                                    1: 1,
                                    2: int32ip2str(val[1])
                                },
                                2: val[2]
                            };
                        })
                    },
                    6: msgInfo,
                    10: 1024 * 1024,
                    11: {
                        1: this.sha1Stream
                    }
                };
            }
        }
        else {
            cmdid = this.dm ? CmdID.DmImage : CmdID.GroupImage;
            const j = this.dm ? 1 : 0;
            retcode = resp[2 + j];
            message = String(resp[3 + j]);
            if (retcode === 0) {
                this.fid = resp[9 + j].toBuffer?.() || resp[9 + j];
                if (resp[4 + j]) {
                    this.uploaded = true;
                }
                else {
                    ip = resp[6 + j]?.[0] || resp[6 + j];
                    port = resp[7 + j]?.[0] || resp[7 + j];
                    ticket = resp[8 + j].toBuffer();
                }
            }
        }
        this._uploadInfo = {
            retcode,
            message,
            ip,
            port,
            ukey,
            cmdid,
            ticket,
            ...(ext ? { ext: pb.encode(ext) } : {})
        };
        return this;
    }
    setProto(proto) {
        if (this.nt && proto && this.elem_type === "image") {
            Object.assign(this._proto, {
                1: 48,
                2: {
                    1: proto[1],
                    2: proto[2] || {
                        1: {
                            1: this.asface ? 1 : 0,
                            2: this.summary,
                            [this.dm ? 11 : 12]: {
                            //30: rkey
                            }
                        },
                        1001: this.dm ? 1 : 2,
                        1002: this.dm ? 1 : 2,
                        1003: this._fid
                    }
                },
                3: this.dm ? 10 : 20,
            });
        }
        else {
            if (this.dm) {
                proto = proto || {
                    1: this.md5.toString("hex"),
                    2: this.size,
                    3: this._fid,
                    5: this.type,
                    7: this.md5,
                    8: this.height,
                    9: this.width,
                    10: this._fid,
                    13: this.origin ? 1 : 0,
                    16: this.type === 4 ? 5 : 0,
                    24: 0,
                    25: 0,
                    29: {
                        1: this.asface ? 1 : 0,
                    },
                };
            }
            else {
                proto = proto || {
                    2: this.md5.toString("hex") + (this.asface ? ".gif" : ".jpg"),
                    7: this._fid,
                    8: 0,
                    9: 0,
                    10: this.type,
                    13: this.md5,
                    20: this.type,
                    22: this.width,
                    23: this.height,
                    25: this.size,
                    26: this.origin ? 1 : 0,
                    29: 0,
                    30: 0,
                    34: {
                        1: this.asface ? 1 : 0,
                    },
                };
            }
            if (this.summary)
                proto[this.dm ? 29 : 34][this.dm ? 8 : 9] = this.summary;
            Object.assign(this._proto, this.elem_type === "flash" ? {
                1: 3,
                2: this.dm ? { 2: proto } : { 1: proto },
                3: 0
            } : (this.dm ? { 4: proto } : { 8: proto }));
        }
    }
    /** 服务端图片失效时建议调用此函数 */
    deleteCacheFile() {
        this.cachefile && fs.unlink(this.cachefile, NOOP);
    }
    /** 图片上传完成后建议调用此函数(文件存在系统临时目录中) */
    deleteTmpFile() {
        this.tmpfile && fs.unlink(this.tmpfile, NOOP);
        this.readable?.destroy();
    }
}
