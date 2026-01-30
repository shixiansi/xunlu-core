"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Channel = exports.ChannelType = exports.NotifyType = void 0;
const crypto_1 = require("crypto");
const core_1 = require("./core");
const constants_1 = require("./core/constants");
const message_1 = require("./message");
const share_1 = require("./message/share");
const errors_1 = require("./errors");
/** 通知类型 */
var NotifyType;
(function (NotifyType) {
    /** 未知类型 */
    NotifyType[NotifyType["Unknown"] = 0] = "Unknown";
    /** 所有消息 */
    NotifyType[NotifyType["AllMessages"] = 1] = "AllMessages";
    /** 不通知 */
    NotifyType[NotifyType["Nothing"] = 2] = "Nothing";
})(NotifyType || (exports.NotifyType = NotifyType = {}));
/** 子频道类型 */
var ChannelType;
(function (ChannelType) {
    /** 未知类型 */
    ChannelType[ChannelType["Unknown"] = 0] = "Unknown";
    /** 文字频道 */
    ChannelType[ChannelType["Text"] = 1] = "Text";
    /** 语音频道 */
    ChannelType[ChannelType["Voice"] = 2] = "Voice";
    /** 直播频道 */
    ChannelType[ChannelType["Live"] = 5] = "Live";
    /** @todo 未知类型 */
    ChannelType[ChannelType["App"] = 6] = "App";
    /** 论坛频道 */
    ChannelType[ChannelType["Forum"] = 7] = "Forum";
})(ChannelType || (exports.ChannelType = ChannelType = {}));
/** 子频道 */
class Channel {
    constructor(guild, channel_id) {
        this.guild = guild;
        this.channel_id = channel_id;
        /** 子频道名 */
        this.channel_name = "";
        /** 频道类型 */
        this.channel_type = ChannelType.Unknown;
        /** 通知类型 */
        this.notify_type = NotifyType.Unknown;
        (0, constants_1.lock)(this, "guild");
        (0, constants_1.lock)(this, "channel_id");
    }
    get c() {
        return this.guild.c;
    }
    _renew(channel_name, notify_type, channel_type) {
        this.channel_name = channel_name;
        this.notify_type = notify_type;
        this.channel_type = channel_type;
    }
    /** 发送互联分享 */
    async share(content, config) {
        const request = (0, share_1.buildShare)(this.channel_id, this.guild.guild_id, content, config);
        const resp = core_1.pb.decode(await this.c.sendOidb(request.cmd, core_1.pb.encode(request.body)));
        if (resp[3] !== 0)
            (0, errors_1.drop)(resp[3], String(resp[4]?.[1] || resp[4] || ""));
    }
    /**
     * 发送频道消息
     * 暂时仅支持发送： 文本、AT、表情
     */
    async sendMsg(content) {
        const { rich, brief } = new message_1.Converter(this.c, content);
        const payload = await this.c.sendUni("MsgProxy.SendMsg", core_1.pb.encode({
            1: {
                1: {
                    1: {
                        1: BigInt(this.guild.guild_id),
                        2: Number(this.channel_id),
                        3: this.c.uin,
                        4: BigInt(this.c.tiny_id),
                        7: 0,
                    },
                    2: {
                        1: 3840,
                        3: (0, crypto_1.randomBytes)(4).readUInt32BE(),
                    },
                },
                3: {
                    1: rich,
                },
            },
        }));
        const rsp = core_1.pb.decode(payload);
        if (rsp?.[6]?.[1] !== 3) {
            throw new core_1.ApiRejection(rsp[6][2] || -70, rsp[6][3] || "频道消息发送失败，可能被风控");
        }
        this.c.logger.info(`succeed to send: [Guild(${this.guild.guild_name}),Channel(${this.channel_name})] ` +
            brief);
        this.c.stat.sent_msg_cnt++;
        return {
            seq: rsp[4][2][4],
            rand: rsp[4][2][3],
            time: rsp[4][2][6],
        };
    }
    /** 撤回频道消息 */
    async recallMsg(seq) {
        const body = core_1.pb.encode({
            1: BigInt(this.guild.guild_id),
            2: Number(this.channel_id),
            3: Number(seq),
        });
        await this.c.sendOidbSvcTrpcTcp("OidbSvcTrpcTcp.0xf5e_1", body);
        return true;
    }
}
exports.Channel = Channel;
