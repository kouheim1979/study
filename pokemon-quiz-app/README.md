# ポケモン当てクイズ & JSON図鑑

ポケモン情報を `pokemon-data.json` に外出しした、単一HTMLのクイズ・図解図鑑アプリです。

## 構成

```text
index.html                              アプリ本体
pokemon-data.json                       ポケモンデータ
package.json                            npmスクリプト
scripts/build-pokemon-data.mjs           PokéAPIから全件JSONを生成するスクリプト
.github/workflows/build-pokemon-data.yml GitHub ActionsでJSONを再生成するワークフロー
```

## 使い方

GitHub Pagesでは `index.html` と `pokemon-data.json` が同じ階層にあれば動作します。

```text
https://kouheim1979.github.io/pokemon-quiz-app/
```

ローカルで確認する場合は、ブラウザで直接 `index.html` を開くのではなく、簡易サーバーで起動してください。

```bash
npm install
npm run serve
```

または以下でも確認できます。

```bash
python -m http.server 8000
```

## 全ポケモンデータの生成

`pokemon-data.json` はアプリが読むデータファイルです。初期状態では軽量サンプルを入れています。全ポケモン版にする場合は、以下を実行します。

```bash
npm install
npm run build:data
```

実行後、PokéAPIからデータを取得し、`pokemon-data.json` が全件版に置き換わります。

## GitHub Actionsで生成する場合

1. GitHubの `Actions` を開く
2. `Build Pokemon Data JSON` を選ぶ
3. `Run workflow` を押す

成功すると `pokemon-data.json` が全件版として自動コミットされます。

## 注意

- 図解説明は公式図鑑文の転載ではありません。
- PokéAPIの構造化データをもとに、学習向けの独自要約文を生成します。
- 公式画像・公式音声は使用していません。
