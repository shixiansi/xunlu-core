export interface Encodable {
    [tag: number]: any;
}
export declare class Proto implements Encodable {
    private encoded;
    [tag: number]: any;
    get length(): number;
    constructor(encoded: Buffer, decoded?: Proto);
    checkTag(...tags: number[]): boolean;
    toString(): string;
    toHex(): string;
    toBase64(): string;
    toBuffer(): Buffer;
    toJSONString(replacer?: ((this: any, key: string, value: any) => any) | undefined, space?: string | number | undefined): string;
    toJSON(convertBigInt?: boolean): any;
    [Symbol.toPrimitive](): string;
}
export declare function encode(obj: Encodable): Buffer;
export declare function decode(encoded: Buffer): Proto;
export declare function decodePb(encoded: Buffer | Proto): any;
