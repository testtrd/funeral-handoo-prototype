import type { CSSProperties } from "react";

export type WordFormBand = {
  label: string;
  topPt: number;
  heightPt: number;
  leftPt?: number;
  note?: string;
};

const ptToMm = (pt: number) => Number((pt * 25.4 / 72).toFixed(2));

// 業務引継書_編集可能フォーム2.docx の図形テキスト位置から拾った帳票ガイドです。
// Wordは通常の表ではなく図形/テキストボックス構成のため、ここでは主要行の上端だけを調整目安として使います。
export const wordFormReferenceBands: WordFormBand[] = [
  { label: "原本・タイトル", topPt: 63.2, heightPt: 26, leftPt: 56.4 },
  { label: "喪主・代表者", topPt: 94.45, heightPt: 91.5, leftPt: 70.8, note: "氏名・住所・自宅/携帯" },
  { label: "故人", topPt: 188.05, heightPt: 90, leftPt: 73.9, note: "氏名・住所・性別・生年月日・死亡日時" },
  { label: "書類等", topPt: 282.4, heightPt: 16, leftPt: 91.95, note: "死亡診断書・検案書・処置" },
  { label: "お迎え先", topPt: 302.4, heightPt: 31, leftPt: 68.25 },
  { label: "搬送先", topPt: 340.05, heightPt: 16, leftPt: 68.05 },
  { label: "宗教者関連", topPt: 355.95, heightPt: 34, leftPt: 66.85 },
  { label: "確認事項 ①", topPt: 394.05, heightPt: 17, leftPt: 92, note: "会員・葬儀規模" },
  { label: "宗教者へ連絡 ②", topPt: 412.85, heightPt: 16, leftPt: 91.95 },
  { label: "枕経等日時 ③", topPt: 430.9, heightPt: 17, leftPt: 92 },
  { label: "通夜 ④", topPt: 450.25, heightPt: 17, leftPt: 92 },
  { label: "葬儀 ⑤", topPt: 468.45, heightPt: 18, leftPt: 92 },
  { label: "火葬場予約 ⑥", topPt: 487.7, heightPt: 29, leftPt: 91.95 },
  { label: "霊柩車 ⑦", topPt: 522.95, heightPt: 16, leftPt: 92 },
  { label: "電話連絡 ⑧", topPt: 542.05, heightPt: 16, leftPt: 91.9 },
  { label: "遺影写真 ⑨", topPt: 559.65, heightPt: 16, leftPt: 92 },
  { label: "使用品・実車距離等 ⑩", topPt: 577.45, heightPt: 28, leftPt: 91.9 },
  { label: "葬儀社連絡先", topPt: 609.05, heightPt: 72, leftPt: 74.4 },
  { label: "個人情報同意欄", topPt: 754.8, heightPt: 28, leftPt: 67.2 },
  { label: "受付・署名欄", topPt: 794, heightPt: 58, leftPt: 75 }
];

export function wordFormBandStyle(band: WordFormBand) {
  return {
    "--word-band-top": `${ptToMm(band.topPt)}mm`,
    "--word-band-height": `${ptToMm(band.heightPt)}mm`,
    "--word-band-left": `${ptToMm(band.leftPt ?? 60)}mm`
  } as CSSProperties;
}
