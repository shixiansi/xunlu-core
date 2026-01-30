import { Readable } from "stream";
import { PttElem } from "./elements";
import { Proto } from "../core/protobuf";
import { Client } from "..";
import { UploadInfo } from "./image";
export declare class Ptt {
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
    get name(): string;
    /** 语音属性 */
    elem_type: string;
    file: string;
    md5: Buffer;
    sha1: Buffer;
    sha1Stream: Buffer[];
    size: number;
    brief: string;
    seconds?: number;
    head: Buffer;
    codec: number;
    transcode: boolean;
    nt: boolean;
    fileid?: string;
    uploaded: boolean;
    temp: boolean;
    /**
     * @param elem
     * @param cachedir
     @param dm 是否私聊 */
    constructor(client: Client, elem: PttElem, dm?: boolean);
    private fromLocal;
    setUploadResp(resp: Proto): this;
    private setProto;
    deleteTmpFile(): void;
}
