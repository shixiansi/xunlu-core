import { Readable } from "stream";
import { BubbleElem, VideoElem } from "./elements";
import { Proto } from "../core/protobuf";
import { Client, Image } from "../";
import { UploadInfo } from "./image";
export declare class Video {
    private dm;
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
    set fid(val: any);
    get fid(): any;
    /** 视频属性 */
    elem_type: string;
    md5: Buffer;
    sha1: Buffer;
    sha1Stream: Buffer[];
    width: number;
    height: number;
    seconds: number;
    thumbInfo: Image;
    videoInfo: {
        md5: Buffer;
        sha1: Buffer;
        size: number;
        file: string;
        name: string;
    };
    nt: boolean;
    fileid?: string;
    uploaded: boolean;
    temp: boolean;
    /**
     * @param elem
     * @param cachedir
     @param dm 是否私聊 */
    constructor(client: Client, elem: VideoElem | BubbleElem, dm?: boolean);
    private fromLocal;
    setUploadResp(resp: Proto): this;
    private setProto;
    deleteTmpFile(): void;
    deleteThumbTmpFile(): void;
}
