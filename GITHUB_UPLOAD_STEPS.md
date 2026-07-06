# GitHubアップロード手順

このプロジェクトをGitHubへ初回アップロードするための手順です。

## 重要

`.env.local` にはFirebaseやResendの秘密情報が入っているため、GitHubへアップロードしないでください。

このプロジェクトでは `.gitignore` に以下を含めています。

```gitignore
.env.local
.env*.local
node_modules/
.next/
```

## 初回コミット

プロジェクトフォルダで以下を実行します。

```powershell
cd "C:\Users\user\Documents\Codex\2026-06-25\files-mentioned-by-the-user-codex\work\funeral-handoff-prototype"

git init
git status
git add .
git status
git commit -m "Initial commit"
```

`git status` で `.env.local` が表示されないことを確認してください。

## GitHubリポジトリ作成後

GitHubリポジトリ：

```text
https://github.com/testtrd/funeral-handoo-prototype.git
```

以下を実行します。

```powershell
git branch -M main
git remote add origin https://github.com/testtrd/funeral-handoo-prototype.git
git push -u origin main
```

すでに `origin` がある場合は、以下で差し替えます。

```powershell
git remote set-url origin https://github.com/testtrd/funeral-handoo-prototype.git
git push -u origin main
```
