export default class Ecdh {
    private ecdh;
    public_key: Buffer;
    share_key: Buffer;
    nt_share_key: Buffer;
    ntExchange(bobPublic: Buffer): Buffer;
}
