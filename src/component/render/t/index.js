import { toReactElement } from "./toReactElement.js";
import { TakumiRenderer } from "./toImage.js";
import ReactDOMServer from "react-dom/server";
class ToImageService {
  toReactElement = toReactElement;

  async htmlToImage(htmlCode, options) {
    const reactElement = toReactElement.htmlToReactElement(htmlCode);
    return await TakumiRenderer.render(reactElement, options);
  }

  async jsxToImage(jsxCode, data, options) {
    const reactElement = await toReactElement.jsxToReactElement(jsxCode, data);
    const height = await this.calculateElementHeight(reactElement);
    console.log(height);

    //fs.writeFileSync("test.html", ReactDOMServer.renderToString(reactElement));
    return await TakumiRenderer.render(reactElement, {
      ...options,
      height: height,
    });
  }
}

export default ToImageService;
