# 发布与提交操作指南（中文）

这份文件不是博客正文，而是**交作业当天的操作手册**。按顺序照做即可：推送 GitHub → 核对链接 → 发布 CSDN → 提交作业帖。命令以 Windows PowerShell 为准，macOS/Linux 把路径写法换一下即可。

> 当前仓库状态：本地已有 **16 次提交**，工作区干净；`blog/assignment-blog.md` 是英文博客正文，`blog/images/` 里有 19 张配图（17 张截图、1 张提交历史图、1 个演示 GIF）。仓库名 `832402111_contactbook`，GitHub 账号 `Clancy-lov-sq`。

---

## 第 1 步：在 GitHub 建仓库并推送（约 3 分钟）

1. 浏览器打开 <https://github.com/new>。
2. 填写：
   - **Repository name**：`832402111_contactbook`（必须与博客里的链接一致；如果换成别的名字，后面要全局替换链接）。
   - **Description**：`ContactBook — address book with bookmarks, multiple contact methods and Excel import/export`
   - 选择 **Public**。
   - **不要**勾选 "Add a README file"、"Add .gitignore"、"Choose a license"（本地已有，勾选会造成冲突）。
3. 点 **Create repository**。
4. 回到本机 PowerShell，进入仓库目录：

```powershell
cd C:\Users\dell\Documents\deepseek-harness\default-workspace\832402111_contactbook

# 确认当前状态
git log --oneline
git status

# 关联远程仓库（把 Clancy-lov-sq 换成你的账号，如果你换了账号）
git remote add origin https://github.com/Clancy-lov-sq/832402111_contactbook.git

# 推送主分支
git push -u origin main
```

5. 如果弹出登录窗口：选 **Sign in with your browser**，在浏览器里授权即可。若提示 403，说明本机缓存的旧账号不对，执行：

```powershell
cmdkey /list | findstr github          # 查看已保存的凭据
git config --global --unset credential.helper
git push -u origin main                # 重新弹窗登录
```

6. 推送成功后打开 <https://github.com/Clancy-lov-sq/832402111_contactbook>，确认：
   - 仓库是 Public，未登录也能打开；
   - 首页显示 README；
   - **Commits** 页面显示 16 条提交，作者是本人；
   - `codestyle.md`、`docs/API.md`、`docs/DESIGN.md`、`deploy/README.md` 都能点开；
   - `screenshots/` 里的图片能在网页上直接预览。

> 如果换了 GitHub 账号或仓库名，用编辑器全局替换这两个字符串：`Clancy-lov-sq` 和 `832402111_contactbook`（涉及 `blog/assignment-blog.md`、`blog/publishing-guide.md`、`README.md`、`docs/*.md`、`deploy/*`）。

---

## 第 2 步：核对博客里的链接（约 2 分钟）

推送后在浏览器逐个点开下面 8 个链接，确认不是 404：

| 链接 | 应指向 |
| --- | --- |
| `https://github.com/Clancy-lov-sq/832402111_contactbook` | 仓库首页 |
| `.../blob/main/codestyle.md` | 代码规范 |
| `.../blob/main/README.md` | 安装、接口、结构说明 |
| `.../blob/main/docs/API.md` | 接口文档 |
| `.../blob/main/docs/DESIGN.md` | 设计文档 |
| `.../blob/main/deploy/README.md` | 部署指南 |
| `.../blob/main/docs/samples/contactbook-export-sample.xlsx` | 示例导出文件（GitHub 会提供下载） |
| `.../blob/main/screenshots/capture-results.json` | 截图脚本的 28 条断言 |

> 如果某个链接 404，通常是分支名不是 `main` 或文件名大小写不一致；在 GitHub 页面复制真实地址替换。

---

## 第 3 步：重新生成提交历史图（可选，约 1 分钟；会新增 1 次提交）

博客第八节引用了 `blog/images/commits.png`，它由真实 `git log` 渲染。**如果不想改变提交数，直接跳过这一步**：现有图片已经可用，博客也注明了它渲染于 13 次提交时。要刷新时按下面执行（会多出 1 次提交，博客里的总数可自行改一笔）：

```powershell
cd C:\Users\dell\Documents\deepseek-harness\default-workspace\832402111_contactbook

# 导出真实提交历史为文本
git log --pretty=format:'%h|%ad|%an|%s' --date=format:'%Y-%m-%d %H:%M' > docs/git-history.txt

# 渲染成图片（需要仓库里安装的 Python + Pillow；本机已有）
python tools/render-commits.py

# 提交更新
git add docs/git-history.txt screenshots/commits.png blog/images/commits.png
git commit -m "docs: refresh the commit history image"
git push
```

