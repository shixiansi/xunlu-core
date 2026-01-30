import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { randomBytes } from "crypto";
import { CmdID, downloadFileToTmpDir, read7Bytes, saveFileToTmpDir } from "../internal/index.mjs";
import { exec } from "child_process";
import { ApiRejection, ErrorCode } from "../index.mjs";
import { encode as silkEncode, getDuration as silkGetDuration, } from "../core/silk.mjs";
import { TMP_DIR, uuid, md5Stream, shaStream, IS_WIN, NOOP, int32ip2str } from "../common.mjs";
import { pb, constants } from "../core/index.mjs";
export class Ptt {
    set proto(proto) {
        this.setProto(proto);
    }
    get proto() {
        return this._proto;
    }
    get uploadInfo() {
        return this._uploadInfo;
    }
    set fid(val) {
        this._fid = val;
        this.setProto();
    }
    get fid() {
        return this._fid;
    }
    get name() {
        return `${this.md5.toString("hex")}.${(this.codec === 1 ? "slk" : "amr")}`;
    }
    /**
     * @param elem
     * @param cachedir
     @param dm 是否私聊 */
    constructor(client, elem, dm = false) {
        this.dm = dm;
        /** 最终用于发送的对象 */
        this._proto = {};
        /** 语音属性 */
        this.elem_type = "record";
        this.file = "";
        this.md5 = randomBytes(16);
        this.sha1 = randomBytes(0);
        this.sha1Stream = [];
        this.size = 0;
        this.brief = "";
        this.head = randomBytes(0);
        this.codec = 0;
        this.transcode = true;
        this.nt = false;
        this.uploaded = false;
        this.temp = false;
        this.client = client;
        this.nt = this.client.useQQNT;
        const { file, brief = "", seconds, transcode = true, temp = false, nt = this.nt } = elem;
        this.brief = brief;
        this.seconds = seconds;
        this.transcode = transcode;
        this.temp = temp;
        this.nt = nt;
        if (file instanceof Buffer) {
            this.temp = true;
            this.task = saveFileToTmpDir(file).catch(e => { throw e; }).then(f => this.fromLocal(f));
        }
        else if (file.startsWith("base64://")) {
            this.temp = true;
            this.task = saveFileToTmpDir(file).catch(e => { throw e; }).then(f => this.fromLocal(f));
        }
        else if (file.startsWith("http")) {
            this.temp = true;
            this.task = downloadFileToTmpDir(file).catch(e => { throw e; }).then(f => this.fromLocal(f));
        }
        else {
            this.task = this.fromLocal(file);
        }
    }
    async fromLocal(file) {
        const readFile = async (file) => {
            this.head = await read7Bytes(file);
            if (!this.seconds && this.head.includes("SILK")) {
                await silkGetDuration(file).catch(e => 0).then(seconds => {
                    this.seconds = Math.ceil((seconds || 0) / 1000);
                });
            }
            const stream = fs.createReadStream(file, { highWaterMark: 1024 * 256 });
            const [md5, sha1] = await Promise.all([
                md5Stream(stream),
                shaStream(stream)
            ]);
            this.md5 = md5;
            this.sha1 = sha1;
            this.sha1Stream = this.nt ? await constants.calculateSha1StreamBytes(fs.createReadStream(file, { highWaterMark: 1024 * 256 })) : [];
            this.size = fs.statSync(file).size;
            this.readable = fs.createReadStream(file, { highWaterMark: 1024 * 256 });
        };
        file = String(file).replace(/^file:\/{2}/, "");
        IS_WIN && file.startsWith("/") && (file = file.slice(1));
        this.file = file;
        if (this.head.includes("SILK")) {
            await readFile(file);
        }
        else {
            const { data: buf, duration } = await audioTrans(file, this.transcode, 1024 * 1024 * (this.nt ? 30 : 10), this.client.config.ffmpeg_path || "ffmpeg");
            this.seconds = duration;
            if (buf.length) {
                this.head = await read7Bytes(buf);
                const stream = Readable.from(buf, { objectMode: false, highWaterMark: 1024 * 256 });
                const [md5, sha1] = await Promise.all([
                    md5Stream(stream),
                    shaStream(stream)
                ]);
                this.md5 = md5;
                this.sha1 = sha1;
                this.sha1Stream = this.nt ? await constants.calculateSha1StreamBytes(Readable.from(buf, { objectMode: false, highWaterMark: 1024 * 256 })) : [];
                this.size = buf.length;
                this.readable = Readable.from(buf, { objectMode: false, highWaterMark: 1024 * 256 });
            }
            else {
                await readFile(file);
            }
        }
        this.codec = this.head.includes("AMR") ? 0 : 1;
    }
    setUploadResp(resp) {
        let retcode = 0, message, ip, port, ukey, cmdid, ticket, ext;
        if (this.nt) {
            cmdid = this.dm ? CmdID.NTDmPtt : CmdID.NTGroupPtt;
            resp = resp[2];
            this.proto = resp[6];
            const msgInfos = Array.isArray(resp[6][1]) ? resp[6][1] : [resp[6][1]];
            const msgInfo = msgInfos.find(msgInfo => String(msgInfo[1][1][3]).toLowerCase() === this.sha1.toString("hex").toLowerCase());
            if (!resp[1] || !msgInfo) {
                this.uploaded = true;
            }
            else {
                ukey = resp[1].toString();
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
            cmdid = this.dm ? CmdID.DmImage : CmdID.GroupPtt;
            retcode = resp[2];
            message = String(resp[3]);
            if (retcode === 0) {
                //ukey = resp[7].toBuffer();
                this.fid = resp[11].toBuffer();
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
        if (this.nt && proto) {
            Object.assign(this._proto, {
                1: 48,
                2: proto,
                3: this.dm ? 12 : 22,
            });
        }
        else {
            Object.assign(this._proto, {
                1: 4,
                2: this.client.uin,
                3: this._fid,
                4: this.md5,
                5: this.md5.toString("hex") + ".amr",
                6: this.size,
                8: 0,
                11: 1,
                18: this._fid,
                19: this.seconds ?? undefined,
                29: this.codec,
                30: {
                    1: 0,
                    5: 0,
                    6: "",
                    7: 0,
                    8: this.brief,
                },
            });
        }
    }
    deleteTmpFile() {
        this?.file && fs.unlink(this?.file, NOOP);
        this.readable?.destroy();
    }
}
function audioTransSlik(file, ffmpeg = "ffmpeg") {
    return new Promise((resolve, reject) => {
        const tmpfile = path.join(TMP_DIR, uuid());
        exec(`${ffmpeg} -y -i "${file}" -f s16le -ar 16000 -ac 1 -fs 31457280 "${tmpfile}"`, async (error, stdout, stderr) => {
            try {
                const pcm = await fs.promises.readFile(tmpfile);
                try {
                    const slik = (await silkEncode(pcm, 16000));
                    resolve({ data: Buffer.from(slik.data), duration: Math.ceil((slik.duration || 0) / 1000) });
                }
                catch {
                    reject(new ApiRejection(ErrorCode.FFmpegPttTransError, "音频转码到silk失败"));
                }
            }
            catch {
                reject(new ApiRejection(ErrorCode.FFmpegPttTransError, "音频转码到pcm失败，请确认你的ffmpeg可以处理此转换"));
            }
            finally {
                fs.unlink(tmpfile, NOOP);
            }
        });
    });
}
function audioTrans(file, transcode, maxSize = 1024 * 1024 * 10, ffmpeg = "ffmpeg") {
    return new Promise(async (resolve, reject) => {
        if (!transcode) {
            const tmpfile = path.join(TMP_DIR, uuid());
            const fileInfo = fs.statSync(file);
            let command = `${ffmpeg} -i "${file}"`;
            const is_aac = fileInfo['size'] > maxSize;
            if (is_aac) {
                command += ` -fs ${maxSize} -ab 96k "${tmpfile}.aac"`;
            }
            exec(command, async (error, stdout, stderr) => {
                try {
                    resolve({ data: is_aac ? fs.readFileSync(`${tmpfile}.aac`) : Buffer.alloc(0), duration: parseDuration(stderr) });
                }
                catch {
                    reject(new ApiRejection(ErrorCode.FFmpegPttTransError, "音频处理失败，请确认你的ffmpeg可以处理此转换"));
                }
                finally {
                    if (is_aac)
                        fs.unlink(tmpfile, NOOP);
                }
            });
        }
        try {
            resolve(await audioTransSlik(file, ffmpeg));
            return;
        }
        catch { }
        const tmpfile = path.join(TMP_DIR, uuid());
        exec(`${ffmpeg} -y -i "${file}" -ac 1 -ar 8000 -f amr "${tmpfile}"`, async (error, stdout, stderr) => {
            try {
                const amr = await fs.promises.readFile(tmpfile);
                resolve({ data: amr, duration: parseDuration(stderr) });
            }
            catch {
                reject(new ApiRejection(ErrorCode.FFmpegPttTransError, "音频转码到amr失败，请确认你的ffmpeg可以处理此转换"));
            }
            finally {
                fs.unlink(tmpfile, NOOP);
            }
        });
    });
}
function parseDuration(stderr) {
    const timeMatch = stderr.match(/Duration:\s*([^,]+)/);
    const time = timeMatch?.[1]?.trim() || '00:00:00';
    const seconds = time.split(':').reverse().reduce((total, val, i) => total + (parseInt(val) || 0) * 60 ** i, 0);
    return seconds;
}
