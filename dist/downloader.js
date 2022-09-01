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
var __read = (this && this.__read) || function (o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
};
var __values = (this && this.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
import axios from 'axios';
import cheerio from 'cheerio';
import iconv from 'iconv-lite';
import fs from 'fs';
import path from 'path';
import util from 'util';
import { retryFn, Scheduler } from './utils/Scheduler.js';
import ora from 'ora';
import chalk from 'chalk';
var spinner = ora();
var writeFile = util.promisify(fs.writeFile);
var appendFile = util.promisify(fs.appendFile);
var scheduler = new Scheduler(5);
var HOST = 'https://www.wenku8.net';
var BASE_URL = 'https://www.wenku8.net/book/';
/**
 * 获取小说详细信息
 * @param novelId
 * @returns
 */
export function getNovelDetails(novelId) {
    return __awaiter(this, void 0, void 0, function () {
        var $, novelName, _a, library, author, status, lastUpdateTime, length, centerEl, tag, recentChapter, desc, catalogueUrl;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, fetch("".concat(BASE_URL).concat(novelId, ".htm"))];
                case 1:
                    $ = _b.sent();
                    novelName = $('#content').children().first().children().first().find('table tbody tr td span b').text();
                    _a = __read($('#content')
                        .children()
                        .first()
                        .children()
                        .first()
                        .children()
                        .first()
                        .children()
                        .eq(1)
                        .children()
                        .map(function (i, item) {
                        return $(item)
                            .text()
                            .match(/：(.+)$/)[1];
                    })
                        .get(), 5), library = _a[0], author = _a[1], status = _a[2], lastUpdateTime = _a[3], length = _a[4];
                    centerEl = $('#content').children().first().children().eq(3).find('table tbody tr td').eq(1);
                    tag = centerEl
                        .find('span')
                        .first()
                        .text()
                        .match(/：(.+)$/)[1];
                    recentChapter = centerEl.find('span').eq(3).text();
                    desc = centerEl.find('span').last().text();
                    catalogueUrl = $('#content')
                        .children()
                        .first()
                        .children()
                        .eq(5)
                        .children()
                        .children()
                        .first()
                        .find('a')
                        .attr('href');
                    return [2 /*return*/, {
                            novelId: novelId,
                            novelName: novelName,
                            library: library,
                            author: author,
                            status: status,
                            lastUpdateTime: lastUpdateTime,
                            length: length,
                            tag: tag,
                            recentChapter: recentChapter,
                            desc: desc,
                            catalogueUrl: catalogueUrl,
                        }];
            }
        });
    });
}
/**
 * 根据小说ID，下载全部小说
 * @param url
 * @returns
 */
