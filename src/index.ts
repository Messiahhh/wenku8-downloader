#!/usr/bin/env node
import { downloadNovel, getHotList, getNovelDetails, search } from './downloader.js';
import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import Table from 'cli-table3';
import chalk from 'chalk';
import { getCookie } from './utils/fetch.js';
import fs from 'fs';
import path from 'path';

enum Questions {
    查看热门小说,
    搜索小说,
    下载小说,
    查看收藏,
    什么也不做,
}

var favorites = new Array<FavoriteNovel>();
const favoritesConfigFilePath = path.join(process.cwd(), 'novels', 'favorites.json');

const program = new Command();
program
    .version('3.3.3')
    .name('轻小说文库下载器')
    .description('在终端实现轻小说的下载')
    .option('--no-epub', '不生成epub电子书', true)
    .option('--ext <value>', '不生成epub电子书时，默认生成markdown文件', 'md')
    .option('--onlyImages', '只下载小说的插图', false)
    .option('-o, --out-dir <value>', '指定小说放置目录，默认在当前目录下生成', './novels')
    .option('--verbose', '显示更多日志', false)
    .option('--strict', '严格模式下图片的下载失败将会阻止epub文件的生成', false);

program.parse(process.argv);
const options: CommandOptions = program.opts();

console.log(
    chalk.green(`欢迎使用轻小说文库下载器，本工具源码链接如下：https://github.com/Messiahhh/wenku8-downloader`)
);

getCookie().then(() => {
    init();
});

function init() {
    if (fs.existsSync(favoritesConfigFilePath)) {
        try {
            const content = fs.readFileSync(favoritesConfigFilePath);
            const decoder = new TextDecoder();
            favorites = favorites.concat(JSON.parse(decoder.decode(content)));
        } catch (e) {
            console.log(e);
        }
    }

    const questions = [
        {
            type: 'list',
            name: 'question',
            message: '你打算做什么',
            choices: [
                Questions[Questions.查看热门小说],
                Questions[Questions.搜索小说],
                Questions[Questions.下载小说],
                Questions[Questions.查看收藏],
                Questions[Questions.什么也不做],
            ],
        },
    ];
    inquirer.prompt(questions).then(({ question }) => {
        questionTwo(question);
    });
}

function questionTwo(question: keyof typeof Questions) {
    switch (question as keyof typeof Questions) {
        case Questions[Questions.查看热门小说]: {
            promptForView();
            break;
        }

        case Questions[Questions.搜索小说]: {
            promptForSearch();
            break;
        }

        case Questions[Questions.下载小说]: {
            promptForDownload();
            break;
        }

        case Questions[Questions.查看收藏]: {
            promptForFavorites();
            break;
        }

        default: {
        }
    }

    function promptForView() {
        inquirer
            .prompt([
                {
                    type: 'list',
                    name: 'type',
                    message: '请选择查询方式',
                    choices: [
                        '新番原作',
                        '新书风云榜',
                        '本周会员推荐',
                        new inquirer.Separator(),
                        '今日热榜',
                        '本月热榜',
                        '最受关注',
                        '已动画化',
                        '最新入库',
                        '返回',
                    ],
                    pageSize: 20,
                },
            ])
            .then(async ({ type }) => {
                if (type === '返回') {
                    init();
                } else {
                    const spinner = ora('请求中，请稍等...').start();
                    const result = await getHotList();
                    spinner.stop();
                    const novels = result.find(({ type: t }) => t === type)!.novels;
                    promptNovelList(novels, question);
                }
            });
    }
    function promptForSearch() {
        inquirer
            .prompt([
                {
                    type: 'list',
                    name: 'type',
                    message: '请选择查询方式',
                    choices: [
                        { value: 'articlename', name: '根据小说名' },
                        { value: 'author', name: '根据作者名' },
                        '返回',
                    ],
                },
                {
                    type: 'input',
                    name: 'searchKey',
                    message: '请输入关键字',
                    when({ type }) {
                        return type !== '返回';
                    },
                },
            ])
            .then(async ({ type, searchKey }) => {
                if (type === '返回') {
                    return init();
                } else if (searchKey) {
                    const spinner = ora('请求中，请稍等...').start();
                    const novels = await search(searchKey, type);
                    spinner.stop();
                    if (novels) {
                        promptNovelList(novels, question);
                    } else {
                        console.log('未查询到符合的结果');
                    }
                }
            });
    }

    function promptForDownload() {
        inquirer
            .prompt([
                {
                    type: 'string',
                    name: 'urlOrId',
                    message: '请输入小说详情页链接，或者小说ID',
                    suffix: chalk.gray('（链接格式如下：www.wenku8.net/book/1973.htm）'),
                },
            ])
            .then(({ urlOrId }) => {
                if (isFinite(Number(urlOrId))) {
                    promptNovelDetails(urlOrId);
                } else {
                    const result = /wenku8\.net\/book\/(\d+)\.htm$/.exec(urlOrId);
                    if (result?.[1]) {
                        promptNovelDetails(+result[1]);
                    } else {
                        console.log('参数异常');
                    }
                }
            });
    }
    function promptForFavorites() {
        return inquirer
            .prompt([
                {
                    type: 'list',
                    name: 'id',
                    message: '收藏',
                    choices: favorites.map(({ novelId, novelName, lastRead, lastReadChapter }) => ({
                        value: novelId,
                        name: `${novelId}.${novelName}: ${lastRead}: ${lastReadChapter}`,
                    })),
                },
            ])
            .then(async ({ id }) => {
                promptNovelDetails(id);
            });
    }
}

