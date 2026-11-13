# 个人作品集 · React + Vite

一个以游戏世界、3D 空间和电影感影像为视觉线索的暗色个人作品集基础版本。采用 React + Vite，主要面向 PC 展示，并提供窄屏适配。

## 启动与构建

在项目目录执行：

```powershell
pnpm install
pnpm dev
```

当前本地开发预览地址为 `http://127.0.0.1:5173`，端口为 `5173`；启动后也可查看终端显示的地址。构建生产版本：

```powershell
pnpm build
pnpm preview
```

构建结果位于 `dist/`，可部署到支持静态网站的服务。

当前跨端回归命令为 `node scripts/verify-performance.mjs`，性能采样为 `node scripts/audit-performance.mjs after`，默认目标为生产预览 `http://127.0.0.1:4173`。先运行 `pnpm build` 和 `pnpm preview --port 4173`。脚本依赖 Playwright 与完整 Chrome；其他电脑需安装并调整脚本中的浏览器路径，可用 `PORTFOLIO_URL` 指定网址。旧 `verify-aero.mjs`、`verify-particles.mjs` 包含原图路径/原始源码假设，保留为历史检查，不代表当前验收入口。

## 修改文字与作品

集中编辑 `src/content.js`：

- `profile`：站点名称、首页文字、个人简介和联系信息。
- `profile.displayName`：首页姓名；`heroTitleJapanese` 为主标题下方的静态日文。
- `projects`：项目标题、分类、图片地址、说明、标签及详情段落。
- `strengths`：三个个人关注方向。当前文案不包含未经确认的软件熟练度或项目经历。

初始项目为**视觉方向与版式示意**，不属于作者已完成的原创项目。添加正式作品时，请同时替换图片、说明和详情，准确补充自己的角色、过程与成果。

## 替换图片与首页背景

发布的响应式素材位于 `public/media/optimized/`，原图保存在 `reference-media/performance-originals/`：

| 文件 | 用途 |
| --- | --- |
| `hero-aero-fallback-*.avif / webp` | 从实际 AeroShards 画布导出的静态回退画面 |
| `about-*.avif / webp` | 个人介绍模块的空间灵感图片 |
| `project-01-*.avif / webp` | 第一件作品的预览图 |
| `project-02-*.avif / webp` | 第二件作品的预览图 |
| `project-03-*.avif / webp` | 第三件作品的预览图 |

可以修改组件和 `src/content.js` 中的素材地址。现有原始 `/media/*.jpg` 字符串是 `src/media-manifest.json` 的资源键，组件实际选择优化图，原文件不随站点发布。替换这些资源时更新归档输入，并运行 `node scripts/optimize-media.mjs`（需要 sharp，可用 `pnpm add -D sharp` 安装）重新生成；新增未在 manifest 的路径会作为普通图片加载。当前首页由 `HeroAero.jsx` 接入 AeroShards，旧视频、城市原图与未使用的演示资源保存在 `reference-media/`，不会下载或打包到公开站点。

`AeroShards.jsx` 基于官方 JS-CSS，依赖 `vgpu@0.3.1`；本轮为调度器加入帧率上限、离屏/隐藏标签停帧、首次绘制回调与缓存尺寸，未修改 shader、材质或渲染 pass。保留蓝色玻璃、full、plus、0.7 景深、0.34 暗角、鼠标响应、点击与长按交互及 grain=0。桌面/平板/手机分别使用 1300/850/600 碎片和 60/30/30fps 上限，独立限制画布像素。先显示压缩静帧再异步载入 GPU；失败、减少动态效果或省流量模式保留静帧。未修改的注册表快照保存在 `vendor/react-bits/AeroShards-JS-CSS.json`。

参考素材的来源与使用说明见 `ASSET-SOURCES.md`。更换为自己的作品后，也请维护对应的署名和使用许可。

## 设置联系方式

在 `src/content.js` 中填写真实邮箱：

```js
email: '你的真实邮箱',
```

填写有效邮箱后，联系入口使用 `mailto:` 打开访客的邮件应用。当前邮箱为空，页面不假装发送消息，也不显示虚构的联系地址。基础版没有邮件后端或提交表单服务；如需直接在网页提交留言，后续需要接入真实服务。

## 下一轮调整

提供真实姓名或展示名、作品图片、视频、联系方式，以及参考网站或截图，即可继续调整风格与内容。个人年龄、升学志愿和面试回答不会作为网站正文展示。

## 玻璃质感与交互

导航以扁平悬浮长条固定在顶部，顶部及两侧留白，使用烟色磨砂玻璃、细边反光和轻微鼠标高光。栏目跳转会为导航预留空间。

首页保留标题、简介及动态玻璃碎片背景，已移除“查看作品”按钮、底部信息行和手动播放控制。AeroShards 在离屏或隐藏标签页时跳过 GPU 绘制；系统减少动态效果时，画面停止主体运动与交互。

作品卡片带有鼠标跟随反光及小幅度立体倾斜；打开详情时，图像上的五块切片短暂展开。触摸设备关闭悬停反馈，系统“减少动态效果”同时关闭倾斜和切片动画。首页与介绍、作品、创作视角模块的底色为纯黑，联系收尾为深紫 `#08051C`；导航和卡片保留夜景暗蓝，橙色 `#ed805e` 保留为强调色。

