# dsh-dialect-mysql

MySQL for [`dsh-ds-db`](https://www.npmjs.com/package/dsh-ds-db): registers the `mysql` type, so the plugin's read-only tools, its settings page, and its type chooser work against MySQL.

```sh
# 通常由 dsh-ds-db 作为依赖带上；单独安装用于显式固定版本
dsh plugin --profile web add dsh-ds-db
```

它和第三方方言包的形状**完全一致**——只是随插件发布，不是特殊的那一个。要从零写一个方言，看仓库里的 [`dialects/_template`](https://github.com/sumu126/ds-db-plugin/tree/main/dialects/_template)，契约见 [方言扩展 API 文档](https://github.com/sumu126/ds-db-plugin/blob/main/docs/04_API_Docs/方言扩展_API.md)。

| | |
| --- | --- |
| 能力 | 全部声明（`databases` / `tables` / `columns` / `indexes` / `createStatement` / `estimatedRows` / `charset` / `version` / `sample` / `explain`） |
| 专属连接字段 | 无——MySQL 只用共享字段（主机/端口/账号/默认库/超时/行帽） |
| 取消的语义 | 退役会话而非中断语句：mysql2 的池没有 `destroy()`，`end()` 把 `COM_QUIT` 排在正在执行的语句之后，所以服务端那条语句会跑完 |
| 许可 | MIT |

`npm test` 跑只读判定、方言 facts 与契约审计；`npm run verify` 跑方言自检套件（都不需要数据库）。
