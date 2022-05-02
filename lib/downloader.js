const Promise = require("bluebird");
const axios = require("axios");
const cheerio = require("cheerio");
const iconv = require("iconv-lite");
const fs = Promise.promisifyAll(require("fs"));
const Url = require("url");
const qs = require("querystring");
const path = require("path");

// 调度器，控制发请求的频率
class Scheduler {
    constructor(count) {
        this.count = count;
        this.queue = [];
        this.run = [];
    }

    add(task) {
        this.queue.push(task);
        return this.schedule();
    }

    schedule() {
        if (this.run.length < this.count && this.queue.length) {
            const task = this.queue.shift();
            const promise = task().then(() => {
                setTimeout(() => {
                    this.run.splice(this.run.indexOf(promise), 1);
                }, 1000);
            });
            this.run.push(promise);
            return promise;
        } else {
            return Promise.race(this.run).then(() => this.schedule());
        }
    }
}

let scheduler = new Scheduler(5);

class Novel {
    constructor(obj) {
        Object.assign(this, obj);
    }

    static async get(url) {
        let res = await axios.get(url, {
            responseType: "arraybuffer",
        });
        let $ = cheerio.load(iconv.decode(res.data, "gbk"));
        return $;
    }

    static async getChapter(url, retryLimit = 5) {
        try {
            let $$ = await this.get(url);
            if ($$('#contentmain span').first().text().trim() == 'null') {
                let v = url.substring(0, url.lastIndexOf(".")).split("/")
                let content = ""
                try {
                    let resp = await axios.get(`http://dl.wenku8.com/pack.php?aid=${v.slice(-2)[0]}&vid=${v.slice(-1)[0]}`, {
                        responseType: "arraybuffer",
                    })
                    let html = cheerio.load(iconv.decode(resp.data, "utf-8"))
                    content = html.text().replace("&nbsp;", "").replace("更多精彩热门日本轻小说、动漫小说，轻小说文库(http://www.wenku8.com) 为你一网打尽！", "")
                } catch (e) {
                    if (e.message.indexOf("404") != -1) {
                        let resp = await axios.get(`http://dl.wenku8.com/packtxt.php?aid=${v.slice(-2)[0]}&vid=${v.slice(-1)[0]}`, {
                            responseType: "arraybuffer",
                        })
                        content = iconv.decode(resp.data, "utf-8")
                    } else {
                        throw e
                    }
                }
                let picReg = /http:\/\/pic\.wenku8\.com\/pictures\/[\/0-9]+.jpg/g
                let picRegL = /http:\/\/pic\.wenku8\.com\/pictures\/[\/0-9]+.jpg\([0-9]+K\)/g
                let images = content.match(picReg) ?? []
                content = content.replace(picRegL, "")
                return { content, images }
            } else {
                let content = $$("#content")
                    .text()
                    .replace("本文来自 轻小说文库(http://www.wenku8.com)", "")
                    .replace("台版 转自 轻之国度", "")
                    .replace(
                        "最新最全的日本动漫轻小说 轻小说文库(http://www.wenku8.com) 为你一网打尽！",
                        ""
                    );
                let images = $$("img").map(function (i, imgEle) {
                    let imgsrc = imgEle.attribs.src
                    return imgsrc
                }).get();
                return { content, images };
            }
        } catch (error) {
            console.error(`failed to download ${url} because ${error.message} , retryLimit:${retryLimit}`);
            if (retryLimit > 0) {
                return await this.getChapter(url, retryLimit - 1);
            } else {
                return { content: "", images: [] }
            }
        }
    }

    static async mkdirSingleNovel(id, name) {
        try {
            await fs.stateAsync(path.join(process.cwd(), `./novels/${id}-${name}`));
            // await fs.statAsync(`./novels/${id}-${name}`)
        } catch (e) {
            await fs.mkdirAsync(path.join(process.cwd(), `./novels/${id}-${name}`), { recursive: true });
            // await fs.mkdirAsync(`./novels/${id}-${name}`)
        }
    }
    /**
     *
     *
     * @static
     * @param {*} url
     * @memberof Novel
     */
    static async download(url) {
        if (!fs.existsSync(path.join(process.cwd(), "novels"))) {
            fs.mkdirSync(path.join(process.cwd(), "novels"));
        }

        let $ = await this.get(url); // 获取某小说的主页

        let id; // 小说的完整编号
        let backUrl = url.substring(url.lastIndexOf("/") + 1, url.lastIndexOf(".")); // 小说的编号
        id =
            backUrl === "articleinfo"
                ? `1-${qs.parse(Url.parse(url).query).id}`
                : `2-${backUrl}`;

        const novel = new Novel({
            id,
            name: $("b").eq(2).text(),
            desc: $(".hottext:nth-of-type(4)").nextAll("span").text(),
            indexUrl: url,
            catalogUrl: $("#content")
                .children()
                .first()
                .children()
                .eq(5)
                .children()
                .children()
                .first()
                .find("a")
                .attr("href"),
        });
        Novel.mkdirSingleNovel(novel.id, novel.name); // 创建本地目录

        if (novel.catalogUrl !== undefined) {
            let catalogBaseUrl = novel.catalogUrl.substring(
                0,
                novel.catalogUrl.lastIndexOf("/")
            );
            $ = await this.get(novel.catalogUrl); // 获取某小说的章节目录页

            for (let [index, item] of Object.entries($("table td a"))) {
                index = parseInt(index);
                let href = $(item).attr("href");
                if (href) {
                    // 异步任务的调度
                    let url = `${catalogBaseUrl}/${href}`; // 该小说的某章节的路径
                    let title = $(item).text();
                    scheduler
                        .add(async () => {
                            // let $$ = await this.get(url);
                            let { content, images } = (await this.getChapter(url));
                            if (images) {
                                images = images.map(image => {
                                    let imgname = image.split("/").slice(-1)[0];
                                    scheduler.add(async () => {
                                        let resp = await axios.get(image, { responseType: "arraybuffer" });
                                        return fs.writeFileAsync(
                                            path.join(
                                                process.cwd(),
                                                `./novels/${novel.id}-${novel.name}/${imgname}`
                                            ),
                                            resp.data
                                        );
                                    }).then(() => {
                                        console.log(
                                            `${novel.name}[id=${novel.id}]第${index + 1}章节图片${imgname}已下载完成`
                                        );
                                    });
                                    return imgname
                                });
                                images = images.map((v) => `![](${v})`)
                                content += images.join('\n')
                            }
                            return fs.writeFileAsync(
                                path.join(
                                    process.cwd(),
                                    `./novels/${novel.id}-${novel.name}/${index + 1}.md`
                                ),
                                `# ${title}\n` + content
                            );
                            // return fs.writeFileAsync(`./novels/${novel.id}-${novel.name}/${index+1}.md`, `${title}\n` + $$('#content').text().replace('本文来自 轻小说文库(http://www.wenku8.com)', '').replace('台版 转自 轻之国度', '').replace('最新最全的日本动漫轻小说 轻小说文库(http://www.wenku8.com) 为你一网打尽！', ''))
                        })
                        .then(() => {
                            console.log(
                                `${novel.name}[id=${novel.id}]第${index + 1}章节已下载完成`
                            );
                        });
                }
            }
        }
    }
}

// 你可以把下面的地址换成你想要下载的小说的目录页
module.exports = Novel;
