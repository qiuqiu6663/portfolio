历史首版设计规范 GATE: OPEN 18 (rounds used up)。当前改动的专项验证见下方最新记录。

# 基础版本检查记录

## 2026-11-14 首页主标题恢复自动扫字

仅首页 PORTFOLIO 的TechHeading启用autoSweep，沿用GSAP入场暂停与完成后双帧重测，鼠标移入仍由原版悬停接管。TechText原始源码未修改；其他标题不新增持续扫字。增强层增加页面可见性与共享save-data预算门控，离屏、后台、reduced及省流量时卸载画布，触屏继续显示DOM字形。

构建与verify-hero-sweep.mjs通过：真实开场期间没有扫字画布，结束后无需指针输入即可观察像素变化；离屏停止绘制、返回恢复、合成后台事件暂停/恢复、reduced/save-data静态字和390触屏回退均正常，无运行错误。本机1.2秒扫字观察窗没有长任务；原版Canvas循环随刷新率运行，不能把GSAP的60Hz上限当作TechText上限。该检查为小范围回归，未重复上一轮全站性能基准。记录：shots/hero-sweep/report.json。

## 2026-11-14 各端性能优化

按用户最新要求扩大到手机、平板与电脑。当前生产包跨端8场景、原电脑动效回归与构建全部通过，省流量分支另行验证；性能预算为0 FAIL / 3个JS解析体积WARN。媒体响应式、GPU限帧与设备预算、离屏停止、布局读取缓存、标题采样、按需分包及滚动写入已优化。完整前后中位数、设备/网络/CPU配置、测试边界、剩余事项与证据见 [PERFORMANCE-REPORT.md](PERFORMANCE-REPORT.md)。原图、旧素材和未用演示均保留在reference-media，不随站点发布。下方“只测电脑”和“上游逐字未改”均为相应历史阶段记录，不适用于本轮运行版GPU调度器补丁。

## 2026-11-14 GSAP 开场与滚动编排（仅电脑端）

安装 `gsap@3.15.1`、`@gsap/react@2.1.2`，由 `src/motion/usePortfolioMotion.js` 统一管理首页 opening、章节标题、卡片错落入场与图片视差。实测 opening 约 3.52 秒：PORTFOLIO 字与细线先进入，遮幕退场，首页主标题通过遮罩、较大位移、纵向压缩与轻微倾斜归位。ABOUT、SELECTED WORK、APPROACH 英文大标题先进入，再展开日文副标题、正文、卡片；联系页编排现有 LET’S CREATE。采用 expo/power 缓动，没有 back、elastic 或 bounce。图片的裁切与视差使用独立 div，玻璃卡片的倾斜与图片悬停继续由原有层负责。

原版 React Bits 源码未修改。TechHeading 在祖先变换期间使用真实 DOM 字形，结束后等待两帧重新测量，恢复悬停实线描边；关闭自动扫字、点击弹跳及拖字。使用每个 matchMedia 分支自己的安全回调，修复筛选时父子 GSAP 上下文循环引用造成的栈溢出。图片起始状态在所属上下文立即设置，减少动态效果 CSS 也强制去除视差变换，避免媒体切换后残留位移。

`node scripts/verify-motion.mjs` 全部通过，使用完整 Chrome 的原生 GPU 路径，仅创建 1126×1015、1440×900、1920×1080 三种电脑窗口。验证实际 transform/clip-path 变化、英文标题先于卡片、逐卡 stagger、图片加载和视差、3→1→3 筛选、原生详情与联系弹窗、背景焦点隔离、Escape 和焦点归还、固定导航及无横向溢出；额外验证滚轮/Tab 快速跳过 opening、初始/运行中减少动态效果及切回完整动效不重播开场。三组均无页面运行异常。当前没有测试手机或平板。

`pnpm build` 通过：页面 JS 496.47 kB（gzip 159.98 kB）、独立 GSAP chunk 123.44 kB（gzip 48.65 kB）、CSS 46.33 kB（gzip 10.83 kB）。动效主要修改 transform 与局部 clip-path，will-change 仅在相关片段活动时启用，不使用长时间页面模糊或锁住滚动。QA 中 rAF 帧间隔中位数和 P95 均约 6.3ms，同时记录了最高 99ms 的长任务；这些是本机含截图和样式采样的观察结果，不是跨设备帧率保证。报告、轨迹与最新截图位于 `shots/motion/`。此前多端和其他设计规范结果为历史记录，未在本轮重跑。

