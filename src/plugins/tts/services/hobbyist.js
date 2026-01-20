import fetch from "node-fetch";
// GPT-SoVITS开发者：@花儿不哭
// 模型训练者：@红血球AE3803 & @白菜工厂1145号员工
// 推理特化包适配 & 在线推理：@AI-Hobbyist
export default class Hobbyist {
  async getVersion() {
    let rep = await fetch("https://gsv2p.acgnai.top/version");
    let { support_versions } = await rep.json();
    return support_versions;
  }

  async getCategories() {
    let rep = await fetch("https://rs.acgnai.top/api/model_libry/categories", {
      method: "POST",
      body: JSON.stringify({
        link: "line1",
      }),
      headers: {
        "Content-Type": "application/json",
      },
    });
    return await rep.json();
  }

  async getModelList(version = "v4") {
    let rep = await fetch("https://gsv2p.acgnai.top/models/" + version);
    let { models } = await rep.json();
    return models;
  }

  //使用匹配角色名进行语音合成
  async getModelDetail(model_name, text) {
    let models = await this.getModelList();
    if (model_name == "爱丽丝") model_name = "爱丽丝（女仆）";
    let model = Object.keys(models).find(
      (item) =>
        item.endsWith(`中文-${model_name}`) ||
        item.endsWith(`中文-${model_name}_ZH`)
    );
    if (!model) return;
    return await this.getModelAudio(model, text);
  }

  //使用精确角色模型名进行语音合成
  async getModelAudio(model_name, text) {
    let rep = await fetch("https://gsv2p.acgnai.top/infer_single", {
      method: "POST",
      body: JSON.stringify({
        batch_size: 10,
        batch_threshold: 0.75,
        emotion: "默认",
        fragment_interval: 0.3,
        if_sr: false,
        media_type: "wav",
        model_name,
        parallel_infer: true,
        prompt_text_lang: "中文",
        repetition_penalty: 1.35,
        sample_steps: 16,
        seed: -1,
        speed_facter: 1,
        split_bucket: true,
        temperature: 1,
        text: text,
        text_lang: "中文",
        text_split_method: "按中文句号。切",
        top_k: 10,
        top_p: 1,
        version: "v4",
      }),
      headers: {
        "Content-Type": "application/json",
        referer: "https://tts.acgnai.top/",
        origin: "https://tts.acgnai.top",
        authorization: "Bearer guest",
      },
    });

    let res = await rep.json();
    console.log(res);

    return res;
  }
}
// console.log(
//   await new Hobbyist().getModelDetail(
//     "可莉",
//     "爱丽丝错了。爱丽丝不该在网上口嗨的。"
//   )
// );
