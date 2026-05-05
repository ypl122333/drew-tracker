# Basketball Team Manager

篮球队训练和比赛管理工具。当前代码已经准备好从本地 FastAPI 版本迁到 Cloudflare：前端部署到 Cloudflare Pages，线上 API 使用 Pages Functions，数据存到 Cloudflare D1，官网 roster 同步由独立 Worker Cron 定时执行。

应用包含四个视图：

- Landing：主菜单，进入训练、比赛或管理页面。
- Practice：记录训练数据，并按照总分或单项数据查看排行榜。
- Game：管理比赛轮换、计时、犯规、出场时间，并支持导出 CSV。
- Admin：同步 Drew 官网 roster，并审核新球员的位置、启用状态和本地图片路径。

## 技术栈

- Frontend：Vue 3、Vite、Tailwind CSS
- Cloudflare API：Pages Functions
- Cloudflare database：D1
- Cloudflare automation：Worker Cron Trigger
- Legacy local backend：FastAPI、SQLite
- Assets：`public/Background.jpg` 和 `public/Photos/`

## 项目结构

```text
.
├── backend/                 # 旧本地 FastAPI + SQLite 后端，仍可参考
├── functions/api/[[path]].js # Cloudflare Pages Functions API 入口
├── migrations/              # D1 schema 和初始 seed 数据
├── public/
│   ├── _routes.json         # 只让 /api/* 命中 Pages Functions
│   ├── Background.jpg
│   ├── icon.png
│   └── Photos/
├── src/
│   ├── App.vue
│   ├── components/
│   │   ├── AdminReviewView.vue
│   │   ├── GameView.vue
│   │   ├── LandingView.vue
│   │   └── PracticeView.vue
│   ├── cloudflare/          # D1 service、API router、roster parser、game logic
│   └── data/
├── tests/cloudflare/        # Node test runner 覆盖 Cloudflare 业务逻辑
├── workers/roster-sync.js   # 独立定时 roster 同步 Worker
├── wrangler.toml            # Pages + D1 配置
└── wrangler.roster-sync.toml # roster sync Worker + cron 配置
```

## 线上架构

前端默认调用同域 API：

```js
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api"
```

Cloudflare Pages 负责托管 `dist/` 静态资源。`functions/api/[[path]].js` 接收 `/api/*` 请求，并通过 `src/cloudflare/api.js` 保持现有接口语义，例如：

- `GET /api/practice`
- `POST /api/practice/{player_id}`
- `GET /api/game`
- `POST /api/game/main-action`
- `POST /api/game/players/{player_id}/toggle`
- `GET /api/admin/roster-review`
- `POST /api/admin/roster-sync`

D1 数据访问集中在 `src/cloudflare/d1.js`。比赛计时仍由后端事实来源推进：读取或修改 game snapshot 时，会根据 `last_started_at` 推进比赛时钟和场上球员出场时间。

## Roster 自动同步

`workers/roster-sync.js` 每周一 10:00 UTC 执行一次，抓取：

```text
https://drewrangers.com/sports/mens-basketball/roster
```

同步策略：

- 新球员插入 `players`，默认 `active = 1`、`needs_review = 1`。
- 官网位置只有 `G/F/C`，会保守映射为 `SG/PF/C`，然后在 Admin 页面确认。
- 官网不再出现的球员不会删除，只标记 `active = 0`、`needs_review = 1`。
- 图片默认不自动下载；保存官网 `image_url`，本地展示仍使用 `img` 字段，例如 `/Photos/Eli.png` 或 `/icon.png`。

## Cloudflare 部署准备

当前 Cloudflare 资源已经建好：

- D1：`drew-tracker`
- D1 `database_id`：`81030d5c-1a75-4e90-9f33-d808066134f3`
- Pages project：`drew-tracker`（已创建，等待首次 Pages 部署）
- Pages preview domain：`drew-tracker.pages.dev`（首次部署后可访问）
- Roster sync Worker：`drew-tracker-roster-sync`
- Worker URL：`https://drew-tracker-roster-sync.hanxiangli666.workers.dev/sync`
- Cron：每周一 10:00 UTC
- `ADMIN_TOKEN`：已作为 Cloudflare secret 配置，不写入仓库

如果换 Cloudflare 账号或重新创建环境，再执行下面步骤。

1. 创建 D1 数据库：

```powershell
npx wrangler d1 create drew-tracker
```

2. 把输出的 `database_id` 填入：

```text
wrangler.toml
wrangler.roster-sync.toml
```

3. 应用 D1 migration：

```powershell
npx wrangler d1 migrations apply drew-tracker --remote
```

4. 设置 Admin token：

```powershell
npx wrangler pages secret put ADMIN_TOKEN --project-name drew-tracker
npx wrangler secret put ADMIN_TOKEN --config wrangler.roster-sync.toml
```

5. 构建并部署 Pages：

```powershell
npm install
npm run build
npx wrangler pages deploy dist --project-name drew-tracker
```

6. 部署 roster sync Worker：

```powershell
npx wrangler deploy --config wrangler.roster-sync.toml
```

买好域名后，在 Cloudflare Pages 项目的 Custom domains 里绑定域名即可。

## 本地开发

普通前端开发：

```powershell
npm install
npm run dev
```

如果要继续使用旧 FastAPI 后端调试，可以显式指定：

```powershell
$env:VITE_API_BASE_URL="http://localhost:8000"
npm run dev
```

旧后端启动：

```powershell
cd backend
.\venv\Scripts\Activate.ps1
uvicorn main:app --reload
```

## 验证

```powershell
npm test
npm run build
```

## 开发注意事项

- 新增训练统计项时，要同步更新前端 `src/data/players.js`、Cloudflare 常量和 D1 migration。
- 新增本地球员照片时，把图片放到 `public/Photos/`，并在 Admin 页面把 `img` 改成对应路径。
- `backend/` 是旧本地实现；线上部署以 `functions/`、`workers/`、`src/cloudflare/` 和 `migrations/` 为准。
