import { Readable } from "stream";
import { ImageElem, FlashElem } from "./elements";
import { Proto } from "../core/protobuf";
import { Client } from "..";
export type UploadInfo = {
    retcode: number;
    message?: string;
    ip?: string;
    port?: number;
    ukey?: Buffer;
    cmdid: number;
    ticket?: Buffer;
    ext?: any;
};
/** 构造图片file */
export declare function buildImageFileParam(md5: string, sha1?: string, size?: number, width?: number, height?: number, type?: number): string;
/** 从图片的file中解析出图片属性参数 */
export declare function parseImageFileParam(file: string): {
    md5: string;
    sha1: string;
    size: number;
    width: number;
    height: number;
    ext: string;
};
export declare class Image {
    private dm;
    private cachedir?;
    protected client: Client;
    /** 用于上传的文件流 */
    readable?: Readable;
    /** 实例化后必须等待此异步任务完成后才能上传图片 */
    task: Promise<void>;
    /** 最终用于发送的对象 */
    private _proto;
    private _uploadInfo?;
    private _fid?;
    set proto(proto: {
        [tag: number]: any;
    });
    get proto(): {
        [tag: number]: any;
    };
    get uploadInfo(): UploadInfo | undefined;
    /** 从服务端拿到fid后必须设置此值，否则图裂 */
    set fid(val: any);
    get fid(): any;
    /** 图片属性 */
    elem_type: string;
    md5: Buffer;
    sha1: Buffer;
    sha1Stream: Buffer[];
    size: number;
    width: number;
    height: number;
    type: number;
    origin?: boolean;
    asface?: boolean;
    summary?: string;
    nt: boolean;
    fileid?: string;
    uploaded: boolean;
    /** 缓存文件路径 */
    private cachefile?;
    /** 临时文件路径 */
    private tmpfile?;
    /**
     * @param elem
     * @param cachedir
     @param dm 是否私聊图片 */
    constructor(client: Client, elem: ImageElem | FlashElem, dm?: boolean, cachedir?: string | undefined);
    setUrl(url: string): Promise<void>;
    get name(): string;
    private setProperties;
    private parseFileParam;
    private fromProbeSync;
    private fromReadable;
    private fromWeb;
    private fromLocal;
    setUploadResp(resp: Proto): this;
    private setProto;
    /** 服务端图片失效时建议调用此函数 */
    deleteCacheFile(): void;
    /** 图片上传完成后建议调用此函数(文件存在系统临时目录中) */
    deleteTmpFile(): void;
}
