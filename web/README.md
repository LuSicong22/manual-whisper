# Replicate Web App

这是一个基于 Replicate API 的 WhisperX 转写工具 Web 版。

## 本地开发

1. 进入 `web` 目录：
   ```bash
   cd web
   ```

2. 安装依赖：
   ```bash
   npm install
   ```
   
   > 你需要安装 `Vercel CLI` 来本地运行 serverless function: `npm i -g vercel`

3. 设置环境变量：
   创建 `.env.local` 文件，填入你的 Replicate API Token：
   ```
   REPLICATE_API_TOKEN=r8_xxxxxxxxxxxxxxxxxxxx
   # 可选：仅当需要启用访问控制时再设置
   APP_SHARED_KEY=replace-with-a-strong-secret
   # 默认 false（不要求前端输入访问密钥）
   # ENFORCE_APP_SHARED_KEY=true
   # 可选：覆盖默认模型（默认 victor-upmeet/whisperx）
   # REPLICATE_MODEL=victor-upmeet/whisperx
   # 可选：固定模型版本（不填则自动使用 latest_version）
   # REPLICATE_MODEL_VERSION=84d2ad2d...
   # 可选：是否开启说话人分离，默认跟随 HF_TOKEN 是否存在
   # ENABLE_DIARIZATION=true
   # 可选：说话人分离所需 Hugging Face Token
   # HF_TOKEN=hf_xxx
   # 可选：提示词（默认关闭，减少“术语参考”类幻觉）
   # USE_INITIAL_PROMPT=true
   # INITIAL_PROMPT=中文会议语音逐字转写，保持口语原文，不补写无关文本。
   # 可选：术语词表（逗号分隔）
   # DOMAIN_TERMS=微信,支付宝,二维码,收款码,小程序,公众号,NFC,Node ID,UID,UIA,ADNA,APP,H5
   # 可选：术语替换（JSON 或 ; 分隔键值）
   # TERM_REPLACEMENTS_JSON={"文艺标识":"唯一标识","搜码二维码":"收款二维码"}
   # TERM_REPLACEMENTS=文艺标识=唯一标识;搜码二维码=收款二维码
   # 可选：文本清理开关
   # STRIP_PROMPT_LEAK=true
   # STRIP_HALLUCINATION=true
   # DROP_SHORT_NOISE=true
   # MERGE_ADJACENT_SEGMENTS=true
   # MIN_WARN_REMOVED_SPAN_SEC=10
   # MIN_WARN_COVERAGE_RATIO=0.85
   # 可选：自动二次回补
   # ENABLE_SECOND_PASS=true
   # SECOND_PASS_MAX_RANGES=4
   # SECOND_PASS_MIN_RANGE_SEC=1.5
   # SECOND_PASS_RANGE_PAD_SEC=1.2
   # SECOND_PASS_BATCH_SIZE=16
   # SECOND_PASS_TEMPERATURE=0
   # SECOND_PASS_VAD_ONSET=0.60
   # SECOND_PASS_VAD_OFFSET=0.42
   # SECOND_PASS_DIARIZATION=false
   # SECOND_PASS_USE_INITIAL_PROMPT=false
   # 可选：识别参数
   # VAD_ONSET=0.50
   # VAD_OFFSET=0.36
   # TEMPERATURE=0
   # 可选：限制可转写 URL 域名（逗号分隔）
   # 如果开启此项且使用页面直传，请包含 api.replicate.com
   # AUDIO_URL_ALLOWLIST=api.replicate.com,storage.example.com,cdn.example.com
   ```

4. 启动本地服务：
   ```bash
   vercel dev
   ```

5. 打开浏览器访问 `http://localhost:3000`

> 修改 `.env.local` 后请重启 `vercel dev`，否则新配置不会生效。

## 部署到 Vercel

1. 安装 Vercel CLI 并登录：
   ```bash
   vercel login
   ```

2. 部署：
   ```bash
   vercel
   ```

3. 在 Vercel 后台设置环境变量 `REPLICATE_API_TOKEN`、`APP_SHARED_KEY`（可选再配 `AUDIO_URL_ALLOWLIST`）。

## 架构说明

- **Frontend**: 纯静态 HTML/JS (`index.html`, `main.js`)
- **Backend**: Vercel Serverless Function (`api/transcribe.js`)
- **GPU**: Replicate `victor-upmeet/whisperx`
- **Auth**: `x-app-key`（由 `APP_SHARED_KEY` 校验）
  - 默认关闭，仅当 `ENFORCE_APP_SHARED_KEY=true` 时启用
- **Rate Limit**: 每 IP 限流 + 最大并发任务数

### 音频输入方式

当前版本支持页面直传本地音频文件：

1. 前端选择本地音频文件（支持拖拽）
2. 前端上传到本服务 `/api/upload`（后端调用 Replicate Files API）
3. 后端拿到返回 URL 后提交给 Replicate 转写

支持格式：`m4a, mp3, wav, flac, ogg, wma, webm, aac`  
推荐单文件小于 100MB（受 Replicate Files 限制）

### 质量修复（默认开启）

- 自动删除提示词泄漏片段（如“请使用简体中文”）
- 自动删除常见 YouTube 污染片段（如“请不吝点赞 订阅 转发…”）
- 自动清理重复幻觉短句
- 自动合并过碎分段
- 支持术语词表和错词替换配置
- 输出 `quality_report`，标记可疑丢失时间段与覆盖率告警
- 对可疑丢失窗口自动触发 second-pass 回补并合并结果

### 可选风控配置

可通过环境变量调整风控参数：

```
POST_RATE_LIMIT_PER_MIN=6
GET_RATE_LIMIT_PER_MIN=60
MAX_ACTIVE_JOBS_PER_IP=2
```

## 常见报错排查

- `Missing APP_SHARED_KEY`：
  - 仅在 `ENFORCE_APP_SHARED_KEY=true` 时会触发。请在 `web/.env.local` 设置 `APP_SHARED_KEY`，并重启 `vercel dev`。
- `请求过于频繁或账户额度受限` / HTTP `429`：
  - Replicate 限流或账户信用额度不足。等待后重试，或为账户充值提高限额。
- `Replicate 余额不足，请充值后重试` / HTTP `402`：
  - 账户余额不足，充值后重试。
- `模型或版本不存在` / HTTP `404`：
  - 检查 `REPLICATE_MODEL`、`REPLICATE_MODEL_VERSION` 是否有效。
- `模型版本或输入参数无效` / HTTP `422`：
  - 输入参数或模型版本不匹配，优先固定 `REPLICATE_MODEL_VERSION` 并核对模型输入字段。
