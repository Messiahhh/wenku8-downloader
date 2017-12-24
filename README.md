[www.wenku8.com](http://www.wenku8.com/) 轻小说文库爬虫
=======================================================

#### 基于axios, async, cheerio, iconv-lite

#### 使用

在根目录下新建一个文件夹'novels', 并修改lib.js中的cookie变量， 改成你自己的cookie值

```
$npm install
$node app.js
```

#### API

lib.js

- Novel.download 接受一个形如'http://www.wenku8.com/book/2111.htm' 这样的小说目录链接， 调用后会自动下载这本小说。

app.js

- 这个脚本主要是用来获取历年的'这本轻小说真厉害啊！'的获奖作品并批量下载

#### 更新

2017/11/9 

- 用async改写了原来的download函数
- 事实上，需要一个很好的控制算法， 不然程序一下子请求数量太多， 会出现 Error: connect ETIMEDOUT 这样的错误 


2017/12/25

- 重写了代码， 还是async， 代码量大大减少
- 使用了Promise.map， 其中设置了{ concurrency: 10 }， 从而设置了并发的数量， 防止服务挂掉。（大概是没问题了

