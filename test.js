const axios = require('axios')
const cheerio = require('cheerio')
const iconv = require('iconv-lite')
const fs = require('fs')
const url = require('url')

let index = 'http://www.wenku8.com/index.php'
let indexHost = 'www.wenku8.com'

axios.get(index, {
    headers: {
        cookie: 'jieqiUserInfo=jieqiUserId%3D312317%2CjieqiUserName%3D2497360927%2CjieqiUserGroup%3D3%2CjieqiUserVip%3D0%2CjieqiUserName_un%3D2497360927%2CjieqiUserHonor_un%3D%26%23x65B0%3B%26%23x624B%3B%26%23x4E0A%3B%26%23x8DEF%3B%2CjieqiUserGroupName_un%3D%26%23x666E%3B%26%23x901A%3B%26%23x4F1A%3B%26%23x5458%3B%2CjieqiUserLogin%3D1506504225; jieqiVisitInfo=jieqiUserLogin%3D1506504225%2CjieqiUserId%3D312317; Hm_lvt_acfbfe93830e0272a88e1cc73d4d6d0f=1506503189; Hm_lpvt_acfbfe93830e0272a88e1cc73d4d6d0f=1506504664; PHPSESSID=fplbbhg8ls6cn280v40psqksi762sjad; Hm_lvt_d72896ddbf8d27c750e3b365ea2fc902=1506503189; Hm_lpvt_d72896ddbf8d27c750e3b365ea2fc902=1506520070'
    },
    responseType: 'arraybuffer'
})
.then((res) => {
    let $ = cheerio.load(iconv.decode(res.data, 'gbk'))
    let pageArr = []
    $('#left .ultop a').each((index, item) => {
        let pageUrl = $(item).attr('href')
        pageArr.push(pageUrl)
    })

    return new Promise((resolve, reject) => {
        let novelArr = new Set()
        let promiseArr = []
        pageArr.forEach((item, index) => {
            let promise = axios.get(item, {
                responseType: 'arraybuffer'
            })
            .then((res) => {
                let $ = cheerio.load(iconv.decode(res.data, 'gbk'))
                $('#centerm a').each((index, item) => {
                    let pageUrl = $(item).attr('href')
                    novelArr.add(pageUrl)
                })
            })
            .catch((err) => {
                console.log(err)
            })
            promiseArr.push(promise)
        })
        Promise.all(promiseArr).then((data) => {
            resolve(novelArr)
        }).catch((err) => {
            console.log(err)
        })
    })
})
.then((data) => {
    return new Promise((resolve, reject) => {
        // console.log('1')
        let promiseArr = []
        let urls = new Set()
        for (let i of data) {
            
            
            if (url.parse(i).hostname === indexHost) {
                let promise = axios.get(i, {
                    responseType: 'arraybuffer'
                }).then((res) => {
                    let $ = cheerio.load(iconv.decode(res.data, 'gbk'))
                    let href = $('#content').children().first().children().eq(5).children().children().first().find('a').attr("href")
                    if (href !== undefined) {
                        urls.add(href)
                        // download(href)
                    }
                })
                .catch((err) => {
                    console.log(err)
                })
                promiseArr.push(promise)
            }
            console.log('1')
        }
        //此时promiseArr都是pending状态
        // console.log(promiseArr)
        Promise.all(promiseArr).then((data) => {
            //没有执行
            resolve(urls)
        }).catch((err) => {
            console.log(err)
        })
    })
    // console.log(data)
})
.then((data) => {
    console.log(data)
    data = [...data]
    fs.writeFile('wenku.json', JSON.stringify(data, null, 4), (err) => {
        if (err) {
            console.log(err)
        }
    })
})
.catch((err) => {
    console.log(err)
})

