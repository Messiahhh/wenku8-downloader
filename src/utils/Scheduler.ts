export class Scheduler {
    done = 0;
    amount = 0;
    limit: number;
    queue: Array<(...args: unknown[]) => Promise<unknown>>;
    tasks: Array<Promise<unknown>>;

    constructor(count: number) {
        this.limit = count;
        this.queue = [];
        /**
         * 正在执行中的任务
         */
        this.tasks = [];
    }

    add(task: typeof this.queue[number]) {
        if (this.tasks.length < this.limit) {
            this.amount++;
            const promise = task();
            promise.finally(() => {
                this.done++;
                this.tasks.splice(this.tasks.indexOf(promise), 1);
                const nextTask = this.queue.shift();
                if (nextTask) {
                    this.add(nextTask);
                }
            });
            this.tasks.push(promise);
        } else {
            this.queue.push(task);
        }
    }

    onFinish() {
        return new Promise(resolve => {
            const timer = setInterval(() => {
                if (!this.tasks.length && !this.queue.length && this.done === this.amount) {
                    resolve('all tasks finished');
                    clearInterval(timer);
                }
            }, 1000);
        });
    }
}

export async function retryFn<T extends () => Promise<any>>(asyncFn: T, times = 10): Promise<ReturnType<T>> {
    try {
        return asyncFn();
    } catch (error) {
        if (times > 0) {
            return retryFn(asyncFn, times - 1);
        }
        throw error;
    }
}
