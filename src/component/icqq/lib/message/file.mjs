import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { downloadFileToTmpDir, saveFileToTmpDir } from "../internal/index.mjs";
import { md5Stream, shaStream, IS_WIN, NOOP } from "../common.mjs";
import { pb } from "../core/index.mjs";
export class File {
    get elem() {
        const proto = pb.decode(pb.encode({
            2: {
                type: "trans",
                data: this.proto,
                head: "01"
            }
        }))[2];
        return { type: "file", file: "protobuf://" + proto.toBase64(), name: this.name };
    }
    get proto() {
        return this._proto;
    }
    get uploadInfo() {
        return this._uploadInfo;
    }
    set fid(val) {
        this._fid = val;
        if (this.fid && this.busid)
            this.setProto();
    }
    set busid(val) {
        this._busid = val;
        if (this.fid && this.busid)
            this.setProto();
    }
    get fid() {
        return this._fid;
    }
    get busid() {
        return this._busid;
    }
    /**
     * @param elem
     * @param cachedir
     @param dm 是否私聊 */
    constructor(client, elem, dm = false) {
        this.dm = dm;
        /** 最终用于发送的对象 */
        this._proto = {};
        this._busid = 102;
        /** 文件属性 */
        this.elem_type = "file";
        this.file = "";
        this.name = "";
        this.md5 = randomBytes(0);
        this.sha1 = randomBytes(0);
        this.sha1Stream = [];
        this.size = 0;
        this.brief = "";
        this.nt = false;
        this.uploaded = false;
        this.temp = false;
        this.client = client;
        this.nt = false; //this.client.useQQNT;
        const { file, md5, name, size, temp = false } = elem;
        this.md5 = Buffer.from(md5 || "", "hex");
        this.name = name || this.name;
        this.size = size ?? this.size;
        this.temp = temp;
        if (file instanceof Buffer) {
            this.task = saveFileToTmpDir(file).catch(e => { throw e; }).then(f => this.fromLocal(f, true));
        }
        else if (file.startsWith("base64://")) {
            this.task = saveFileToTmpDir(file).catch(e => { throw e; }).then(f => this.fromLocal(f, true));
        }
        else if (file.startsWith("http")) {
            this.task = downloadFileToTmpDir(file).catch(e => { throw e; }).then(f => this.fromLocal(f, true));
        }
        else if (file.startsWith("fid:")) {
            this.task = new Promise(async (resolve, reject) => {
                this.fid = file.slice(4);
                if (!this.md5.length)
                    return reject(new Error("文件校验值不能为空！"));
                this.name = this.name || this.md5.toString("hex");
                this.busid = this.fid.includes("_") ? 104 : 102;
                resolve();
            });
        }
        else {
            this.task = this.fromLocal(file);
        }
    }
    async fromLocal(file, temp = false) {
        file = String(file).replace(/^file:\/{2}/, "");
        IS_WIN && file.startsWith("/") && (file = file.slice(1));
        this.file = file;
        if (temp)
            this.temp = true;
        if (!temp)
            this.name || (this.name = path.basename(this.file));
        const stream = fs.createReadStream(file, { highWaterMark: 1024 * 256 });
        const [md5, sha1] = await Promise.all([
            md5Stream(stream),
            shaStream(stream)
        ]);
        this.name = this.name || md5.toString("hex");
        this.md5 = md5;
        this.sha1 = sha1;
        //this.sha1Stream = this.nt ? await constants.calculateSha1StreamBytes(fs.createReadStream(file, { highWaterMark: 1024 * 256 })) : [];
        this.size = fs.statSync(file).size;
        this.readable = fs.createReadStream(file, { highWaterMark: 1024 * 256 });
    }
    setUploadResp(resp) {
        let retcode = 0, message, ip, port, ukey, cmdid, ticket, ext;
        return this;
    }
    setProto() {
        Object.assign(this._proto, {
            1: 6,
            2: this.name,
            3: `${this.size}Byte`,
            7: {
                2: {
                    1: this.busid,
                    2: String(this.fid),
                    3: this.size,
                    4: this.name,
                    5: 0,
                    7: "{}",
                    8: this.md5.toString("hex")
                }
            }
        });
    }
    deleteTmpFile() {
        this?.file && fs.unlink(this?.file, NOOP);
        this.readable?.destroy();
    }
}
