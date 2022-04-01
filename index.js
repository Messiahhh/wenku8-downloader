#!/usr/bin/env node
const Novel = require("./lib/downloader.js");

const { program } = require("commander");
program
  .version("1.0.0")
  .description("wenku8 novel downloader")
  .option("-u, --url <type>", "website url of the novel you want to download");
program.parse(process.argv);

if (program.url) {
  Novel.download(program.url);
} else {
  console.log("请使用-u标志输入URL");
}
