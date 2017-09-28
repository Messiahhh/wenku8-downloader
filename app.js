const axios = require('axios')
const cheerio = require('cheerio')
const iconv = require('iconv-lite')
const fs = require('fs')
const http = require('http')

function download (url) {
    return axios.get(url, {
        responseType: 'arraybuffer'
    })
    .then((res) => {
        //小说的章节详情
        
        let links = []
        let catalogue = ''
        let count = 1
        let baseUrl = url.substring(0, url.lastIndexOf('/'))
        let promiseArr = []

        let $ = cheerio.load(iconv.decode(res.data, 'gbk'))
        //小说名
        let novelName = $('#title').text()
        let novelPath = `../novels/${novelName}.md`
        let id = 1
        $('.ccss a').each((index, item) => {
            //单章链接，标题
            let url = $(item).attr('href')
            let title = $(item).text()
            
            links.push({
                id: id++,
                url: `${baseUrl}/${url}`,
                title,
            })
            catalogue += `* [${title}](#${title})\n`
        })
        fs.mkdir(`./novels/${novelName}`, 0777, (err) => {
            if (err) console.log(err)
        })
        links.forEach(({id, url, title}, index) => {
            let promise = axios.get(url, {
                responseType: 'arraybuffer'
            })
            .then((res) => {
                let $ = cheerio.load(iconv.decode(res.data, 'gbk'))
                let content = $('#content').text()
                
                fs.writeFile(`./novels/${novelName}/第${id}章.txt`, `${title}${content}`, (err) => {
                    if (err) console.log(err)
                    console.log(`${novelName}第${id}章下载完成`)
                })
            })
            .catch((err) => {
                console.log(err)
            })
            promiseArr.push(promise)
        })
        return Promise.all(promiseArr).then((data) => {
            console.log(`${novelName}已下载完成`)
        }).catch((err) => {
            console.log(err)
        })
    })
    .catch((err) => {
        console.log(err)
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
                loop()
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