export function downloadNovel(novelId, options) {
    return __awaiter(this, void 0, void 0, function () {
        var startTime, errorTimes_1, novel_1, _a, volumes, volumeMap, amount_1, count_1, _loop_1, volumes_1, volumes_1_1, volume, minutes, seconds, error_1;
        var e_1, _b;
        var _this = this;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 5, , 6]);
                    startTime = Date.now();
                    errorTimes_1 = 0;
                    spinner.start('正在请求小说详情页');
                    return [4 /*yield*/, getNovelDetails(novelId)];
                case 1:
                    novel_1 = _c.sent();
                    spinner.succeed('成功请求小说详情页');
                    if (!novel_1.catalogueUrl) return [3 /*break*/, 4];
                    spinner.start('正在请求小说目录页');
                    return [4 /*yield*/, getChapterList(novel_1.catalogueUrl)];
                case 2:
                    _a = _c.sent(), volumes = _a.volumes, volumeMap = _a.volumeMap, amount_1 = _a.amount;
                    count_1 = 0;
                    spinner.succeed("\u6210\u529F\u8BF7\u6C42\u5C0F\u8BF4\u76EE\u5F55\u9875\uFF0C\u8BE5\u5C0F\u8BF4\u5171\u6709".concat(volumes.length, "\u5377"));
                    _loop_1 = function (volume) {
                        var e_2, _d;
                        var volumeNameWithIndex = "".concat(volume.index + 1, "-").concat(volume.name);
                        if (!fs.existsSync(path.join(process.cwd(), options.outDir, novel_1.novelName, volumeNameWithIndex))) {
                            fs.mkdirSync(path.join(process.cwd(), options.outDir, novel_1.novelName, volumeNameWithIndex, '插图'), {
                                recursive: true,
                            });
                        }
                        var chapters = volumeMap.get(volume.name);
                        if (chapters) {
                            var _loop_2 = function (chapterIndex, chapterTitle, chapterUrl) {
                                scheduler.add(function () { return __awaiter(_this, void 0, void 0, function () {
                                    var _a, content, images, paths, _loop_3, images_1, images_1_1, imageUrl, error_2;
                                    var e_3, _b;
                                    var _this = this;
                                    return __generator(this, function (_c) {
                                        switch (_c.label) {
                                            case 0:
                                                _c.trys.push([0, 3, , 4]);
                                                spinner.start("\u6B63\u5728\u4E0B\u8F7D\uFF1A" +
                                                    chalk.bold.black.bgWhite(" ".concat(count_1 + 1, "/").concat(amount_1, " ")) +
                                                    chalk.blue.bold("".concat(volume.name, "\u3001").concat(chapterTitle)));
                                                return [4 /*yield*/, retryFn(function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                                                        return [2 /*return*/, downloadChapter(chapterUrl)];
                                                    }); }); })];
                                            case 1:
                                                _a = _c.sent(), content = _a.content, images = _a.images;
                                                paths = [];
                                                if (images.length) {
                                                    _loop_3 = function (imageUrl) {
                                                        var imagePath = imageUrl.split('/').pop();
                                                        paths.push(imagePath);
                                                        scheduler.add(function () { return __awaiter(_this, void 0, void 0, function () {
                                                            var res, _a;
                                                            var _this = this;
                                                            return __generator(this, function (_b) {
                                                                switch (_b.label) {
                                                                    case 0:
                                                                        _b.trys.push([0, 2, , 3]);
                                                                        spinner.start("".concat(volume.name, "-").concat(chapterTitle, "-").concat(imagePath, "\u4E0B\u8F7D\u4E2D"));
                                                                        return [4 /*yield*/, retryFn(function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                                                                                return [2 /*return*/, axios.get(imageUrl, { responseType: 'arraybuffer' })];
                                                                            }); }); })];
                                                                    case 1:
                                                                        res = _b.sent();
                                                                        spinner.succeed("".concat(volume.name, "-").concat(chapterTitle, "-").concat(imagePath, "\u4E0B\u8F7D\u5B8C\u6210"));
                                                                        return [2 /*return*/, writeFile(path.join(process.cwd(), options.outDir, novel_1.novelName, volumeNameWithIndex, "./\u63D2\u56FE/".concat(imagePath)), res.data)];
                                                                    case 2:
                                                                        _a = _b.sent();
                                                                        errorTimes_1++;
                                                                        console.log(chalk.red("".concat(volume.name, "-").concat(chapterTitle, "-").concat(imagePath, "\u4E0B\u8F7D\u5931\u8D25")));
                                                                        return [2 /*return*/, appendFile(path.join(process.cwd(), 'wenku8-error.log'), "".concat(volume.name, "-").concat(chapterTitle, "-").concat(imagePath, "\u4E0B\u8F7D\u5931\u8D25, \u94FE\u63A5\u5730\u5740\uFF1A").concat(imageUrl, "\n"))];
                                                                    case 3: return [2 /*return*/];
                                                                }
                                                            });
                                                        }); });
                                                    };
                                                    try {
                                                        for (images_1 = __values(images), images_1_1 = images_1.next(); !images_1_1.done; images_1_1 = images_1.next()) {
                                                            imageUrl = images_1_1.value;
                                                            _loop_3(imageUrl);
                                                        }
                                                    }
                                                    catch (e_3_1) { e_3 = { error: e_3_1 }; }
                                                    finally {
                                                        try {
                                                            if (images_1_1 && !images_1_1.done && (_b = images_1.return)) _b.call(images_1);
                                                        }
                                                        finally { if (e_3) throw e_3.error; }
                                                    }
                                                }
                                                return [4 /*yield*/, writeFile(path.join(process.cwd(), options.outDir, novel_1.novelName, volumeNameWithIndex, "".concat(chapterIndex, "-").concat(chapterTitle, ".").concat(options.ext)), "# ".concat(chapterTitle, "\n") +
                                                        content +
                                                        paths.map(function (path) { return "![](./\u63D2\u56FE/".concat(path, ")"); }).join('\n'))];
                                            case 2:
                                                _c.sent();
                                                spinner.succeed("\u4E0B\u8F7D\u6210\u529F\uFF1A" +
                                                    chalk.bold.black.bgGreen(" ".concat(count_1 + 1, "/").concat(amount_1, " ")) +
                                                    chalk.blue.bold("".concat(volume.name, "\u3001").concat(chapterTitle)));
                                                count_1++;
                                                return [3 /*break*/, 4];
                                            case 3:
                                                error_2 = _c.sent();
                                                errorTimes_1++;
                                                console.log(chalk.red("".concat(chapterTitle, "\u4E0B\u8F7D\u5931\u8D25")));
                                                return [2 /*return*/, appendFile(path.join(process.cwd(), 'wenku8-error.log'), "".concat(chapterTitle, "\u4E0B\u8F7D\u5931\u8D25, \u94FE\u63A5\u5730\u5740\uFF1A").concat(chapterUrl))];
                                            case 4: return [2 /*return*/];
                                        }
                                    });
                                }); });
                            };
                            try {
                                for (var chapters_1 = (e_2 = void 0, __values(chapters)), chapters_1_1 = chapters_1.next(); !chapters_1_1.done; chapters_1_1 = chapters_1.next()) {
                                    var _e = chapters_1_1.value, chapterIndex = _e.chapterIndex, chapterTitle = _e.chapterTitle, chapterUrl = _e.chapterUrl;
                                    _loop_2(chapterIndex, chapterTitle, chapterUrl);
                                }
                            }
                            catch (e_2_1) { e_2 = { error: e_2_1 }; }
                            finally {
                                try {
                                    if (chapters_1_1 && !chapters_1_1.done && (_d = chapters_1.return)) _d.call(chapters_1);
                                }
                                finally { if (e_2) throw e_2.error; }
                            }
                        }
                    };
                    try {
                        for (volumes_1 = __values(volumes), volumes_1_1 = volumes_1.next(); !volumes_1_1.done; volumes_1_1 = volumes_1.next()) {
                            volume = volumes_1_1.value;
                            _loop_1(volume);
                        }
                    }
                    catch (e_1_1) { e_1 = { error: e_1_1 }; }
                    finally {
                        try {
                            if (volumes_1_1 && !volumes_1_1.done && (_b = volumes_1.return)) _b.call(volumes_1);
                        }
                        finally { if (e_1) throw e_1.error; }
                    }
                    return [4 /*yield*/, scheduler.onFinish()];
                case 3:
                    _c.sent();
                    minutes = ((Date.now() - startTime) / 1000 / 60).toFixed();
                    seconds = (((Date.now() - startTime) / 1000) % 60).toFixed();
                    console.log(chalk.bold.green("\u300E ".concat(novel_1.novelName, " \u300F") + '下载完成!' + "\u603B\u5171\u7528\u65F6".concat(minutes, "\u5206").concat(seconds, "\u79D2")));
                    if (errorTimes_1) {
                        console.log(chalk.yellow("\u672C\u6B21\u4E0B\u8F7D\u4E2D\u51FA\u73B0\u4E86".concat(errorTimes_1, "\u6B21\u9519\u8BEF\uFF0C\u8BE6\u60C5\u89C1\u65E5\u5FD7\u6587\u4EF6wenku8-error.log")));
                    }
                    _c.label = 4;
                case 4: return [3 /*break*/, 6];
                case 5:
                    error_1 = _c.sent();
                    console.log(error_1);
                    return [3 /*break*/, 6];
                case 6: return [2 /*return*/];
            }
        });
    });
}
/**
 * 根据小说的目录页，获取所有章节
 * @param catalogueUrl
 * @returns
 */
