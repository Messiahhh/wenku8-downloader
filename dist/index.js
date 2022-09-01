#!/usr/bin/env node
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
import { downloadNovel, getHotList, getNovelDetails, search } from './downloader.js';
import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import Table from 'cli-table3';
import chalk from 'chalk';
var Questions;
(function (Questions) {
    Questions[Questions["\u67E5\u770B\u70ED\u95E8\u5C0F\u8BF4"] = 0] = "\u67E5\u770B\u70ED\u95E8\u5C0F\u8BF4";
    Questions[Questions["\u641C\u7D22\u5C0F\u8BF4"] = 1] = "\u641C\u7D22\u5C0F\u8BF4";
    Questions[Questions["\u4E0B\u8F7D\u5C0F\u8BF4"] = 2] = "\u4E0B\u8F7D\u5C0F\u8BF4";
    Questions[Questions["\u4EC0\u4E48\u4E5F\u4E0D\u505A"] = 3] = "\u4EC0\u4E48\u4E5F\u4E0D\u505A";
})(Questions || (Questions = {}));
var program = new Command();
program
    .version('3.0.0')
    .name('轻小说文库下载器')
    .description('在终端实现轻小说的下载')
    .option('-e, --ext <value>', '指定生成的文件后缀名，默认为md', 'md')
    .option('-o, --out-dir <value>', '指定小说放置目录，默认在当前目录下生成', './novels');
program.parse(process.argv);
var options = program.opts();
console.log(chalk.green('欢迎使用轻小说文库下载器，本工具源码链接如下：https://github.com/Messiahhh/wenku8-downloader'));
init();
function init() {
    var questions = [
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
    inquirer.prompt(questions).then(function (_a) {
        var question = _a.question;
        questionTwo(question);
    });
}
function questionTwo(question) {
    switch (question) {
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
        var _this = this;
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
            .then(function (_a) {
            var type = _a.type;
            return __awaiter(_this, void 0, void 0, function () {
                var spinner, result, novels;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            if (!(type === '返回')) return [3 /*break*/, 1];
                            init();
                            return [3 /*break*/, 3];
                        case 1:
                            spinner = ora('请求中，请稍等...').start();
                            return [4 /*yield*/, getHotList()];
                        case 2:
                            result = _b.sent();
                            spinner.stop();
                            novels = result.find(function (_a) {
                                var t = _a.type;
                                return t === type;
                            }).novels;
                            promptNovelList(novels, question);
                            _b.label = 3;
                        case 3: return [2 /*return*/];
                    }
                });
            });
        });
    }
    function promptForSearch() {
        var _this = this;
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
                when: function (_a) {
                    var type = _a.type;
                    return type !== '返回';
                },
            },
        ])
            .then(function (_a) {
            var type = _a.type, searchKey = _a.searchKey;
            return __awaiter(_this, void 0, void 0, function () {
                var spinner, novels;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            if (!(type === '返回')) return [3 /*break*/, 1];
                            return [2 /*return*/, init()];
                        case 1:
                            if (!searchKey) return [3 /*break*/, 3];
                            spinner = ora('请求中，请稍等...').start();
                            return [4 /*yield*/, search(searchKey, type)];
                        case 2:
                            novels = _b.sent();
                            spinner.stop();
                            if (novels) {
                                promptNovelList(novels, question);
                            }
                            else {
                                console.log('未查询到符合的结果');
                            }
                            _b.label = 3;
                        case 3: return [2 /*return*/];
                    }
                });
            });
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
            .then(function (_a) {
            var urlOrId = _a.urlOrId;
            if (isFinite(Number(urlOrId))) {
                promptNovelDetails(urlOrId);
            }
            else {
                var result = /wenku8\.net\/book\/(\d+)\.htm$/.exec(urlOrId);
                if (result === null || result === void 0 ? void 0 : result[1]) {
                    promptNovelDetails(+result[1]);
                }
                else {
                    console.log('参数异常');
                }
            }
        });
    }
}
function promptNovelList(novels, step) {
    var _this = this;
    return inquirer
        .prompt([
        {
            type: 'list',
            name: 'id',
            message: '小说详情',
            choices: novels
                .map(function (_a) {
                var novelName = _a.novelName, novelId = _a.novelId;
                return ({
                    value: novelId,
                    name: novelName,
                });
            })
                .concat([{ value: 0, name: '返回上一级' }]),
            pageSize: 20,
        },
    ])
        .then(function (_a) {
        var id = _a.id;
        return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_b) {
                if (!id) {
                    return [2 /*return*/, questionTwo(step)];
                }
                promptNovelDetails(id);
                return [2 /*return*/];
            });
        });
    });
}
function promptNovelDetails(novelId) {
    return __awaiter(this, void 0, void 0, function () {
        var spinner, _a, novelName, author, status, lastUpdateTime, length, tag, recentChapter, desc, table;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    spinner = ora('请求中，请稍等...').start();
                    return [4 /*yield*/, getNovelDetails(novelId)];
                case 1:
                    _a = _b.sent(), novelName = _a.novelName, author = _a.author, status = _a.status, lastUpdateTime = _a.lastUpdateTime, length = _a.length, tag = _a.tag, recentChapter = _a.recentChapter, desc = _a.desc;
                    spinner.stop();
                    table = new Table({
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
                        .then(function (_a) {
                        var type = _a.type;
                        if (type) {
                            downloadNovel(novelId, options);
                        }
                    });
                    return [2 /*return*/];
            }
        });
    });
}