## 2026-11-13 首页标题、姓名与标注底色

按八处浏览器标注将首页动态标题改为 PORTFOLIO，继续使用 TechText；下方静态日文为「ポートフォリオ」，另显示用户给定姓名「チョウ　ケイヨク」。标题组采用统一的 clamp 间距，各内容块无单独上外边距；未以标注截图宽度建立特殊断点。About、Works、Approach 的基础底色为 #000000，Contact 为 #08051C，修改作用于这些模块本身。首页删除 hero-shade 节点及相应深蓝渐变，透明效果的承接底色改为纯黑。AeroShards/Particles 源码与参数保持原样，静态回退重新从实际黑底画布导出。

仅进行电脑端复核：1126×1015、1440×900、1920×1080。主标题为 PORTFOLIO 且实际绘制 Canvas，日文版无 Canvas，姓名字符串包含指定全角空格；五个文字块的相邻间距在每一尺寸完全一致（约 24.8px、31.7px、40px）。确认模块计算底色、无 hero-shade 节点、无横向溢出、文字组位于首屏内，以及无浏览器运行异常。截图：`shots/annotations-*.png`。

## 2026-11-13 AeroShards 首页背景（仅电脑端）

首页城市动态照片由 React Bits AeroShards JS-CSS 替换。`AeroShards.jsx`、`AeroShards.css` 与官方注册表逐字一致，注册表依赖 `vgpu@^0.3.1` 已安装为 0.3.1。使用请求的 shardColor=#3b82f6、accentColor=#0300b9、full placement、glass、plus、1300 碎片、0.7 景深、0.34 暗角、鼠标响应、点击脉冲、长按聚拢与 grain=0。DPR 独立限制约 180 万像素，其他请求参数不变。全站旧颗粒层从首页裁掉，其他区域继续显示；下方四段 Particles 保留。

该原版仅支持 WebGPU。`HeroAero.jsx` 在初始化错误时替换为从实际 AeroShards 画布导出的 1920×1080 静态 PNG；不支持时也不会留下空白。旧城市照片移到 `reference-media/previous-city-hero/`。VGPU 的 Node 原生插件构建脚本在 pnpm 策略中设为 false，浏览器直接使用系统 WebGPU；`pnpm install --frozen-lockfile` 成功。

`pnpm build`、官方源码逐字校验及 `verify-aero.mjs` 全部通过。仅测试电脑端 1440×900、1920×1080。使用完整 Chrome 的真实 NVIDIA Blackwell WebGPU 适配器（无 GPU flags、未使用 SwiftShader）验证 queue.submit、上传数据与实际画面变化；鼠标、点击、长按均到达原组件处理器，导航和联系方式正常，下方四段粒子画布正常，离屏跳过 GPU 绘制，减少动态效果后保持静态。另在两种尺寸强制 requestAdapter 返回 null，验证静态回退、稳定像素、没有持续提交以及前景操作。无页面运行或 GPU validation 错误。截图和报告：`shots/aero/`。默认 Playwright headless shell 在本环境没有 WebGPU 适配器，不能代替完整 Chrome 验证该组件。

## 2026-11-13 React Bits Particles（仅电脑端）

从官方 JS-CSS 注册表获取 Particles，原始 `Particles.jsx`、`Particles.css` 与注册表逐字一致，依赖列表为空。按指定配置为 About、Works、Approach、Contact 四段加入蓝白 450 粒子、鼠标吸引、辉光与闪烁；Hero 城市背景不加入粒子。共用包装器控制视口挂载、离屏释放、减少动态效果静态显示及独立像素密度上限。背景不阻挡内容交互，原版全局指针监听保持不变。

原版卸载逻辑会主动丢弃 WebGL context；实际发现开发 StrictMode effect 重放使新组件画布进入 lost 状态。因此入口改为普通 React root，保留原版组件不变。视口观察器使用 0.001 阈值，避免模块刚好贴屏幕边缘时未创建粒子实例。

`pnpm build` 与 `verify-particles.mjs` 通过。按用户最新要求，本轮仅创建 1440×900、1920×1080 两个电脑端测试上下文，没有检查手机或平板。检查实际 WebGL2 像素、450 instanced quads、GPU 色彩与全部相关参数、文字及按钮上方的吸引指针坐标、筛选、两种弹窗与 Escape、离屏释放、静态模式和横向溢出；未捕获浏览器运行异常。人工查看四段桌面截图，截图及报告在 `shots/particles/`。下方多设备结果均属于此前的历史检查。

