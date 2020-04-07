"use strict";

/**
 * Convert an object to an url query string.
 *
 * @param {object} json The object to convert
 * @returns {string} the correspondig query string, or an empty string
 */
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

/**
 * Test if the given param is an object.
 *
 * @param item {any} The variable to test
 * @returns {boolean}
 */
export function isObject(item) {
  return (
    item && typeof item === "object" && !Array.isArray(item) && item !== null
  );
}
/**
 * Make a deep merge of the source object into the target one.
 *
 * @param {object} target
 * @param {object} source
 * @returns {object} The merge object
 */
export function deepMerge(target, source) {
  const output = Object.assign({}, target);

  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in output)) Object.assign(output, { [key]: source[key] });
        else output[key] = deepMerge(target[key], source[key]);
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  return output;
}
