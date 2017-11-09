const Promise = require('bluebird')
const axios = require('axios')
const cheerio = require('cheerio')
const iconv = require('iconv-lite')
const fs = Promise.promisifyAll(require('fs'))
let q = 0
class Novel {
    constructor(obj) {
        Object.assign(this, obj)
        this.links = []
    }
    
    async mkdir() {
        if (fs.exists(`./novels/${this.id}`)) {
            return
        }
        else {
            await fs.mkdirAsync(`./novels/${this.id}`, '0777')
        }
    }

    async download() {
        this.links.forEach(async ({
            id,
            title,
            url,
        }, index) => {
            let res = await axios.get(url, {
                responseType: 'arraybuffer'
            }).catch(e => console.log(e))
            
            console.log(q++)
            let $ = cheerio.load(iconv.decode(res.data, 'gbk'))
            let content = $('#content').text()
            fs.writeFileAsync(`./novels/${this.id}/${id}.txt`, `${title}${content}`)
            
        })
    }

    static async Init() {
        if (fs.exists('novels')) {
            return
        }
        else {
            await fs.mkdir('novels', '0777')
        }
    }
}

async function download (url) {
    //预处理
    let baseUrl = url.substring(0, url.lastIndexOf('/'))
    let book_id = Math.floor(Math.random() * 200000)
    let page_id = 1
    let res = await axios.get(url, {
        responseType: 'arraybuffer'
    }).catch(e => console.log(e))
    console.log(q++)
    let $ = cheerio.load(iconv.decode(res.data, 'gbk'))
    let novel = new Novel({
        id: book_id,
        url,
        name: $('#title').text(),
        author: $('#info').text().slice(3)
    })
    $('.ccss a').each((index, item) => {
        let url = $(item).attr('href')
        let title = $(item).text()
        novel.links.push({
            id: page_id++,
            title,            
            url: `${baseUrl}/${url}`
        })
    })
    novel.mkdir()
    novel.download().then(() => {
        // console.log(`${novel.name}已经下载完成`)
    }).catch(e => {
        console.log(e)
    })
}



fs.readFile('./wenku.json', 'utf-8', (err, data) => {
    if (err) {
        console.log(err)
    }
    data = JSON.parse(data)
    let i = 0
    function loop() {
        if (i < data.length) {
            Promise.all([download(data[i])]).then((data) => {
                i++
                setTimeout(loop, 1600)
            }).catch((err) => {
                console.log(err)
            })
        }
        else {
            console.log(`
                -----
                -----
                ===下载任务已经完成===
                -----
                -----
            `)
            return 
        }
    }
    loop()
})


