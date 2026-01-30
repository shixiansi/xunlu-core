export default class Reader {
    constructor(data) {
        this.offset = 0;
        if (typeof data === "string") {
            this.buffer = Buffer.from(data);
        }
        else {
            this.buffer = Buffer.from(data);
        }
    }
    readU8() {
        const value = this.buffer.readUInt8(this.offset);
        this.offset += 1;
        return value;
    }
    readU16() {
        const value = this.buffer.readUInt16BE(this.offset);
        this.offset += 2;
        return value;
    }
    readU32() {
        const value = this.buffer.readUInt32BE(this.offset);
        this.offset += 4;
        return value;
    }
    read32() {
        const value = this.buffer.readInt32BE(this.offset);
        this.offset += 4;
        return value;
    }
    readU64() {
        const value = this.buffer.readBigUInt64BE(this.offset);
        this.offset += 8;
        return value;
    }
    readBytes(length) {
        const value = this.buffer.slice(this.offset, this.offset + length);
        this.offset += length;
        return value;
    }
    readWithLength() {
        const length = this.readU32() - 4;
        return this.readBytes(length);
    }
    readTlv() {
        const length = this.readU16();
        return this.readBytes(length);
    }
    remaining() {
        return this.buffer.length - this.offset;
    }
}
