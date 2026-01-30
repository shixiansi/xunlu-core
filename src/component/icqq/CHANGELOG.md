# Changelog

## [1.10.18](https://github.com/icqqjs/icqq/compare/v1.10.17...v1.10.18) (2025-12-12)


### Bug Fixes

* (client)跳过QQNT环境下的消息同步处理 ([832ed5b](https://github.com/icqqjs/icqq/commit/832ed5b44ca02e707ee4872bf39b2f3506452e05))
* (device)扩展 `Apk` 类型定义，增加 `nt_login` 属性以支持 NT 登录判断、为移动端 APK 配置添加新版本 A9.2.50 并完善字段信息 ([81f6ef8](https://github.com/icqqjs/icqq/commit/81f6ef8a15b2ff5b9eb076d970259128947f98e1))

## [1.10.17](https://github.com/icqqjs/icqq/compare/v1.10.16...v1.10.17) (2025-12-02)


### Bug Fixes

* (contactable)修复语音消息URL获取逻辑 ([d3e3fb1](https://github.com/icqqjs/icqq/commit/d3e3fb196c99a10f957829d08ad08c800a1a95ea))
* (core)处理SSO解析中的空值和错误码分支 ([778a5d8](https://github.com/icqqjs/icqq/commit/778a5d86e5e8d0d45d9737041fb7dc55b095183a))

## [1.10.16](https://github.com/icqqjs/icqq/compare/v1.10.15...v1.10.16) (2025-11-27)


### Bug Fixes

* (client)新增 `client_key` 属性的 getter 方法、新增 `getClientKey` 方法，通过 OIDB 协议获取 client_key 和过期时间、为 `getPSkey` 方法增强类型定义，明确返回字段类型 ([6826dfa](https://github.com/icqqjs/icqq/commit/6826dfaf694320bfc40de05cbdf0af9def8a9d04))
* (client)新增 g_tk 属性支持多域名 bkn 计算、优化 cookie 生成逻辑，支持 uid 和更完整的字段拼接、修复 cookie 中 uin 格式补齐问题、引入 calcBkn 函数统一计算 bkn 值 ([1de90c7](https://github.com/icqqjs/icqq/commit/1de90c797bcc93b2118183a25ee3b64cde439be7))
* (client)新增 skey getter 方法返回skey 字符串值 ([5f714a6](https://github.com/icqqjs/icqq/commit/5f714a67b04354a868346ca55636b5b4ae0f2c11))
* (client)新增获取PSkey功能（在client中导入并暴露getPSkey方法） ([ed872c6](https://github.com/icqqjs/icqq/commit/ed872c658a4661bea2305349d520c947a3e0635b))
* 注释掉原有的本地T544获取方法调用 ([e0b3aef](https://github.com/icqqjs/icqq/commit/e0b3aeff1c98d3a358d4d871f96cd46dcd001d70))

## [1.10.15](https://github.com/icqqjs/icqq/compare/v1.10.14...v1.10.15) (2025-11-26)


### Bug Fixes

* (encryption)crcData ([83e038e](https://github.com/icqqjs/icqq/commit/83e038e712ce293b6bb4e941b9cbba12377fe9b7))

## [1.10.14](https://github.com/icqqjs/icqq/compare/v1.10.13...v1.10.14) (2025-11-26)


### Bug Fixes

* (device)添加QQ9.2.35.32150版本信息 ([5c1ccfc](https://github.com/icqqjs/icqq/commit/5c1ccfcf9118705eac453d7260b0f6f0b8b06bb5))
* (message)优化消息转换器中的预览文字处理逻辑、修复 at 消息中重复添加 @ 符号的问题、调整引用回复中预览文字的生成方式，确保格式正确性 ([367c1d0](https://github.com/icqqjs/icqq/commit/367c1d050d6df28d33370ffab17cf9702599110d))
* (message)修复引用回复中的图片处理逻辑 ([da9c0a5](https://github.com/icqqjs/icqq/commit/da9c0a50f68022967c8caebb252adb9788753b8f))
* (message)修复消息ID生成逻辑 ([8357a5c](https://github.com/icqqjs/icqq/commit/8357a5c50613200c07b3469f908083ea74a0c4b6))

## [1.10.13](https://github.com/icqqjs/icqq/compare/v1.10.12...v1.10.13) (2025-11-24)


### Bug Fixes

* (core)优化推送通知处理逻辑 ([407d006](https://github.com/icqqjs/icqq/commit/407d006eba330e4bb606e6b93ee19e35458c02e7))
* (core)优化自定义APK信息读取逻辑 ([ba09cf6](https://github.com/icqqjs/icqq/commit/ba09cf67832b56cc1609fe2026af003bec58b026))
* (core)修复sign长度检查逻辑 ([1d4dbdc](https://github.com/icqqjs/icqq/commit/1d4dbdc4b4bed5b9cb2670205001ed4cccc9fb91))
* (message)更新分享消息构造逻辑以支持新协议格式 ([d32358d](https://github.com/icqqjs/icqq/commit/d32358d67011a6057f2c96bc769518ffe699520a))
* (onlinepush)优化推送逻辑并新增NT同步已读事件 ([cc4107c](https://github.com/icqqjs/icqq/commit/cc4107c07ac073da196c2b95356d28d29555f85d))
* 修复OCR识别 ([4aeb7ca](https://github.com/icqqjs/icqq/commit/4aeb7ca6a5bf13016fd2dcc19ed703c520458397))

## [1.10.12](https://github.com/icqqjs/icqq/compare/v1.10.11...v1.10.12) (2025-11-13)


### Bug Fixes

* (client)优化二维码登录错误处理逻辑 ([f337633](https://github.com/icqqjs/icqq/commit/f337633c79816b8b67a4bfc9a137ed25b25cceb0))
* (protobuf)解决解压缩空缓冲区时的错误 ([e0d4f3e](https://github.com/icqqjs/icqq/commit/e0d4f3e1a549ae2fcec35cc8579ddb42b5e817a9))
* 修复登录响应解析和验证逻辑、更新Platform获取方式 ([398eac8](https://github.com/icqqjs/icqq/commit/398eac862e99db5ecbf3d5bc6a1759b099973abb))

## [1.10.11](https://github.com/icqqjs/icqq/compare/v1.10.10...v1.10.11) (2025-11-10)


### Bug Fixes

* 优化 NT 登录包构建逻辑 ([e57af1d](https://github.com/icqqjs/icqq/commit/e57af1dad56df104b59ee5c6736756a0fdde0b74))
* 优化NT登录包构建逻辑 ([69b7530](https://github.com/icqqjs/icqq/commit/69b75306993d0d1a66361e44e1c44bde557e50b7))
* 修复ECDH密钥交换逻辑 ([ee3f808](https://github.com/icqqjs/icqq/commit/ee3f80843fa79371d8b501c3f4d9fb4d00f65ceb))
* 修复NT登录包构建逻辑 ([e15f113](https://github.com/icqqjs/icqq/commit/e15f1137856611c8c63d3f93b91eea41442eb2a7))
* 增强客户端协议处理与错误解析 ([8cf62aa](https://github.com/icqqjs/icqq/commit/8cf62aa55e53a52203348eb572305a747390007a))
* 处理特定错误码时执行密钥交换 ([53d6a19](https://github.com/icqqjs/icqq/commit/53d6a19fc0be44ded20eb7da9d1d9a9942ed12c4))
* 密钥交换返回值、添加QQ版本信息A9.2.30.1a3e90af ([d16a796](https://github.com/icqqjs/icqq/commit/d16a79666e369a6265028bb5b5f41513139c4f84))
* 调整登录错误处理逻辑 ([35e3fbb](https://github.com/icqqjs/icqq/commit/35e3fbb70f7241aafe2210db969ca2b76b51650a))

## [1.10.10](https://github.com/icqqjs/icqq/compare/v1.10.9...v1.10.10) (2025-11-08)


### Bug Fixes

* 添加 NTLoginErrorCode 枚举并优化登录错误处理 ([0cb661b](https://github.com/icqqjs/icqq/commit/0cb661b4a63b813187edc45cba4eac37e3c2bf20))
* 调整 NTLoginResponse 日志输出位置 ([ee9d4f6](https://github.com/icqqjs/icqq/commit/ee9d4f6d26022e9d94966aae5612182a27438525))
* 调整互联分享配置中appid为必填项 ([1a9c813](https://github.com/icqqjs/icqq/commit/1a9c8136ac497e6f66d9cd0a0a0e3feb8e168678))
* 默认使用NTLogin ([2e72ea2](https://github.com/icqqjs/icqq/commit/2e72ea2080e9a95a93a7cba6a51b3ffb7979f665))

## [1.10.9](https://github.com/icqqjs/icqq/compare/v1.10.8...v1.10.9) (2025-11-03)


### Bug Fixes

* esm ([6ef0a9f](https://github.com/icqqjs/icqq/commit/6ef0a9f46230ebd24884851c55a754e4054e3653))
* esm ([154e9db](https://github.com/icqqjs/icqq/commit/154e9db73b0661cb6416bd7d2dc0d7b7e8503c59))
* remove dep ([dbbd101](https://github.com/icqqjs/icqq/commit/dbbd101e7f382cbc5570501ee585e20110397cad))
* ShareElem 继承 ShareContent 接口 ([7c7b275](https://github.com/icqqjs/icqq/commit/7c7b275d53d6abcd05591cb41e25ed63c802e5f1))
* 优化构建脚本 ([32ffa68](https://github.com/icqqjs/icqq/commit/32ffa6837d3ae0447e04923d19ddadbd9806de6a))
* 优化构建脚本并自动生成 exports 字段 ([dc3c0a6](https://github.com/icqqjs/icqq/commit/dc3c0a696d66d13b5973c7c43363516f7ceaebbc))
* 增强互联分享功能支持音频和多应用配置 ([9ef83c4](https://github.com/icqqjs/icqq/commit/9ef83c4baad6c0c7007bdcc6229cab586c27d053))
* 将 calculateSha1StreamBytes 相关代码整合到 constants 模块中 ([f58fe9b](https://github.com/icqqjs/icqq/commit/f58fe9bb266804f89a56814622a5b5c37909a604))
* 按需引用优化 ([07f827a](https://github.com/icqqjs/icqq/commit/07f827ad58ecc853b37c150931c2ddf38fe4916a))
* 改用脚本构建 ([ed22637](https://github.com/icqqjs/icqq/commit/ed226373af2563a74684c1e93ce4496a4ce019d5))
* 更新包导出配置并调整依赖项 ([28853d3](https://github.com/icqqjs/icqq/commit/28853d3fa58bfd7686ee0ecc20e1e5b026399821))
* 调整 package.json 导出配置并修复 base-client.ts 中读取 package.json 的相对路径问题 ([05aab2f](https://github.com/icqqjs/icqq/commit/05aab2fd93ed4d3224e23f337f06056c8c8a4ddf))
* 重命名合并消息处理函数并添加分享消息解析 ([ac7ae8d](https://github.com/icqqjs/icqq/commit/ac7ae8dea038e9074e82ed98bb5b27937223fb74))

## [1.10.8](https://github.com/icqqjs/icqq/compare/v1.10.7...v1.10.8) (2025-10-29)


### Bug Fixes

* (contactable)优化群成员信息更新逻辑 ([6892428](https://github.com/icqqjs/icqq/commit/689242862d412b643fad11f09590fb1297367403))

## [1.10.7](https://github.com/icqqjs/icqq/compare/v1.10.6...v1.10.7) (2025-10-28)


### Bug Fixes

* 优化群成员信息更新逻辑 ([8615dcb](https://github.com/icqqjs/icqq/commit/8615dcb1fe79dc6a94b5d2dfab6e84a389dcf278))
* 优化群聊、私聊消息历史获取逻辑 ([ab7ce8b](https://github.com/icqqjs/icqq/commit/ab7ce8bafb30740373bb66828a9161f47124cbae))
* 修复群成员列表拉取不全问题、新增获取用户资料功能 ([b20a5b9](https://github.com/icqqjs/icqq/commit/b20a5b91b70a2271f3fe0998f19c1b1c48bbff19))
* 简化获取用户资料的方法并新增状态信息接口 ([660f7bc](https://github.com/icqqjs/icqq/commit/660f7bc058a172bdac22d9b525304c2234b564fa))
* 重构消息处理逻辑以提高兼容性 ([e551bff](https://github.com/icqqjs/icqq/commit/e551bff670d0d97562ae1317298462cb6f62cf7e))

## [1.10.6](https://github.com/icqqjs/icqq/compare/v1.10.5...v1.10.6) (2025-10-28)


### Bug Fixes

* （friend)优化URL解析逻辑 ([41911a9](https://github.com/icqqjs/icqq/commit/41911a95cb544450d5cf5a5d06d2a159d4b9b358))
* (message)修复消息解析中extra字段的访问逻辑 ([ac4a529](https://github.com/icqqjs/icqq/commit/ac4a5290fd704e324535a922846b50fac4207084))
* 优化语音消息转码逻辑 ([8e8417a](https://github.com/icqqjs/icqq/commit/8e8417a0e3124bf7f50d4f39095cd3828cd90fa8))

## [1.10.5](https://github.com/icqqjs/icqq/compare/v1.10.4...v1.10.5) (2025-10-27)


### Bug Fixes

* 修复 decodeCompress 和 decodeBuf 函数的 convertBigInt 参数传递问题 ([c54bf7f](https://github.com/icqqjs/icqq/commit/c54bf7fc7dee9abcf256b61c6ca37dd30fc36236))
* 显示文件名在消息摘要中 ([92263de](https://github.com/icqqjs/icqq/commit/92263de1909ef538a3608eab283a9d893c989b08))
* 重构文件上传与转发功能 ([2b926ed](https://github.com/icqqjs/icqq/commit/2b926ed32b8eddca46bb6757086c7cc0ee8a3a99))

## [1.10.4](https://github.com/icqqjs/icqq/compare/v1.10.3...v1.10.4) (2025-10-25)


### Bug Fixes

* (message)改进消息元素类型定义与支持 ([c740611](https://github.com/icqqjs/icqq/commit/c7406117150c19519fbbc4c5bdc34cc9a81a5d0b))
* (video)修复视频上传逻辑和文件校验问题 ([ddc9f50](https://github.com/icqqjs/icqq/commit/ddc9f505ed3e7cb2e4ec499651ec0ffd33ef5b52))

## [1.10.3](https://github.com/icqqjs/icqq/compare/v1.10.2...v1.10.3) (2025-10-23)


### Bug Fixes

* :优化群成员信息获取逻辑 ([11fef3b](https://github.com/icqqjs/icqq/commit/11fef3bbf3a56f1ddeb07333363c1cca17cc56ef))
* (highway)优化上传逻辑并增强错误处理 ([eeac914](https://github.com/icqqjs/icqq/commit/eeac914c9c13a9c6ce6bf7d13de6289ea9d56b42))
* (NTMedia)群临时消息 ([2230cc9](https://github.com/icqqjs/icqq/commit/2230cc996fb61a6b25272000dff61c01940c3694))
* highway ([92a1233](https://github.com/icqqjs/icqq/commit/92a1233b399084b5e5051ead4ea716245c41c682))
* highway ([b9e4db8](https://github.com/icqqjs/icqq/commit/b9e4db86293b9b0459b1e0dccbca4c090e01df04))
* highway ([d134508](https://github.com/icqqjs/icqq/commit/d1345085c2abaa7a49e7a637c3c9d9c1485dcce2))
* highway ([bb5758d](https://github.com/icqqjs/icqq/commit/bb5758d37aeb7e56e80b9f4c1e6c1f7bf42caba0))
* 添加9.2.27.31300的版本信息 ([4ff84cc](https://github.com/icqqjs/icqq/commit/4ff84cce0dc5e9b3d8ea022d9086d64e65fd0d36))
* 群成员活跃等级 ([da00177](https://github.com/icqqjs/icqq/commit/da00177487097a8020d8f40b87eb54c6007ada0d))

## [1.10.2](https://github.com/icqqjs/icqq/compare/v1.10.1...v1.10.2) (2025-10-20)


### Bug Fixes

* 优化消息解析逻辑 ([e8afcab](https://github.com/icqqjs/icqq/commit/e8afcab203ad95095ec952ebbba9e6c31c27a6b0))
* 修复类型37元素解析逻辑 ([69e7f4a](https://github.com/icqqjs/icqq/commit/69e7f4a1ad62760e6410d9003bfe73eb1be98b40))
* 添加泡泡消息支持 ([0589a8b](https://github.com/icqqjs/icqq/commit/0589a8be29db9fdc61cddaa311f73aca620403e9))

## [1.10.1](https://github.com/icqqjs/icqq/compare/v1.10.0...v1.10.1) (2025-10-20)


### Bug Fixes

* (bigdata)更新会话IP和端口时增加校验逻辑 ([581d781](https://github.com/icqqjs/icqq/commit/581d78106438844eeef23828f5994465bc3240ac))
* 优化网络错误处理逻辑 ([21e7c85](https://github.com/icqqjs/icqq/commit/21e7c850db5a33351cf14f9631f6d592c0def1b9))

## [1.10.0](https://github.com/icqqjs/icqq/compare/v1.9.3...v1.10.0) (2025-10-20)


### Features

* Add Deno runtime support ([22db7c8](https://github.com/icqqjs/icqq/commit/22db7c84512814cc0184ae0ba40866b739de5463))


### Bug Fixes

* 优化 Protobuf 解码逻辑 ([bb4e1dc](https://github.com/icqqjs/icqq/commit/bb4e1dcd97b7f9ec8dc624093c7ff6eec1843a4f))
* 支持自定义转发消息预览内容 ([260f6e6](https://github.com/icqqjs/icqq/commit/260f6e611dabf3e4fd25b99b1ae143cc52fb559a))
* 调整转发消息预览字段类型 ([9bd9b20](https://github.com/icqqjs/icqq/commit/9bd9b203076432c5c1aaddd7404b39b1e0f622b2))
* 重命名 ForwardNode 为 ForwardNodeElem ([62dc96f](https://github.com/icqqjs/icqq/commit/62dc96fb24de2dd32ae618ef69a482fab880f9bc))

## [1.9.3](https://github.com/icqqjs/icqq/compare/v1.9.2...v1.9.3) (2025-10-19)


### Bug Fixes

* (protobuf)修复 gzip 和 deflate 压缩数据的头部处理 ([62234a7](https://github.com/icqqjs/icqq/commit/62234a7634f3b48e3dcfe5599a30f8672e50a775))
* (protobuf)支持base64编码并优化数据序列化 ([66f67db](https://github.com/icqqjs/icqq/commit/66f67db830c43932052bcb0800d639e4fe561f7a))
* decodePb ([3c2708b](https://github.com/icqqjs/icqq/commit/3c2708b5466cf979d3d88f29a7bee70bf497028c))
* 优化消息解析逻辑并改进JSON/XML内容处理 ([09188f0](https://github.com/icqqjs/icqq/commit/09188f0d8e5d798f6d2d4c8ca2c49a2629bbbc62))
* 增强合并转发消息处理能力 ([219f896](https://github.com/icqqjs/icqq/commit/219f896ddf06e42635bd0be29301fa9bc708e330))

## [1.9.2](https://github.com/icqqjs/icqq/compare/v1.9.1...v1.9.2) (2025-10-18)


### Bug Fixes

* upday ([7612994](https://github.com/icqqjs/icqq/commit/7612994fa013b69bc82ec398298b2e091d523ab3))
* 优化登录密钥交换与密码处理逻辑 ([f3b6f0a](https://github.com/icqqjs/icqq/commit/f3b6f0aac3d856ab2a04d56c7ff8bbcfdf1764b0))
* 修复群撤回事件处理逻辑 ([5dcff91](https://github.com/icqqjs/icqq/commit/5dcff91854d5121db4af355e1b353a6f6f8928f7))
* 获取传入的视频宽高和时长 ([f71a262](https://github.com/icqqjs/icqq/commit/f71a26295d06c03af5347e140f4e0033d69b5d16))

## [1.9.1](https://github.com/icqqjs/icqq/compare/v1.9.0...v1.9.1) (2025-10-17)


### Bug Fixes

* protobuf格式的音视频元素处理 ([8d0a308](https://github.com/icqqjs/icqq/commit/8d0a308db370a23a26214c7035f324aa099472af))
* 优化二维码登录判断逻辑 ([3be62ed](https://github.com/icqqjs/icqq/commit/3be62eded2e455fb5321f390e7e6ef542a5d7593))
* 优化视频上传时缩略图信息处理逻辑 ([12e6404](https://github.com/icqqjs/icqq/commit/12e6404146c53fabdc0d189558fa8a6d597f2014))
* 修复 bigint 编码与解码逻辑 ([7cd1cb8](https://github.com/icqqjs/icqq/commit/7cd1cb8d1536d00c1adb0b51b3ef34d035cb2903))
* 提取默认cmd白名单并优化获取逻辑 ([c39ebe8](https://github.com/icqqjs/icqq/commit/c39ebe8a0636660a090693b95ac045c4ee4c552a))
* 添加QQ9.2.25的版本信息 ([0f96201](https://github.com/icqqjs/icqq/commit/0f96201417743135ebac2a975df523f1180cad65))

## [1.9.0](https://github.com/icqqjs/icqq/compare/v1.8.0...v1.9.0) (2025-10-16)


### Features

* get user profile ([34ad6b4](https://github.com/icqqjs/icqq/commit/34ad6b4ed6272b339b1566a2b1356f433ef42f3e))
* **group:** 新增设置加群方式函数 ([fcda563](https://github.com/icqqjs/icqq/commit/fcda563aa63459ce171d6d1adb26f15f31662e96))
* **group:** 新增设置发言限频函数 ([29e14a7](https://github.com/icqqjs/icqq/commit/29e14a7c8bca77d705c70981f65397519778ce83))
* **image:** 优先从传入的elem中获取图片宽高 ([fd58e19](https://github.com/icqqjs/icqq/commit/fd58e19a1a8c748269d8451384f7ed6b9c4ebdcd))
* NT图片上传 ([39cb3f2](https://github.com/icqqjs/icqq/commit/39cb3f2378292b027f98557d1fd4104ed9a978d7))
* QQNT ([51d6d0f](https://github.com/icqqjs/icqq/commit/51d6d0f1b3f87056ddc901ea47156445429a1d26))
* token ([d8c9573](https://github.com/icqqjs/icqq/commit/d8c957370817d2671af4edd826d230638f00560b))
* 为 sendUni 和 sendOidbSvcTrpcTcp 方法添加返回值类型注解 ([e82eabb](https://github.com/icqqjs/icqq/commit/e82eabb3c7f351495ee28bc202aaf2f2bee91457))
* 好友uid改为uin，新uid为u_开头、好友获取历史消息增加nt版本判断。 ([81b7df3](https://github.com/icqqjs/icqq/commit/81b7df3d73bbba74374914aaaf2355d9da0646c8))
* 实现 NT 登录协议支持并重构登录流程 ([8b43f01](https://github.com/icqqjs/icqq/commit/8b43f018ff9942e881dfbea0f9044b3190ed842e))
* 支持解析nt版本消息 ([a6dafb3](https://github.com/icqqjs/icqq/commit/a6dafb397bfa920b6e03e5d733f84319b82d3f7d))
* 新增 NT 图片 RKey 刷新功能 ([f7b53de](https://github.com/icqqjs/icqq/commit/f7b53de06da4599bf3cfadaa803ed6451fd09e3a))
* 新增删除表情表态功能 ([c6ee888](https://github.com/icqqjs/icqq/commit/c6ee888b5d09a8d191c604739f332c88800cd594))
* 添加身份验证事件和相关处理 ([cd0b369](https://github.com/icqqjs/icqq/commit/cd0b369e14cf41bbc7da15c1f50459de39b76f99))
* 登录token按包名储存、其他一大堆修改 ([0bb81f0](https://github.com/icqqjs/icqq/commit/0bb81f082ad4fbd8c7a2f05f48ecb1a07bb3f365))
* 移除音乐分享功能并优化分享接口 ([fe815c1](https://github.com/icqqjs/icqq/commit/fe815c1192d6705f9876d8ee2020fa1d1b62f387))
* 统一 Image 和 Converter 构造函数参数传递 client ([3ab005b](https://github.com/icqqjs/icqq/commit/3ab005b38f8f6ed39351757fae226c41cbe87b9d))
* 统一导入 core 模块并重构 sha1 流计算调用方式 ([93a8f37](https://github.com/icqqjs/icqq/commit/93a8f3790490694538919f5f1c9b5cb31e8cde03))
* 账号功能受限提示 ([7ae40e9](https://github.com/icqqjs/icqq/commit/7ae40e9bfdf75f44f1dc127585c681962796facc))
* 重构 Proto 解码与 JSON 序列化逻辑 ([761fa58](https://github.com/icqqjs/icqq/commit/761fa5897eb34c472a2cbdffc02fb16907b356a1))
* 重构视频上传逻辑，使用 Video 类处理上传任务、更新功能受限提示文案及错误码处理、调整 refreshNTPicRkey 刷新间隔判断条件、完善图片上传状态标记逻辑 ([303440d](https://github.com/icqqjs/icqq/commit/303440d0bc9d50323bbf5301f98996d9ba0f178c))
* 重构语音上传逻辑，使用 Record 类处理音频文件 ([bf86f1a](https://github.com/icqqjs/icqq/commit/bf86f1a1005e131ce319ba05bdb14c9025e03750))


### Bug Fixes

* ? ([75536ec](https://github.com/icqqjs/icqq/commit/75536eca1a143fb2203e7aecc87f69548b6e1739))
* ？ ([9a99156](https://github.com/icqqjs/icqq/commit/9a991560ede772bf5d37434be23d636c5c76fbda))
* . ([8377bb2](https://github.com/icqqjs/icqq/commit/8377bb22c98909d6047998168a51d5a8314c3b2a))
* . ([c2fe052](https://github.com/icqqjs/icqq/commit/c2fe05204ef62ca7f653d11f7329fe9b8d45bae8))
* . ([9cfe1e0](https://github.com/icqqjs/icqq/commit/9cfe1e0078708cd09b1929ee3e1f29d1d5090a94))
* . ([495151e](https://github.com/icqqjs/icqq/commit/495151e5092292c8134d2d0bdee7034e3d259eff))
* . ([7969784](https://github.com/icqqjs/icqq/commit/7969784adf5b65a16d2ccaf831c643297d95ed0e))
* ... ([77e20bb](https://github.com/icqqjs/icqq/commit/77e20bb9f1a181e067491d6cb5e84300e9d4e0e2))
* ... ([e017a37](https://github.com/icqqjs/icqq/commit/e017a371d804bda6dab332c0a89e8fe478b3c927))
* ... ([1986731](https://github.com/icqqjs/icqq/commit/1986731e747babf3c711acecc3a63dd10fd511f2))
* 。 ([6821a2a](https://github.com/icqqjs/icqq/commit/6821a2ae0c29f956a2710850b6dc4e246a3d69ef))
* `getUserProfile` return type wrong ([da9abdb](https://github.com/icqqjs/icqq/commit/da9abdb521f630d854578fb4fd93ae5ae325034d))
* 1.8.1 ([b86ba87](https://github.com/icqqjs/icqq/commit/b86ba87bb067ed095a24aa8f40dacef7b57a5878))
* 529消息类型错误 ([55c2624](https://github.com/icqqjs/icqq/commit/55c262403642a478936a997b3cb9b7b2b59f4f08))
* 544 ([df9938f](https://github.com/icqqjs/icqq/commit/df9938f249dd1fb42465262d85686395bb4335d9))
* add 3.5.7.3218、9.0.55.16820 ([0900f1e](https://github.com/icqqjs/icqq/commit/0900f1eb507c3c6752dd4156924579dd4d1e7d0a))
* add 9.0.30.15995。 ([f159f74](https://github.com/icqqjs/icqq/commit/f159f749d1b625b9d4c283d93204888473dac5aa))
* add 9.0.35.16270 ([c2950a9](https://github.com/icqqjs/icqq/commit/c2950a9ec2305b04c3dbc780797adcf0250cf549))
* add 9.0.35.16275 ([7f010b6](https://github.com/icqqjs/icqq/commit/7f010b690a28a3620f20d543db7f6ec7df9f50f8))
* add 9.0.50.16545 ([edda30a](https://github.com/icqqjs/icqq/commit/edda30a408867f4640b4158b94d8c63bccb843ce))
* add 9.0.56.16830 ([eaafe0b](https://github.com/icqqjs/icqq/commit/eaafe0b7a6415a1ba9155816cc6cbdb049cb55e5))
* add 9.0.60.17095 ([e30f679](https://github.com/icqqjs/icqq/commit/e30f6795abf6d00d36dcfbaf396c1124fe2ac291))
* add 9.0.65.17370 ([b19395c](https://github.com/icqqjs/icqq/commit/b19395c2545e93a58be364d6e6f083aa989eb447))
* add 9.0.70.17645 ([d86ec90](https://github.com/icqqjs/icqq/commit/d86ec90d7a8ea9f016bc94a0345e36aed3e3cb54))
* add uploadLongMsg ([ecfecc0](https://github.com/icqqjs/icqq/commit/ecfecc02b99058fcb06d49c029938dee73d83b58))
* build error ([63baabe](https://github.com/icqqjs/icqq/commit/63baabe7aa1763392e9f44e000fd6ac114a59bd3))
* buildLoginPacket ([52741aa](https://github.com/icqqjs/icqq/commit/52741aadb826ccd82dc7b3c121231f105e9759b3))
* buildPacket ([8ad853d](https://github.com/icqqjs/icqq/commit/8ad853dde499d17bfb58d86b731f8dc08c1e9197))
* buildPacket ([329a1a2](https://github.com/icqqjs/icqq/commit/329a1a2226676c10f904821e965079f853911bd9))
* buildPacket ([63f7e36](https://github.com/icqqjs/icqq/commit/63f7e361c94bec586bf2deb62ffd9fb8e591dfe4))
* buildPacket、sendPacket ([289430f](https://github.com/icqqjs/icqq/commit/289430fe7a8b1f7fb1825e795a31a6e6eb224503))
* buildQrcodePacket ([328a0c7](https://github.com/icqqjs/icqq/commit/328a0c7f94dd6328289a1cfc190ff294cd54789a))
* buildTransPacket ([251d03e](https://github.com/icqqjs/icqq/commit/251d03e46ac9e612e7836af2656cb5141f093f51))
* change class Proto decode logic ([d11dcc1](https://github.com/icqqjs/icqq/commit/d11dcc1f58096c188508ffe6934d3a8b2d06e8d9))
* checkTag ([2608710](https://github.com/icqqjs/icqq/commit/260871019c6f83768f590e9761d67961eb7faa7a))
* CmdWhiteList ([0365a5f](https://github.com/icqqjs/icqq/commit/0365a5f636c7a79d4ffa79ed1d4f84aae7fb314c))
* code2uin、uin2code ([3825599](https://github.com/icqqjs/icqq/commit/382559974a53f7ef88815e33f08265ba5bb7929b))
* CustomApkInfo ([54ed8a9](https://github.com/icqqjs/icqq/commit/54ed8a99fd7b431aa25dfca2dc14986b89652586))
* **device:** 更新 TIM、watch 版本 ([7dc4d3b](https://github.com/icqqjs/icqq/commit/7dc4d3be676a64fbb2643697199adc07459f0685))
* **device:** 添加新的 APK 版本信息 ([b35362c](https://github.com/icqqjs/icqq/commit/b35362cf037e7c4faf0150c0878a2376d5805ddc))
* emp失败时走token过期 ([02d2985](https://github.com/icqqjs/icqq/commit/02d29858acf8530b8a7e006ca52733d4d8362100))
* emp改为15 ([e80f073](https://github.com/icqqjs/icqq/commit/e80f0734d04c5e116a0b86ea139a22dc4132c511))
* file: ([592beed](https://github.com/icqqjs/icqq/commit/592beed7a51215e6fff6873849976122f22741a7))
* forward nt ([cc00160](https://github.com/icqqjs/icqq/commit/cc00160f33404386d4e57ef17ecf11b5875fb739))
* getApkInfoList ([a8c55bc](https://github.com/icqqjs/icqq/commit/a8c55bc4082ffaefdd4053a10fdd2e2bf294176d))
* getApkInfoList ([370a7df](https://github.com/icqqjs/icqq/commit/370a7df9f84d02cbb99b10b9a51a4439c56b5342))
* getNTPicInfobyFileid error ([440521e](https://github.com/icqqjs/icqq/commit/440521e87e7a9badd8d39023ac4a3a002ada6f77))
* getNtVideoUrl ([1091b21](https://github.com/icqqjs/icqq/commit/1091b215c752460c1b67a12a85f0f1c94a9c52ec))
* getNtVideoUrl、getNtPttUrl ([4c338d1](https://github.com/icqqjs/icqq/commit/4c338d164210b9be0e824cf0618d8009935cdc33))
* getStatusInfo ([32007a2](https://github.com/icqqjs/icqq/commit/32007a29df2f30c1d61d366d0a0626368dae832b))
* getT544、getSign报错 ([00be2c4](https://github.com/icqqjs/icqq/commit/00be2c4c64602dc2c92a97e2aaa4aa4d136e8251))
* getT544、getSign报错 ([4295721](https://github.com/icqqjs/icqq/commit/42957212d80ade7bad4fdc532a6eb0e4de8fdb0e))
* getT544、getSign报错 ([c4adae6](https://github.com/icqqjs/icqq/commit/c4adae6c33852d6c0917ed2fc62f408999898693))
* getUserProfile ([e11a4b0](https://github.com/icqqjs/icqq/commit/e11a4b0c65ff2030c2ccef09f21da162d74e64e4))
* getUserProfile、readCustomApkInfoList ([bb8bd0d](https://github.com/icqqjs/icqq/commit/bb8bd0da97ac0ec8a4ff53dc7c02d636ee152059))
* **group:** 获取群分享JSON ([46bb61c](https://github.com/icqqjs/icqq/commit/46bb61c2a80f85cbefd17cfa2071342cb8ee52d1))
* hb480 ([4b58ba8](https://github.com/icqqjs/icqq/commit/4b58ba846c659fa5bc94211a458ba9a36458e66c))
* heartbeat ([438d557](https://github.com/icqqjs/icqq/commit/438d5576bedf9a1e6d0028be7acf07a0e5da32d3))
* Heartbeat ([5f57c44](https://github.com/icqqjs/icqq/commit/5f57c44bc58e42c93941805ddaf24b8dd336fc86))
* Heartbeat ([583a164](https://github.com/icqqjs/icqq/commit/583a164b87ce9812bc55fd9e7682d2d60d4e3ad5))
* Heartbeat ([425629a](https://github.com/icqqjs/icqq/commit/425629aa63fd6ebc4300f9a8b5395d65eec8f7e0))
* Heartbeat ([4b828b2](https://github.com/icqqjs/icqq/commit/4b828b2897bec1c93bd1a7bc289b4fcc9812433b))
* HeartBeat ([55fa274](https://github.com/icqqjs/icqq/commit/55fa274aad0eff74717a382edbd415970a0f83ed))
* image ([d190fe0](https://github.com/icqqjs/icqq/commit/d190fe028675c3911ab341938ccd4763bf4dcc6d))
* image ([5e9a63e](https://github.com/icqqjs/icqq/commit/5e9a63eca7a411c7f9bf604ee04f17f961e17e0f))
* image file、getNt -&gt; getNT ([9225f5a](https://github.com/icqqjs/icqq/commit/9225f5a81d31b2231a29ad1973904307f676027e))
* ImgElem ([e29fbc3](https://github.com/icqqjs/icqq/commit/e29fbc3b5a107f8d90a7254ddc0bc26aa6321fb5))
* isNT ([c0cbcb2](https://github.com/icqqjs/icqq/commit/c0cbcb23d697a529db4f897061a307bc2ad14ece))
* lint ([b1cd8c7](https://github.com/icqqjs/icqq/commit/b1cd8c736aac5381e8c331f2f9c8e67c75fba8b8))
* lint:fix ([79c1a1f](https://github.com/icqqjs/icqq/commit/79c1a1f8ae0068654f3b015bd480733cb967d5c8))
* loadFL ([8baff93](https://github.com/icqqjs/icqq/commit/8baff939389fcc2466a765b22748b67733ef3c4e))
* logout ([c34c539](https://github.com/icqqjs/icqq/commit/c34c5393ee46dbaa66eb72b4590b6a4d2207f000))
* makeForwardMsg ([a5d57b0](https://github.com/icqqjs/icqq/commit/a5d57b0a6b7d89fb2d0b03c57f6b148c0d08d552))
* MemberInfo ([d0569a8](https://github.com/icqqjs/icqq/commit/d0569a83e22bfcf50a850865dd2d9db423a3bbed))
* merge code ([123c1fe](https://github.com/icqqjs/icqq/commit/123c1fec347c51ded501f5924df73b0bcee31ab6))
* merge code ([9341a14](https://github.com/icqqjs/icqq/commit/9341a14919f11a22245abebe793786d446acd040))
* nt voice ([79be05a](https://github.com/icqqjs/icqq/commit/79be05ade9e83454b3ea7da451422e69b1e417c4))
* nt 视频 ([3a7b1da](https://github.com/icqqjs/icqq/commit/3a7b1da012f6f7f8a0d305b8bfff5c3735bf4fd1))
* nt_push732 ([ac5eadb](https://github.com/icqqjs/icqq/commit/ac5eadbf2f87b0369f18223e3212ed8d3f0a3f83))
* nt_push732 ([eff6b10](https://github.com/icqqjs/icqq/commit/eff6b10df119fca8857bd64301871525032a9bac))
* nt_sub0x27事件处理异常 ([942b17c](https://github.com/icqqjs/icqq/commit/942b17ca66d4bd95dd81549e34246f12c0c6c4b7))
* ntGroupEvent ([a4ffd8e](https://github.com/icqqjs/icqq/commit/a4ffd8eced51d3510c475471a55c712c74117476))
* ntPush528 ([b8dff8c](https://github.com/icqqjs/icqq/commit/b8dff8c6ac5f4399492cf38e9767a48c23b7de91))
* ntPush528事件补全 ([e6c8a01](https://github.com/icqqjs/icqq/commit/e6c8a0128f565daf014a2c7d8eb8d45fe8553a29))
* ntPush732 ([d43b35d](https://github.com/icqqjs/icqq/commit/d43b35dc24d3e8bdf328da692ca1ef34ab394a76))
* ntPush732事件补全 ([dda7ebd](https://github.com/icqqjs/icqq/commit/dda7ebd40e6ed065a37754ba0b2f5fc924312b80))
* ntqq艾特。 ([97fbf08](https://github.com/icqqjs/icqq/commit/97fbf08382262315913b8a819a98f018f915c5c7))
* ntSub0x27 ([0f76045](https://github.com/icqqjs/icqq/commit/0f76045854c6bae64c0279f9432267cc501a42ac))
* NT上线包设备信息调整。 ([1a50da0](https://github.com/icqqjs/icqq/commit/1a50da0b4e0af08f926d83e2ea9617f7a687621b))
* NT上线群禁言等功能报错问题。 ([2b0a6f6](https://github.com/icqqjs/icqq/commit/2b0a6f67d9b1198dbf3244575da168cf4818865a))
* NT加好友事件 ([4607095](https://github.com/icqqjs/icqq/commit/460709566333acd95c2602211ba9bfe0226ab423))
* nt图片解析。 ([ab0797a](https://github.com/icqqjs/icqq/commit/ab0797aa722c6939a3467f80dd787be8fdf6451b))
* nt图片语音视频解析和转发 ([ae2c6de](https://github.com/icqqjs/icqq/commit/ae2c6de72c6823b3d08f7a493c5d1b97305a72eb))
* NT群临时、私聊、离线文件消息解析 ([820a2c4](https://github.com/icqqjs/icqq/commit/820a2c43022266acdadd90d9da62d67c7484f2a2))
* NT群事件 ([1a54fa5](https://github.com/icqqjs/icqq/commit/1a54fa5c2e1af6a996f957253d107820f02ddef4))
* NT资料更新事件处理。 ([6f7d046](https://github.com/icqqjs/icqq/commit/6f7d0460d63e22492f3b92d474308fafc567f95a))
* owner_id ([4b6a96c](https://github.com/icqqjs/icqq/commit/4b6a96cad65310df739400a626ba53f9b14345dd))
* parse ([d746f0f](https://github.com/icqqjs/icqq/commit/d746f0fb16a7b715afe236114eb3eff071933d81))
* parseElems ([e2eb06b](https://github.com/icqqjs/icqq/commit/e2eb06b1a0990bb9337ebe31d5c58da598b1159b))
* parseImgElem ([6243512](https://github.com/icqqjs/icqq/commit/624351240a480367e969f98d00586d31f72072c3))
* parsePoke ([14a18d5](https://github.com/icqqjs/icqq/commit/14a18d563a1a56db8f0bbbda06e5d805bbe1dbcb))
* parser ([3cdc8b0](https://github.com/icqqjs/icqq/commit/3cdc8b042046459ab7a924e97e8e8b7be25bcbdc))
* parser ([ab7275f](https://github.com/icqqjs/icqq/commit/ab7275f8a0f2be15423ed1f99d7962910339c9dc))
* pickUser ([2ec8bfd](https://github.com/icqqjs/icqq/commit/2ec8bfdf4bf8bc51f5aab2323f6d6a7f905e7d8e))
* push pkg ([ac4420e](https://github.com/icqqjs/icqq/commit/ac4420e0040eb5b7064c203dcb5c8fcdafc2f632))
* push pkg ([e7e1f55](https://github.com/icqqjs/icqq/commit/e7e1f55e35bc3dcf16ef117ce84c13657f7a30a8))
* push pkg ([cc15032](https://github.com/icqqjs/icqq/commit/cc1503289cf0232ea8f515b1a5d007c7993c861a))
* QQNT ([46af812](https://github.com/icqqjs/icqq/commit/46af812313cbcc5cba8c4421fc3d679e0488871a))
* QQNT下线通知处理。 ([ba537a3](https://github.com/icqqjs/icqq/commit/ba537a3f4d1b970e235d7620168ca409fd4e2a78))
* QQNT群信息解析 ([351dc6d](https://github.com/icqqjs/icqq/commit/351dc6d3f014cbee04b0947233507327390ac74b))
* QQNT默认启用。 ([2a5ea5d](https://github.com/icqqjs/icqq/commit/2a5ea5dd97aad7df37bbd448b54451f1c2ca7f33))
* qr ([b2f4d09](https://github.com/icqqjs/icqq/commit/b2f4d092a48b716d6534ed9845ef9960679307aa))
* qrcode ([07e299e](https://github.com/icqqjs/icqq/commit/07e299e05b77cc5632565bd8f97c051dfaff619a))
* queryQrcodeResult ([2e6d584](https://github.com/icqqjs/icqq/commit/2e6d58410258b8c6897d7712d75a8ae11263ed7d))
* readCustomApkInfoList ([72c03fb](https://github.com/icqqjs/icqq/commit/72c03fb0bb06008c95f32e7946bdb46b5c0b759a))
* readCustomApkInfoList ([fe263c7](https://github.com/icqqjs/icqq/commit/fe263c70f505f8b0b14dbaf441f5800f75c75b9a))
* Reader buffer ([8745d15](https://github.com/icqqjs/icqq/commit/8745d157f024721c5139335216ed32f73bc4c287))
* refactor(device): 更新设备信息生成逻辑和 APK 版本列表 ([4ed0039](https://github.com/icqqjs/icqq/commit/4ed003900b38b1bce754cbca5985d047feab612a))
* refactor(message): 优化消息解析中的图片 URL 生成逻辑 ([47bf149](https://github.com/icqqjs/icqq/commit/47bf14903b7425d1ec4423fa1d25d3a1f4ff7574))
* refreshToken ([a29dd22](https://github.com/icqqjs/icqq/commit/a29dd222278792f0636eb09615d4450df5457101))
* refreshToken ([52f652d](https://github.com/icqqjs/icqq/commit/52f652db031a6265921df81ccc821ba279525c96))
* register ([9384c10](https://github.com/icqqjs/icqq/commit/9384c1007ca7545ce1afe0baee975cff31bc5629))
* register ([5729ac3](https://github.com/icqqjs/icqq/commit/5729ac34c35a20e285681c6f10cd1d3646305890))
* register ([9e0fc15](https://github.com/icqqjs/icqq/commit/9e0fc15523042e03ee24f53c0b9c337a31df26b1))
* reply 重复处理 ([32c2489](https://github.com/icqqjs/icqq/commit/32c24897126f6a4ec9b3d4a82fe9e37cbd1f31de))
* ReserveField ([c2ebe82](https://github.com/icqqjs/icqq/commit/c2ebe822bcd09d98c323afcb3647af3be42d2817))
* sendMergeUni ([70e272c](https://github.com/icqqjs/icqq/commit/70e272ca289bcaa0439c0fc23de6ec8c4f82fea4))
* sendMergeUni ([bace72f](https://github.com/icqqjs/icqq/commit/bace72ffb262f64b3407e1a054a03c7347080f2f))
* sendMergeUni ([762c2a0](https://github.com/icqqjs/icqq/commit/762c2a0b2f0f7f1cd3454b3fa91523eba4b476a3))
* sendPacket ([42c7ead](https://github.com/icqqjs/icqq/commit/42c7ead12c55ebef418ef53aba2212095e2cf28c))
* sendPacket改为调用buildPacket ([e20bc45](https://github.com/icqqjs/icqq/commit/e20bc45dcf272ad21e226a3c1c7cf4a07fd4f3ab))
* seq ([3fcff78](https://github.com/icqqjs/icqq/commit/3fcff78b037ba3c7d57e9d64bd81aa08bee57764))
* seq ([ca06d93](https://github.com/icqqjs/icqq/commit/ca06d93b4a4229eca76f13b95e1192d230fce055))
* seq ([1ede29d](https://github.com/icqqjs/icqq/commit/1ede29d80483b456d10e469fee40e8fd3a47a7ec))
* setGroupJoinType ([63f9444](https://github.com/icqqjs/icqq/commit/63f9444b0cba20379a92c873865c7ba71f41f843))
* setOnlineStatus ([fecb49b](https://github.com/icqqjs/icqq/commit/fecb49bbe62b1fe2e17e5346d965761de6eb7028))
* sface、超级表情 ([4e5c8bd](https://github.com/icqqjs/icqq/commit/4e5c8bd1a8632f76f144afa673118274b94fae7a))
* sign path ([59f38ef](https://github.com/icqqjs/icqq/commit/59f38ef224b22a71a458423f3e8e2ecd9b139b6e))
* signAPICheck ([445a437](https://github.com/icqqjs/icqq/commit/445a4370cc03fa56f1503e2d25c920247628bda2))
* signCmd改为正则匹配 ([47c4ce2](https://github.com/icqqjs/icqq/commit/47c4ce2c556f409eb10077aeefec945ef01d8708))
* sign回调任意包漏洞 ([828f77f](https://github.com/icqqjs/icqq/commit/828f77fbf3cf2843fc3c9f4f90d4a9276382f519))
* sign调用耗时使用hrtime计算 ([0b01de8](https://github.com/icqqjs/icqq/commit/0b01de8c6cb2692c821a4fd1fb62fa3559c26df5))
* **src:** 修复 Group 发送消息时消息 ID 生成错误 ([f1f9bfe](https://github.com/icqqjs/icqq/commit/f1f9bfe1c0392dd82ef1b9f9a2a6f40ff473f32c))
* SsoHeartBeat ([c46d62f](https://github.com/icqqjs/icqq/commit/c46d62fdacd839568e8a70d51044de9a95f1516c))
* SsoHeartBeat ([2689b91](https://github.com/icqqjs/icqq/commit/2689b91b5dc6c0b5439da8061d9c0665210f7808))
* SsoHeartBeat ([4242ba7](https://github.com/icqqjs/icqq/commit/4242ba7426562422562a22ade93a1be224a0d8d9))
* SsoHeartBeat ([72f941f](https://github.com/icqqjs/icqq/commit/72f941fe797583462d42f77e8473f2dd5e458c1d))
* ssoPushAck ([2511738](https://github.com/icqqjs/icqq/commit/25117386005006b7c398cd0f7b3ca622796cef10))
* string ([292a8ed](https://github.com/icqqjs/icqq/commit/292a8edc8862b9cd01adf5782d2bce13c007f572))
* system.offline ([c880cbe](https://github.com/icqqjs/icqq/commit/c880cbedd9c515392f09252574d39b99888f1a27))
* tlv10c ([bb1a4a0](https://github.com/icqqjs/icqq/commit/bb1a4a059765c43adfb8e0e99ab1b417f9819ead))
* tsconfig alias ([d7c840c](https://github.com/icqqjs/icqq/commit/d7c840c23497c0bee0663f11f9f2ae6ff94381d2))
* typo permisson → permission ([dc435b1](https://github.com/icqqjs/icqq/commit/dc435b1f35b018131e68235d83536c060d7d19a7))
* uid -&gt; user_uid ([b9f28b0](https://github.com/icqqjs/icqq/commit/b9f28b0c33bca194ccdf358226ac5736fda30e3b))
* upday ([8ebdfae](https://github.com/icqqjs/icqq/commit/8ebdfaeed51077640441ffeaace6bd52f87e6215))
* upday ([a2d1132](https://github.com/icqqjs/icqq/commit/a2d1132d70b32c9bb80ff56fe7cdbefd8c400a90))
* upday ([4a2570a](https://github.com/icqqjs/icqq/commit/4a2570aeb6c3dff63c01c3940658e8a2f8fc6138))
* upday ([f80bebd](https://github.com/icqqjs/icqq/commit/f80bebdb732ef0f400918ad4ae742292cc48c1a5))
* upday ([99e3016](https://github.com/icqqjs/icqq/commit/99e3016193db2b379d2e2c92d984354256f3db38))
* upload lib ([f6b590d](https://github.com/icqqjs/icqq/commit/f6b590dd518100dd805e8eb7756e913d13c74398))
* user_uid ([bd42c7f](https://github.com/icqqjs/icqq/commit/bd42c7f9e842080f1ccb789c7730df3ab32951b4))
* user_uid ([df1b3e9](https://github.com/icqqjs/icqq/commit/df1b3e991a761c19ec8c3c1956b20bfd3704dad4))
* user_uid ([a117ebe](https://github.com/icqqjs/icqq/commit/a117ebed353d0b6b1a4554ad149fadb75763a415))
* ver ([5d1d13b](https://github.com/icqqjs/icqq/commit/5d1d13b14fbce465bb04a6915b6aa05c8e584d26))
* watch 9.0.1 增加nt标识 ([ae0417d](https://github.com/icqqjs/icqq/commit/ae0417d70527be27bd362c41e08a9899af00bc1e))
* 一不小心多删了两行 ([925b079](https://github.com/icqqjs/icqq/commit/925b07922cc770552876f78fa472a7d6b6017f6a))
* 上传图片时忽略已填写fid的图片。 ([17c6e13](https://github.com/icqqjs/icqq/commit/17c6e1380d7031820bb7bf1b45e72f4919023b13))
* 上传群文件空间不足时自动转为临时文件。 ([5aa988f](https://github.com/icqqjs/icqq/commit/5aa988f5d188cffb41096d1c877e394153ab6d22))
* 事件处理异常 ([e5b9927](https://github.com/icqqjs/icqq/commit/e5b9927dfff9e74fe4df00c50ee2e5d3c3063019))
* 代码格式 ([5509763](https://github.com/icqqjs/icqq/commit/5509763deb861343613b9afcf1c3baa883669243))
* 优化signcmd白名单匹配逻辑 ([0409dc3](https://github.com/icqqjs/icqq/commit/0409dc3b78541cb98d9b38b2922ca922acaebd65))
* 优化下线消息携带原因说明 ([c6cb781](https://github.com/icqqjs/icqq/commit/c6cb7811e5f89f7ab0ba09b5337d5cb3f12e5fea))
* 优化二维码登录流程并添加二维码信息参数 ([a331d09](https://github.com/icqqjs/icqq/commit/a331d0996bc90f8dd383418b99ddde67ecfa78bc))
* 优化文件上传失败时的临时文件清理逻辑 ([dc916e8](https://github.com/icqqjs/icqq/commit/dc916e8cd1949507d33493317087ee1ac2669d65))
* 优化消息解析器构造函数参数处理 ([1a8c43b](https://github.com/icqqjs/icqq/commit/1a8c43b71033410a7940fc0cf970365bfce20515))
* 优化签名验证逻辑 ([2b80def](https://github.com/icqqjs/icqq/commit/2b80deff3ee70e2f0068e2493beef00f502b428f))
* 修复 jce 的 map 数字 key 自动转 string 的 bug ([8bae76e](https://github.com/icqqjs/icqq/commit/8bae76e96c69fe55c817b9221d1a9036ae716e3a))
* 修复NT多层转发无法正常显示。 ([00a7ea5](https://github.com/icqqjs/icqq/commit/00a7ea5f905cf077b6e00434e91d914603725b79))
* 修复上传完成后返回值不正确的问题 ([c82ca27](https://github.com/icqqjs/icqq/commit/c82ca278c53639ffbe960f82d0028211c7591991))
* 修复无法自动获取签名ApiQQ版本问题。 ([a9176f7](https://github.com/icqqjs/icqq/commit/a9176f7591f87f56d4727da4f2c74ff4bfe02dba))
* 修复重连失败后无响应问题。 ([f56d818](https://github.com/icqqjs/icqq/commit/f56d818efe13206b150c4ff7a54a13236be403ba))
* 允许SignApi返回空sign ([0c1c97d](https://github.com/icqqjs/icqq/commit/0c1c97d62564083246b5648f1d24e2d309b3518a))
* 删除自动调用requestToken ([eba4167](https://github.com/icqqjs/icqq/commit/eba41670ac819182b108965f8bd4db5452e865d9))
* 刷新群员资料时获取群员uid ([09a9d9d](https://github.com/icqqjs/icqq/commit/09a9d9d4dbbb6b1046b96455d85754d1741c141d))
* 动态读取好友uid ([a4de242](https://github.com/icqqjs/icqq/commit/a4de24292dcf77fcfe66a552414046123366a6aa))
* 协议调整。 ([c25fb9f](https://github.com/icqqjs/icqq/commit/c25fb9fff9c9246d23e20dfdd33b3835a34840f6))
* 去除引用回复at ([a66f8dd](https://github.com/icqqjs/icqq/commit/a66f8dd12db46daecae2a7b4f057d149c90ac341))
* 发包返回错误时抛出异常 ([743268c](https://github.com/icqqjs/icqq/commit/743268cef4f46c75a68239c3d0c3d36942529df0))
* 发送心跳时判断客户端是否在线。 ([6375b2b](https://github.com/icqqjs/icqq/commit/6375b2b5a3cb989b92361f1ce2c39b3a4548eb31))
* 取消合并发送。 ([3be7548](https://github.com/icqqjs/icqq/commit/3be7548065555e823a9d2dce2c163325a15b6c3f))
* 只有一条合并包的话走正常发送。 ([5c34aba](https://github.com/icqqjs/icqq/commit/5c34abab813d5a1ba2f04b2500740663ff2d0e03))
* 合并转发使用预处理 ([7341edf](https://github.com/icqqjs/icqq/commit/7341edf6632703441f4869cf86c2063ac245f7d1))
* 回退pb解析。 ([40ae787](https://github.com/icqqjs/icqq/commit/40ae787d8271fb7a41437a19af73660bb0997310))
* 图片上传 ([2235098](https://github.com/icqqjs/icqq/commit/22350986f96b53e44d5e68412cbea5ae91fb43fd))
* 图片消息处理时添加sha1长度检查 ([3a75059](https://github.com/icqqjs/icqq/commit/3a750591240821e714927930d30f537e9beeb2ab))
* 图片解析。 ([e294acc](https://github.com/icqqjs/icqq/commit/e294acc2f6fa539c3d22627e9a42be2c6376b317))
* 在base-client.ts文件的TlvTags映射中新增了t547标签。 ([1a89619](https://github.com/icqqjs/icqq/commit/1a896194c6cd49e515a912eda576d7bea5d064d0))
* 增加9.0.17.15185 ([caad99b](https://github.com/icqqjs/icqq/commit/caad99b0f44a8e78b11396b8b76853b330393f8a))
* 增加getPicUrl ([7f31c9c](https://github.com/icqqjs/icqq/commit/7f31c9cd0909acf2d83f04fb3ba08dcb711a0faf))
* 增加getStatusInfo ([dfa7002](https://github.com/icqqjs/icqq/commit/dfa7002744978768a6b41df90061755cd725f089))
* 增加qq版本9.1.10.20545 ([0e09daa](https://github.com/icqqjs/icqq/commit/0e09daa1852ed6ce6e52ea94acce032f015da55b))
* 增加sendMergeUni（合并发送多个业务包） ([68995fc](https://github.com/icqqjs/icqq/commit/68995fcd794f7f9c2beb21f097432747da5b9d89))
* 增加创建自定义版本信息文件的日志输出 ([2ec0689](https://github.com/icqqjs/icqq/commit/2ec06890718c34ec79c29e6f6ea0374e44d203b0))
* 增加可组合发送的元素 ([c6786cc](https://github.com/icqqjs/icqq/commit/c6786ccee6134fe5efff9e2fbf6487da941c3617))
* 增加群表情回应事件 ([cbf15c9](https://github.com/icqqjs/icqq/commit/cbf15c9d2757f4b6babed8615f7ed3304719f313))
* 处理markdown消息新增的配置。 ([55576fd](https://github.com/icqqjs/icqq/commit/55576fd80d3808b4d1656d79fb268b3f739134c4))
* 安卓手机协议扫码登录使用apad的appid。 ([a4e57ea](https://github.com/icqqjs/icqq/commit/a4e57eac773406a94b06b034e40826ed8f8ab0e5))
* 延迟 ([627d2a0](https://github.com/icqqjs/icqq/commit/627d2a0b50c5975559e1b279bdf7c3ef9f6fa161))
* 延迟添加图片元素到消息列表 ([e20139c](https://github.com/icqqjs/icqq/commit/e20139cf502f1e47288e486407715bd4fbd5eaba))
* 引入新的 `calculateSha1StreamBytes` 方法用于分块计算 SHA1 值以适配 NT 模式上传需求。 ([5dac3bc](https://github.com/icqqjs/icqq/commit/5dac3bc827ea1050580cd0bd2c6e3d8f4631dde3))
* 当传入不支持组合发送的元素时丢弃其他元素。 ([32509fb](https://github.com/icqqjs/icqq/commit/32509fb4f4c4b8fc45def6c8876bff4104121909))
* 心跳 ([ccf937f](https://github.com/icqqjs/icqq/commit/ccf937f3f20ee458730e05efa8ec0ffb3f4f6bdb))
* 心跳间隔改为30秒 ([e4add2c](https://github.com/icqqjs/icqq/commit/e4add2c0d954417aaf1e19d0e757dc209b2f8fda))
* 心跳间隔改为60秒 ([d361009](https://github.com/icqqjs/icqq/commit/d361009514dc8b90de89ff38621b5cf09e14fab2))
* 忽略不支持的类型。 ([6e7c74b](https://github.com/icqqjs/icqq/commit/6e7c74bbc97dc52d7205bb056d9dc1405b7e48b7))
* 扫码登录屏蔽不支持的协议（手机、apad） ([9f87af3](https://github.com/icqqjs/icqq/commit/9f87af3fc74f693cd8dc384c956543f6cc8bce2a))
* 掉线推送包解析异常捕获。 ([9647635](https://github.com/icqqjs/icqq/commit/964763534ad81847d0c5dce7ffdd49069928092c))
* 提高 pb 结构处理的兼容性，修复报错 ([beca19d](https://github.com/icqqjs/icqq/commit/beca19dc8a98478cb515a2f6665e53029838ad4e))
* 支持Button消息解析。 ([95cc162](https://github.com/icqqjs/icqq/commit/95cc162a86dc526ff20352096ab6b19893dad5d6))
* 支持markdown消息解析。 ([79d169e](https://github.com/icqqjs/icqq/commit/79d169e09b2b3ba731c3f5ce496d02fb53d46727))
* 支持silk转码（silk-wasm）、修复掉线重连报错问题。 ([aea0163](https://github.com/icqqjs/icqq/commit/aea0163e3880b6dfa2ced12e43862584ebff7108))
* 新增【添加表情表态】功能，by: hlhs。 ([e6aeda8](https://github.com/icqqjs/icqq/commit/e6aeda88910e422bff6d713eceb9cabe67c2be2d))
* 更新视频上传逻辑与字段处理 ([dadc9a1](https://github.com/icqqjs/icqq/commit/dadc9a125c603f4a0da1eb4a44c990b32d4d93d3))
* 更新签名 API 调用条件和参数 ([0511a6e](https://github.com/icqqjs/icqq/commit/0511a6e386618a3e8f44b72ba4e8dd784c2838a6))
* 查询群成员信息、群资料信息时合并多个查询包。 ([be2ade4](https://github.com/icqqjs/icqq/commit/be2ade4b586ea62a60b10f466a75cae32d48e237))
* 消息发送判断 ([6862d33](https://github.com/icqqjs/icqq/commit/6862d33c5526879e73d7a5489c337ea080ba6eaa))
* 消息发送结果判断、仅在包名不匹配时触发重新登录 ([d256fda](https://github.com/icqqjs/icqq/commit/d256fdaffdb07db924fe2ecc409990c3b4ad9c5c))
* 消息解析增加异常捕获 ([e2b96b6](https://github.com/icqqjs/icqq/commit/e2b96b618ecded699f3c6ac2ec9883562b74ecb4))
* 消息解析频道帖子，增加帖子分享到群/好友能力 ([8c6b95b](https://github.com/icqqjs/icqq/commit/8c6b95b752c3352a8ae097c49ac13ac2efc729fb))
* 消息解析频道帖子，增加帖子分享到群/好友能力 ([d4ed324](https://github.com/icqqjs/icqq/commit/d4ed324f40e1d373c9e3eb18aa877d15a91a714a))
* 消息解析频道帖子，增加获取帖子url能力 ([64679b6](https://github.com/icqqjs/icqq/commit/64679b64e905e600b581f5836dc97640954603f9))
* 消息风控处理 ([cada61d](https://github.com/icqqjs/icqq/commit/cada61d09eaf25a2a817a9a992eacfe7d7567dd1))
* 添加_NTMediaUp ([e69fb04](https://github.com/icqqjs/icqq/commit/e69fb04662699b5a2c90443a98d9c47206c3b459))
* 添加9.0.95.19320 ([0d628ce](https://github.com/icqqjs/icqq/commit/0d628cecf7922d65a98a2f78db9d867f77067a17))
* 添加9.1.0.19695 ([f0034ac](https://github.com/icqqjs/icqq/commit/f0034acd908f544fce95c4cecac158a948eab461))
* 添加9.1.55 ([e15e1ce](https://github.com/icqqjs/icqq/commit/e15e1ce1c6b931d2c7b816f2818b52ba31a50220))
* 添加9.2.10.29175 ([a483a96](https://github.com/icqqjs/icqq/commit/a483a9643774fe4aaf6b262be65d422010b3ef38))
* 添加9.2.5.28750 ([8a691db](https://github.com/icqqjs/icqq/commit/8a691db00d7c98a5a287275ead0594d3a6936755))
* 添加9.2.5.28755 ([c13d2f0](https://github.com/icqqjs/icqq/commit/c13d2f0501c2023564c8d26a2c857b85989a1ea6))
* 添加QQ9.1.16、9.1.20、Tim4.0.95版本信息。 ([093206a](https://github.com/icqqjs/icqq/commit/093206ad642ef33c9df2dbe0910ec0196ab7d1ba))
* 添加QQ手表版本9.0.1。 ([a0b75c3](https://github.com/icqqjs/icqq/commit/a0b75c385a96d8db7c5c46d56287845630cd2d64))
* 添加QQ版本9.0.71.17655、sign启用http长连接。 ([14bc899](https://github.com/icqqjs/icqq/commit/14bc89939793a5aed32065bbbfd20cfa71b47bc5))
* 添加QQ版本9.0.75.17920。 ([b91ce68](https://github.com/icqqjs/icqq/commit/b91ce6804b128f8d7eebd980b7182f116077e6f3))
* 添加QQ版本9.0.80、9.0.81、9.0.85、9.0.90 ([5bd0229](https://github.com/icqqjs/icqq/commit/5bd02292d9b91ad5f8eb1ceeea2081f8fa7f504d))
* 添加QQ版本9.1.5.20120 ([e3330c1](https://github.com/icqqjs/icqq/commit/e3330c1215094e2290368dedccd580572dd6bac2))
* 添加开发依赖(typedoc) 用于生成文档站 ([d0ade34](https://github.com/icqqjs/icqq/commit/d0ade343cb82fe640a61906ff874dea3cedf2c56))
* 添加手表9.0.3 ([4903948](https://github.com/icqqjs/icqq/commit/490394875bf70c0ff35653cc7737742a170e837c))
* 添加新的 APK 版本信息 ([9993161](https://github.com/icqqjs/icqq/commit/99931617fe61f193c5edaa3ac548441b12801761))
* 添加版本9.1.30.22245 ([56aa4d0](https://github.com/icqqjs/icqq/commit/56aa4d03f1b9688ddb541af877dfba15b1d01433))
* 添加版本TIM4.0.96、97、98，QQ9.1.25。 ([0323e72](https://github.com/icqqjs/icqq/commit/0323e7219590ed6fab0b527f844bdb07b668a4cf))
* 禁言结果返回、群临时消息类型判断、nt_push732解析报错修复。 ([c5e6b19](https://github.com/icqqjs/icqq/commit/c5e6b196845f488b70e460f95d977b1cc8207626))
* 移除Protobuf解析中旧的浮点数和双精度数特殊判断逻辑，直接使用 fixed64 和 fixed32 进行解析。 ([eda727a](https://github.com/icqqjs/icqq/commit/eda727a13a50dd4611fffd550aef75942768f4f9))
* 移除多余的控制台日志输出并统一调试信息打印逻辑 ([739cbca](https://github.com/icqqjs/icqq/commit/739cbca1f4860d5906fde3b25517e7502c3afe8d))
* 移除音乐分享功能并重命名网址分享接口 ([af23c34](https://github.com/icqqjs/icqq/commit/af23c3422de038aef1cf45d59ba87627ba7c6238))
* 移除频道艾特解析。 ([bc9f7d1](https://github.com/icqqjs/icqq/commit/bc9f7d1ba8ac6d43a8c53558795f3e0a3fcf43d0))
* 签名api异常时禁止登录、sign白名单增加0x6d9_2、0x6d9_4（群文件）。 ([c44c727](https://github.com/icqqjs/icqq/commit/c44c7270251b374e772a4a3dddfe6e6225ae3c53))
* 缓存qimei到token中 ([f1cc657](https://github.com/icqqjs/icqq/commit/f1cc657a23e42d7939f61b46b12471be8e9931db))
* 群消息发送失败提示 ([2140c5d](https://github.com/icqqjs/icqq/commit/2140c5d43f9ad0f0955bb7aa5eca0ca7f93fc226))
* 群获取历史消息改为判断是否nt版本、刷新群资料改为判断是否nt版本并使用TrpcTcp。 ([bab8f73](https://github.com/icqqjs/icqq/commit/bab8f737e74c91f287a6c5cbf0d55cf89d804cfa))
* 艾特时判断uid是否为空、加回引用回复隐藏艾特。 ([5d2c034](https://github.com/icqqjs/icqq/commit/5d2c034d1fe29ad65b87d39d0adea4cea626a9a8))
* 表情解析优化，来自某个群友 ([f3b7440](https://github.com/icqqjs/icqq/commit/f3b74402ef650c80522a0625d527f9842d359f76))
* 解析LongMsg ([9902b93](https://github.com/icqqjs/icqq/commit/9902b93ca230f1b887c33e3b28366dd4a1d12dbc))
* 解析图片元素时使用file属性替代md5属性 ([b9663b7](https://github.com/icqqjs/icqq/commit/b9663b77c75131d9d62de5e589650e174ca46f5c))
* 触发token失效后关闭连接、修复uid解析。 ([65784bb](https://github.com/icqqjs/icqq/commit/65784bb3d05284d5c7298875b00b19126a2c055a))
* 计算并存储图片的 SHA1 值 ([5dd899f](https://github.com/icqqjs/icqq/commit/5dd899f1b5feeb142267105bbf55bc05bf4c9a6a))
* 设备信息调整、设置了签名api的情况下wtlogin.login、wtlogin.exchange_emp必须签名成功后才能发送。 ([4457426](https://github.com/icqqjs/icqq/commit/4457426bead8b10742f6f57d71ca6fa8823db312))
* 语音转码后删除缓存，支持发送 Buffer 视频 ([1000e42](https://github.com/icqqjs/icqq/commit/1000e4268eea1e71533eba1722a7588d53bd8f71))
* 调整图片处理逻辑 ([82e77b5](https://github.com/icqqjs/icqq/commit/82e77b542c9878462ba4fb101d916be2826eeb78))
* 调整消息解析流程 ([ea68469](https://github.com/icqqjs/icqq/commit/ea684691ce802b270a0d5c59fa3caa4ba7a7bfd4))
* 调整签名服务器配置逻辑与登录流程 ([ade822b](https://github.com/icqqjs/icqq/commit/ade822be0b76740972a863b159b1bcd0c0eae7f2))
* 调用client.login时判断是否在线，防止登录多次。 ([fd90d40](https://github.com/icqqjs/icqq/commit/fd90d40d313bf56a96f99e5ebc5bb0663b830de3))
* 通过APK信息判断是否NT ([c7065f4](https://github.com/icqqjs/icqq/commit/c7065f4450051c5b3e34ba621e1593f97b99cb21))
* 重构 setSignServer 方法、demo更新。 ([43ba770](https://github.com/icqqjs/icqq/commit/43ba770d0a23a249c4f4c36ce2843e0760112175))
* 重构图片上传和处理逻辑 ([769b421](https://github.com/icqqjs/icqq/commit/769b42135b973cc722842ab370049a57c9741aad))
* 重构好友与黑名单加载逻辑 ([77fa0f6](https://github.com/icqqjs/icqq/commit/77fa0f6e977839aac75f65b399c790ef6ba5429d))
* 频道消息撤回提醒，文档更新 ([f6427af](https://github.com/icqqjs/icqq/commit/f6427aff5f337d80e6e9ea7d2ca077fdf099e2fe))
* 默认sign白名单仅保留必要cmd。 ([f8e6dce](https://github.com/icqqjs/icqq/commit/f8e6dce8b25fc5cb028a71283124cded1f00361d))

## [1.8.0](https://github.com/icqqjs/icqq/compare/v1.7.2...v1.8.0) (2025-10-16)


### Features

* NT图片上传 ([39cb3f2](https://github.com/icqqjs/icqq/commit/39cb3f2378292b027f98557d1fd4104ed9a978d7))
* token ([d8c9573](https://github.com/icqqjs/icqq/commit/d8c957370817d2671af4edd826d230638f00560b))
* 为 sendUni 和 sendOidbSvcTrpcTcp 方法添加返回值类型注解 ([e82eabb](https://github.com/icqqjs/icqq/commit/e82eabb3c7f351495ee28bc202aaf2f2bee91457))
* 实现 NT 登录协议支持并重构登录流程 ([8b43f01](https://github.com/icqqjs/icqq/commit/8b43f018ff9942e881dfbea0f9044b3190ed842e))
* 新增 NT 图片 RKey 刷新功能 ([f7b53de](https://github.com/icqqjs/icqq/commit/f7b53de06da4599bf3cfadaa803ed6451fd09e3a))
* 移除音乐分享功能并优化分享接口 ([fe815c1](https://github.com/icqqjs/icqq/commit/fe815c1192d6705f9876d8ee2020fa1d1b62f387))
* 统一 Image 和 Converter 构造函数参数传递 client ([3ab005b](https://github.com/icqqjs/icqq/commit/3ab005b38f8f6ed39351757fae226c41cbe87b9d))
* 统一导入 core 模块并重构 sha1 流计算调用方式 ([93a8f37](https://github.com/icqqjs/icqq/commit/93a8f3790490694538919f5f1c9b5cb31e8cde03))
* 重构 Proto 解码与 JSON 序列化逻辑 ([761fa58](https://github.com/icqqjs/icqq/commit/761fa5897eb34c472a2cbdffc02fb16907b356a1))
* 重构视频上传逻辑，使用 Video 类处理上传任务、更新功能受限提示文案及错误码处理、调整 refreshNTPicRkey 刷新间隔判断条件、完善图片上传状态标记逻辑 ([303440d](https://github.com/icqqjs/icqq/commit/303440d0bc9d50323bbf5301f98996d9ba0f178c))
* 重构语音上传逻辑，使用 Record 类处理音频文件 ([bf86f1a](https://github.com/icqqjs/icqq/commit/bf86f1a1005e131ce319ba05bdb14c9025e03750))


### Bug Fixes

* . ([8377bb2](https://github.com/icqqjs/icqq/commit/8377bb22c98909d6047998168a51d5a8314c3b2a))
* ... ([77e20bb](https://github.com/icqqjs/icqq/commit/77e20bb9f1a181e067491d6cb5e84300e9d4e0e2))
* image ([d190fe0](https://github.com/icqqjs/icqq/commit/d190fe028675c3911ab341938ccd4763bf4dcc6d))
* image ([5e9a63e](https://github.com/icqqjs/icqq/commit/5e9a63eca7a411c7f9bf604ee04f17f961e17e0f))
* qrcode ([07e299e](https://github.com/icqqjs/icqq/commit/07e299e05b77cc5632565bd8f97c051dfaff619a))
* upday ([8ebdfae](https://github.com/icqqjs/icqq/commit/8ebdfaeed51077640441ffeaace6bd52f87e6215))
* 上传群文件空间不足时自动转为临时文件。 ([5aa988f](https://github.com/icqqjs/icqq/commit/5aa988f5d188cffb41096d1c877e394153ab6d22))
* 优化signcmd白名单匹配逻辑 ([0409dc3](https://github.com/icqqjs/icqq/commit/0409dc3b78541cb98d9b38b2922ca922acaebd65))
* 优化文件上传失败时的临时文件清理逻辑 ([dc916e8](https://github.com/icqqjs/icqq/commit/dc916e8cd1949507d33493317087ee1ac2669d65))
* 优化消息解析器构造函数参数处理 ([1a8c43b](https://github.com/icqqjs/icqq/commit/1a8c43b71033410a7940fc0cf970365bfce20515))
* 修复上传完成后返回值不正确的问题 ([c82ca27](https://github.com/icqqjs/icqq/commit/c82ca278c53639ffbe960f82d0028211c7591991))
* 图片上传 ([2235098](https://github.com/icqqjs/icqq/commit/22350986f96b53e44d5e68412cbea5ae91fb43fd))
* 图片消息处理时添加sha1长度检查 ([3a75059](https://github.com/icqqjs/icqq/commit/3a750591240821e714927930d30f537e9beeb2ab))
* 在base-client.ts文件的TlvTags映射中新增了t547标签。 ([1a89619](https://github.com/icqqjs/icqq/commit/1a896194c6cd49e515a912eda576d7bea5d064d0))
* 延迟添加图片元素到消息列表 ([e20139c](https://github.com/icqqjs/icqq/commit/e20139cf502f1e47288e486407715bd4fbd5eaba))
* 引入新的 `calculateSha1StreamBytes` 方法用于分块计算 SHA1 值以适配 NT 模式上传需求。 ([5dac3bc](https://github.com/icqqjs/icqq/commit/5dac3bc827ea1050580cd0bd2c6e3d8f4631dde3))
* 更新视频上传逻辑与字段处理 ([dadc9a1](https://github.com/icqqjs/icqq/commit/dadc9a125c603f4a0da1eb4a44c990b32d4d93d3))
* 添加_NTMediaUp ([e69fb04](https://github.com/icqqjs/icqq/commit/e69fb04662699b5a2c90443a98d9c47206c3b459))
* 移除Protobuf解析中旧的浮点数和双精度数特殊判断逻辑，直接使用 fixed64 和 fixed32 进行解析。 ([eda727a](https://github.com/icqqjs/icqq/commit/eda727a13a50dd4611fffd550aef75942768f4f9))
* 移除多余的控制台日志输出并统一调试信息打印逻辑 ([739cbca](https://github.com/icqqjs/icqq/commit/739cbca1f4860d5906fde3b25517e7502c3afe8d))
* 移除音乐分享功能并重命名网址分享接口 ([af23c34](https://github.com/icqqjs/icqq/commit/af23c3422de038aef1cf45d59ba87627ba7c6238))
* 解析图片元素时使用file属性替代md5属性 ([b9663b7](https://github.com/icqqjs/icqq/commit/b9663b77c75131d9d62de5e589650e174ca46f5c))
* 计算并存储图片的 SHA1 值 ([5dd899f](https://github.com/icqqjs/icqq/commit/5dd899f1b5feeb142267105bbf55bc05bf4c9a6a))
* 调整图片处理逻辑 ([82e77b5](https://github.com/icqqjs/icqq/commit/82e77b542c9878462ba4fb101d916be2826eeb78))
* 调整消息解析流程 ([ea68469](https://github.com/icqqjs/icqq/commit/ea684691ce802b270a0d5c59fa3caa4ba7a7bfd4))
* 调整签名服务器配置逻辑与登录流程 ([ade822b](https://github.com/icqqjs/icqq/commit/ade822be0b76740972a863b159b1bcd0c0eae7f2))
* 重构图片上传和处理逻辑 ([769b421](https://github.com/icqqjs/icqq/commit/769b42135b973cc722842ab370049a57c9741aad))
* 重构好友与黑名单加载逻辑 ([77fa0f6](https://github.com/icqqjs/icqq/commit/77fa0f6e977839aac75f65b399c790ef6ba5429d))

## [1.8.0](https://github.com/icqqjs/icqq/compare/v1.7.2...v1.8.0) (2025-10-16)


### Features

* NT图片上传 ([39cb3f2](https://github.com/icqqjs/icqq/commit/39cb3f2378292b027f98557d1fd4104ed9a978d7))
* token ([d8c9573](https://github.com/icqqjs/icqq/commit/d8c957370817d2671af4edd826d230638f00560b))
* 为 sendUni 和 sendOidbSvcTrpcTcp 方法添加返回值类型注解 ([e82eabb](https://github.com/icqqjs/icqq/commit/e82eabb3c7f351495ee28bc202aaf2f2bee91457))
* 实现 NT 登录协议支持并重构登录流程 ([8b43f01](https://github.com/icqqjs/icqq/commit/8b43f018ff9942e881dfbea0f9044b3190ed842e))
* 新增 NT 图片 RKey 刷新功能 ([f7b53de](https://github.com/icqqjs/icqq/commit/f7b53de06da4599bf3cfadaa803ed6451fd09e3a))
* 移除音乐分享功能并优化分享接口 ([fe815c1](https://github.com/icqqjs/icqq/commit/fe815c1192d6705f9876d8ee2020fa1d1b62f387))
* 统一 Image 和 Converter 构造函数参数传递 client ([3ab005b](https://github.com/icqqjs/icqq/commit/3ab005b38f8f6ed39351757fae226c41cbe87b9d))
* 统一导入 core 模块并重构 sha1 流计算调用方式 ([93a8f37](https://github.com/icqqjs/icqq/commit/93a8f3790490694538919f5f1c9b5cb31e8cde03))
* 重构 Proto 解码与 JSON 序列化逻辑 ([761fa58](https://github.com/icqqjs/icqq/commit/761fa5897eb34c472a2cbdffc02fb16907b356a1))
* 重构视频上传逻辑，使用 Video 类处理上传任务、更新功能受限提示文案及错误码处理、调整 refreshNTPicRkey 刷新间隔判断条件、完善图片上传状态标记逻辑 ([303440d](https://github.com/icqqjs/icqq/commit/303440d0bc9d50323bbf5301f98996d9ba0f178c))
* 重构语音上传逻辑，使用 Record 类处理音频文件 ([bf86f1a](https://github.com/icqqjs/icqq/commit/bf86f1a1005e131ce319ba05bdb14c9025e03750))


### Bug Fixes

* . ([8377bb2](https://github.com/icqqjs/icqq/commit/8377bb22c98909d6047998168a51d5a8314c3b2a))
* ... ([77e20bb](https://github.com/icqqjs/icqq/commit/77e20bb9f1a181e067491d6cb5e84300e9d4e0e2))
* image ([d190fe0](https://github.com/icqqjs/icqq/commit/d190fe028675c3911ab341938ccd4763bf4dcc6d))
* image ([5e9a63e](https://github.com/icqqjs/icqq/commit/5e9a63eca7a411c7f9bf604ee04f17f961e17e0f))
* qrcode ([07e299e](https://github.com/icqqjs/icqq/commit/07e299e05b77cc5632565bd8f97c051dfaff619a))
* upday ([8ebdfae](https://github.com/icqqjs/icqq/commit/8ebdfaeed51077640441ffeaace6bd52f87e6215))
* 上传群文件空间不足时自动转为临时文件。 ([5aa988f](https://github.com/icqqjs/icqq/commit/5aa988f5d188cffb41096d1c877e394153ab6d22))
* 优化signcmd白名单匹配逻辑 ([0409dc3](https://github.com/icqqjs/icqq/commit/0409dc3b78541cb98d9b38b2922ca922acaebd65))
* 优化文件上传失败时的临时文件清理逻辑 ([dc916e8](https://github.com/icqqjs/icqq/commit/dc916e8cd1949507d33493317087ee1ac2669d65))
* 修复上传完成后返回值不正确的问题 ([c82ca27](https://github.com/icqqjs/icqq/commit/c82ca278c53639ffbe960f82d0028211c7591991))
* 图片上传 ([2235098](https://github.com/icqqjs/icqq/commit/22350986f96b53e44d5e68412cbea5ae91fb43fd))
* 图片消息处理时添加sha1长度检查 ([3a75059](https://github.com/icqqjs/icqq/commit/3a750591240821e714927930d30f537e9beeb2ab))
* 延迟添加图片元素到消息列表 ([e20139c](https://github.com/icqqjs/icqq/commit/e20139cf502f1e47288e486407715bd4fbd5eaba))
* 引入新的 `calculateSha1StreamBytes` 方法用于分块计算 SHA1 值以适配 NT 模式上传需求。 ([5dac3bc](https://github.com/icqqjs/icqq/commit/5dac3bc827ea1050580cd0bd2c6e3d8f4631dde3))
* 更新视频上传逻辑与字段处理 ([dadc9a1](https://github.com/icqqjs/icqq/commit/dadc9a125c603f4a0da1eb4a44c990b32d4d93d3))
* 添加_NTMediaUp ([e69fb04](https://github.com/icqqjs/icqq/commit/e69fb04662699b5a2c90443a98d9c47206c3b459))
* 移除Protobuf解析中旧的浮点数和双精度数特殊判断逻辑，直接使用 fixed64 和 fixed32 进行解析。 ([eda727a](https://github.com/icqqjs/icqq/commit/eda727a13a50dd4611fffd550aef75942768f4f9))
* 移除多余的控制台日志输出并统一调试信息打印逻辑 ([739cbca](https://github.com/icqqjs/icqq/commit/739cbca1f4860d5906fde3b25517e7502c3afe8d))
* 移除音乐分享功能并重命名网址分享接口 ([af23c34](https://github.com/icqqjs/icqq/commit/af23c3422de038aef1cf45d59ba87627ba7c6238))
* 解析图片元素时使用file属性替代md5属性 ([b9663b7](https://github.com/icqqjs/icqq/commit/b9663b77c75131d9d62de5e589650e174ca46f5c))
* 计算并存储图片的 SHA1 值 ([5dd899f](https://github.com/icqqjs/icqq/commit/5dd899f1b5feeb142267105bbf55bc05bf4c9a6a))
* 调整图片处理逻辑 ([82e77b5](https://github.com/icqqjs/icqq/commit/82e77b542c9878462ba4fb101d916be2826eeb78))
* 调整消息解析流程 ([ea68469](https://github.com/icqqjs/icqq/commit/ea684691ce802b270a0d5c59fa3caa4ba7a7bfd4))
* 调整签名服务器配置逻辑与登录流程 ([ade822b](https://github.com/icqqjs/icqq/commit/ade822be0b76740972a863b159b1bcd0c0eae7f2))
* 重构图片上传和处理逻辑 ([769b421](https://github.com/icqqjs/icqq/commit/769b42135b973cc722842ab370049a57c9741aad))
* 重构好友与黑名单加载逻辑 ([77fa0f6](https://github.com/icqqjs/icqq/commit/77fa0f6e977839aac75f65b399c790ef6ba5429d))

## [1.7.2](https://github.com/icqqjs/icqq/compare/v1.7.1...v1.7.2) (2025-09-06)


### Bug Fixes

* getApkInfoList ([a8c55bc](https://github.com/icqqjs/icqq/commit/a8c55bc4082ffaefdd4053a10fdd2e2bf294176d))
* logout ([c34c539](https://github.com/icqqjs/icqq/commit/c34c5393ee46dbaa66eb72b4590b6a4d2207f000))
* system.offline ([c880cbe](https://github.com/icqqjs/icqq/commit/c880cbedd9c515392f09252574d39b99888f1a27))
* 优化下线消息携带原因说明 ([c6cb781](https://github.com/icqqjs/icqq/commit/c6cb7811e5f89f7ab0ba09b5337d5cb3f12e5fea))
* 添加9.2.10.29175 ([a483a96](https://github.com/icqqjs/icqq/commit/a483a9643774fe4aaf6b262be65d422010b3ef38))

## [1.7.1](https://github.com/icqqjs/icqq/compare/v1.7.0...v1.7.1) (2025-08-26)


### Bug Fixes

* ... ([e017a37](https://github.com/icqqjs/icqq/commit/e017a371d804bda6dab332c0a89e8fe478b3c927))
* 544 ([df9938f](https://github.com/icqqjs/icqq/commit/df9938f249dd1fb42465262d85686395bb4335d9))
* CmdWhiteList ([0365a5f](https://github.com/icqqjs/icqq/commit/0365a5f636c7a79d4ffa79ed1d4f84aae7fb314c))
* CustomApkInfo ([54ed8a9](https://github.com/icqqjs/icqq/commit/54ed8a99fd7b431aa25dfca2dc14986b89652586))
* lint ([b1cd8c7](https://github.com/icqqjs/icqq/commit/b1cd8c736aac5381e8c331f2f9c8e67c75fba8b8))
* qr ([b2f4d09](https://github.com/icqqjs/icqq/commit/b2f4d092a48b716d6534ed9845ef9960679307aa))
* queryQrcodeResult ([2e6d584](https://github.com/icqqjs/icqq/commit/2e6d58410258b8c6897d7712d75a8ae11263ed7d))
* signCmd改为正则匹配 ([47c4ce2](https://github.com/icqqjs/icqq/commit/47c4ce2c556f409eb10077aeefec945ef01d8708))
* upday ([a2d1132](https://github.com/icqqjs/icqq/commit/a2d1132d70b32c9bb80ff56fe7cdbefd8c400a90))
* 优化二维码登录流程并添加二维码信息参数 ([a331d09](https://github.com/icqqjs/icqq/commit/a331d0996bc90f8dd383418b99ddde67ecfa78bc))
* 增加创建自定义版本信息文件的日志输出 ([2ec0689](https://github.com/icqqjs/icqq/commit/2ec06890718c34ec79c29e6f6ea0374e44d203b0))
* 延迟 ([627d2a0](https://github.com/icqqjs/icqq/commit/627d2a0b50c5975559e1b279bdf7c3ef9f6fa161))
* 更新签名 API 调用条件和参数 ([0511a6e](https://github.com/icqqjs/icqq/commit/0511a6e386618a3e8f44b72ba4e8dd784c2838a6))
* 添加9.2.5.28750 ([8a691db](https://github.com/icqqjs/icqq/commit/8a691db00d7c98a5a287275ead0594d3a6936755))
* 添加9.2.5.28755 ([c13d2f0](https://github.com/icqqjs/icqq/commit/c13d2f0501c2023564c8d26a2c857b85989a1ea6))
* 添加新的 APK 版本信息 ([9993161](https://github.com/icqqjs/icqq/commit/99931617fe61f193c5edaa3ac548441b12801761))
* 重构 setSignServer 方法、demo更新。 ([43ba770](https://github.com/icqqjs/icqq/commit/43ba770d0a23a249c4f4c36ce2843e0760112175))

## [1.7.0](https://github.com/icqqjs/icqq/compare/v1.6.6...v1.7.0) (2025-07-10)


### Features

* 添加身份验证事件和相关处理 ([cd0b369](https://github.com/icqqjs/icqq/commit/cd0b369e14cf41bbc7da15c1f50459de39b76f99))


### Bug Fixes

* 修复NT多层转发无法正常显示。 ([00a7ea5](https://github.com/icqqjs/icqq/commit/00a7ea5f905cf077b6e00434e91d914603725b79))

## [1.6.6](https://github.com/icqqjs/icqq/compare/v1.6.5...v1.6.6) (2025-04-14)


### Bug Fixes

* **device:** 更新 TIM、watch 版本 ([7dc4d3b](https://github.com/icqqjs/icqq/commit/7dc4d3be676a64fbb2643697199adc07459f0685))
* **device:** 添加新的 APK 版本信息 ([b35362c](https://github.com/icqqjs/icqq/commit/b35362cf037e7c4faf0150c0878a2376d5805ddc))
* 优化签名验证逻辑 ([2b80def](https://github.com/icqqjs/icqq/commit/2b80deff3ee70e2f0068e2493beef00f502b428f))

## [1.6.5](https://github.com/icqqjs/icqq/compare/v1.6.4...v1.6.5) (2025-03-28)


### Bug Fixes

* NT上线包设备信息调整。 ([1a50da0](https://github.com/icqqjs/icqq/commit/1a50da0b4e0af08f926d83e2ea9617f7a687621b))
* parseImgElem ([6243512](https://github.com/icqqjs/icqq/commit/624351240a480367e969f98d00586d31f72072c3))
* refactor(device): 更新设备信息生成逻辑和 APK 版本列表 ([4ed0039](https://github.com/icqqjs/icqq/commit/4ed003900b38b1bce754cbca5985d047feab612a))
* refactor(message): 优化消息解析中的图片 URL 生成逻辑 ([47bf149](https://github.com/icqqjs/icqq/commit/47bf14903b7425d1ec4423fa1d25d3a1f4ff7574))
* sface、超级表情 ([4e5c8bd](https://github.com/icqqjs/icqq/commit/4e5c8bd1a8632f76f144afa673118274b94fae7a))
* **src:** 修复 Group 发送消息时消息 ID 生成错误 ([f1f9bfe](https://github.com/icqqjs/icqq/commit/f1f9bfe1c0392dd82ef1b9f9a2a6f40ff473f32c))
* 协议调整。 ([c25fb9f](https://github.com/icqqjs/icqq/commit/c25fb9fff9c9246d23e20dfdd33b3835a34840f6))
* 掉线推送包解析异常捕获。 ([9647635](https://github.com/icqqjs/icqq/commit/964763534ad81847d0c5dce7ffdd49069928092c))
* 签名api异常时禁止登录、sign白名单增加0x6d9_2、0x6d9_4（群文件）。 ([c44c727](https://github.com/icqqjs/icqq/commit/c44c7270251b374e772a4a3dddfe6e6225ae3c53))
* 设备信息调整、设置了签名api的情况下wtlogin.login、wtlogin.exchange_emp必须签名成功后才能发送。 ([4457426](https://github.com/icqqjs/icqq/commit/4457426bead8b10742f6f57d71ca6fa8823db312))

## [1.6.4](https://github.com/icqqjs/icqq/compare/v1.6.3...v1.6.4) (2025-03-16)


### Bug Fixes

* emp失败时走token过期 ([02d2985](https://github.com/icqqjs/icqq/commit/02d29858acf8530b8a7e006ca52733d4d8362100))
* ntSub0x27 ([0f76045](https://github.com/icqqjs/icqq/commit/0f76045854c6bae64c0279f9432267cc501a42ac))
* sendMergeUni ([70e272c](https://github.com/icqqjs/icqq/commit/70e272ca289bcaa0439c0fc23de6ec8c4f82fea4))
* sendMergeUni ([bace72f](https://github.com/icqqjs/icqq/commit/bace72ffb262f64b3407e1a054a03c7347080f2f))
* sendMergeUni ([762c2a0](https://github.com/icqqjs/icqq/commit/762c2a0b2f0f7f1cd3454b3fa91523eba4b476a3))
* 取消合并发送。 ([3be7548](https://github.com/icqqjs/icqq/commit/3be7548065555e823a9d2dce2c163325a15b6c3f))
* 只有一条合并包的话走正常发送。 ([5c34aba](https://github.com/icqqjs/icqq/commit/5c34abab813d5a1ba2f04b2500740663ff2d0e03))
* 增加sendMergeUni（合并发送多个业务包） ([68995fc](https://github.com/icqqjs/icqq/commit/68995fcd794f7f9c2beb21f097432747da5b9d89))
* 查询群成员信息、群资料信息时合并多个查询包。 ([be2ade4](https://github.com/icqqjs/icqq/commit/be2ade4b586ea62a60b10f466a75cae32d48e237))

## [1.6.3](https://github.com/icqqjs/icqq/compare/v1.6.2...v1.6.3) (2025-03-13)


### Bug Fixes

* refreshToken ([a29dd22](https://github.com/icqqjs/icqq/commit/a29dd222278792f0636eb09615d4450df5457101))
* signAPICheck ([445a437](https://github.com/icqqjs/icqq/commit/445a4370cc03fa56f1503e2d25c920247628bda2))

## [1.6.2](https://github.com/icqqjs/icqq/compare/v1.6.1...v1.6.2) (2025-03-13)


### Bug Fixes

* . ([c2fe052](https://github.com/icqqjs/icqq/commit/c2fe05204ef62ca7f653d11f7329fe9b8d45bae8))
* ... ([1986731](https://github.com/icqqjs/icqq/commit/1986731e747babf3c711acecc3a63dd10fd511f2))
* buildLoginPacket ([52741aa](https://github.com/icqqjs/icqq/commit/52741aadb826ccd82dc7b3c121231f105e9759b3))
* buildPacket ([8ad853d](https://github.com/icqqjs/icqq/commit/8ad853dde499d17bfb58d86b731f8dc08c1e9197))
* buildPacket ([329a1a2](https://github.com/icqqjs/icqq/commit/329a1a2226676c10f904821e965079f853911bd9))
* buildPacket、sendPacket ([289430f](https://github.com/icqqjs/icqq/commit/289430fe7a8b1f7fb1825e795a31a6e6eb224503))
* buildQrcodePacket ([328a0c7](https://github.com/icqqjs/icqq/commit/328a0c7f94dd6328289a1cfc190ff294cd54789a))
* buildTransPacket ([251d03e](https://github.com/icqqjs/icqq/commit/251d03e46ac9e612e7836af2656cb5141f093f51))
* code2uin、uin2code ([3825599](https://github.com/icqqjs/icqq/commit/382559974a53f7ef88815e33f08265ba5bb7929b))
* ntGroupEvent ([a4ffd8e](https://github.com/icqqjs/icqq/commit/a4ffd8eced51d3510c475471a55c712c74117476))
* ntPush528 ([b8dff8c](https://github.com/icqqjs/icqq/commit/b8dff8c6ac5f4399492cf38e9767a48c23b7de91))
* ntPush528事件补全 ([e6c8a01](https://github.com/icqqjs/icqq/commit/e6c8a0128f565daf014a2c7d8eb8d45fe8553a29))
* ntPush732 ([d43b35d](https://github.com/icqqjs/icqq/commit/d43b35dc24d3e8bdf328da692ca1ef34ab394a76))
* ntPush732事件补全 ([dda7ebd](https://github.com/icqqjs/icqq/commit/dda7ebd40e6ed065a37754ba0b2f5fc924312b80))
* NT群事件 ([1a54fa5](https://github.com/icqqjs/icqq/commit/1a54fa5c2e1af6a996f957253d107820f02ddef4))
* Reader buffer ([8745d15](https://github.com/icqqjs/icqq/commit/8745d157f024721c5139335216ed32f73bc4c287))
* sendPacket ([42c7ead](https://github.com/icqqjs/icqq/commit/42c7ead12c55ebef418ef53aba2212095e2cf28c))
* sendPacket改为调用buildPacket ([e20bc45](https://github.com/icqqjs/icqq/commit/e20bc45dcf272ad21e226a3c1c7cf4a07fd4f3ab))
* seq ([3fcff78](https://github.com/icqqjs/icqq/commit/3fcff78b037ba3c7d57e9d64bd81aa08bee57764))
* seq ([ca06d93](https://github.com/icqqjs/icqq/commit/ca06d93b4a4229eca76f13b95e1192d230fce055))
* SsoHeartBeat ([c46d62f](https://github.com/icqqjs/icqq/commit/c46d62fdacd839568e8a70d51044de9a95f1516c))
* 发包返回错误时抛出异常 ([743268c](https://github.com/icqqjs/icqq/commit/743268cef4f46c75a68239c3d0c3d36942529df0))
* 增加getPicUrl ([7f31c9c](https://github.com/icqqjs/icqq/commit/7f31c9cd0909acf2d83f04fb3ba08dcb711a0faf))
* 添加9.1.55 ([e15e1ce](https://github.com/icqqjs/icqq/commit/e15e1ce1c6b931d2c7b816f2818b52ba31a50220))
* 缓存qimei到token中 ([f1cc657](https://github.com/icqqjs/icqq/commit/f1cc657a23e42d7939f61b46b12471be8e9931db))
* 群消息发送失败提示 ([2140c5d](https://github.com/icqqjs/icqq/commit/2140c5d43f9ad0f0955bb7aa5eca0ca7f93fc226))

## [1.6.1](https://github.com/icqqjs/icqq/compare/v1.6.0...v1.6.1) (2025-03-08)


### Bug Fixes

* getApkInfoList ([370a7df](https://github.com/icqqjs/icqq/commit/370a7df9f84d02cbb99b10b9a51a4439c56b5342))
* getStatusInfo ([32007a2](https://github.com/icqqjs/icqq/commit/32007a29df2f30c1d61d366d0a0626368dae832b))
* getUserProfile ([e11a4b0](https://github.com/icqqjs/icqq/commit/e11a4b0c65ff2030c2ccef09f21da162d74e64e4))
* getUserProfile、readCustomApkInfoList ([bb8bd0d](https://github.com/icqqjs/icqq/commit/bb8bd0da97ac0ec8a4ff53dc7c02d636ee152059))
* NT资料更新事件处理。 ([6f7d046](https://github.com/icqqjs/icqq/commit/6f7d0460d63e22492f3b92d474308fafc567f95a))
* readCustomApkInfoList ([72c03fb](https://github.com/icqqjs/icqq/commit/72c03fb0bb06008c95f32e7946bdb46b5c0b759a))
* readCustomApkInfoList ([fe263c7](https://github.com/icqqjs/icqq/commit/fe263c70f505f8b0b14dbaf441f5800f75c75b9a))
* 增加getStatusInfo ([dfa7002](https://github.com/icqqjs/icqq/commit/dfa7002744978768a6b41df90061755cd725f089))

## [1.6.0](https://github.com/icqqjs/icqq/compare/v1.5.12...v1.6.0) (2025-03-07)


### Features

* 登录token按包名储存、其他一大堆修改 ([0bb81f0](https://github.com/icqqjs/icqq/commit/0bb81f082ad4fbd8c7a2f05f48ecb1a07bb3f365))


### Bug Fixes

* getNTPicInfobyFileid error ([440521e](https://github.com/icqqjs/icqq/commit/440521e87e7a9badd8d39023ac4a3a002ada6f77))
* lint:fix ([79c1a1f](https://github.com/icqqjs/icqq/commit/79c1a1f8ae0068654f3b015bd480733cb967d5c8))
* 心跳 ([ccf937f](https://github.com/icqqjs/icqq/commit/ccf937f3f20ee458730e05efa8ec0ffb3f4f6bdb))

## [1.5.12](https://github.com/icqqjs/icqq/compare/v1.5.11...v1.5.12) (2025-02-22)


### Bug Fixes

* ? ([75536ec](https://github.com/icqqjs/icqq/commit/75536eca1a143fb2203e7aecc87f69548b6e1739))
* . ([9cfe1e0](https://github.com/icqqjs/icqq/commit/9cfe1e0078708cd09b1929ee3e1f29d1d5090a94))
* . ([495151e](https://github.com/icqqjs/icqq/commit/495151e5092292c8134d2d0bdee7034e3d259eff))
* NT上线群禁言等功能报错问题。 ([2b0a6f6](https://github.com/icqqjs/icqq/commit/2b0a6f67d9b1198dbf3244575da168cf4818865a))
* parse ([d746f0f](https://github.com/icqqjs/icqq/commit/d746f0fb16a7b715afe236114eb3eff071933d81))
* 刷新群员资料时获取群员uid ([09a9d9d](https://github.com/icqqjs/icqq/commit/09a9d9d4dbbb6b1046b96455d85754d1741c141d))
* 发送心跳时判断客户端是否在线。 ([6375b2b](https://github.com/icqqjs/icqq/commit/6375b2b5a3cb989b92361f1ce2c39b3a4548eb31))
* 艾特时判断uid是否为空、加回引用回复隐藏艾特。 ([5d2c034](https://github.com/icqqjs/icqq/commit/5d2c034d1fe29ad65b87d39d0adea4cea626a9a8))

## [1.5.11](https://github.com/icqqjs/icqq/compare/v1.5.10...v1.5.11) (2025-02-12)


### Bug Fixes

* user_uid ([bd42c7f](https://github.com/icqqjs/icqq/commit/bd42c7f9e842080f1ccb789c7730df3ab32951b4))

## [1.5.10](https://github.com/icqqjs/icqq/compare/v1.5.9...v1.5.10) (2025-02-12)


### Bug Fixes

* 。 ([6821a2a](https://github.com/icqqjs/icqq/commit/6821a2ae0c29f956a2710850b6dc4e246a3d69ef))
* parser ([3cdc8b0](https://github.com/icqqjs/icqq/commit/3cdc8b042046459ab7a924e97e8e8b7be25bcbdc))
* upday ([4a2570a](https://github.com/icqqjs/icqq/commit/4a2570aeb6c3dff63c01c3940658e8a2f8fc6138))
* user_uid ([df1b3e9](https://github.com/icqqjs/icqq/commit/df1b3e991a761c19ec8c3c1956b20bfd3704dad4))
* user_uid ([a117ebe](https://github.com/icqqjs/icqq/commit/a117ebed353d0b6b1a4554ad149fadb75763a415))
* 消息发送判断 ([6862d33](https://github.com/icqqjs/icqq/commit/6862d33c5526879e73d7a5489c337ea080ba6eaa))
* 消息发送结果判断、仅在包名不匹配时触发重新登录 ([d256fda](https://github.com/icqqjs/icqq/commit/d256fdaffdb07db924fe2ecc409990c3b4ad9c5c))

## [1.5.9](https://github.com/icqqjs/icqq/compare/v1.5.8...v1.5.9) (2025-01-27)


### Bug Fixes

* owner_id ([4b6a96c](https://github.com/icqqjs/icqq/commit/4b6a96cad65310df739400a626ba53f9b14345dd))

## [1.5.8](https://github.com/icqqjs/icqq/compare/v1.5.7...v1.5.8) (2025-01-25)


### Bug Fixes

* checkTag ([2608710](https://github.com/icqqjs/icqq/commit/260871019c6f83768f590e9761d67961eb7faa7a))
* QQNT下线通知处理。 ([ba537a3](https://github.com/icqqjs/icqq/commit/ba537a3f4d1b970e235d7620168ca409fd4e2a78))
* 事件处理异常 ([e5b9927](https://github.com/icqqjs/icqq/commit/e5b9927dfff9e74fe4df00c50ee2e5d3c3063019))
* 增加群表情回应事件 ([cbf15c9](https://github.com/icqqjs/icqq/commit/cbf15c9d2757f4b6babed8615f7ed3304719f313))

## [1.5.7](https://github.com/icqqjs/icqq/compare/v1.5.6...v1.5.7) (2025-01-20)


### Bug Fixes

* pickUser ([2ec8bfd](https://github.com/icqqjs/icqq/commit/2ec8bfdf4bf8bc51f5aab2323f6d6a7f905e7d8e))

## [1.5.6](https://github.com/icqqjs/icqq/compare/v1.5.5...v1.5.6) (2025-01-20)


### Bug Fixes

* 529消息类型错误 ([55c2624](https://github.com/icqqjs/icqq/commit/55c262403642a478936a997b3cb9b7b2b59f4f08))
* QQNT默认启用。 ([2a5ea5d](https://github.com/icqqjs/icqq/commit/2a5ea5dd97aad7df37bbd448b54451f1c2ca7f33))
* 默认sign白名单仅保留必要cmd。 ([f8e6dce](https://github.com/icqqjs/icqq/commit/f8e6dce8b25fc5cb028a71283124cded1f00361d))

## [1.5.5](https://github.com/icqqjs/icqq/compare/v1.5.4...v1.5.5) (2025-01-16)


### Bug Fixes

* nt_push732 ([ac5eadb](https://github.com/icqqjs/icqq/commit/ac5eadbf2f87b0369f18223e3212ed8d3f0a3f83))
* nt_push732 ([eff6b10](https://github.com/icqqjs/icqq/commit/eff6b10df119fca8857bd64301871525032a9bac))
* nt_sub0x27事件处理异常 ([942b17c](https://github.com/icqqjs/icqq/commit/942b17ca66d4bd95dd81549e34246f12c0c6c4b7))
* 去除引用回复at ([a66f8dd](https://github.com/icqqjs/icqq/commit/a66f8dd12db46daecae2a7b4f057d149c90ac341))
* 禁言结果返回、群临时消息类型判断、nt_push732解析报错修复。 ([c5e6b19](https://github.com/icqqjs/icqq/commit/c5e6b196845f488b70e460f95d977b1cc8207626))

## [1.5.4](https://github.com/icqqjs/icqq/compare/v1.5.3...v1.5.4) (2025-01-01)


### Bug Fixes

* file: ([592beed](https://github.com/icqqjs/icqq/commit/592beed7a51215e6fff6873849976122f22741a7))

## [1.5.3](https://github.com/icqqjs/icqq/compare/v1.5.2...v1.5.3) (2025-01-01)


### Bug Fixes

* . ([7969784](https://github.com/icqqjs/icqq/commit/7969784adf5b65a16d2ccaf831c643297d95ed0e))
* SsoHeartBeat ([2689b91](https://github.com/icqqjs/icqq/commit/2689b91b5dc6c0b5439da8061d9c0665210f7808))
* upday ([f80bebd](https://github.com/icqqjs/icqq/commit/f80bebdb732ef0f400918ad4ae742292cc48c1a5))

## [1.5.2](https://github.com/icqqjs/icqq/compare/v1.5.1...v1.5.2) (2025-01-01)


### Bug Fixes

* QQNT ([46af812](https://github.com/icqqjs/icqq/commit/46af812313cbcc5cba8c4421fc3d679e0488871a))
* uid -&gt; user_uid ([b9f28b0](https://github.com/icqqjs/icqq/commit/b9f28b0c33bca194ccdf358226ac5736fda30e3b))

## [1.5.1](https://github.com/icqqjs/icqq/compare/v1.5.0...v1.5.1) (2024-12-31)


### Bug Fixes

* ？ ([9a99156](https://github.com/icqqjs/icqq/commit/9a991560ede772bf5d37434be23d636c5c76fbda))

## [1.5.0](https://github.com/icqqjs/icqq/compare/v1.4.0...v1.5.0) (2024-12-31)


### Features

* QQNT ([51d6d0f](https://github.com/icqqjs/icqq/commit/51d6d0f1b3f87056ddc901ea47156445429a1d26))
* 账号功能受限提示 ([7ae40e9](https://github.com/icqqjs/icqq/commit/7ae40e9bfdf75f44f1dc127585c681962796facc))


### Bug Fixes

* heartbeat ([438d557](https://github.com/icqqjs/icqq/commit/438d5576bedf9a1e6d0028be7acf07a0e5da32d3))
* Heartbeat ([5f57c44](https://github.com/icqqjs/icqq/commit/5f57c44bc58e42c93941805ddaf24b8dd336fc86))
* Heartbeat ([583a164](https://github.com/icqqjs/icqq/commit/583a164b87ce9812bc55fd9e7682d2d60d4e3ad5))
* HeartBeat ([55fa274](https://github.com/icqqjs/icqq/commit/55fa274aad0eff74717a382edbd415970a0f83ed))
* NT加好友事件 ([4607095](https://github.com/icqqjs/icqq/commit/460709566333acd95c2602211ba9bfe0226ab423))
* NT群临时、私聊、离线文件消息解析 ([820a2c4](https://github.com/icqqjs/icqq/commit/820a2c43022266acdadd90d9da62d67c7484f2a2))
* parsePoke ([14a18d5](https://github.com/icqqjs/icqq/commit/14a18d563a1a56db8f0bbbda06e5d805bbe1dbcb))
* QQNT群信息解析 ([351dc6d](https://github.com/icqqjs/icqq/commit/351dc6d3f014cbee04b0947233507327390ac74b))
* register ([9384c10](https://github.com/icqqjs/icqq/commit/9384c1007ca7545ce1afe0baee975cff31bc5629))
* register ([5729ac3](https://github.com/icqqjs/icqq/commit/5729ac34c35a20e285681c6f10cd1d3646305890))
* register ([9e0fc15](https://github.com/icqqjs/icqq/commit/9e0fc15523042e03ee24f53c0b9c337a31df26b1))
* ReserveField ([c2ebe82](https://github.com/icqqjs/icqq/commit/c2ebe822bcd09d98c323afcb3647af3be42d2817))
* setOnlineStatus ([fecb49b](https://github.com/icqqjs/icqq/commit/fecb49bbe62b1fe2e17e5346d965761de6eb7028))
* SsoHeartBeat ([4242ba7](https://github.com/icqqjs/icqq/commit/4242ba7426562422562a22ade93a1be224a0d8d9))
* SsoHeartBeat ([72f941f](https://github.com/icqqjs/icqq/commit/72f941fe797583462d42f77e8473f2dd5e458c1d))
* ssoPushAck ([2511738](https://github.com/icqqjs/icqq/commit/25117386005006b7c398cd0f7b3ca622796cef10))
* 添加版本9.1.30.22245 ([56aa4d0](https://github.com/icqqjs/icqq/commit/56aa4d03f1b9688ddb541af877dfba15b1d01433))

## [1.4.0](https://github.com/icqqjs/icqq/compare/v1.3.2...v1.4.0) (2024-12-20)


### Features

* 好友uid改为uin，新uid为u_开头、好友获取历史消息增加nt版本判断。 ([81b7df3](https://github.com/icqqjs/icqq/commit/81b7df3d73bbba74374914aaaf2355d9da0646c8))
* 支持解析nt版本消息 ([a6dafb3](https://github.com/icqqjs/icqq/commit/a6dafb397bfa920b6e03e5d733f84319b82d3f7d))


### Bug Fixes

* getNtVideoUrl ([1091b21](https://github.com/icqqjs/icqq/commit/1091b215c752460c1b67a12a85f0f1c94a9c52ec))
* getNtVideoUrl、getNtPttUrl ([4c338d1](https://github.com/icqqjs/icqq/commit/4c338d164210b9be0e824cf0618d8009935cdc33))
* image file、getNt -&gt; getNT ([9225f5a](https://github.com/icqqjs/icqq/commit/9225f5a81d31b2231a29ad1973904307f676027e))
* loadFL ([8baff93](https://github.com/icqqjs/icqq/commit/8baff939389fcc2466a765b22748b67733ef3c4e))
* nt图片语音视频解析和转发 ([ae2c6de](https://github.com/icqqjs/icqq/commit/ae2c6de72c6823b3d08f7a493c5d1b97305a72eb))
* parser ([ab7275f](https://github.com/icqqjs/icqq/commit/ab7275f8a0f2be15423ed1f99d7962910339c9dc))
* setGroupJoinType ([63f9444](https://github.com/icqqjs/icqq/commit/63f9444b0cba20379a92c873865c7ba71f41f843))
* sign调用耗时使用hrtime计算 ([0b01de8](https://github.com/icqqjs/icqq/commit/0b01de8c6cb2692c821a4fd1fb62fa3559c26df5))
* 修复 jce 的 map 数字 key 自动转 string 的 bug ([8bae76e](https://github.com/icqqjs/icqq/commit/8bae76e96c69fe55c817b9221d1a9036ae716e3a))
* 允许SignApi返回空sign ([0c1c97d](https://github.com/icqqjs/icqq/commit/0c1c97d62564083246b5648f1d24e2d309b3518a))
* 动态读取好友uid ([a4de242](https://github.com/icqqjs/icqq/commit/a4de24292dcf77fcfe66a552414046123366a6aa))
* 增加qq版本9.1.10.20545 ([0e09daa](https://github.com/icqqjs/icqq/commit/0e09daa1852ed6ce6e52ea94acce032f015da55b))
* 安卓手机协议扫码登录使用apad的appid。 ([a4e57ea](https://github.com/icqqjs/icqq/commit/a4e57eac773406a94b06b034e40826ed8f8ab0e5))
* 心跳间隔改为60秒 ([d361009](https://github.com/icqqjs/icqq/commit/d361009514dc8b90de89ff38621b5cf09e14fab2))
* 扫码登录屏蔽不支持的协议（手机、apad） ([9f87af3](https://github.com/icqqjs/icqq/commit/9f87af3fc74f693cd8dc384c956543f6cc8bce2a))
* 提高 pb 结构处理的兼容性，修复报错 ([beca19d](https://github.com/icqqjs/icqq/commit/beca19dc8a98478cb515a2f6665e53029838ad4e))
* 添加QQ9.1.16、9.1.20、Tim4.0.95版本信息。 ([093206a](https://github.com/icqqjs/icqq/commit/093206ad642ef33c9df2dbe0910ec0196ab7d1ba))
* 添加QQ版本9.1.5.20120 ([e3330c1](https://github.com/icqqjs/icqq/commit/e3330c1215094e2290368dedccd580572dd6bac2))
* 添加手表9.0.3 ([4903948](https://github.com/icqqjs/icqq/commit/490394875bf70c0ff35653cc7737742a170e837c))
* 添加版本TIM4.0.96、97、98，QQ9.1.25。 ([0323e72](https://github.com/icqqjs/icqq/commit/0323e7219590ed6fab0b527f844bdb07b668a4cf))

## [1.3.2](https://github.com/icqqjs/icqq/compare/v1.3.1...v1.3.2) (2024-09-26)


### Bug Fixes

* 删除自动调用requestToken ([eba4167](https://github.com/icqqjs/icqq/commit/eba41670ac819182b108965f8bd4db5452e865d9))
* 群获取历史消息改为判断是否nt版本、刷新群资料改为判断是否nt版本并使用TrpcTcp。 ([bab8f73](https://github.com/icqqjs/icqq/commit/bab8f737e74c91f287a6c5cbf0d55cf89d804cfa))

## [1.3.1](https://github.com/icqqjs/icqq/compare/v1.3.0...v1.3.1) (2024-09-23)


### Bug Fixes

* **group:** 获取群分享JSON ([46bb61c](https://github.com/icqqjs/icqq/commit/46bb61c2a80f85cbefd17cfa2071342cb8ee52d1))
* watch 9.0.1 增加nt标识 ([ae0417d](https://github.com/icqqjs/icqq/commit/ae0417d70527be27bd362c41e08a9899af00bc1e))
* 消息解析增加异常捕获 ([e2b96b6](https://github.com/icqqjs/icqq/commit/e2b96b618ecded699f3c6ac2ec9883562b74ecb4))
* 添加9.1.0.19695 ([f0034ac](https://github.com/icqqjs/icqq/commit/f0034acd908f544fce95c4cecac158a948eab461))
* 触发token失效后关闭连接、修复uid解析。 ([65784bb](https://github.com/icqqjs/icqq/commit/65784bb3d05284d5c7298875b00b19126a2c055a))

## [1.3.0](https://github.com/icqqjs/icqq/compare/v1.2.6...v1.3.0) (2024-09-16)


### Features

* **group:** 新增设置加群方式函数 ([fcda563](https://github.com/icqqjs/icqq/commit/fcda563aa63459ce171d6d1adb26f15f31662e96))
* **group:** 新增设置发言限频函数 ([29e14a7](https://github.com/icqqjs/icqq/commit/29e14a7c8bca77d705c70981f65397519778ce83))
* **image:** 优先从传入的elem中获取图片宽高 ([fd58e19](https://github.com/icqqjs/icqq/commit/fd58e19a1a8c748269d8451384f7ed6b9c4ebdcd))
* 新增删除表情表态功能 ([c6ee888](https://github.com/icqqjs/icqq/commit/c6ee888b5d09a8d191c604739f332c88800cd594))


### Bug Fixes

* nt voice ([79be05a](https://github.com/icqqjs/icqq/commit/79be05ade9e83454b3ea7da451422e69b1e417c4))
* nt 视频 ([3a7b1da](https://github.com/icqqjs/icqq/commit/3a7b1da012f6f7f8a0d305b8bfff5c3735bf4fd1))
* string ([292a8ed](https://github.com/icqqjs/icqq/commit/292a8edc8862b9cd01adf5782d2bce13c007f572))
* 一不小心多删了两行 ([925b079](https://github.com/icqqjs/icqq/commit/925b07922cc770552876f78fa472a7d6b6017f6a))
* 代码格式 ([5509763](https://github.com/icqqjs/icqq/commit/5509763deb861343613b9afcf1c3baa883669243))
* 添加9.0.95.19320 ([0d628ce](https://github.com/icqqjs/icqq/commit/0d628cecf7922d65a98a2f78db9d867f77067a17))

## [1.2.6](https://github.com/icqqjs/icqq/compare/v1.2.5...v1.2.6) (2024-08-31)


### Bug Fixes

* emp改为15 ([e80f073](https://github.com/icqqjs/icqq/commit/e80f0734d04c5e116a0b86ea139a22dc4132c511))
* nt图片解析。 ([ab0797a](https://github.com/icqqjs/icqq/commit/ab0797aa722c6939a3467f80dd787be8fdf6451b))
* refreshToken ([52f652d](https://github.com/icqqjs/icqq/commit/52f652db031a6265921df81ccc821ba279525c96))
* tlv10c ([bb1a4a0](https://github.com/icqqjs/icqq/commit/bb1a4a059765c43adfb8e0e99ab1b417f9819ead))
* 图片解析。 ([e294acc](https://github.com/icqqjs/icqq/commit/e294acc2f6fa539c3d22627e9a42be2c6376b317))
* 添加QQ版本9.0.80、9.0.81、9.0.85、9.0.90 ([5bd0229](https://github.com/icqqjs/icqq/commit/5bd02292d9b91ad5f8eb1ceeea2081f8fa7f504d))

## [1.2.5](https://github.com/icqqjs/icqq/compare/v1.2.4...v1.2.5) (2024-07-21)


### Bug Fixes

* sign回调任意包漏洞 ([828f77f](https://github.com/icqqjs/icqq/commit/828f77fbf3cf2843fc3c9f4f90d4a9276382f519))
* 添加QQ手表版本9.0.1。 ([a0b75c3](https://github.com/icqqjs/icqq/commit/a0b75c385a96d8db7c5c46d56287845630cd2d64))
* 添加QQ版本9.0.71.17655、sign启用http长连接。 ([14bc899](https://github.com/icqqjs/icqq/commit/14bc89939793a5aed32065bbbfd20cfa71b47bc5))
* 添加QQ版本9.0.75.17920。 ([b91ce68](https://github.com/icqqjs/icqq/commit/b91ce6804b128f8d7eebd980b7182f116077e6f3))
* 添加开发依赖(typedoc) 用于生成文档站 ([d0ade34](https://github.com/icqqjs/icqq/commit/d0ade343cb82fe640a61906ff874dea3cedf2c56))

## [1.2.4](https://github.com/icqqjs/icqq/compare/v1.2.3...v1.2.4) (2024-06-29)


### Bug Fixes

* ver ([5d1d13b](https://github.com/icqqjs/icqq/commit/5d1d13b14fbce465bb04a6915b6aa05c8e584d26))

## [1.2.3](https://github.com/icqqjs/icqq/compare/v1.2.2...v1.2.3) (2024-06-29)


### Bug Fixes
* ?
* add 9.0.65.17370 ([b19395c](https://github.com/icqqjs/icqq/commit/b19395c2545e93a58be364d6e6f083aa989eb447))
* add 9.0.70.17645 ([d86ec90](https://github.com/icqqjs/icqq/commit/d86ec90d7a8ea9f016bc94a0345e36aed3e3cb54))
* makeForwardMsg ([a5d57b0](https://github.com/icqqjs/icqq/commit/a5d57b0a6b7d89fb2d0b03c57f6b148c0d08d552))
* 频道消息撤回提醒，文档更新 ([f6427af](https://github.com/icqqjs/icqq/commit/f6427aff5f337d80e6e9ea7d2ca077fdf099e2fe))

## [1.2.2](https://github.com/icqqjs/icqq/compare/v1.2.1...v1.2.2) (2024-05-30)


### Bug Fixes

* add 9.0.56.16830 ([eaafe0b](https://github.com/icqqjs/icqq/commit/eaafe0b7a6415a1ba9155816cc6cbdb049cb55e5))
* add 9.0.60.17095 ([e30f679](https://github.com/icqqjs/icqq/commit/e30f6795abf6d00d36dcfbaf396c1124fe2ac291))

## [1.2.1](https://github.com/icqqjs/icqq/compare/v1.2.0...v1.2.1) (2024-05-16)


### Bug Fixes

* add 3.5.7.3218、9.0.55.16820 ([0900f1e](https://github.com/icqqjs/icqq/commit/0900f1eb507c3c6752dd4156924579dd4d1e7d0a))

## [1.2.0](https://github.com/icqqjs/icqq/compare/v1.1.6...v1.2.0) (2024-04-25)


### Features

* get user profile ([34ad6b4](https://github.com/icqqjs/icqq/commit/34ad6b4ed6272b339b1566a2b1356f433ef42f3e))


### Bug Fixes

* `getUserProfile` return type wrong ([da9abdb](https://github.com/icqqjs/icqq/commit/da9abdb521f630d854578fb4fd93ae5ae325034d))
* add 9.0.35.16275 ([7f010b6](https://github.com/icqqjs/icqq/commit/7f010b690a28a3620f20d543db7f6ec7df9f50f8))
* add 9.0.50.16545 ([edda30a](https://github.com/icqqjs/icqq/commit/edda30a408867f4640b4158b94d8c63bccb843ce))
* hb480 ([4b58ba8](https://github.com/icqqjs/icqq/commit/4b58ba846c659fa5bc94211a458ba9a36458e66c))
* isNT ([c0cbcb2](https://github.com/icqqjs/icqq/commit/c0cbcb23d697a529db4f897061a307bc2ad14ece))
* 处理markdown消息新增的配置。 ([55576fd](https://github.com/icqqjs/icqq/commit/55576fd80d3808b4d1656d79fb268b3f739134c4))
* 消息解析频道帖子，增加帖子分享到群/好友能力 ([8c6b95b](https://github.com/icqqjs/icqq/commit/8c6b95b752c3352a8ae097c49ac13ac2efc729fb))
* 表情解析优化，来自某个群友 ([f3b7440](https://github.com/icqqjs/icqq/commit/f3b74402ef650c80522a0625d527f9842d359f76))
* 解析LongMsg ([9902b93](https://github.com/icqqjs/icqq/commit/9902b93ca230f1b887c33e3b28366dd4a1d12dbc))

## [1.1.6](https://github.com/icqqjs/icqq/compare/v1.1.5...v1.1.6) (2024-04-17)


### Bug Fixes

* add 9.0.35.16270 ([c2950a9](https://github.com/icqqjs/icqq/commit/c2950a9ec2305b04c3dbc780797adcf0250cf549))
* add uploadLongMsg ([ecfecc0](https://github.com/icqqjs/icqq/commit/ecfecc02b99058fcb06d49c029938dee73d83b58))
* seq ([1ede29d](https://github.com/icqqjs/icqq/commit/1ede29d80483b456d10e469fee40e8fd3a47a7ec))
* 消息解析频道帖子，增加获取帖子url能力 ([64679b6](https://github.com/icqqjs/icqq/commit/64679b64e905e600b581f5836dc97640954603f9))
* 消息风控处理 ([cada61d](https://github.com/icqqjs/icqq/commit/cada61d09eaf25a2a817a9a992eacfe7d7567dd1))

## [1.1.5](https://github.com/icqqjs/icqq/compare/v1.1.4...v1.1.5) (2024-04-12)


### Bug Fixes

* Heartbeat ([425629a](https://github.com/icqqjs/icqq/commit/425629aa63fd6ebc4300f9a8b5395d65eec8f7e0))
* Heartbeat ([4b828b2](https://github.com/icqqjs/icqq/commit/4b828b2897bec1c93bd1a7bc289b4fcc9812433b))
* 心跳间隔改为30秒 ([e4add2c](https://github.com/icqqjs/icqq/commit/e4add2c0d954417aaf1e19d0e757dc209b2f8fda))
* 忽略不支持的类型。 ([6e7c74b](https://github.com/icqqjs/icqq/commit/6e7c74bbc97dc52d7205bb056d9dc1405b7e48b7))
* 调用client.login时判断是否在线，防止登录多次。 ([fd90d40](https://github.com/icqqjs/icqq/commit/fd90d40d313bf56a96f99e5ebc5bb0663b830de3))

## [1.1.4](https://github.com/icqqjs/icqq/compare/v1.1.3...v1.1.4) (2024-04-01)


### Bug Fixes

* add 9.0.30.15995。 ([f159f74](https://github.com/icqqjs/icqq/commit/f159f749d1b625b9d4c283d93204888473dac5aa))
* buildPacket ([63f7e36](https://github.com/icqqjs/icqq/commit/63f7e361c94bec586bf2deb62ffd9fb8e591dfe4))
* ImgElem ([e29fbc3](https://github.com/icqqjs/icqq/commit/e29fbc3b5a107f8d90a7254ddc0bc26aa6321fb5))
* upday ([99e3016](https://github.com/icqqjs/icqq/commit/99e3016193db2b379d2e2c92d984354256f3db38))
* 修复无法自动获取签名ApiQQ版本问题。 ([a9176f7](https://github.com/icqqjs/icqq/commit/a9176f7591f87f56d4727da4f2c74ff4bfe02dba))
* 新增【添加表情表态】功能，by: hlhs。 ([e6aeda8](https://github.com/icqqjs/icqq/commit/e6aeda88910e422bff6d713eceb9cabe67c2be2d))
* 消息解析频道帖子，增加帖子分享到群/好友能力 ([d4ed324](https://github.com/icqqjs/icqq/commit/d4ed324f40e1d373c9e3eb18aa877d15a91a714a))

## [1.1.3](https://github.com/icqqjs/icqq/compare/v1.1.2...v1.1.3) (2024-03-25)


### Bug Fixes

* parseElems ([e2eb06b](https://github.com/icqqjs/icqq/commit/e2eb06b1a0990bb9337ebe31d5c58da598b1159b))
* 上传图片时忽略已填写fid的图片。 ([17c6e13](https://github.com/icqqjs/icqq/commit/17c6e1380d7031820bb7bf1b45e72f4919023b13))
* 回退pb解析。 ([40ae787](https://github.com/icqqjs/icqq/commit/40ae787d8271fb7a41437a19af73660bb0997310))

## [1.1.2](https://github.com/icqqjs/icqq/compare/v1.1.1...v1.1.2) (2024-03-21)


### Bug Fixes

* tsconfig alias ([d7c840c](https://github.com/icqqjs/icqq/commit/d7c840c23497c0bee0663f11f9f2ae6ff94381d2))

## [1.1.1](https://github.com/icqqjs/icqq/compare/v1.1.0...v1.1.1) (2024-03-21)


### Bug Fixes

* build error ([63baabe](https://github.com/icqqjs/icqq/commit/63baabe7aa1763392e9f44e000fd6ac114a59bd3))
* 修复重连失败后无响应问题。 ([f56d818](https://github.com/icqqjs/icqq/commit/f56d818efe13206b150c4ff7a54a13236be403ba))

## [1.1.0](https://github.com/icqqjs/icqq/compare/v1.0.3...v1.1.0) (2024-03-18)


### Features

* export axios for reuse in other projects ([f7c9f37](https://github.com/icqqjs/icqq/commit/f7c9f37c34f6403870b7a1aaeaf53610b64b6a60))
* 实现消息签名组包（test）。 ([e75fa03](https://github.com/icqqjs/icqq/commit/e75fa0334ab01bb56c9824058831931f63e90f94))
* 新增安卓QQ8.8.88版本协议，Platform = 6，无法登录的可尝试。 ([e3baaa6](https://github.com/icqqjs/icqq/commit/e3baaa621d0b2f458e6d113e5df7d3872f0ad467))
* 解析新 QQNT 发送的图片 ([f0e973b](https://github.com/icqqjs/icqq/commit/f0e973b522904463a83c723d1c6a2e6d4ecea0f4))


### Bug Fixes

* ？ ([586d80b](https://github.com/icqqjs/icqq/commit/586d80be24922d50721afc373fc4fc1305bfa611))
* . ([d99c3b0](https://github.com/icqqjs/icqq/commit/d99c3b05a93da16e4b13b229f0646b48766ea21c))
* 。 ([bed55e2](https://github.com/icqqjs/icqq/commit/bed55e2c1fbd631e50e8b3936bf146d0e2445a5d))
* 。 ([4700e26](https://github.com/icqqjs/icqq/commit/4700e263d10e14b36097fe11b3db8b3ad3656597))
* 。 ([0d78051](https://github.com/icqqjs/icqq/commit/0d78051bdbd326bfca3216fe84f43b3ad312656d))
* 。 ([64682e8](https://github.com/icqqjs/icqq/commit/64682e839c6908cb0c361bd557b9d61e5fdb5706))
* 544改为本地计算 ([df2a208](https://github.com/icqqjs/icqq/commit/df2a20845f4119dc437afc5133e0ea75b95dd522))
* add some demo of icqq ([b8f6e12](https://github.com/icqqjs/icqq/commit/b8f6e12e83071776cd5cf1309927a93fd2a06c93))
* add tlv16a ([6573e3a](https://github.com/icqqjs/icqq/commit/6573e3a487571e5bf373511010735bbedd1b0ba9))
* apk增加device_type参数（用于扫码登录）。 ([b245101](https://github.com/icqqjs/icqq/commit/b2451019f41e611fded48ac8b15dc1d3fe18cc9c))
* change class Proto decode logic ([d11dcc1](https://github.com/icqqjs/icqq/commit/d11dcc1f58096c188508ffe6934d3a8b2d06e8d9))
* Config增加签名接口地址配置，可自行实现签名API，供ICQQ调用 ([412c387](https://github.com/icqqjs/icqq/commit/412c3871ed84bd03d53d8f61127e4bbb29c431fd))
* deviceInfo ([a075c86](https://github.com/icqqjs/icqq/commit/a075c865b04f9f09fb63d2eb5c3fc6df1ed553fe))
* forward nt ([cc00160](https://github.com/icqqjs/icqq/commit/cc00160f33404386d4e57ef17ecf11b5875fb739))
* getT544、getSign报错 ([00be2c4](https://github.com/icqqjs/icqq/commit/00be2c4c64602dc2c92a97e2aaa4aa4d136e8251))
* getT544、getSign报错 ([4295721](https://github.com/icqqjs/icqq/commit/42957212d80ade7bad4fdc532a6eb0e4de8fdb0e))
* getT544、getSign报错 ([c4adae6](https://github.com/icqqjs/icqq/commit/c4adae6c33852d6c0917ed2fc62f408999898693))
* highwayUpload ([64d34c6](https://github.com/icqqjs/icqq/commit/64d34c64a13085a83ba12976489c631a406e25a9))
* internal中，获取个性签名方法getSign弃用，后续开发中请使用更具语义化的getPersonalSign替换;client增加获取个性签名方法(getSignature) ([39be3f5](https://github.com/icqqjs/icqq/commit/39be3f5ad3129478f5a56b1bad5582a69bac6c4d))
* iPad -&gt; aPad ([98d5110](https://github.com/icqqjs/icqq/commit/98d51109480ecd4e770eec006052a8dd7b2909f2))
* ipad ver ([58e2529](https://github.com/icqqjs/icqq/commit/58e2529642a011ce8f29dd5d1a6b95590d479c8b))
* ipad协议登录报错问题（不是解决禁止登录）。 ([1c718ad](https://github.com/icqqjs/icqq/commit/1c718ad43bb31dadac899af076c7a74744312c03))
* login error 16 ([f4d9c4f](https://github.com/icqqjs/icqq/commit/f4d9c4fc82462ca2238b36fb7dcf1f0c7e18b687))
* mac协议无法登录问题。 ([c06e734](https://github.com/icqqjs/icqq/commit/c06e734079881b5ac27425ec48cdd863f323ee69))
* MemberInfo ([d0569a8](https://github.com/icqqjs/icqq/commit/d0569a83e22bfcf50a850865dd2d9db423a3bbed))
* merge code ([123c1fe](https://github.com/icqqjs/icqq/commit/123c1fec347c51ded501f5924df73b0bcee31ab6))
* merge code ([9341a14](https://github.com/icqqjs/icqq/commit/9341a14919f11a22245abebe793786d446acd040))
* ntqq艾特。 ([97fbf08](https://github.com/icqqjs/icqq/commit/97fbf08382262315913b8a819a98f018f915c5c7))
* out dir error ([fc69814](https://github.com/icqqjs/icqq/commit/fc69814108d6f2798d514847a8de8aebc9058a5b))
* packet timeout ([f063def](https://github.com/icqqjs/icqq/commit/f063def8c8851417a48d27ca09f81bf6c2d659b1))
* parseSso ([89ed4de](https://github.com/icqqjs/icqq/commit/89ed4de77ea82719f4fa744bca17f7d2579cd762))
* PoW 算法错误 ([5f47445](https://github.com/icqqjs/icqq/commit/5f4744596b78b88c12189f5b9ac89b2f294be299))
* prettier log ([984d59b](https://github.com/icqqjs/icqq/commit/984d59be7b62333f73a3446a4b2349c30170d660))
* pretty code;allow custom logger ([0e57711](https://github.com/icqqjs/icqq/commit/0e5771128f886b227acf911746a75f73845b535c))
* Proto类增加toJSON()方法，方便调试 ([3094c6e](https://github.com/icqqjs/icqq/commit/3094c6e49f7047d2fdef7e9759414542ed077199))
* publish error ([ec80b45](https://github.com/icqqjs/icqq/commit/ec80b454bc0a236fd0348945b862ca0e66fd750b))
* push pkg ([ac4420e](https://github.com/icqqjs/icqq/commit/ac4420e0040eb5b7064c203dcb5c8fcdafc2f632))
* push pkg ([e7e1f55](https://github.com/icqqjs/icqq/commit/e7e1f55e35bc3dcf16ef117ce84c13657f7a30a8))
* push pkg ([cc15032](https://github.com/icqqjs/icqq/commit/cc1503289cf0232ea8f515b1a5d007c7993c861a))
* qimei in T545 ([eba6355](https://github.com/icqqjs/icqq/commit/eba63557f6ad5d974f7a034ce3ac6ccf794dd7ff))
* QQNT图片解析、优化转发消息上传。 ([65b7bc0](https://github.com/icqqjs/icqq/commit/65b7bc07f581da2f0c169917aa853c70cdae11f2))
* qsignApi异常时不输出错误问题。 ([e3411f8](https://github.com/icqqjs/icqq/commit/e3411f8f7b547fb1d93ff4d57bca9dead655dd58))
* refreshToken ([c19b26f](https://github.com/icqqjs/icqq/commit/c19b26f4ffaad465266c85f3b3a1f7f6043a2ed5))
* replaceAll语法调整 ([3ada7dd](https://github.com/icqqjs/icqq/commit/3ada7ddec5f5845dbc315d505e93f9086807a15d))
* reply 重复处理 ([32c2489](https://github.com/icqqjs/icqq/commit/32c24897126f6a4ec9b3d4a82fe9e37cbd1f31de))
* requestToken ([a6dca70](https://github.com/icqqjs/icqq/commit/a6dca707bfa15470f889d81670e49940440530e9))
* ReserveFields ([007db25](https://github.com/icqqjs/icqq/commit/007db258e336f88739fac1f5648051aa4a11ca29))
* run lint:fix ([226926b](https://github.com/icqqjs/icqq/commit/226926b0b305be76212726e628f73579f12f84ee))
* seq ([7f24e8f](https://github.com/icqqjs/icqq/commit/7f24e8f9b8e8e4e71926c8a4c6fbec7c90d54d57))
* SidTicketExpired？ ([daa5c11](https://github.com/icqqjs/icqq/commit/daa5c116968a38d45f3438f07fdb6f0f70be79fe))
* sign path ([59f38ef](https://github.com/icqqjs/icqq/commit/59f38ef224b22a71a458423f3e8e2ecd9b139b6e))
* signApi请求超时时间改为15秒、qsignApi请求超时时间改为30秒。 ([13e88fd](https://github.com/icqqjs/icqq/commit/13e88fd7008b82dc88d483d68d59b13b97c23109))
* sign请求增加重试。 ([12d8962](https://github.com/icqqjs/icqq/commit/12d896275fe40caabada3d0caeb2234faa4b5764))
* sign重试增加延迟。 ([2ce30e6](https://github.com/icqqjs/icqq/commit/2ce30e65451d8f1f24972b993a206348f615e2c7))
* t543读取失败时增加警告 ([3374857](https://github.com/icqqjs/icqq/commit/33748579a15e2209ed591be75529354f20c2032b))
* t548 算法错误 ([790f5ff](https://github.com/icqqjs/icqq/commit/790f5ff07c56f1a2773ab9461ac2f456e61cc4df))
* Tim协议心跳超时问题 ([a7d950e](https://github.com/icqqjs/icqq/commit/a7d950e8148949add76f933065de0433b8421f7c))
* tlv543读取失败不用提示。 ([bf0f555](https://github.com/icqqjs/icqq/commit/bf0f555e9b37e35761eaf99796c377980c4c92f8))
* tlv545 ([715df56](https://github.com/icqqjs/icqq/commit/715df56aadabedbcff4a24527c105a6870f9c311))
* token 登录失败 ([2d769ee](https://github.com/icqqjs/icqq/commit/2d769ee9c9471827a93cf4ff83429a82c2f939fe))
* token可能失效时不删除token文件。 ([035ee3a](https://github.com/icqqjs/icqq/commit/035ee3a76050f2386d34c3dbc732765accd7e8f1))
* token失效后报错问题。 ([90e769c](https://github.com/icqqjs/icqq/commit/90e769ccd527999fff1a595e04c0de2444443036))
* token登录提示 ([d2002f8](https://github.com/icqqjs/icqq/commit/d2002f88e21d955383549eeba9a07bcf283df82c))
* typo permisson → permission ([dc435b1](https://github.com/icqqjs/icqq/commit/dc435b1f35b018131e68235d83536c060d7d19a7))
* upload lib ([f6b590d](https://github.com/icqqjs/icqq/commit/f6b590dd518100dd805e8eb7756e913d13c74398))
* 上线失败问题。 ([c12ea7a](https://github.com/icqqjs/icqq/commit/c12ea7a69174ed340b1bb38db2f804f239970fc0))
* 优化token上线。 ([89f53fe](https://github.com/icqqjs/icqq/commit/89f53fe068eb485ce810abcc06ba39a3d6faec83))
* 优化token上线。 ([41a076c](https://github.com/icqqjs/icqq/commit/41a076ccbcbd7b39064339b7c4fcaa3453427400))
* 优化上线流程。 ([a1d4adb](https://github.com/icqqjs/icqq/commit/a1d4adbcd5d312b4c8032b07a37b877e93286306))
* 修复node16以上版本无法正常使用问题。 ([c570689](https://github.com/icqqjs/icqq/commit/c570689835627c5e2c64fb50ebfaf355aa3147fa))
* 修复seq为负数时报错问题。 ([9c8c4f8](https://github.com/icqqjs/icqq/commit/9c8c4f8a7f48e5beaf9afcd74eaca0679bd7cad2))
* 修复token刷新失败问题，刷新间隔修改为12小时。 ([bdbfb44](https://github.com/icqqjs/icqq/commit/bdbfb44e2bb39976ecc28a6d0990dd8b4381ccc6))
* 修复watch 扫码登陆 ([02a5749](https://github.com/icqqjs/icqq/commit/02a5749477fdd62e39f8275b1fd23ac82695d8c5))
* 修复扫码登录提示密码错误问题。 ([fc7c80e](https://github.com/icqqjs/icqq/commit/fc7c80ea066b0170515aed1337b13759959bc246))
* 修复无法发送短信验证码问题。 ([8d397bd](https://github.com/icqqjs/icqq/commit/8d397bd7965e6b9b6c7c5814c03114898d5b515e))
* 修复未指定ver时报错问题，增加安卓8.9.70.11730版本信息，导出tlv543。 ([20605c6](https://github.com/icqqjs/icqq/commit/20605c69941e7bf19519672f5020f785bb20ddfa))
* 修复版本过低。 ([79540d7](https://github.com/icqqjs/icqq/commit/79540d75b618fc4ae79ba8a235df4b1df17f56c3))
* 修复特定情况下可能会出现解密返回包失败问题。 ([62f3f12](https://github.com/icqqjs/icqq/commit/62f3f12fa8318ebe546cc54a8cf76b04c6282ec1))
* 修改token失效重试。 ([185c80b](https://github.com/icqqjs/icqq/commit/185c80b5fd93da50a7f8dd0ba24b20ff01871597))
* 修改登录失败提示。 ([02f748a](https://github.com/icqqjs/icqq/commit/02f748a8f7d6191e2788a4f6346eca6397eed6a9))
* 修改签名log、修改私聊消息发送失败判断。 ([ac0f22a](https://github.com/icqqjs/icqq/commit/ac0f22a3bd7703edbf19b793835308da5e806c7e))
* 修改频道消息发送失败判断。 ([3b148da](https://github.com/icqqjs/icqq/commit/3b148dad1067c04879a52123aaed5950e481bd27))
* 刷新token时备份上次token，登录时如找不到token将使用上次的token进行登录 ([8b2a872](https://github.com/icqqjs/icqq/commit/8b2a872a915b6c05b37a6441cf23e2d4879c61eb))
* 刷新token错误 ([15bd8b4](https://github.com/icqqjs/icqq/commit/15bd8b4c0074d047e0793f08c6a0f07befa92ddd))
* 刷新登录token失败问题。 ([6642e59](https://github.com/icqqjs/icqq/commit/6642e595f62d96fd38836e4fd870772f94a37869))
* 刷新签名token间隔改为1小时，更新QQ版本信息到8.9.68.11565。 ([32dcfdf](https://github.com/icqqjs/icqq/commit/32dcfdf117d1160bbdfc65f19c7066ee81650e63))
* 升级triptrap ([eb007a2](https://github.com/icqqjs/icqq/commit/eb007a292acb1dc7347b1706ceee4f2a90a2ce77))
* 合并转发使用预处理 ([7341edf](https://github.com/icqqjs/icqq/commit/7341edf6632703441f4869cf86c2063ac245f7d1))
* 增加8.9.73.11945。 ([b03ff02](https://github.com/icqqjs/icqq/commit/b03ff028207094daaea47c84a69193d646c0a177))
* 增加8.9.75.12110 ([261c992](https://github.com/icqqjs/icqq/commit/261c992e13dcb6a5fc01d004cf633114c3b3185b))
* 增加8.9.76.12115 ([5157ea7](https://github.com/icqqjs/icqq/commit/5157ea7c25ec05942b0c7cf26c9be425ce142cc5))
* 增加8.9.85.12820。 ([77a2ec0](https://github.com/icqqjs/icqq/commit/77a2ec023f21e84c0248fd0c06cd288706701912))
* 增加8.9.88.13035。 ([760c4cd](https://github.com/icqqjs/icqq/commit/760c4cdcf4b737c0812c6b8a27794d461d87c541))
* 增加8.9.90.13250。 ([cd17c52](https://github.com/icqqjs/icqq/commit/cd17c5211f46ff34995f52c1c0a8ae17632d50cb))
* 增加8.9.93.13475。 ([0576fd5](https://github.com/icqqjs/icqq/commit/0576fd527732bdd72178ee0a97040b3c0f999dbe))
* 增加9.0.0.14110。 ([f8105cb](https://github.com/icqqjs/icqq/commit/f8105cbba66d567062539d24a3a0c89f1e85e454))
* 增加9.0.15.14970。 ([919e3cd](https://github.com/icqqjs/icqq/commit/919e3cd0a233391aa90317621e515c25c5fde7a1))
* 增加9.0.17.15185 ([caad99b](https://github.com/icqqjs/icqq/commit/caad99b0f44a8e78b11396b8b76853b330393f8a))
* 增加9.0.8.14755。 ([0f33e42](https://github.com/icqqjs/icqq/commit/0f33e42ba33ed2cc01592539a71ff15cec5c0fe2))
* 增加Android 8.9.78.12275。 ([1c4bce8](https://github.com/icqqjs/icqq/commit/1c4bce8eb94b3c8aaf0a6f4e0d6db789e059c8f1))
* 增加register失败时自动重试。 ([671307d](https://github.com/icqqjs/icqq/commit/671307db65d7c5f343e9710884adc3e52119e825))
* 增加Tim 3.5.6.3208。 ([bd609aa](https://github.com/icqqjs/icqq/commit/bd609aa5a8097e7e432bf0f1514d7dd1ddc0eb9f))
* 增加Tim3.5.2.3178版本信息。 ([c0934c6](https://github.com/icqqjs/icqq/commit/c0934c65e56a5d6a4df86c1e735525a00ae06ce4))
* 增加可组合发送的元素 ([c6786cc](https://github.com/icqqjs/icqq/commit/c6786ccee6134fe5efff9e2fbf6487da941c3617))
* 增加频道相关接口 ([ce7cd33](https://github.com/icqqjs/icqq/commit/ce7cd3344fe71744621621d426d4212ad2bfa4c4))
* 增加频道相关接口... ([e071ea8](https://github.com/icqqjs/icqq/commit/e071ea80f728720cd5e2e306d9440ffb59e12248))
* 安卓手表增加2.1.7版本，安卓手机、apad等可扫码登录。 ([2157196](https://github.com/icqqjs/icqq/commit/2157196997b23339571b0ca4596b1a3658675c17))
* 安卓手表默认版本改为2.0.8。 ([6c33947](https://github.com/icqqjs/icqq/commit/6c33947322913907831944666e544e9077fdd7e5))
* 对于可能存在多个版本的android和aPad，允许用户指定apk(目前仅支持8.9.63,8.9.68) ([4fe1165](https://github.com/icqqjs/icqq/commit/4fe1165b04d6a17cd070b59172b3d1c62cdf60a7))
* 对超级表情进行修复，sface消息类型 ([feca7ed](https://github.com/icqqjs/icqq/commit/feca7eda721b351bc24cb967bc844de1416c8d89))
* 将安卓8.8.88协议替换为Tim3.5.1（platform: 6）需配合签名api使用 ([6ef5b26](https://github.com/icqqjs/icqq/commit/6ef5b26f33921298f774c54ed0906c8b3ae0f0e4))
* 屏蔽tim扫码登录（不支持）。 ([c28b102](https://github.com/icqqjs/icqq/commit/c28b102291d1513d449487603991698a77b8f8fb))
* 屏蔽传参错误 ([ecbc72e](https://github.com/icqqjs/icqq/commit/ecbc72ebc9af5011f7fb9f5191b57a242d1fa1f9))
* 已设置签名api的情况下，签名api请求异常时不发送消息。 ([5150274](https://github.com/icqqjs/icqq/commit/5150274663c5d2133330920fcda6e36757936dde))
* 当传入不支持组合发送的元素时丢弃其他元素。 ([32509fb](https://github.com/icqqjs/icqq/commit/32509fb4f4c4b8fc45def6c8876bff4104121909))
* 手表协议刷新token失败。 ([55c2245](https://github.com/icqqjs/icqq/commit/55c2245e7ae9dacdd52903faf118d23976af233b))
* 扫码登录。 ([c2c38d5](https://github.com/icqqjs/icqq/commit/c2c38d570c26ebcd05f68305f9ad4d0a00f42652))
* 提交验证码时计算t547。 ([8b21c01](https://github.com/icqqjs/icqq/commit/8b21c01a7af3c86267fd29b8322531a6fd1e95ca))
* 提示：此版本更新了token格式，刷新后token将不兼容旧版本。 ([dbd6ac6](https://github.com/icqqjs/icqq/commit/dbd6ac659d66c2371fbcbe83f06bb2e2be32647d))
* 支持Button消息解析。 ([95cc162](https://github.com/icqqjs/icqq/commit/95cc162a86dc526ff20352096ab6b19893dad5d6))
* 支持markdown消息解析。 ([79d169e](https://github.com/icqqjs/icqq/commit/79d169e09b2b3ba731c3f5ce496d02fb53d46727))
* 支持silk转码（silk-wasm）、修复掉线重连报错问题。 ([aea0163](https://github.com/icqqjs/icqq/commit/aea0163e3880b6dfa2ced12e43862584ebff7108))
* 支持群文件转发到私聊以及私聊文件转发到群聊。 ([338c5d2](https://github.com/icqqjs/icqq/commit/338c5d2a6f500e6a419382e4a4f2e1b56b8344b8))
* 支持自定义图片概要。 ([ee7a634](https://github.com/icqqjs/icqq/commit/ee7a634f81d42de1f468d7bea845fb696b06aa7c))
* 支持重写client.getSign（可自行实现调用第三方签名api） ([e87a275](https://github.com/icqqjs/icqq/commit/e87a275c8d0214bdded3ac9401a8be29a3ff5a77))
* 新增设置屏蔽群成员消息屏蔽状态函数(setGroupMemberScreenMsg)，设置为true后，登录账号将在该群不再接受对应群成员消息 ([771311f](https://github.com/icqqjs/icqq/commit/771311f5397f1d98da907947cedcd22641e25c3b))
* 更改t543缺失警告文案 ([bb2efaf](https://github.com/icqqjs/icqq/commit/bb2efaf30a8bdf46b551df0fee7141c159d2ba3c))
* 更改watch自动扫码登陆提示 ([68b4743](https://github.com/icqqjs/icqq/commit/68b474374c1e855db369e00097d6e13c63252285))
* 更新 T544 API ([8ac1c45](https://github.com/icqqjs/icqq/commit/8ac1c457460678e50695a82c773dc3f3bcd2f6b0))
* 更新8.9.63、默认关闭auto_server ([86a345c](https://github.com/icqqjs/icqq/commit/86a345ca089e9d38b73d22c6caf25003393b2951))
* 更新GuildMessageEvent.reply方法签名 ([57bf4ec](https://github.com/icqqjs/icqq/commit/57bf4ec308d2c109557d9b7105dcead81f55ca20))
* 更新QQ版本信息。 ([fc428ac](https://github.com/icqqjs/icqq/commit/fc428ac301ac31197b98c8979c6f8e190e3b68f4))
* 更新ts文件到src，便于区分编译文件和源文件 ([dbca2bb](https://github.com/icqqjs/icqq/commit/dbca2bbb8b98b8f2c68294fcf4024dcc1b8a5dd4))
* 未在config中指定版本时，自动使用签名Api支持的协议版本。 ([11f85fe](https://github.com/icqqjs/icqq/commit/11f85fe70713ffaab52571b3626d48a2a0725bac))
* 未配置sign API改为只提示一次 ([45e6040](https://github.com/icqqjs/icqq/commit/45e604043a97ee49fac6a055a1f409801780a8b3))
* 未配置sign API改为只提示一次 ([45e6040](https://github.com/icqqjs/icqq/commit/45e604043a97ee49fac6a055a1f409801780a8b3))
* 添加uid参数、tlv543保存到token。 ([a324089](https://github.com/icqqjs/icqq/commit/a32408968784a197a14361fe4e6460c646ecaa7f))
* 添加一些签名cmd名单。 ([1496192](https://github.com/icqqjs/icqq/commit/149619283a6fa9652768cfbde96eba5768c69d25))
* 禁止Tim协议设置在线状态 ([baa7612](https://github.com/icqqjs/icqq/commit/baa76125b1eaf9d475e171138337fad85fd554d5))
* 禁言等功能失效问题。 ([1245c3e](https://github.com/icqqjs/icqq/commit/1245c3eb6492bb33120e1887b10d17bdc744c012))
* 私聊 QQNT 图片 URL ([d118796](https://github.com/icqqjs/icqq/commit/d118796af9c294b3bdcf7ee43565c2d53236cc1d))
* 移除lodash依赖 ([b437b51](https://github.com/icqqjs/icqq/commit/b437b5115295f626e2d2f3cf5f3f7e9c31594ca1))
* 移除频道艾特解析。 ([bc9f7d1](https://github.com/icqqjs/icqq/commit/bc9f7d1ba8ac6d43a8c53558795f3e0a3fcf43d0))
* 签名api可以不带path。 ([1c1b09e](https://github.com/icqqjs/icqq/commit/1c1b09e1b8a21dbf8734b35ae2db4f37dafb63d4))
* 签名api请求异常时显示错误信息、qsign请求超时时间改为20秒。 ([c0f26be](https://github.com/icqqjs/icqq/commit/c0f26be62574f692cffee2e223c116eea1b7e0d3))
* 签名token改为每50分钟刷新一次、修改了设备信息（更新后需要重新验证设备！） ([2d92001](https://github.com/icqqjs/icqq/commit/2d920013a80a44307855a48173d4ba0ed6271699))
* 类型错误处理 ([b081084](https://github.com/icqqjs/icqq/commit/b081084500469f324b388668f4c7767f82711160))
* 群文件操作。 ([0078316](https://github.com/icqqjs/icqq/commit/0078316e7340bb64cd236ed42d1241df49c646b8))
* 群聊图片ios端显示为表情问题。 ([737f02e](https://github.com/icqqjs/icqq/commit/737f02ef5c157c3dc483e8318712c8b3ff142d68))
* 获取签名Api协议版本时判断sign是否已经初始化。 ([acb6c78](https://github.com/icqqjs/icqq/commit/acb6c78be6b58db58fbda038408ad4ca698af5ce))
* 语音转码后删除缓存，支持发送 Buffer 视频 ([1000e42](https://github.com/icqqjs/icqq/commit/1000e4268eea1e71533eba1722a7588d53bd8f71))
* 转发消息改为json。 ([671ca31](https://github.com/icqqjs/icqq/commit/671ca3155a99244166e15bcf213661334b15e584))
* 适配qsign自动注册。 ([73b1d4c](https://github.com/icqqjs/icqq/commit/73b1d4c1ad7563153a7cb2ca96170c59a97a12f9))
* 通过APK信息判断是否NT ([c7065f4](https://github.com/icqqjs/icqq/commit/c7065f4450051c5b3e34ba621e1593f97b99cb21))
* 部分环境下出现下载转发消息出错问题。 ([e82a784](https://github.com/icqqjs/icqq/commit/e82a7845e24b43920281494c83a0be57555e1995))
* 频道身份组成员列表为空时出错问题。 ([28e6da8](https://github.com/icqqjs/icqq/commit/28e6da8da4b316a60d1c2849dd2a47b34dad4909))
* 默认安卓协议默认版本改为8.9.70。 ([db0e4c5](https://github.com/icqqjs/icqq/commit/db0e4c55a48985e5db771064a7914835a8462686))

## [1.0.3](https://github.com/icqqjs/icqq/compare/v1.0.2...v1.0.3) (2024-03-18)


### Bug Fixes

* change class Proto decode logic ([d11dcc1](https://github.com/icqqjs/icqq/commit/d11dcc1f58096c188508ffe6934d3a8b2d06e8d9))
* forward nt ([cc00160](https://github.com/icqqjs/icqq/commit/cc00160f33404386d4e57ef17ecf11b5875fb739))
* merge code ([9341a14](https://github.com/icqqjs/icqq/commit/9341a14919f11a22245abebe793786d446acd040))
* push pkg ([ac4420e](https://github.com/icqqjs/icqq/commit/ac4420e0040eb5b7064c203dcb5c8fcdafc2f632))
* sign path ([59f38ef](https://github.com/icqqjs/icqq/commit/59f38ef224b22a71a458423f3e8e2ecd9b139b6e))

## [1.0.2](https://github.com/icqqjs/icqq/compare/v1.0.1...v1.0.2) (2024-02-21)


### Bug Fixes

* push pkg ([e7e1f55](https://github.com/icqqjs/icqq/commit/e7e1f55e35bc3dcf16ef117ce84c13657f7a30a8))
* push pkg ([cc15032](https://github.com/icqqjs/icqq/commit/cc1503289cf0232ea8f515b1a5d007c7993c861a))

## [1.0.1](https://github.com/icqqjs/icqq/compare/v1.0.0...v1.0.1) (2024-02-21)


### Bug Fixes

* getT544、getSign报错 ([00be2c4](https://github.com/icqqjs/icqq/commit/00be2c4c64602dc2c92a97e2aaa4aa4d136e8251))
* getT544、getSign报错 ([4295721](https://github.com/icqqjs/icqq/commit/42957212d80ade7bad4fdc532a6eb0e4de8fdb0e))
* getT544、getSign报错 ([c4adae6](https://github.com/icqqjs/icqq/commit/c4adae6c33852d6c0917ed2fc62f408999898693))
* upload lib ([f6b590d](https://github.com/icqqjs/icqq/commit/f6b590dd518100dd805e8eb7756e913d13c74398))
* 通过APK信息判断是否NT ([c7065f4](https://github.com/icqqjs/icqq/commit/c7065f4450051c5b3e34ba621e1593f97b99cb21))

## 1.0.0 (2024-02-05)


### Features

* export axios for reuse in other projects ([f7c9f37](https://github.com/icqqjs/icqq/commit/f7c9f37c34f6403870b7a1aaeaf53610b64b6a60))
* tlv548 ([498a611](https://github.com/icqqjs/icqq/commit/498a611d00c886875a5e78206b0e4700baf558f1))
* 实现消息签名组包（test）。 ([e75fa03](https://github.com/icqqjs/icqq/commit/e75fa0334ab01bb56c9824058831931f63e90f94))
* 新增安卓QQ8.8.88版本协议，Platform = 6，无法登录的可尝试。 ([e3baaa6](https://github.com/icqqjs/icqq/commit/e3baaa621d0b2f458e6d113e5df7d3872f0ad467))
* 解析新 QQNT 发送的图片 ([f0e973b](https://github.com/icqqjs/icqq/commit/f0e973b522904463a83c723d1c6a2e6d4ecea0f4))


### Bug Fixes

* ？ ([586d80b](https://github.com/icqqjs/icqq/commit/586d80be24922d50721afc373fc4fc1305bfa611))
* . ([d99c3b0](https://github.com/icqqjs/icqq/commit/d99c3b05a93da16e4b13b229f0646b48766ea21c))
* 。 ([bed55e2](https://github.com/icqqjs/icqq/commit/bed55e2c1fbd631e50e8b3936bf146d0e2445a5d))
* 。 ([4700e26](https://github.com/icqqjs/icqq/commit/4700e263d10e14b36097fe11b3db8b3ad3656597))
* 。 ([0d78051](https://github.com/icqqjs/icqq/commit/0d78051bdbd326bfca3216fe84f43b3ad312656d))
* 。 ([64682e8](https://github.com/icqqjs/icqq/commit/64682e839c6908cb0c361bd557b9d61e5fdb5706))
* 544改为本地计算 ([df2a208](https://github.com/icqqjs/icqq/commit/df2a20845f4119dc437afc5133e0ea75b95dd522))
* add some demo of icqq ([b8f6e12](https://github.com/icqqjs/icqq/commit/b8f6e12e83071776cd5cf1309927a93fd2a06c93))
* add tlv16a ([6573e3a](https://github.com/icqqjs/icqq/commit/6573e3a487571e5bf373511010735bbedd1b0ba9))
* apk增加device_type参数（用于扫码登录）。 ([b245101](https://github.com/icqqjs/icqq/commit/b2451019f41e611fded48ac8b15dc1d3fe18cc9c))
* Config增加签名接口地址配置，可自行实现签名API，供ICQQ调用 ([412c387](https://github.com/icqqjs/icqq/commit/412c3871ed84bd03d53d8f61127e4bbb29c431fd))
* deviceInfo ([a075c86](https://github.com/icqqjs/icqq/commit/a075c865b04f9f09fb63d2eb5c3fc6df1ed553fe))
* device降会35 ([667bac7](https://github.com/icqqjs/icqq/commit/667bac7c6a93d5dec8d576ff61b708beb2de32a2))
* highwayUpload ([64d34c6](https://github.com/icqqjs/icqq/commit/64d34c64a13085a83ba12976489c631a406e25a9))
* internal中，获取个性签名方法getSign弃用，后续开发中请使用更具语义化的getPersonalSign替换;client增加获取个性签名方法(getSignature) ([39be3f5](https://github.com/icqqjs/icqq/commit/39be3f5ad3129478f5a56b1bad5582a69bac6c4d))
* iPad -&gt; aPad ([98d5110](https://github.com/icqqjs/icqq/commit/98d51109480ecd4e770eec006052a8dd7b2909f2))
* ipad ver ([58e2529](https://github.com/icqqjs/icqq/commit/58e2529642a011ce8f29dd5d1a6b95590d479c8b))
* ipad协议登录报错问题（不是解决禁止登录）。 ([1c718ad](https://github.com/icqqjs/icqq/commit/1c718ad43bb31dadac899af076c7a74744312c03))
* login error 16 ([f4d9c4f](https://github.com/icqqjs/icqq/commit/f4d9c4fc82462ca2238b36fb7dcf1f0c7e18b687))
* mac协议无法登录问题。 ([c06e734](https://github.com/icqqjs/icqq/commit/c06e734079881b5ac27425ec48cdd863f323ee69))
* out dir error ([fc69814](https://github.com/icqqjs/icqq/commit/fc69814108d6f2798d514847a8de8aebc9058a5b))
* packet timeout ([f063def](https://github.com/icqqjs/icqq/commit/f063def8c8851417a48d27ca09f81bf6c2d659b1))
* parseSso ([89ed4de](https://github.com/icqqjs/icqq/commit/89ed4de77ea82719f4fa744bca17f7d2579cd762))
* PoW 算法错误 ([5f47445](https://github.com/icqqjs/icqq/commit/5f4744596b78b88c12189f5b9ac89b2f294be299))
* prettier log ([984d59b](https://github.com/icqqjs/icqq/commit/984d59be7b62333f73a3446a4b2349c30170d660))
* pretty code;allow custom logger ([0e57711](https://github.com/icqqjs/icqq/commit/0e5771128f886b227acf911746a75f73845b535c))
* Proto类增加toJSON()方法，方便调试 ([3094c6e](https://github.com/icqqjs/icqq/commit/3094c6e49f7047d2fdef7e9759414542ed077199))
* publish error ([ec80b45](https://github.com/icqqjs/icqq/commit/ec80b454bc0a236fd0348945b862ca0e66fd750b))
* qimei ([498a611](https://github.com/icqqjs/icqq/commit/498a611d00c886875a5e78206b0e4700baf558f1))
* qimei in T545 ([eba6355](https://github.com/icqqjs/icqq/commit/eba63557f6ad5d974f7a034ce3ac6ccf794dd7ff))
* QQNT图片解析、优化转发消息上传。 ([65b7bc0](https://github.com/icqqjs/icqq/commit/65b7bc07f581da2f0c169917aa853c70cdae11f2))
* qsignApi异常时不输出错误问题。 ([e3411f8](https://github.com/icqqjs/icqq/commit/e3411f8f7b547fb1d93ff4d57bca9dead655dd58))
* refreshToken ([c19b26f](https://github.com/icqqjs/icqq/commit/c19b26f4ffaad465266c85f3b3a1f7f6043a2ed5))
* replaceAll语法调整 ([3ada7dd](https://github.com/icqqjs/icqq/commit/3ada7ddec5f5845dbc315d505e93f9086807a15d))
* reply 重复处理 ([32c2489](https://github.com/icqqjs/icqq/commit/32c24897126f6a4ec9b3d4a82fe9e37cbd1f31de))
* requestToken ([a6dca70](https://github.com/icqqjs/icqq/commit/a6dca707bfa15470f889d81670e49940440530e9))
* ReserveFields ([007db25](https://github.com/icqqjs/icqq/commit/007db258e336f88739fac1f5648051aa4a11ca29))
* run lint:fix ([226926b](https://github.com/icqqjs/icqq/commit/226926b0b305be76212726e628f73579f12f84ee))
* seq ([7f24e8f](https://github.com/icqqjs/icqq/commit/7f24e8f9b8e8e4e71926c8a4c6fbec7c90d54d57))
* SidTicketExpired？ ([daa5c11](https://github.com/icqqjs/icqq/commit/daa5c116968a38d45f3438f07fdb6f0f70be79fe))
* signApi请求超时时间改为15秒、qsignApi请求超时时间改为30秒。 ([13e88fd](https://github.com/icqqjs/icqq/commit/13e88fd7008b82dc88d483d68d59b13b97c23109))
* sign请求增加重试。 ([12d8962](https://github.com/icqqjs/icqq/commit/12d896275fe40caabada3d0caeb2234faa4b5764))
* sign重试增加延迟。 ([2ce30e6](https://github.com/icqqjs/icqq/commit/2ce30e65451d8f1f24972b993a206348f615e2c7))
* t543读取失败时增加警告 ([3374857](https://github.com/icqqjs/icqq/commit/33748579a15e2209ed591be75529354f20c2032b))
* t548 算法错误 ([790f5ff](https://github.com/icqqjs/icqq/commit/790f5ff07c56f1a2773ab9461ac2f456e61cc4df))
* tgtgt错误，兼容原版oicq登录方式 ([0bab3e0](https://github.com/icqqjs/icqq/commit/0bab3e09d63cc85a6c27de0dfd87f1a3aa5feacf))
* Tim协议心跳超时问题 ([a7d950e](https://github.com/icqqjs/icqq/commit/a7d950e8148949add76f933065de0433b8421f7c))
* tlv543读取失败不用提示。 ([bf0f555](https://github.com/icqqjs/icqq/commit/bf0f555e9b37e35761eaf99796c377980c4c92f8))
* tlv545 ([715df56](https://github.com/icqqjs/icqq/commit/715df56aadabedbcff4a24527c105a6870f9c311))
* token 登录失败 ([2d769ee](https://github.com/icqqjs/icqq/commit/2d769ee9c9471827a93cf4ff83429a82c2f939fe))
* token可能失效时不删除token文件。 ([035ee3a](https://github.com/icqqjs/icqq/commit/035ee3a76050f2386d34c3dbc732765accd7e8f1))
* token失效后报错问题。 ([90e769c](https://github.com/icqqjs/icqq/commit/90e769ccd527999fff1a595e04c0de2444443036))
* token登录提示 ([d2002f8](https://github.com/icqqjs/icqq/commit/d2002f88e21d955383549eeba9a07bcf283df82c))
* typo permisson → permission ([dc435b1](https://github.com/icqqjs/icqq/commit/dc435b1f35b018131e68235d83536c060d7d19a7))
* 上线失败问题。 ([c12ea7a](https://github.com/icqqjs/icqq/commit/c12ea7a69174ed340b1bb38db2f804f239970fc0))
* 优化token上线。 ([89f53fe](https://github.com/icqqjs/icqq/commit/89f53fe068eb485ce810abcc06ba39a3d6faec83))
* 优化token上线。 ([41a076c](https://github.com/icqqjs/icqq/commit/41a076ccbcbd7b39064339b7c4fcaa3453427400))
* 优化上线流程。 ([a1d4adb](https://github.com/icqqjs/icqq/commit/a1d4adbcd5d312b4c8032b07a37b877e93286306))
* 修复node16以上版本无法正常使用问题。 ([c570689](https://github.com/icqqjs/icqq/commit/c570689835627c5e2c64fb50ebfaf355aa3147fa))
* 修复seq为负数时报错问题。 ([9c8c4f8](https://github.com/icqqjs/icqq/commit/9c8c4f8a7f48e5beaf9afcd74eaca0679bd7cad2))
* 修复token刷新失败问题，刷新间隔修改为12小时。 ([bdbfb44](https://github.com/icqqjs/icqq/commit/bdbfb44e2bb39976ecc28a6d0990dd8b4381ccc6))
* 修复watch 扫码登陆 ([02a5749](https://github.com/icqqjs/icqq/commit/02a5749477fdd62e39f8275b1fd23ac82695d8c5))
* 修复扫码登录提示密码错误问题。 ([fc7c80e](https://github.com/icqqjs/icqq/commit/fc7c80ea066b0170515aed1337b13759959bc246))
* 修复无法发送短信验证码问题。 ([8d397bd](https://github.com/icqqjs/icqq/commit/8d397bd7965e6b9b6c7c5814c03114898d5b515e))
* 修复未指定ver时报错问题，增加安卓8.9.70.11730版本信息，导出tlv543。 ([20605c6](https://github.com/icqqjs/icqq/commit/20605c69941e7bf19519672f5020f785bb20ddfa))
* 修复版本过低。 ([79540d7](https://github.com/icqqjs/icqq/commit/79540d75b618fc4ae79ba8a235df4b1df17f56c3))
* 修复特定情况下可能会出现解密返回包失败问题。 ([62f3f12](https://github.com/icqqjs/icqq/commit/62f3f12fa8318ebe546cc54a8cf76b04c6282ec1))
* 修改token失效重试。 ([185c80b](https://github.com/icqqjs/icqq/commit/185c80b5fd93da50a7f8dd0ba24b20ff01871597))
* 修改登录失败提示。 ([02f748a](https://github.com/icqqjs/icqq/commit/02f748a8f7d6191e2788a4f6346eca6397eed6a9))
* 修改签名log、修改私聊消息发送失败判断。 ([ac0f22a](https://github.com/icqqjs/icqq/commit/ac0f22a3bd7703edbf19b793835308da5e806c7e))
* 修改频道消息发送失败判断。 ([3b148da](https://github.com/icqqjs/icqq/commit/3b148dad1067c04879a52123aaed5950e481bd27))
* 刷新token时备份上次token，登录时如找不到token将使用上次的token进行登录 ([8b2a872](https://github.com/icqqjs/icqq/commit/8b2a872a915b6c05b37a6441cf23e2d4879c61eb))
* 刷新token错误 ([15bd8b4](https://github.com/icqqjs/icqq/commit/15bd8b4c0074d047e0793f08c6a0f07befa92ddd))
* 刷新登录token失败问题。 ([6642e59](https://github.com/icqqjs/icqq/commit/6642e595f62d96fd38836e4fd870772f94a37869))
* 刷新签名token间隔改为1小时，更新QQ版本信息到8.9.68.11565。 ([32dcfdf](https://github.com/icqqjs/icqq/commit/32dcfdf117d1160bbdfc65f19c7066ee81650e63))
* 升级triptrap ([eb007a2](https://github.com/icqqjs/icqq/commit/eb007a292acb1dc7347b1706ceee4f2a90a2ce77))
* 合并转发使用预处理 ([7341edf](https://github.com/icqqjs/icqq/commit/7341edf6632703441f4869cf86c2063ac245f7d1))
* 增加8.9.73.11945。 ([b03ff02](https://github.com/icqqjs/icqq/commit/b03ff028207094daaea47c84a69193d646c0a177))
* 增加8.9.75.12110 ([261c992](https://github.com/icqqjs/icqq/commit/261c992e13dcb6a5fc01d004cf633114c3b3185b))
* 增加8.9.76.12115 ([5157ea7](https://github.com/icqqjs/icqq/commit/5157ea7c25ec05942b0c7cf26c9be425ce142cc5))
* 增加8.9.85.12820。 ([77a2ec0](https://github.com/icqqjs/icqq/commit/77a2ec023f21e84c0248fd0c06cd288706701912))
* 增加8.9.88.13035。 ([760c4cd](https://github.com/icqqjs/icqq/commit/760c4cdcf4b737c0812c6b8a27794d461d87c541))
* 增加8.9.90.13250。 ([cd17c52](https://github.com/icqqjs/icqq/commit/cd17c5211f46ff34995f52c1c0a8ae17632d50cb))
* 增加8.9.93.13475。 ([0576fd5](https://github.com/icqqjs/icqq/commit/0576fd527732bdd72178ee0a97040b3c0f999dbe))
* 增加9.0.0.14110。 ([f8105cb](https://github.com/icqqjs/icqq/commit/f8105cbba66d567062539d24a3a0c89f1e85e454))
* 增加9.0.15.14970。 ([919e3cd](https://github.com/icqqjs/icqq/commit/919e3cd0a233391aa90317621e515c25c5fde7a1))
* 增加9.0.17.15185 ([caad99b](https://github.com/icqqjs/icqq/commit/caad99b0f44a8e78b11396b8b76853b330393f8a))
* 增加9.0.8.14755。 ([0f33e42](https://github.com/icqqjs/icqq/commit/0f33e42ba33ed2cc01592539a71ff15cec5c0fe2))
* 增加Android 8.9.78.12275。 ([1c4bce8](https://github.com/icqqjs/icqq/commit/1c4bce8eb94b3c8aaf0a6f4e0d6db789e059c8f1))
* 增加register失败时自动重试。 ([671307d](https://github.com/icqqjs/icqq/commit/671307db65d7c5f343e9710884adc3e52119e825))
* 增加Tim 3.5.6.3208。 ([bd609aa](https://github.com/icqqjs/icqq/commit/bd609aa5a8097e7e432bf0f1514d7dd1ddc0eb9f))
* 增加Tim3.5.2.3178版本信息。 ([c0934c6](https://github.com/icqqjs/icqq/commit/c0934c65e56a5d6a4df86c1e735525a00ae06ce4))
* 增加可组合发送的元素 ([c6786cc](https://github.com/icqqjs/icqq/commit/c6786ccee6134fe5efff9e2fbf6487da941c3617))
* 增加频道相关接口 ([ce7cd33](https://github.com/icqqjs/icqq/commit/ce7cd3344fe71744621621d426d4212ad2bfa4c4))
* 增加频道相关接口... ([e071ea8](https://github.com/icqqjs/icqq/commit/e071ea80f728720cd5e2e306d9440ffb59e12248))
* 安卓手表增加2.1.7版本，安卓手机、apad等可扫码登录。 ([2157196](https://github.com/icqqjs/icqq/commit/2157196997b23339571b0ca4596b1a3658675c17))
* 安卓手表默认版本改为2.0.8。 ([6c33947](https://github.com/icqqjs/icqq/commit/6c33947322913907831944666e544e9077fdd7e5))
* 对于可能存在多个版本的android和aPad，允许用户指定apk(目前仅支持8.9.63,8.9.68) ([4fe1165](https://github.com/icqqjs/icqq/commit/4fe1165b04d6a17cd070b59172b3d1c62cdf60a7))
* 对超级表情进行修复，sface消息类型 ([feca7ed](https://github.com/icqqjs/icqq/commit/feca7eda721b351bc24cb967bc844de1416c8d89))
* 将安卓8.8.88协议替换为Tim3.5.1（platform: 6）需配合签名api使用 ([6ef5b26](https://github.com/icqqjs/icqq/commit/6ef5b26f33921298f774c54ed0906c8b3ae0f0e4))
* 屏蔽tim扫码登录（不支持）。 ([c28b102](https://github.com/icqqjs/icqq/commit/c28b102291d1513d449487603991698a77b8f8fb))
* 屏蔽传参错误 ([ecbc72e](https://github.com/icqqjs/icqq/commit/ecbc72ebc9af5011f7fb9f5191b57a242d1fa1f9))
* 已设置签名api的情况下，签名api请求异常时不发送消息。 ([5150274](https://github.com/icqqjs/icqq/commit/5150274663c5d2133330920fcda6e36757936dde))
* 当传入不支持组合发送的元素时丢弃其他元素。 ([32509fb](https://github.com/icqqjs/icqq/commit/32509fb4f4c4b8fc45def6c8876bff4104121909))
* 手表协议刷新token失败。 ([55c2245](https://github.com/icqqjs/icqq/commit/55c2245e7ae9dacdd52903faf118d23976af233b))
* 扫码登录。 ([c2c38d5](https://github.com/icqqjs/icqq/commit/c2c38d570c26ebcd05f68305f9ad4d0a00f42652))
* 提交验证码时计算t547。 ([8b21c01](https://github.com/icqqjs/icqq/commit/8b21c01a7af3c86267fd29b8322531a6fd1e95ca))
* 提示：此版本更新了token格式，刷新后token将不兼容旧版本。 ([dbd6ac6](https://github.com/icqqjs/icqq/commit/dbd6ac659d66c2371fbcbe83f06bb2e2be32647d))
* 支持Button消息解析。 ([95cc162](https://github.com/icqqjs/icqq/commit/95cc162a86dc526ff20352096ab6b19893dad5d6))
* 支持markdown消息解析。 ([79d169e](https://github.com/icqqjs/icqq/commit/79d169e09b2b3ba731c3f5ce496d02fb53d46727))
* 支持silk转码（silk-wasm）、修复掉线重连报错问题。 ([aea0163](https://github.com/icqqjs/icqq/commit/aea0163e3880b6dfa2ced12e43862584ebff7108))
* 支持群文件转发到私聊以及私聊文件转发到群聊。 ([338c5d2](https://github.com/icqqjs/icqq/commit/338c5d2a6f500e6a419382e4a4f2e1b56b8344b8))
* 支持自定义图片概要。 ([ee7a634](https://github.com/icqqjs/icqq/commit/ee7a634f81d42de1f468d7bea845fb696b06aa7c))
* 支持重写client.getSign（可自行实现调用第三方签名api） ([e87a275](https://github.com/icqqjs/icqq/commit/e87a275c8d0214bdded3ac9401a8be29a3ff5a77))
* 新增设置屏蔽群成员消息屏蔽状态函数(setGroupMemberScreenMsg)，设置为true后，登录账号将在该群不再接受对应群成员消息 ([771311f](https://github.com/icqqjs/icqq/commit/771311f5397f1d98da907947cedcd22641e25c3b))
* 更改t543缺失警告文案 ([bb2efaf](https://github.com/icqqjs/icqq/commit/bb2efaf30a8bdf46b551df0fee7141c159d2ba3c))
* 更改watch自动扫码登陆提示 ([68b4743](https://github.com/icqqjs/icqq/commit/68b474374c1e855db369e00097d6e13c63252285))
* 更新 T544 API ([8ac1c45](https://github.com/icqqjs/icqq/commit/8ac1c457460678e50695a82c773dc3f3bcd2f6b0))
* 更新8.9.63、默认关闭auto_server ([86a345c](https://github.com/icqqjs/icqq/commit/86a345ca089e9d38b73d22c6caf25003393b2951))
* 更新GuildMessageEvent.reply方法签名 ([57bf4ec](https://github.com/icqqjs/icqq/commit/57bf4ec308d2c109557d9b7105dcead81f55ca20))
* 更新QQ版本信息。 ([fc428ac](https://github.com/icqqjs/icqq/commit/fc428ac301ac31197b98c8979c6f8e190e3b68f4))
* 更新ts文件到src，便于区分编译文件和源文件 ([dbca2bb](https://github.com/icqqjs/icqq/commit/dbca2bbb8b98b8f2c68294fcf4024dcc1b8a5dd4))
* 未在config中指定版本时，自动使用签名Api支持的协议版本。 ([11f85fe](https://github.com/icqqjs/icqq/commit/11f85fe70713ffaab52571b3626d48a2a0725bac))
* 未配置sign API改为只提示一次 ([45e6040](https://github.com/icqqjs/icqq/commit/45e604043a97ee49fac6a055a1f409801780a8b3))
* 未配置sign API改为只提示一次 ([45e6040](https://github.com/icqqjs/icqq/commit/45e604043a97ee49fac6a055a1f409801780a8b3))
* 沙箱环境以外的访问到client ([8662855](https://github.com/icqqjs/icqq/commit/8662855e52b7f28ec7c8089bdd53620009da47fd))
* 添加uid参数、tlv543保存到token。 ([a324089](https://github.com/icqqjs/icqq/commit/a32408968784a197a14361fe4e6460c646ecaa7f))
* 添加一些签名cmd名单。 ([1496192](https://github.com/icqqjs/icqq/commit/149619283a6fa9652768cfbde96eba5768c69d25))
* 禁止Tim协议设置在线状态 ([baa7612](https://github.com/icqqjs/icqq/commit/baa76125b1eaf9d475e171138337fad85fd554d5))
* 禁言等功能失效问题。 ([1245c3e](https://github.com/icqqjs/icqq/commit/1245c3eb6492bb33120e1887b10d17bdc744c012))
* 私聊 QQNT 图片 URL ([d118796](https://github.com/icqqjs/icqq/commit/d118796af9c294b3bdcf7ee43565c2d53236cc1d))
* 移除lodash依赖 ([b437b51](https://github.com/icqqjs/icqq/commit/b437b5115295f626e2d2f3cf5f3f7e9c31594ca1))
* 签名api可以不带path。 ([1c1b09e](https://github.com/icqqjs/icqq/commit/1c1b09e1b8a21dbf8734b35ae2db4f37dafb63d4))
* 签名api请求异常时显示错误信息、qsign请求超时时间改为20秒。 ([c0f26be](https://github.com/icqqjs/icqq/commit/c0f26be62574f692cffee2e223c116eea1b7e0d3))
* 签名token改为每50分钟刷新一次、修改了设备信息（更新后需要重新验证设备！） ([2d92001](https://github.com/icqqjs/icqq/commit/2d920013a80a44307855a48173d4ba0ed6271699))
* 类型错误处理 ([b081084](https://github.com/icqqjs/icqq/commit/b081084500469f324b388668f4c7767f82711160))
* 群文件操作。 ([0078316](https://github.com/icqqjs/icqq/commit/0078316e7340bb64cd236ed42d1241df49c646b8))
* 群聊图片ios端显示为表情问题。 ([737f02e](https://github.com/icqqjs/icqq/commit/737f02ef5c157c3dc483e8318712c8b3ff142d68))
* 获取签名Api协议版本时判断sign是否已经初始化。 ([acb6c78](https://github.com/icqqjs/icqq/commit/acb6c78be6b58db58fbda038408ad4ca698af5ce))
* 语音转码后删除缓存，支持发送 Buffer 视频 ([1000e42](https://github.com/icqqjs/icqq/commit/1000e4268eea1e71533eba1722a7588d53bd8f71))
* 转发消息改为json。 ([671ca31](https://github.com/icqqjs/icqq/commit/671ca3155a99244166e15bcf213661334b15e584))
* 适配qsign自动注册。 ([73b1d4c](https://github.com/icqqjs/icqq/commit/73b1d4c1ad7563153a7cb2ca96170c59a97a12f9))
* 部分环境下出现下载转发消息出错问题。 ([e82a784](https://github.com/icqqjs/icqq/commit/e82a7845e24b43920281494c83a0be57555e1995))
* 频道身份组成员列表为空时出错问题。 ([28e6da8](https://github.com/icqqjs/icqq/commit/28e6da8da4b316a60d1c2849dd2a47b34dad4909))
* 默认安卓协议默认版本改为8.9.70。 ([db0e4c5](https://github.com/icqqjs/icqq/commit/db0e4c55a48985e5db771064a7914835a8462686))

## [0.6.10](https://github.com/icqqjs/icqq/compare/v0.6.9...v0.6.10) (2024-02-03)


### Bug Fixes

* 增加可组合发送的元素 ([c6786cc](https://github.com/icqqjs/icqq/commit/c6786ccee6134fe5efff9e2fbf6487da941c3617))

## [0.6.9](https://github.com/icqqjs/icqq/compare/v0.6.8...v0.6.9) (2024-02-03)


### Bug Fixes

* parseSso ([89ed4de](https://github.com/icqqjs/icqq/commit/89ed4de77ea82719f4fa744bca17f7d2579cd762))
* QQNT图片解析、优化转发消息上传。 ([65b7bc0](https://github.com/icqqjs/icqq/commit/65b7bc07f581da2f0c169917aa853c70cdae11f2))
* reply 重复处理 ([32c2489](https://github.com/icqqjs/icqq/commit/32c24897126f6a4ec9b3d4a82fe9e37cbd1f31de))
* typo permisson → permission ([dc435b1](https://github.com/icqqjs/icqq/commit/dc435b1f35b018131e68235d83536c060d7d19a7))
* 修复特定情况下可能会出现解密返回包失败问题。 ([62f3f12](https://github.com/icqqjs/icqq/commit/62f3f12fa8318ebe546cc54a8cf76b04c6282ec1))
* 合并转发使用预处理 ([7341edf](https://github.com/icqqjs/icqq/commit/7341edf6632703441f4869cf86c2063ac245f7d1))
* 增加9.0.15.14970。 ([919e3cd](https://github.com/icqqjs/icqq/commit/919e3cd0a233391aa90317621e515c25c5fde7a1))
* 增加9.0.17.15185 ([caad99b](https://github.com/icqqjs/icqq/commit/caad99b0f44a8e78b11396b8b76853b330393f8a))
* 当传入不支持组合发送的元素时丢弃其他元素。 ([32509fb](https://github.com/icqqjs/icqq/commit/32509fb4f4c4b8fc45def6c8876bff4104121909))
* 支持Button消息解析。 ([95cc162](https://github.com/icqqjs/icqq/commit/95cc162a86dc526ff20352096ab6b19893dad5d6))
* 支持markdown消息解析。 ([79d169e](https://github.com/icqqjs/icqq/commit/79d169e09b2b3ba731c3f5ce496d02fb53d46727))
* 支持silk转码（silk-wasm）、修复掉线重连报错问题。 ([aea0163](https://github.com/icqqjs/icqq/commit/aea0163e3880b6dfa2ced12e43862584ebff7108))
* 支持自定义图片概要。 ([ee7a634](https://github.com/icqqjs/icqq/commit/ee7a634f81d42de1f468d7bea845fb696b06aa7c))
* 添加一些签名cmd名单。 ([1496192](https://github.com/icqqjs/icqq/commit/149619283a6fa9652768cfbde96eba5768c69d25))
* 语音转码后删除缓存，支持发送 Buffer 视频 ([1000e42](https://github.com/icqqjs/icqq/commit/1000e4268eea1e71533eba1722a7588d53bd8f71))

## [0.6.8](https://github.com/icqqjs/icqq/compare/v0.6.7...v0.6.8) (2024-01-11)


### Bug Fixes

* seq ([7f24e8f](https://github.com/icqqjs/icqq/commit/7f24e8f9b8e8e4e71926c8a4c6fbec7c90d54d57))
* token失效后报错问题。 ([90e769c](https://github.com/icqqjs/icqq/commit/90e769ccd527999fff1a595e04c0de2444443036))
* 修改签名log、修改私聊消息发送失败判断。 ([ac0f22a](https://github.com/icqqjs/icqq/commit/ac0f22a3bd7703edbf19b793835308da5e806c7e))
* 修改频道消息发送失败判断。 ([3b148da](https://github.com/icqqjs/icqq/commit/3b148dad1067c04879a52123aaed5950e481bd27))

## [0.6.7](https://github.com/icqqjs/icqq/compare/v0.6.6...v0.6.7) (2024-01-05)


### Bug Fixes

* highwayUpload ([64d34c6](https://github.com/icqqjs/icqq/commit/64d34c64a13085a83ba12976489c631a406e25a9))
* 上线失败问题。 ([c12ea7a](https://github.com/icqqjs/icqq/commit/c12ea7a69174ed340b1bb38db2f804f239970fc0))
* 优化token上线。 ([89f53fe](https://github.com/icqqjs/icqq/commit/89f53fe068eb485ce810abcc06ba39a3d6faec83))
* 优化token上线。 ([41a076c](https://github.com/icqqjs/icqq/commit/41a076ccbcbd7b39064339b7c4fcaa3453427400))
* 修改token失效重试。 ([185c80b](https://github.com/icqqjs/icqq/commit/185c80b5fd93da50a7f8dd0ba24b20ff01871597))
* 增加9.0.8.14755。 ([0f33e42](https://github.com/icqqjs/icqq/commit/0f33e42ba33ed2cc01592539a71ff15cec5c0fe2))
* 提示：此版本更新了token格式，刷新后token将不兼容旧版本。 ([dbd6ac6](https://github.com/icqqjs/icqq/commit/dbd6ac659d66c2371fbcbe83f06bb2e2be32647d))

## [0.6.6](https://github.com/icqqjs/icqq/compare/v0.6.5...v0.6.6) (2023-12-20)


### Bug Fixes

* ？ ([586d80b](https://github.com/icqqjs/icqq/commit/586d80be24922d50721afc373fc4fc1305bfa611))
* 增加9.0.0.14110。 ([f8105cb](https://github.com/icqqjs/icqq/commit/f8105cbba66d567062539d24a3a0c89f1e85e454))

## [0.6.5](https://github.com/icqqjs/icqq/compare/v0.6.4...v0.6.5) (2023-11-30)


### Bug Fixes

* packet timeout ([f063def](https://github.com/icqqjs/icqq/commit/f063def8c8851417a48d27ca09f81bf6c2d659b1))
* SidTicketExpired？ ([daa5c11](https://github.com/icqqjs/icqq/commit/daa5c116968a38d45f3438f07fdb6f0f70be79fe))
* 修复seq为负数时报错问题。 ([9c8c4f8](https://github.com/icqqjs/icqq/commit/9c8c4f8a7f48e5beaf9afcd74eaca0679bd7cad2))
* 增加8.9.93.13475。 ([0576fd5](https://github.com/icqqjs/icqq/commit/0576fd527732bdd72178ee0a97040b3c0f999dbe))

## [0.6.4](https://github.com/icqqjs/icqq/compare/v0.6.3...v0.6.4) (2023-11-27)


### Bug Fixes

* Proto类增加toJSON()方法，方便调试 ([3094c6e](https://github.com/icqqjs/icqq/commit/3094c6e49f7047d2fdef7e9759414542ed077199))
* token可能失效时不删除token文件。 ([035ee3a](https://github.com/icqqjs/icqq/commit/035ee3a76050f2386d34c3dbc732765accd7e8f1))
* 增加Tim 3.5.6.3208。 ([bd609aa](https://github.com/icqqjs/icqq/commit/bd609aa5a8097e7e432bf0f1514d7dd1ddc0eb9f))
* 手表协议刷新token失败。 ([55c2245](https://github.com/icqqjs/icqq/commit/55c2245e7ae9dacdd52903faf118d23976af233b))
* 扫码登录。 ([c2c38d5](https://github.com/icqqjs/icqq/commit/c2c38d570c26ebcd05f68305f9ad4d0a00f42652))

## [0.6.3](https://github.com/icqqjs/icqq/compare/v0.6.2...v0.6.3) (2023-11-16)


### Bug Fixes

* 增加8.9.90.13250。 ([cd17c52](https://github.com/icqqjs/icqq/commit/cd17c5211f46ff34995f52c1c0a8ae17632d50cb))
* 禁言等功能失效问题。 ([1245c3e](https://github.com/icqqjs/icqq/commit/1245c3eb6492bb33120e1887b10d17bdc744c012))

## [0.6.2](https://github.com/icqqjs/icqq/compare/v0.6.1...v0.6.2) (2023-11-06)


### Bug Fixes

* iPad -&gt; aPad ([98d5110](https://github.com/icqqjs/icqq/commit/98d51109480ecd4e770eec006052a8dd7b2909f2))
* qimei in T545 ([eba6355](https://github.com/icqqjs/icqq/commit/eba63557f6ad5d974f7a034ce3ac6ccf794dd7ff))
* ReserveFields ([007db25](https://github.com/icqqjs/icqq/commit/007db258e336f88739fac1f5648051aa4a11ca29))
* tlv545 ([715df56](https://github.com/icqqjs/icqq/commit/715df56aadabedbcff4a24527c105a6870f9c311))
* 优化上线流程。 ([a1d4adb](https://github.com/icqqjs/icqq/commit/a1d4adbcd5d312b4c8032b07a37b877e93286306))
* 增加8.9.85.12820。 ([77a2ec0](https://github.com/icqqjs/icqq/commit/77a2ec023f21e84c0248fd0c06cd288706701912))
* 增加8.9.88.13035。 ([760c4cd](https://github.com/icqqjs/icqq/commit/760c4cdcf4b737c0812c6b8a27794d461d87c541))

## [0.6.1](https://github.com/icqqjs/icqq/compare/v0.6.0...v0.6.1) (2023-10-16)


### Bug Fixes

* 。 ([bed55e2](https://github.com/icqqjs/icqq/commit/bed55e2c1fbd631e50e8b3936bf146d0e2445a5d))

## [0.6.0](https://github.com/icqqjs/icqq/compare/v0.5.4...v0.6.0) (2023-09-27)


### Features

* export axios for reuse in other projects ([f7c9f37](https://github.com/icqqjs/icqq/commit/f7c9f37c34f6403870b7a1aaeaf53610b64b6a60))
* Support nested MultiMsg ([#373](https://github.com/icqqjs/icqq/issues/373)) ([8de6eb2](https://github.com/icqqjs/icqq/commit/8de6eb2e33b6cb07e301b90703b0aeeaa2f7c876))
* tlv548 ([498a611](https://github.com/icqqjs/icqq/commit/498a611d00c886875a5e78206b0e4700baf558f1))
* 增加新表情 ([#379](https://github.com/icqqjs/icqq/issues/379)) ([211bc18](https://github.com/icqqjs/icqq/commit/211bc186b834704b4ac68b6883d2aaa1e40b84df))
* 实现消息签名组包（test）。 ([e75fa03](https://github.com/icqqjs/icqq/commit/e75fa0334ab01bb56c9824058831931f63e90f94))
* 新增安卓QQ8.8.88版本协议，Platform = 6，无法登录的可尝试。 ([e3baaa6](https://github.com/icqqjs/icqq/commit/e3baaa621d0b2f458e6d113e5df7d3872f0ad467))
* 解析新 QQNT 发送的图片 ([f0e973b](https://github.com/icqqjs/icqq/commit/f0e973b522904463a83c723d1c6a2e6d4ecea0f4))


### Bug Fixes

* . ([d99c3b0](https://github.com/icqqjs/icqq/commit/d99c3b05a93da16e4b13b229f0646b48766ea21c))
* 。 ([4700e26](https://github.com/icqqjs/icqq/commit/4700e263d10e14b36097fe11b3db8b3ad3656597))
* 。 ([0d78051](https://github.com/icqqjs/icqq/commit/0d78051bdbd326bfca3216fe84f43b3ad312656d))
* 。 ([64682e8](https://github.com/icqqjs/icqq/commit/64682e839c6908cb0c361bd557b9d61e5fdb5706))
* 544改为本地计算 ([df2a208](https://github.com/icqqjs/icqq/commit/df2a20845f4119dc437afc5133e0ea75b95dd522))
* add some demo of icqq ([b8f6e12](https://github.com/icqqjs/icqq/commit/b8f6e12e83071776cd5cf1309927a93fd2a06c93))
* add tlv16a ([6573e3a](https://github.com/icqqjs/icqq/commit/6573e3a487571e5bf373511010735bbedd1b0ba9))
* apk增加device_type参数（用于扫码登录）。 ([b245101](https://github.com/icqqjs/icqq/commit/b2451019f41e611fded48ac8b15dc1d3fe18cc9c))
* Config增加签名接口地址配置，可自行实现签名API，供ICQQ调用 ([412c387](https://github.com/icqqjs/icqq/commit/412c3871ed84bd03d53d8f61127e4bbb29c431fd))
* deviceInfo ([a075c86](https://github.com/icqqjs/icqq/commit/a075c865b04f9f09fb63d2eb5c3fc6df1ed553fe))
* device降会35 ([667bac7](https://github.com/icqqjs/icqq/commit/667bac7c6a93d5dec8d576ff61b708beb2de32a2))
* generate IMEI ([6be4f9f](https://github.com/icqqjs/icqq/commit/6be4f9f7790d7386e9d94ea738f1497bec4c54e8))
* internal中，获取个性签名方法getSign弃用，后续开发中请使用更具语义化的getPersonalSign替换;client增加获取个性签名方法(getSignature) ([39be3f5](https://github.com/icqqjs/icqq/commit/39be3f5ad3129478f5a56b1bad5582a69bac6c4d))
* ipad ver ([58e2529](https://github.com/icqqjs/icqq/commit/58e2529642a011ce8f29dd5d1a6b95590d479c8b))
* ipad协议登录报错问题（不是解决禁止登录）。 ([1c718ad](https://github.com/icqqjs/icqq/commit/1c718ad43bb31dadac899af076c7a74744312c03))
* login error 16 ([f4d9c4f](https://github.com/icqqjs/icqq/commit/f4d9c4fc82462ca2238b36fb7dcf1f0c7e18b687))
* mac协议无法登录问题。 ([c06e734](https://github.com/icqqjs/icqq/commit/c06e734079881b5ac27425ec48cdd863f323ee69))
* out dir error ([fc69814](https://github.com/icqqjs/icqq/commit/fc69814108d6f2798d514847a8de8aebc9058a5b))
* PoW 算法错误 ([5f47445](https://github.com/icqqjs/icqq/commit/5f4744596b78b88c12189f5b9ac89b2f294be299))
* prettier log ([984d59b](https://github.com/icqqjs/icqq/commit/984d59be7b62333f73a3446a4b2349c30170d660))
* pretty code;allow custom logger ([0e57711](https://github.com/icqqjs/icqq/commit/0e5771128f886b227acf911746a75f73845b535c))
* publish error ([ec80b45](https://github.com/icqqjs/icqq/commit/ec80b454bc0a236fd0348945b862ca0e66fd750b))
* qimei ([498a611](https://github.com/icqqjs/icqq/commit/498a611d00c886875a5e78206b0e4700baf558f1))
* qimei sdkver ([4663e3a](https://github.com/icqqjs/icqq/commit/4663e3a314fdd81b1481f0ae151c8eeddd972c69))
* qsignApi异常时不输出错误问题。 ([e3411f8](https://github.com/icqqjs/icqq/commit/e3411f8f7b547fb1d93ff4d57bca9dead655dd58))
* refreshToken ([c19b26f](https://github.com/icqqjs/icqq/commit/c19b26f4ffaad465266c85f3b3a1f7f6043a2ed5))
* replaceAll语法调整 ([3ada7dd](https://github.com/icqqjs/icqq/commit/3ada7ddec5f5845dbc315d505e93f9086807a15d))
* requestToken ([a6dca70](https://github.com/icqqjs/icqq/commit/a6dca707bfa15470f889d81670e49940440530e9))
* run lint:fix ([226926b](https://github.com/icqqjs/icqq/commit/226926b0b305be76212726e628f73579f12f84ee))
* signApi请求超时时间改为15秒、qsignApi请求超时时间改为30秒。 ([13e88fd](https://github.com/icqqjs/icqq/commit/13e88fd7008b82dc88d483d68d59b13b97c23109))
* sign请求增加重试。 ([12d8962](https://github.com/icqqjs/icqq/commit/12d896275fe40caabada3d0caeb2234faa4b5764))
* sign重试增加延迟。 ([2ce30e6](https://github.com/icqqjs/icqq/commit/2ce30e65451d8f1f24972b993a206348f615e2c7))
* t543读取失败时增加警告 ([3374857](https://github.com/icqqjs/icqq/commit/33748579a15e2209ed591be75529354f20c2032b))
* t548 算法错误 ([790f5ff](https://github.com/icqqjs/icqq/commit/790f5ff07c56f1a2773ab9461ac2f456e61cc4df))
* tgtgt错误，兼容原版oicq登录方式 ([0bab3e0](https://github.com/icqqjs/icqq/commit/0bab3e09d63cc85a6c27de0dfd87f1a3aa5feacf))
* Tim协议心跳超时问题 ([a7d950e](https://github.com/icqqjs/icqq/commit/a7d950e8148949add76f933065de0433b8421f7c))
* tlv543读取失败不用提示。 ([bf0f555](https://github.com/icqqjs/icqq/commit/bf0f555e9b37e35761eaf99796c377980c4c92f8))
* token 登录失败 ([2d769ee](https://github.com/icqqjs/icqq/commit/2d769ee9c9471827a93cf4ff83429a82c2f939fe))
* token登录提示 ([d2002f8](https://github.com/icqqjs/icqq/commit/d2002f88e21d955383549eeba9a07bcf283df82c))
* type Error ([adf3ba6](https://github.com/icqqjs/icqq/commit/adf3ba6f3e9737e0cc4fddd00bdeb8335a42081a))
* update SSO config server URL ([#352](https://github.com/icqqjs/icqq/issues/352)) ([c1d6d99](https://github.com/icqqjs/icqq/commit/c1d6d9989018b58a532ca5cee20e9aa4cc00e64c))
* 修复node16以上版本无法正常使用问题。 ([c570689](https://github.com/icqqjs/icqq/commit/c570689835627c5e2c64fb50ebfaf355aa3147fa))
* 修复token刷新失败问题，刷新间隔修改为12小时。 ([bdbfb44](https://github.com/icqqjs/icqq/commit/bdbfb44e2bb39976ecc28a6d0990dd8b4381ccc6))
* 修复watch 扫码登陆 ([02a5749](https://github.com/icqqjs/icqq/commit/02a5749477fdd62e39f8275b1fd23ac82695d8c5))
* 修复扫码登录提示密码错误问题。 ([fc7c80e](https://github.com/icqqjs/icqq/commit/fc7c80ea066b0170515aed1337b13759959bc246))
* 修复无法发送短信验证码问题。 ([8d397bd](https://github.com/icqqjs/icqq/commit/8d397bd7965e6b9b6c7c5814c03114898d5b515e))
* 修复未指定ver时报错问题，增加安卓8.9.70.11730版本信息，导出tlv543。 ([20605c6](https://github.com/icqqjs/icqq/commit/20605c69941e7bf19519672f5020f785bb20ddfa))
* 修复版本过低。 ([79540d7](https://github.com/icqqjs/icqq/commit/79540d75b618fc4ae79ba8a235df4b1df17f56c3))
* 修复特殊文件(文件名带%)的链接无法正常下载 ([d82e127](https://github.com/icqqjs/icqq/commit/d82e1274026c956966ee7c5af86c84c8230119a6))
* 刷新token时备份上次token，登录时如找不到token将使用上次的token进行登录 ([8b2a872](https://github.com/icqqjs/icqq/commit/8b2a872a915b6c05b37a6441cf23e2d4879c61eb))
* 刷新token错误 ([15bd8b4](https://github.com/icqqjs/icqq/commit/15bd8b4c0074d047e0793f08c6a0f07befa92ddd))
* 刷新登录token失败问题。 ([6642e59](https://github.com/icqqjs/icqq/commit/6642e595f62d96fd38836e4fd870772f94a37869))
* 刷新签名token间隔改为1小时，更新QQ版本信息到8.9.68.11565。 ([32dcfdf](https://github.com/icqqjs/icqq/commit/32dcfdf117d1160bbdfc65f19c7066ee81650e63))
* 升级triptrap ([eb007a2](https://github.com/icqqjs/icqq/commit/eb007a292acb1dc7347b1706ceee4f2a90a2ce77))
* 合并转发消息使用群聊模式会导致部分框架无法解析来源 ([#361](https://github.com/icqqjs/icqq/issues/361)) ([1c4b261](https://github.com/icqqjs/icqq/commit/1c4b261471bee8aecce83f00b3571220ca39d207))
* 增加8.9.73.11945。 ([b03ff02](https://github.com/icqqjs/icqq/commit/b03ff028207094daaea47c84a69193d646c0a177))
* 增加8.9.75.12110 ([261c992](https://github.com/icqqjs/icqq/commit/261c992e13dcb6a5fc01d004cf633114c3b3185b))
* 增加8.9.76.12115 ([5157ea7](https://github.com/icqqjs/icqq/commit/5157ea7c25ec05942b0c7cf26c9be425ce142cc5))
* 增加Android 8.9.78.12275。 ([1c4bce8](https://github.com/icqqjs/icqq/commit/1c4bce8eb94b3c8aaf0a6f4e0d6db789e059c8f1))
* 增加register失败时自动重试。 ([671307d](https://github.com/icqqjs/icqq/commit/671307db65d7c5f343e9710884adc3e52119e825))
* 增加Tim3.5.2.3178版本信息。 ([c0934c6](https://github.com/icqqjs/icqq/commit/c0934c65e56a5d6a4df86c1e735525a00ae06ce4))
* 增加频道相关接口 ([ce7cd33](https://github.com/icqqjs/icqq/commit/ce7cd3344fe71744621621d426d4212ad2bfa4c4))
* 增加频道相关接口... ([e071ea8](https://github.com/icqqjs/icqq/commit/e071ea80f728720cd5e2e306d9440ffb59e12248))
* 安卓手表增加2.1.7版本，安卓手机、apad等可扫码登录。 ([2157196](https://github.com/icqqjs/icqq/commit/2157196997b23339571b0ca4596b1a3658675c17))
* 安卓手表默认版本改为2.0.8。 ([6c33947](https://github.com/icqqjs/icqq/commit/6c33947322913907831944666e544e9077fdd7e5))
* 对于可能存在多个版本的android和aPad，允许用户指定apk(目前仅支持8.9.63,8.9.68) ([4fe1165](https://github.com/icqqjs/icqq/commit/4fe1165b04d6a17cd070b59172b3d1c62cdf60a7))
* 对超级表情进行修复，sface消息类型 ([feca7ed](https://github.com/icqqjs/icqq/commit/feca7eda721b351bc24cb967bc844de1416c8d89))
* 将安卓8.8.88协议替换为Tim3.5.1（platform: 6）需配合签名api使用 ([6ef5b26](https://github.com/icqqjs/icqq/commit/6ef5b26f33921298f774c54ed0906c8b3ae0f0e4))
* 屏蔽tim扫码登录（不支持）。 ([c28b102](https://github.com/icqqjs/icqq/commit/c28b102291d1513d449487603991698a77b8f8fb))
* 屏蔽传参错误 ([ecbc72e](https://github.com/icqqjs/icqq/commit/ecbc72ebc9af5011f7fb9f5191b57a242d1fa1f9))
* 已设置签名api的情况下，签名api请求异常时不发送消息。 ([5150274](https://github.com/icqqjs/icqq/commit/5150274663c5d2133330920fcda6e36757936dde))
* 提交验证码时计算t547。 ([8b21c01](https://github.com/icqqjs/icqq/commit/8b21c01a7af3c86267fd29b8322531a6fd1e95ca))
* 支持群文件转发到私聊以及私聊文件转发到群聊。 ([338c5d2](https://github.com/icqqjs/icqq/commit/338c5d2a6f500e6a419382e4a4f2e1b56b8344b8))
* 支持重写client.getSign（可自行实现调用第三方签名api） ([e87a275](https://github.com/icqqjs/icqq/commit/e87a275c8d0214bdded3ac9401a8be29a3ff5a77))
* 新增设置屏蔽群成员消息屏蔽状态函数(setGroupMemberScreenMsg)，设置为true后，登录账号将在该群不再接受对应群成员消息 ([771311f](https://github.com/icqqjs/icqq/commit/771311f5397f1d98da907947cedcd22641e25c3b))
* 更改t543缺失警告文案 ([bb2efaf](https://github.com/icqqjs/icqq/commit/bb2efaf30a8bdf46b551df0fee7141c159d2ba3c))
* 更改watch自动扫码登陆提示 ([68b4743](https://github.com/icqqjs/icqq/commit/68b474374c1e855db369e00097d6e13c63252285))
* 更新 T544 API ([8ac1c45](https://github.com/icqqjs/icqq/commit/8ac1c457460678e50695a82c773dc3f3bcd2f6b0))
* 更新8.9.63、默认关闭auto_server ([86a345c](https://github.com/icqqjs/icqq/commit/86a345ca089e9d38b73d22c6caf25003393b2951))
* 更新GuildMessageEvent.reply方法签名 ([57bf4ec](https://github.com/icqqjs/icqq/commit/57bf4ec308d2c109557d9b7105dcead81f55ca20))
* 更新QQ版本信息。 ([fc428ac](https://github.com/icqqjs/icqq/commit/fc428ac301ac31197b98c8979c6f8e190e3b68f4))
* 更新ts文件到src，便于区分编译文件和源文件 ([dbca2bb](https://github.com/icqqjs/icqq/commit/dbca2bbb8b98b8f2c68294fcf4024dcc1b8a5dd4))
* 未在config中指定版本时，自动使用签名Api支持的协议版本。 ([11f85fe](https://github.com/icqqjs/icqq/commit/11f85fe70713ffaab52571b3626d48a2a0725bac))
* 未配置sign API改为只提示一次 ([45e6040](https://github.com/icqqjs/icqq/commit/45e604043a97ee49fac6a055a1f409801780a8b3))
* 未配置sign API改为只提示一次 ([45e6040](https://github.com/icqqjs/icqq/commit/45e604043a97ee49fac6a055a1f409801780a8b3))
* 沙箱环境以外的访问到client ([8662855](https://github.com/icqqjs/icqq/commit/8662855e52b7f28ec7c8089bdd53620009da47fd))
* 添加uid参数、tlv543保存到token。 ([a324089](https://github.com/icqqjs/icqq/commit/a32408968784a197a14361fe4e6460c646ecaa7f))
* 禁止Tim协议设置在线状态 ([baa7612](https://github.com/icqqjs/icqq/commit/baa76125b1eaf9d475e171138337fad85fd554d5))
* 私聊 QQNT 图片 URL ([d118796](https://github.com/icqqjs/icqq/commit/d118796af9c294b3bdcf7ee43565c2d53236cc1d))
* 移除lodash依赖 ([b437b51](https://github.com/icqqjs/icqq/commit/b437b5115295f626e2d2f3cf5f3f7e9c31594ca1))
* 签名api可以不带path。 ([1c1b09e](https://github.com/icqqjs/icqq/commit/1c1b09e1b8a21dbf8734b35ae2db4f37dafb63d4))
* 签名api请求异常时显示错误信息、qsign请求超时时间改为20秒。 ([c0f26be](https://github.com/icqqjs/icqq/commit/c0f26be62574f692cffee2e223c116eea1b7e0d3))
* 签名token改为每50分钟刷新一次、修改了设备信息（更新后需要重新验证设备！） ([2d92001](https://github.com/icqqjs/icqq/commit/2d920013a80a44307855a48173d4ba0ed6271699))
* 类型错误处理 ([b081084](https://github.com/icqqjs/icqq/commit/b081084500469f324b388668f4c7767f82711160))
* 群文件操作。 ([0078316](https://github.com/icqqjs/icqq/commit/0078316e7340bb64cd236ed42d1241df49c646b8))
* 群聊图片ios端显示为表情问题。 ([737f02e](https://github.com/icqqjs/icqq/commit/737f02ef5c157c3dc483e8318712c8b3ff142d68))
* 获取签名Api协议版本时判断sign是否已经初始化。 ([acb6c78](https://github.com/icqqjs/icqq/commit/acb6c78be6b58db58fbda038408ad4ca698af5ce))
* 转发消息改为json。 ([671ca31](https://github.com/icqqjs/icqq/commit/671ca3155a99244166e15bcf213661334b15e584))
* 适配qsign自动注册。 ([73b1d4c](https://github.com/icqqjs/icqq/commit/73b1d4c1ad7563153a7cb2ca96170c59a97a12f9))
* 部分环境下出现下载转发消息出错问题。 ([e82a784](https://github.com/icqqjs/icqq/commit/e82a7845e24b43920281494c83a0be57555e1995))
* 频道身份组成员列表为空时出错问题。 ([28e6da8](https://github.com/icqqjs/icqq/commit/28e6da8da4b316a60d1c2849dd2a47b34dad4909))
* 默认安卓协议默认版本改为8.9.70。 ([db0e4c5](https://github.com/icqqjs/icqq/commit/db0e4c55a48985e5db771064a7914835a8462686))

## [0.5.4](https://github.com/icqqjs/icqq/compare/v0.5.3...v0.5.4) (2023-09-19)


### Bug Fixes

* 增加频道相关接口... ([e071ea8](https://github.com/icqqjs/icqq/commit/e071ea80f728720cd5e2e306d9440ffb59e12248))
* 类型错误处理 ([b081084](https://github.com/icqqjs/icqq/commit/b081084500469f324b388668f4c7767f82711160))

## [0.5.3](https://github.com/icqqjs/icqq/compare/v0.5.2...v0.5.3) (2023-09-01)


### Bug Fixes

* add some demo of icqq ([b8f6e12](https://github.com/icqqjs/icqq/commit/b8f6e12e83071776cd5cf1309927a93fd2a06c93))
* run lint:fix ([226926b](https://github.com/icqqjs/icqq/commit/226926b0b305be76212726e628f73579f12f84ee))
* 增加Android 8.9.78.12275。 ([1c4bce8](https://github.com/icqqjs/icqq/commit/1c4bce8eb94b3c8aaf0a6f4e0d6db789e059c8f1))
* 增加频道相关接口 ([ce7cd33](https://github.com/icqqjs/icqq/commit/ce7cd3344fe71744621621d426d4212ad2bfa4c4))
* 更新QQ版本信息。 ([fc428ac](https://github.com/icqqjs/icqq/commit/fc428ac301ac31197b98c8979c6f8e190e3b68f4))
* 获取签名Api协议版本时判断sign是否已经初始化。 ([acb6c78](https://github.com/icqqjs/icqq/commit/acb6c78be6b58db58fbda038408ad4ca698af5ce))

## [0.5.2](https://github.com/icqqjs/icqq/compare/v0.5.1...v0.5.2) (2023-08-25)


### Bug Fixes

* 对超级表情进行修复，sface消息类型 ([feca7ed](https://github.com/icqqjs/icqq/commit/feca7eda721b351bc24cb967bc844de1416c8d89))

## [0.5.1](https://github.com/icqqjs/icqq/compare/v0.5.0...v0.5.1) (2023-08-23)


### Bug Fixes

* qsignApi异常时不输出错误问题。 ([e3411f8](https://github.com/icqqjs/icqq/commit/e3411f8f7b547fb1d93ff4d57bca9dead655dd58))
* 增加8.9.75.12110 ([261c992](https://github.com/icqqjs/icqq/commit/261c992e13dcb6a5fc01d004cf633114c3b3185b))
* 增加8.9.76.12115 ([5157ea7](https://github.com/icqqjs/icqq/commit/5157ea7c25ec05942b0c7cf26c9be425ce142cc5))
* 支持群文件转发到私聊以及私聊文件转发到群聊。 ([338c5d2](https://github.com/icqqjs/icqq/commit/338c5d2a6f500e6a419382e4a4f2e1b56b8344b8))
* 未在config中指定版本时，自动使用签名Api支持的协议版本。 ([11f85fe](https://github.com/icqqjs/icqq/commit/11f85fe70713ffaab52571b3626d48a2a0725bac))
* 群文件操作。 ([0078316](https://github.com/icqqjs/icqq/commit/0078316e7340bb64cd236ed42d1241df49c646b8))

## [0.5.0](https://github.com/icqqjs/icqq/compare/v0.4.14...v0.5.0) (2023-08-14)


### Features

* export axios for reuse in other projects ([f7c9f37](https://github.com/icqqjs/icqq/commit/f7c9f37c34f6403870b7a1aaeaf53610b64b6a60))


### Bug Fixes

* 刷新登录token失败问题。 ([6642e59](https://github.com/icqqjs/icqq/commit/6642e595f62d96fd38836e4fd870772f94a37869))
* 更新GuildMessageEvent.reply方法签名 ([57bf4ec](https://github.com/icqqjs/icqq/commit/57bf4ec308d2c109557d9b7105dcead81f55ca20))
* 频道身份组成员列表为空时出错问题。 ([28e6da8](https://github.com/icqqjs/icqq/commit/28e6da8da4b316a60d1c2849dd2a47b34dad4909))

## [0.4.14](https://github.com/icqqjs/icqq/compare/v0.4.13...v0.4.14) (2023-08-09)


### Bug Fixes

* apk增加device_type参数（用于扫码登录）。 ([b245101](https://github.com/icqqjs/icqq/commit/b2451019f41e611fded48ac8b15dc1d3fe18cc9c))
* ipad协议登录报错问题（不是解决禁止登录）。 ([1c718ad](https://github.com/icqqjs/icqq/commit/1c718ad43bb31dadac899af076c7a74744312c03))
* 增加register失败时自动重试。 ([671307d](https://github.com/icqqjs/icqq/commit/671307db65d7c5f343e9710884adc3e52119e825))
* 安卓手表增加2.1.7版本，安卓手机、apad等可扫码登录。 ([2157196](https://github.com/icqqjs/icqq/commit/2157196997b23339571b0ca4596b1a3658675c17))
* 安卓手表默认版本改为2.0.8。 ([6c33947](https://github.com/icqqjs/icqq/commit/6c33947322913907831944666e544e9077fdd7e5))
* 屏蔽tim扫码登录（不支持）。 ([c28b102](https://github.com/icqqjs/icqq/commit/c28b102291d1513d449487603991698a77b8f8fb))

## [0.4.13](https://github.com/icqqjs/icqq/compare/v0.4.12...v0.4.13) (2023-08-05)


### Bug Fixes

* signApi请求超时时间改为15秒、qsignApi请求超时时间改为30秒。 ([13e88fd](https://github.com/icqqjs/icqq/commit/13e88fd7008b82dc88d483d68d59b13b97c23109))
* 增加8.9.73.11945。 ([b03ff02](https://github.com/icqqjs/icqq/commit/b03ff028207094daaea47c84a69193d646c0a177))
* 已设置签名api的情况下，签名api请求异常时不发送消息。 ([5150274](https://github.com/icqqjs/icqq/commit/5150274663c5d2133330920fcda6e36757936dde))
* 签名api可以不带path。 ([1c1b09e](https://github.com/icqqjs/icqq/commit/1c1b09e1b8a21dbf8734b35ae2db4f37dafb63d4))
* 群聊图片ios端显示为表情问题。 ([737f02e](https://github.com/icqqjs/icqq/commit/737f02ef5c157c3dc483e8318712c8b3ff142d68))
* 部分环境下出现下载转发消息出错问题。 ([e82a784](https://github.com/icqqjs/icqq/commit/e82a7845e24b43920281494c83a0be57555e1995))
* 默认安卓协议默认版本改为8.9.70。 ([db0e4c5](https://github.com/icqqjs/icqq/commit/db0e4c55a48985e5db771064a7914835a8462686))

## [0.4.12](https://github.com/icqqjs/icqq/compare/v0.4.11...v0.4.12) (2023-07-24)


### Bug Fixes

* internal中，获取个性签名方法getSign弃用，后续开发中请使用更具语义化的getPersonalSign替换;client增加获取个性签名方法(getSignature) ([39be3f5](https://github.com/icqqjs/icqq/commit/39be3f5ad3129478f5a56b1bad5582a69bac6c4d))
* t543读取失败时增加警告 ([3374857](https://github.com/icqqjs/icqq/commit/33748579a15e2209ed591be75529354f20c2032b))
* tlv543读取失败不用提示。 ([bf0f555](https://github.com/icqqjs/icqq/commit/bf0f555e9b37e35761eaf99796c377980c4c92f8))
* 修复未指定ver时报错问题，增加安卓8.9.70.11730版本信息，导出tlv543。 ([20605c6](https://github.com/icqqjs/icqq/commit/20605c69941e7bf19519672f5020f785bb20ddfa))
* 增加Tim3.5.2.3178版本信息。 ([c0934c6](https://github.com/icqqjs/icqq/commit/c0934c65e56a5d6a4df86c1e735525a00ae06ce4))
* 屏蔽传参错误 ([ecbc72e](https://github.com/icqqjs/icqq/commit/ecbc72ebc9af5011f7fb9f5191b57a242d1fa1f9))
* 新增设置屏蔽群成员消息屏蔽状态函数(setGroupMemberScreenMsg)，设置为true后，登录账号将在该群不再接受对应群成员消息 ([771311f](https://github.com/icqqjs/icqq/commit/771311f5397f1d98da907947cedcd22641e25c3b))
* 更改t543缺失警告文案 ([bb2efaf](https://github.com/icqqjs/icqq/commit/bb2efaf30a8bdf46b551df0fee7141c159d2ba3c))
* 添加uid参数、tlv543保存到token。 ([a324089](https://github.com/icqqjs/icqq/commit/a32408968784a197a14361fe4e6460c646ecaa7f))
* 转发消息改为json。 ([671ca31](https://github.com/icqqjs/icqq/commit/671ca3155a99244166e15bcf213661334b15e584))

## [0.4.11](https://github.com/icqqjs/icqq/compare/v0.4.10...v0.4.11) (2023-07-15)


### Bug Fixes

* deviceInfo ([a075c86](https://github.com/icqqjs/icqq/commit/a075c865b04f9f09fb63d2eb5c3fc6df1ed553fe))
* pretty code;allow custom logger ([0e57711](https://github.com/icqqjs/icqq/commit/0e5771128f886b227acf911746a75f73845b535c))
* refreshToken ([c19b26f](https://github.com/icqqjs/icqq/commit/c19b26f4ffaad465266c85f3b3a1f7f6043a2ed5))
* 刷新签名token间隔改为1小时，更新QQ版本信息到8.9.68.11565。 ([32dcfdf](https://github.com/icqqjs/icqq/commit/32dcfdf117d1160bbdfc65f19c7066ee81650e63))
* 签名api请求异常时显示错误信息、qsign请求超时时间改为20秒。 ([c0f26be](https://github.com/icqqjs/icqq/commit/c0f26be62574f692cffee2e223c116eea1b7e0d3))
* 适配qsign自动注册。 ([73b1d4c](https://github.com/icqqjs/icqq/commit/73b1d4c1ad7563153a7cb2ca96170c59a97a12f9))

## [0.4.10](https://github.com/icqqjs/icqq/compare/v0.4.9...v0.4.10) (2023-07-05)


### Bug Fixes

* requestToken ([a6dca70](https://github.com/icqqjs/icqq/commit/a6dca707bfa15470f889d81670e49940440530e9))

## [0.4.9](https://github.com/icqqjs/icqq/compare/v0.4.8...v0.4.9) (2023-07-05)


### Bug Fixes

* 签名token改为每50分钟刷新一次、修改了设备信息（更新后需要重新验证设备！） ([2d92001](https://github.com/icqqjs/icqq/commit/2d920013a80a44307855a48173d4ba0ed6271699))

## [0.4.8](https://github.com/icqqjs/icqq/compare/v0.4.7...v0.4.8) (2023-07-01)


### Bug Fixes

* 更新8.9.63、默认关闭auto_server ([86a345c](https://github.com/icqqjs/icqq/commit/86a345ca089e9d38b73d22c6caf25003393b2951))

## [0.4.7](https://github.com/icqqjs/icqq/compare/v0.4.6...v0.4.7) (2023-06-24)


### Bug Fixes

* 支持重写client.getSign（可自行实现调用第三方签名api） ([e87a275](https://github.com/icqqjs/icqq/commit/e87a275c8d0214bdded3ac9401a8be29a3ff5a77))

## [0.4.6](https://github.com/icqqjs/icqq/compare/v0.4.5...v0.4.6) (2023-06-23)


### Bug Fixes

* ipad ver ([58e2529](https://github.com/icqqjs/icqq/commit/58e2529642a011ce8f29dd5d1a6b95590d479c8b))

## [0.4.5](https://github.com/icqqjs/icqq/compare/v0.4.4...v0.4.5) (2023-06-23)


### Bug Fixes

* 禁止Tim协议设置在线状态 ([baa7612](https://github.com/icqqjs/icqq/commit/baa76125b1eaf9d475e171138337fad85fd554d5))

## [0.4.4](https://github.com/icqqjs/icqq/compare/v0.4.3...v0.4.4) (2023-06-23)


### Bug Fixes

* Tim协议心跳超时问题 ([a7d950e](https://github.com/icqqjs/icqq/commit/a7d950e8148949add76f933065de0433b8421f7c))

## [0.4.3](https://github.com/icqqjs/icqq/compare/v0.4.2...v0.4.3) (2023-06-23)


### Bug Fixes

* 将安卓8.8.88协议替换为Tim3.5.1（platform: 6）需配合签名api使用 ([6ef5b26](https://github.com/icqqjs/icqq/commit/6ef5b26f33921298f774c54ed0906c8b3ae0f0e4))

## [0.4.2](https://github.com/icqqjs/icqq/compare/v0.4.1...v0.4.2) (2023-06-21)


### Bug Fixes

* 未配置sign API改为只提示一次 ([45e6040](https://github.com/icqqjs/icqq/commit/45e604043a97ee49fac6a055a1f409801780a8b3))
* 未配置sign API改为只提示一次 ([45e6040](https://github.com/icqqjs/icqq/commit/45e604043a97ee49fac6a055a1f409801780a8b3))

## [0.4.1](https://github.com/icqqjs/icqq/compare/v0.4.0...v0.4.1) (2023-06-21)


### Bug Fixes

* publish error ([ec80b45](https://github.com/icqqjs/icqq/commit/ec80b454bc0a236fd0348945b862ca0e66fd750b))

## [0.4.0](https://github.com/icqqjs/icqq/compare/v0.3.15...v0.4.0) (2023-06-18)


### Features

* 实现消息签名组包（test）。 ([e75fa03](https://github.com/icqqjs/icqq/commit/e75fa0334ab01bb56c9824058831931f63e90f94))


### Bug Fixes

* Config增加签名接口地址配置，可自行实现签名API，供ICQQ调用 ([412c387](https://github.com/icqqjs/icqq/commit/412c3871ed84bd03d53d8f61127e4bbb29c431fd))
* prettier log ([984d59b](https://github.com/icqqjs/icqq/commit/984d59be7b62333f73a3446a4b2349c30170d660))
* 更新ts文件到src，便于区分编译文件和源文件 ([dbca2bb](https://github.com/icqqjs/icqq/commit/dbca2bbb8b98b8f2c68294fcf4024dcc1b8a5dd4))

## [0.3.15](https://github.com/icqqjs/icqq/compare/v0.3.14...v0.3.15) (2023-05-30)


### Bug Fixes

* t548 算法错误 ([790f5ff](https://github.com/icqqjs/icqq/commit/790f5ff07c56f1a2773ab9461ac2f456e61cc4df))

## [0.3.14](https://github.com/icqqjs/icqq/compare/v0.3.13...v0.3.14) (2023-05-20)


### Bug Fixes

* PoW 算法错误 ([5f47445](https://github.com/icqqjs/icqq/commit/5f4744596b78b88c12189f5b9ac89b2f294be299))
* 提交验证码时计算t547。 ([8b21c01](https://github.com/icqqjs/icqq/commit/8b21c01a7af3c86267fd29b8322531a6fd1e95ca))

## [0.3.13](https://github.com/icqqjs/icqq/compare/v0.3.12...v0.3.13) (2023-05-19)


### Bug Fixes

* 刷新token时备份上次token，登录时如找不到token将使用上次的token进行登录 ([8b2a872](https://github.com/icqqjs/icqq/commit/8b2a872a915b6c05b37a6441cf23e2d4879c61eb))

## [0.3.12](https://github.com/icqqjs/icqq/compare/v0.3.11...v0.3.12) (2023-05-17)


### Bug Fixes

* 。 ([4700e26](https://github.com/icqqjs/icqq/commit/4700e263d10e14b36097fe11b3db8b3ad3656597))

## [0.3.11](https://github.com/icqqjs/icqq/compare/v0.3.10...v0.3.11) (2023-05-17)


### Bug Fixes

* 。 ([0d78051](https://github.com/icqqjs/icqq/commit/0d78051bdbd326bfca3216fe84f43b3ad312656d))

## [0.3.10](https://github.com/icqqjs/icqq/compare/v0.3.9...v0.3.10) (2023-05-11)


### Bug Fixes

* 修复token刷新失败问题，刷新间隔修改为12小时。 ([bdbfb44](https://github.com/icqqjs/icqq/commit/bdbfb44e2bb39976ecc28a6d0990dd8b4381ccc6))

## [0.3.9](https://github.com/icqqjs/icqq/compare/v0.3.8...v0.3.9) (2023-05-11)


### Bug Fixes

* 刷新token错误 ([15bd8b4](https://github.com/icqqjs/icqq/commit/15bd8b4c0074d047e0793f08c6a0f07befa92ddd))
* 更改watch自动扫码登陆提示 ([68b4743](https://github.com/icqqjs/icqq/commit/68b474374c1e855db369e00097d6e13c63252285))

## [0.3.8](https://github.com/icqqjs/icqq/compare/v0.3.7...v0.3.8) (2023-05-11)


### Bug Fixes

* 修复扫码登录提示密码错误问题。 ([fc7c80e](https://github.com/icqqjs/icqq/commit/fc7c80ea066b0170515aed1337b13759959bc246))

## [0.3.7](https://github.com/icqqjs/icqq/compare/v0.3.6...v0.3.7) (2023-05-11)


### Bug Fixes

* 修复watch 扫码登陆 ([02a5749](https://github.com/icqqjs/icqq/commit/02a5749477fdd62e39f8275b1fd23ac82695d8c5))

## [0.3.6](https://github.com/icqqjs/icqq/compare/v0.3.5...v0.3.6) (2023-05-10)


### Bug Fixes

* 。 ([64682e8](https://github.com/icqqjs/icqq/commit/64682e839c6908cb0c361bd557b9d61e5fdb5706))

## [0.3.5](https://github.com/icqqjs/icqq/compare/v0.3.4...v0.3.5) (2023-05-10)


### Bug Fixes

* 修复无法发送短信验证码问题。 ([8d397bd](https://github.com/icqqjs/icqq/commit/8d397bd7965e6b9b6c7c5814c03114898d5b515e))

## [0.3.4](https://github.com/icqqjs/icqq/compare/v0.3.3...v0.3.4) (2023-05-10)


### Bug Fixes

* 修复node16以上版本无法正常使用问题。 ([c570689](https://github.com/icqqjs/icqq/commit/c570689835627c5e2c64fb50ebfaf355aa3147fa))

## [0.3.3](https://github.com/icqqjs/icqq/compare/v0.3.2...v0.3.3) (2023-05-10)


### Bug Fixes

* login error 16 ([f4d9c4f](https://github.com/icqqjs/icqq/commit/f4d9c4fc82462ca2238b36fb7dcf1f0c7e18b687))

## [0.3.2](https://github.com/icqqjs/icqq/compare/v0.3.1...v0.3.2) (2023-05-05)


### Bug Fixes

* 544改为本地计算 ([df2a208](https://github.com/icqqjs/icqq/commit/df2a20845f4119dc437afc5133e0ea75b95dd522))
* token登录提示 ([d2002f8](https://github.com/icqqjs/icqq/commit/d2002f88e21d955383549eeba9a07bcf283df82c))
* 升级triptrap ([eb007a2](https://github.com/icqqjs/icqq/commit/eb007a292acb1dc7347b1706ceee4f2a90a2ce77))
* 移除lodash依赖 ([b437b51](https://github.com/icqqjs/icqq/commit/b437b5115295f626e2d2f3cf5f3f7e9c31594ca1))

## [0.3.1](https://github.com/icqqjs/icqq/compare/v0.3.0...v0.3.1) (2023-04-24)


### Bug Fixes

* . ([d99c3b0](https://github.com/icqqjs/icqq/commit/d99c3b05a93da16e4b13b229f0646b48766ea21c))

## [0.3.0](https://github.com/icqqjs/icqq/compare/v0.2.3...v0.3.0) (2023-04-24)


### Features

* 新增安卓QQ8.8.88版本协议，Platform = 6，无法登录的可尝试。 ([e3baaa6](https://github.com/icqqjs/icqq/commit/e3baaa621d0b2f458e6d113e5df7d3872f0ad467))

## [0.2.3](https://github.com/icqqjs/icqq/compare/v0.2.2...v0.2.3) (2023-04-22)


### Bug Fixes

* 更新 T544 API ([8ac1c45](https://github.com/icqqjs/icqq/commit/8ac1c457460678e50695a82c773dc3f3bcd2f6b0))

## [0.2.2](https://github.com/icqqjs/icqq/compare/v0.2.1...v0.2.2) (2023-04-20)


### Bug Fixes

* mac协议无法登录问题。 ([c06e734](https://github.com/icqqjs/icqq/commit/c06e734079881b5ac27425ec48cdd863f323ee69))

## [0.2.1](https://github.com/icqqjs/icqq/compare/v0.2.0...v0.2.1) (2023-04-16)


### Bug Fixes

* 修复版本过低。 ([79540d7](https://github.com/icqqjs/icqq/commit/79540d75b618fc4ae79ba8a235df4b1df17f56c3))

## [0.2.0](https://github.com/icqqjs/icqq/compare/v0.1.0...v0.2.0) (2023-04-05)


### Features

* guild ([c1611f0](https://github.com/icqqjs/icqq/commit/c1611f00f6a4489fff2035fa0139823d5a19be53))
* Support nested MultiMsg ([#373](https://github.com/icqqjs/icqq/issues/373)) ([8de6eb2](https://github.com/icqqjs/icqq/commit/8de6eb2e33b6cb07e301b90703b0aeeaa2f7c876))
* tlv548 ([498a611](https://github.com/icqqjs/icqq/commit/498a611d00c886875a5e78206b0e4700baf558f1))
* 增加新表情 ([#379](https://github.com/icqqjs/icqq/issues/379)) ([211bc18](https://github.com/icqqjs/icqq/commit/211bc186b834704b4ac68b6883d2aaa1e40b84df))


### Bug Fixes

* 125 (exchange_emp) ([4729b38](https://github.com/icqqjs/icqq/commit/4729b387d822a54bfb543410f0c5dcfd4faacc7f))
* 142 ([6f15cdc](https://github.com/icqqjs/icqq/commit/6f15cdc2604a14c746b564505bd8200946d0fe05))
* 179 ([27ef3dd](https://github.com/icqqjs/icqq/commit/27ef3ddaf3a4e92860ae7ac5e3383c365fcd42cf))
* 199 [#202](https://github.com/icqqjs/icqq/issues/202) ([abd25b0](https://github.com/icqqjs/icqq/commit/abd25b097c312ff8874ae961a47c3c1ea5e40402))
* 210 ([3b431f8](https://github.com/icqqjs/icqq/commit/3b431f8b8d84229249286b874cede248a9c2c884))
* 214 ([99e10e6](https://github.com/icqqjs/icqq/commit/99e10e6514e212b354c7ec5e383da5271e30c766))
* 226 ([d65657d](https://github.com/icqqjs/icqq/commit/d65657df9ea0a9e872d75ae7565a40919a45dc2b))
* 263 ([ec11274](https://github.com/icqqjs/icqq/commit/ec1127452ab73cccb2e08e19e845336d7e222692))
* 281 ([58a43ed](https://github.com/icqqjs/icqq/commit/58a43ed6bfa1fec324df296e436f8008e347fcfa))
* 282 ([621007a](https://github.com/icqqjs/icqq/commit/621007a7b87ca4916f2d191457bd3fc0851bd189))
* device降会35 ([667bac7](https://github.com/icqqjs/icqq/commit/667bac7c6a93d5dec8d576ff61b708beb2de32a2))
* generate IMEI ([6be4f9f](https://github.com/icqqjs/icqq/commit/6be4f9f7790d7386e9d94ea738f1497bec4c54e8))
* qimei ([498a611](https://github.com/icqqjs/icqq/commit/498a611d00c886875a5e78206b0e4700baf558f1))
* qimei sdkver ([4663e3a](https://github.com/icqqjs/icqq/commit/4663e3a314fdd81b1481f0ae151c8eeddd972c69))
* tgtgt错误，兼容原版oicq登录方式 ([0bab3e0](https://github.com/icqqjs/icqq/commit/0bab3e09d63cc85a6c27de0dfd87f1a3aa5feacf))
* type Error ([adf3ba6](https://github.com/icqqjs/icqq/commit/adf3ba6f3e9737e0cc4fddd00bdeb8335a42081a))
* update SSO config server URL ([#352](https://github.com/icqqjs/icqq/issues/352)) ([c1d6d99](https://github.com/icqqjs/icqq/commit/c1d6d9989018b58a532ca5cee20e9aa4cc00e64c))
* 修复特殊文件(文件名带%)的链接无法正常下载 ([d82e127](https://github.com/icqqjs/icqq/commit/d82e1274026c956966ee7c5af86c84c8230119a6))
* 合并转发消息使用群聊模式会导致部分框架无法解析来源 ([#361](https://github.com/icqqjs/icqq/issues/361)) ([1c4b261](https://github.com/icqqjs/icqq/commit/1c4b261471bee8aecce83f00b3571220ca39d207))
* 沙箱环境以外的访问到client ([8662855](https://github.com/icqqjs/icqq/commit/8662855e52b7f28ec7c8089bdd53620009da47fd))
* 私聊回复消息产生一个多余的@ ([#320](https://github.com/icqqjs/icqq/issues/320)) ([64532c7](https://github.com/icqqjs/icqq/commit/64532c77137f7bfdb0bb0e2aa4bbef27160885c1))

## [0.1.0](https://github.com/icqqjs/icqq/compare/0.0.1...v0.1.0) (2023-04-03)


### Features

* tlv548 ([498a611](https://github.com/icqqjs/icqq/commit/498a611d00c886875a5e78206b0e4700baf558f1))


### Bug Fixes

* generate IMEI ([6be4f9f](https://github.com/icqqjs/icqq/commit/6be4f9f7790d7386e9d94ea738f1497bec4c54e8))
* qimei ([498a611](https://github.com/icqqjs/icqq/commit/498a611d00c886875a5e78206b0e4700baf558f1))
* qimei sdkver ([4663e3a](https://github.com/icqqjs/icqq/commit/4663e3a314fdd81b1481f0ae151c8eeddd972c69))
* type Error ([adf3ba6](https://github.com/icqqjs/icqq/commit/adf3ba6f3e9737e0cc4fddd00bdeb8335a42081a))
* 修复特殊文件(文件名带%)的链接无法正常下载 ([d82e127](https://github.com/icqqjs/icqq/commit/d82e1274026c956966ee7c5af86c84c8230119a6))
