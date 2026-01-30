import { Readable } from "stream";
import { FileElem } from "./elements";
import { Proto } from "../core/protobuf";
import { Client } from "..";
import { UploadInfo } from "./image";
export declare class File {
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
    private _busid;
    get elem(): {
        type: string;
        file: string;
        name: string;
    };
    get proto(): {
        [tag: number]: any;
    };
    get uploadInfo(): UploadInfo | undefined;
    set fid(val: any);
    set busid(val: any);
    get fid(): any;
    get busid(): any;
    /** 文件属性 */
    elem_type: string;
    file: string;
    name: string;
    md5: Buffer;
    sha1: Buffer;
    sha1Stream: Buffer[];
    size: number;
    brief: string;
    nt: boolean;
    fileid?: string;
    uploaded: boolean;
    temp: boolean;
    /**
     * @param elem
     * @param cachedir
     @param dm 是否私聊 */
    constructor(client: Client, elem: FileElem, dm?: boolean);
    private fromLocal;
    setUploadResp(resp: Proto): this;
    private setProto;
    deleteTmpFile(): void;
}
