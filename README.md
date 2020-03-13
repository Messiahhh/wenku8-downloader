[www.wenku8.com](http://www.wenku8.com/) 轻小说文库爬虫
=======================================================

#### 基于axios, async, cheerio, iconv-lite

#### 使用

在根目录下新建文件夹`novels`

```
$npm install
$node app.js
```

#### API

Novel.download接收一个小说页面的URL，形如`http://www.wenku8.com/book/1715.htm`

#### 更新

2020/3/13

- 面试的时候问到了一个异步任务的调度算法，就想起了以前写的这个爬虫，于是翻出来修改一下代码

- 核心调度代码

  ``` js
  class Scheduler {
  	constructor(count) {
  		this.count = count
  		this.queue = []
  		this.run = []
  	}
  
  	add(task) {
  		this.queue.push(task)
  		return this.schedule()
  	}
  
  	schedule() {
  		if (this.run.length < this.count && this.queue.length) {
  		  	const task = this.queue.shift()
  		  	const promise = task().then(() => {
  		  		this.run.splice(this.run.indexOf(promise), 1)
  		  	})
  		  	this.run.push(promise)
  		  	return promise
  		} else {
  		  	return Promise.race(this.run).then(() => this.schedule())
  		}
  	}
  }
  let scheduler = new Scheduler(50)
  
  scheduler.add(async () => {
      let $$ = await this.get(url)
      return fs.writeFileAsync('')
  }).then(() => {
      
  })
  ```

  

2017/12/25

- 重写了代码， 还是async， 代码量大大减少
- 使用了Promise.map， 其中设置了{ concurrency: 10 }， 从而设置了并发的数量， 防止服务挂掉。（大概是没问题了

2017/11/9 

- 用async改写了原来的download函数
- 事实上，需要一个很好的控制算法， 不然程序一下子请求数量太多， 会出现 Error: connect ETIMEDOUT 这样的错误 