function getChapterList(catalogueUrl) {
    return __awaiter(this, void 0, void 0, function () {
        function insertMap(start, end, volumeName) {
            rows.slice(start, end)
                .find('a')
                .each(function (chapterIndex, item) {
                var chapterTitle = $(item).text();
                var chapterUrl = $(item).attr('href');
                if (chapterUrl) {
                    volumeMap.set(volumeName, __spreadArray(__spreadArray([], __read((volumeMap.get(volumeName) || [])), false), [
                        {
                            chapterIndex: chapterIndex + 1,
                            chapterTitle: chapterTitle,
                            chapterUrl: catalogueUrl.replace(/index\.htm$/, chapterUrl),
                        },
                    ], false));
                }
            });
        }
        var $, rows, volumes, volumeMap;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fetch(catalogueUrl)];
                case 1:
                    $ = _a.sent();
                    rows = $('tbody').children();
                    volumes = $('table td[colspan=4]')
                        .map(function (index, item) { return ({
                        index: index,
                        name: $(item).text(),
                        rowNumber: $(item).parent().index(),
                    }); })
                        .get();
                    volumeMap = new Map();
                    volumes.reduce(function (prev, next) {
                        insertMap(prev.rowNumber, next.rowNumber, prev.name);
                        return next;
                    });
                    insertMap(volumes[volumes.length - 1].rowNumber, rows.length, volumes[volumes.length - 1].name);
                    return [2 /*return*/, {
                            volumes: volumes,
                            volumeMap: volumeMap,
                            amount: Array.from(volumeMap.values()).flat().length,
                        }];
            }
        });
    });
}
/**
 * 下载某一章节
 * @param chapterUrl
 * @returns
 */
