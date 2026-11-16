# 发布与提交清单（Publishing guide）

这份文件不是博客正文，而是**交作业前的操作手册**：把仓库推送到 GitHub、核对链接、把博客发到 CSDN、提交作业。所有命令都可以直接复制执行。

## 1. 推送仓库到 GitHub

GitHub 上新建一个 **Public** 仓库，名字为 `832402111_contactbook`（不要勾选 README、.gitignore、License，本地已经有了）。

```bash
cd 832402111_contactbook

# 确认作者信息与提交历史
git log --oneline

# 关联远程仓库并推送
git remote add origin https://github.com/Clancy-lov-sq/832402111_contactbook.git
git push -u origin main
```

推送后打开 <https://github.com/Clancy-lov-sq/832402111_contactbook>，确认：

- [ ] 仓库是 Public，能匿名访问；
- [ ] 首页显示 README；
- [ ] Commits 页面至少 3 条提交，作者是本人；
- [ ] `codestyle.md`、`docs/API.md`、`docs/DESIGN.md`、`deploy/README.md` 都能打开；
- [ ] `screenshots/` 中的图片能在网页上预览。

## 2. 核对博客中的链接

博客 `blog/assignment-blog.md` 里有 8 个外链，发布前逐个点开确认不是 404（把下面表格当成检查表）：

| 链接 | 应指向 |
| --- | --- |
| `https://github.com/Clancy-lov-sq/832402111_contactbook` | 仓库首页 |
| `.../blob/main/codestyle.md` | 代码规范 |
| `.../blob/main/README.md` | 安装与接口说明 |
| `.../blob/main/docs/API.md` | 接口文档 |
| `.../blob/main/docs/DESIGN.md` | 设计文档 |
| `.../blob/main/deploy/README.md` | 部署指南 |
| `.../blob/main/docs/samples/contactbook-export-sample.xlsx` | 示例导出文件 |
| `.../blob/main/screenshots/capture-results.json` | 截图脚本的 28 条断言 |

如果 GitHub 账号或仓库名不同，用编辑器全局替换 `Clancy-lov-sq/832402111_contactbook` 即可。

## 3. 生成提交历史截图（可选，博客已引用）

博客引用了 `blog/images/commits.png`。在仓库根目录执行：

```bash
git log --pretty=format:'%h|%ad|%an|%s' --date=format:'%Y-%m-%d %H:%M' > docs/git-history.txt
python tools/render-commits.py
cp screenshots/commits.png blog/images/commits.png
```

脚本读取的是 `git log` 的真实输出，所以图片里的哈希、日期、作者、提交信息与仓库一致。重新截图后记得提交：

```bash
git add docs/git-history.txt screenshots/commits.png blog/images/commits.png
git commit -m "docs(blog): refresh the commit history screenshot"
git push
```

## 4. 发布到 CSDN

1. 打开 <https://blog.csdn.net>，进入“创作中心 → 写文章”，切换到 **Markdown** 编辑器。
2. 把 `blog/assignment-blog.md` 的全部内容粘贴进去（不要包含文件开头的代码块标记）。
3. **插入图片**：CSDN 不允许直接引用本地相对路径。把 `blog/images/` 里的文件逐个拖到对应位置，或先上传到相册再用链接替换。图片与章节的对应关系：

   | 图片 | 位置 |
   | --- | --- |
   | `01-home.png` | 3.1 主界面 |
   | `02-favorites.png`、`05-bookmark-toast.png`、`16-favorites-final.png` | 3.2 收藏 |
   | `03-search.png`、`04-group.png` | 3.3 搜索与分组 |
   | `06-detail.png` | 3.4 详情抽屉 |
   | `07-new-contact-form.png`、`08-form-validation.png`、`09-created-toast.png` | 3.5 新建与校验 |
   | `11-import-pick.png`、`12-import-report.png` | 3.6 导入 |
   | `10-export-menu.png`、`17-export-workbook.png` | 3.7 导出 |
   | `14-empty-state.png`、`15-mobile.png` | 3.8 空状态与移动端 |
   | `demo-running.gif` | 3.9 完整运行演示 |
   | `commits.png` | 第八节 Git 提交记录 |

4. 标题建议：`极限编程作业：ContactBook 通讯录（收藏 / 多联系方式 / Excel 导入导出）`。
5. 标签建议：`软件工程`、`极限编程`、`Vue`、`Node.js`、`SQLite`、`Excel`。
6. 分类专栏建议：`软件工程（FZU-MU）`，与课程社区一致。
7. 点击**发布**（不要只保存草稿）。作业帖说明博客发布后需要审核，建议在截止前至少留出 1–2 小时。
8. 回到作业帖 <https://bbs.csdn.net/topics/620593436>，点击“提交任务”，填写博客链接。

## 5. 视频（如果老师要求 MP4）

博客里嵌入的是 15 帧动图，能完整走完主要流程。如果还需要 MP4：

1. 打开 <http://127.0.0.1:8080>（先 `npm start`）；
2. `Win + G` 打开系统录屏，按博客 3.9 节的操作顺序录 1–2 分钟；
3. 上传到 B 站/腾讯云，把链接加到博客“3.9 完整运行演示”小节末尾；
4. 视频不需要重新剪辑，重点是完整、能看清操作。

## 6. 提交前自检（对照评分表）

- [ ] 仓库 Public，提交次数 ≥ 3（本项目 10 次，贡献 100%）；
- [ ] 博客包含：项目地址、提交历史截图与提交数、实现思路、运行截图与演示、分工说明（单人项目，已说明）、PSP 表；
- [ ] 收藏功能可以演示：星标 → 刷新 → 仍在“我的收藏”；
- [ ] 多联系方式：新建一位联系人，至少添加 3 条不同类型的联系方式；
- [ ] 导出：下载的 xlsx 一行一人、一类信息一列；
- [ ] 导入：用导出的文件再导入，报告显示“更新”而不是“失败”；
- [ ] 部署：如果租了云服务器，按 `deploy/README.md` 部署后把公网地址补到博客表格里；没有租就保留“未部署”的说明，不要写假地址；
- [ ] 博客已发布并通过审核，作业帖已提交。

## 7. 常见问题

**Q：`npm ci` 报 engine 错误？**
需要 Node.js ≥ 22.5（`node:sqlite` 从 22.5 开始提供）。用 `node --version` 确认，升级后重试。

**Q：端口 8080 被占用？**
`PORT=3000 npm start`（PowerShell：`$env:PORT=3000; npm start`）。

**Q：页面打开是空白？**
先执行 `npm run build`，`server/public` 不存在时 Express 只提供 API。

**Q：导入提示“表格缺少姓名列”？**
第一行表头必须包含“姓名”或“name”，可以带标题行，但姓名列不能改名成“联系人姓名（必填）”之类无法识别的文字。

**Q：CSDN 图片显示不出来？**
本地相对路径上传后会失效，必须使用 CSDN 相册的图片地址；重新拖入图片即可。
