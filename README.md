# 推免夏令营辅助系统

一个面向推免夏令营信息协作维护的网页系统。首页按“学校 + 学院”平行展示夏令营截止报名时间、专业课、面试复习资料、相关链接、导师数量和意向填报汇总；进入学院后可以查看导师方向、期刊信息，并新增导师或填报意向老师。

## 重要说明

GitHub Pages 只能托管静态页面，不能运行本项目的 Node/Express 后端，也不能把在线填写内容写回 `data.json`。

如果需要“多人公开访问 + 在线新增/编辑/删除 + 数据同步”，推荐流程是：

1. 把本项目上传到 GitHub 公开仓库。
2. 用 Render、Railway、Fly.io、自己的云服务器等 Node 平台从 GitHub 自动部署。
3. 设置 `ADMIN_PASSWORD`，并配置持久化数据目录。

本项目已经包含 `render.yaml`，适合从 GitHub 直接导入 Render 部署。

## 本地运行

```bash
npm install
npm start
```

打开：

```text
http://localhost:3000
```

如果 `3000` 端口已被占用，系统会自动尝试 `3001`、`3002` 等后续端口，并在终端输出实际访问地址。也可以手动指定端口：

```powershell
$env:PORT=3001; npm start
```

## GitHub 上传

在项目目录执行：

```bash
git init
git add .
git commit -m "Initial public recommendation camp helper"
git branch -M main
git remote add origin https://github.com/你的用户名/你的仓库名.git
git push -u origin main
```

如果你使用 GitHub Desktop，也可以直接把这个文件夹作为本地仓库添加，再发布为 public repository。

## 公开部署

### Render

1. 在 GitHub 创建公开仓库并推送本项目。
2. 打开 Render，选择 New Web Service。
3. 连接这个 GitHub 仓库。
4. Render 会读取 `render.yaml`。
5. 设置环境变量：

```text
ADMIN_PASSWORD=你的强密码
```

`render.yaml` 已经把数据目录设置为 `/var/data`，并声明了持久化磁盘。这样线上新增的学院、导师和意向不会因为普通重启丢失。

### 自己的服务器

服务器上安装 Node.js 18 或更高版本，然后：

```bash
npm install
ADMIN_PASSWORD="你的强密码" DATA_DIR="./data" npm start
```

生产环境建议使用 Nginx、Caddy 或宝塔面板反向代理到 Node 服务。

## 管理员权限

页面右上角点击“管理模式”，输入管理员密码后，可以在可视化界面里编辑已有学院和导师信息。默认管理员密码是：

```text
admin123
```

公开部署前必须改掉默认密码：

```powershell
$env:ADMIN_PASSWORD="你的强密码"; npm start
```

管理员登录后可以删除学院、导师和意向填报。删除学院会连带删除该学院下的导师和意向；删除导师会保留同学意向，但把对应导师置为空。

## 数据说明

本地数据默认保存在项目根目录的 `data.json`。线上可以通过 `DATA_DIR` 或 `DATA_FILE` 指定数据保存位置。

正式公开前建议继续增加账号体系、审核流程、修改记录和数据备份。

## 主要功能

- 学校学院总表：夏令营名称、截止报名时间、专业课、复习资料、导师数、意向同学摘要。
- 相关链接：每个学院可以单独维护官网通知或资料链接，页面会显示为可点击按钮。
- 学院详情页：导师姓名、职称、研究方向、最新期刊/代表期刊、介绍和意向同学列表。
- 协作新增：其他同学可以新增学院、补充导师信息、填报意向导师。
- 管理编辑：管理员登录后可以直接编辑或删除已有学院、导师和意向填报。
- 自动汇总：导师下新增的意向会同步回学院总表。