---

## 第 4 步：发布到 CSDN（约 15 分钟，含图片上传）

### 4.1 新建文章

1. 打开 <https://blog.csdn.net>，登录后点右上角 **创作中心 → 写文章**。
2. 编辑器右上角从“富文本”切换到 **Markdown**。
3. 标题填：

```text
Extreme Programming Assignment: ContactBook (Favorites, Multiple Contact Methods, Excel Import/Export)
```

4. 把 `blog/assignment-blog.md` 的全部内容粘贴进去（从 `# Extreme Programming Assignment ...` 开始，到最后一节结束；不要包含 Markdown 代码围栏）。
5. 右侧/顶部设置：
   - **分类专栏**：`软件工程（FZU-MU）`（没有就新建，名称与课程社区一致）。
   - **标签**：`软件工程`、`极限编程`、`Vue`、`Node.js`、`SQLite`、`Excel`、`通讯录`。
   - **摘要**：可留空，系统自动取正文。

### 4.2 上传图片（最关键的一步）

CSDN 的编辑器**不能直接显示本地相对路径**（`images/01-home.png` 这种）。粘贴后每张图会显示成破图，需要逐张替换：

1. 打开本地文件夹 `C:\Users\dell\Documents\deepseek-harness\default-workspace\832402111_contactbook\blog\images\`。
2. 在 CSDN 编辑器里找到对应位置（用博客里的图片说明文字定位，比如 "Main screen"），**删除破图那一行**，把本地图片直接**拖进编辑器**，CSDN 会自动上传并插入真实图片地址。
3. 图片与章节的对应关系：

| 图片文件 | 博客中的位置 |
| --- | --- |
| `01-home.png` | 3.1 Main screen |
| `02-favorites.png` | 3.2 Favorites（第一张） |
| `05-bookmark-toast.png` | 3.2 Favorites（第二张） |
| `16-favorites-final.png` | 3.2 Favorites（第三张） |
| `03-search.png` | 3.3 Search and group filters（第一张） |
| `04-group.png` | 3.3 Search and group filters（第二张） |
| `06-detail.png` | 3.4 Contact details |
| `07-new-contact-form.png` | 3.5 Creating and editing（第一张） |
| `08-form-validation.png` | 3.5 Creating and editing（第二张） |
| `09-created-toast.png` | 3.5 Creating and editing（第三张） |
| `11-import-pick.png` | 3.6 Importing Excel（第一张） |
| `12-import-report.png` | 3.6 Importing Excel（第二张） |
| `13-imported-grid.png` | 建议补在 3.6 末尾（原文未嵌入，可加一行） |
| `10-export-menu.png` | 3.7 Exporting Excel（第一张） |
| `17-export-workbook.png` | 3.7 Exporting Excel（第二张） |
| `14-empty-state.png` | 3.8 Empty state and mobile（第一张） |
| `15-mobile.png` | 3.8 Empty state and mobile（第二张） |
| `demo-running.gif` | 3.9 Complete running demo |
| `commits.png` | 第 8 节 Git history |

4. 全部替换完后从上到下滚一遍，确认没有破图、没有红叉、没有 `images/` 开头的本地路径残留。
5. 也可以先把图片批量上传到 CSDN **相册**，再复制相册图片地址逐个替换，效果一样。

### 4.3 发布

1. 点右上角 **发布文章**（不要只点“保存草稿”）。
2. 选择 **原创**，勾选 **发布**。
3. 提示需要审核：一般 1–2 小时内通过；**建议在截止前至少留 2 小时**，审核期间文章可能只有自己可见。
4. 审核通过后，打开文章页，复制浏览器地址栏的链接（形如 `https://blog.csdn.net/weixin_65034459/article/details/xxxxxx`），并再次确认图片能正常显示。

---

## 第 5 步：到作业帖提交（约 2 分钟）

1. 打开作业帖 <https://bbs.csdn.net/topics/620593436>。
2. 页面下方/顶部找到 **提交任务** 按钮。
3. 在提交框里填写：
   - 博客链接（上一步复制的 CSDN 文章地址）；
   - 仓库链接 `https://github.com/Clancy-lov-sq/832402111_contactbook`；
   - 如有备注可写“单人完成，界面与文档均为英文，未申请云部署加分项”。
4. 点击提交，页面显示“0 人已提交 / 完成率”刷新为你的记录即成功。
5. 截图保存提交成功的页面，防止系统问题。

---

## 第 6 步：如果老师要求 MP4 视频

