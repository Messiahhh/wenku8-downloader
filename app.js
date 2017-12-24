const Promise = require('bluebird')
const axios = require('axios')
const cheerio = require('cheerio')
const iconv = require('iconv-lite')
const fs = Promise.promisifyAll(require('fs'))
const Url = require('url')
const qs = require('querystring')
//your cookie
let cookie = 'Hm_lvt_acfbfe93830e0272a88e1cc73d4d6d0f=1513864851,1513867609,1513955689; Hm_lvt_d72896ddbf8d27c750e3b365ea2fc902=1513864849,1513867150,1513955666,1514047381; PHPSESSID=7ahmld2a0tj5m28v1bl9qgh9r9488hae; jieqiUserInfo=jieqiUserId%3D312317%2CjieqiUserName%3D2497360927%2CjieqiUserGroup%3D3%2CjieqiUserVip%3D0%2CjieqiUserName_un%3D2497360927%2CjieqiUserHonor_un%3D%26%23x65B0%3B%26%23x624B%3B%26%23x4E0A%3B%26%23x8DEF%3B%2CjieqiUserGroupName_un%3D%26%23x666E%3B%26%23x901A%3B%26%23x4F1A%3B%26%23x5458%3B%2CjieqiUserLogin%3D1514047377; jieqiVisitInfo=jieqiUserLogin%3D1514047377%2CjieqiUserId%3D312317; Hm_lpvt_d72896ddbf8d27c750e3b365ea2fc902=1514047392'

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
