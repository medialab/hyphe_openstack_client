"use strict";

export function jsonToQueryString(json) {
  if (json && Object.keys(json).length > 0) {
    const encoded = Object.keys(json)
      .map(key => {
        return encodeURIComponent(key) + "=" + encodeURIComponent(json[key]);
      })
      .join("&");
    return "?" + encoded;
  } else {
    return "";
  }
}
