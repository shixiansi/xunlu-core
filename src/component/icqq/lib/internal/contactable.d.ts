import { Readable } from "stream";
import { pb } from "../core";
import { Sendable, ForwardMessage, Forwardable, Quotable, Image, ImageElem, VideoElem, PttElem, Converter, JsonElem, LongMsgElem, MultiMsgElem, BubbleElem, FileElem, Video, Ptt, ShareConfig, ShareContent, ShareElem } from "../message";
type Client = import("../client").Client;
/** 所有用户和群的基类 */
export declare abstract class Contactable {
    protected readonly c: Client;
    /** 对方QQ号 */
    protected uin?: number;
    /** 对方群号 */
    protected gid?: number;
    get target(): number;
    get dm(): boolean;
    /** 返回所属的客户端对象 */
    get client(): import("../client").Client;
    protected constructor(c: Client);
    get [Symbol.unscopables](): {
        c: boolean;
    };
    private _offPicUp;
    private _groupPicUp;
    _ntMediaUp(elem: ImageElem | Image | VideoElem | BubbleElem | Video | PttElem | Ptt): Promise<pb.Proto>;
    /** 上传一批图片以备发送(无数量限制)，理论上传一次所有群和好友都能发 */
    uploadImages(_imgs: Image[] | ImageElem[]): Promise<PromiseRejectedResult[]>;
    private _uploadImage;
    /** 发送互联分享 */
    share(content: ShareContent | ShareElem, config?: ShareConfig): Promise<void>;
    _uploadFile(elem: FileElem, callback?: (percentage: string) => void): Promise<{
        type: string;
        file: string;
        name: string;
    }>;
    /** 发消息预处理 */
    protected _preprocess(content: Sendable, source?: Quotable): Promise<Converter>;
    /** 上传一个视频以备发送(理论上传一次所有群和好友都能发) */
    uploadVideo(elem: VideoElem | BubbleElem): Promise<VideoElem | BubbleElem>;
    /** 上传一个语音以备发送 */
    uploadPtt(elem: PttElem): Promise<PttElem>;
    private _newUploadMultiMsg;
    private _uploadMultiMsg;
    buildMultiMsgNode(fake: Omit<Forwardable, "message"> & {
        message?: any;
        maker: Converter;
    }, isNT?: boolean): {};
    uploadLongMsg(content: Sendable | Converter, source?: Quotable, isNT?: boolean): Promise<LongMsgElem>;
    /**
     * 制作一条合并转发消息以备发送（制作一次可以到处发）
     * 需要注意的是，好友图片和群图片的内部格式不一样，对着群制作的转发消息中的图片，发给好友可能会裂图，反过来也一样
     */
    makeForwardMsg(msglist: Forwardable[] | Forwardable, isNT?: boolean): Promise<JsonElem>;
    _makeForwardMsg(msglist: Forwardable[] | Forwardable, isNT?: boolean): Promise<MultiMsgElem>;
    /** 下载并解析合并转发 */
    getForwardMsg(resid: string, fileName?: string, isNT?: boolean): Promise<ForwardMessage[]>;
    private _newDownloadMultiMsg;
    private _downloadMultiMsg;
    /** 获取图片下载地址 */
    getPicUrl(elem: ImageElem): Promise<string | undefined>;
    /** 获取视频下载地址 */
    getVideoUrl(elem: VideoElem | string, md5?: string | Buffer): Promise<string | null>;
    getNTVideoUrl(elem: VideoElem): Promise<string | null>;
    getPttUrl(elem: PttElem): Promise<string | null | undefined>;
    private getNTPttUrl;
    /**
     * 获取QQNT图片rkey
     * @this {import("../client").Client}
     */
    getNTPicRkey(): Promise<{
        offNTPicRkey: string;
        groupNTPicRkey: string;
    }>;
    /**
     * 获取QQNT群图rkey
     * @deprecated
     * @this {import("../client").Client}
     */
    getGroupNTPicRkey(): Promise<string>;
    /**
     * 获取QQNT私聊图rkey
     * @deprecated
     * @this {import("../client").Client}
     */
    getOffNTPicRkey(): Promise<string>;
    /**
     * 获取QQNT群图URL
     * @this {import("../client").Client}
     * @param {Object} imgInfo
     * @param {number} gid
     */
    getGroupNTPicURL(imgInfo: any, gid: number | undefined): Promise<string | null>;
    /**
     * 获取QQNT私聊图URL
     * @this {import("../client").Client}
     * @param {Object} imgInfo
     * @param {String} uid
     */
    getOffNTPicURL(imgInfo: any, uid: any): Promise<string | null>;
    /**
     * 通过fileid获取QQNT图片URL
     * @this {import("../client").Client}
     * @param {string} fileid
     */
    getNTPicURLbyFileid(fileid: string): Promise<string>;
    /**
     * 通过fileid获取图片url
     * @this {import("../client").Client}
     * @param {string} fileid
     */
    getNTPicURLbyFileidApi(fileid: string): Promise<{
        result: number;
        data: string;
    }>;
    /**
     * 通过fileid获取图片信息
     * @this {import("../client").Client}
     * @param {string} fileid
     */
    getNTPicInfobyFileid(fileid: string): {
        uin: any;
        md5: any;
        size: any;
        appid: any;
        time: any;
        expires: any;
    };
}
/**
 * 判断图片URL是否有效
 * @this {import("../client").Client}
 * @param {string} url
 */
export declare function checkImgUrl(url: string): Promise<boolean>;
export declare function downloadFileToTmpDir(url: string, headers?: any): Promise<string>;
export declare function saveFileToTmpDir(file: string | Buffer): Promise<string>;
export declare function createReadable(file1: string, file2: string): Readable;
export declare function concatStreams(readable1: Readable, readable2: Readable): AsyncGenerator<any, void, unknown>;
export declare function read7Bytes(file: string | Buffer): Promise<Buffer>;
export {};
