"use client";

import { useMemo, useState } from "react";
import { HandoffReportForm } from "@/components/HandoffApp";
import { defaultData } from "@/lib/defaultData";
import {
  externalInquiryQuestion,
  funeralScaleQuestion,
  membershipStatusQuestion,
  unionMemberTypeQuestion
} from "@/lib/master";
import { wordFormBandStyle, wordFormReferenceBands } from "@/lib/wordFormReference";
import type { HandoffData } from "@/types/form";

function sampleSignatureDataUrl() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="420" height="120" viewBox="0 0 420 120">
      <path d="M28 78 C75 28 117 42 96 74 C84 92 125 87 156 61 C183 38 199 41 187 67 C177 89 231 87 259 57 C283 32 304 39 294 67 C286 91 345 91 390 55" fill="none" stroke="#111" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function createPreviewData(): HandoffData {
  const data = structuredClone(defaultData) as HandoffData;
  data.branchId = "head_office";
  data.vendorId = "ja_aichi_toyota_service";
  data.chiefMourner = {
    ...data.chiefMourner,
    role: "喪主",
    name: "山田　太郎",
    kana: "ヤマダ　タロウ",
    address: "愛知県安城市桜町1丁目2番3号",
    homePhone: "0566-77-1111",
    mobilePhone: "090-1234-5678",
    preferredContact: "携帯",
    relationshipToDeceased: "長男"
  };
  data.deceased = {
    ...data.deceased,
    name: "山田　花子",
    kana: "ヤマダ　ハナコ",
    gender: "女",
    birthDate: { era: "showa", year: "20", month: "4", day: "1", iso: "" },
    age: "81",
    deathDate: {
      era: "reiwa",
      year: "8",
      month: "6",
      day: "28",
      period: "午前",
      hour: "3",
      minute: "30",
      timeType: "通常",
      otherText: "",
      iso: null,
      displayText: "令和8年6月28日 午前3時30分"
    },
    addressType: "same_as_mourner",
    address: "",
    relationshipToChief: "母",
    deathCertificate: "有",
    postmortemCertificate: "無",
    treatment: "有",
    pacemaker: "有"
  };
  data.transport = {
    ...data.transport,
    pickupDate: { era: "reiwa", year: "8", month: "6", day: "28", iso: "" },
    pickupTime: "5:30",
    pickupName: "安城更生病院",
    pickupAddress: "愛知県安城市安城町東広畔28",
    destinationType: "ホール",
    destinationPlace: "やすらぎホール高岡"
  };
  data.religion = {
    ...data.religion,
    hasPriest: "有",
    introductionWanted: "希望しない",
    denomination: "浄土真宗",
    priestName: "光明寺",
    priestKana: "コウミョウジ",
    relationship: "菩提寺等",
    isFirstFuneralForFamily: "はい",
    contactStatus: "連絡済み"
  };
  data.vendorQuestions = {
    [funeralScaleQuestion]: "家族葬",
    [membershipStatusQuestion]: "会員",
    [unionMemberTypeQuestion]: "正組合員",
    [externalInquiryQuestion]: "確認済み"
  };
  data.schedule = {
    ...data.schedule,
    pillowSutraDateTime: { month: "6", day: "29", time: "9:00" },
    pillowSutraStatus: "予定",
    wakeStatus: "仮",
    wakeHope: "希望",
    wakeDateTime: { month: "6", day: "29", time: "19:00" },
    wakePlace: "やすらぎホール高岡",
    funeralStatus: "仮",
    funeralHope: "希望",
    funeralDateTime: { month: "6", day: "30", time: "10:00" },
    funeralPlace: "やすらぎホール高岡",
    crematoriumStatus: "未",
    crematoriumName: "古瀬間聖苑",
    departureDateTime: { month: "6", day: "30", time: "11:00" },
    cremationDateTime: { month: "6", day: "30", time: "11:30" },
    cremationReservationStatus: "未",
    reservationNumber: "202606",
    waitingRoom: "第1待合室"
  };
  data.supplies = {
    ...data.supplies,
    hearse: "霊柩車",
    vehicleType: "普通車",
    futon: "使用あり",
    dryIceKg: "10kg",
    pillowDecorationSet: "仏式",
    shikimi: "1束",
    coffinUsage: "手入力",
    coffinDetail: "桐棺",
    mokugyoSetNo: "No.12",
    faceCloth: "使用あり",
    other: "追加使用品の確認用テキスト"
  };
  data.contactAndNotes = {
    ...data.contactAndNotes,
    phoneContact: { month: "", day: "26", time: "10時頃に自宅へお伺い致します" },
    portraitPhoto: "未定",
    funeralCompanyContact: "0120-725-171"
  };
  data.handoffNotes = {
    ...data.handoffNotes,
    selectedItems: ["火葬予約済み", "宗教者へ連絡済み", "お寺様紹介希望"],
    freeText: "自宅前道路が狭いため、搬送車両に注意してください。",
    templeIntroductionWanted: "希望する"
  };
  data.postWork = {
    ...data.postWork,
    transportDistanceKm: "12",
    finishedAt: "2026-06-30T12:15:00+09:00"
  };
  data.relativeConfirmation = {
    confirmed: true,
    confirmedAt: "2026-06-28T06:10:00+09:00",
    signerName: "山田　太郎",
    signatureSource: "privacyConsent",
    signatureDataUrl: sampleSignatureDataUrl()
  };
  return data;
}

export function ReportPreview() {
  const [debugMode, setDebugMode] = useState(true);
  const [showWordGuide, setShowWordGuide] = useState(true);
  const previewData = useMemo(() => createPreviewData(), []);

  return (
    <main className="report-preview-page">
      <header className="report-preview-toolbar no-print">
        <div>
          <p className="eyebrow">帳票調整</p>
          <h1>A4帳票プレビュー</h1>
          <p className="small">仮データを流し込んだ業務引継書です。CSS変数を調整すると、この画面で見たまま反映されます。</p>
        </div>
        <div className="toolbar">
          <label className="debug-toggle">
            <input type="checkbox" checked={debugMode} onChange={(event) => setDebugMode(event.target.checked)} />
            <span>ガイド表示</span>
          </label>
          <label className="debug-toggle">
            <input type="checkbox" checked={showWordGuide} onChange={(event) => setShowWordGuide(event.target.checked)} />
            <span>帳票見本</span>
          </label>
          <button type="button" onClick={() => window.print()}>印刷プレビュー</button>
          <a className="button-link" href="/dashboard">ダッシュボード</a>
        </div>
      </header>
      <section className={showWordGuide ? "report-preview-canvas with-word-guide" : "report-preview-canvas"}>
        <div className="report-preview-sheet">
          <HandoffReportForm formData={previewData} debugMode={debugMode} />
        </div>
        {showWordGuide ? (
          <aside className="word-form-reference" aria-label="業務引継書の帳票見本">
            <div className="word-form-reference-title">
              <strong>202312 最終案</strong>
              <span>実物画像 + 行目安</span>
            </div>
            <div className="word-form-reference-page">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt="202312 業務引継書 最終案"
                className="word-form-reference-image"
                src="/report-template-reference.jpg"
              />
              {wordFormReferenceBands.map((band) => (
                <div className="word-form-band" style={wordFormBandStyle(band)} key={`${band.topPt}-${band.label}`}>
                  <span>{band.label}</span>
                  {band.note ? <small>{band.note}</small> : null}
                </div>
              ))}
            </div>
          </aside>
        ) : null}
      </section>
    </main>
  );
}
