# 新疆旅游景点介绍视频

约 3 分 26 秒、1080p/30fps 的解说视频。从北到南共介绍 10 个景点：喀纳斯、乌尔禾魔鬼城、赛里木湖、那拉提、独库公路、巴音布鲁克、天山天池、吐鲁番、喀什古城、帕米尔高原。

## 文件

| 文件 | 作用 |
|---|---|
| `script.py` | 解说词、景点标题和经纬度（改文案只改这里） |
| `paint.py` / `scenes.py` | 用程序画出各个场景的风景插画 |
| `build.py` | 配音、背景音乐、字幕、地图和镜头运动，最后用 ffmpeg 编码成视频 |
| `assets/xinjiang_65.json` | 新疆行政区划 GeoJSON（来自 GitHub longwosion/geojson-map-china） |

## 素材来源

- 配音：k2-fsa/sherpa-onnx 的 `matcha-icefall-zh-baker` 中文 TTS 模型，搭配 vocos 声码器，可以离线生成
- 背景音乐：`build.py` 里用程序合成，包括和弦铺底和五声音阶拨弦
- 画面：程序绘制的风景插画，不是实景照片
- 地图：上面提到的 GeoJSON

## 重新生成

```bash
pip install sherpa-onnx soundfile pillow numpy scipy
# 把模型下载到 models/（链接见上面的“素材来源”）
python3 scenes.py                       # 生成 build/scenes/*.png
python3 build.py xinjiang_travel.mp4    # 同时生成 xinjiang_travel.srt
PREVIEW=4,20 python3 build.py           # 只导出几帧预览图
```

想换成实景照片的话，把同名图片（2112×1188，例如 `kanas.png`）放进 `build/scenes/`，然后直接运行 `build.py`。
