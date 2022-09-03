#!/usr/bin/env node
import { downloadNovel, getHotList, getNovelDetails, search } from './downloader.js';
import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import Table from 'cli-table3';
import chalk from 'chalk';
import { getCookie } from './utils/fetch.js';

enum Questions {
    查看热门小说,
    搜索小说,
    下载小说,
    什么也不做,
}

const program = new Command();
program
    .version('3.0.0')
    .name('轻小说文库下载器')
    .description('在终端实现轻小说的下载')
    .option('-e, --ext <value>', '指定生成的文件后缀名，默认为md', 'md')
    .option('-o, --out-dir <value>', '指定小说放置目录，默认在当前目录下生成', './novels');

program.parse(process.argv);
const options: {
    ext: string;
    outDir: string;
    concurrency: string;
} = program.opts();

console.log(
    chalk.green('欢迎使用轻小说文库下载器，本工具源码链接如下：https://github.com/Messiahhh/wenku8-downloader')
);

getCookie().then(() => {
    init();
});

function init() {
    const questions = [
        {
            type: 'list',
            name: 'question',
            message: '你打算做什么',
            choices: [
                Questions[Questions.查看热门小说],
                Questions[Questions.搜索小说],
                Questions[Questions.下载小说],
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
}

function promptNovelList(novels: { novelName: string; novelId: number }[], step: keyof typeof Questions) {
    return inquirer
        .prompt([
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
        ])
        .then(async ({ id }) => {
            if (!id) {
                return questionTwo(step);
            }
            promptNovelDetails(id);
        });
}

async function promptNovelDetails(novelId: number) {
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
    inquirer
        .prompt([
            {
                type: 'confirm',
                name: 'type',
                message: '是否下载该小说？',
            },
        ])
        .then(({ type }) => {
            if (type) {
                downloadNovel(novelId, options);
            }
        });
}
