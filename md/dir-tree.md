.
├─ bin/
│  ├─ xunlu-dev.js
│  ├─ xunlu.js
│  └─ xunlubot.js
├─ config/
│  ├─ config/
│  │  ├─ pm2/
│  │  │  └─ pm2.json
│  │  ├─ ai.config.yaml
│  │  ├─ bot.config.yaml
│  │  ├─ onebot.config.yaml
│  │  └─ redis.config.yaml
│  └─ default_config/
│     ├─ pm2/
│     │  └─ pm2.json
│     ├─ ai.config.yaml
│     ├─ bot.config.yaml
│     ├─ onebot.config.yaml
│     └─ redis.config.yaml
├─ md/
│  ├─ api.md
│  ├─ dir-tree.md
│  ├─ event.md
│  └─ message.md
├─ resources/
│  ├─ font/
│  │  └─ zh-cn.ttf
│  └─ html/
│     └─ common/
│        ├─ common.css
│        ├─ default.html
│        └─ index.html
├─ src/
│  ├─ Bot/
│  │  ├─ icqq/
│  │  │  ├─ Event/
│  │  │  │  ├─ message.js
│  │  │  │  ├─ notice.js
│  │  │  │  └─ request.js
│  │  │  ├─ EventListener.js
│  │  │  ├─ index.js
│  │  │  └─ pluginLoader.js
│  │  ├─ llonebot/
│  │  │  ├─ event/
│  │  │  │  └─ index.js
│  │  │  ├─ index.js
│  │  │  ├─ milky-adapter.js
│  │  │  └─ t.js
│  │  ├─ message/
│  │  │  ├─ cli-simulator.js
│  │  │  ├─ context.js
│  │  │  ├─ message-converters.js
│  │  │  ├─ test.js
│  │  │  └─ universal-message.js
│  │  ├─ onebotV11/
│  │  │  ├─ event/
│  │  │  │  └─ index.js
│  │  │  ├─ index.js
│  │  │  └─ onebot.js
│  │  ├─ index.js
│  │  ├─ segment_bk.js
│  │  └─ segment.js
│  ├─ component/
│  │  ├─ ffmpeg/
│  │  │  └─ ffmpeg.js
│  │  ├─ logger/
│  │  │  └─ log.js
│  │  ├─ puppeteer/
│  │  │  ├─ puppeteer_bk.js
│  │  │  └─ puppeteer.js
│  │  ├─ redis/
│  │  │  └─ redis.js
│  │  ├─ render/
│  │  │  └─ t/
│  │  │     ├─ index.js
│  │  │     ├─ test.js
│  │  │     ├─ toImage.js
│  │  │     ├─ toReactElement.js
│  │  │     └─ toSvg.js
│  │  └─ sqlite/
│  │     └─ sqlite.js
│  ├─ db/
│  │  ├─ base/
│  │  │  └─ BaseModel.js
│  │  └─ MessageDB.js
│  ├─ lib/
│  │  ├─ renderer/
│  │  │  └─ Renderer.js
│  │  ├─ config.js
│  │  ├─ controlServer.js
│  │  ├─ env.js
│  │  ├─ path.js
│  │  ├─ pluginLoader.js
│  │  └─ server.js
│  ├─ plugins/
│  │  ├─ ai/
│  │  │  ├─ controllers/
│  │  │  │  └─ handlers.js
│  │  │  ├─ model/
│  │  │  │  └─ message.js
│  │  │  ├─ resources/
│  │  │  │  └─ CharacterDesign/
│  │  │  │     ├─ 爱丽丝.txt
│  │  │  │     ├─ 波奇酱.txt
│  │  │  │     ├─ 丛雨.txt
│  │  │  │     ├─ 加藤惠.txt
│  │  │  │     ├─ 可莉.txt
│  │  │  │     ├─ 蕾姆.txt
│  │  │  │     ├─ 流萤.txt
│  │  │  │     └─ 苏幼晴.txt
│  │  │  ├─ services/
│  │  │  │  └─ caimiao.js
│  │  │  └─ index.js
│  │  ├─ bilibili/
│  │  │  ├─ controllers/
│  │  │  │  └─ handlers.js
│  │  │  ├─ model/
│  │  │  │  ├─ biliutils/
│  │  │  │  │  ├─ Bcookie.js
│  │  │  │  │  ├─ bili_ticket.cjs
│  │  │  │  │  └─ Bwbi.cjs
│  │  │  │  ├─ Bapi.js
│  │  │  │  ├─ BErrorCode.js
│  │  │  │  ├─ Bilili.js
│  │  │  │  ├─ Blogin.js
│  │  │  │  ├─ dealBigJson.js
│  │  │  │  └─ dynamic.js
│  │  │  ├─ resources/
│  │  │  │  ├─ html/
│  │  │  │  │  └─ bilibili/
│  │  │  │  ├─ image/
│  │  │  │  └─ video/
│  │  │  │     ├─ BV14jf7BrEWj.mp4
│  │  │  │     ├─ BV1uSPvzrENM.mp4
│  │  │  │     ├─ BV1vxcyzTEJz.mp4
│  │  │  │     ├─ source_BV14jf7BrEWj.mp3
│  │  │  │     ├─ source_BV14jf7BrEWj.mp4
│  │  │  │     ├─ source_BV1uSPvzrENM.mp3
│  │  │  │     ├─ source_BV1uSPvzrENM.mp4
│  │  │  │     ├─ source_BV1vxcyzTEJz.mp3
│  │  │  │     └─ source_BV1vxcyzTEJz.mp4
│  │  │  └─ index.js
│  │  ├─ chuo/
│  │  │  ├─ controllers/
│  │  │  │  └─ handlers.js
│  │  │  └─ index.js
│  │  ├─ diaoyu/
│  │  │  ├─ controllers/
│  │  │  │  └─ handlers.js
│  │  │  ├─ model/
│  │  │  │  ├─ fishing.js
│  │  │  │  ├─ shop.js
│  │  │  │  └─ store.js
│  │  │  └─ index.js
│  │  ├─ example-plugin/
│  │  │  ├─ controllers/
│  │  │  │  └─ handlers.js
│  │  │  ├─ routes/
│  │  │  │  └─ index.js
│  │  │  └─ index.js
│  │  ├─ fudu-ban/
│  │  │  ├─ controllers/
│  │  │  │  └─ handlers.js
│  │  │  ├─ model/
│  │  │  │  ├─ mute.js
│  │  │  │  └─ store.js
│  │  │  └─ index.js
│  │  ├─ group/
│  │  │  ├─ controllers/
│  │  │  │  └─ handlers.js
│  │  │  ├─ model/
│  │  │  │  └─ rkeyManager.js
│  │  │  ├─ routes/
│  │  │  │  └─ index.js
│  │  │  └─ index.js
│  │  ├─ other/
│  │  │  ├─ controllers/
│  │  │  │  └─ handlers.js
│  │  │  ├─ routes/
│  │  │  │  └─ index.js
│  │  │  └─ index.js
│  │  ├─ pixiv/
│  │  │  ├─ controllers/
│  │  │  │  └─ handlers.js
│  │  │  ├─ model/
│  │  │  │  ├─ 3.jpg
│  │  │  │  └─ phantomtank.js
│  │  │  ├─ routes/
│  │  │  │  └─ index.js
│  │  │  └─ index.js
│  │  ├─ set/
│  │  │  ├─ controllers/
│  │  │  │  └─ handlers.js
│  │  │  ├─ routes/
│  │  │  │  └─ index.js
│  │  │  └─ index.js
│  │  ├─ tts/
│  │  │  ├─ controllers/
│  │  │  │  └─ handlers.js
│  │  │  ├─ resources/
│  │  │  │  ├─ audio/
│  │  │  │  │  └─ 原神-中文-可莉_ZH-你是个几把.mp3
│  │  │  │  ├─ html/
│  │  │  │  │  ├─ tts/
│  │  │  │  │  └─ tts.jsx
│  │  │  │  ├─ img/
│  │  │  │  │  └─ bg/
│  │  │  │  ├─ category.json
│  │  │  │  └─ hobbyist.json
│  │  │  ├─ services/
│  │  │  │  └─ hobbyist.js
│  │  │  └─ index.js
│  │  └─ update/
│  │     ├─ controllers/
│  │     │  └─ handlers.js
│  │     ├─ routes/
│  │     │  └─ index.js
│  │     └─ index.js
│  ├─ utils/
│  │  ├─ download.js
│  │  ├─ Filemage.js
│  │  ├─ imgdisplay.js
│  │  ├─ index.js
│  │  ├─ render.js
│  │  ├─ timer.js
│  │  └─ YamlReader.js
│  └─ index.js
├─ .gitignore
├─ .nvmrc
├─ AGENTS.md
├─ index.js
├─ LICENSE
├─ package.json
├─ pnpm-lock.yaml
└─ README.md