function downloadChapter(chapterUrl) {
    var _a;
    return __awaiter(this, void 0, void 0, function () {
        var $, content_1, v, $_1, error_3, res, picReg, picRegL, images_2, content, images;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, fetch(chapterUrl)];
                case 1:
                    $ = _b.sent();
                    if (!($('#contentmain span').first().text().trim() == 'null')) return [3 /*break*/, 8];
                    content_1 = '';
                    v = chapterUrl.substring(0, chapterUrl.lastIndexOf('.')).split('/');
                    _b.label = 2;
                case 2:
                    _b.trys.push([2, 4, , 7]);
                    return [4 /*yield*/, fetch("http://dl.wenku8.com/pack.php?aid=".concat(v.slice(-2)[0], "&vid=").concat(v.slice(-1)[0]), 'utf-8')];
                case 3:
                    $_1 = _b.sent();
                    content_1 = $_1('body')
                        .text()
                        .replace('&nbsp;', '')
                        .replace('更多精彩热门日本轻小说、动漫小说，轻小说文库(http://www.wenku8.com) 为你一网打尽！', '');
                    return [3 /*break*/, 7];
                case 4:
                    error_3 = _b.sent();
                    if (!(error_3.message.indexOf('404') !== -1)) return [3 /*break*/, 6];
                    return [4 /*yield*/, axios.get("http://dl.wenku8.com/packtxt.php?aid=".concat(v.slice(-2)[0], "&vid=").concat(v.slice(-1)[0]), {
                            responseType: 'arraybuffer',
                        })];
                case 5:
                    res = _b.sent();
                    content_1 = iconv.decode(res.data, 'utf-8');
                    _b.label = 6;
                case 6: return [3 /*break*/, 7];
                case 7:
                    picReg = /http:\/\/pic\.wenku8\.com\/pictures\/[\/0-9]+.jpg/g;
                    picRegL = /http:\/\/pic\.wenku8\.com\/pictures\/[\/0-9]+.jpg\([0-9]+K\)/g;
                    images_2 = (_a = content_1.match(picReg)) !== null && _a !== void 0 ? _a : [];
                    content_1 = content_1.replace(picRegL, '');
                    return [2 /*return*/, {
                            content: content_1,
                            images: images_2,
                        }];
                case 8:
                    content = $('#content')
                        .text()
                        .replace('本文来自 轻小说文库(http://www.wenku8.com)', '')
                        .replace('台版 转自 轻之国度', '')
                        .replace('最新最全的日本动漫轻小说 轻小说文库(http://www.wenku8.com) 为你一网打尽！', '');
                    images = $('img')
                        .map(function (i, imgEle) {
                        var src = imgEle.attribs.src;
                        return src;
                    })
                        .get();
                    return [2 /*return*/, {
                            content: content,
                            images: images,
                        }];
            }
        });
    });
}
/**
 * 根据小说名称或者作者名称，获取到小说列表
 */
