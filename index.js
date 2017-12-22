const Promise = require('bluebird')
const axios = require('axios')
const cheerio = require('cheerio')
const iconv = require('iconv-lite')
const fs = Promise.promisifyAll(require('fs'))
const Url = require('url')
const Novel = require('./app.js')
// Novel.download('http://www.wenku8.com/book/2111.htm')
//
let host = 'www.wenku8.com'
const getNovelsUrl = async (url) => {
    let $ = await Novel.getWithCookie(url)
    let set = new Set()
    await Promise.all($('#left .ultop a').map(async (index, item) => {
        let url = $(item).attr('href')
        let $$ = await Novel.get(url)

        $$('#content a').each((index, item) => {
            let url = $(item).attr('href')
            if (Url.parse(url).hostname === host) {
                set.add(url)
            }
        })

    }).get())
    set = Array.from(set)
    await Promise.all(set.map(async (item, index) => {
        await Novel.download(item)
    }))
}
getNovelsUrl('http://www.wenku8.com/index.php')
