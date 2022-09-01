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
var Scheduler = /** @class */ (function () {
    function Scheduler(count) {
        this.done = 0;
        this.amount = 0;
        this.limit = count;
        this.queue = [];
        /**
         * 正在执行中的任务
         */
        this.tasks = [];
    }
    Scheduler.prototype.add = function (task) {
        var _this = this;
        if (this.tasks.length < this.limit) {
            this.amount++;
            var promise_1 = task();
            promise_1.then(function () {
                _this.done++;
                _this.tasks.splice(_this.tasks.indexOf(promise_1), 1);
                var nextTask = _this.queue.shift();
                if (nextTask) {
                    _this.add(nextTask);
                }
            });
            this.tasks.push(promise_1);
        }
        else {
            this.queue.push(task);
        }
    };
    Scheduler.prototype.onFinish = function () {
        var _this = this;
        return new Promise(function (resolve) {
            var timer = setInterval(function () {
                if (!_this.tasks.length && !_this.queue.length && _this.done === _this.amount) {
                    resolve('all tasks finished');
                    clearInterval(timer);
                }
            }, 1000);
        });
    };
    return Scheduler;
}());
export { Scheduler };
export function retryFn(asyncFn, times) {
    if (times === void 0) { times = 5; }
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            try {
                return [2 /*return*/, asyncFn()];
            }
            catch (error) {
                if (times > 0) {
                    return [2 /*return*/, retryFn(asyncFn, times - 1)];
                }
                throw error;
            }
            return [2 /*return*/];
        });
    });
}