export function search(search, type) {
    if (type === void 0) { type = 'articlename'; }
    return __awaiter(this, void 0, void 0, function () {
        var searchKey, $, catalogueUrl, novelName, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    searchKey = __spreadArray([], __read(iconv.encode(search, 'gbk')), false).map(function (i) { return "%".concat(i.toString(16)); }).join('');
                    return [4 /*yield*/, fetch("https://www.wenku8.net/modules/article/search.php?searchtype=".concat(type, "&searchkey=").concat(searchKey))];
                case 1:
                    $ = _a.sent();
                    catalogueUrl = $('#content')
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
                        novelName = $('#content').children().first().children().first().find('table tbody tr td span b').text();
                        return [2 /*return*/, [{ novelName: novelName, novelId: +catalogueUrl.match(/(\d+)\/index\.htm$/)[1] }]];
                    }
                    result = $('tbody tr td')
                        .children()
                        .map(function (_i, item) {
                        var novelName = $(item).find('b').text();
                        var href = $(item).find('b a').attr('href');
                        var novelId = getNovelId(href);
                        return {
                            novelName: novelName,
                            novelId: novelId,
                        };
                    })
                        .get();
                    return [2 /*return*/, result];
            }
        });
    });
}
/**
 * 获取热门小说列表
 */
