/* global __dirname, require, module*/
require("@babel/polyfill");
const webpack = require("webpack");
const path = require("path");
const env = require("yargs").argv.env; // use --env with webpack 2
const pkg = require("./package.json");

let libraryName = pkg.name;

let outputFile, mode;

if (env === "build") {
  mode = "production";
  outputFile = libraryName + ".min.js";
} else {
  mode = "development";
  outputFile = libraryName + ".js";
}

const web = {
  mode: mode,
  entry: ["@babel/polyfill", __dirname + "/src/index.js"],
  devtool: "inline-source-map",
  output: {
    path: __dirname + "/lib",
    filename: outputFile,
    library: libraryName,
    libraryTarget: "umd",
    umdNamedDefine: true,
    globalObject: "typeof self !== 'undefined' ? self : this",
  },
  module: {
    rules: [
      {
        test: /(\.jsx|\.js)$/,
        loader: "babel-loader",
        exclude: /(node_modules)/,
      },
      {
        test: /(\.jsx|\.js)$/,
        loader: "eslint-loader",
        exclude: /node_modules/,
      },
      {
        test: /\.sh$/,
        use: "raw-loader",
      },
    ],
  },
  resolve: {
    modules: [path.resolve("./node_modules"), path.resolve("./src")],
    extensions: [".json", ".js", ".sh"],
  },
};

const node = {
  mode: "development",
  entry: [__dirname + "/src/index.js"],
  output: {
    path: __dirname + "/lib",
    filename: "node-" + libraryName + ".js",
    libraryTarget: "umd",
    library: "default",
    umdNamedDefine: true,
    libraryExport: "OpenStackClient",
  },
  target: "node",
  module: {
    rules: [
      {
        test: /\.sh$/,
        use: "raw-loader",
      },
    ],
  },
};

module.exports = [web, node];