## 2026-11-13 城市动态照片与午夜蓝主题

首页改用用户提供的城市海湾照片 `hero-city-source.jpg`（176,757 字节，864×1920），在网页中顺时针旋转 90° 呈现为横向全景。原始照片像素不经生成式改写，WebGL 负责覆盖裁切、36 秒水平运镜、局部云雾漂移和水面折射。循环末 4.5 秒先模糊再叠化到起点；首次出现也用模糊淡入。覆盖全站的单色细颗粒与暗蓝主题、冷蓝玻璃和蓝色能力图示配合，保留原有橙色点缀。旧 MP4 与封面已移入 `reference-media/previous-hero/`。

`verify-ui.mjs` 9 组及 `verify-glass.mjs` 7 项均通过，覆盖源图尺寸、场景时间/实际像素推进、离屏暂停恢复、减少动态效果回退、导航、筛选、弹窗、焦点及 320–1920px 无横向溢出。额外直接绘制 shader 检查镜头与衔接：1 秒到 18 秒的像素平均变化约 15.209/255，35.99 到 36.01 秒约 1.509/255，并人工查看循环模糊帧、桌面卡片与页尾、390px 首页。截图：`shots/city-*.png`。GPU 场景限制约 120 万像素、最多 24 帧/秒，隐藏标签或离屏停止；不支持 WebGL 时使用同一照片静态回退。完整首版审美评分仍是下方历史记录，本轮未重跑。

## 2026-11-13 日语文案与实线文字描边

网站中文内容已全部译为日语，范围包含页面正文、导航、项目分类与详情、弹窗状态、图片 alt、aria 标签、SEO/分享信息以及访客可打开的素材来源说明。HTML 语言设为 `ja`，字体回退改为日文字体。英文展示标题保留。TechHeading 通过官方 `lineStyle="solid"` 参数使用实线字形描边，原始 TechText 源码未修改。

`pnpm build`、更新日语选择器后的 9 组 UI 回归及 TechText 全部专项检查通过。320–1920px 无横向溢出；已查看桌面日语 About/Approach 和 320px 首页/About 截图。额外在真实 Canvas 的 `strokeText` 调用处记录描边：26 次字形绘制均未使用虚线。截图在 `shots/tech-text/japanese-*.png`。

## 2026-11-13 React Bits TechText 标题

从官方 JS-CSS 注册表获取原始 `TechText.jsx` 和 `TechText.css`，逐字校验与注册表一致；注册表无额外依赖。全部 h1/h2/h3 接入共用 `TechHeading`，保留原生标题、真实文案、原有断行、局部衬线字体及颜色，并按响应式字号绘制。使用用户给定的逐字虚线、粒子、600 字重、无 intro、clickKick 和 guides=false 配置。作品按钮里的标题关闭拖动，仍可正常打开详情；旧页尾 liquid-type 效果已移除，避免与 TechText 叠加。

专项浏览器验证覆盖所有标题实际 Canvas 像素、无重影、hover 与点击后的像素变化、320/390/768/828/1440/1920px 排版、项目与联系弹窗、Escape/焦点归还、减少动态效果首次加载及运行中切换。原有 `verify-ui.mjs` 9 组交互回归通过。截图和测量保存在 `shots/tech-text/`。本轮仍以 Chromium 验证，未测真实 Safari；完整首版设计规范评分未重新运行。

## 2026-11-13 首页精简与悬浮导航

按浏览器四处标注删除首页“查看作品”按钮、首页底部整行与手动视频控制，并清理对应状态和样式。背景继续自动播放，离屏暂停；减少动态效果时使用封面。导航改为顶部及两侧留白的玻璃长条，桌面高度 56px、手机高度 52px，滚动固定并为锚点保留偏移。

本轮 `pnpm build` 通过；本地开发预览上的 `verify-glass.mjs` 7 项和更新后的 `verify-ui.mjs` 9 组检查均通过。已查看 828×741 与 390×900 截图，移除项未残留，悬浮导航布局正常。截图：`shots/glass/floating-header-828.png`、`shots/verify-home-390.png`。下方手动暂停/恢复的测试描述属于旧版记录，现已由自动播放、离屏暂停及静态封面检查替代。

## 2026-11-13 玻璃交互迭代

本轮按用户提供的玻璃参考调整：导航固定顶部并带磨砂玻璃；作品卡片有鼠标反光和微幅倾斜；项目详情有五片展开过渡。原背景视频保留。使用原生 DOM/CSS 交互，没有引入 WebGL 或新的运行时依赖。文字与按钮保持真实 DOM。

