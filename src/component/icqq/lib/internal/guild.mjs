import { pb } from "../core/index.mjs";
import { lock } from "../common.mjs";
import { parse } from "../message/index.mjs";
/** 频道消息事件 */
export class GuildMessageEvent {
    constructor(client, proto) {
        this.post_type = "message";
        this.detail_type = "guild";
        const head1 = proto[1][1][1];
        const head2 = proto[1][1][2];
        if (![3840, 3841].includes(head2[1])) {
            throw new Error("unsupport guild message type");
        }
        this.is_delete = head2[1] === 3841;
        const body = proto[1][3];
        const extra = proto[1][4];
        this.guild_id = String(head1[1]);
        this.channel_id = String(head1[2]);
        this.guild_name = String(extra[2]);
        this.channel_name = String(extra[3]);
        this.sender = {
            tiny_id: String(head1[4]),
            nickname: String(extra[1]),
        };
        this.seq = head2[4];
        this.rand = head2[3];
        this.time = head2[6];
        const parsed = parse(client, body[1]);
        this.message = parsed.message;
        this.raw_message = parsed.brief;
        lock(this, "proto");
    }
}
export function guildMsgListener(payload) {
    try {
        var msg = new GuildMessageEvent(this, pb.decode(payload));
    }
    catch (e) {
        return;
    }
    if (msg.sender.tiny_id === this.tiny_id && this.config.ignore_self)
        return;
    this.stat.recv_msg_cnt++;
    this.logger.info(`recv from: [Guild: ${msg.guild_name}, Member: ${msg.sender.nickname}]` + msg.raw_message);
    msg.reply = (content) => {
        return this.sendGuildMsg(msg.guild_id, msg.channel_id, content);
    };
    const event_name = msg.is_delete ? `recall.guild.forum` : `message.guild.forum`;
    this.em(event_name, msg);
}