博客 3.9 节嵌入的是 15 帧 GIF，能完整走完流程。如果需要真正的视频：

1. 本机启动应用：

```powershell
cd C:\Users\dell\Documents\deepseek-harness\default-workspace\832402111_contactbook
npm start
```

2. 浏览器打开 <http://127.0.0.1:8080>。
3. 按 `Win + G` 打开 Windows 录屏，点圆点开始录。
4. 按博客 3.9 节的顺序操作 1–2 分钟：浏览 → 收藏 → 分组 → 搜索 → 详情 → 新建（3 条联系方式）→ 保存 → 导入 → 查看报告 → 刷新列表 → 收藏视图。
5. 停止录制，视频在 `C:\Users\<用户名>\Videos\Captures\`。
6. 上传到 B 站/腾讯云（设为公开），把链接加到博客 3.9 节末尾，重新发布即可。
7. 也可以直接把 MP4 放进 CSDN 的“视频”功能里插入。

---

## 第 7 步：可选的云部署加分（15 分）

当前博客已明确写“未租云服务器、不申请这 15 分”，这是诚实的。如果临时想补：

1. 买一台最低配的云服务器（华为云/阿里云，2 核 2G 即可），系统选 Ubuntu 22.04/24.04，安全组放行 80 端口。
2. 按 [deploy/README.md](https://github.com/Clancy-lov-sq/832402111_contactbook/blob/main/deploy/README.md) 的 Docker 方式执行，大约 10 分钟。
3. 用公网 IP 打开页面，确认 `http://<公网IP>/api/health` 返回 `"status":"ok"`。
4. 回到博客：
   - 第 1 步的项目表格里加一行“Public demo: `http://<公网IP>`”；
   - 第九节把“未部署”改为已部署，并删掉“不计分”的说明；
   - 重新发布，等待审核。
5. **不要在没部署的情况下写公网地址**，老师会点开验证。

---

## 第 8 步：提交前自检清单

- [ ] GitHub 仓库 Public，Commits 页面 ≥ 3 次（当前 16 次），作者是本人。
- [ ] 仓库首页 README 正常显示，代码规范、API、设计、部署文档都能打开。
- [ ] 博客已发布（不是草稿），审核通过，图片全部正常。
- [ ] 博客包含：项目地址、提交历史截图与提交数、实现思路、程序截图与演示、分工说明（单人项目）、PSP 表。
- [ ] 收藏功能可演示：星标 → 刷新 → 仍在 Favorites。
- [ ] 多联系方式：新建一位联系人，至少 3 条不同类型。
- [ ] 导出：下载的 xlsx 一行一人、一类信息一列（19 列）。
- [ ] 导入：用导出的文件再导入，报告显示 “Updated” 而不是失败。
- [ ] 作业帖已点“提交任务”，并截图保存成功页面。
- [ ] 截止时间：**2026-11-17 23:59**，建议 20:00 前全部完成。

---

## 常见问题

**Q1：`npm ci` 报 `EBADENGINE` 或 `Cannot find module 'node:sqlite'`？**
需要 Node.js ≥ 22.5（本项目在 24.22 上开发）。`node --version` 确认，升级后重新 `npm ci`。

**Q2：`npm start` 报端口占用？**
`Port 8080 is already in use` 时换端口：

```powershell
$env:PORT = "3000"; npm start
```

**Q3：打开页面空白？**
先执行 `npm run build`（生成 `server/public`），再 `npm start`；没有构建产物时 Express 只提供 API。

**Q4：CSDN 提示图片上传失败？**
单张图片别超过 5 MB（本项目截图约 0.4–1 MB，没问题）；网络波动时重试，或先上传到“相册”再插入。

**Q5：博客发布后修改，审核会重新排队吗？**
会。小改一般较快；截止前不要大改，重要修改尽早做。

**Q6：GitHub 推送提示 `rejected (fetch first)`？**
说明远程仓库不是空的（可能建仓时勾了 README）。执行：

```powershell
git pull --rebase origin main
git push -u origin main
```

如果冲突，保留本地版本后 `git rebase --continue`。

**Q7：老师要求中文博客怎么办？**
`git log` 里还保留着中文版的提交历史；本次交付按你的要求改为英文。若临时要中文，可从旧提交 `6daedb1` 取回原中文博客，替换后重新发布。

**Q8：仓库里的 `data/contactbook.db` 为什么没有？**
数据库是运行时数据，已在 `.gitignore` 中排除。老师 clone 后执行 `npm run seed:reset` 即可得到同样的 20 位演示联系人。
