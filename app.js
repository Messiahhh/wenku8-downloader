const Promise = require('bluebird')
const axios = require('axios')
const cheerio = require('cheerio')
const iconv = require('iconv-lite')
const fs = Promise.promisifyAll(require('fs'))
const Url = require('url')
const qs = require('querystring')

// 在这里放你的cookie
// let cookie = ""

let cookie = "Hm_lvt_d72896ddbf8d27c750e3b365ea2fc902=1584112013; jieqiUserInfo=jieqiUserId%3D312317%2CjieqiUserName%3D2497360927%2CjieqiUserGroup%3D3%2CjieqiUserVip%3D0%2CjieqiUserPassword%3D05a671c66aefea124cc08b76ea6d30bb%2CjieqiUserName_un%3D2497360927%2CjieqiUserHonor_un%3D%26%23x65B0%3B%26%23x624B%3B%26%23x4E0A%3B%26%23x8DEF%3B%2CjieqiUserGroupName_un%3D%26%23x666E%3B%26%23x901A%3B%26%23x4F1A%3B%26%23x5458%3B%2CjieqiUserLogin%3D1584118336; jieqiVisitInfo=jieqiUserLogin%3D1584118336%2CjieqiUserId%3D312317; UM_distinctid=170d4cf9e076af-0273d4a6b1d193-366b400c-1fa400-170d4cf9e08874; CNZZDATA1309966=cnzz_eid%3D892072408-1584116280-%26ntime%3D1584116280; CNZZDATA1259916661=493186138-1584117463-%7C1584117463; Hm_lpvt_d72896ddbf8d27c750e3b365ea2fc902=1584118341"

class Scheduler {
	constructor(count) {
		this.count = count
		this.queue = []
		this.run = []
	}

	add(task) {
		this.queue.push(task)
		return this.schedule()
	}

	schedule() {
		if (this.run.length < this.count && this.queue.length) {
		  	const task = this.queue.shift()
		  	const promise = task().then(() => {
		  		this.run.splice(this.run.indexOf(promise), 1)
		  	})
		  	this.run.push(promise)
		  	return promise
		} else {
		  	return Promise.race(this.run).then(() => this.schedule())
		}
	}
}

let scheduler = new Scheduler(50)

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

    static async mkdirSingleNovel (id, name) {
        try {
            await fs.statAsync(`./novels/${id}-${name}`)
        } catch (e) {
            await fs.mkdirAsync(`./novels/${id}-${name}`)
        }
    }

    static async download (url) {

        let $ = await this.get(url) // 获取某小说的主页

        let id // 小说的完整编号
        let backUrl = url.substring(url.lastIndexOf('/') + 1, url.lastIndexOf('.')) // 小说的编号
        id = backUrl === 'articleinfo' ? `1-${qs.parse(Url.parse(url).query).id}` : `2-${backUrl}`

        const novel = new Novel({
            id,
            name: $('b').eq(2).text(),
            desc: $('.hottext:nth-of-type(4)').nextAll('span').text(),
            indexUrl: url,
            catalogUrl: $('#content').children().first().children().eq(5).children().children().first().find('a').attr("href")
        })
        Novel.mkdirSingleNovel(novel.id, novel.name) // 创建本地目录

        if (novel.catalogUrl !== undefined) { 
            let catalogBaseUrl = novel.catalogUrl.substring(0, novel.catalogUrl.lastIndexOf('/'))
            $ = await this.get(novel.catalogUrl) // 获取某小说的章节目录页

            for (let [index, item] of Object.entries($('table td a'))) {
                index = parseInt(index)
                let href = $(item).attr('href')
                if (href) {
                    // 异步任务的调度
                    let url = `${catalogBaseUrl}/${href}` // 该小说的某章节的路径
                    let title = $(item).text()
                    scheduler.add(async () => {
                        let $$ = await this.get(url)
                        return fs.writeFileAsync(`./novels/${novel.id}-${novel.name}/${index+1}.md`, `${title}\n` + $$('#content').text().replace('本文来自 轻小说文库(http://www.wenku8.com)', '').replace('台版 转自 轻之国度', '').replace('最新最全的日本动漫轻小说 轻小说文库(http://www.wenku8.com) 为你一网打尽！', ''))
                    }).then(() => {
                        console.log(`${novel.name}[id=${novel.id}]第${index+1}章节已下载完成`)
                    })
                }
                
            }
            
        }
    }
}
// Novel.download('http://www.wenku8.com/book/1715.htm')
module.exports = Novel