- `src/components/GlassHeader.jsx` 与 `glass-header.css`：固定导航、玻璃透明度、模糊程度和导航高度。
- `src/components/GlassProjectCard.jsx` 与 `glass-project.css`：卡片反光、倾斜幅度及详情展开动画。
- `node scripts/verify-glass.mjs`：检查固定导航、锚点、反光、弹窗焦点、减少动态效果及手机交互。

## 验证记录

最新各端优化结果见 [PERFORMANCE-REPORT.md](PERFORMANCE-REPORT.md)，媒体细节见 [MEDIA-OPTIMIZATION.md](MEDIA-OPTIMIZATION.md)。当前生产包通过手机390×844/DPR3、平板768×1024/DPR2、桌面1440×900/DPR1的交互和GPU回归，以及三端减少动态效果、GPU不可用、背景模块下载失败回退。原有1126/1440/1920电脑动效编排复测也通过。计时采用独立的三次冷加载/设备，属于浏览器模拟，不是真机或现场Web Vitals。历史记录与旧规范开放项保留在 [QA-REPORT.md](QA-REPORT.md)。

## GSAP 页面动效

本轮引入 `gsap@3.15.1` 与 `@gsap/react@2.1.2`。`src/motion/usePortfolioMotion.js` 使用 `useGSAP`、timeline 与 ScrollTrigger 管理编排和清理；`src/portfolio-motion.css` 负责开场遮幕、标题、图片容器及静态布局。

- 首页开场约 3.6 秒：`PORTFOLIO` 大字与细线进入，遮幕退场，再由遮罩、位移与压缩恢复带出首页标题、背景和辅助文字。滚轮或 Tab 可以快速跳过开场。
- 介绍、作品与创作视角模块先呈现英文大标题 `ABOUT`、`SELECTED WORK`、`APPROACH`，再展开日文副标题和正文。英文层使用真实 DOM `h2` 并保留 TechText 悬停实线描边；原日文标题作为 `h3.motion-subtitle`，同样保留该交互。
- 作品与能力卡片依次入场（stagger）。图片的揭示与滚动视差由独立 `div` 层承担，保留图片自身的裁切、玻璃反光及悬停效果。
- 页尾直接编排现有 `LET’S CREATE`，保持一组主要大标题。段落高度随内容扩展。
- 系统开启 `prefers-reduced-motion` 时跳过开场，恢复静态内容，关闭进场与滚动视差。TechText 的祖先容器默认可见，临时裁切由 GSAP 设置并在动画结束后清理。

启动开发服务器后执行 `node scripts/verify-motion.mjs`，进行本轮电脑端动效专项检查。脚本使用完整 Chrome，检查开场与跳过、章节顺序、卡片和图片层、减少动态效果及既有交互，证据输出到 `shots/motion/`；不运行手机或平板验证。

## TechText 标题

首页、英文模块大标题、日文副标题、作品与能力卡片、页尾及弹窗使用 React Bits 的 JS-CSS TechText；GSAP 先编排真实 DOM 文本，再恢复 TechText 悬停交互。官方原始源码保存在 `src/components/TechText.jsx`、`TechText.css`，下载的注册表与许可证在 `vendor/react-bits/`；TechText 组件本身没有额外依赖。

共用适配层 `src/components/TechHeading.jsx` 保留真实标题文本、日文与英文的换行、强调色和响应式字号。首页 PORTFOLIO 通过 `autoSweep` 在 GSAP 入场结束后恢复自动扫字，鼠标进入时让位给悬停交互；其他标题仍只在悬停时反馈。保持600字重、实线描边、15粒子、关闭guides、点击弹跳和拖字。增强层只在可见、页面前台、精细指针且非 reduced/save-data 时挂载；触屏保留GSAP编排的真实文字。`node scripts/verify-hero-sweep.mjs` 做自动变化、入场时序、停帧与恢复的简短检查。旧 `verify-tech-text.mjs` 为历史配置。

网站中文文案已全部改为日语，包括正文、导航、筛选、弹窗、替代文本、无障碍标签、页面元信息和访客可见的素材来源说明。页面语言为 `ja`，使用日文字体回退。

## Particles 背景

首页以外四个模块均接入 Particles；原注册表保存在 `vendor/react-bits/Particles-JS-CSS.json`，没有额外依赖。运行版本只增加帧率/调度/尺寸缓存补丁，shader 与 CSS 保持原样。

`ParticlesBackground.jsx` 保留蓝白、0.08 速度、0.5 辉光、闪烁与吸引等视觉参数；桌面/平板/手机使用 450/300/220 粒子，60/30/30fps 上限。模块接近视口才下载/挂载，离开后释放；减少动态效果和省流量模式用 CSS 静态星点，完全不建 GPU 上下文。背景不拦截文字、筛选及作品按钮。

原组件卸载时主动释放 WebGL context；入口继续使用普通 React root，避免开发 StrictMode 重放造成 context 丢失。本轮按最新请求检查电脑、平板和手机浏览器模拟；旧多端限制已由这次请求更新。

## AeroShards 检查

当前使用 `verify-performance.mjs` 检查背景实际绘制与停止、回退及前景操作，`verify-aero.mjs` 为旧电脑专项记录。必须使用完整 Chrome 的原生 WebGPU；默认 Playwright headless shell 在当前环境没有可用适配器。`pnpm-workspace.yaml` 禁止两个仅供 Node WebGPU 的原生依赖安装脚本，浏览器使用系统 WebGPU。全站噪点只覆盖 Hero 以外区域。

