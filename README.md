### [www.wenku8.com](http://www.wenku8.com/) 轻小说文库 批量爬虫

### 一个基于axios, cheerio, iconv-lite的微型爬虫

#### 安装
在根目录下新建一个文件夹'novels'

```
$npm install
$node app.js

```

#### API

download 函数， 接受小说的目录URL， 结构如http://www.wenku8.com/novel/2/2017/index.htm，爬取单本小说



app.js 可以通过wenku.json进行批量的爬取



wenku.json的结构类似

```

[
    "http://www.wenku8.com/novel/2/2193/index.htm",
    "http://www.wenku8.com/novel/1/1787/index.htm",
    "http://www.wenku8.com/novel/1/1297/index.htm",
    "http://www.wenku8.com/novel/2/2065/index.htm",
    "http://www.wenku8.com/novel/1/1705/index.htm",
    "http://www.wenku8.com/novel/0/473/index.htm",
]

```

test.js提供了一个生成wenku.json的实例，用来爬取十年左右的'这本轻小说真厉害啊！'获奖作品


####更新
2017/11/9
 - 用async改写了原来的download函数
 - 事实上，需要一个很好的控制算法， 不然程序一下子请求数量太多， 会出现 Error: connect ETIMEDOUT 这样的错误





