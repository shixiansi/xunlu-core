import fs from "fs";
import path from "path";
import axios from "axios";
import { Readable } from "stream";
import { randomBytes } from "crypto";
import { tea, pb, SSOErrorCode } from "../core/index.mjs";
import { ErrorCode, drop } from "../errors.mjs";
import { md5, timestamp, uuid, TMP_DIR, unzip, int32ip2str, lock, pipeline, DownloadTransform, BUF0, NOOP, } from "../common.mjs";
import { ForwardMessage, Image, Converter, createMultiMsgJson, parseMultiMsg, Video, File, Ptt, buildShare } from "../message/index.mjs";
import { CmdID, highwayUpload } from "./highway.mjs";
import { refreshNTPicRkey, uin2uid } from "./internal.mjs";
import { gzipSync, unzipSync } from "zlib";
/** 所有用户和群的基类 */
export class Contactable {
    // 对方账号，可能是群号也可能是QQ号
    get target() {
        return this.uin || this.gid || this.c.uin;
    }
    // 是否是 Direct Message (私聊)
    get dm() {
        return !!this.uin;
    }
    /** 返回所属的客户端对象 */
    get client() {
        return this.c;
    }
    constructor(c) {
        this.c = c;
        lock(this, "c");
    }
    get [Symbol.unscopables]() {
        return {
            c: true,
        };
    }
    // 取私聊图片fid
    async _offPicUp(imgs) {
        const req = [];
        for (const img of imgs) {
            req.push({
                1: this.c.uin,
                2: this.uin,
                3: 0,
                4: img.md5,
                5: img.size,
                6: img.md5.toString("hex"),
                7: 5,
                8: 9,
                9: 0,
                10: 0,
                11: 0, //retry
                12: 1, //bu
                13: img.origin ? 1 : 0,
                14: img.width,
                15: img.height,
                16: img.type,
                17: this.c.apk.version,
                22: 0,
            });
        }
        const body = pb.encode({
            1: 1,
            2: req,
            // 10: 3
        });
        const payload = await this.c.sendUni("LongConn.OffPicUp", body);
        return pb.decode(payload)[2];
    }
    // 取群聊图片fid
    async _groupPicUp(imgs) {
        const req = [];
        for (const img of imgs) {
            req.push({
                1: this.gid,
                2: this.c.uin,
                3: 0,
                4: img.md5,
                5: img.size,
                6: img.md5.toString("hex"),
                7: 5,
                8: 9,
                9: 1, //bu
                10: img.width,
                11: img.height,
                12: img.type,
                13: this.c.apk.version,
                14: 0,
                15: 1052,
                16: img.origin ? 1 : 0,
                18: 0,
                19: 0,
            });
        }
        const body = pb.encode({
            1: 3,
            2: 1,
            3: req,
        });
        const payload = await this.c.sendUni("ImgStore.GroupPicUp", body);
        return pb.decode(payload)[3];
    }
    async _ntMediaUp(elem) {
        let cmd = '';
        let type = 0;
        const fileInfos = [];
        const extBizInfo = {
            10: 0
        };
        switch (true) {
            case elem instanceof Image:
            case elem?.type === "image": {
                type = 1;
                cmd = `OidbSvcTrpcTcp.0x11c${this.dm ? "5" : "4"}_100`;
                const img = elem instanceof Image ? elem : new Image(this.c, elem);
                await img.task;
                extBizInfo[type] = {
                    1: img.asface ? 1 : 0,
                    2: img.summary,
                    [this.dm ? 11 : 12]: {
                        1: img.asface ? 1 : 0,
                        3: 0,
                        4: 0,
                        9: img.summary,
                        10: 0,
                        34: 0
                    }
                };
                fileInfos.push({
                    1: {
                        1: img.size,
                        2: img.md5.toString("hex"),
                        3: img.sha1.toString("hex"),
                        4: img.name,
                        5: {
                            1: type,
                            2: img.type,
                            3: 0,
                            4: 0
                        },
                        6: img.width,
                        7: img.height,
                        8: 0,
                        9: img.origin ? 1 : 0
                    },
                    2: 0
                });
                break;
            }
            case elem instanceof Video:
            case elem?.type === "video":
            case elem?.type === "bubble": {
                type = (elem instanceof Video ? elem.elem_type : elem) === "bubble" ? 5 : 2;
                cmd = `OidbSvcTrpcTcp.0x11e${this.dm ? "9" : "a"}_100`;
                const video = elem instanceof Video ? elem : new Video(this.c, elem);
                await video.task;
                extBizInfo[type === 5 ? 4 : type] = type === 5 ? {
                    1: "video_longwatermelon"
                } : {
                    3: pb.encode({
                        16: 0
                    })
                };
                fileInfos.push({
                    1: {
                        1: video.videoInfo.size,
                        2: video.videoInfo.md5.toString("hex"),
                        3: video.videoInfo.sha1.toString("hex"),
                        4: video.videoInfo.name,
                        5: {
                            1: type,
                            2: 0,
                            3: 0,
                            4: 0,
                        },
                        6: video.width,
                        7: video.height,
                        8: video.seconds ?? 1,
                        9: 1
                    },
                    2: 0
                }, {
                    1: {
                        1: video.thumbInfo.size,
                        2: video.thumbInfo.md5.toString("hex"),
                        3: video.thumbInfo.sha1.toString("hex"),
                        4: video.thumbInfo.name,
                        5: {
                            1: 1,
                            2: 0,
                            3: 0,
                            4: 0,
                        },
                        6: video.width,
                        7: video.height,
                        8: 0,
                        9: 1
                    },
                    2: 100
                });
                break;
            }
            case elem instanceof Ptt:
            case elem?.type === "record": {
                type = 3;
                cmd = `OidbSvcTrpcTcp.0x126${this.dm ? "d" : "e"}_100`;
                const ptt = elem instanceof Ptt ? elem : new Ptt(this.c, elem);
                await ptt.task;
                extBizInfo[type] = {};
                fileInfos.push({
                    1: {
                        1: ptt.size,
                        2: ptt.md5.toString("hex"),
                        3: ptt.sha1.toString("hex"),
                        4: ptt.name,
                        5: {
                            1: type,
                            2: 0,
                            3: 0,
                            4: 1,
                        },
                        6: 0,
                        7: 0,
                        8: ptt.seconds ?? 1,
                        9: 0
                    },
                    2: 0
                });
                break;
            }
            default:
                throw new Error("bad param");
        }
        if (!cmd.length)
            throw new Error("bad param");
        const sceneInfo = {
            101: 2,
            102: type,
            103: 0,
            200: this.dm ? 1 : 2
        };
        if (this.dm)
            sceneInfo[201] = {
                1: 2,
                2: await uin2uid.call(this.c, this.target, this.gid)
            };
        if (this.dm && this.gid)
            sceneInfo[201][3] = {
                3: {
                    3: this.gid,
                    4: sceneInfo[201][2]
                }
            };
        if (!this.dm)
            sceneInfo[202] = {
                1: this.target
            };
        const proto = {
            1: {
                1: {
                    1: this.c.sig.req_id++,
                    2: 100
                },
                2: sceneInfo,
                3: {
                    1: 2
                }
            },
            2: {
                1: fileInfos,
                2: 1,
                3: 0,
                4: randomBytes(4).readUInt32BE(),
                5: this.dm ? 1 : 2,
                6: extBizInfo,
                7: 0,
                8: 0,
                9: {}
            }
        };
        return (await this.c.sendOidbSvcTrpcTcp(cmd, proto, { message_type: 32 }));
    }
    /** 上传一批图片以备发送(无数量限制)，理论上传一次所有群和好友都能发 */
    async uploadImages(_imgs) {
        const CHUNK_SIZE = 20;
        const logger = this.c.logger;
        // 预处理图片数组
        const imgs = [];
        for (const img of _imgs) {
            if (!img.fid) {
                imgs.push(img);
            }
            else if (img instanceof Image && img.deleteTmpFile) {
                img.deleteTmpFile();
            }
        }
        logger.debug(`开始图片任务，共有${imgs.length}张图片`);
        // 创建并执行初始任务
        const tasks = [];
        for (let i = 0; i < imgs.length; i++) {
            if (!(imgs[i] instanceof Image)) {
                imgs[i] = new Image(this.c, imgs[i], this.dm, path.join(this.c.dir, "../image"));
            }
            const img = imgs[i];
            try {
                if (!img.readable && img.fileid) {
                    img.setUrl(await this.getNTPicURLbyFileid(img.fileid));
                }
            }
            catch { }
            tasks.push(img.task);
        }
        // 等待所有初始任务完成
        const initialResults = await Promise.allSettled(tasks);
        for (let i = 0; i < initialResults.length; i++) {
            if (initialResults[i].status === "rejected") {
                logger.warn(`图片${i + 1}失败, reason: ${initialResults[i].reason?.message}`);
            }
        }
        // 分块处理图片上传
        const allResults = [...initialResults];
        for (let n = 0; n < imgs.length; n += CHUNK_SIZE) {
            let allChunk = imgs.slice(n, n + CHUNK_SIZE);
            // 处理图片上传
            try {
                const chunk = allChunk.filter(img => !img.nt);
                if (chunk.length) {
                    const uploadMethod = (this.dm ? this._offPicUp : this._groupPicUp);
                    let resp = await uploadMethod.call(this, chunk);
                    if (!Array.isArray(resp))
                        resp = [resp];
                    chunk.forEach(img => { img.setUploadResp(resp.shift()); });
                }
                const uploadTasks = allChunk.map((img) => img.nt ? this._ntMediaUp(img).catch((e) => { throw e; }).then(resp => this._uploadImage(img.setUploadResp(resp))) : this._uploadImage(img));
                const uploadResults = await Promise.allSettled(uploadTasks);
                for (let i = 0; i < uploadResults.length; i++) {
                    if (uploadResults[i].status === "rejected") {
                        allResults[n + i] = uploadResults[i];
                        logger.warn(`图片${n + i + 1}上传失败, reason: ${uploadResults[i].reason?.message}`);
                    }
                }
            }
            catch (error) {
                logger.warn(`上传图片失败: ${error}`);
            }
        }
        logger.debug(`图片任务结束`);
        return allResults;
    }
    async _uploadImage(img) {
        if (img.uploaded) {
            img.deleteTmpFile();
            return;
        }
        img.uploaded = true;
        if (!img.readable || !img.uploadInfo) {
            img.deleteTmpFile();
            img.deleteCacheFile();
            return;
        }
        if (img.uploadInfo.retcode !== 0) {
            img.deleteTmpFile();
            img.deleteCacheFile();
            drop(img.uploadInfo.retcode, img.uploadInfo.message);
        }
        return highwayUpload
            .call(this.c, img.readable, {
            cmdid: img.uploadInfo.cmdid,
            md5: img.md5,
            size: img.size,
            ticket: img.uploadInfo.ticket,
            ext: img.uploadInfo.ext
        }, img.uploadInfo.ip, img.uploadInfo.port)
            .finally(img.deleteTmpFile.bind(img));
    }
    /** 发送互联分享 */
    async share(content, config) {
        const request = buildShare((this.gid || this.uin), this.dm ? 0 : 1, content, config);
        const resp = pb.decode(await this.c.sendOidb(request.cmd, pb.encode(request.body)));
        if (resp[3] !== 0)
            drop(resp[3], String(resp[4]?.[1] || resp[4] || ""));
    }
    async _uploadFile(elem, callback) {
        let info;
        if (typeof elem.file === "string" && elem.file.startsWith("fid:")) {
            let fid = elem.file.slice(4);
            if (!fid.includes("_")) {
                if (!this.gid)
                    drop(ErrorCode.GroupFileNotExists);
                fid = await this.c.pickFriend(this.c.uin).forwardFile(fid, this.gid, false);
            }
            info = await this.c.pickUser(this.dm ? this.target : this.c.uin).getFileInfo(fid);
            elem.file = `fid:${info.fid}`;
            elem.md5 = info.md5;
            elem.name = info.name;
            elem.size = info.size;
        }
        const file = new File(this.c, elem, this.dm);
        await file.task;
        if (this.dm) {
            if (info) {
                const fid = await this.c.pickFriend(this.target).forwardFile(file.fid, 0, false);
                file.fid = fid;
                file.busid = 104;
            }
            else {
                await this.c.pickFriend(this.target).uploadFile(file, file.name, callback);
            }
        }
        else {
            if (info) {
                info = await this.c.pickGroup(this.target).fs.forwardOfflineFile(info, file.name, false);
                file.fid = info.fid;
                file.busid = info.busid;
            }
            else {
                await this.c.pickGroup(this.target).fs.upload(file, "/", file.name, callback, false);
            }
        }
        return file.elem;
    }
    /** 发消息预处理 */
    async _preprocess(content, source) {
        try {
            if (!Array.isArray(content))
                content = [content];
            const ForwardNodeElem = content.filter(e => typeof e !== "string" && e.type === "node");
            const task = content
                .filter(e => !ForwardNodeElem.includes(e))
                .map(item => typeof item === "string" ? { type: "text", text: item } : item)
                .flat()
                .map(async (elem) => {
                if (elem.type === "video" || elem.type === "bubble")
                    return await this.uploadVideo(elem);
                if (elem.type === "share")
                    return await this.share(elem);
                if (elem.type === "record")
                    return await this.uploadPtt(elem);
                if (elem.type === "file")
                    return await this._uploadFile(elem);
                return Promise.resolve(elem);
            });
            if (ForwardNodeElem.length)
                task.push(this._makeForwardMsg(ForwardNodeElem));
            content = (await Promise.all(task)).filter(Boolean);
            const converter = new Converter(this.c, content, {
                dm: this.dm,
                cachedir: path.join(this.c.dir, "image"),
                mlist: this.c.gml.get(this.gid),
            });
            if (source)
                await converter.quote(source);
            if (converter.imgs.length)
                await this.uploadImages(converter.imgs);
            return converter;
        }
        catch (e) {
            drop(ErrorCode.MessageBuilderError, e.message);
        }
    }
    /** 上传一个视频以备发送(理论上传一次所有群和好友都能发) */
    async uploadVideo(elem) {
        if (typeof elem.file === "string" && elem.file.startsWith("protobuf://"))
            return elem;
        const video = new Video(this.c, elem, this.dm);
        await video.task;
        if (video.nt || video.elem_type === "bubble") {
            const resp = await this._ntMediaUp(video);
            try {
                video.setUploadResp(resp);
                if (video.thumbInfo && resp[2]?.[10]) {
                    const resp2 = Buffer.from(pb.encode({
                        1: resp[1],
                        2: {
                            1: resp[2][10][2],
                            2: resp[2][10][3],
                            3: resp[2][10][4],
                            4: resp[2][10][5],
                            6: resp[2][6]
                        }
                    }));
                    video.thumbInfo.setUploadResp(pb.decode(resp2));
                }
            }
            catch { }
        }
        else {
            const ext = pb.encode({
                1: this.c.uin,
                2: this.target,
                3: 1,
                4: 2,
                5: {
                    1: video.videoInfo.name,
                    2: video.videoInfo.md5,
                    3: video.thumbInfo.md5 || BUF0,
                    4: video.videoInfo.size,
                    5: video.height,
                    6: video.width,
                    7: 3,
                    8: video.seconds,
                    9: video.thumbInfo.size ?? 0,
                },
                6: this.target,
                20: 1,
            });
            const body = pb.encode({
                1: 300,
                3: ext,
                100: {
                    1: 0,
                    2: 1,
                },
            });
            const payload = await this.c.sendUni("PttCenterSvr.GroupShortVideoUpReq", body);
            const resp = pb.decode(payload)[3];
            try {
                video.setUploadResp(resp);
            }
            catch { }
            if (video.uploadInfo)
                video.uploadInfo.ext = ext;
        }
        try {
            if (video.uploadInfo && video.readable) {
                if (video.uploadInfo.retcode !== 0) {
                    if (video.temp) {
                        video.deleteTmpFile();
                    }
                    else {
                        video.deleteThumbTmpFile();
                    }
                    drop(video.uploadInfo.retcode, video.uploadInfo.message || "");
                }
                if (video.nt) {
                    if (!video.uploaded) {
                        await highwayUpload.call(this.c, video.readable, {
                            cmdid: video.uploadInfo.cmdid,
                            md5: video.videoInfo.md5,
                            size: video.videoInfo.size,
                            ext: video.uploadInfo.ext,
                        });
                    }
                    if (!video.thumbInfo.uploaded && video.thumbInfo.readable && video.thumbInfo.uploadInfo) {
                        await highwayUpload.call(this.c, video.thumbInfo.readable, {
                            cmdid: video.uploadInfo.cmdid + 1,
                            md5: video.thumbInfo.md5,
                            size: video.thumbInfo.size,
                            ext: video.thumbInfo.uploadInfo.ext,
                        }).catch(e => this.c.logger.error(e?.message || e));
                    }
                }
                else {
                    await highwayUpload.call(this.c, video.readable, {
                        cmdid: video.uploadInfo.cmdid,
                        md5: video.md5,
                        size: (video.thumbInfo.size ?? 0) + video.videoInfo.size,
                        ext: video.uploadInfo.ext,
                        encrypt: true,
                    });
                }
            }
        }
        finally {
            if (video.temp) {
                video.deleteTmpFile();
            }
            else {
                video.deleteThumbTmpFile();
            }
        }
        return {
            type: elem.type,
            file: "protobuf://" + Buffer.from(pb.encode(video.proto)).toString("base64"),
            nt: video.nt
        };
    }
    /** 上传一个语音以备发送 */
    async uploadPtt(elem) {
        if (typeof elem.file === "string" && elem.file.startsWith("protobuf://"))
            return elem;
        this.c.logger.debug("开始语音任务");
        const ptt = new Ptt(this.c, elem, this.dm);
        await ptt.task;
        if (ptt.nt) {
            const resp = await this._ntMediaUp(ptt);
            try {
                ptt.setUploadResp(resp);
            }
            catch { }
        }
        else {
            const body = {
                1: 3,
                2: 3,
                5: {
                    1: this.target,
                    2: this.c.uin,
                    3: 0,
                    4: ptt.md5,
                    5: ptt.size,
                    6: ptt.name,
                    7: 2,
                    8: 9,
                    9: 3,
                    10: this.c.apk.version,
                    12: ptt.seconds ?? 1,
                    13: 1,
                    14: ptt.codec,
                    15: 2,
                },
            };
            const payload = await this.c.sendUni("PttStore.GroupPttUp", pb.encode(body));
            const resp = pb.decode(payload)[5];
            try {
                ptt.setUploadResp(resp);
            }
            catch { }
            if (ptt.uploadInfo)
                ptt.uploadInfo.ext = body;
        }
        if (ptt.uploadInfo && ptt.readable) {
            if (ptt.uploadInfo.retcode !== 0) {
                if (ptt.temp)
                    ptt.deleteTmpFile();
                drop(ptt.uploadInfo.retcode, ptt.uploadInfo.message || "");
            }
            if (!ptt.uploaded) {
                await highwayUpload.call(this.c, ptt.readable, {
                    cmdid: ptt.uploadInfo.cmdid,
                    md5: ptt.md5,
                    size: ptt.size,
                    ext: ptt.uploadInfo.ext,
                });
            }
        }
        if (ptt.temp)
            ptt.deleteTmpFile();
        /*
        const ip = rsp[5]?.[0] || rsp[5],
        port = rsp[6]?.[0] || rsp[6];
        const ukey = rsp[7].toHex(),
            filekey = rsp[11].toHex();*/
        /*const params = {
            ver: 4679,
            ukey,
            filekey,
            filesize: buf.length,
            bmd5: hash.toString("hex"),
            mType: "pttDu",
            voice_encodec: codec,
        };
        const url = `http://${int32ip2str(ip)}:${port}/?` + querystring.stringify(params);
        const headers = {
            "User-Agent": `QQ/${this.c.apk.version} CFNetwork/1126`,
            "Net-Type": "Wifi",
        };
        await axios.post(url, buf, { headers });*/
        this.c.logger.debug("语音任务结束");
        return {
            type: "record",
            file: "protobuf://" + Buffer.from(pb.encode(ptt.proto)).toString("base64"),
            nt: ptt.nt
        };
    }
    async _newUploadMultiMsg(compressed) {
        const body = pb.encode({
            2: {
                1: this.dm ? 1 : 3,
                2: {
                    2: this.target,
                },
                4: compressed,
            },
            15: {
                1: 4,
                2: 2,
                3: 9,
                4: 0,
            },
        });
        const payload = await this.c.sendUni("trpc.group.long_msg_interface.MsgService.SsoSendLongMsg", body, 6, { message_type: 0 });
        const rsp = pb.decode(payload)?.[2];
        if (!rsp?.[3])
            drop(rsp?.[1], rsp?.[2]?.toString() ||
                "unknown trpc.group.long_msg_interface.MsgService.SsoSendLongMsg error");
        return rsp[3].toString();
    }
    async _uploadMultiMsg(compressed) {
        const body = pb.encode({
            1: 1,
            2: 5,
            3: 9,
            4: 3,
            5: this.c.apk.version,
            6: [
                {
                    1: this.target,
                    2: compressed.length,
                    3: md5(compressed),
                    4: 3,
                    5: 0,
                },
            ],
            8: 1,
        });
        const payload = await this.c.sendUni("MultiMsg.ApplyUp", body);
        let rsp = pb.decode(payload)[2];
        if (rsp[1] !== 0)
            drop(rsp[1], rsp[2]?.toString() || "unknown MultiMsg.ApplyUp error");
        const buf = pb.encode({
            1: 1,
            2: 5,
            3: 9,
            4: [
                {
                    1: this.dm ? 1 : 3,
                    2: this.target,
                    4: compressed,
                    5: 2,
                    6: rsp[3].toBuffer(),
                },
            ],
        });
        const ip = rsp[4]?.[0] || rsp[4], port = rsp[5]?.[0] || rsp[5];
        await highwayUpload.call(this.c, Readable.from(Buffer.from(buf), { objectMode: false, highWaterMark: 1024 * 256 }), {
            cmdid: CmdID.MultiMsg,
            md5: md5(buf),
            size: buf.length,
            ticket: rsp[10].toBuffer(),
        }, ip, port);
        return rsp[2].toString();
    }
    buildMultiMsgNode(fake, isNT = this.c.useQQNT) {
        let node = {};
        const maker = fake.maker;
        if (isNT) {
            node = {
                1: {
                    1: fake.user_id,
                    //2: 'uid',
                    5: this.dm ? this.c.uin : null,
                    6: this.dm ? this.c.uid || null : null,
                    7: this.dm
                        ? {
                            6: fake.nickname,
                        }
                        : null,
                    8: this.dm
                        ? null
                        : {
                            1: this.target,
                            4: fake.nickname,
                            5: 2,
                        },
                },
                2: {
                    1: this.dm ? 9 : 82,
                    2: this.dm ? 175 : null,
                    3: this.dm ? 175 : null,
                    4: fake.rand,
                    5: fake.seq,
                    6: fake.time,
                    7: 1,
                    8: 0,
                    9: 0,
                    15: {
                        1: 0,
                        2: 0,
                        3: 0,
                        4: "",
                        5: "",
                    },
                },
                3: {
                    1: maker.rich,
                },
            };
        }
        else {
            node = {
                1: {
                    1: fake.user_id,
                    2: this.target,
                    3: this.dm ? 166 : 82,
                    4: this.dm ? 11 : null,
                    5: fake.seq,
                    6: fake.time,
                    7: fake.rand,
                    9: this.dm
                        ? null
                        : {
                            1: this.target,
                            4: fake.nickname,
                        },
                    14: this.dm ? fake.nickname : null,
                    20: {
                        1: 0,
                        2: fake.rand,
                    },
                },
                3: {
                    1: maker.rich,
                },
            };
        }
        return node;
    }
    async uploadLongMsg(content, source, isNT = this.c.useQQNT) {
        const node = this.buildMultiMsgNode({
            user_id: this.c.uin,
            nickname: this.c.nickname,
            time: timestamp(),
            maker: content instanceof Converter ? content : await this._preprocess(content, source)
        }, isNT);
        const compressed = gzipSync(pb.encode(isNT ? { 2: { 1: "MultiMsg", 2: { 1: node } } } : { 1: node }));
        let resid;
        try {
            resid = isNT
                ? await this._newUploadMultiMsg(compressed)
                : await this._uploadMultiMsg(compressed);
        }
        catch (e) {
            if (e?.retcode === SSOErrorCode.ProductNoRight)
                return this.uploadLongMsg(content, source, false);
            resid = isNT
                ? await this._newUploadMultiMsg(compressed)
                : await this._uploadMultiMsg(compressed);
        }
        return { type: "long_msg", resid };
    }
    /**
     * 制作一条合并转发消息以备发送（制作一次可以到处发）
     * 需要注意的是，好友图片和群图片的内部格式不一样，对着群制作的转发消息中的图片，发给好友可能会裂图，反过来也一样
     */
    async makeForwardMsg(msglist, isNT = this.c.useQQNT) {
        return {
            type: "json",
            data: createMultiMsgJson(await this._makeForwardMsg(msglist, isNT))
        };
    }
    async _makeForwardMsg(msglist, isNT = this.c.useQQNT) {
        if (!Array.isArray(msglist))
            msglist = [msglist];
        const nodes = [];
        let preview = [];
        let MultiMsg = [];
        for (const fake of msglist) {
            fake.user_id = fake.user_id || this.c.uin;
            if (!this.dm && !fake.nickname && (timestamp() - this.c.pickMember(this.target, fake.user_id).update_time) > 600)
                await this.c.pickMember(this.target, fake.user_id).renew().catch(NOOP);
            if (!Array.isArray(fake.message))
                fake.message = [fake.message];
            const maker = await this._preprocess(fake.message);
            for (let elem of (Array.isArray(maker.content) ? maker.content : [maker.content])) {
                if (typeof elem === "string")
                    continue;
                if (["xml", "json"].includes(elem.type)) {
                    const multimsg_elem = parseMultiMsg(elem);
                    if (!multimsg_elem)
                        continue;
                    elem = multimsg_elem;
                }
                if (elem.type !== "multimsg")
                    continue;
                const resid = elem.resid, fileName = elem.filename;
                if (resid && fileName) {
                    const resp = elem.compressed?.length ? unzipSync(Buffer.from(elem.compressed, "base64")) : (isNT
                        ? await this._newDownloadMultiMsg(String(resid), this.dm ? 1 : 2)
                        : await this._downloadMultiMsg(String(resid), this.dm ? 1 : 2));
                    let downMultiMsg = pb.decode(resp)[2];
                    if (!Array.isArray(downMultiMsg))
                        downMultiMsg = [downMultiMsg];
                    for (let val of downMultiMsg) {
                        let m_fileName = val[1].toString();
                        if (m_fileName === "MultiMsg") {
                            MultiMsg.push({
                                1: fileName,
                                2: val[2],
                            });
                        }
                        else {
                            MultiMsg.push(val);
                        }
                    }
                }
            }
            fake.seq = fake.seq ?? randomBytes(2).readUInt16BE();
            fake.rand = fake.rand ?? randomBytes(4).readUInt16BE();
            let nickname = fake.nickname;
            if (!nickname) {
                if (!this.dm)
                    nickname = this.c.pickMember(this.target, fake.user_id)?.card;
                if (!nickname && this.dm)
                    this.c.fl.get(fake.user_id)?.nickname || this.c.sl.get(fake.user_id)?.nickname || nickname;
            }
            fake.nickname = nickname || String(fake.user_id);
            if (typeof (fake.preview) === "string") {
                if (fake.preview.length)
                    preview.push(fake.preview);
            }
            else if (preview.length < 4) {
                preview.push(`${fake.nickname}: ${maker.brief.slice(0, 50)}`);
            }
            nodes.push(this.buildMultiMsgNode({
                user_id: fake.user_id,
                nickname: fake.nickname,
                time: fake.time || timestamp(),
                seq: fake.seq,
                rand: fake.rand,
                maker
            }, isNT));
        }
        MultiMsg.push({
            1: "MultiMsg",
            2: {
                1: nodes,
            },
        });
        const compressed = gzipSync(pb.encode({
            2: MultiMsg,
        }));
        let resid;
        try {
            resid = isNT
                ? await this._newUploadMultiMsg(compressed)
                : await this._uploadMultiMsg(compressed);
        }
        catch (e) {
            if (e?.retcode === SSOErrorCode.ProductNoRight)
                return this._makeForwardMsg(msglist, false);
            resid = isNT
                ? await this._newUploadMultiMsg(compressed)
                : await this._uploadMultiMsg(compressed);
        }
        return {
            type: "multimsg",
            resid,
            filename: uuid().toUpperCase(),
            preview,
            title: "转发的聊天记录",
            content: `查看${nodes.length}条转发消息`,
            compressed: compressed.toString("base64")
        };
    }
    /** 下载并解析合并转发 */
    async getForwardMsg(resid, fileName = "MultiMsg", isNT = this.c.useQQNT) {
        const ret = [];
        try {
            const buf = isNT
                ? await this._newDownloadMultiMsg(String(resid), this.dm ? 1 : 2)
                : await this._downloadMultiMsg(String(resid), this.dm ? 1 : 2);
            let a = pb.decode(buf)[2];
            if (!Array.isArray(a))
                a = [a];
            for (let b of a) {
                const m_fileName = b[1].toString();
                if (m_fileName === fileName) {
                    a = b;
                    break;
                }
            }
            if (Array.isArray(a))
                a = a[0];
            a = a[2][1];
            if (!Array.isArray(a))
                a = [a];
            for (let proto of a) {
                try {
                    ret.push(new ForwardMessage(this.c, proto, isNT));
                }
                catch { }
            }
        }
        catch (e) {
            if (e?.retcode === SSOErrorCode.ProductNoRight)
                return await this.getForwardMsg(resid, fileName, false);
            throw e;
        }
        return ret;
    }
    async _newDownloadMultiMsg(resid, bu) {
        const body = pb.encode({
            1: {
                1: {
                    2: this.target,
                },
                2: resid,
                3: bu === 2 ? 3 : 1,
            },
            15: {
                1: 2,
                2: 2,
                3: 9,
                4: 0,
            },
        });
        const payload = await this.c.sendUni("trpc.group.long_msg_interface.MsgService.SsoRecvLongMsg", body, 6, { message_type: this.c.useQQNT ? 32 : 0 });
        const rsp = pb.decode(payload)?.[1];
        if (!rsp?.[4])
            return BUF0;
        return unzip(rsp[4].toBuffer());
    }
    async _downloadMultiMsg(resid, bu) {
        const body = pb.encode({
            1: 2,
            2: 5,
            3: 9,
            4: 3,
            5: this.c.apk.version,
            7: [
                {
                    1: resid,
                    2: 3,
                },
            ],
            8: bu,
            9: 2,
        });
        const payload = await this.c.sendUni("MultiMsg.ApplyDown", body);
        const rsp = pb.decode(payload)[3];
        const ip = int32ip2str(rsp[4]?.[0] || rsp[4]);
        const port = rsp[5]?.[0] || rsp[5];
        let url = port == 443 ? `https://${ip}` : `http://${ip}:${port}`;
        url += rsp[2];
        let { data, headers } = await axios.get(url, {
            headers: {
                "Host": `${port == 443 ? "ssl." : ""}htdata.qq.com`,
                "User-Agent": `QQ/${this.c.apk.version} CFNetwork/1126`,
                "Net-Type": "Wifi",
            },
            responseType: "arraybuffer",
        });
        data = Buffer.from(data);
        let buf = headers["accept-encoding"]?.includes("gzip")
            ? await unzip(data)
            : data;
        const head_len = buf.readUInt32BE(1);
        const body_len = buf.readUInt32BE(5);
        buf = tea.decrypt(buf.slice(head_len + 9, head_len + 9 + body_len), rsp[3].toBuffer());
        return unzip(pb.decode(buf)[3][3].toBuffer());
    }
    /** 获取图片下载地址 */
    async getPicUrl(elem) {
        return elem.nt && typeof elem.fid === "string"
            ? await this.getNTPicURLbyFileid(elem.fid)
            : elem.url;
    }
    /** 获取视频下载地址 */
    async getVideoUrl(elem, md5 = "") {
        let fid = elem;
        if (typeof elem !== "string") {
            if (elem.nt)
                return this.getNTVideoUrl(elem);
            fid = elem.fid;
            md5 = elem.md5 || "";
        }
        const body = pb.encode({
            1: 400,
            4: {
                1: this.c.uin,
                2: this.c.uin,
                3: 1,
                4: 7,
                5: fid,
                6: 1,
                8: md5 instanceof Buffer ? md5 : Buffer.from(md5, "hex"),
                9: 1,
                10: 2,
                11: 2,
                12: 2,
            },
        });
        const payload = await this.c.sendUni("PttCenterSvr.ShortVideoDownReq", body);
        const rsp = pb.decode(payload)[4];
        if (rsp[1] !== 0)
            drop(rsp[1], "获取视频下载地址失败");
        const obj = rsp[9];
        return String(Array.isArray(obj[10]) ? obj[10][0] : obj[10]) + String(obj[11]);
    }
    async getNTVideoUrl(elem) {
        let info = {
            1: {
                1: elem.size,
                2: elem.md5,
                //3: '',
                4: elem.name,
            },
            2: elem.fid,
            3: 1,
        };
        let file = String(elem.file);
        if (file.startsWith("protobuf://")) {
            const buf = Buffer.from(file.replace("protobuf://", ""), "base64");
            info = pb.decode(buf)[2][1][1][1];
        }
        const body = pb.encode({
            1: {
                1: {
                    1: 1,
                    2: 200,
                },
                2: this.dm
                    ? {
                        101: 2,
                        102: 2,
                        200: 1,
                        201: {
                            1: 2,
                            2: this.uin?.toString(),
                        },
                    }
                    : {
                        101: 2,
                        102: 2,
                        200: 2,
                        202: {
                            1: this.gid,
                        },
                    },
                3: {
                    1: 2,
                },
            },
            3: {
                1: info,
                2: {
                    2: {
                        1: 0,
                        3: 0,
                    },
                },
            },
        });
        try {
            const rsp = await this.c.sendOidbSvcTrpcTcp(this.dm ? "OidbSvcTrpcTcp.0x11e9_200" : "OidbSvcTrpcTcp.0x11ea_200", body, { message_type: 32 });
            const rkey = rsp[3][1];
            if (!rkey)
                throw new Error("rkey不存在");
            return `https://${rsp[3][3][1]}${rsp[3][3][2]}${rkey}`;
        }
        catch (e) {
            this.c.logger.warn("获取QQNT视频URL失败", e.message);
            return null;
        }
    }
    async getPttUrl(elem) {
        return elem.fid ? this.getNTPttUrl(elem) : elem.url;
    }
    async getNTPttUrl(elem) {
        let info = {
            1: {
                1: elem.size,
                2: elem.md5,
                3: elem.sha1 || "",
                //4: elem.name
            },
            2: elem.fid,
            3: elem.nt ? 1 : 0,
        };
        let file = String(elem.file);
        if (file.startsWith("protobuf://") && elem.nt) {
            const buf = Buffer.from(file.replace("protobuf://", ""), "base64");
            info = pb.decode(buf)[2][1][1];
        }
        const body = pb.encode({
            1: {
                1: {
                    1: 1,
                    2: 200,
                },
                2: this.dm
                    ? {
                        101: 1,
                        102: 3,
                        200: 1,
                        201: {
                            1: 2,
                            2: this.uin?.toString(),
                        },
                    }
                    : {
                        101: 1,
                        102: 3,
                        200: 2,
                        202: {
                            1: this.gid,
                        },
                    },
                3: {
                    1: 2,
                },
            },
            3: {
                1: info,
                2: {
                    2: {
                        1: 0,
                        3: 0,
                    },
                },
            },
        });
        try {
            const rsp = await this.c.sendOidbSvcTrpcTcp(this.dm ? "OidbSvcTrpcTcp.0x126d_200" : "OidbSvcTrpcTcp.0x126e_200", body, { message_type: 32 });
            const rkey = rsp[3][1];
            if (!rkey)
                throw new Error("rkey不存在");
            return `https://${rsp[3][3][1]}${rsp[3][3][2]}${rkey}`;
        }
        catch (e) {
            this.c.logger.warn("获取QQNT语音URL失败", e.message);
            return null;
        }
    }
    /**
     * 获取QQNT图片rkey
     * @this {import("../client.mjs").Client}
     */
    async getNTPicRkey() {
        const rkeyInfos = await refreshNTPicRkey.call(this.c);
        return {
            offNTPicRkey: `&rkey=${rkeyInfos[10]?.rkey || ""}`,
            groupNTPicRkey: `&rkey=${rkeyInfos[20]?.rkey || ""}`
        };
    }
    /**
     * 获取QQNT群图rkey
     * @deprecated
     * @this {import("../client.mjs").Client}
     */
    async getGroupNTPicRkey() {
        const rsp = await this.getGroupNTPicURL({
            2: "CNL-BhjClnU",
            3: 1,
        }, this.gid);
        if (!rsp)
            return "&rkey=CAQSKDOc_jvbthUjZrMxJG2jNZ-rIWue47Q3PGKb_GWljzyvOUZOv0-EVao";
        return "&rkey=" + rsp.match(/&rkey=([^&]+)/)[1];
    }
    /**
     * 获取QQNT私聊图rkey
     * @deprecated
     * @this {import("../client.mjs").Client}
     */
    async getOffNTPicRkey() {
        const rsp = await this.getOffNTPicURL({
            2: "CNL-BhjClnU",
            3: 1,
        }, this.c.uid);
        if (!rsp)
            return "&rkey=CAQSKDOc_jvbthUjAatuFPQIo-x9wwcDhDGd8SOEu5FyJWNxNMabJTTRpO8";
        return "&rkey=" + rsp.match(/&rkey=([^&]+)/)[1];
    }
    /**
     * 获取QQNT群图URL
     * @this {import("../client.mjs").Client}
     * @param {Object} imgInfo
     * @param {number} gid
     */
    async getGroupNTPicURL(imgInfo, gid) {
        const body = pb.encode({
            1: {
                1: {
                    1: 1,
                    2: 200,
                },
                2: {
                    101: 2,
                    102: 1,
                    200: 2,
                    202: {
                        1: gid,
                    },
                },
                3: {
                    1: 2,
                },
            },
            3: {
                1: imgInfo,
                2: {
                    2: {
                        1: 0,
                        3: 0,
                    },
                },
            },
        });
        try {
            const rsp = await this.c.sendOidbSvcTrpcTcp("OidbSvcTrpcTcp.0x11c4_200", body, {
                message_type: 32,
            });
            const rkey = rsp[3][1];
            if (!rkey)
                throw new Error("rkey不存在");
            return `https://${rsp[3][3][1]}${rsp[3][3][2]}${rkey}&spec=0`;
        }
        catch (e) {
            this.c.logger.warn("获取QQNT图片URL失败", e.message);
            return null;
        }
    }
    /**
     * 获取QQNT私聊图URL
     * @this {import("../client.mjs").Client}
     * @param {Object} imgInfo
     * @param {String} uid
     */
    async getOffNTPicURL(imgInfo, uid) {
        if (!uid)
            uid = String(this.c.uid || this.c.uin);
        const body = pb.encode({
            1: {
                1: {
                    1: 1,
                    2: 200,
                },
                2: {
                    101: 2,
                    102: 1,
                    200: 1,
                    201: {
                        1: 2,
                        2: uid,
                    },
                },
                3: {
                    1: 2,
                },
            },
            3: {
                1: imgInfo,
                2: {
                    2: {
                        1: 0,
                        3: 0,
                    },
                },
            },
        });
        try {
            const rsp = await this.c.sendOidbSvcTrpcTcp("OidbSvcTrpcTcp.0x11c5_200", body, {
                message_type: 32,
            });
            const rkey = rsp[3][1];
            if (!rkey)
                throw new Error("rkey不存在");
            return `https://${rsp[3][3][1]}${rsp[3][3][2]}${rkey}&spec=0`;
        }
        catch (e) {
            this.c.logger.warn("获取QQNT图片URL失败", e.message);
            return null;
        }
    }
    /**
     * 通过fileid获取QQNT图片URL
     * @this {import("../client.mjs").Client}
     * @param {string} fileid
     */
    async getNTPicURLbyFileid(fileid) {
        const appidInFileId = pb.decode(Buffer.from(fileid, "base64"))[4];
        const { offNTPicRkey, groupNTPicRkey } = await this.getNTPicRkey();
        let url = "";
        if ([1406, 1407].includes(appidInFileId)) {
            const newRkey = appidInFileId === 1406 ? offNTPicRkey : groupNTPicRkey;
            url = `https://gchat.qpic.cn/download?appid=${appidInFileId}&fileid=${fileid}${newRkey}&spec=0`;
        }
        else {
            // 异常 fileid，只能挨个尝试
            url = `https://gchat.qpic.cn/download?appid=1407&fileid=${fileid}${groupNTPicRkey}&spec=0`;
            if (!(await checkImgUrl(url))) {
                url = `https://gchat.qpic.cn/download?appid=1406&fileid=${fileid}${offNTPicRkey}&spec=0`;
            }
        }
        return url;
    }
    /**
     * 通过fileid获取图片url
     * @this {import("../client.mjs").Client}
     * @param {string} fileid
     */
    async getNTPicURLbyFileidApi(fileid) {
        const url = await this.getNTPicURLbyFileid(fileid);
        return { result: 0, data: url };
    }
    /**
     * 通过fileid获取图片信息
     * @this {import("../client.mjs").Client}
     * @param {string} fileid
     */
    getNTPicInfobyFileid(fileid) {
        const proto = pb.decode(Buffer.from(fileid, "base64"));
        const info = {
            uin: proto[1]?.toString(),
            md5: proto[2].toHex(),
            size: proto[3],
            appid: proto[4],
            time: proto[5],
            expires: proto[10],
        };
        return info;
    }
}
/**
 * 判断图片URL是否有效
 * @this {import("../client.mjs").Client}
 * @param {string} url
 */
