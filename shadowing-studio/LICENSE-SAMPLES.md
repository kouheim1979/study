# 同梱サンプル教材のライセンス

`samples/` に含まれる4本の教材

- s01-morning-routine「My Morning Routine」
- s02-kyoto-weekend「A Weekend in Kyoto」
- s03-working-from-home「Working from Home」
- s04-daily-walk「A Short Walk Every Day」

の英文・和訳・チャンクの意味・音声変化の解説・単語説明・確認問題は、Shadowing Studio のために書き下ろしたオリジナルです。
これらのテキストは [クリエイティブ・コモンズ 表示 4.0 国際（CC BY 4.0）](https://creativecommons.org/licenses/by/4.0/deed.ja) で提供します。
クレジット表記例: 「Shadowing Studio サンプル教材」

## 音声

`samples/audio/*.mp3` は、上記の英文を Festival 音声合成システムと CMU ARCTIC「slt」話者の HTS 音声（Debian パッケージ `festvox-us-slt-hts`）で合成したものです。
この音声モデルは、どの目的でも無償で使用・複製・改変・ライセンス付与が認められています（著作権表示と免責の保持、改変箇所の明示、原著者名を削除しないこと、が条件）。
本アプリは音声モデルそのものは改変・同梱しておらず、その出力（合成音声）のみを同梱しています。
以下は Debian パッケージの copyright ファイルからの抜粋です。

```
festvox_us_slt_arctic_hts
Copyright: 2003 Carnegie Mellon University            License: EST-2003
Copyright: 2001-2010 Nagoya Institute of Technology, Department of Computer Science
           2001-2008 Tokyo Institute of Technology    License: BSD-3-clause (feat.list)

License: EST-2003
                       All Rights Reserved.
 Permission to use, copy, modify,  and licence this software and its
 documentation for any purpose, is hereby granted without fee,
 subject to the following conditions:
  1. The code must retain the above copyright notice, this list of
     conditions and the following disclaimer.
  2. Any modifications must be clearly marked as such.
  3. Original authors' names are not deleted.
 THE AUTHORS OF THIS WORK DISCLAIM ALL WARRANTIES WITH REGARD TO
 THIS SOFTWARE, INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
 AND FITNESS, IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY
 SPECIAL, INDIRECT OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN
 AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION,
 ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
 THIS SOFTWARE.
```

生成手順は `tools/build_samples.py` を参照してください。
