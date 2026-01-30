export default class Reader {
    private offset;
    private buffer;
    constructor(data: Buffer | Uint8Array | string);
    readU8(): number;
    readU16(): number;
    readU32(): number;
    read32(): number;
    readU64(): bigint;
    readBytes(length: number): Buffer;
    readWithLength(): Buffer;
    readTlv(): Buffer;
    remaining(): number;
}