`pnpm build` 通过。生产构建的 `verify-glass.mjs` 7 项检查及 `verify-ui.mjs` 9 组回归检查全部通过。验证覆盖固定位置与真实 backdrop-filter、导航偏移和当前栏目、悬停后复位、分片动画完成、Escape 与焦点归还、减少动态效果、触摸菜单、320–1920px 无横向溢出，以及无未处理浏览器异常。截图保存在 `shots/glass/`。

以下首版设计规范与性能检查是历史记录，本轮没有重新运行其完整审美评分。用户本轮明确选择玻璃和鼠标倾斜，因此按该偏好实现。

React + Vite 本地作品集。主预览：http://127.0.0.1:5173/。本次交付本地基础版，未公开发布站点。

## 已完成验证

- `pnpm build` 通过，`dist/` 是可独立部署的静态构建。
- 生产构建在 4173 端口上的 9 组交互检查通过（2026-11-13）。
- 视频实际播放、暂停/恢复、减少动态效果设置、图片加载、3→1→3 分类切换、详情 Escape 和焦点归还、移动导航、空邮箱状态均通过。
- 320/390/640/768/1024/1440/1920px 没有文档或详情框横向溢出；1920px 下版心为 1700px。
- 浏览器未捕获未处理异常。使用 Chromium 测试，尚未使用真实手机或 Safari 测试。

## 设计选择与内容

暗黑与冷绿、少量暖橙；Sora 本地字体；视频 Hero；最大 1700px；简短个人介绍；大作品卡片；创作方向卡片；整屏联系页。

按用户需要使用 React 和大作品卡片。没有编造个人姓名、学校身份、软件熟练度、奖项或实际完成项目。未提供姓名和邮箱，联系入口显示待补状态。

Hero 使用 film 方向。抽取的粉色黑底与本次低饱和影像不匹配，改为冷黑、绿色和微量橙色。计数器动效因没有真实统计数字弃用，重新抽取 liquid-type，仅用于收尾大字。无 WebGL 场景。

文案基调：简短、个人视角，聚焦观察、空间和影像；明确区分第三方示意素材和正式作品。没有虚构业务品牌，因此没有品牌名称搜索。

## 性能边界

生产检查约 94KB 压缩 JS（含动效），零 WebGL 上下文，检测布局偏移为 0。本地桌面 LCP 约 124ms，不代表公网加载速度。

完整素材约 8MB，主要是 6.22MiB 的 18 秒 720p 视频；总传输超出设计检查器预算。手机仍加载桌面图片，被标记为过大图片，后续正式发布可增加按屏幕尺寸分发图片和压缩视频。

性能脚本报告了 1 个 `hero.mp4` 请求失败；独立浏览器实测视频 `readyState`、`currentTime` 推进及反复播放/暂停通过。尚未确定性能检查所记录请求的具体失败阶段，不将该项报告为通过。

其他性能 WARN：图片总大小约 1539KB；最大单张约 643KB；封面没有 HTML 宽高属性（外层已固定满屏尺寸）；部分图片尺寸大于展示尺寸。

## 素材与待补内容

素材作者、原始页面和许可记录在 `ASSET-SOURCES.md`。

- Hero：`public/media/hero.mp4` 和 `hero-poster.jpg`，Mixkit 雾谷短片及封面。
- 关于：`public/media/about.jpg`，Unsplash 雾山。
- 项目：`public/media/project-01.jpg`、`project-02.jpg`、`project-03.jpg`，Unsplash 环境、建筑、金属形体。
- 字体：`public/fonts/sora-latin.woff2`；Sora，SIL OFL 许可在同目录。
- 待提供：展示名、正式作品、个人视频、真实邮箱、社交账号、公开域名。没有虚构邮箱或 canonical。

## 自动设计规范检查

未作 waiver。该检查还包含商业页面的固定网格、标题尺寸、分隔线、CTA 和整屏节奏规则。保留当前作品集的排版，同时完整记录开放条目；不将设计规范检查报告为全项通过。

完整原始 PASS/WARN/FAIL 和未执行项保存在 `.taste-skill/gate/consistency/report.json`；18 条合并结果在 `.taste-skill/gate.json`。截图位于 `shots/`，交互检查脚本为 `scripts/verify-ui.mjs`。

以下为本轮原始开放结果：