async function promptNovelList(novels: { novelName: string; novelId: number }[], step: keyof typeof Questions) {
    const { id } = await inquirer.prompt([
        {
            type: 'list',
            name: 'id',
            message: '小说详情',
            choices: novels
                .map(({ novelName, novelId }) => ({
                    value: novelId,
                    name: novelName,
                }))
                .concat([{ value: 0, name: '返回上一级' }]),

            pageSize: 20,
        },
    ]);
    if (!id) {
        return questionTwo(step);
    }
    promptNovelDetails(id);
}

async function promptNovelDetails(novelId: number) {
    let favoriteData: FavoriteNovel | undefined;
    let existsInFavorites = false;
    for (let i = 0; i < favorites.length; i++) {
        if (favorites[i].novelId == novelId) {
            favoriteData = favorites[i];
            existsInFavorites = true;
            break;
        }
    }
    const spinner = ora('请求中，请稍等...').start();
    const { novelName, author, status, lastUpdateTime, length, tag, recentChapter, desc } = await getNovelDetails(
        novelId
    );
    spinner.stop();
    const table = new Table({
        head: ['小说名', '作者', '标签', '完结状态', '全文长度', '最近更新时间', '最近章节'],
        wordWrap: true,
        wrapOnWordBoundary: true,
    });
    table.push([novelName, author, tag, status, length, lastUpdateTime, recentChapter]);
    console.log('简介：' + desc);
    console.log(table.toString());
    if (existsInFavorites) {
        const favInfoTable = new Table({
            head: ['最后更新收藏时间', '最后更新收藏章节', '是否有更新'],
            wordWrap: true,
            wrapOnWordBoundary: true,
        });
        favInfoTable.push([
            favoriteData?.lastRead,
            favoriteData?.lastReadChapter,
            favoriteData?.lastReadChapter == recentChapter ? '否' : '是',
        ]);
        console.log('收藏信息');
        console.log(favInfoTable.toString());
    }

    inquirer
        .prompt([
            {
                type: 'list',
                name: 'choice',
                message: '选项',
                choices: [{ name: '下载该小说', value: 0 }]
                    .concat(
                        existsInFavorites
                            ? [
                                  { name: '取消收藏该小说', value: 2 },
                                  { name: '更新收藏数据', value: 3 },
                              ]
                            : { name: '收藏该小说', value: 1 }
                    )
                    .concat({ name: '返回', value: 4 }),
            },
        ])
        .then(({ choice }) => {
            switch (choice) {
                case 0:
                    downloadNovel(novelId, options);
                    break;
                case 1:
                    favorites.push({
                        novelId: novelId,
                        novelName: novelName,
                        lastReadChapter: recentChapter,
                        lastRead: new Date().toLocaleString(),
                    });
                    fs.writeFileSync(favoritesConfigFilePath, JSON.stringify(favorites));
                    init();
                    break;
                case 2:
                    for (let i = 0; i < favorites.length; i++) {
                        if (favorites[i].novelId == novelId) {
                            favorites.splice(i, 1);
                            i--;
                        }
                    }
                    fs.writeFileSync(favoritesConfigFilePath, JSON.stringify(favorites));
                    init();
                    break;
                case 3:
                    for (let i = 0; i < favorites.length; i++) {
                        if (favorites[i].novelId == novelId) {
                            favorites[i].novelId = novelId;
                            favorites[i].novelName = novelName;
                            favorites[i].lastReadChapter = recentChapter;
                            favorites[i].lastRead = new Date().toLocaleString();
                            break;
                        }
                    }
                    fs.writeFileSync(favoritesConfigFilePath, JSON.stringify(favorites));
                    init();
                    break;
                case 4:
                    init();
                    break;
                default:
                    break;
            }
        });
}
