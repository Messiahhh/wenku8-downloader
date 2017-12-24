const Promise = require('bluebird')
const axios = require('axios')
const cheerio = require('cheerio')
const iconv = require('iconv-lite')
const fs = Promise.promisifyAll(require('fs'))
const Url = require('url')
const qs = require('querystring')
//your cookie
let cookie = 'put your cookie here'

class Novel {
    constructor(obj) {
        Object.assign(this, obj)
    }

    static async getWithCookie(url) {
        let res = await axios.get(url, {
            headers: {
                cookie
            },
            responseType: 'arraybuffer'
        })
        let $ = cheerio.load(iconv.decode(res.data, 'gbk'))
        return $
    }

    static async get(url) {
        let res = await axios.get(url, {
            responseType: 'arraybuffer'
        })
        let $ = cheerio.load(iconv.decode(res.data, 'gbk'))
        return $
    }

    static async mkdirSingleNovel (id) {
        try {
            await fs.statAsync(`./novels/${id}`)
        } catch (e) {
            await fs.mkdirAsync(`./novels/${id}`)
        }
    }

    static async download (url) {
        let $ = await this.get(url)
        let backUrl = url.substring(url.lastIndexOf('/') + 1, url.lastIndexOf('.'))
        let id
        if (backUrl === 'articleinfo') {
            id = `1-${qs.parse(Url.parse(url).query).id}`
        }
        else {
            id = `0-${backUrl}`
        }
        let novel = new Novel({
            id,
            name: $('b').eq(2).text(),
            desc: $('.hottext:nth-of-type(4)').nextAll('span').text(),
            indexUrl: url,
            catalogUrl: $('#content').children().first().children().eq(5).children().children().first().find('a').attr("href")
        })
        Novel.mkdirSingleNovel(novel.id)
        //fuck wenku8, some pages's structure is so strange.
        if (novel.catalogUrl !== undefined) {
            let catalogBaseUrl = novel.catalogUrl.substring(0, novel.catalogUrl.lastIndexOf('/'))
            $ = await this.get(novel.catalogUrl)
            // interesting point:
            // $('table td a').map() return a cheerio Object rather than, which can't be used in Promise.all. So we need to add a get() after .map()
            await Promise.all($('table td a').map(async (index, item) => {
                let url = `${catalogBaseUrl}/${$(item).attr('href')}`
                let $$ = await this.get(url)
                await fs.writeFileAsync(`./novels/${novel.id}/${index+1}.md`, $$('#content').text())
                // if ($('table td a').length === index + 1) {
                    console.log(`${novel.name}[id=${novel.id}]${index+1}章节已下载完成`)
                // }
            }).get())
        }
    }
}
module.exports = Novel
