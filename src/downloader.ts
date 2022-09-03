import axios from 'axios';
import cheerio from 'cheerio';
import iconv from 'iconv-lite';
import fs from 'fs';
import path from 'path';
import util from 'util';
import { retryFn, Scheduler } from './utils/Scheduler.js';
import ora from 'ora';
import chalk from 'chalk';
const spinner = ora();

// spinner.start();
interface INovel {
    novelId: number;
    novelName: string;
    /**
     * 文库分类
     */
    library: string;
    /**
     * 小说作者
     */
    author: string;
    /**
     * 是否完结
     */
    status: string;
    /**
     * 最后更新时间
     */
    lastUpdateTime: string;
    /**
     * 全文长度
     */
    length: string;
    /**
     * 小说标签
     */
    tag: string;
    /**
     * 最新章节
     */
    recentChapter: string;
    /**
     * 内容简介
     */
    desc: string;
    /**
     * 目录链接
     */
    catalogueUrl?: string;
}

const writeFile = util.promisify(fs.writeFile);
const appendFile = util.promisify(fs.appendFile);

const scheduler = new Scheduler(5);

const HOST = 'https://www.wenku8.net';
const BASE_URL = 'https://www.wenku8.net/book/';

/**
 * 获取小说详细信息
 * @param novelId
 * @returns
 */
export async function getNovelDetails(novelId: number): Promise<INovel> {
    const $ = await fetch(`${BASE_URL}${novelId}.htm`);

    const novelName = $('#content').children().first().children().first().find('table tbody tr td span b').text();
    const [library, author, status, lastUpdateTime, length] = $('#content')
        .children()
        .first()
        .children()
        .first()
        .children()
        .first()
        .children()
        .eq(1)
        .children()
        .map((i, item) => {
            return $(item)
                .text()
                .match(/：(.+)$/)![1];
        })
        .get();
    const centerEl = $('#content').children().first().children().eq(3).find('table tbody tr td').eq(1);
    const tag = centerEl
        .find('span')
        .first()
        .text()
        .match(/：(.+)$/)![1];
    const recentChapter = centerEl.find('span').eq(3).text();
    const desc = centerEl.find('span').last().text();
    const catalogueUrl = $('#content')
        .children()
        .first()
        .children()
        .eq(5)
        .children()
        .children()
        .first()
        .find('a')
        .attr('href');
    return {
        novelId,
        novelName,
        library,
        author,
        status,
        lastUpdateTime,
        length,
        tag,
        recentChapter,
        desc,
        catalogueUrl,
    };
}

/**
 * 根据小说ID，下载全部小说
 * @param url
 * @returns
 */
