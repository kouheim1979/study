# 同梱シャドーイング教材のライセンス・音声クレジット

## オリジナル教材テキスト

`samples/` に含まれる4本の教材（My Morning Routine / A Weekend in Kyoto / Working from Home / A Short Walk Every Day）の英文、和訳、チャンクの意味、音声変化の解説、単語説明および確認問題は、Shadowing Studio 用に作成したオリジナルです。

テキストを [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ja) で提供します。クレジット表記例: 「Shadowing Studio サンプル教材」。

## お手本音声

50個の単体MP3（文23件、単語27件）およびそれらから合成された8本の教材用MP3は、**Kokoro-82M** のアメリカ英語音声 **af_heart** を用いて生成したAI合成音声です。人間のネイティブ話者の録音ではありません。

- 音声モデル: [hexgrad/Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M)
- モデルライセンス: [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)
- 生成器: `shadowing/generate_shadowing_kokoro.py`
- アプリ統合器: `shadowing-studio/tools/install_kokoro_samples.py`
- 出力仕様: MP3、44.1kHz、モノラル、96kbps

音声モデル自体の重みやソースコードはアプリに含めておらず、生成されたMP3のみ同梱しています。Apache-2.0 ライセンスは商用利用・改変・配布を許可します。モデル再配布時にはライセンスおよび該当する著作権通知の同梱が必要ですが、このリポジトリではモデル自体は再配布していません。

「AI生成音声を使用しています」という明示はモデルのApache-2.0ライセンスだけからは義務付けられません。ただし学習者への透明性のため、本アプリではモデル名を明記しています。

## チャンク位置の精度

文単位の再生と単語単位の区切りは、実際に結合したMP3データから長さを計算しています。一方、文中の意味チャンク（例: get up / at six thirty）はKokoroの**予測トークン継続時間**を用いた概算です。厳密な音響境界として保証しません。

手動または強制アラインメントで正確性を検証した数値が必要な用途では、音声を試聴してチャンク境界を調整してください。音声自体についても、各弱形・連結・脱落音の再現を保証するものではありません。

## 旧音声について

このアプリの初期版は Festival / CMU ARCTIC slt（HTS）で合成した音声を使用していました。現在の配布音声はKokoro版に置き換えられています。旧版生成コード `tools/build_samples.py` は履歴として残しています。
