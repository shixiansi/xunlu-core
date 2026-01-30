type Client = import("../client").Client;
type OnlinePushEvent = {
    sub_type: string;
    [k: string]: any;
};
export declare function emitGroupNoticeEvent(c: Client, gid: number, e: OnlinePushEvent | void): void;
export declare function onlinePushListener(this: Client, payload: Buffer, seq: number): void;
export declare function onlinePushTransListener(this: Client, payload: Buffer, seq: number): void;
export declare function ntMsgListener(this: Client, payload: Buffer, seq: number): void | Promise<void>;
export declare function dmMsgSyncListener(this: Client, payload: Buffer, seq: number): void;
export declare function groupMsgListener(this: Client, payload: Buffer, seq: number, nt?: boolean): void;
export declare function discussMsgListener(this: Client, payload: Buffer, seq: number): void;
export declare function syncPushListener(this: Client, payload: Buffer): void;
export declare function pushNotify(this: Client, type: number): Promise<void>;
export {};