export function getHotList() {
    return __awaiter(this, void 0, void 0, function () {
        function aliasRight(index) {
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
        function aliasCenters(index) {
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
        var $, rightResult, centersResult;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fetch('https://www.wenku8.net/index.php')];
                case 1:
                    $ = _a.sent();
                    rightResult = $('body')
                        .children()
                        .eq(4)
                        .find('#right')
                        .children()
                        .map(function (index, item) {
                        var novels = $(item)
                            .find('ul a')
                            .map(function (_i, item) {
                            var novelName = $(item).attr('title');
                            var href = $(item).attr('href');
                            var novelId = getNovelId(href);
                            return {
                                novelName: "".concat(novelId, ".").concat(novelName),
                                novelId: novelId,
                            };
                        })
                            .get();
                        return {
                            type: aliasRight(index),
                            novels: novels,
                        };
                    })
                        .get();
                    centersResult = $('body')
                        .children()
                        .eq(4)
                        .find('#centers')
                        .children()
                        .slice(1, 4)
                        .map(function (index, item) {
                        var novels = $(item)
                            .find('a[title]')
                            .map(function (_i, item) {
                            var href = $(item).attr('href');
                            var novelName = $(item).attr('title');
                            var novelId = getNovelId(href);
                            return {
                                novelName: "".concat(novelId, ".").concat(novelName),
                                novelId: novelId,
                            };
                        })
                            .get();
                        return {
                            type: aliasCenters(index),
                            novels: novels,
                        };
                    })
                        .get();
                    return [2 /*return*/, __spreadArray(__spreadArray([], __read(centersResult), false), __read(rightResult), false)];
            }
        });
    });
}
export function test() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            // downloadNovel(3254);
            // search('欢迎');
            // getHotList();
            getNovelDetails(3238);
            return [2 /*return*/];
        });
    });
}
function fetch(url, encoding) {
    if (encoding === void 0) { encoding = 'gbk'; }
    return __awaiter(this, void 0, void 0, function () {
        var res;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, axios.get(url, {
                        responseType: 'arraybuffer',
                        headers: {
                            Cookie: "__51vcke__1xpAUPUjtatG3hli=5a01a941-8433-5b94-9655-52dec0a7b65f; __51vuft__1xpAUPUjtatG3hli=1652628823028; __51uvsct__1xxUOVWpBVjORhzY=1; __51vcke__1xxUOVWpBVjORhzY=c695b41b-df61-595d-ae04-487f396fcc2e; __51vuft__1xxUOVWpBVjORhzY=1652628823037; __51uvsct__1xxUP7WYCXbghcPV=1; __51vcke__1xxUP7WYCXbghcPV=2993057b-8415-5485-a5b0-997d39d4a598; __51vuft__1xxUP7WYCXbghcPV=1652628827348; Hm_lvt_d72896ddbf8d27c750e3b365ea2fc902=1661947884; Hm_lvt_acfbfe93830e0272a88e1cc73d4d6d0f=1661951291; __vtins__1xtyjOqSZ75DRXC0=%7B%22sid%22%3A%20%22da1690c7-39a9-50ce-9b00-d2d7a2b545d0%22%2C%20%22vd%22%3A%201%2C%20%22stt%22%3A%200%2C%20%22dr%22%3A%200%2C%20%22expires%22%3A%201661955462461%2C%20%22ct%22%3A%201661953662461%7D; __51uvsct__1xtyjOqSZ75DRXC0=1; __51vcke__1xtyjOqSZ75DRXC0=c920bc82-ab33-5d86-bad6-9794b1f17261; __51vuft__1xtyjOqSZ75DRXC0=1661953662466; __51uvsct__1xpAUPUjtatG3hli=2; jieqiVisitTime=jieqiArticlesearchTime%3D1662039252; jieqiVisitId=article_articleviews%3D133%7C1973; Hm_lpvt_acfbfe93830e0272a88e1cc73d4d6d0f=1662039379; __vtins__1xpAUPUjtatG3hli=%7B%22sid%22%3A%20%227a3004f0-aa71-5734-8f69-c72b9b4addc4%22%2C%20%22vd%22%3A%205%2C%20%22stt%22%3A%20321835%2C%20%22dr%22%3A%20161945%2C%20%22expires%22%3A%201662041336210%2C%20%22ct%22%3A%201662039536210%7D; PHPSESSID=ilg55ibgt4q6qgufp0lmi3vvombbr6be; jieqiUserInfo=jieqiUserId%3D312317%2CjieqiUserName%3D2497360927%2CjieqiUserGroup%3D3%2CjieqiUserVip%3D0%2CjieqiUserName_un%3D2497360927%2CjieqiUserHonor_un%3D%26%23x65B0%3B%26%23x624B%3B%26%23x4E0A%3B%26%23x8DEF%3B%2CjieqiUserGroupName_un%3D%26%23x666E%3B%26%23x901A%3B%26%23x4F1A%3B%26%23x5458%3B%2CjieqiUserLogin%3D1662039552; jieqiVisitInfo=jieqiUserLogin%3D1662039552%2CjieqiUserId%3D312317; Hm_lpvt_d72896ddbf8d27c750e3b365ea2fc902=1662041445",
                        },
                    })];
                case 1:
                    res = _a.sent();
                    return [2 /*return*/, cheerio.load(iconv.decode(res.data, encoding))];
            }
        });
    });
}
function getNovelId(href) {
    return +href.match(/(\d+)\.htm$/)[1];
}
