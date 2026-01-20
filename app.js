import fetch from "node-fetch";
var myHeaders = new Headers();
myHeaders.append("Content-Type", "application/json");

var raw = JSON.stringify({
  group_id: 428596438,
  message: [
    {
      type: "image",
      data: {
        uri: "https://pximg.hakurei.cc/c/360x360_70/img-master/img/2023/10/23/21/56/45/112716224_p0_square1200.jpg",
        summary: null,
        sub_type: "normal",
      },
    },
  ],
});

var requestOptions = {
  method: "POST",
  headers: myHeaders,
  body: raw,
  redirect: "follow",
};

fetch("http://127.0.0.1:3010/api/send_group_message", requestOptions)
  .then((response) => response.text())
  .then((result) => console.log(result))
  .catch((error) => console.log("error", error));