export async function downloadNovel(
    novelId: number,
    options: {
        ext: string;
        outDir: string;
        concurrency: string;
    }
) {
    try {
        const startTime = Date.now();
        let errorTimes = 0;
        spinner.start('正在请求小说详情页');

        const novel = await getNovelDetails(novelId);
        spinner.succeed('成功请求小说详情页');

        if (novel.catalogueUrl) {
            spinner.start('正在请求小说目录页');

            const { volumes, volumeMap, amount } = await getChapterList(novel.catalogueUrl);
            let count = 0;
            spinner.succeed(`成功请求小说目录页，该小说共有${volumes.length}卷`);
            for (const volume of volumes) {
                const volumeNameWithIndex = `${volume.index + 1}-${volume.name}`;
                if (!fs.existsSync(path.join(process.cwd(), options.outDir, novel.novelName, volumeNameWithIndex))) {
                    fs.mkdirSync(
                        path.join(process.cwd(), options.outDir, novel.novelName, volumeNameWithIndex, '插图'),
                        {
                            recursive: true,
                        }
                    );
                }
                const chapters = volumeMap.get(volume.name);
                if (chapters) {
                    for (const { chapterIndex, chapterTitle, chapterUrl } of chapters) {
                        scheduler.add(async () => {
                            try {
                                spinner.start(
                                    `正在下载：` +
                                        chalk.bold.black.bgWhite(` ${count + 1}/${amount} `) +
                                        chalk.blue.bold(`${volume.name}、${chapterTitle}`)
                                );

                                const { content, images } = await retryFn(async () => downloadChapter(chapterUrl));
                                const paths: string[] = [];
                                if (images.length) {
                                    for (const imageUrl of images) {
                                        const imagePath = imageUrl.split('/').pop();
                                        paths.push(imagePath);
                                        scheduler.add(async () => {
                                            try {
                                                spinner.start(`${volume.name}-${chapterTitle}-${imagePath}下载中`);
                                                const res = await retryFn(async () =>
                                                    axios.get(imageUrl, { responseType: 'arraybuffer' })
                                                );
                                                spinner.succeed(`${volume.name}-${chapterTitle}-${imagePath}下载完成`);
                                                return writeFile(
                                                    path.join(
                                                        process.cwd(),
                                                        options.outDir,
                                                        novel.novelName,
                                                        volumeNameWithIndex,
                                                        `./插图/${imagePath}`
                                                    ),
                                                    res.data
                                                );
                                            } catch {
                                                errorTimes++;
                                                console.log(
                                                    chalk.red(`${volume.name}-${chapterTitle}-${imagePath}下载失败`)
                                                );
                                                return appendFile(
                                                    path.join(process.cwd(), 'wenku8-error.log'),
                                                    `${volume.name}-${chapterTitle}-${imagePath}下载失败, 链接地址：${imageUrl}\n`
                                                );
                                            }
                                        });
                                    }
                                }

                                await writeFile(
                                    path.join(
                                        process.cwd(),
                                        options.outDir,
                                        novel.novelName,
                                        volumeNameWithIndex,
                                        `${chapterIndex}-${chapterTitle}.${options.ext}`
                                    ),
                                    `# ${chapterTitle}\n` +
                                        content +
                                        paths.map(path => `![](./插图/${path})`).join('\n')
                                );
                                spinner.succeed(
                                    `下载成功：` +
                                        chalk.bold.black.bgGreen(` ${count + 1}/${amount} `) +
                                        chalk.blue.bold(`${volume.name}、${chapterTitle}`)
                                );
                                count++;
                            } catch (error) {
                                errorTimes++;
                                console.log(chalk.red(`${chapterTitle}下载失败`));
                                return appendFile(
                                    path.join(process.cwd(), 'wenku8-error.log'),
                                    `${chapterTitle}下载失败, 链接地址：${chapterUrl}`
                                );
                            }
                        });
                    }
                }
            }

            await scheduler.onFinish();
            const minutes = ((Date.now() - startTime) / 1000 / 60).toFixed();
            const seconds = (((Date.now() - startTime) / 1000) % 60).toFixed();
            console.log(
                chalk.bold.green(`『 ${novel.novelName} 』` + '下载完成!' + `总共用时${minutes}分${seconds}秒`)
            );
            if (errorTimes) {
                console.log(chalk.yellow(`本次下载中出现了${errorTimes}次错误，详情见日志文件wenku8-error.log`));
            }
        }
    } catch (error) {
        console.log(error);
    }
}

/**
 * 根据小说的目录页，获取所有章节
 * @param catalogueUrl
 * @returns
 */
async function getChapterList(catalogueUrl: NonNullable<INovel['catalogueUrl']>): Promise<{
    volumes: {
        index: number;
        name: string;
        rowNumber: number;
    }[];
    volumeMap: Map<
        string,
        Array<{
            chapterIndex: number;
            chapterTitle: string;
            chapterUrl: string;
        }>
    >;
    amount: number;
}> {
    const $ = await fetch(catalogueUrl);
    const rows = $('tbody').children();

    // 获取小说卷数
    const volumes = $('table td[colspan=4]')
        .map((index, item) => ({
            index,
            name: $(item).text(),
            rowNumber: $(item).parent().index(),
        }))
        .get();

    // 获取小说某卷的所有章节
    const volumeMap: Map<
        string,
        Array<{
            chapterIndex: number;
            chapterTitle: string;
            chapterUrl: string;
        }>
    > = new Map();
    volumes.reduce((prev, next) => {
        insertMap(prev.rowNumber, next.rowNumber, prev.name);
        return next;
    });
    insertMap(volumes[volumes.length - 1].rowNumber, rows.length, volumes[volumes.length - 1].name);

    return {
        volumes,
        volumeMap,
        amount: Array.from(volumeMap.values()).flat().length,
    };

    function insertMap(start: number, end: number, volumeName: string) {
        rows.slice(start, end)
            .find('a')
            .each((chapterIndex, item) => {
                const chapterTitle = $(item).text();
                const chapterUrl = $(item).attr('href');
                if (chapterUrl) {
                    volumeMap.set(volumeName, [
                        ...(volumeMap.get(volumeName) || []),
                        {
                            chapterIndex: chapterIndex + 1,
                            chapterTitle,
                            chapterUrl: catalogueUrl.replace(/index\.htm$/, chapterUrl),
                        },
                    ]);
                }
            });
    }
}

