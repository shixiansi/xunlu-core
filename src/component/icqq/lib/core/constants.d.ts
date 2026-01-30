import { BinaryLike } from "crypto";
import * as zlib from "zlib";
import * as stream from "stream";
import { BaseClient } from "./base-client";
import { Readable } from "stream";
export declare function hrtimeToMs(time: [number, number]): number;
/** 一个0长buf */
export declare const BUF0: Buffer;
/** 4个0的buf */
export declare const BUF4: Buffer;
/** 16个0的buf */
export declare const BUF16: Buffer;
/** no operation */
export declare const NOOP: () => void;
/** promisified unzip */
export declare const unzip: typeof zlib.unzip.__promisify__;
/** promisified gzip */
export declare const gzip: typeof zlib.gzip.__promisify__;
/** promisified pipeline */
export declare const pipeline: typeof stream.pipeline.__promisify__;
/** md5 hash */
export declare const md5: (data: BinaryLike) => Buffer;
/** sha hash */
export declare const sha: (data: BinaryLike) => Buffer;
export declare const randomString: (n: number, template?: string) => string;
/** sha256 hash */
export declare const sha256: (data: BinaryLike) => Buffer;
export declare const calculateSha1StreamBytes: (readable: stream.Readable) => Promise<Buffer[]>;
export declare const randomInt: (min?: number, max?: number) => number;
export declare const aesGcmEncrypt: (data: BinaryLike, key: BinaryLike) => Buffer;
export declare const aesGcmDecrypt: (data: Buffer, key: BinaryLike) => Buffer;
export declare function formatTime(value: Date | number | string, template?: string): string;
/** unix timestamp (second) */
export declare const timestamp: () => number;
/** 数字ip转通用ip */
export declare function int32ip2str(ip: number | string): string;
/** 隐藏并锁定一个属性 */
export declare function lock(obj: any, prop: string): void;
export declare function unlock(obj: any, prop: string): void;
/** 隐藏一个属性 */
export declare function hide(obj: any, prop: string): void;
export declare function readTlv(r: Readable): {
    [tag: number]: Buffer;
};
export declare function calcPoW(this: BaseClient, data: any): Buffer;
export declare class Sha1Stream {
    readonly Sha1BlockSize = 64;
    readonly Sha1DigestSize = 20;
    private readonly _padding;
    private readonly _state;
    private readonly _count;
    private readonly _buffer;
    private readonly _w;
    constructor();
    private reset;
    private rotateLeft;
    private transform;
    update(data: Buffer, len?: number): void;
    hash(bigEndian?: boolean): Buffer;
    final(): Buffer;
}
export declare class CalculateStreamBytesTransform extends stream.Transform {
    private readonly blockSize;
    private readonly sha1;
    private buffer;
    private bytesRead;
    private readonly byteArrayList;
    constructor();
    _transform(chunk: Buffer, _: BufferEncoding, callback: stream.TransformCallback): void;
    _flush(callback: stream.TransformCallback): void;
}
export interface TrpcRsp {
    ret: number;
    func_ret: number;
    error_msg: string;
}
export declare function parseTrpcRsp(reserve: Buffer): TrpcRsp | null;
export declare const calcBkn: (skey: String | Buffer) => number;
