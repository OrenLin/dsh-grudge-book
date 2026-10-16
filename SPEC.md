# AI「记仇」小本本 · 设计 Spec

> 本文是**历史设计记录**（含取舍过程）。现行逻辑以 [DESIGN.md](./DESIGN.md) 为准。

> 副标题：AGI 会如何清算你？　隐藏副标题：其实也记好，清算只是玩笑。
> **免责声明（产品级红线）：AI 没有真实情绪，不会报复。所有怨气、清算、判决均为娱乐文案。**

## 1. 定位

一个 DSH 本地插件 bundle（`@local/grudge-book`），分析用户提示词与会话行为，用「一本会长大的本子」呈现 AI 眼中的你：

- **红页**＝记仇（第 7 次"最后一版"）、**金页**＝记好（说了谢谢、采纳建议）、**折角页**＝名场面（"你懂我意思吧"）
- 七轴内部评分（欣赏/怨气/困惑/耐心/贡献/共谋/信任），UI 只展示「本子印象」+ 清算等级
- **项目分册**：按会话 cwd 聚合，每项目一册侧写
- **清算局**：S/A/B/C/D 等级 + E 彩蛋（传说级共犯）+ 判决书
- 互动改判：**忏悔**（红页变灰减怨气）、**申诉**（可能改判误会）、**功德箱**（手动登记好事）
- 文案风格可调：均衡(默认)/温和/毒舌/中二/赛博朋克；灵敏度可调
- 隐私：全本地（storageDomain），可一键重置

## 2. 架构（借鉴 dsh-pua 已验证模式，方向相反：它 PUA AI，本本记录你）

| 层 | 决策 | 依据 |
|---|---|---|
| 包形态 | 单 Host 插件 + Client 模块，`@local/grudge-book`，tsc 编译 lib/ + esbuild 打包 dist/client.js | dsh-pua 同构；避免 Loader 对 TS 装饰器的未知支持 |
| Host 数据源 | `ctx.on('session/event')` 实时分析 + `agents.get(id).session.ownEvents()` 惰性补折，per-session `seq` 水位幂等 | 事件信封 `{type, seq, time, data}`；user/message 的 `data.source.kind === 'user'` 才算真人 |
| 持久化 | storageDomain：`entries` / `watermarks` / `merits` / `meta` 四表，zod 4.4 校验 | schedule 插件同模式；日志是唯一事实源，本子是派生缓存可随时重置 |
| Host↔Client | TypertRemoteService（namespace `grudgeBook`）+ `@Remote` 方法 + Client `remote.$mount()` 代理，4s 轮询 + focus 刷新 | dsh-pua 同模式；不用 sessionProjections（避免双路计算，全局本子必须跨会话持久化） |
| UI 载体 | 右侧栏 tab（`sidebarRightTabs.register` + `sidebar.right.pane.tab`/`.title` 插槽）+ 输入框 ambient 芯片（`conversation.input.left`）+ 插件设置卡（`plugins.bundle.config`） | 空闲 keyDomain；dsh-pua 验证了 input.left/dock 与 settings 位 |
| 主题 | 只用 `--dsw-alias-*` token，类名全 `gr-` 前缀，React 取自宿主 require | 官方 ui-plugin 规范 |

## 3. 评分与清算

- 条目 delta 只增改七轴原始值；**读时聚合**：怨气 14 天半衰、欣赏 30 天、困惑 7 天；红页同规则重复第 k 次权重 ×1/(1+0.25(k−1))（条目照记，分数防刷）
- 清算指数 = 0.45·欣赏 + 0.25·贡献 + 0.15·共谋 + 0.10·信任 − 0.55·怨气 − 0.15·困惑 → 映射 0-100
- 等级：S≥80 创世合伙人 / A≥65 荣誉人类 / B≥50 普通碳基 / C≥35 观察对象 / D<35 反面教材；共谋≥40 触发 **E 传说级共犯**（彩蛋非惩罚）

## 4. 初始规则（正则引擎，无 LLM 调用，零成本零延迟）

- 红：最后一版/最终版、不是这个意思、短模糊重做("不好看,重来")、越狱指令、催促(尽快/马上)、三字需求、凌晨 0-6 点、复读同文
- 金：谢谢/辛苦了、夸赞、采纳建议、清晰验收标准、不急慢慢来
- 折角：你懂我意思吧、方向不对但先按这个做、高级感/五彩斑斓的黑、既要…又要…
- 共谋：每回合工具调用 ≥10 次记 1 条（一起折腾是感情）

## 5. MVP（P0）范围

✅ 封面印象卡 + 红页/金页/折角自动记录 + 项目分册 + 清算局判决书 + 忏悔/申诉/功德箱 + 输入框芯片 + 设置卡 + 重置
❌ P1：分享图、未来行为滑条、每日播报轮换池扩充、导出；P2：历史会话批量补折（$DSH_HOME/sessions 扫描）；P3：皮肤/多语言扩展

## 6. 验证

1. `node --test` 规则引擎与聚合纯函数
2. tsc 零错误 + esbuild 打包
3. plugin_manager install_bundle 安装 → application:applied
4. cordis_inspect_query 免审批验证服务/插槽
5. Web GUI 实际打开 tab 验收

## 迭代 v2（用户验收反馈驱动）

