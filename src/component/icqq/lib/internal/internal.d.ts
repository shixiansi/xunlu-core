import { pb, RkeyInfo } from "../core";
import { OnlineStatus, StatusInfo } from "../common";
import { Image } from "../message";
import { Proto } from "../core/protobuf";
type Client = import("../client").Client;
export declare function getStatus(this: Client): Promise<OnlineStatus>;
export declare function getStatusInfo(this: Client, uin?: number, usejce?: boolean): Promise<StatusInfo | null>;
export declare function setStatus(this: Client, status: OnlineStatus): Promise<unknown>;
/**
 * 设置个性签名
 * @deprecated 请使用 setPersonalSign
 * @param sign {string} 签名
 */
export declare function setSign(this: Client, sign: string): Promise<boolean>;
/**
 * 设置个性签名
 * @param sign {string} 签名
 */
export declare function setPersonalSign(this: Client, sign: string): Promise<boolean>;
/**
 * 获取用户资料
 * @param uin_uid {number | string} 用户uin或uid
 * @param [idsParse]
 * @example
 * getUserProfile.call(client, 123456, { 20002: { key: "nickname", parse: (val: any) => val?.toString ? val.toString() : val } })
 */
export declare function getUserProfile(this: Client, uin_uid: number | string, idsParse?: Record<number, {
    key: string;
    parse: (val: any, proto?: Proto) => any;
}>): Promise<Record<string, any>>;
export declare function uid2uins(this: Client, uids: string[], group_id?: number): Promise<number[]>;
export declare function uid2uin(this: Client, uid: string, group_id?: number): Promise<number>;
export declare function uin2uids(this: Client, uins: number[], group_id?: number): Promise<string[]>;
export declare function uin2uid(this: Client, uin: number, group_id?: number): Promise<string>;
export declare function refreshBigDataSession(this: Client): Promise<void>;
export declare function setAvatar(this: Client, img: Image): Promise<void>;
export declare function getStamp(this: Client, no_cache?: boolean): Promise<string[]>;
export declare function delStamp(this: Client, id: string | string[]): Promise<void>;
export declare function addClass(this: Client, name: string): Promise<void>;
export declare function delClass(this: Client, id: number): Promise<void>;
export declare function renameClass(this: Client, id: number, name: string): Promise<void>;
export declare function _loadFL(this: Client): Promise<void>;
export declare function loadFL(this: Client): Promise<void>;
export declare function loadSL(this: Client): Promise<void>;
export declare function loadGPL(this: Client): Promise<void>;
export declare function loadGL(this: Client): Promise<void>;
export declare function _loadBL(this: Client): Promise<void>;
export declare function loadBL(this: Client): Promise<void>;
export declare class OcrResult {
    language: string;
    wordslist: Array<{
        words: string;
        confidence: number;
        polygon: Array<{
            x: number;
            y: number;
        }>;
    }>;
    constructor(proto: pb.Proto);
    toString(): string;
}
export declare function imageOcr(this: Client, img: Image): Promise<OcrResult>;
export declare function refreshNTPicRkey(this: Client, force?: boolean): Promise<{
    [type: number]: RkeyInfo;
}>;
export declare function getPSkey(this: Client, domains: string | string[]): Promise<{
    domain: string;
    p_skey: string;
    expire_time: number;
    g_tk: number;
    uskey?: string;
    expire_time_uskey?: number;
}[]>;
export declare function getClientKey(this: Client): Promise<{
    client_key: string;
    expire_time: number;
}>;
export {};
