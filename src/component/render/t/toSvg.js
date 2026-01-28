import satori from "satori";

export class SatoriRenderer {
  async render(reactElement, options) {
    options ||= {};
    const fonts = this.fontManagement.getFonts({
      formats: this.FontFormats,
      needVariable: this.FontVariable,
    });
    if (fonts.length > 0) {
      options.fonts ||= [];
      for (let font of fonts) {
        options.fonts.push({
          data: font.data,
          name: font.family,
          weight: font.weight,
          style: font.italic ? "italic" : "normal",
        });
      }
    }
    return await satori(reactElement, options);
  }
}