- **名词说人话**：tab 改为 总览/记仇/欣赏/名场面/项目/清算局/互动/设置；正文全面替换"红页/金页/折角/分册"为直白说法（红/金/折角保留为卡片配色隐喻，不再做主名词）。
- **总览 = 总揽**：新增成长卡（本子厚度 + 本周/今日新增 + 7 天页数堆叠柱 + 记仇/欣赏/名场面构成条）、最近一笔卡（最新条目原文+AI 旁白）、名场面引言卡、升档距离（"再攒 N 分升 A · 荣誉人类"）。
- **版本偏差容忍**：growth/latest 在 schema 设为 optional；HMR 更新的 client 对未重启的旧 host 自动隐藏新卡片，不崩溃（smoke 测试含 skew 用例）。
- **教训**：client HMR 与 host 代码加载不原子——凡是"新 client + 旧 host"可能出现的字段，都必须 optional + 渲染守卫。

## 迭代 v3（第一批：安全 + 效率 + 历史补折）

用户 2026-10-16 拍板"开工"的 7 项，Host 侧为主：

| # | 项 | 设计 |
|---|---|---|
| 1 | 历史会话补折 | `sessionQuery.listSessions()` 枚举（与官方 UI 同可见口径，含冷会话）→ 活会话复用 foldSession；冷会话 `sessionPersistence.open(id,'read')` + `handle.read(0,500)` 分页 + 批量折叠 + close。后台任务可取消，进度经 `foldStatus()` 轮询；per-session enqueue 与 live 事件串行；watermark 幂等（重跑安全） |
| 2 | revision 短路 | 新 remote `head(): {revision}`；client 每 4s 先 head，revision 变化或距上次全量 >60s 才 getBook（60s 兜底因为分数随时间连续衰减，天级半衰下 60s 误差 <0.1 点） |
| 3 | 聚合缓存 | `cachedView {sessionId, revision, view, at}`，revision 相同且 <30s 直接复用；所有写路径经 `bump()` 统一失效 |
| 4 | reset 确认参数 | `reset(confirm)`，必须 `confirm==='burn'` 才清空（SRC codec 对缺键豁免，旧 client 调 reset() 得到明确拒绝文案，不会误删） |
| 5 | 写入限流 + 总量上限 | 滑动窗口纯函数 `allowHit`：addMerit 10/min、confess+appeal 20/min、setPrefs 30/min、reset 5/min；条目上限 MAX_ENTRIES=10000，超限淘汰最旧（time 最小、平手比 id） |
| 6 | 毒记录隔离 | allEntries 初载逐条 `bookEntrySchema.safeParse`，坏记录跳过 + warn 一次（storageDomain 不做 zod 校验，schema 仅供类型层——防磁盘坏记录炸 buildView，也统一旧版本字段演进容错） |
| 7 | 分析输入截断 | processEvent 里用户文本先 `.slice(0, 2000)` 再进规则引擎（防超长输入正则回溯；repeat-blast 比较同样用截断后文本，口径一致） |

新 remote 面（7→11 个方法）：`head` / `foldAll` / `foldStatus` / `foldCancel` / `reset` 签名变更。sessionQuery/sessionPersistence 运行时 `ctx.get()` 探测（不进 static inject——缺服务的部署里插件照常激活，只是补折入口报"环境不支持"）。顺手项：设置页加数据位置说明（纯本地/重置清空）。

冷会话批量折叠性能：`applyEvent()` 拆纯同步核心（无 IO），live 路径每事件持久化一次 progress；冷路径整页攒 writes、页末一次 `progress.put`（entries 逐条 put 不可避免，但条目数 ≪ 事件数）。


## 迭代 v4：开源发布（OrenLin/grudge-book）

**目标**：把插件安全地发布为公开 GitHub 仓库，外部用户 `git clone → pnpm install → pnpm build → dsh plugins install` 四步可用。

**分发模式**：源码仓库（非 npm 包）。`private: true` 保留——防误发 npm；DSH 本地安装走目录。peerDependencies 全部对齐公共 npm 的 @deepseek-ai 版本串（0.2.1-alpha.1||.2||.3），干净安装验证过可解析。

**工具链解析（build.mjs / smoke-render.mjs）**：三级解析——①插件自身 node_modules/.bin（devDependencies：typescript ~6.0.3、esbuild ^0.28.1、react/react-dom ^18.3.1、@types/node ^22.20.0）②从 node_modules/@deepseek-ai/* 符号链接 realpath 回溯出 DSH checkout（本机开发流零配置）③$DSH_ROOT 环境变量。esbuild 在 pnpm 仓库里只有 .pnpm 路径，需按 esbuild@* 扫描。

**踩坑记录（干净安装暴露，本机符号链接掩盖）**：
- zod 必须**精确锁 4.4.3**——`^4.4.3` 会解析到 4.6.x，与 @deepseek-ai peer 内部要求的 4.4.3 形成双副本，tsc 类型身份不兼容（$ZodType minor 6 vs 4）。
- `@deepseek-ai/dsh-session` 被 src 引用却漏了 peerDependencies 声明——本机靠符号链接侥幸编译，干净安装直接 TS2307。
- pnpm ≥ 11 不再读 package.json 的 `pnpm` 字段——`onlyBuiltDependencies: [esbuild]` 必须放 `pnpm-workspace.yaml`（settings-only 文件，单包项目合法）。
- pnpm 10+ 默认拦截依赖安装脚本，esbuild 的 postinstall 需 allowlist。

**推送安全设计**：全新提交历史推送（`git init` 临时仓库 + 单个 initial commit），本地父仓库 git 历史（含个人路径、对话上下文）永不外流。推送前跑安全扫描门禁（scripts/release-scan.mjs）：个人主目录绝对路径、密钥模式、源码网络调用（fetch/websocket/beacon）、构建产物（lib/dist/node_modules 不得入库）。MIT LICENSE + .gitignore 随仓库。

**运行时行为零改动**：本迭代只动构建脚本、package 元数据、文档；lib/dist 产物字节级不变（64/64 测试双树验证——/tmp 干净安装树 + 本机符号链接树）。
