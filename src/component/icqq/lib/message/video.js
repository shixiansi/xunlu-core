"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Video = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const zlib_1 = __importDefault(require("zlib"));
const crypto_1 = require("crypto");
const internal_1 = require("../internal");
const child_process_1 = require("child_process");
const __1 = require("../");
const common_1 = require("../common");
const core_1 = require("../core");
const defaultThumb = "eJzt2j1Iw0AYBuAvaRtDTTGKSimFBtz8TcHBzVhaa0CKFNEORSIujqIgXZRURFBwVgdBBEeLo4pD1UUQagQH8Q8dBB0UCuIgiMZBkF42HQq+t9zHHXfv3T3rzfcl4j5vwEtEPr0nmiTy2CVviYLdnUxdD9gdN5GMRyhXCD4SKaRHu/ozQ0/n+z5SJT68+2FtnoUTBWF5r+PyOcjxblFWNJN+FHp2hHpfG2vZuWybQS8iu8J9wAv5sZ316tJxUVbpzSljmHMZ2+lTdifRT+/kkLxlcmo6N+qQLZnTpaF2oaXy5G8dbHfIFrRO5piKpjQbJC01BRxO61oLsRdT5HqV5o7rFtlsk7Oq2IvJYqWfDu8XutnsPD1UODzFrEcy78ZjDWy2zeACAxjAAAYwgAEMYAADGMAABjCAAQxgAAMYwAAGMIABDGAAAxjAAAYw/DuGzE3o6vsvAEjKggQMYAADGMAABjCAAQxgAAMYwAAGMIABDGAAAxjAAAYwgAEMYAADGMAAhl8xpCaLLUTui6+/ACApCxIwgAEMf8Rwy22sWKFizdEq2U2PJaK5iDHzCeZ6L1E=";
class Video {
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
    /**
     * @param elem
     * @param cachedir
     @param dm 是否私聊 */
    constructor(client, elem, dm = false) {
        this.dm = dm;
        /** 最终用于发送的对象 */
        this._proto = {};
        /** 视频属性 */
        this.elem_type = "video";
        this.md5 = (0, crypto_1.randomBytes)(16);
        this.sha1 = (0, crypto_1.randomBytes)(0);
        this.sha1Stream = [];
        this.width = 1280;
        this.height = 720;
        this.seconds = 120;
        this.thumbInfo = {};
        this.videoInfo = {
            md5: (0, crypto_1.randomBytes)(16),
            sha1: (0, crypto_1.randomBytes)(0),
            size: 0xffff,
            file: "",
            name: ""
        };
        this.nt = false;
        this.uploaded = false;
        this.temp = false;
        this.client = client;
        this.nt = this.client.useQQNT;
        let { type, file, width, height, seconds, temp = false, nt = this.nt } = elem;
        this.elem_type = type;
        this.width = width ?? this.width;
        this.height = height ?? this.height;
        this.seconds = seconds ?? this.seconds;
        this.temp = temp;
        this.nt = nt;
        if (file instanceof Buffer) {
            this.temp = true;
            this.task = (0, internal_1.saveFileToTmpDir)(file).catch(e => { throw e; }).then(f => this.fromLocal(f));
        }
        else if (file.startsWith("base64://")) {
            this.temp = true;
            this.task = (0, internal_1.saveFileToTmpDir)(file).catch(e => { throw e; }).then(f => this.fromLocal(f));
        }
        else if (file.startsWith("http")) {
            this.temp = true;
            this.task = (0, internal_1.downloadFileToTmpDir)(file).catch(e => { throw e; }).then(f => this.fromLocal(f));
        }
        else {
            this.task = this.fromLocal(file);
        }
    }
    async fromLocal(file) {
        file = file.replace(/^file:\/{2}/, "");
        common_1.IS_WIN && file.startsWith("/") && (file = file.slice(1));
        const video = file;
        const thumb = path_1.default.join(common_1.TMP_DIR, (0, common_1.uuid)());
        let isDefaultThumb = false;
        try {
            await new Promise((resolve, reject) => {
                (0, child_process_1.exec)(`${this.client.config.ffmpeg_path || "ffmpeg"} -y -i "${file}" -f image2 -frames:v 1 "${thumb}"`, (error, stdout, stderr) => {
                    this.client.logger.debug("ffmpeg output: " + stdout + stderr);
                    fs_1.default.stat(thumb, err => {
                        if (err)
                            reject(new __1.ApiRejection(__1.ErrorCode.FFmpegVideoThumbError, "ffmpeg获取视频图像帧失败"));
                        else
                            resolve(undefined);
                    });
                });
            });
        }
        catch (e) {
            isDefaultThumb = true;
            fs_1.default.writeFileSync(thumb, zlib_1.default.inflateSync(Buffer.from(defaultThumb, "base64")));
            this.client.logger.warn(e?.message || e);
        }
        this.thumbInfo = new __1.Image(this.client, { type: "image", file: thumb, nt: true });
        await this.thumbInfo.task;
        const [width, height, seconds] = await new Promise(resolve => {
            (0, child_process_1.exec)(`${this.client.config.ffprobe_path || "ffprobe"} -i "${file}" -show_streams`, (error, stdout, stderr) => {
                const lines = (stdout || stderr || "").split("\n");
                let width = isDefaultThumb ? this.width : this.thumbInfo.width, height = isDefaultThumb ? this.height : this.thumbInfo.height, seconds = this.seconds;
                for (const line of lines) {
                    if (line.startsWith("width=")) {
                        width = parseInt(line.slice(6));
                    }
                    else if (line.startsWith("height=")) {
                        height = parseInt(line.slice(7));
                    }
                    else if (line.startsWith("duration=")) {
                        seconds = parseInt(line.slice(9));
                        break;
                    }
                }
                resolve([width, height, seconds]);
            });
        });
        const videoStream = fs_1.default.createReadStream(video, { highWaterMark: 1024 * 256 });
        const videosize = (await fs_1.default.promises.stat(video)).size;
        const [videomd5, videosha1] = await Promise.all([
            (0, common_1.md5Stream)(videoStream),
            (0, common_1.shaStream)(videoStream),
        ]);
        if (this.nt) {
            this.md5 = videomd5;
            this.sha1 = videosha1;
            this.sha1Stream = await core_1.constants.calculateSha1StreamBytes(fs_1.default.createReadStream(video, { highWaterMark: 1024 * 256 }));
            this.readable = fs_1.default.createReadStream(video, { highWaterMark: 1024 * 256 });
        }
        else {
            const [md5, sha1] = await Promise.all([
                (0, common_1.md5Stream)((0, internal_1.createReadable)(thumb, video)),
                (0, common_1.shaStream)((0, internal_1.createReadable)(thumb, video)),
            ]);
            this.md5 = md5;
            this.sha1 = sha1;
            this.readable = (0, internal_1.createReadable)(thumb, video);
        }
        this.width = width;
        this.height = height;
        this.seconds = seconds;
        this.videoInfo = {
            md5: videomd5,
            sha1: videosha1,
            size: videosize,
            file: video,
            name: `${videomd5.toString("hex")}.mp4`
        };
    }
    setUploadResp(resp) {
        let retcode = 0, message, ip, port, cmdid, ukey, ticket, ext;
        if (this.nt) {
            cmdid = this.dm ? internal_1.CmdID.NTDmVideo : internal_1.CmdID.NTGroupVideo;
            resp = resp[2];
            this.proto = resp[6];
            const msgInfos = Array.isArray(resp[6][1]) ? resp[6][1] : [resp[6][1]];
            const msgInfo = msgInfos.find(msgInfo => String(msgInfo[1][1][3]).toLowerCase() === this.videoInfo.sha1.toString("hex").toLowerCase());
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
                                    2: (0, common_1.int32ip2str)(val[1])
                                },
                                2: val[2]
                            };
                        })
                    },
                    6: msgInfos,
                    10: 1024 * 1024,
                    11: {
                        1: this.sha1Stream
                    }
                };
            }
        }
        else {
            cmdid = internal_1.CmdID.ShortVideo;
            retcode = resp[1];
            message = String(resp[2]);
            if (retcode === 0) {
                this.fid = resp[5].toBuffer();
                this.uploaded = !!resp[7];
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
            ...(ext ? { ext: core_1.pb.encode(ext) } : {})
        };
        return this;
    }
    setProto(proto) {
        if (this.nt && proto) {
            Object.assign(this._proto, {
                1: 48,
                2: proto,
                3: (this.dm ? 11 : 21) + (this.elem_type === "video" ? 0 : 3),
            });
        }
        else {
            Object.assign(this._proto, {
                1: this._fid,
                2: this.videoInfo.md5,
                3: this.videoInfo.name,
                4: 3,
                5: this.seconds,
                6: this.videoInfo.size,
                7: this.width,
                8: this.height,
                9: this.thumbInfo.md5,
                10: "camera",
                11: this.thumbInfo.size,
                12: 0,
                15: 1,
                16: this.width,
                17: this.height,
                18: 0,
                19: 0,
            });
        }
    }
    deleteTmpFile() {
        this.videoInfo?.file && fs_1.default.unlink(this.videoInfo?.file, common_1.NOOP);
        this.deleteThumbTmpFile();
    }
    deleteThumbTmpFile() {
        this.thumbInfo.deleteCacheFile && this.thumbInfo.deleteCacheFile();
        this.thumbInfo.deleteTmpFile && this.thumbInfo.deleteTmpFile();
        this.readable && this.readable.destroy();
    }
}
exports.Video = Video;