/**
 * 下载某一章节
 * @param chapterUrl
 * @returns
 */
async function downloadChapter(chapterUrl: string) {
    const $ = await fetch(chapterUrl);
    if ($('#contentmain span').first().text().trim() == 'null') {
        // for: 因版权问题，文库不再提供该小说的阅读！
        let content = '';
        const v = chapterUrl.substring(0, chapterUrl.lastIndexOf('.')).split('/');

        try {
            const $ = await fetch(`http://dl.wenku8.com/pack.php?aid=${v.slice(-2)[0]}&vid=${v.slice(-1)[0]}`, 'utf-8');
            content = $('body')
                .text()
                .replace('&nbsp;', '')
                .replace('更多精彩热门日本轻小说、动漫小说，轻小说文库(http://www.wenku8.com) 为你一网打尽！', '');
        } catch (error) {
            if (error.message.indexOf('404') !== -1) {
                const res = await axios.get(
                    `http://dl.wenku8.com/packtxt.php?aid=${v.slice(-2)[0]}&vid=${v.slice(-1)[0]}`,
                    {
                        responseType: 'arraybuffer',
                    }
                );
                content = iconv.decode(res.data, 'utf-8');
            }
        }

        const picReg = /http:\/\/pic\.wenku8\.com\/pictures\/[\/0-9]+.jpg/g;
        const picRegL = /http:\/\/pic\.wenku8\.com\/pictures\/[\/0-9]+.jpg\([0-9]+K\)/g;
        const images = content.match(picReg) ?? [];
        content = content.replace(picRegL, '');
        return {
            content,
            images,
        };
    }
    const content = $('#content')
        .text()
        .replace('本文来自 轻小说文库(http://www.wenku8.com)', '')
        .replace('台版 转自 轻之国度', '')
        .replace('最新最全的日本动漫轻小说 轻小说文库(http://www.wenku8.com) 为你一网打尽！', '');

    const images = $('img')
        .map(function (i, imgEle: any) {
            const src = imgEle.attribs.src;
            return src;
        })
        .get();
    return {
        content,
        images,
    };
}

/**
 * 根据小说名称或者作者名称，获取到小说列表
 */
export async function search(
    search: string,
    type: 'articlename' | 'author' = 'articlename'
): Promise<
    Array<{
        novelName: string;
        novelId: number;
    }>
> {
    const searchKey = [...iconv.encode(search, 'gbk')].map(i => `%${i.toString(16)}`).join('');
    const $ = await fetch(
        `https://www.wenku8.net/modules/article/search.php?searchtype=${type}&searchkey=${searchKey}`
    );
    const catalogueUrl = $('#content')
        .children()
        .first()
        .children()
        .eq(5)
        .children()
        .children()
        .first()
        .find('a')
        .attr('href');
    if (catalogueUrl) {
        const novelName = $('#content').children().first().children().first().find('table tbody tr td span b').text();
        return [{ novelName, novelId: +catalogueUrl.match(/(\d+)\/index\.htm$/)![1] }];
    }
    const result = $('tbody tr td')
        .children()
        .map((_i, item) => {
            const novelName = $(item).find('b').text();
            const href = $(item).find('b a').attr('href')!;
            const novelId = getNovelId(href as Parameters<typeof getNovelId>[0]);
            return {
                novelName,
                novelId,
            };
        })
        .get();
    return result;
}

/**
 * 获取热门小说列表
 */
export async function getHotList(): Promise<
    Array<{
        type: string;
        novels: {
            novelName: string;
            novelId: number;
        }[];
    }>
