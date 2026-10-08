# dsh-dialect-mysql

MySQL for [`dsh-ds-db`](https://github.com/sumu126/ds-db-plugin): registers the `mysql` type, so the plugin's read-only tools, its settings page, and its type chooser work against MySQL.

> **这个包也单独发布在一个仓里**：[`dsh-dialect-mysql`](https://github.com/sumu126/dsh-dialect-mysql)。
> 那是个**发布镜像**——源在这里，即 `ds-db-plugin` 的 `dialects/mysql/`；问题与改动请提到 `ds-db-plugin`。

```sh
# 核心与方言是两个独立的 bundle：先装核心，再装这个包
dsh plugin --profile web add ./dsh-ds-db-0.1.0.tgz
dsh plugin --profile web add ./dsh-dialect-mysql-0.1.0.tgz
```

它和第三方方言包的形状**完全一致**——核心不引用它，也不内置任何数据库类型。要从零写一个方言，看仓库里的 [`dialects/_template`](https://github.com/sumu126/ds-db-plugin/tree/main/dialects/_template)，契约见 [方言扩展 API 文档](https://github.com/sumu126/ds-db-plugin/blob/main/docs/04_API_Docs/方言扩展_API.md)。

| | |
| --- | --- |
| 能力 | 全部声明（`databases` / `tables` / `columns` / `indexes` / `createStatement` / `estimatedRows` / `charset` / `version` / `sample` / `explain`） |
| 专属连接字段 | 无——MySQL 只用共享字段（主机/端口/账号/默认库/超时/行帽） |
| 取消的语义 | 退役会话而非中断语句：mysql2 的池没有 `destroy()`，`end()` 把 `COM_QUIT` 排在正在执行的语句之后，所以服务端那条语句会跑完 |
| 许可 | MIT |

`npm test` 跑只读判定、方言 facts 与契约审计；`npm run verify` 跑方言自检套件（都不需要数据库）。
