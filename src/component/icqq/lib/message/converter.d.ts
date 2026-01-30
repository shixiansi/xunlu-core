import { Image } from "./image";
import { Quotable, JsonElem, Sendable, ShareElem, XmlElem, MultiMsgElem } from "./elements";
import { pb } from "../core";
import { Anonymous } from "./message";
import { Client } from "..";
export interface ConverterExt {
    /** 是否是私聊(default:false) */
    dm?: boolean;
    /** 网络图片缓存路径 */
    cachedir?: string;
    /** 群员列表(用于AT时查询card) */
    mlist?: Map<number, {
        card?: string;
        nickname?: string;
        user_uid?: string;
    }>;
}
/** 将消息元素转换为protobuf */
export declare class Converter {
    protected client: Client;
    content: Sendable;
    private ext?;
    is_chain: boolean;
    is_longMsg: boolean;
    elems: pb.Encodable[];
    /** 用于最终发送 */
    rich: pb.Encodable;
    /** 长度(字符) */
    length: number;
    /** 包含的图片(可能需要上传) */
    imgs: Image[];
    /** 预览文字 */
    briefs: string[];
    get brief(): string;
    /** 分片后 */
    private fragments;
    constructor(client: Client, content: Sendable, ext?: ConverterExt | undefined);
    private _convert;
    private long_msg;
    private _text;
    private text;
    private at;
    private face;
    private sface;
    private bface;
    private dice;
    private rps;
    private image;
    private flash;
    private record;
    private video;
    private bubble;
    private location;
    private node;
    private share;
    private json;
    private xml;
    private poke;
    private markdown;
    private button;
    private forum;
    private mirai;
    private file;
    private reply;
    private multimsg;
    /** 转换为分片消息 */
    toFragments(): Uint8Array[];
    private _divideText;
    private _pushFragment;
    /** 匿名化 */
    anonymize(anon: Omit<Anonymous, "flag">): void;
    /** 引用回复 */
    quote(source: Quotable): void;
}
export declare function createMultiMsgJson(elem: MultiMsgElem): {
    app: string;
    config: {
        autosize: number;
        forward: number;
        round: number;
        type: string;
        width: number;
    };
    desc: string;
    extra: string;
    meta: {
        detail: {
            news: {
                text: string;
            }[];
            resid: string;
            source: string;
            summary: string;
            uniseq: string;
        };
    };
    prompt: string;
    ver: string;
    view: string;
};
export declare function parseMultiMsg(elem: JsonElem | XmlElem): MultiMsgElem | null;
export declare function parseShareMsg(elem: JsonElem): ShareElem | null;
