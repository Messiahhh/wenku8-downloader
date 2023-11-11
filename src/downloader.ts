import axios from 'axios';
import iconv from 'iconv-lite';
import fs from 'fs';
import path from 'path';
import util from 'util';
import ora from 'ora';
import chalk from 'chalk';
import { Scheduler, retryFn } from './utils/Scheduler.js';
import { fetch } from './utils/fetch.js';
import Epub from 'epub-gen-memory';

const BASE_URL = 'https://www.wenku8.net/book/';
const spinner = ora();
const scheduler = new Scheduler(5);
const writeFile = util.promisify(fs.writeFile);
const appendFile = util.promisify(fs.appendFile);

/**
 * 根据小说ID，下载全部小说
 * @param novelId
 * @param options
 */
export async function downloadNovel(novelId: number, options: CommandOptions) {
    try {
        if (!fs.existsSync(path.join(process.cwd(), options.outDir))) {
            fs.mkdirSync(path.join(process.cwd(), options.outDir));
        }
        const endCount = startCount();
        let errorTimes = 0;

        spinner.start('正在获取小说详情');
        const novel = await getNovelDetails(novelId);
        const epubOptions = {
            title: novel.novelName,
            author: novel.author,
            cover: novel.cover,
            tocTitle: '目录',
            lang: 'cn',
            content: [] as { title: string; content: any[] }[],
            verbose: options.verbose,
            fetchTimeout: 2000,
            retryTimes: 10,
            batchSize: 5,
            ignoreFailedDownloads: !options.strict,
        };

        if (novel.catalogueUrl) {
            const { volumes, volumeMap, amount } = await getChapterList(novel.catalogueUrl);
            let count = 0;
            spinner.succeed(`成功获取小说详情，该小说共有${volumes.length}卷`);
            for (const volume of volumes) {
                const volumeNameWithIndex = `${volume.index + 1}-${volume.name}`;

                if (options.epub) {
                    epubOptions.content.push({
                        title: volume.name,
                        content: [],
                    });
                } else {
                    if (
                        !fs.existsSync(path.join(process.cwd(), options.outDir, novel.novelName, volumeNameWithIndex))
                    ) {
                        fs.mkdirSync(
                            path.join(process.cwd(), options.outDir, novel.novelName, volumeNameWithIndex, '插图'),
                            {
                                recursive: true,
                            }
                        );
                    }
                }
                const chapters = volumeMap.get(volume.name);
                if (chapters) {
                    for (const { chapterIndex, chapterTitle, chapterUrl } of chapters) {
                        scheduler.add(async () => {
                            try {
                                if (!options.onlyImages) {
                                    spinner.start(
                                        `正在下载：` +
                                            chalk.bold.black.bgWhite(` ${count + 1}/${amount} `) +
                                            chalk.blue.bold(`${volume.name}、${chapterTitle}`)
                                    );
                                }

                                const { content, images } = await retryFn(async () =>
                                    downloadChapter(chapterUrl, options)
                                );
                                const paths: string[] = [];
                                if (images.length) {
                                    for (const imageUrl of images) {
                                        const imagePath = imageUrl.split('/').pop();
                                        paths.push(imagePath);
                                        if (!options.epub) {
                                            scheduler.add(async () => {
                                                try {
                                                    spinner.start(`${volume.name}-${chapterTitle}-${imagePath}下载中`);
                                                    const res = await retryFn(async () =>
                                                        axios.get(imageUrl, { responseType: 'arraybuffer' })
                                                    );
                                                    spinner.succeed(
                                                        `${volume.name}-${chapterTitle}-${imagePath}下载完成`
                                                    );

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
                                }
                                if (options.epub) {
                                    epubOptions.content[volume.index].content[chapterIndex] =
                                        `<h1>${chapterTitle}</h1>` + content;
                                } else if (!options.onlyImages) {
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
                                }
                                if (!options.onlyImages) {
                                    spinner.succeed(
                                        `下载成功：` +
                                            chalk.bold.black.bgGreen(` ${count + 1}/${amount} `) +
                                            chalk.blue.bold(`${volume.name}、${chapterTitle}`)
                                    );
                                }
                                count++;
                            } catch (error) {
                                errorTimes++;
                                count++;
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
            const { minutes, seconds } = endCount();
            if (options.epub) {
                spinner.start(`正在生成epub电子书，请稍等...`);
                const file = await Epub.default(
                    epubOptions,
                    epubOptions.content.map(item => ({
                        ...item,
                        content: item.content.join(`\n\n\n\n\n`),
                    }))
                );
                await writeFile(path.join(process.cwd(), options.outDir, `${novel.novelName}.epub`), file);

                spinner.stop();
            }
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
    const $ = await fetch(`https://www.wenku8.net${catalogueUrl}`);
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
async function downloadChapter(chapterUrl: string, options: CommandOptions) {
    const $ = await fetch(`https://www.wenku8.net${chapterUrl}`);
    if ($('#contentmain span').first().text().trim() == 'null') {
        // for: 因版权问题，文库不再提供该小说的阅读！
        let content = '';
        const v = chapterUrl.substring(0, chapterUrl.lastIndexOf('.')).split('/');

        try {
            const $ = await fetch(`http://dl.wenku8.com/pack.php?aid=${v.slice(-2)[0]}&vid=${v.slice(-1)[0]}`, 'utf-8');
            content =
                (options.epub ? $('body').html() : $('body').text())
                    ?.replace('&nbsp;', '')
                    .replace(
                        '更多精彩热门日本轻小说、动漫小说，轻小说文库(http://www.wenku8.com) 为你一网打尽！',
                        ''
                    ) || '';
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

    const content = (options.epub ? $('#content').html() : $('#content').text())
        ?.replace('本文来自 轻小说文库(http://www.wenku8.com)', '')
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
    const cover = $('#content').children().first().children().eq(3).find('table tbody tr td img').attr('src')!;
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
        cover,
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
            const novelId = extractNovelIdFromUrl(href as Parameters<typeof extractNovelIdFromUrl>[0]);
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
    }> = $('div#right')
        .children()
        .map((index, item) => {
            const novels = $(item)
                .find('.blockcontent ul li a')
                .map((_i, item) => {
                    const novelName = $(item).attr('title');
                    const href = $(item).attr('href');
                    const novelId = extractNovelIdFromUrl(href as Parameters<typeof extractNovelIdFromUrl>[0]);

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

    const centersResult = $('div#centers')
        .children()
        .slice(1, 4)
        .map((index, item) => {
            const novels = $(item)
                .find('a[title]')
                .map((_i, item) => {
                    const href = $(item).attr('href');
                    const novelName = $(item).attr('title');
                    const novelId = extractNovelIdFromUrl(href as Parameters<typeof extractNovelIdFromUrl>[0]);
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

function extractNovelIdFromUrl(href: `https://www.wenku8.net/book/${number}.htm`) {
    return +href.match(/(\d+)\.htm$/)![1];
}

/**
 * 计时器
 * @returns
 */
function startCount() {
    const startTime = Date.now();
    return () => {
        const endTime = Date.now();
        const duration = endTime - startTime;

        const minutes = (duration / 1000 / 60).toFixed();
        const seconds = ((duration / 1000) % 60).toFixed();
        return {
            duration,
            minutes,
            seconds,
        };
    };
}
