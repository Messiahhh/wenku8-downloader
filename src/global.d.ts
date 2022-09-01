interface INovel {
    id: number;
    name: string;
    /**
     * 内容简介
     */
    desc: string;
    /**
     * 目录链接
     */
    catalogueUrl?: string;
}