export async function checkImgUrl(url) {
    const data = await axios
        .get(url, {
        timeout: 5000,
        headers: { Range: "bytes=0-1" },
    })
        .then(res => res.data)
        .catch(() => null);
    return !!data;
}
export async function downloadFileToTmpDir(url, headers) {
    const savePath = path.join(TMP_DIR, uuid());
    let readable = (await axios.get(url, {
        headers,
        responseType: "stream",
    })).data;
    readable = readable.pipe(new DownloadTransform());
    await pipeline(readable, fs.createWriteStream(savePath));
    return savePath;
}
export async function saveFileToTmpDir(file) {
    const buf = file instanceof Buffer ? file : Buffer.from(file.slice(9), "base64");
    const savePath = path.join(TMP_DIR, uuid());
    await fs.promises.writeFile(savePath, buf);
    return savePath;
}
// 两个文件合并到一个流
export function createReadable(file1, file2) {
    return Readable.from(concatStreams(fs.createReadStream(file1, { highWaterMark: 256 * 1024 }), fs.createReadStream(file2, { highWaterMark: 256 * 1024 })));
}
// 合并两个流
export async function* concatStreams(readable1, readable2) {
    for await (const chunk of readable1)
        yield chunk;
    for await (const chunk of readable2)
        yield chunk;
}
export async function read7Bytes(file) {
    let buf;
    if (file instanceof Buffer) {
        buf = file.slice(0, 7);
    }
    else {
        const fd = await fs.promises.open(file, "r");
        buf = (await fd.read(Buffer.alloc(7), 0, 7, 0)).buffer;
        fd.close();
    }
    return buf;
}