> {
    const $ = await fetch('https://www.wenku8.net/index.php');
    const rightResult: Array<{
        type: string;
        novels: {
            novelName: string;
            novelId: number;
        }[];
    }> = $('body')
        .children()
        .eq(4)
        .find('#right')
        .children()
        .map((index, item) => {
            const novels = $(item)
                .find('ul a')
                .map((_i, item) => {
                    const novelName = $(item).attr('title');
                    const href = $(item).attr('href');
                    const novelId = getNovelId(href as Parameters<typeof getNovelId>[0]);

                    return {
                        novelName: `${novelId}.${novelName}`,
                        novelId,
                    };
                })
                .get();
            return {
                type: aliasRight(index),
                novels,
            };
        })
        .get();

    const centersResult = $('body')
        .children()
        .eq(4)
        .find('#centers')
        .children()
        .slice(1, 4)
        .map((index, item) => {
            const novels = $(item)
                .find('a[title]')
                .map((_i, item) => {
                    const href = $(item).attr('href');
                    const novelName = $(item).attr('title');
                    const novelId = getNovelId(href as Parameters<typeof getNovelId>[0]);
                    return {
                        novelName: `${novelId}.${novelName}`,
                        novelId,
                    };
                })
                .get();

            return {
                type: aliasCenters(index),
                novels,
            };
        })
        .get();
    return [...centersResult, ...rightResult];

    function aliasRight(index: number): string {
        switch (index) {
            case 0: {
                return '今日热榜';
            }
            case 1: {
                return '本月热榜';
            }
            case 2: {
                return '最受关注';
            }
            case 3: {
                return '已动画化';
            }
            case 4: {
                return '最新入库';
            }
            default: {
                throw new Error('异常');
            }
        }
    }

    function aliasCenters(index: number): string {
        switch (index) {
            case 0: {
                return '新番原作';
            }
            case 1: {
                return '新书风云榜';
            }
            case 2: {
                return '本周会员推荐';
            }
            default: {
                throw new Error('异常');
            }
        }
    }
}

export async function test() {
    // downloadNovel(3254);
    // search('欢迎');

    // getHotList();

    getNovelDetails(3238);
}

async function fetch(url: string, encoding = 'gbk'): Promise<cheerio.Root> {
    const res = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: {
            Cookie: `__51vcke__1xpAUPUjtatG3hli=5a01a941-8433-5b94-9655-52dec0a7b65f; __51vuft__1xpAUPUjtatG3hli=1652628823028; __51uvsct__1xxUOVWpBVjORhzY=1; __51vcke__1xxUOVWpBVjORhzY=c695b41b-df61-595d-ae04-487f396fcc2e; __51vuft__1xxUOVWpBVjORhzY=1652628823037; __51uvsct__1xxUP7WYCXbghcPV=1; __51vcke__1xxUP7WYCXbghcPV=2993057b-8415-5485-a5b0-997d39d4a598; __51vuft__1xxUP7WYCXbghcPV=1652628827348; Hm_lvt_d72896ddbf8d27c750e3b365ea2fc902=1661947884; Hm_lvt_acfbfe93830e0272a88e1cc73d4d6d0f=1661951291; __51vcke__1xtyjOqSZ75DRXC0=c920bc82-ab33-5d86-bad6-9794b1f17261; __51vuft__1xtyjOqSZ75DRXC0=1661953662466; __51uvsct__1xtyjOqSZ75DRXC0=2; __vtins__1xtyjOqSZ75DRXC0=%7B%22sid%22%3A%20%229dec5171-8481-5f82-8d51-89a528cb08f3%22%2C%20%22vd%22%3A%202%2C%20%22stt%22%3A%2026110%2C%20%22dr%22%3A%2026110%2C%20%22expires%22%3A%201662091786393%2C%20%22ct%22%3A%201662089986393%7D; Hm_lpvt_acfbfe93830e0272a88e1cc73d4d6d0f=1662186563; __vtins__1xpAUPUjtatG3hli=%7B%22sid%22%3A%20%22aecb38ff-403a-5b5d-a10a-4cc4dc2be52f%22%2C%20%22vd%22%3A%201%2C%20%22stt%22%3A%200%2C%20%22dr%22%3A%200%2C%20%22expires%22%3A%201662188497125%2C%20%22ct%22%3A%201662186697125%7D; __51uvsct__1xpAUPUjtatG3hli=3; PHPSESSID=8fn9rqvb2knvfeu42h7v60sbd94bil50; jieqiUserInfo=jieqiUserId%3D312317%2CjieqiUserName%3D2497360927%2CjieqiUserGroup%3D3%2CjieqiUserVip%3D0%2CjieqiUserName_un%3D2497360927%2CjieqiUserHonor_un%3D%26%23x65B0%3B%26%23x624B%3B%26%23x4E0A%3B%26%23x8DEF%3B%2CjieqiUserGroupName_un%3D%26%23x666E%3B%26%23x901A%3B%26%23x4F1A%3B%26%23x5458%3B%2CjieqiUserLogin%3D1662186700; jieqiVisitInfo=jieqiUserLogin%3D1662186700%2CjieqiUserId%3D312317; Hm_lpvt_d72896ddbf8d27c750e3b365ea2fc902=1662186706`,
        },
    });
    return cheerio.load(iconv.decode(res.data, encoding));
}

function getNovelId(href: `https://www.wenku8.net/book/${number}.htm`) {
    return +href.match(/(\d+)\.htm$/)![1];
}
