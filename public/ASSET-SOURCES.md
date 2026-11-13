# 初期バージョンの素材クレジット

このサイトでは、トップページの背景に ReactBits の AeroShards を使用し、WebGPU でリアルタイムに描画しています。作品紹介とプロフィールの画像は、ビジュアルやレイアウトを確認するための第三者による参考素材です。これらの参考素材は、サイト所有者のオリジナル作品として掲載しているものではありません。掲載されているプロジェクト名は、素材の作者がそのプロジェクトに参加したことを示すものではありません。

画像ファイルは `public/media` に保存されており、ページの読み込み時に外部の画像サーバーを利用しません。

| 素材・ライブラリ | 内容・作者 | 出典 | ライセンス |
| --- | --- | --- | --- |
| AeroShards | ReactBits のリアルタイム WebGPU 背景エフェクト | https://reactbits.dev/backgrounds/aero-shards | MIT + Commons Clause |
| vgpu 0.3.1 | AeroShards が使用する描画ライブラリ | 同梱ライブラリ | MIT |
| `hero-aero-fallback.png` | 本プロジェクトの実際の AeroShards キャンバスから書き出した 1920×1080 の静止画。写真ではありません | 本プロジェクトの描画結果 | — |
| `project-01.jpg` | Dramatic mountains under a cloudy, moody sky / Karsten Winegeart：アイスランド・Stokksnes の山々と黒い砂浜 | https://unsplash.com/photos/dramatic-mountains-under-a-cloudy-moody-sky-9DyNN_Yz2yk | Unsplash License |
| `project-02.jpg` | Grayscale photo of concrete building interior / Claudio Schwarz：建物のアトリウムを捉えたモノクロ写真 | https://unsplash.com/photos/grayscale-photo-of-concrete-building-interior-kpHkRQt3FJ8 | Unsplash License |
| `project-03.jpg` | Abstract metallic shapes on black background / Logan Voss：Chromium、Blender 3D による金属の造形 | https://unsplash.com/photos/abstract-metallic-shapes-on-black-background-ekHyx5drm84 | Unsplash License |
| `about.jpg` | A field with a mountain in the background / Yves Cedric Schulze：アイスランド・Stokksnes の霧に包まれた山 | https://unsplash.com/photos/a-field-with-a-mountain-in-the-background-eE0TfEoh4B4 | Unsplash License |

ライセンスの原文：

- ReactBits: [REACT-BITS-LICENSE.txt](/REACT-BITS-LICENSE.txt)
- vgpu: [VGPU-LICENSE.txt](/VGPU-LICENSE.txt)
- Unsplash: https://unsplash.com/license

確認日：2026-11-13。上記の Unsplash 各素材ページには、Free to use under the Unsplash License と明記されています。

トップページの背景は、写真や撮影済みの動画ではなく、ブラウザー上で生成されるリアルタイムの映像表現です。静止画による代替表示には、同じ AeroShards の描画結果を書き出した `hero-aero-fallback.png` を使用しています。

Unsplash の画像は、サーバー側でサイズ調整と JPEG 圧縮を行ったものをダウンロードしています。サイトの CSS でトリミングや色調補正を行う場合があります。
