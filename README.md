轻小说文库下载器
=======================================================

![](assets/screenshot-20220902-182148.png)

## 介绍

本工具可用来下载[轻小说文库](https://www.wenku8.net/index.php)的小说，支持以下功能

- 支持根据小说名、作者名进行搜索
- 支持生成*epub*格式的电子书（默认行为）
- 支持生成*markdown*文件
- 支持仅下载小说插图
- 支持下载轻小说文库站点已下架的小说，如《无职转生》



## 安装

本工具基于NodeJS实现，请确保安装了[Node环境](https://nodejs.org/en/)

### 全局安装（推荐）

``` shell
npm install wenku8 -g # yarn global add wenku8
wenku8 
```



### 本地安装

``` shell
npm install wenku8 -D # yarn add wenku8 -D
npx wenku8
```

## 使用方式

### 方式一、生成epub电子书（默认行为）

``` shell
wenku8 
```

请注意：*Epub*电子书的生成需要批量下载小说内部的插图，而由于该图片站点网络极其不稳定，很容易出现图片加载失败的情况，因此本工具设定默认情况下图片资源的加载失败并不会阻塞整个任务的执行，只是生成的*Epub*电子书中可能丢失部分图片。如果希望能够总是拿到完整的*Epub*电子书，请使用以下命令进行多次尝试，在网络较好的情况是可以顺利执行的。

``` shell
wenku8 --strict
```

如果你希望能够拿到更多生成*Epub*时的日志信息，可以加上*verbose*标志

``` shell
wenku8 --strict --verbose
```



![](assets/screenshot-20220903-184109.png)

![](assets/screenshot-20220903-184223.png)



### 方式二、下载Markdown文件以及插图

``` shell
wenku8 --no-epub
```

![](assets/screenshot-20220902-182437.png)





### 方式三、仅下载小说插图

``` shell
wenku8 --no-epub --onlyImages
```







## 本地调试

``` shell
git clone https://github.com/Messiahhh/wenku8-downloader.git
cd wenku8-downloader
npm install

npm start
npm start -- --no-epub
npm start -- --no-epub --onlyImages
```



## 贡献者

<a href="https://github.com/Messiahhh/wenku8-downloader/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=Messiahhh/wenku8-downloader" />
</a>



