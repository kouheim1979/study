# Eigo Quest AI Backend

Vercel AI Gatewayを使う「えいごヒマつぶしクエスト」用のAIバックエンドです。

## API

- `GET /api/health`
- `POST /api/transcribe` — 音声→英語テキスト
- `POST /api/evaluate` — 言い換え文の内容・文法判定
- `POST /api/chat` — AI英会話＋短い訂正
- `POST /api/tts` — AI英語音声
- `POST /api/generate-drill` — 苦手に合わせたオリジナル文変換ドリル

## Vercel

1. この `eigo-ai` フォルダをRoot DirectoryにしてVercel Projectを作成します。
2. AI Gatewayを有効にします。Vercel上ではOIDC認証が自動で使われるため、フロントエンドへAPIキーを置きません。
3. GitHub Pages以外のOriginを使う場合だけ、`ALLOWED_ORIGINS` にカンマ区切りで追加します。
4. デプロイ後のURLをアプリの「設定 → AIバックエンドURL」に入力します。

本番バックエンドURL: `https://eigo-quest-ai-kouheim-3013.vercel.app`

AI Gatewayが利用できない環境では、アプリ本体の標準音声・録音・語順タップ・100語クイズは引き続き使えます。

## 1.1.0 音声認識修正

- Vercel AI Gatewayの現行Speech-to-Text要件に合わせ、`ai >= 7.0.31` / `@ai-sdk/gateway >= 4.0.23`へ更新。
- iPhone/Safariの`audio/mp4`や`video/mp4`を正規化。
- `AI_GATEWAY_API_KEY`がある場合はMIME typeを明示してREST転送。
- キーなしのVercel本番ではOIDC経由のAI SDKを使用。
- 発音そのものを採点せず、音声を文字起こしした後に英文の内容・文法を評価します。
