"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildShare = buildShare;
var app;
(function (app) {
    app[app["qqMusic"] = 100497308] = "qqMusic";
    app[app["qqBrowser"] = 100446242] = "qqBrowser";
    app[app["kuwoMusic"] = 100243533] = "kuwoMusic";
    app[app["muguMusic"] = 1101053067] = "muguMusic";
    app[app["kugouMusic"] = 205141] = "kugouMusic";
    app[app["neteaseMusic"] = 100495085] = "neteaseMusic";
})(app || (app = {}));
const appConfig = {
    [app.qqMusic]: {
        appid: app.qqMusic,
        appname: "com.tencent.qqmusic",
        appsign: "cbd27cd7c861227d013a25b2d10f0799"
    },
    [app.qqBrowser]: {
        appid: app.qqBrowser,
        appname: "com.tencent.mtt",
        appsign: "d8391a394d4a179e6fe7bdb8a301258b"
    },
    [app.kuwoMusic]: {
        appid: app.kuwoMusic,
        appname: "cn.kuwo.player",
        appsign: "bf9ff4ffb4c558a34ee3fd52c223ebf5"
    },
    [app.muguMusic]: {
        appid: app.muguMusic,
        appname: "cmccwm.mobilemusic",
        appsign: "6cdc72a439cef99a3418d2a78aa28c73"
    },
    [app.kugouMusic]: {
        appid: app.kugouMusic,
        appname: "com.kugou.android",
        appsign: "fe4a24d80fcf253a00676a808f62c2c6"
    },
    [app.neteaseMusic]: {
        appid: app.neteaseMusic,
        appname: "com.netease.cloudmusic",
        appsign: "da6b069da1e2982db3e386233f68d76d"
    }
};
function buildShare(target, bu, content, config) {
    if (content.config)
        config = content.config;
    if (!config?.appsign && config?.appid)
        config = appConfig[config.appid] || config;
    if (!config?.appid)
        config = content.audio ? appConfig[app.qqMusic] : appConfig[app.qqBrowser];
    const cmd = ([app.qqBrowser, 102021671].includes(config.appid) && !content.audio) ? "OidbSvc.0xdc2_34" : "OidbSvc.0xb77_9";
    const body = {
        1: config.appid,
        2: 1,
        3: content.audio ? 4 : 0,
        5: {
            1: config.appsign ? 1 : 2,
            2: "0.0.0",
            ...(config.appsign ? {
                3: config.appname,
                4: config.appsign
            } : {})
        },
        10: typeof bu === "string" ? 3 : bu,
        11: target,
        12: {
            ...(cmd === "OidbSvc.0xdc2_34" ? { 1: 1 } : {}),
            10: content.title,
            11: content.summary || "",
            12: content.content,
            13: content.url,
            14: content.image,
            16: content.audio
        },
        19: typeof bu === "string" ? Number(bu) : undefined,
    };
    return {
        cmd,
        body: cmd === "OidbSvc.0xdc2_34" ? {
            1: body,
            2: {
                1: body[10],
                2: body[11],
                5: body[19],
            }
        } : body
    };
}