1. **scroll-reveal** — section#works "02 SELECTED WORK / 精选作品 想象的形状。 关于空间、光影与感"
   starts "color" (0.2 s) the moment it is scrolled into view (an IntersectionObserver) on button.active

2. **cta** — section#approach "从细节，到整个世界。"
   the last section before the footer ends with no button

3. **heading-scale** — div.project-image.frame > div.project-bottom > div > h3 "DISTANT TERRAIN"
   an h3 at 72px, as large as the smallest h2 (57.6px) or larger

4. **off-grid** — section#home > div.hero-content.wrap > div.hero-intro > span:nth-of-type(2) "PERSONAL PORTFOLIO"
   left edge at 83px, 18px off the page margin at 65px (23 elements, like span.hero-japanese)

5. **section-height** — footer#contact "04GET IN TOUCH / 联系方式LET’SCREATE.下一个世界，从"
   the section's content does not fit it: its lowest content ends 875px below its top, past 828px (the section less 72px of bottom padding) (SR-2)

6. **section-air** — section#about > div.wrap > div.interest-links "我感兴趣的方向 FIELDS OF INTEREST01空间与环境02影像与视觉"
   a top border across 100% of the container, between the section's content: sections and their parts are told apart by air and ground, not lines (SR-3)

7. **section-air** — section#works > div.wrap > div.filter-bar "全部作品03空间与环境影像与视觉交互探索03 PROJECTS"
   a bottom border across 100% of the container, between the section's content: sections and their parts are told apart by air and ground, not lines (SR-3)

8. **container-edges** — div#root "跳至主要内容PORTFOLIO.首页HOME关于ABOUT作品WORK探索APP"
   a <div> at the top of the page, outside header.nav, main, footer.closing and nav.actionbar (SR-6)

9. **container-edges** — section#home > div.hero-media
   a child of section 1 beside its .wrap is no valid background layer: not img, picture, video or canvas; z-index -1, not 0 (SR-6)

10. **container-edges** — section#home > div.hero-shade
   a child of section 1 beside its .wrap is no valid background layer: not img, picture, video or canvas; z-index -1, not 0; a hero layer with neither alt nor aria-hidden="true" (and 4 more like it: "PORTFOLIO — VOL. 01", "PERSONAL PORTFOLIOSPACE ", "PERSONAL PORTFOLIOSPACE ") (SR-6)

11. **container-edges** — div.contact-main > div.contact-copy > div > span "关于作品、想法，或一个新的可能。"
   1 text block starts on a left line at x 1138, 1073px from the container's left: text starts on the container's left, or on one split line (x 621, 732, 843) (SR-6)

12. **container-edges** — div.wrap > div.about-grid > div.about-photo.frame > span.about-photo-label "A STUDY OF SPACE & FEELING"
   1 text block starts on a left line at x 759, 694px from the container's left: text starts on the container's left, or on one split line (x 621, 732, 843) (SR-6)

13. **container-edges** — div.about-grid > div.about-copy > div.about-signature > span:nth-of-type(2) "まだ見たことのない景色を。"
   1 text block starts on a left line at x 105, 40px from the container's left: text starts on the container's left, or on one split line (x 621, 732, 843) (and 1 more like it: x 83) (SR-6)

14. **cta** — section#approach "从细节， 到整个世界。"
   the last section before the footer ends with no button

15. **off-grid** — section#about > div.wrap > div.section-label > span:nth-of-type(2) "ABOUT / 关于我"
   left edge at 53px, 5px off a common edge of its section at 58px (3 elements)

16. **edge-left** — #works p "关于空间、光影与感知的探索。当前图像为视觉示意，正式作品持续整理"
   starts at x 1155.2; the lines are 64.8 and the column starts

17. **edge-left** — #approach p "用观察积累灵感，用不同的媒介，把想法逐渐变成作品。"
   starts at x 1137.2; the lines are 64.8 and the column starts

18. **screen-height** — #works section.works-section.section "02SELECTED WORK / 精选作品想象的形状。关于空间"
   1849px, 2.19 screens; a section is exactly one or two (--h), or on a phone at least one that its content fills

## 五尺寸布局复核

额外完成1440×900、1024×768、820×1180、768×1024、390×844检查及截图（shots/layout/）。首页在这五种尺寸均占一屏；PC各段按一屏/两屏布局。开放项仍包括：右侧说明文字没有对齐检查器固定列、768px卡片边界不符合其网格、768px创作视角段不足一屏、390px作品段高于两屏。没有把这些规范结果视为通过，保留给后续设计调整。

