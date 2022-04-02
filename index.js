#!/usr/bin/env node
const Novel = require("./lib/downloader.js");

const { program } = require("commander");

function commaSeparatedList(value) {
    return value.split(',');
}

program
    .version("1.0.0")
    .description("wenku8 novel downloader")
    .option("-u, --url <type>", "website url of the novel you want to download")
    .option("-i, --id <int>", "website id of the novel you want to download", commaSeparatedList);
program.parse(process.argv);

if (program.url) {
    Novel.download(program.url);
} else if (program.id) {
    let s = new Set(program.id)
    s.forEach(element => {
        Novel.download(`https://www.wenku8.net/book/${element}.htm`)
    });
} else {
    console.log("请使用-u标志输入URL");
}
