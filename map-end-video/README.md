# 地图的尽头

> 一场跨越五千年的圆桌会议。议题只有一个：**怎样才能画出一张完美的地图？**

一部约 2 分 53 秒的短片。没有素材库，没有剪辑软件，也没有录音：每一帧画面和每一个音符都是代码生成的。

| 时间 | 发言者 | 梗 |
|---|---|---|
| 0:00 | AGI 终端 | 预算 0 元，截止日期：昨天；进度条卡在 99% 是行业传统 |
| 0:26 | 巴比伦泥板匠 | 世界是个圆盘，苦水外面不归我管。精度 ±∞ |
| 0:38 | 裴秀 | 制图六体：有图象而无分率，则无以审远近之差 → 不标比例尺的地图都是耍流氓 |
| 0:52 | 墨卡托 | 用擀面杖把地球擀平；格陵兰膨胀了；拖到赤道后显出真实大小（球面刚体旋转，面积是真的） |
| 1:12 | 约翰·斯诺 | 1854 年霍乱，病例围着宽街水泵堆积，泵把手被拆掉，空间分析由此诞生 |
| 1:26 | 托布勒 | 地理学第一定律，办公室版：离领导工位越近，活儿越多 |
| 1:38 | GPS | 定位精度 3 米，然后 GCJ-02 帮你挪了几百米 |
| 1:50 | AGI | “而我，不缺纸”，开始绘制 1:1 地图，结果画出来的就是地球 |
| 2:22 | 申报书 | 三条创新点写得滴水不漏，评审意见：不予资助（这不就是地球吗？） |
| 2:34 | 尾声 | 地图从来都不是世界本身。暗淡蓝点 |
| 2:46 | 彩蛋 | ArcGIS Pro 已停止工作。您上次保存是在 3 小时前 |

## 怎么做出来的

- `timeline.js`：台词、场景切点和关键节拍。画面和声音共用这一份时间轴，所以打字音效和字幕逐字对齐。
- `film.html` + `film.js`：Canvas 2D 渲染器，`draw(t)` 是 t 的纯函数，可以确定性地逐帧渲染。地理数据来自 Natural Earth（`world-atlas`），投影由 `d3-geo` 完成；等高线用 marching squares 实时计算。
- `audio.js`：纯 JS 合成器（polyBLEP 锯齿波、SVF 滤波、Karplus-Strong 拨弦模拟古筝、Freeverb 混响），用 120 BPM、A 小调写成，最后输出 `soundtrack.wav`。
- `render.js`：用 Playwright 驱动无头 Chromium 逐帧渲染，再通过管道交给 ffmpeg 编码。

## 重新生成

```bash
npm install
# 字体放进 fonts/（Google Fonts）：NotoSerifSC 900、NotoSansSC 400/900、Ma Shan Zheng、
#   ZCOOL KuaiLe、ZCOOL QingKe HuangYou、VT323、Press Start 2P（文件名见 film.html）
node audio.js                        # -> soundtrack.wav
npm run serve &                      # 在 127.0.0.1:8765 提供页面
node render.js stills 12.5,58.2      # 抽查帧 -> stills/
node render.js video 0 173 out/v.mp4 # 渲染画面
ffmpeg -i out/v.mp4 -i soundtrack.wav -af loudnorm=I=-15:TP=-1.5:LRA=14 -c:v copy -c:a aac -b:a 192k -shortest map-end.mp4
```
