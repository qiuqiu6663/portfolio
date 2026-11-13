# 各端性能审查与优化 · 2026-11-14

已完成媒体、WebGL/WebGPU、滚动监听、GSAP 和首屏加载审查，并直接实施优化。保留日文文案、黑色/深紫底色、蓝色碎片与粒子、高级开场、标题遮罩、卡片 stagger 和图片视差。

后续按标注仅恢复首页主标题入场后的自动扫字，并加入后台/省流量增强层暂停。下方数字是恢复扫字前的独立基准留档，未重新作为新增持续绘制后的性能评分；补充简查见QA-REPORT和shots/hero-sweep/report.json。

## 前后对比

同一完整 Chrome、原生主机 GPU、生产包、每种配置各三次冷加载，取中位数。每次禁用缓存。电脑为1440×900/DPR1、CPU1倍、6Mbps/40ms；平板为768×1024/DPR2/触屏、CPU2倍、4Mbps/80ms；手机为390×844/DPR3/触屏、CPU4倍、1.6Mbps/150ms。性能采样独立运行，没有与其他浏览器检查并发。

| 设备模拟 | 首次绘制 FCP：优化前 → 后 | 首屏资源：优化前 → 后 | Hero WebGPU提交/秒：优化前 → 后 |
| --- | --- | --- | --- |
| 电脑 | 640 → 476 ms | 548.4 → 327.2 KB | 160.2 → 53.5 |
| 平板 | 1048 → 808 ms | 548.4 → 388.8 KB | 160.0 → 26.8 |
| 手机 | 2316 → 1832 ms | 548.4 → 359.1 KB | 160.3 → 26.9 |

KB按1000字节计算。首屏资源为开场结束后1秒浏览器Resource Timing的encodedBodySize合计，不含HTML文档；包含浏览器在首屏附近预加载的图片。GPU提交频率衡量背景绘制开销，不代表整页帧率或设备性能评分。三端CLS均为0；观察窗口内长任务超过50ms的部分累计，电脑30→28ms、平板136→122ms、手机474→382ms，此值不是标准Lighthouse TBT。

FCP/LCP候选主要是opening中的文字，完整开场仍约3.5秒。以上不是现场Web Vitals，也不证明真实手机、iOS Safari或Firefox表现；未进行真机和这些浏览器的验收。

## 媒体与首屏

- 当前站点没有video元素或视频请求，旧MP4与城市素材在reference-media，不进入dist。
- 五张展示图原计2,322,845字节；最大尺寸AVIF合计433,668字节（减少81.3%），WebP合计723,706字节。Hero静帧从786,830降到34,946字节（最大AVIF）。所有原图已校验并保存在reference-media/performance-originals。
- AVIF/WebP通过picture、srcset、sizes选择尺寸；完整滚动后的实际图片下载为电脑203,419、平板272,528、手机318,385字节。手机DPR3与平板DPR2选择更高分辨率，因此不与电脑图片下载量直接评判好坏。
- 首屏poster优先加载；正文图片lazy与async解码并具有真实宽高。弹窗切片复用已加载图片的currentSrc，不额外下载旧JPEG或另一规格。
- 首次静态导入的应用+GSAP由约619.9KB raw/208.6KB gzip降为390.5KB raw/132.8KB gzip（gzip减少约36%）。GPU运行库、粒子、TechText分包，先显示静帧和真实文字；粒子靠近视口才下载，触屏不下载TechText。
- 归档未用演示与原始发布图后，整个dist从5,494,357降到3,536,970字节（减少35.6%）。该磁盘总量包含40个响应式规格，访客不会同时下载全部规格。

## WebGL / WebGPU

| 预算 | 碎片 / 粒子数 | 绘制上限 | Hero / 粒子输出像素预算 |
| --- | --- | --- | --- |
| 电脑 | 1300 / 450 | 60fps | 135万 / 100万 |
| 平板 | 850 / 300 | 30fps | 65万 / 50万 |
| 手机 | 600 / 220 | 30fps | 35万 / 30万 |

帧率gate在物理、排序、上传和GPU pass之前；实际频率受显示刷新率量化影响。离屏与隐藏标签时停止该组件自身RAF排队，恢复可见时唤醒。减少动态效果/省流量模式直接用静帧和CSS星点，不下载或创建GPU背景。GPU缺失、初始化失败或模块下载失败时，保留poster与前景交互。Aero每次绘制的CSS布局尺寸读取已改为ResizeObserver缓存。

隔离完整Chrome验证：两组件分别离屏、暂停、reduced与合成hidden事件后的600ms内，新增draw/组件RAF/待处理RAF均为0；恢复后继续绘制。尺寸与DPR变化仍重新分配正确。隐藏事件测试为合成条件，未冒充真实设备切后台测试。浏览器全局仍可有GSAP/ScrollTrigger的轻量调度，不能把单组件停帧描述为整页零RAF。

运行版AeroShards.jsx/Particles.jsx有本地性能补丁，未再声称与上游逐字一致；shader、材质、渲染pass与vendor原始注册表不变。许可保留。

## 滚动与GSAP

- 卡片只在倾斜/回弹期间订阅scroll；中性状态不重复写五个CSS变量。静止滚动的卡片style mutation实测为0。
- 导航滚动仅跨过阈值时更新React状态；指针读写合并到一帧。噪点层缓存Hero高度，每帧最多更新一次，Hero离屏后相同值不再写入。
- TechHeading仅对可见、fine pointer设备测量逐字几何；稳定内容签名避免导航状态重渲染导致重复测量。由整张高DPR画布最多120次回读，改成64×32采样、最多12次退避校验；未成功绘制时保留DOM字形。
- GSAP最多每秒60次更新，保留真实时间时长；ScrollTrigger维持once、batch和scrub，无每个scroll事件都refresh的操作，媒体分支及筛选的上下文会清理。

## 验证与保留事项

- pnpm build通过。
- verify-performance.mjs：三端正常、三端reduced、GPU不可用、单次Aero模块下载失败共8场景通过。覆盖菜单、3→1→3筛选、图片、标题/卡片、弹窗、Escape/焦点、GPU绘制/离屏/恢复，无意外运行/GPU错误、404或原图重复请求。
- 单独省流量模拟通过：poster已加载、0 GPU canvas、0 Aero/Particles/TechText JS请求。
- verify-motion.mjs：1126/1440/1920电脑开场、真实几何变化、标题/卡片顺序、图片视差、跳过、实时reduced切换及交互通过。
- 设计技能perf.mjs：1440/768/390，三次冷加载；0 FAIL、3 WARN。图片、资源、上下文、CLS、缺失资源等通过；保留的WARN是各宽度整页解析JS约597KiB，主要来自保留的实时背景与GSAP依赖。该工具使用CPU/SwiftShader，不能用其计时替代上方原生GPU与触屏/DPR对比。
- 证据：shots/performance/before.json、after.json、budget.json、save-data.json，shots/performance-functional/report.json，以及shots/motion/report.json。可复现媒体生成：node scripts/optimize-media.mjs。
