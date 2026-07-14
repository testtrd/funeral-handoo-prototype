"use client";

import { FileDown, RotateCcw } from "lucide-react";
import { PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { SyncStatusBanner } from "@/components/SyncStatusBanner";
import { getCurrentUser, logout } from "@/lib/authService";
import {
  calculateAge,
  formatEraDate,
  formatMonthDayFreeTime,
  formatMonthDayTime,
  normalizeDeathDate,
  normalizeEraDate
} from "@/lib/dates";
import { defaultData } from "@/lib/defaultData";
import { downloadElementAsPdf, sanitizeFileName } from "@/lib/downloadService";
import { familyCopyDeliveryText, isFamilyCopyDeliveryReady } from "@/lib/familyCopyDeliveryService";
import {
  defaultVendorHandoffNoteOptions,
  externalInquiryQuestion,
  funeralScaleQuestion,
  membershipStatusQuestion,
  unionMemberTypeQuestion
} from "@/lib/master";
import { getBranches, getExtraQuestions, getVendorMap, getVendorRule, type ExtraQuestion } from "@/lib/masterDataService";
import { getNetworkStatus, saveHandoffProgress, saveHandoffRecord, type HandoffRecordStatus, type HandoffSyncStatus } from "@/lib/handoffStorage";
import { hasJsonContent, safeJsonParse } from "@/lib/safeJson";
import type { DeathDateValue, EraDateValue, HandoffData, MonthDayTimeValue } from "@/types/form";

const storageKey = "funeral-handoff-draft-v3";
const editingStepKey = "funeral-handoff-edit-step";
const editingRecordIdKey = "funeral-handoff-edit-record-id";
const familyCopySmsMessage = "入力内容の控えを送信しました。内容をご確認ください。";

function cloudSaveStatusText(status: HandoffSyncStatus | "") {
  if (status === "synced") return "クラウド同期済み";
  if (status === "offline_pending") return "クラウド同期待ち";
  if (status === "syncing") return "同期中";
  if (status === "sync_failed") return "同期失敗";
  return "クラウド保存確認中";
}

function familyCopyNotificationStatusText(delivery: HandoffData["familyCopyDelivery"]) {
  const methodLabel = delivery.method === "sms" ? "SMS" : "メール";
  if (delivery.sendStatus === "success") return `${methodLabel}送信済み`;
  if (delivery.sendStatus === "pending") return `${methodLabel}送信待ち`;
  if (delivery.sendStatus === "error") return `${methodLabel}送信失敗`;
  return `${methodLabel}送信未実施`;
}

const steps = [
  "拠点",
  "業者",
  "ドライバー初期入力",
  "注意事項",
  "個人情報同意",
  "喪主・代表者",
  "故人基本情報",
  "宗教者",
  "確認事項",
  "親族入力完了",
  "ドライバー追加入力",
  "火葬予約確認",
  "日程・火葬予約",
  "使用品",
  "親族控え確認"
];

function cloneDefault(): HandoffData {
  return structuredClone(defaultData);
}

function getByPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => (current as Record<string, unknown>)?.[key], obj);
}

function setByPath<T>(obj: T, path: string, value: unknown): T {
  const next = structuredClone(obj);
  const keys = path.split(".");
  let cursor = next as Record<string, unknown>;
  keys.slice(0, -1).forEach((key) => {
    cursor = cursor[key] as Record<string, unknown>;
  });
  cursor[keys[keys.length - 1]] = value;
  return next;
}

function statusForStep(step: number): HandoffRecordStatus {
  return "入力中";
}

function progressPercentForStep(step: number) {
  return Math.min(100, Math.max(0, Math.round(((step + 1) / steps.length) * 100)));
}

function valueAt(data: HandoffData, path: string): string {
  const value = getByPath(data, path);
  return typeof value === "string" ? value : "";
}

let bindData: (path: string, value: unknown) => void = () => undefined;

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label>
        {label}
        {required ? <span className="required">必須</span> : null}
      </label>
      {hint ? <span className="small">{hint}</span> : null}
      {children}
    </div>
  );
}

function TextInput({
  data,
  path,
  label,
  required,
  type = "text",
  placeholder,
  hint,
  readOnly
}: {
  data: HandoffData;
  path: string;
  label: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
  hint?: string;
  readOnly?: boolean;
}) {
  return (
    <Field label={label} required={required} hint={hint}>
      <input
        type={type}
        readOnly={readOnly}
        placeholder={placeholder}
        value={valueAt(data, path)}
        onChange={(event) => bindData(path, event.target.value)}
      />
    </Field>
  );
}

function TextAreaInput({ data, path, label, required, placeholder, hint }: { data: HandoffData; path: string; label: string; required?: boolean; placeholder?: string; hint?: string }) {
  return (
    <Field label={label} required={required} hint={hint}>
      <textarea placeholder={placeholder} value={valueAt(data, path)} onChange={(event) => bindData(path, event.target.value)} />
    </Field>
  );
}

function SignaturePad({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (!value) return;
    const image = new Image();
    image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.src = value;
  }, [value]);

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height
    };
  }

  function start(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const context = canvas.getContext("2d");
    if (!context) return;
    const p = point(event);
    drawingRef.current = true;
    canvas.setPointerCapture(event.pointerId);
    context.beginPath();
    context.moveTo(p.x, p.y);
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const canvas = event.currentTarget;
    const context = canvas.getContext("2d");
    if (!context) return;
    const p = point(event);
    context.lineWidth = 3;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#111";
    context.lineTo(p.x, p.y);
    context.stroke();
  }

  function finish(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const canvas = event.currentTarget;
    canvas.releasePointerCapture(event.pointerId);
    onChange(canvas.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    onChange("");
  }

  return (
    <div className="signature-pad-wrap">
      <canvas
        ref={canvasRef}
        width={960}
        height={220}
        className="signature-pad"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
      />
      <div className="toolbar">
        <button type="button" onClick={clear}>署名を消す</button>
      </div>
    </div>
  );
}

function PrivacyConsentView() {
  return (
    <div className="privacy-consent">
      <div className="privacy-consent-header">
        <p>（引継書添付用）</p>
        <h3>個人情報の取扱いに関する同意書</h3>
        <p>株式会社ハース・ジャパン</p>
      </div>

      <section>
        <h4>1. 個人情報の適切な保護と管理者</h4>
        <p>
          当社は、個人情報の保護管理者を任命し、お預かりした個人情報を適切かつ安全に管理し、
          個人情報の漏えい、滅失又はき損を防止する保護策を講じています。
        </p>
        <p>個人情報の保護管理者：仁井 悦美（052-737-8900）</p>
      </section>

      <section>
        <h4>2. 個人情報の利用目的</h4>
        <p>お預かりした個人情報は、下記の目的に限り利用いたします。</p>
        <ul>
          <li>ご葬儀等の適切な運営のため</li>
          <li>喪主様を始めとした関係者様へのご連絡、ご案内のため</li>
        </ul>
      </section>

      <section>
        <h4>3. 個人情報の第三者提供</h4>
        <p>当社は、お預かりした個人情報をお客様がご依頼されました葬儀社へ提供いたします。</p>
        <ul>
          <li>提供先：葬儀社</li>
          <li>個人情報の項目：故人名、喪主名、ご連絡先、ご住所その他葬儀運営に必要な項目</li>
          <li>提供の目的：葬儀等の適切な運営のため</li>
          <li>提供の方法：書面もしくは電子的方法を用いて提供します。</li>
        </ul>
      </section>

      <section>
        <h4>4. 個人情報の委託</h4>
        <p>
          当社は、利用目的の範囲内で、お預かりした個人情報の全部もしくは一部の取り扱いを
          他の事業者に委託する場合があります。委託する事業者を適切に選定評価し、
          個人情報の取扱いに関する契約を締結しています。
        </p>
      </section>

      <section>
        <h4>5. 個人情報を提供されることの任意性について</h4>
        <p>
          個人情報の提供は、ご自身の判断によります。ただし、提供いただく個人情報は、
          上記利用目的を達成するために不可欠なものです。
        </p>
      </section>

      <section>
        <h4>6. 提供いただいた個人情報に開示等の請求について</h4>
        <p>
          ご自身は、当社に対してご自身の個人情報の開示等の請求をすることができます。
          対象は、利用目的の通知、開示、内容の訂正、追加、削除、利用の停止、
          第三者への提供の停止、消去です。
        </p>
        <p>
          お問い合わせ窓口：〒465-0092 愛知県名古屋市名東区社台3丁目105番地
          株式会社ハース・ジャパン 苦情・相談窓口責任者 TEL：052-737-8900
        </p>
      </section>

      <p className="privacy-consent-confirm">私は、上記の内容を理解したうえで同意します。</p>
    </div>
  );
}

type HelpFaq = {
  question: string;
  answer: string;
};

const helpFaqByStep: Record<number, { title: string; faqs: HelpFaq[] }> = {
  4: {
    title: "個人情報同意のヘルプ",
    faqs: [
      { question: "この同意は何のためですか？", answer: "喪主・代表者情報、故人情報、住所、連絡先などを入力する前に、個人情報の取扱いを確認していただくためのものです。" },
      { question: "同意しない場合はどうなりますか？", answer: "同意いただけない場合、この先の個人情報入力へ進めません。担当ドライバーへお声がけください。" },
      { question: "署名は誰が書きますか？", answer: "内容を確認して同意される方が、枠内にフルネームで署名してください。" }
    ]
  },
  5: {
    title: "喪主・代表者情報のヘルプ",
    faqs: [
      { question: "喪主と代表者の違いは？", answer: "喪主は葬儀の中心となる方、代表者は手続きや連絡の窓口になる方です。迷う場合は担当ドライバーへ確認してください。" },
      { question: "希望連絡先とは？", answer: "今後の流れについて、葬儀社などから連絡を受けたい連絡先です。自宅、携帯、上記以外から選んでください。" },
      { question: "氏名のスペースは必要ですか？", answer: "はい。姓と名の間にスペースを入れてください。例：山田　太郎" }
    ]
  },
  6: {
    title: "故人基本情報のヘルプ",
    faqs: [
      { question: "故人住所が喪主・代表者と同じ場合は？", answer: "「喪主・代表者と同じ」を選択してください。控えや帳票では「同上」と表示されます。" },
      { question: "ペースメーカーが分からない場合は？", answer: "分からない場合は無理に判断せず、担当ドライバーへお声がけください。" },
      { question: "続柄とは？", answer: "喪主から見た故人様との関係です。例：父、母、夫、妻、祖父、長男など。" }
    ]
  },
  7: {
    title: "宗教者関連のヘルプ",
    faqs: [
      { question: "菩提寺とは？", answer: "ご家族がお付き合いしているお寺のことです。分からない場合は「不明」を選んでください。" },
      { question: "紹介希望とは？", answer: "付き合いのある宗教者がいない場合などに、宗教者の紹介を希望するかどうかの確認です。" },
      { question: "宗派が分からない場合は？", answer: "分からない場合は空欄または不明として進め、担当ドライバーへお声がけください。" }
    ]
  },
  8: {
    title: "確認事項のヘルプ",
    faqs: [
      { question: "遺影写真が未定の場合は？", answer: "まだ決まっていない場合は「未定」を選択してください。" },
      { question: "会員・非会員が分からない場合は？", answer: "選択肢に「不明」がある場合は不明を選んでください。判断に迷う場合は担当ドライバーへ確認してください。" },
      { question: "追加質問の意味が分からない場合は？", answer: "無理に判断せず、担当ドライバーへお声がけください。" }
    ]
  },
  9: {
    title: "親族入力完了のヘルプ",
    faqs: [
      { question: "この画面では何をすればいいですか？", answer: "親族様の入力はここで一区切りです。画面の案内に従い、タブレットを担当ドライバーへお渡しください。" },
      { question: "入力内容を直したい場合は？", answer: "戻るボタンで前の画面へ戻って修正できます。分からない場合は担当ドライバーへお声がけください。" }
    ]
  },
  14: {
    title: "親族控え確認のヘルプ",
    faqs: [
      { question: "この画面では何を確認しますか？", answer: "入力内容と、控えの送付先を確認してください。問題なければ確認チェックを入れてください。" },
      { question: "SMSとメールはどちらを選べばいいですか？", answer: "控えを受け取りたい方法を選んでください。SMSは携帯番号、メールはメールアドレスを入力します。" },
      { question: "署名はもう一度必要ですか？", answer: "個人情報同意画面で取得した署名を、内容確認の署名として使用します。" }
    ]
  }
};

function HelpBot({ step }: { step: number }) {
  const content = helpFaqByStep[step];
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setOpen(false);
    setSelectedIndex(0);
  }, [step]);

  if (!content) return null;
  const selected = content.faqs[selectedIndex];

  return (
    <div className="help-bot no-print">
      {open ? (
        <section className="help-bot-panel" aria-label={content.title}>
          <div className="help-bot-header">
            <h3>{content.title}</h3>
            <button type="button" className="ghost" onClick={() => setOpen(false)}>閉じる</button>
          </div>
          <div className="help-bot-body">
            <div className="help-bot-questions">
              {content.faqs.map((faq, index) => (
                <button
                  key={faq.question}
                  type="button"
                  className={index === selectedIndex ? "selected" : ""}
                  onClick={() => setSelectedIndex(index)}
                >
                  {faq.question}
                </button>
              ))}
            </div>
            <div className="help-bot-answer">
              {selected.answer}
            </div>
          </div>
        </section>
      ) : null}
      <button type="button" className="help-bot-button" onClick={() => setOpen((value) => !value)}>お困りですか？</button>
    </div>
  );
}

function SelectInput({ data, path, label, options, required, hint }: { data: HandoffData; path: string; label: string; options: string[]; required?: boolean; hint?: string }) {
  return (
    <Field label={label} required={required} hint={hint}>
      <select value={valueAt(data, path)} onChange={(event) => bindData(path, event.target.value)}>
        <option value="">選択してください</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </Field>
  );
}

function DatalistInput({
  data,
  path,
  label,
  options,
  placeholder,
  hint
}: {
  data: HandoffData;
  path: string;
  label: string;
  options: string[];
  placeholder?: string;
  hint?: string;
}) {
  const current = valueAt(data, path);
  const otherOption = "その他（手入力）";
  const [customOpen, setCustomOpen] = useState(false);
  const isPresetValue = options.includes(current);
  const showCustom = customOpen || Boolean(current && !isPresetValue);
  const selectValue = showCustom ? otherOption : current;

  return (
    <Field label={label} hint={hint}>
      <select
        value={selectValue}
        onChange={(event) => {
          const nextValue = event.target.value;
          if (nextValue === otherOption) {
            setCustomOpen(true);
            bindData(path, "");
            return;
          }
          setCustomOpen(false);
          bindData(path, nextValue);
        }}
      >
        <option value="">{placeholder || "選択してください"}</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
      {showCustom ? (
        <input
          placeholder="木魚リンセット貸出Noを入力してください"
          value={current}
          onChange={(event) => bindData(path, event.target.value)}
        />
      ) : null}
    </Field>
  );
}

function RadioGroup({ data, path, label, options, required, hint }: { data: HandoffData; path: string; label: string; options: string[]; required?: boolean; hint?: string }) {
  const current = valueAt(data, path);
  return (
    <div className="field">
      <div className="label">
        {label}
        {required ? <span className="required">必須</span> : null}
      </div>
      {hint ? <span className="small">{hint}</span> : null}
      <div className="radio-row">
        {options.map((option) => (
          <label key={option}>
            <input type="radio" checked={current === option} onChange={() => bindData(path, option)} name={path} />
            {option}
          </label>
        ))}
      </div>
    </div>
  );
}

function Segmented({ value, options, onChange }: { value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <div className="segment-row">
      {options.map((option) => (
        <button type="button" key={option} className={value === option ? "selected" : ""} onClick={() => onChange(option)}>
          {option}
        </button>
      ))}
    </div>
  );
}

function CompactChoice({
  label,
  value,
  options,
  onChange,
  required,
  hint
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  required?: boolean;
  hint?: string;
}) {
  return (
    <Field label={label} required={required} hint={hint}>
      <Segmented value={value} options={options} onChange={onChange} />
    </Field>
  );
}

function ExtraQuestionField({ data, question }: { data: HandoffData; question: ExtraQuestion }) {
  const path = `vendorQuestions.${question.label}`;
  const current = valueAt(data, path);
  if (question.inputType === "radio") {
    return <CompactChoice label={question.label} value={current} options={question.options} onChange={(value) => bindData(path, value)} required={question.required} hint={question.description} />;
  }
  if (question.inputType === "checkbox") {
    const selected = current ? current.split("、").filter(Boolean) : [];
    return (
      <Field label={question.label} required={question.required} hint={question.description}>
        <div className="radio-row">
          {question.options.map((option) => (
            <label key={option}>
              <input
                type="checkbox"
                checked={selected.includes(option)}
                onChange={() => {
                  const next = selected.includes(option) ? selected.filter((item) => item !== option) : [...selected, option];
                  bindData(path, next.join("、"));
                }}
              />
              {option}
            </label>
          ))}
        </div>
      </Field>
    );
  }
  if (question.inputType === "textarea") {
    return <TextAreaInput data={data} path={path} label={question.label} required={question.required} placeholder={question.description} />;
  }
  return <TextInput data={data} path={path} label={question.label} required={question.required} placeholder={question.description} type={question.inputType === "number" ? "number" : question.inputType === "date" ? "date" : question.inputType === "time" ? "time" : "text"} />;
}

function EraDateInput({ label, value, required, withTime, onChange }: { label: string; value: EraDateValue; required?: boolean; withTime?: boolean; onChange: (value: EraDateValue) => void }) {
  const normalized = value.year || value.month || value.day || value.time ? normalizeEraDate(value, Boolean(withTime && value.time)) : { iso: "" };
  return (
    <div className="field">
      <label>
        {label}
        {required ? <span className="required">必須</span> : null}
      </label>
      <div className={`date-row ${withTime ? "" : "no-time"}`}>
        <select value={value.era} onChange={(event) => onChange({ ...value, era: event.target.value as EraDateValue["era"] })}>
          <option value="taisho">大正</option>
          <option value="showa">昭和</option>
          <option value="heisei">平成</option>
          <option value="reiwa">令和</option>
        </select>
        <input inputMode="numeric" placeholder="年" value={value.year} onChange={(event) => onChange({ ...value, year: event.target.value })} />
        <input inputMode="numeric" placeholder="月" value={value.month} onChange={(event) => onChange({ ...value, month: event.target.value })} />
        <input inputMode="numeric" placeholder="日" value={value.day} onChange={(event) => onChange({ ...value, day: event.target.value })} />
        {withTime ? <input type="time" value={value.time || ""} onChange={(event) => onChange({ ...value, time: event.target.value })} /> : null}
      </div>
      {normalized.error ? <span className="small" style={{ color: "#b42318" }}>{normalized.error}</span> : null}
    </div>
  );
}

function MonthDayTimeInput({
  label,
  value,
  onChange,
  freeTextTime = false,
  hideMonth = false
}: {
  label: string;
  value: MonthDayTimeValue;
  onChange: (value: MonthDayTimeValue) => void;
  freeTextTime?: boolean;
  hideMonth?: boolean;
}) {
  return (
    <Field label={label}>
      <div className={`month-day-row ${hideMonth ? "day-time-only" : ""}`}>
        {hideMonth ? null : <input inputMode="numeric" placeholder="月" value={value.month} onChange={(event) => onChange({ ...value, month: event.target.value })} />}
        <input inputMode="numeric" placeholder="日" value={value.day} onChange={(event) => onChange({ ...value, day: event.target.value })} />
        {freeTextTime ? (
          <input placeholder={hideMonth ? "例: 10時に自宅へお伺い致します" : "例: 10:30、午前10時30分"} value={value.time} onChange={(event) => onChange({ ...value, time: event.target.value })} />
        ) : (
          <input type="time" value={value.time} onChange={(event) => onChange({ ...value, time: event.target.value })} />
        )}
      </div>
    </Field>
  );
}

function DeathDateInput({ value, onChange }: { value: DeathDateValue; onChange: (value: DeathDateValue) => void }) {
  const normalized = normalizeDeathDate(value);
  const showDate = value.timeType !== "不詳" || value.year || value.month || value.day;
  const showClock = value.timeType !== "不詳" && value.timeType !== "その他";
  return (
    <div className="field">
      <label>
        死亡日時<span className="required">必須</span>
      </label>
      {showDate ? (
        <div className="death-date-grid">
            <select value={value.era} onChange={(event) => onChange({ ...value, era: event.target.value as DeathDateValue["era"] })}>
              <option value="">元号</option>
              <option value="taisho">大正</option>
              <option value="showa">昭和</option>
              <option value="heisei">平成</option>
              <option value="reiwa">令和</option>
          </select>
          <input inputMode="numeric" placeholder="年" value={value.year} onChange={(event) => onChange({ ...value, year: event.target.value })} />
          <input inputMode="numeric" placeholder="月" value={value.month} onChange={(event) => onChange({ ...value, month: event.target.value })} />
          <input inputMode="numeric" placeholder="日" value={value.day} onChange={(event) => onChange({ ...value, day: event.target.value })} />
        </div>
      ) : null}
      {showClock ? (
        <>
        <span className="small">補足区分は分の後ろに表示されます。</span>
        <div className="death-time-grid">
          <select value={value.period} onChange={(event) => onChange({ ...value, period: event.target.value as DeathDateValue["period"] })}>
            <option value="">午前/午後</option>
            <option value="午前">午前</option>
            <option value="午後">午後</option>
          </select>
          <input inputMode="numeric" placeholder="時 1-12" value={value.hour} onChange={(event) => onChange({ ...value, hour: event.target.value })} />
          <input inputMode="numeric" placeholder="分" value={value.minute} onChange={(event) => onChange({ ...value, minute: event.target.value })} />
          <select value={value.timeType} onChange={(event) => onChange({ ...value, timeType: event.target.value as DeathDateValue["timeType"] })}>
            <option value="通常">補足区分: -</option>
            <option value="推定">推定</option>
            <option value="頃">頃</option>
            <option value="不詳">不詳</option>
            <option value="その他">その他</option>
          </select>
        </div>
        </>
      ) : (
        <select value={value.timeType} onChange={(event) => onChange({ ...value, timeType: event.target.value as DeathDateValue["timeType"] })}>
          <option value="不詳">不詳</option>
          <option value="その他">その他</option>
          <option value="通常">通常入力に戻す</option>
        </select>
      )}
      {value.timeType === "その他" ? (
        <input placeholder="例: 明け方、夜間、医師確認中" value={value.otherText} onChange={(event) => onChange({ ...value, otherText: event.target.value })} />
      ) : null}
      {normalized.error ? <span className="small" style={{ color: "#b42318" }}>{normalized.error}</span> : null}
      {normalized.value.displayText ? <span className="small">表示: {normalized.value.displayText}</span> : null}
    </div>
  );
}

function requiredMissing(data: HandoffData, path: string): boolean {
  return !String(getByPath(data, path) || "").trim();
}

function deceasedAddressForReport(data: HandoffData, forPdf = false) {
  if (data.deceased.addressType === "same_as_mourner") return forPdf ? "同上" : "喪主・代表者と同じ";
  return data.deceased.address;
}

function getVendorHandoffNoteOptions(data: HandoffData) {
  const vendor = getVendorMap()[data.vendorId];
  return vendor?.vendorHandoffNoteOptions?.length ? vendor.vendorHandoffNoteOptions : defaultVendorHandoffNoteOptions;
}

function shouldShowMorningContactToRepresentative(data: HandoffData) {
  return Boolean(data.chiefMourner.preferredContact && !["自宅", "携帯"].includes(data.chiefMourner.preferredContact));
}

function morningContactText(data: HandoffData) {
  if (data.handoffNotes.morningContactToRepresentative) return "代表者へ連絡";
  if (data.chiefMourner.preferredContact === "自宅") return `${data.chiefMourner.role || "喪主・代表者"}（自宅）`;
  if (data.chiefMourner.preferredContact === "携帯") return `${data.chiefMourner.role || "喪主・代表者"}（携帯）`;
  if (data.chiefMourner.otherContact) return data.chiefMourner.otherContact;
  return data.chiefMourner.preferredContact || "";
}

function phoneContactDisplayText(data: HandoffData) {
  if (data.contactAndNotes.phoneContactEnabled === "無") return "電話連絡なし";
  return formatMonthDayFreeTime(data.contactAndNotes.phoneContact);
}

function templeIntroductionWantedText(data: HandoffData) {
  return data.handoffNotes.templeIntroductionWanted || data.religion.introductionWanted || "";
}

function handoffRemarkLines(data: HandoffData) {
  const templeIntroduction = data.handoffNotes.templeIntroductionWanted;
  return [
    ...data.handoffNotes.selectedItems,
    templeIntroduction === "希望する" ? "お寺様紹介希望：希望する" : "",
    shouldShowMorningContactToRepresentative(data)
      ? `朝の連絡は代表者へ：${data.handoffNotes.morningContactToRepresentative ? "はい" : "いいえ"}`
      : "",
    data.handoffNotes.freeText ? `補足：${data.handoffNotes.freeText}` : ""
  ].filter(Boolean);
}

function StatusChoiceMarks({ value }: { value: string }) {
  return (
    <span className="status-choice-marks" aria-label={`決・仮・未 ${value || "未選択"}`}>
      {["決", "仮", "未"].map((option) => (
        <span key={option} className={value === option ? "circle-selected" : ""}>{option}</span>
      ))}
    </span>
  );
}

function CircleChoiceMarks({ value, options, label }: { value: string; options: string[]; label: string }) {
  return (
    <span className="paper-choice-marks" aria-label={`${label} ${value || "未選択"}`}>
      {options.map((option) => (
        <span key={option} className={value === option ? "circle-selected" : ""}>{option}</span>
      ))}
    </span>
  );
}

function suggestedHandoffNoteItems(data: HandoffData) {
  const suggestions = [
    data.schedule.cremationReservationStatus === "済" ? "火葬予約済み" : "",
    data.religion.contactStatus === "連絡済み" ? "宗教者へ連絡済み" : "",
    data.religion.contactStatus === "連絡未" ? "宗教者へ未連絡" : "",
    data.religion.introductionWanted === "希望する" ? "お寺様紹介希望" : "",
    data.deceased.pacemaker === "有" ? "ペースメーカーあり" : "",
    data.transport.destinationType === "自宅" ? "自宅安置" : "",
    data.transport.destinationType === "ホール" ? "ホール安置" : ""
  ].filter(Boolean);
  return Array.from(new Set(suggestions));
}

function buildValidation(data: HandoffData) {
  const vendor = getVendorMap()[data.vendorId];
  const rule = getVendorRule(data.vendorId);
  const requiredExtraQuestions = getExtraQuestions(data.vendorId).filter((question) => question.required);
  const death = normalizeDeathDate(data.deceased.deathDate);
  const age = calculateAge(data.deceased.birthDate, data.deceased.deathDate);
  const errors: string[] = [];
  if (!data.branchId) errors.push("拠点を選択してください。");
  if (!data.vendorId) errors.push("業者を選択してください。");
  if (!data.transport.pickupDate.iso) errors.push("お迎え日を入力してください。");
  if (!data.transport.pickupTime) errors.push("お迎え時間を入力してください。");
  if (requiredMissing(data, "chiefMourner.role")) errors.push("喪主・代表者の区分を選択してください。");
  if (requiredMissing(data, "chiefMourner.name")) errors.push("喪主・代表者氏名を入力してください。");
  if (requiredMissing(data, "chiefMourner.address")) errors.push("喪主・代表者住所を入力してください。");
  if (rule.requireMournerBirthDate && !data.chiefMourner.birthDate.iso) errors.push("喪主・代表者生年月日を入力してください。");
  if (requiredMissing(data, "deceased.name")) errors.push("故人氏名を入力してください。");
  if (!data.deceased.birthDate.iso) errors.push("故人生年月日を入力してください。");
  if (requiredMissing(data, "deceased.addressType")) errors.push("故人住所の区分を選択してください。");
  if (data.deceased.addressType === "other" && requiredMissing(data, "deceased.address")) errors.push("故人住所を入力してください。");
  if (rule.requirePacemaker && requiredMissing(data, "deceased.pacemaker")) errors.push("ペースメーカーの有無を選択してください。");
  if (requiredMissing(data, "deceased.deathCertificate")) errors.push("死亡診断書の有無を選択してください。");
  if (requiredMissing(data, "deceased.postmortemCertificate")) errors.push("死体検案書の有無を選択してください。");
  if (requiredMissing(data, "deceased.treatment")) errors.push("処置の有無を選択してください。");
  if (death.error || !death.value.displayText) errors.push(death.error || "死亡日時を入力してください。");
  if (age.error) errors.push(age.error);
  if (rule.showExternalInquiryAnswer && !data.vendorQuestions[externalInquiryQuestion]) {
    errors.push("葬儀に関する外部からの問い合わせ回答を選択してください。");
  }
  requiredExtraQuestions.forEach((question) => {
    if (!data.vendorQuestions[question.label]) errors.push(`${question.label}を入力してください。`);
  });
  if (rule.blockCompletionIfCremationNotReserved && data.schedule.cremationReservationStatus !== "済") {
    errors.push(`${vendor?.name || "選択中の業者"}は火葬予約状況が「済」になるまで送信できません。`);
  }
  if (data.privacyConsent.agreed !== true) errors.push("個人情報の取扱いに同意してください。");
  if (!data.privacyConsent.consentDate) errors.push("個人情報同意の日付を入力してください。");
  if (!data.privacyConsent.signatureDataUrl) errors.push("個人情報同意の署名を入力してください。");
  return errors;
}

function updateEraIso(value: EraDateValue, withTime = false): EraDateValue {
  const result = normalizeEraDate(value, false);
  return { ...value, iso: result.error ? "" : result.iso, time: withTime ? value.time || "" : value.time };
}

function migrateDraft(raw: unknown): HandoffData {
  const base = cloneDefault();
  const incoming = raw as Partial<HandoffData> & {
    deceased?: Partial<HandoffData["deceased"]> & { deathDateTime?: EraDateValue; enshrinementInfo?: string };
    transport?: Partial<HandoffData["transport"]> & { enshrinementPlace?: string };
    religion?: Partial<HandoffData["religion"]> & { contactInfo?: string };
    contactAndNotes?: Partial<HandoffData["contactAndNotes"]> & { contactTarget?: string; notes?: string };
    schedule?: Partial<HandoffData["schedule"]> & {
      pillowSutraDateTime?: EraDateValue;
      wakeDateTime?: EraDateValue;
      funeralDateTime?: EraDateValue;
      cremationDateTime?: EraDateValue;
    };
  };
  const merged = {
    ...base,
    ...incoming,
    chiefMourner: { ...base.chiefMourner, ...incoming.chiefMourner },
    deceased: { ...base.deceased, ...incoming.deceased },
    transport: { ...base.transport, ...incoming.transport },
    religion: { ...base.religion, ...incoming.religion },
    schedule: { ...base.schedule, ...incoming.schedule },
    supplies: { ...base.supplies, ...incoming.supplies },
    contactAndNotes: { ...base.contactAndNotes, ...incoming.contactAndNotes },
    handoffNotes: { ...base.handoffNotes, ...incoming.handoffNotes },
    relativeCopy: { ...base.relativeCopy, ...incoming.relativeCopy },
    vendorCopy: { ...base.vendorCopy, ...incoming.vendorCopy },
    internalCopy: { ...base.internalCopy, ...incoming.internalCopy },
    relativeConfirmation: { ...base.relativeConfirmation, ...incoming.relativeConfirmation },
    familyCopyDelivery: { ...base.familyCopyDelivery, ...incoming.familyCopyDelivery },
    privacyConsent: { ...base.privacyConsent, ...incoming.privacyConsent },
    postWork: { ...base.postWork, ...incoming.postWork, savedBy: { ...base.postWork.savedBy, ...incoming.postWork?.savedBy } },
    consent: { ...base.consent, ...incoming.consent }
  } as HandoffData;
  if (!incoming.privacyConsent && incoming.consent) {
    merged.privacyConsent = {
      ...merged.privacyConsent,
      agreed: incoming.consent.agreed === "同意する" ? true : incoming.consent.agreed === "同意しない" ? false : merged.privacyConsent.agreed,
      signatureDataUrl: incoming.consent.signatureDataUrl || merged.privacyConsent.signatureDataUrl
    };
  }
  if ((merged.chiefMourner.preferredContact as string) === "その他") merged.chiefMourner.preferredContact = "上記以外";
  const legacyContact = incoming.contactAndNotes as Partial<HandoffData["contactAndNotes"]> & { phoneContactTime?: string };
  if (!merged.contactAndNotes.phoneContact.time && legacyContact?.phoneContactTime) {
    merged.contactAndNotes.phoneContact = { month: "", day: "", time: legacyContact.phoneContactTime };
  }
  if (!merged.contactAndNotes.phoneContactEnabled) {
    merged.contactAndNotes.phoneContactEnabled = merged.contactAndNotes.phoneContact.day || merged.contactAndNotes.phoneContact.time ? "有" : "";
  }
  if (!merged.handoffNotes.freeText && legacyContact?.vendorHandoffMemo) {
    merged.handoffNotes.freeText = legacyContact.vendorHandoffMemo;
  }
  const legacySupplies = incoming.supplies as Partial<HandoffData["supplies"]> & { coffin?: string };
  if (!merged.supplies.coffinUsage && legacySupplies?.coffin) {
    merged.supplies.coffinUsage = legacySupplies.coffin === "使用なし" ? "使用なし" : "手入力";
    merged.supplies.coffinDetail = legacySupplies.coffin === "使用なし" ? "" : legacySupplies.coffin;
  }
  if (merged.schedule.wakeHope !== "希望") merged.schedule.wakeHope = "";
  if (merged.schedule.funeralHope !== "希望") merged.schedule.funeralHope = "";
  if ((merged.schedule.pillowSutraStatus as string) === "頃") merged.schedule.pillowSutraStatus = "予定";
  if (!merged.schedule.departureDateTime.time && merged.schedule.departureTime) {
    merged.schedule.departureDateTime = { month: "", day: "", time: merged.schedule.departureTime };
  }
  if ((merged.contactAndNotes.portraitPhoto as string) === "使用なし") merged.contactAndNotes.portraitPhoto = "";
  if ((merged.supplies.faceCloth as string) === "○") merged.supplies.faceCloth = "使用あり";
  if ((merged.supplies.faceCloth as string) === "×") merged.supplies.faceCloth = "使用なし";
  if ((merged.supplies.shikimi as string) === "使用あり" || (merged.supplies.shikimi as string) === "×") merged.supplies.shikimi = "";
  if (!merged.postWork.transportDistanceKm && merged.supplies.mileageKm) merged.postWork.transportDistanceKm = merged.supplies.mileageKm;
  if (!merged.postWork.actualMileageKm && merged.postWork.transportDistanceKm) merged.postWork.actualMileageKm = merged.postWork.transportDistanceKm;
  if (!merged.deceased.deathDate && incoming.deceased?.deathDateTime) {
    const old = incoming.deceased.deathDateTime;
    merged.deceased.deathDate = {
      ...base.deceased.deathDate,
      era: old.era,
      year: old.year,
      month: old.month,
      day: old.day,
      iso: old.iso ? old.iso : null,
      displayText: formatEraDate(old)
    };
  }
  return merged;
}

export default function HandoffApp() {
  const [data, setData] = useState<HandoffData>(cloneDefault);
  const [step, setStep] = useState(0);
  const [printReport, setPrintReport] = useState<"vendor" | "internal">("vendor");
  const [hasStoredDraft, setHasStoredDraft] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [persistDraft, setPersistDraft] = useState(false);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [sendingFamilyCopy, setSendingFamilyCopy] = useState(false);
  const [familyCopySyncStatus, setFamilyCopySyncStatus] = useState<HandoffSyncStatus | "">("");
  const relativePdfRef = useRef<HTMLDivElement>(null);
  const vendorPdfRef = useRef<HTMLDivElement>(null);
  const internalPdfRef = useRef<HTMLDivElement>(null);
  const currentUser = getCurrentUser();

  bindData = (path: string, value: unknown) => {
    setPersistDraft(true);
    setData((current) => setByPath(current, path, value));
  };

  useEffect(() => {
    const raw =
      window.localStorage.getItem(storageKey) ||
      window.localStorage.getItem("funeral-handoff-draft-v2") ||
      window.localStorage.getItem("funeral-handoff-draft-v1");
    const editingStep = Number(window.localStorage.getItem(editingStepKey));
    const editingRecordId = window.localStorage.getItem(editingRecordIdKey);
    if (editingRecordId && hasJsonContent(raw)) {
      try {
        const parsedDraft = safeJsonParse<unknown>(raw, {
          fallback: null,
          label: "HandoffApp initial editing draft localStorage"
        });
        if (!parsedDraft) throw new Error("empty draft");
        setData(migrateDraft(parsedDraft));
        setPersistDraft(true);
        setHasStoredDraft(false);
      } catch {
        setHasStoredDraft(true);
      }
    } else if (hasJsonContent(raw)) {
      setHasStoredDraft(true);
    } else {
      setPersistDraft(true);
    }
    if (editingRecordId) {
      setRecordId(editingRecordId);
      window.localStorage.removeItem(editingRecordIdKey);
    }
    if (Number.isInteger(editingStep) && editingStep >= 0 && editingStep < steps.length) {
      setStep(editingStep);
      window.localStorage.removeItem(editingStepKey);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded || !persistDraft) return;
    window.localStorage.setItem(storageKey, JSON.stringify(data));
  }, [data, loaded, persistDraft]);

  useEffect(() => {
    setData((current) => {
      const normalizedDeath = normalizeDeathDate(current.deceased.deathDate).value;
      const calculatedAge = calculateAge(current.deceased.birthDate, normalizedDeath).age;
      if (
        normalizedDeath.iso === current.deceased.deathDate.iso &&
        normalizedDeath.displayText === current.deceased.deathDate.displayText &&
        calculatedAge === current.deceased.age
      ) {
        return current;
      }
      return { ...current, deceased: { ...current.deceased, deathDate: normalizedDeath, age: calculatedAge } };
    });
  }, [data.deceased.birthDate, data.deceased.deathDate]);

  useEffect(() => {
    const funeralCompanyContact = getVendorMap()[data.vendorId]?.funeralCompanyContact || "";
    setData((current) => current.contactAndNotes.funeralCompanyContact === funeralCompanyContact
      ? current
      : { ...current, contactAndNotes: { ...current.contactAndNotes, funeralCompanyContact } });
  }, [data.vendorId]);

  useEffect(() => {
    if (data.familyCopyDelivery.method !== "sms" || data.familyCopyDelivery.smsPhoneNumber || !data.chiefMourner.mobilePhone) return;
    setData((current) => ({
      ...current,
      familyCopyDelivery: {
        ...current.familyCopyDelivery,
        smsPhoneNumber: current.chiefMourner.mobilePhone
      }
    }));
  }, [data.familyCopyDelivery.method, data.familyCopyDelivery.smsPhoneNumber, data.chiefMourner.mobilePhone]);

  useEffect(() => {
    setData((current) => {
      const shouldClearPriest = current.religion.introductionWanted === "希望する" || current.religion.hasPriest === "無";
      const shouldClearRelationship = current.religion.hasPriest === "無";
      const shouldClearNoDenomination = current.religion.introductionWanted !== "希望する" && current.religion.denomination === "宗派指定なし";
      const currentRelationship = current.religion.relationship as string;
      if (
        (!shouldClearPriest || (!current.religion.priestName && !current.religion.priestKana)) &&
        (!shouldClearRelationship || (!current.religion.relationship && !current.religion.contactStatus)) &&
        !shouldClearNoDenomination &&
        currentRelationship !== "新家"
      ) {
        return current;
      }
      return {
        ...current,
        religion: {
          ...current.religion,
          priestName: shouldClearPriest ? "" : current.religion.priestName,
          priestKana: shouldClearPriest ? "" : current.religion.priestKana,
          denomination: shouldClearNoDenomination ? "" : current.religion.denomination,
          relationship: shouldClearRelationship || currentRelationship === "新家" ? "" : current.religion.relationship,
          isFirstFuneralForFamily: currentRelationship === "新家" && !current.religion.isFirstFuneralForFamily ? "はい" : current.religion.isFirstFuneralForFamily,
          contactStatus: shouldClearRelationship ? "" : current.religion.contactStatus
        }
      };
    });
  }, [data.religion.hasPriest, data.religion.introductionWanted]);

  const branchList = getBranches();
  const vendorMap = getVendorMap();
  const branch = branchList.find((item) => item.id === data.branchId);
  const vendor = vendorMap[data.vendorId];
  const vendorRule = getVendorRule(data.vendorId);
  const extraQuestions = getExtraQuestions(data.vendorId).filter((question) => ![
    externalInquiryQuestion,
    funeralScaleQuestion,
    membershipStatusQuestion,
    unionMemberTypeQuestion
  ].includes(question.label));
  const availableVendors = branch ? branch.vendorIds.map((id) => vendorMap[id]).filter(Boolean) : [];
  const errors = useMemo(() => buildValidation(data), [data]);
  const familyCopyDeliveryReady = isFamilyCopyDeliveryReady(data.familyCopyDelivery);

  function update(path: string, value: unknown) {
    setPersistDraft(true);
    setData((current) => setByPath(current, path, value));
  }

  function updatePrivacyAgreement(agreed: boolean) {
    setPersistDraft(true);
    setData((current) => ({
      ...current,
      privacyConsent: {
        ...current.privacyConsent,
        agreed,
        agreedAt: agreed ? new Date().toISOString() : ""
      }
    }));
  }

  function resetRelativeConfirmationState(current: HandoffData): HandoffData {
    return {
      ...current,
      relativeConfirmation: {
        ...current.relativeConfirmation,
        confirmed: false,
        confirmedAt: "",
        signatureSource: "",
        signatureDataUrl: ""
      },
      familyCopyDelivery: {
        ...current.familyCopyDelivery,
        confirmed: false,
        sentAt: "",
        sendStatus: "",
        sendError: "",
        messageTemplate: "",
        mockSent: false,
        emailSentAt: "",
        emailSendStatus: "",
        emailSendError: "",
        smsSentAt: "",
        smsSendStatus: "",
        smsSendError: ""
      },
      relativeCopy: { ...current.relativeCopy, generated: false, generatedAt: "", sent: false, sentAt: "", fileName: "" }
    };
  }

  function updateFamilyCopyDeliveryMethod(methodLabel: string) {
    const method = methodLabel === "SMSで受け取る" ? "sms" : methodLabel === "メールで受け取る" ? "email" : "none";
    setPersistDraft(true);
    setData((current) => {
      const reset = resetRelativeConfirmationState(current);
      return {
        ...reset,
        familyCopyDelivery: {
          ...reset.familyCopyDelivery,
          method,
          smsPhoneNumber: method === "sms" && !reset.familyCopyDelivery.smsPhoneNumber ? reset.chiefMourner.mobilePhone : reset.familyCopyDelivery.smsPhoneNumber
        }
      };
    });
  }

  function updateFamilyCopyDeliveryField(field: "smsPhoneNumber" | "email", value: string) {
    setPersistDraft(true);
    setData((current) => {
      const reset = resetRelativeConfirmationState(current);
      return {
        ...reset,
        familyCopyDelivery: {
          ...reset.familyCopyDelivery,
          [field]: value
        }
      };
    });
  }

function persistFamilyCopyData(nextData: HandoffData, idOverride?: string | null, status: HandoffRecordStatus = "現場入力完了") {
    const record = saveHandoffRecord(nextData, {
      id: idOverride || recordId || undefined,
      status,
      pdfGenerated: nextData.relativeCopy.generated,
      currentStep: step,
      currentStepName: steps[step] || ""
    });
    setRecordId(record.id);
    setFamilyCopySyncStatus(record.syncStatus);
    return record;
  }

  function defaultFamilyCopyMessage(sourceData: HandoffData) {
    if (sourceData.familyCopyDelivery.method === "sms") {
      return "入力内容の控えを送信しました。内容をご確認ください。";
    }
    return buildFamilyCopyEmailText(sourceData);
  }

  function familyCopyMessageTemplate(sourceData: HandoffData) {
    return sourceData.familyCopyDelivery.messageTemplate?.trim()
      ? sourceData.familyCopyDelivery.messageTemplate
      : defaultFamilyCopyMessage(sourceData);
  }

  function buildFamilyCopyConfirmedData(sourceData: HandoffData, now: string): HandoffData {
    return {
      ...sourceData,
      relativeConfirmation: {
        confirmed: true,
        confirmedAt: sourceData.relativeConfirmation.confirmedAt || now,
        signerName: sourceData.relativeConfirmation.signerName || sourceData.chiefMourner.name,
        signatureSource: "privacyConsent",
        signatureDataUrl: sourceData.relativeConfirmation.signatureDataUrl || sourceData.privacyConsent.signatureDataUrl
      },
      familyCopyDelivery: {
        ...sourceData.familyCopyDelivery,
        confirmed: true,
        sentAt: "",
        sendStatus: "",
        sendError: "",
        messageTemplate: familyCopyMessageTemplate(sourceData),
        mockSent: false
      },
      relativeCopy: {
        ...sourceData.relativeCopy,
        sent: false,
        sentAt: ""
      }
    };
  }

  function updateSendConfirmationMethod(methodLabel: string) {
    const method: HandoffData["familyCopyDelivery"]["method"] = methodLabel === "SMSで受け取る" ? "sms" : methodLabel === "メールで受け取る" ? "email" : "none";
    setPersistDraft(true);
    setData((current) => {
      const next: HandoffData = {
        ...current,
        familyCopyDelivery: {
          ...current.familyCopyDelivery,
          method,
          smsPhoneNumber: method === "sms" && !current.familyCopyDelivery.smsPhoneNumber ? current.chiefMourner.mobilePhone : current.familyCopyDelivery.smsPhoneNumber,
          sendStatus: "",
          sendError: "",
          messageTemplate: ""
        }
      };
      return {
        ...next,
        familyCopyDelivery: {
          ...next.familyCopyDelivery,
          messageTemplate: defaultFamilyCopyMessage(next)
        }
      };
    });
  }

  function updateSendConfirmationDestination(field: "smsPhoneNumber" | "email", value: string) {
    setPersistDraft(true);
    setData((current) => ({
      ...current,
      familyCopyDelivery: {
        ...current.familyCopyDelivery,
        [field]: value,
        sendStatus: "",
        sendError: ""
      }
    }));
  }

  function updateFamilyCopyMessageTemplate(value: string) {
    setPersistDraft(true);
    setData((current) => ({
      ...current,
      familyCopyDelivery: {
        ...current.familyCopyDelivery,
        messageTemplate: value,
        sendStatus: "",
        sendError: ""
      }
    }));
  }

  function buildFamilyCopyPendingData(sourceData: HandoffData, now: string): HandoffData {
    const isSms = sourceData.familyCopyDelivery.method === "sms";
    return {
      ...sourceData,
      relativeConfirmation: {
        confirmed: true,
        confirmedAt: sourceData.relativeConfirmation.confirmedAt || now,
        signerName: sourceData.relativeConfirmation.signerName || sourceData.chiefMourner.name,
        signatureSource: "privacyConsent",
        signatureDataUrl: sourceData.relativeConfirmation.signatureDataUrl || sourceData.privacyConsent.signatureDataUrl
      },
      familyCopyDelivery: {
        ...sourceData.familyCopyDelivery,
        confirmed: true,
        sentAt: "",
        sendStatus: "pending",
        sendError: getNetworkStatus() === "offline" ? "通信復旧後に送信します。" : "",
        emailSendStatus: isSms ? sourceData.familyCopyDelivery.emailSendStatus : "pending",
        emailSendError: isSms ? sourceData.familyCopyDelivery.emailSendError : "",
        smsSendStatus: isSms ? "pending" : sourceData.familyCopyDelivery.smsSendStatus,
        smsSendError: isSms ? "" : sourceData.familyCopyDelivery.smsSendError
      },
      relativeCopy: {
        ...sourceData.relativeCopy,
        sent: false,
        sentAt: ""
      }
    };
  }

  async function sendFamilyCopyNotification(sourceData: HandoffData) {
    const isSms = sourceData.familyCopyDelivery.method === "sms";
    const response = await fetch(isSms ? "/api/send-family-copy-sms" : "/api/send-family-copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isSms
        ? {
            to: sourceData.familyCopyDelivery.smsPhoneNumber,
            message: familyCopyMessageTemplate(sourceData) || familyCopySmsMessage
          }
        : {
            to: sourceData.familyCopyDelivery.email,
            text: familyCopyMessageTemplate(sourceData)
          })
    });
    const result = await response.json().catch(() => ({})) as { ok?: boolean; message?: string };
    if (!response.ok || result.ok === false) {
      throw new Error(result.message || `${isSms ? "SMS" : "親族控えメール"}の送信に失敗しました。`);
    }
    const sentAt = new Date().toISOString();
    return {
      ...sourceData,
      familyCopyDelivery: {
        ...sourceData.familyCopyDelivery,
        confirmed: true,
        sentAt,
        sendStatus: "success",
        sendError: "",
        emailSentAt: isSms ? sourceData.familyCopyDelivery.emailSentAt : sentAt,
        emailSendStatus: isSms ? sourceData.familyCopyDelivery.emailSendStatus : "success",
        emailSendError: isSms ? sourceData.familyCopyDelivery.emailSendError : "",
        smsSentAt: isSms ? sentAt : sourceData.familyCopyDelivery.smsSentAt,
        smsSendStatus: isSms ? "success" : sourceData.familyCopyDelivery.smsSendStatus,
        smsSendError: isSms ? "" : sourceData.familyCopyDelivery.smsSendError
      },
      relativeCopy: {
        ...sourceData.relativeCopy,
        sent: true,
        sentAt
      }
    } satisfies HandoffData;
  }

  function buildFamilyCopyErrorData(sourceData: HandoffData, error: unknown) {
    const isSms = sourceData.familyCopyDelivery.method === "sms";
    const message = error instanceof Error ? error.message : `${isSms ? "SMS" : "親族控えメール"}の送信に失敗しました。`;
    return {
      ...sourceData,
      familyCopyDelivery: {
        ...sourceData.familyCopyDelivery,
        sendStatus: "error",
        sendError: `${isSms ? "SMS" : "メール"}送信エラー: ${message}`,
        emailSendStatus: isSms ? sourceData.familyCopyDelivery.emailSendStatus : "error",
        emailSendError: isSms ? sourceData.familyCopyDelivery.emailSendError : message,
        smsSendStatus: isSms ? "error" : sourceData.familyCopyDelivery.smsSendStatus,
        smsSendError: isSms ? message : sourceData.familyCopyDelivery.smsSendError
      }
    } satisfies HandoffData;
  }

  async function sendPendingFamilyCopy(sourceData: HandoffData, idOverride?: string | null) {
    if (getNetworkStatus() === "offline") {
      const pendingData = buildFamilyCopyPendingData(sourceData, new Date().toISOString());
      persistFamilyCopyData(pendingData, idOverride);
      setData(pendingData);
      return;
    }

    try {
      const sentData = await sendFamilyCopyNotification(sourceData);
      const record = persistFamilyCopyData(sentData, idOverride, "送信済み");
      setData(sentData);
      setFamilyCopySyncStatus(record.syncStatus);
    } catch (error) {
      const failedData = buildFamilyCopyErrorData(sourceData, error);
      const record = persistFamilyCopyData(failedData, idOverride);
      setData(failedData);
      setFamilyCopySyncStatus(record.syncStatus);
    }
  }

  async function confirmAndSendFamilyCopy() {
    if (!isFamilyCopyDeliveryReady(data.familyCopyDelivery)) {
      alert("控えの送付方法と送付先を確認してから選択してください。");
      return;
    }

    setPersistDraft(true);
    const now = new Date().toISOString();
    const confirmedData = buildFamilyCopyConfirmedData(data, now);
    const record = persistFamilyCopyData(confirmedData);
    setData(confirmedData);
    setFamilyCopySyncStatus(record.syncStatus);
  }

  async function sendConfirmedFamilyCopy() {
    if (!isFamilyCopyDeliveryReady(data.familyCopyDelivery)) {
      alert("控えの送付方法と送付先を確認してください。");
      return;
    }
    setSendingFamilyCopy(true);
    setPersistDraft(true);
    try {
      const now = new Date().toISOString();
      const pendingData: HandoffData = {
        ...data,
        relativeConfirmation: {
          ...data.relativeConfirmation,
          confirmed: true,
          confirmedAt: data.relativeConfirmation.confirmedAt || now
        },
        familyCopyDelivery: {
          ...data.familyCopyDelivery,
          confirmed: true,
          messageTemplate: familyCopyMessageTemplate(data),
          mockSent: false
        },
        relativeCopy: {
          ...data.relativeCopy,
          sent: false,
          sentAt: ""
        }
      };
      const pendingRecord = persistFamilyCopyData(buildFamilyCopyPendingData(pendingData, now), undefined, "現場入力完了");
      setData(buildFamilyCopyPendingData(pendingData, now));
      await sendPendingFamilyCopy(pendingData, pendingRecord.id);
    } finally {
      setSendingFamilyCopy(false);
    }
  }

  async function retryFamilyCopyNotification(sourceData = data) {
    if (!isFamilyCopyDeliveryReady(sourceData.familyCopyDelivery)) {
      alert("控えの送付方法と送付先を確認してください。");
      return;
    }
    setSendingFamilyCopy(true);
    try {
      const pendingData = buildFamilyCopyPendingData(sourceData, new Date().toISOString());
      const record = persistFamilyCopyData(pendingData);
      setData(pendingData);
      await sendPendingFamilyCopy(pendingData, record.id);
    } finally {
      setSendingFamilyCopy(false);
    }
  }

  function toggleHandoffNoteItem(item: string) {
    const selected = data.handoffNotes.selectedItems;
    const next = selected.includes(item) ? selected.filter((value) => value !== item) : [...selected, item];
    update("handoffNotes.selectedItems", next);
  }

  function applySuggestedHandoffNotes() {
    const next = Array.from(new Set([...data.handoffNotes.selectedItems, ...suggestedHandoffNoteItems(data)]));
    update("handoffNotes.selectedItems", next);
  }

  function updateDate(path: string, value: EraDateValue, withTime = false) {
    update(path, updateEraIso(value, withTime));
  }

  function updateDeathDate(value: DeathDateValue) {
    update("deceased.deathDate", normalizeDeathDate(value).value);
  }

  function updateCertificateStatus(path: "deathCertificate" | "postmortemCertificate", value: "有" | "無") {
    setData((current) => ({
      ...current,
      deceased: {
        ...current.deceased,
        [path]: value,
        ...(value === "有"
          ? path === "deathCertificate"
            ? { postmortemCertificate: "無" as const }
            : { deathCertificate: "無" as const }
          : {})
      }
    }));
  }

  function resumeDraft() {
    const raw =
      window.localStorage.getItem(storageKey) ||
      window.localStorage.getItem("funeral-handoff-draft-v2") ||
      window.localStorage.getItem("funeral-handoff-draft-v1");
    if (!raw) return;
    try {
      const parsedDraft = safeJsonParse<unknown>(raw, {
        fallback: null,
        label: "HandoffApp restoreDraft localStorage"
      });
      if (!parsedDraft) throw new Error("empty draft");
      setData(migrateDraft(parsedDraft));
      setPersistDraft(true);
      setHasStoredDraft(false);
    } catch {
      window.localStorage.removeItem(storageKey);
      setHasStoredDraft(false);
      alert("保存データを読み込めませんでした。新しい入力を開始できます。");
    }
  }

  function clearDraft() {
    const ok = window.confirm("入力途中のデータを破棄して、新しく作成します。よろしいですか？");
    if (!ok) return;
    window.localStorage.removeItem(storageKey);
    window.localStorage.removeItem(editingStepKey);
    window.localStorage.removeItem(editingRecordIdKey);
    window.localStorage.removeItem("funeral-handoff-draft-v2");
    window.localStorage.removeItem("funeral-handoff-draft-v1");
    setData(cloneDefault());
    setRecordId(null);
    setPersistDraft(false);
    setStep(0);
    setHasStoredDraft(false);
  }

  function dateStamp() {
    return new Date().toISOString().slice(0, 10).replaceAll("-", "");
  }

  async function downloadReportPdf(target: HTMLElement | null, fileName: string) {
    if (!target) {
      alert("PDF作成用の帳票を読み込めませんでした。もう一度お試しください。");
      return;
    }
    await downloadElementAsPdf(target, fileName);
  }

  function saveDataSnapshot(nextData: HandoffData, status: HandoffRecordStatus = "入力中", pdfGenerated = false) {
    setPersistDraft(true);
    setData(nextData);
    const record = saveHandoffProgress(nextData, {
      id: recordId || undefined,
      status,
      pdfGenerated,
      currentStep: step,
      currentStepName: steps[step] || "",
      progressPercent: progressPercentForStep(step)
    });
    setRecordId(record.id);
  }

  function saveProgressSnapshot(nextData = data, nextStep = step) {
    if (!loaded || !persistDraft) return;
    const record = saveHandoffProgress(nextData, {
      id: recordId || undefined,
      status: statusForStep(nextStep),
      pdfGenerated: data.relativeCopy.generated || data.vendorCopy.generated || data.internalCopy.generated,
      currentStep: nextStep,
      currentStepName: steps[nextStep] || "",
      progressPercent: progressPercentForStep(nextStep)
    });
    setRecordId(record.id);
  }

  useEffect(() => {
    if (!loaded || !persistDraft) return;
    const timer = window.setTimeout(() => saveProgressSnapshot(data, step), 1000);
    return () => window.clearTimeout(timer);
  }, [data, step, loaded, persistDraft, recordId]);

  useEffect(() => {
    if (!loaded || !persistDraft) return;
    const timer = window.setInterval(() => saveProgressSnapshot(data, step), 10000);
    return () => window.clearInterval(timer);
  }, [data, step, loaded, persistDraft, recordId]);

  async function createRelativeCopyPdf() {
    if (!data.relativeConfirmation.confirmed || !data.relativeConfirmation.signatureDataUrl || !isFamilyCopyDeliveryReady(data.familyCopyDelivery)) {
      alert("親族様に入力内容と控えの送付先を確認いただいてからPDFを作成してください。");
      return;
    }
    const now = new Date().toISOString();
    const nextData = {
      ...data,
      relativeCopy: {
        ...data.relativeCopy,
        generated: true,
        generatedAt: now,
        fileName: `親族控え_${sanitizeFileName(data.deceased.name || "未入力")}_${dateStamp()}.pdf`
      }
    };
    saveDataSnapshot(nextData, "現場入力完了", true);
    await downloadReportPdf(relativePdfRef.current, nextData.relativeCopy.fileName);
  }

  async function createInternalCopyPdf() {
    const now = new Date().toISOString();
    const vendorName = vendor?.name || "業者未選択";
    const nextData = {
      ...data,
      internalCopy: {
        ...data.internalCopy,
        generated: true,
        generatedAt: now,
        fileName: `社内控え_業務引継書_${sanitizeFileName(vendorName)}_${sanitizeFileName(data.deceased.name || "未入力")}_${dateStamp()}.pdf`
      }
    };
    setPrintReport("internal");
    saveDataSnapshot(nextData, "控え作成済み", true);
    await downloadReportPdf(internalPdfRef.current, nextData.internalCopy.fileName);
  }

  function markRelativeCopySent() {
    const now = new Date().toISOString();
    const nextData = {
      ...data,
      relativeCopy: {
        ...data.relativeCopy,
        sent: true,
        sentAt: now
      }
    };
    saveDataSnapshot(nextData, "現場入力完了", data.relativeCopy.generated);
    alert("親族控えを送信済みにしました。");
  }

  async function createVendorCopyPdf() {
    const now = new Date().toISOString();
    const vendorName = vendor?.name || "業者未選択";
    const nextData = {
      ...data,
      vendorCopy: {
        ...data.vendorCopy,
        generated: true,
        generatedAt: now,
        fileName: `業者控え_業務引継書_${sanitizeFileName(vendorName)}_${sanitizeFileName(data.deceased.name || "未入力")}_${dateStamp()}.pdf`
      }
    };
    setPrintReport("vendor");
    saveDataSnapshot(nextData, "控え作成済み", true);
    await downloadReportPdf(vendorPdfRef.current, nextData.vendorCopy.fileName);
  }

  function savePostWork() {
    const user = getCurrentUser();
    const now = new Date().toISOString();
    const nextData = {
      ...data,
      postWork: {
        ...data.postWork,
        actualMileageKm: data.postWork.transportDistanceKm,
        returnTime: "",
        vendorNote: "",
        internalNote: "",
        internalMemo: "",
        finishedAt: data.postWork.finishedAt || data.relativeConfirmation.confirmedAt || now,
        savedAt: now,
        savedBy: {
          userId: user?.userId || "",
          name: user?.name || ""
        }
      }
    };
    saveDataSnapshot(nextData, "業務終了後入力済み", data.vendorCopy.generated || data.internalCopy.generated || data.relativeCopy.generated);
    alert("業務終了後入力を保存しました。");
  }

  async function copyVendorText() {
    const text = buildVendorSendText(data);
    try {
      await navigator.clipboard.writeText(text);
      alert("業者送信用テキストをコピーしました。");
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      alert("業者送信用テキストをコピーしました。");
    }
  }

  function saveCompletedRecord() {
    const record = saveHandoffRecord(data, { id: recordId || undefined, status: "業務終了後入力済み", currentStep: step, currentStepName: steps[step] || "" });
    setRecordId(record.id);
    alert("管理画面へ保存しました。");
  }

  function canMoveNext() {
    if (step === 0) return Boolean(data.branchId);
    if (step === 1) return Boolean(data.vendorId);
    if (step === 2) return data.transport.pickupDate.iso && data.transport.pickupTime;
    if (step === 4) return data.privacyConsent.agreed === true && Boolean(data.privacyConsent.consentDate) && Boolean(data.privacyConsent.signatureDataUrl);
    if (step === 5) return data.chiefMourner.name && data.chiefMourner.address && (!vendorRule.requireMournerBirthDate || data.chiefMourner.birthDate.iso);
    if (step === 6) return data.deceased.name && data.deceased.birthDate.iso && data.deceased.addressType && (data.deceased.addressType !== "other" || data.deceased.address) && (!vendorRule.requirePacemaker || data.deceased.pacemaker);
    if (step === 8) {
      const externalInquiryReady = !vendorRule.showExternalInquiryAnswer || data.vendorQuestions[externalInquiryQuestion];
      const extraQuestionsReady = extraQuestions.every((question) => !question.required || data.vendorQuestions[question.label]);
      return Boolean(externalInquiryReady && extraQuestionsReady);
    }
    if (step === 10) return data.deceased.deathCertificate && data.deceased.postmortemCertificate && data.deceased.treatment && data.deceased.deathDate.displayText;
    if (step === 12 && vendorRule.cremationReservationRequired) return data.schedule.cremationReservationStatus === "済";
    return true;
  }

  function next() {
    if (!canMoveNext()) return;
    setStep((current) => {
      const nextStep = Math.min(current + 1, steps.length - 1);
      const nextData = nextStep === 14 && !data.postWork.finishedAt
        ? { ...data, postWork: { ...data.postWork, finishedAt: new Date().toISOString() } }
        : data;
      if (nextData !== data) setData(nextData);
      const record = saveHandoffProgress(nextData, {
        id: recordId || undefined,
        status: statusForStep(nextStep),
        currentStep: nextStep,
        currentStepName: steps[nextStep] || "",
        progressPercent: progressPercentForStep(nextStep)
      });
      setRecordId(record.id);
      return nextStep;
    });
  }

  function back() {
    setStep((current) => {
      const previousStep = Math.max(current - 1, 0);
      saveProgressSnapshot(data, previousStep);
      return previousStep;
    });
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>{step >= 14 ? `業務引継書（${vendor?.name || "業者未選択"}）` : "業務引継書入力"}</h1>
        </div>
      </header>
      <SyncStatusBanner />

      {hasStoredDraft ? (
        <div className="resume-panel no-print">
          <h3>入力途中のデータがあります</h3>
          <p>続きから再開するか、新しく作成するかを選んでください。</p>
          <div className="toolbar">
            <button className="primary" onClick={resumeDraft}>続きから再開</button>
            <button onClick={clearDraft}>新しく作成</button>
          </div>
        </div>
      ) : null}

      <nav className="stepper no-print" aria-label="入力ステップ">
        {steps.map((label, index) => (
          <span key={label} className={`step-pill ${index === step ? "active" : ""}`}>
            {index + 1}. {label}
          </span>
        ))}
      </nav>

      {step > 1 ? (
        <div className="vendor-strip no-print">
          業者：{vendor?.name || "業者未選択"}
        </div>
      ) : null}

      {step === 0 ? (
        <section className="section">
          <div className="section-title-row">
            <h2>拠点選択</h2>
            <a className="button-link no-print" href="/dashboard">ダッシュボードへ戻る</a>
          </div>
          <div className="choice-grid">
            {branchList.map((item) => (
              <button key={item.id} className={`choice ${data.branchId === item.id ? "selected" : ""}`} onClick={() => update("branchId", item.id)}>
                {item.name}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="section">
          <h2>業者選択</h2>
          <div className="choice-grid">
            {availableVendors.map((item) => (
              <button key={item.id} className={`choice ${data.vendorId === item.id ? "selected" : ""}`} onClick={() => update("vendorId", item.id)}>
                {item.name}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="section">
          <h2>ドライバー初期入力</h2>
          <p className="notice">親族様へタブレットをお渡しする前に、ドライバー側で分かる情報を入力してください。</p>
          <div className="grid">
            <EraDateInput label="お迎え日" value={data.transport.pickupDate} required onChange={(value) => updateDate("transport.pickupDate", value)} />
            <TextInput data={data} path="transport.pickupTime" label="お迎え時間" required type="time" />
            <TextAreaInput data={data} path="transport.pickupAddress" label="お迎え先住所" />
            <TextInput data={data} path="transport.pickupName" label="お迎え先名称" placeholder="例：安城更生病院" />
            <SelectInput data={data} path="transport.destinationType" label="搬送先" options={["自宅", "ホール", "霊安室", "その他"]} />
            <TextInput data={data} path="transport.destinationPlace" label="搬送先場所" />
            <CompactChoice
              label="電話連絡の有無"
              value={data.contactAndNotes.phoneContactEnabled}
              options={["有", "無"]}
              onChange={(value) => {
                update("contactAndNotes.phoneContactEnabled", value);
                if (value === "無") update("contactAndNotes.phoneContact", { month: "", day: "", time: "" });
              }}
              hint="電話連絡がある業者の場合のみ「有」を選択すると、日にち・時間の入力欄が表示されます。"
            />
            {data.contactAndNotes.phoneContactEnabled === "有" ? (
              <MonthDayTimeInput label="電話連絡（日にち・時間）" value={data.contactAndNotes.phoneContact} onChange={(value) => update("contactAndNotes.phoneContact", { ...value, month: "" })} freeTextTime hideMonth />
            ) : null}
            <TextInput data={data} path="contactAndNotes.funeralCompanyContact" label="葬儀社連絡先" readOnly />
          </div>
        </section>
      ) : null}

      {step === 3 && vendor ? (
        <section className="section">
          <h2>業者別注意事項</h2>
          <div className="notice">
            <strong>{vendor.name}</strong>
            <ul>{vendor.notices.map((notice) => <li key={notice}>{notice}</li>)}</ul>
          </div>
        </section>
      ) : null}

      {step === 4 ? (
        <section className="section">
          <h2>個人情報の取扱いに関する同意書</h2>
          <PrivacyConsentView />
          <div className="grid privacy-consent-form">
            <CompactChoice
              label="同意"
              value={data.privacyConsent.agreed === true ? "同意する" : data.privacyConsent.agreed === false ? "同意しない" : ""}
              options={["同意する", "同意しない"]}
              onChange={(value) => updatePrivacyAgreement(value === "同意する")}
              required
            />
            {data.privacyConsent.agreed === false ? (
              <div className="error privacy-consent-error">個人情報の取扱いに同意いただけない場合、以降の個人情報入力へ進むことはできません。担当者へお声がけください。</div>
            ) : null}
            <TextInput data={data} path="privacyConsent.consentDate" label="同意日" type="date" required />
            <div className="privacy-signature-field">
              <Field label="手書き署名" required hint="枠内に指またはタッチペンで署名してください。">
                <SignaturePad value={data.privacyConsent.signatureDataUrl} onChange={(value) => update("privacyConsent.signatureDataUrl", value)} />
              </Field>
            </div>
          </div>
        </section>
      ) : null}

      {step === 5 ? (
        <section className="section">
          <h2>喪主・代表者情報</h2>
          <div className="grid">
            <CompactChoice label="情報入力者" value={data.chiefMourner.role} options={["喪主", "代表者"]} onChange={(value) => update("chiefMourner.role", value)} required hint="例：喪主本人が入力する場合は「喪主」" />
            <TextInput data={data} path="chiefMourner.name" label="氏名" required placeholder="例：山田　太郎" hint="姓と名の間にスペースを入れて入力してください。" />
            <TextInput data={data} path="chiefMourner.kana" label="氏名（フリガナ）" placeholder="例：ヤマダ　タロウ" hint="フリガナも姓と名の間にスペースを入れて入力してください。" />
            <TextAreaInput data={data} path="chiefMourner.address" label="喪主・代表者住所" required placeholder="例：市区町村・番地・建物名" />
            <TextInput data={data} path="chiefMourner.homePhone" label="自宅電話番号" placeholder="例：0000-00-0000" />
            <TextInput data={data} path="chiefMourner.mobilePhone" label="携帯電話番号" placeholder="例：090-0000-0000" />
            {vendorRule.showPreferredContact !== false ? (
              <Field label="今後の流れ">
                <span className="small">今後の流れについて、以下の内容でご連絡予定です。</span>
                <div className="readonly-box">{phoneContactDisplayText(data) || "電話連絡内容は未入力です。"}</div>
                <SelectInput data={data} path="chiefMourner.preferredContact" label="希望連絡先" options={["自宅", "携帯", "上記以外"]} hint="例：葬儀社から携帯へ連絡希望" />
              </Field>
            ) : null}
            {vendorRule.showPreferredContact !== false && data.chiefMourner.preferredContact === "上記以外" ? (
              <TextInput
                data={data}
                path="chiefMourner.otherContact"
                label="その他の連絡先情報"
                hint="連絡を希望される方のお名前と連絡先を入力してください。"
                placeholder="例：長男 山田太郎 090-0000-0000"
              />
            ) : null}
            <TextInput data={data} path="chiefMourner.relationshipToDeceased" label="故人様から見た続柄" placeholder="例：長男" />
            {vendorRule.showMournerBirthDate ? (
              <EraDateInput label="喪主・代表者 生年月日" value={data.chiefMourner.birthDate} required={vendorRule.requireMournerBirthDate} onChange={(value) => updateDate("chiefMourner.birthDate", value)} />
            ) : null}
          </div>
        </section>
      ) : null}

      {step === 6 ? (
        <section className="section">
          <h2>故人基本情報</h2>
          <div className="grid">
            <TextInput data={data} path="deceased.name" label="故人氏名" required placeholder="例：山田　花子" hint="姓と名の間にスペースを入れて入力してください。" />
            <TextInput data={data} path="deceased.kana" label="故人氏名（フリガナ）" placeholder="例：ヤマダ　ハナコ" hint="フリガナも姓と名の間にスペースを入れて入力してください。" />
            <RadioGroup data={data} path="deceased.gender" label="性別" options={["男", "女"]} hint="例：男" />
            <EraDateInput label="生年月日" value={data.deceased.birthDate} required onChange={(value) => updateDate("deceased.birthDate", value)} />
            <Field label="故人住所" required>
              <span className="small">例：喪主・代表者と同じ場合は、帳票では「同上」と表示されます。</span>
              <Segmented
                value={data.deceased.addressType === "same_as_mourner" ? "喪主・代表者と同じ" : data.deceased.addressType === "other" ? "その他" : ""}
                options={["喪主・代表者と同じ", "その他"]}
                onChange={(value) => update("deceased.addressType", value === "喪主・代表者と同じ" ? "same_as_mourner" : "other")}
              />
            </Field>
            {data.deceased.addressType === "other" ? <TextAreaInput data={data} path="deceased.address" label="故人住所入力" required placeholder="例：市区町村・番地・建物名" /> : null}
            <TextInput data={data} path="deceased.relationshipToChief" label="喪主から見た続柄" placeholder="例：父" />
            {vendorRule.showPacemaker ? (
              <RadioGroup data={data} path="deceased.pacemaker" label="ペースメーカーの有無" options={["有", "無"]} required={vendorRule.requirePacemaker} hint="例：有" />
            ) : null}
          </div>
        </section>
      ) : null}

      {step === 7 ? (
        <section className="section">
          <h2>宗教者関連</h2>
          <div className="grid">
            <CompactChoice label="付き合いのある宗教者" value={data.religion.hasPriest} options={["有", "無"]} onChange={(value) => update("religion.hasPriest", value)} hint="例：菩提寺がある場合は「有」" />
            <CompactChoice label="宗教者紹介希望" value={data.religion.introductionWanted} options={["希望する", "希望しない"]} onChange={(value) => update("religion.introductionWanted", value)} hint="例：紹介希望の場合は「希望する」" />
            <Field label={data.religion.introductionWanted === "希望する" ? "希望宗派" : "宗派"} hint="宗派によっては紹介できない場合もあります。">
              {data.religion.introductionWanted === "希望する" ? (
                <Segmented
                  value={data.religion.denomination === "宗派指定なし" ? "宗派指定なし" : "自由入力"}
                  options={["自由入力", "宗派指定なし"]}
                  onChange={(value) => update("religion.denomination", value === "宗派指定なし" ? "宗派指定なし" : "")}
                />
              ) : null}
              {data.religion.denomination !== "宗派指定なし" ? (
                <input
                  type="text"
                  placeholder="例：浄土真宗 / 曹洞宗"
                  value={data.religion.denomination}
                  onChange={(event) => update("religion.denomination", event.target.value)}
                />
              ) : null}
            </Field>
            {data.religion.introductionWanted !== "希望する" && data.religion.hasPriest !== "無" ? (
              <>
                <TextInput data={data} path="religion.priestName" label="宗教者名" placeholder="例：○○寺" />
                <TextInput data={data} path="religion.priestKana" label="宗教者名フリガナ" placeholder="例：○○ジ" />
              </>
            ) : null}
            {data.religion.hasPriest !== "無" ? (
              <>
                <CompactChoice label="宗教者との関係" value={data.religion.relationship} options={["菩提寺等", "不明"]} onChange={(value) => update("religion.relationship", value)} hint="例：付き合いがある寺院は「菩提寺等」" />
                <CompactChoice label="宗教者への連絡状況" value={data.religion.contactStatus} options={["連絡済み", "連絡未", "無"]} onChange={(value) => update("religion.contactStatus", value)} hint="例：日時確定済みなら「連絡済み」" />
              </>
            ) : null}
            <CompactChoice label="こちらのお家では、初めてご家族様をお送りすることになりますか？" value={data.religion.isFirstFuneralForFamily} options={["はい", "いいえ"]} onChange={(value) => update("religion.isFirstFuneralForFamily", value)} />
          </div>
        </section>
      ) : null}

      {step === 8 ? (
        <section className="section">
          <h2>確認事項</h2>
          <div className="schedule-stack">
            <div className="schedule-card">
              <h3>準備確認</h3>
              {vendorRule.showPortraitPhoto ? (
                <SelectInput data={data} path="contactAndNotes.portraitPhoto" label="遺影写真" options={vendorRule.portraitPhotoOptions} hint="例：写真を用意済みなら「有」、確認中なら「未定」" />
              ) : (
                <p className="notice">準備確認項目はありません。</p>
              )}
            </div>
            <div className="schedule-card">
              <h3>追加質問</h3>
            {vendorRule.showFuneralScale ? (
              <CompactChoice label={funeralScaleQuestion} value={data.vendorQuestions[funeralScaleQuestion] || ""} options={vendorRule.funeralScaleOptions} onChange={(value) => update(`vendorQuestions.${funeralScaleQuestion}`, value)} hint="例：家族葬、直葬希望など" />
            ) : null}
            {vendorRule.showMembership ? (
              <CompactChoice
                label={membershipStatusQuestion}
                value={data.vendorQuestions[membershipStatusQuestion] || ""}
                options={vendorRule.membershipOptions}
                onChange={(value) => update(`vendorQuestions.${membershipStatusQuestion}`, value)}
                hint={vendorRule.showUnionMemberType ? "例：組合員の場合は会員扱い" : "例：会員証や登録状況を確認して選択してください。"}
              />
            ) : null}
            {vendorRule.showUnionMemberType ? (
              <CompactChoice
                label={unionMemberTypeQuestion}
                value={data.vendorQuestions[unionMemberTypeQuestion] || ""}
                options={vendorRule.unionMemberTypeOptions}
                onChange={(value) => {
                  update(`vendorQuestions.${unionMemberTypeQuestion}`, value);
                  if (vendorRule.showMembership) update(`vendorQuestions.${membershipStatusQuestion}`, value === "非組合員" ? "非会員" : "会員");
                }}
                hint="例：確認できた区分を選択してください。"
              />
            ) : null}
            {vendorRule.showExternalInquiryAnswer && vendorRule.externalInquiryAnswerOptions.length ? (
              <RadioGroup data={data} path={`vendorQuestions.${externalInquiryQuestion}`} label={externalInquiryQuestion} options={vendorRule.externalInquiryAnswerOptions} required hint={data.vendorId === "famille" ? "例：お答えして問題がなければ可、伏せたい場合は不可を選択してください" : "例：確認できた回答内容を選択してください"} />
            ) : null}
            {extraQuestions.map((question) => <ExtraQuestionField key={question.id} data={data} question={question} />)}
            {!vendorRule.showFuneralScale && !vendorRule.showMembership && !vendorRule.showUnionMemberType && !vendorRule.showExternalInquiryAnswer && !extraQuestions.length ? (
              <p className="notice">追加質問はありません。</p>
            ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {step === 9 ? (
        <section className="section">
          <h2>ドライバーへタブレットをお渡しください</h2>
          <p className="notice">
            ここまでの親族様入力は完了しました。<br />
            この後はドライバーが確認・追加入力を行います。<br />
            お手数ですが、タブレットをドライバーへお渡しください。
          </p>
        </section>
      ) : null}

      {step === 10 ? (
        <section className="section">
          <h2>ドライバー追加入力</h2>
          <div className="grid">
            <CompactChoice label="死亡診断書" value={data.deceased.deathCertificate} options={["有", "無"]} onChange={(value) => updateCertificateStatus("deathCertificate", value as "有" | "無")} required />
            <CompactChoice label="死体検案書" value={data.deceased.postmortemCertificate} options={["有", "無"]} onChange={(value) => updateCertificateStatus("postmortemCertificate", value as "有" | "無")} required />
            <CompactChoice label="処置" value={data.deceased.treatment} options={["有", "無"]} onChange={(value) => update("deceased.treatment", value)} required />
            <DeathDateInput value={data.deceased.deathDate} onChange={updateDeathDate} />
          </div>
        </section>
      ) : null}

      {step === 11 ? (
        <section className="section">
          <h2>火葬予約前確認</h2>
          <PaperReport data={data} compact />
          <p className="notice no-print">ここまでの内容を確認して、アプリ外で火葬予約へ進んでください。</p>
        </section>
      ) : null}

      {step === 12 ? (
        <section className="section">
          <h2>葬儀日程・火葬予約</h2>
          {vendorRule.cremationReservationRequired ? <div className="error">この業者は火葬予約状況「済」が必須です。</div> : null}
          <div className="schedule-stack">
            <div className="schedule-card">
              <h3>枕経等</h3>
              <div className="compact-grid four">
                <MonthDayTimeInput label="枕経等日時" value={data.schedule.pillowSutraDateTime} onChange={(value) => update("schedule.pillowSutraDateTime", value)} />
                <SelectInput data={data} path="schedule.pillowSutraStatus" label="枕経等 状態" options={["済み", "未定", "予定", "無し"]} />
              </div>
            </div>
            <ScheduleBlock title="通夜" status={data.schedule.wakeStatus} onStatus={(value) => update("schedule.wakeStatus", value)} hope={data.schedule.wakeHope} onHope={(value) => update("schedule.wakeHope", value)} dateTime={data.schedule.wakeDateTime} onDateTime={(value) => update("schedule.wakeDateTime", value)} placePath="schedule.wakePlace" placeLabel="場所" data={data} />
            <ScheduleBlock title="葬儀" status={data.schedule.funeralStatus} onStatus={(value) => update("schedule.funeralStatus", value)} hope={data.schedule.funeralHope} onHope={(value) => update("schedule.funeralHope", value)} dateTime={data.schedule.funeralDateTime} onDateTime={(value) => update("schedule.funeralDateTime", value)} placePath="schedule.funeralPlace" placeLabel="場所" data={data} />
            <div className="schedule-card">
              <h3>火葬</h3>
              <div className="cremation-grid">
                <Field label="火葬場予約">
                  <Segmented value={data.schedule.crematoriumStatus} options={["決", "仮", "未"]} onChange={(value) => update("schedule.crematoriumStatus", value)} />
                </Field>
                <div className="stacked-fields">
                  <MonthDayTimeInput label="出棺時間" value={data.schedule.departureDateTime} onChange={(value) => update("schedule.departureDateTime", value)} />
                  <MonthDayTimeInput label="火葬時間" value={data.schedule.cremationDateTime} onChange={(value) => update("schedule.cremationDateTime", value)} />
                </div>
                <TextInput data={data} path="schedule.crematoriumName" label="火葬場名" />
                <SelectInput data={data} path="schedule.cremationReservationStatus" label="火葬予約状況" options={["済", "未"]} required={vendorRule.cremationReservationRequired} />
                <TextInput data={data} path="schedule.reservationNumber" label="予約番号" />
                <TextInput data={data} path="schedule.waitingRoom" label="待合室" placeholder="例：第1待合室、2号室、未定" />
                <TextInput data={data} path="supplies.hearse" label="霊柩車" />
                <TextInput data={data} path="supplies.vehicleType" label="車種" />
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {step === 13 ? (
        <section className="section">
          <h2>使用品・備品</h2>
          <div className="schedule-stack">
            <div className="schedule-card">
              <h3>使用品</h3>
              <div className="compact-grid five">
                <SelectInput data={data} path="supplies.futon" label="布団" options={["使用あり", "使用なし"]} />
                <SelectInput data={data} path="supplies.dryIceKg" label="ドライアイス" options={["10kg", "20kg", "使用なし"]} />
                <SelectInput data={data} path="supplies.pillowDecorationSet" label="枕飾りセット" options={["仏式", "神式", "正宗", "使用なし"]} />
                <SelectInput data={data} path="supplies.shikimi" label="樒" options={["1束", "2束", "使用なし"]} />
                <SelectInput data={data} path="supplies.coffinUsage" label="棺" options={["使用なし", "手入力"]} />
                {data.supplies.coffinUsage === "手入力" ? (
                  <TextInput data={data} path="supplies.coffinDetail" label="棺の内容" placeholder="棺の種類・サイズなどを入力してください。" />
                ) : null}
                <DatalistInput data={data} path="supplies.mokugyoSetNo" label="木魚リンセット貸出No" options={["使用なし", "No.1", "No.2", "No.3", "その他（手入力）"]} placeholder="選択してください" />
                <SelectInput data={data} path="supplies.faceCloth" label="面布" options={["使用あり", "使用なし"]} />
              </div>
            </div>
            <div className="schedule-card">
              <h3>その他</h3>
              <TextAreaInput data={data} path="supplies.other" label="その他使用品" />
            </div>
          </div>
        </section>
      ) : null}

      {step === 14 ? (
        <section className="section">
          <h2 className="no-print">親族控え</h2>
          {!data.relativeConfirmation.confirmed ? (
            <>
              <p className="notice no-print">入力が完了しました。親族様に内容をご確認いただき、問題なければ送信前確認へ進んでください。</p>
              {errors.length ? (
                <div className="error no-print">
                  <strong>親族控え作成前に確認してください</strong>
                  <ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul>
                </div>
              ) : null}
              <div className="schedule-card no-print">
                <h3>親族内容確認</h3>
                <p className="small">
                  下の親族控え内容と送付先をご確認ください。問題なければ、次の画面で送信本文を確認します。
                </p>
                <div className="delivery-confirm-box">
                  <h4>控え（内容）の送付先確認</h4>
                  <CompactChoice
                    label="控えの送付方法"
                    value={data.familyCopyDelivery.method === "sms" ? "SMSで受け取る" : data.familyCopyDelivery.method === "email" ? "メールで受け取る" : ""}
                    options={["SMSで受け取る", "メールで受け取る"]}
                    onChange={updateFamilyCopyDeliveryMethod}
                    required
                  />
                  {data.familyCopyDelivery.method === "sms" ? (
                    <Field label="送付先携帯番号" required hint="喪主・代表者情報で入力した携帯電話番号を初期表示しています。必要に応じて変更できます。">
                      <input
                        value={data.familyCopyDelivery.smsPhoneNumber}
                        placeholder="例：090-0000-0000"
                        onChange={(event) => updateFamilyCopyDeliveryField("smsPhoneNumber", event.target.value)}
                      />
                    </Field>
                  ) : null}
                  {data.familyCopyDelivery.method === "email" ? (
                    <Field label="送付先メールアドレス" required>
                      <input
                        type="email"
                        value={data.familyCopyDelivery.email}
                        placeholder="例：sample@example.com"
                        onChange={(event) => updateFamilyCopyDeliveryField("email", event.target.value)}
                      />
                    </Field>
                  ) : null}
                  {!familyCopyDeliveryReady ? (
                    <p className="small" style={{ color: "#b42318" }}>控えの送付方法と送付先を入力してください。</p>
                  ) : null}
                  {data.familyCopyDelivery.sendStatus === "error" && data.familyCopyDelivery.sendError ? (
                    <p className="small" style={{ color: "#b42318" }}>{data.familyCopyDelivery.sendError}</p>
                  ) : null}
                </div>
                <div className="confirmation-check">
                  <span>私は、上記の入力内容および控えの送付先を確認し、この内容で間違いありません。</span>
                  <button className="primary" onClick={confirmAndSendFamilyCopy} disabled={!familyCopyDeliveryReady || sendingFamilyCopy || errors.length > 0}>
                    送信前確認へ
                  </button>
                </div>
              </div>
              <RelativeCopyReport data={data} />
            </>
          ) : data.familyCopyDelivery.sendStatus !== "success" ? (
            <>
              <div className="schedule-card no-print">
                <h3>親族控え送信前確認</h3>
                <p className="notice">
                  送信先と本文を確認してください。メールはResendを使って送信します。SMSは送信サービス設定後に利用できます。
                </p>
                <div className="delivery-confirm-box">
                  <CompactChoice
                    label="送信方法"
                    value={data.familyCopyDelivery.method === "sms" ? "SMSで受け取る" : data.familyCopyDelivery.method === "email" ? "メールで受け取る" : ""}
                    options={["SMSで受け取る", "メールで受け取る"]}
                    onChange={updateSendConfirmationMethod}
                    required
                  />
                  {data.familyCopyDelivery.method === "sms" ? (
                    <Field label="送信先携帯番号" required>
                      <input
                        value={data.familyCopyDelivery.smsPhoneNumber}
                        placeholder="例：090-0000-0000"
                        onChange={(event) => updateSendConfirmationDestination("smsPhoneNumber", event.target.value)}
                      />
                    </Field>
                  ) : null}
                  {data.familyCopyDelivery.method === "email" ? (
                    <Field label="送信先メールアドレス" required>
                      <input
                        type="email"
                        value={data.familyCopyDelivery.email}
                        placeholder="例：sample@example.com"
                        onChange={(event) => updateSendConfirmationDestination("email", event.target.value)}
                      />
                    </Field>
                  ) : null}
                  <Field label="送信本文テンプレート" required hint="必要に応じて編集できます。">
                    <textarea
                      rows={data.familyCopyDelivery.method === "sms" ? 4 : 12}
                      value={familyCopyMessageTemplate(data)}
                      onChange={(event) => updateFamilyCopyMessageTemplate(event.target.value)}
                    />
                  </Field>
                  {!familyCopyDeliveryReady ? (
                    <p className="small" style={{ color: "#b42318" }}>送信方法と送信先を入力してください。</p>
                  ) : null}
                  {data.familyCopyDelivery.sendStatus === "pending" ? (
                    <p className="send-status">送信待ちです。通信復旧後、再送信してください。</p>
                  ) : null}
                  {data.familyCopyDelivery.sendStatus === "error" && data.familyCopyDelivery.sendError ? (
                    <p className="send-status error">{data.familyCopyDelivery.sendError}</p>
                  ) : null}
                </div>
                <div className="toolbar">
                  <button onClick={() => setData((current) => ({ ...current, relativeConfirmation: { ...current.relativeConfirmation, confirmed: false } }))}>
                    内容確認へ戻る
                  </button>
                  <button className="primary" onClick={sendConfirmedFamilyCopy} disabled={!familyCopyDeliveryReady || sendingFamilyCopy}>
                    {sendingFamilyCopy ? "送信中..." : data.familyCopyDelivery.sendStatus === "error" ? "再送信" : "確認して送信"}
                  </button>
                </div>
              </div>
              <RelativeCopyReport data={data} />
            </>
          ) : (
            <>
              <div className="relative-complete no-print">
                <h3>入力が完了しました</h3>
                {data.familyCopyDelivery.sendStatus === "success" ? (
                  <p className="notice">
                    {data.familyCopyDelivery.method === "sms"
                      ? "入力内容の控えに関する案内を、登録された電話番号へ送信済みとして記録しました。"
                      : "入力内容の控えを、登録されたメールアドレスへ送信済みとして記録しました。"}
                  </p>
                ) : null}
                <p>親族様への内容確認が完了しました。</p>
                <p>この後の業者控え・社内控えの作成や送信は、管理画面から行ってください。</p>
              </div>
              <div className="staff-actions no-print">
                <div className="copy-status">
                  <span>案件ステータス: 現場入力完了</span>
                  <span>端末保存: 端末保存済み</span>
                  <span>クラウド保存: {cloudSaveStatusText(familyCopySyncStatus)}</span>
                  <span>通知: {familyCopyNotificationStatusText(data.familyCopyDelivery)}</span>
                  <span>内容確認: 確認済み</span>
                  <span>親族控えPDF: {data.relativeCopy.generated ? "作成済み" : "未作成"}</span>
                  {data.relativeCopy.fileName ? <span>{data.relativeCopy.fileName}</span> : null}
                </div>
                <div className="toolbar">
                  <button onClick={createRelativeCopyPdf} disabled={errors.length > 0}><FileDown size={18} /> 親族控えPDFを作成</button>
                  <button onClick={() => setData((current) => ({ ...current, familyCopyDelivery: { ...current.familyCopyDelivery, sendStatus: "", sendError: "" } }))}>
                    送信内容を再確認
                  </button>
                  <a className="button-link primary" href="/dashboard">ダッシュボードへ移動</a>
                  <button onClick={clearDraft}>新しい業務引継書を作成</button>
                  <button
                    onClick={() => {
                      void logout().finally(() => {
                        window.location.href = "/login";
                      });
                    }}
                  >
                    ログアウト
                  </button>
                </div>
              </div>
              <div className="print-only">
                <RelativeCopyReport data={data} />
              </div>
            </>
          )}
        </section>
      ) : null}

      <div className="pdf-download-source" aria-hidden="true">
        <div ref={relativePdfRef}>
          <RelativeCopyReport data={data} />
        </div>
        <div ref={vendorPdfRef}>
          <PaperReport data={data} />
        </div>
        <div ref={internalPdfRef}>
          <InternalStorageReport data={data} />
        </div>
      </div>

      {step < 14 ? (
        <div className="actions no-print">
          <button onClick={back} disabled={step === 0}>戻る</button>
          <div>
            <button onClick={clearDraft}>最初から入力する</button>
            <button className="primary" onClick={next} disabled={!canMoveNext()}>{step === 9 ? "ドライバー入力へ進む" : "次へ"}</button>
          </div>
        </div>
      ) : null}
      <HelpBot step={step} />
    </main>
  );
}

function ScheduleBlock({
  title,
  status,
  onStatus,
  hope,
  onHope,
  dateTime,
  onDateTime,
  placePath,
  placeLabel,
  data
}: {
  title: string;
  status: string;
  onStatus: (value: string) => void;
  hope: string;
  onHope: (value: string) => void;
  dateTime: MonthDayTimeValue;
  onDateTime: (value: MonthDayTimeValue) => void;
  placePath: string;
  placeLabel: string;
  data: HandoffData;
}) {
  return (
    <div className="schedule-card">
      <h3>{title}</h3>
      <div className="compact-grid four">
        <Field label="状態">
          <Segmented value={status} options={["決", "仮", "未"]} onChange={onStatus} />
        </Field>
        <MonthDayTimeInput label="月日・時間" value={dateTime} onChange={onDateTime} />
        <Field label="希望">
          <label className="confirmation-check compact">
            <input
              type="checkbox"
              checked={hope === "希望"}
              onChange={(event) => onHope(event.target.checked ? "希望" : "")}
            />
            <span>希望</span>
          </label>
        </Field>
        <TextInput data={data} path={placePath} label={placeLabel} />
      </div>
    </div>
  );
}

function displayValue(value: string | undefined | null) {
  return value && value.trim() ? value : "-";
}

function nameWithHonorific(value: string) {
  return value ? `${value} 様` : "";
}

function displayDateTime(value: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function displayFlexibleDateTime(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function privacyConsentText(data: HandoffData) {
  return data.privacyConsent.agreed === true ? "取得済み" : data.privacyConsent.agreed === false ? "不同意" : "未確認";
}

function privacyConsentInternalText(data: HandoffData) {
  return [
    data.privacyConsent.agreed === true ? "同意済み" : data.privacyConsent.agreed === false ? "不同意" : "未確認",
    data.privacyConsent.consentDate ? `同意日: ${data.privacyConsent.consentDate}` : ""
  ].filter(Boolean).join(" / ");
}

function shouldShowPriestIdentity(data: HandoffData) {
  return data.religion.hasPriest !== "無" && data.religion.introductionWanted !== "希望する";
}

function religionCategoryText(data: HandoffData) {
  return [
    data.religion.hasPriest !== "無" ? data.religion.relationship : "",
    data.religion.isFirstFuneralForFamily === "はい" ? "新家" : "",
    data.religion.introductionWanted === "希望する" ? "紹介希望" : ""
  ].filter(Boolean).join(" / ");
}

function vendorItemRows(data: HandoffData): Array<[string, string]> {
  const rule = getVendorRule(data.vendorId);
  const membership = data.vendorQuestions[membershipStatusQuestion] || "";
  const unionMemberType = data.vendorQuestions[unionMemberTypeQuestion] || "";
  const membershipText = unionMemberType ? `${unionMemberType === "非組合員" ? "非会員" : "会員"}（${unionMemberType}）` : membership;
  const extraRows = getExtraQuestions(data.vendorId)
    .filter((question) => question.showOnConfirm && ![
      externalInquiryQuestion,
      funeralScaleQuestion,
      membershipStatusQuestion,
      unionMemberTypeQuestion
    ].includes(question.label))
    .map((question) => [question.label, data.vendorQuestions[question.label] || ""] as [string, string]);
  return [
    rule.showFuneralScale ? ["葬儀規模", data.vendorQuestions[funeralScaleQuestion] || ""] : null,
    rule.showMembership ? ["会員・非会員", membershipText] : null,
    !rule.showMembership && rule.showUnionMemberType ? ["組合員区分", unionMemberType] : null,
    rule.showExternalInquiryAnswer ? [externalInquiryQuestion, data.vendorQuestions[externalInquiryQuestion] || ""] : null,
    ...extraRows
  ].filter(Boolean) as Array<[string, string]>;
}

function chiefContactText(data: HandoffData) {
  const preferred = data.chiefMourner.preferredContact === "上記以外" && data.chiefMourner.otherContact
    ? `連絡希望先: 上記以外（${data.chiefMourner.otherContact}）`
    : data.chiefMourner.preferredContact
      ? `連絡希望先: ${data.chiefMourner.preferredContact}`
      : "";
  return [
    `自宅 ${data.chiefMourner.homePhone || "無し"}`,
    `携帯 ${data.chiefMourner.mobilePhone || "無し"}`,
    preferred
  ].filter(Boolean).join(" / ");
}

function phoneOrNone(value: string) {
  return value || "無し";
}

function suppliesText(data: HandoffData) {
  const coffinText = data.supplies.coffinUsage === "手入力" ? data.supplies.coffinDetail : data.supplies.coffinUsage;
  const otherText = suppliesOtherText(data);
  return [
    data.supplies.futon ? `布団: ${data.supplies.futon}` : "",
    data.supplies.dryIceKg ? `ドライアイス: ${data.supplies.dryIceKg}` : "",
    data.supplies.pillowDecorationSet ? `枕飾りセット: ${data.supplies.pillowDecorationSet}` : "",
    data.supplies.shikimi ? `樒: ${data.supplies.shikimi}` : "",
    coffinText ? `棺: ${coffinText}` : "",
    data.supplies.mokugyoSetNo ? `木魚リンセット貸出No: ${data.supplies.mokugyoSetNo}` : "",
    data.supplies.faceCloth ? `面布: ${data.supplies.faceCloth}` : "",
    otherText ? `その他: ${otherText}` : "",
    data.postWork.transportDistanceKm ? `搬送距離: ${data.postWork.transportDistanceKm}km` : ""
  ].filter(Boolean).join(" / ");
}

function suppliesOtherText(data: HandoffData) {
  return [data.supplies.other, data.postWork.additionalSupplies].map((item) => item.trim()).filter(Boolean).join(" / ");
}

function workStartText(data: HandoffData) {
  return [formatEraDate(data.transport.pickupDate), data.transport.pickupTime].filter(Boolean).join(" ");
}

function pickupText(data: HandoffData) {
  const dateTime = [formatEraDate(data.transport.pickupDate), data.transport.pickupTime].filter(Boolean).join(" ");
  return [
    data.transport.pickupAddress ? `住所 ${data.transport.pickupAddress}` : "",
    data.transport.pickupName ? `名称 ${data.transport.pickupName}` : "",
    dateTime ? `お迎え時間 ${dateTime}` : ""
  ].filter(Boolean).join(" / ");
}

function formatWorkIsoDateTime(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat("ja-JP-u-ca-japanese", {
    era: "long",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const valueOf = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return `${valueOf("era")}${valueOf("year")}年${valueOf("month")}月${valueOf("day")}日 ${valueOf("hour")}:${valueOf("minute")}`;
}

function workEndText(data: HandoffData) {
  return data.postWork.finishedAt ? formatWorkIsoDateTime(data.postWork.finishedAt) : "";
}

function vendorSendRows(data: HandoffData): Array<[string, string]> {
  const branch = getBranches().find((item) => item.id === data.branchId);
  const vendor = getVendorMap()[data.vendorId];
  return [
    ["業者名", vendor?.name || ""],
    ["拠点", branch?.name || ""],
    ["葬儀社連絡先", data.contactAndNotes.funeralCompanyContact],
    ["故人氏名", data.deceased.name],
    ["故人氏名フリガナ", data.deceased.kana],
    [`${data.chiefMourner.role || "喪主・代表者"}氏名`, data.chiefMourner.name],
    [`${data.chiefMourner.role || "喪主・代表者"}連絡先`, chiefContactText(data)],
    ["お迎え先", pickupText(data)],
    ["搬送先", [data.transport.destinationType, data.transport.destinationPlace].filter(Boolean).join(" / ")],
    ["死亡診断書", data.deceased.deathCertificate],
    ["死体検案書", data.deceased.postmortemCertificate],
    ["処置", data.deceased.treatment],
    ["死亡日時", data.deceased.deathDate.displayText],
    ["ペースメーカーの有無", data.deceased.pacemaker],
    ["宗教者関連", [
      data.religion.denomination ? `宗派: ${data.religion.denomination}` : "",
      shouldShowPriestIdentity(data) && data.religion.priestName ? `宗教者名: ${data.religion.priestName}` : "",
      shouldShowPriestIdentity(data) && data.religion.priestKana ? `フリガナ: ${data.religion.priestKana}` : "",
      religionCategoryText(data) ? `区分: ${religionCategoryText(data)}` : "",
      data.religion.hasPriest !== "無" && data.religion.contactStatus ? `連絡状況: ${data.religion.contactStatus}` : ""
    ].filter(Boolean).join(" / ")],
    ...vendorItemRows(data),
    ["枕経等日時", [formatMonthDayTime(data.schedule.pillowSutraDateTime), data.schedule.pillowSutraStatus].filter(Boolean).join(" / ")],
    ["通夜日時・場所", [`${data.schedule.wakeStatus || ""} ${formatMonthDayTime(data.schedule.wakeDateTime)}`.trim(), data.schedule.wakeHope, data.schedule.wakePlace].filter(Boolean).join(" / ")],
    ["葬儀日時・場所", [`${data.schedule.funeralStatus || ""} ${formatMonthDayTime(data.schedule.funeralDateTime)}`.trim(), data.schedule.funeralHope, data.schedule.funeralPlace].filter(Boolean).join(" / ")],
    ["出棺日時", formatMonthDayTime(data.schedule.departureDateTime)],
    ["火葬日時", formatMonthDayTime(data.schedule.cremationDateTime)],
    ["火葬場名", data.schedule.crematoriumName],
    ["火葬予約状況", data.schedule.cremationReservationStatus],
    ["予約番号", data.schedule.reservationNumber],
    ["待合室", data.schedule.waitingRoom],
    ["車両", [data.supplies.hearse ? `霊柩車: ${data.supplies.hearse}` : "", data.supplies.vehicleType ? `車種: ${data.supplies.vehicleType}` : ""].filter(Boolean).join(" / ")],
    ["朝の連絡先", morningContactText(data)],
    ["遺影写真", data.contactAndNotes.portraitPhoto],
    ["使用品・備品", suppliesText(data)],
    ["開始・終了", [`開始 ${workStartText(data)}`, workEndText(data) ? `終了 ${workEndText(data)}` : ""].filter(Boolean).join(" / ")]
  ];
}

function relativeCopyRows(data: HandoffData): Array<[string, string]> {
  const vendor = getVendorMap()[data.vendorId];
  return [
    ["業者名", vendor?.name || ""],
    [data.chiefMourner.role || "喪主・代表者", [
      nameWithHonorific(data.chiefMourner.name),
      data.chiefMourner.kana ? `(${data.chiefMourner.kana})` : "",
      data.chiefMourner.relationshipToDeceased ? `続柄: ${data.chiefMourner.relationshipToDeceased}` : ""
    ].filter(Boolean).join(" ")],
    [`${data.chiefMourner.role || "喪主・代表者"}住所`, data.chiefMourner.address],
    [`${data.chiefMourner.role || "喪主・代表者"}連絡先`, chiefContactText(data)],
    ["故人", [
      nameWithHonorific(data.deceased.name),
      data.deceased.kana ? `(${data.deceased.kana})` : "",
      data.deceased.gender ? `性別: ${data.deceased.gender}` : "",
      data.deceased.relationshipToChief ? `続柄: ${data.deceased.relationshipToChief}` : ""
    ].filter(Boolean).join(" ")],
    ["生年月日", [formatEraDate(data.deceased.birthDate), data.deceased.age ? `満${data.deceased.age}歳` : ""].filter(Boolean).join(" / ")],
    ["故人住所", deceasedAddressForReport(data, true)],
    ["お迎え先", pickupText(data)],
    ["搬送先", [data.transport.destinationType, data.transport.destinationPlace].filter(Boolean).join(" / ")],
    ["宗教者関連", [
      data.religion.denomination ? `宗派: ${data.religion.denomination}` : "",
      shouldShowPriestIdentity(data) && data.religion.priestName ? `宗教者名: ${data.religion.priestName}` : "",
      religionCategoryText(data) ? `区分: ${religionCategoryText(data)}` : "",
      data.religion.hasPriest !== "無" && data.religion.contactStatus ? `連絡状況: ${data.religion.contactStatus}` : ""
    ].filter(Boolean).join(" / ")],
    ["枕経等日時", [formatMonthDayTime(data.schedule.pillowSutraDateTime), data.schedule.pillowSutraStatus].filter(Boolean).join(" / ")],
    ["通夜日時・場所", [`${data.schedule.wakeStatus || ""} ${formatMonthDayTime(data.schedule.wakeDateTime)}`.trim(), data.schedule.wakeHope, data.schedule.wakePlace].filter(Boolean).join(" / ")],
    ["葬儀日時・場所", [`${data.schedule.funeralStatus || ""} ${formatMonthDayTime(data.schedule.funeralDateTime)}`.trim(), data.schedule.funeralHope, data.schedule.funeralPlace].filter(Boolean).join(" / ")],
    ["出棺日時", formatMonthDayTime(data.schedule.departureDateTime)],
    ["火葬日時", formatMonthDayTime(data.schedule.cremationDateTime)],
    ["火葬場名", data.schedule.crematoriumName],
    ["火葬予約状況", data.schedule.cremationReservationStatus],
    ["予約番号", data.schedule.reservationNumber],
    ["待合室", data.schedule.waitingRoom],
    ["葬儀社からの連絡予定", phoneContactDisplayText(data)],
    ["連絡先", morningContactText(data)],
    ["控えの送付先", familyCopyDeliveryText(data.familyCopyDelivery)]
  ];
}

function buildFamilyCopyEmailText(data: HandoffData) {
  const rows = relativeCopyRows(data).map(([label, value]) => `${label}: ${displayValue(value)}`);
  return ["親族控え", "", "内容確認", ...rows].join("\n");
}

export function RelativeCopyReport({ data }: { data: HandoffData }) {
  const rows = relativeCopyRows(data);

  return (
    <div className="vendor-send-report relative-copy-report">
      <div className="paper-title">親族控え</div>
      <section className="vendor-send-section">
        <h3>内容確認</h3>
        <dl className="vendor-send-list">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{displayValue(value)}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

function buildVendorSendText(data: HandoffData) {
  const vendor = getVendorMap()[data.vendorId];
  const rows = vendorSendRows(data).map(([label, value]) => `${label}: ${displayValue(value)}`);
  const remarks = handoffRemarkLines(data).map((item) => `・${item}`);
  return [
    `業者送信用 引継ぎ事項（${vendor?.name || "業者未選択"}）`,
    "",
    ...rows,
    "",
    "【備考】",
    ...(remarks.length ? remarks : ["・なし"])
  ].filter((line, index, array) => line || array[index - 1]).join("\n");
}

export function VendorSendReport({ data }: { data: HandoffData }) {
  const vendor = getVendorMap()[data.vendorId];
  const rows = vendorSendRows(data);
  const remarks = handoffRemarkLines(data);

  return (
    <div className="vendor-send-report">
      <div className="paper-title">{`業者送信用 引継ぎ事項（${vendor?.name || "業者未選択"}）`}</div>
      <section className="vendor-send-section">
        <h3>引継ぎ情報</h3>
        <dl className="vendor-send-list">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{displayValue(value)}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="vendor-send-section">
        <h3>備考</h3>
        <ul className="handoff-summary">
          {(remarks.length ? remarks : ["なし"]).map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>
    </div>
  );
}

function PrivacyConsentInternalReport({ data }: { data: HandoffData }) {
  const signerName = data.privacyConsent.signerName || data.chiefMourner.name;
  return (
    <div className="privacy-consent-print">
      <PrivacyConsentView />
      <section className="vendor-send-section">
        <h3>同意取得情報（社内保管用）</h3>
        <dl className="vendor-send-list">
          <div>
            <dt>個人情報同意</dt>
            <dd>{privacyConsentInternalText(data)}</dd>
          </div>
          <div>
            <dt>氏名</dt>
            <dd>{signerName || "-"}</dd>
          </div>
          <div>
            <dt>保管区分</dt>
            <dd>{data.privacyConsent.internalOnly ? "社内保管用" : "-"}</dd>
          </div>
          <div>
            <dt>同意書版</dt>
            <dd>{data.privacyConsent.consentTextVersion}</dd>
          </div>
        </dl>
        <div className="handoff-memo-box">
          {data.privacyConsent.signatureDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="署名" src={data.privacyConsent.signatureDataUrl} className="signature-image" />
          ) : "ご署名："}
        </div>
      </section>
    </div>
  );
}

function PostWorkInternalReport({ data }: { data: HandoffData }) {
  return (
    <section className="vendor-send-section post-work-internal-report">
      <h3>業務終了後入力（社内確認用）</h3>
      <dl className="vendor-send-list">
        <div><dt>開始時間</dt><dd>{workStartText(data) || "-"}</dd></div>
        <div><dt>搬送距離</dt><dd>{data.postWork.transportDistanceKm ? `${data.postWork.transportDistanceKm}km` : "-"}</dd></div>
        <div><dt>終了時間</dt><dd>{workEndText(data) || "-"}</dd></div>
        <div><dt>保存情報</dt><dd>{[data.postWork.savedAt ? displayDateTime(data.postWork.savedAt) : "", data.postWork.savedBy.name].filter(Boolean).join(" / ") || "-"}</dd></div>
      </dl>
    </section>
  );
}

export function InternalStorageReport({ data }: { data: HandoffData }) {
  return (
    <div className="internal-storage-report">
      <PaperReport data={data} />
      <PostWorkInternalReport data={data} />
      <PrivacyConsentInternalReport data={data} />
    </div>
  );
}

export function HandoffReportForm({ formData, debugMode = false }: { formData: HandoffData; debugMode?: boolean }) {
  return <PaperReport data={formData} debugMode={debugMode} />;
}

export function PaperReport({ data, compact = false, debugMode = false }: { data: HandoffData; compact?: boolean; debugMode?: boolean }) {
  const branch = getBranches().find((item) => item.id === data.branchId);
  const vendor = getVendorMap()[data.vendorId];
  const rule = getVendorRule(data.vendorId);
  const showChiefBirth = Boolean(rule.showMournerBirthDate);
  const showVendorItems = Boolean(vendorItemRows(data).length);
  const ageText = data.deceased.age ? `満${data.deceased.age}歳` : "未計算";
  const contactOther = rule.showPreferredContact !== false && data.chiefMourner.preferredContact === "上記以外" ? data.chiefMourner.otherContact : "";
  const coffinText = data.supplies.coffinUsage === "手入力" ? data.supplies.coffinDetail : data.supplies.coffinUsage;
  const suppliesOther = suppliesOtherText(data);
  const paperVendorItemRows = vendorItemRows(data);
  const remarks = handoffRemarkLines(data);
  const vendorItemValue = (label: string, value: string) => {
    if (label === "葬儀規模") {
      return <CircleChoiceMarks label={label} value={value} options={rule.funeralScaleOptions.length ? rule.funeralScaleOptions : ["一般葬", "家族葬", "その他"]} />;
    }
    if (label === "会員・非会員") {
      return <CircleChoiceMarks label={label} value={value.replace(/^会員（.+）$/, "会員").replace(/^非会員（.+）$/, "非会員")} options={["会員", "非会員", "不明"]} />;
    }
    if (label === "組合員区分") {
      return <CircleChoiceMarks label={label} value={value} options={["正組合員", "准組合員", "非組合員"]} />;
    }
    return value || "-";
  };

  return (
    <div className={debugMode ? "paper-report paper-report-debug" : "paper-report"}>
      <div className="paper-title">{`業務引継書（${vendor?.name || "業者未選択"}）`}</div>
      <table className="paper-table">
        <colgroup>
          <col className="paper-col-side" />
          <col className="paper-col-label" />
          <col className="paper-col-main" />
          <col className="paper-col-main" />
          <col className="paper-col-mid" />
          <col className="paper-col-mid" />
          <col className="paper-col-main" />
        </colgroup>
        <tbody>
          <tr>
            <th rowSpan={3} className="vertical">{data.chiefMourner.role || "喪主・代表者"}</th>
            <th>氏名</th>
            <td colSpan={2} className="paper-emphasis chief-name-cell">
              <span className="dotted">{data.chiefMourner.kana}</span>
              <span className="name-line"><strong className="paper-name">{data.chiefMourner.name}</strong><span className="honorific">様</span></span>
            </td>
            <th>連絡先</th>
            <td colSpan={2} className="paper-phone"><span>自宅 {phoneOrNone(data.chiefMourner.homePhone)}</span><span>携帯 {phoneOrNone(data.chiefMourner.mobilePhone)}</span></td>
          </tr>
          <tr>
            <th>住所</th>
            <td colSpan={3} className="paper-emphasis address">{data.chiefMourner.address}</td>
            <th>希望連絡先</th>
            <td>{rule.showPreferredContact !== false ? `${data.chiefMourner.preferredContact}${contactOther ? ` / ${contactOther}` : ""}` : ""}</td>
          </tr>
          <tr>
            <th>喪主から見た続柄</th>
            <td colSpan={showChiefBirth ? 1 : 5}>{data.chiefMourner.relationshipToDeceased}</td>
            {showChiefBirth ? (
              <>
                <th>生年月日</th>
                <td colSpan={3}>{formatEraDate(data.chiefMourner.birthDate)}</td>
              </>
            ) : null}
          </tr>
          <tr>
            <th rowSpan={3} className="vertical">故人</th>
            <th>氏名</th>
            <td colSpan={2} className="paper-emphasis deceased-name-cell"><span className="dotted">{data.deceased.kana}</span><span className="name-line"><strong className="paper-name">{data.deceased.name}</strong><span className="honorific">様</span></span></td>
            <td className="paper-compact-cell">
              <span className="paper-field-label">性別</span>
              <CircleChoiceMarks label="性別" value={data.deceased.gender} options={["男", "女"]} />
            </td>
            <td colSpan={2} className="paper-birthdate">
              <div><span>生年月日 {formatEraDate(data.deceased.birthDate)}</span><span>{ageText}</span></div>
              <div className="paper-birthdate-death"><span>死亡日時 {data.deceased.deathDate.displayText}</span></div>
            </td>
          </tr>
          <tr>
            <th>住所</th>
            <td colSpan={3} className="paper-emphasis address">{deceasedAddressForReport(data, true)}</td>
            <th>喪主から見た続柄</th>
            <td>{data.deceased.relationshipToChief}</td>
          </tr>
          <tr>
            <td colSpan={6}>
              <div className="paper-inline-list four">
                <span>死亡診断書 <CircleChoiceMarks label="死亡診断書" value={data.deceased.deathCertificate} options={["有", "無"]} /></span>
                <span>検案書 <CircleChoiceMarks label="検案書" value={data.deceased.postmortemCertificate} options={["有", "無"]} /></span>
                <span>処置 <CircleChoiceMarks label="処置" value={data.deceased.treatment} options={["有", "無"]} /></span>
                <span>ペースメーカー <CircleChoiceMarks label="ペースメーカー" value={data.deceased.pacemaker} options={["有", "無"]} /></span>
              </div>
            </td>
          </tr>
          <tr>
            <th>お迎え先</th>
            <td colSpan={6}>{pickupText(data)}</td>
          </tr>
          <tr>
            <th>搬送先</th>
            <td colSpan={6}>{data.transport.destinationType}　場所 {data.transport.destinationPlace}</td>
          </tr>
          <tr>
            <th rowSpan={2}>宗教者関連</th>
            <td colSpan={2}>宗旨・宗派 {data.religion.denomination}</td>
            <td colSpan={2}>宗教者 {shouldShowPriestIdentity(data) ? [data.religion.priestName, data.religion.priestKana].filter(Boolean).join(" / ") : ""}</td>
            <td colSpan={2}>区分 {religionCategoryText(data)}</td>
          </tr>
          <tr>
            <td colSpan={3}></td>
            <td colSpan={3}>連絡状況 {data.religion.hasPriest !== "無" ? data.religion.contactStatus : ""}</td>
          </tr>
          <tr className="paper-word-row">
            <th className="paper-check-cell">✓</th>
            <th className="paper-number-cell">①</th>
            <th>確認事項</th>
            <td colSpan={4}>
              {showVendorItems ? (
                <div className="paper-pair-grid">
                  {paperVendorItemRows.map(([label, value]) => (
                    <span key={label}><strong>{label}</strong> {vendorItemValue(label, value)}</span>
                  ))}
                </div>
              ) : "なし"}
            </td>
          </tr>
          <tr className="paper-word-row">
            <th className="paper-check-cell">✓</th>
            <th className="paper-number-cell">②</th>
            <th>宗教者へ連絡</th>
            <td colSpan={4}>
              <div className="paper-inline-list">
                <span>連絡状況 {data.religion.hasPriest !== "無" ? data.religion.contactStatus : ""}</span>
                <span>宗教者 {shouldShowPriestIdentity(data) ? data.religion.priestName : ""}</span>
              </div>
            </td>
          </tr>
          <tr className="paper-word-row">
            <th className="paper-check-cell">✓</th>
            <th className="paper-number-cell">③</th>
            <th>枕経等日時</th>
            <td colSpan={4}>
              <div className="paper-inline-list">
                <span>枕経 {formatMonthDayTime(data.schedule.pillowSutraDateTime)}</span>
                <span>状態 {data.schedule.pillowSutraStatus}</span>
              </div>
            </td>
          </tr>
          <tr className="paper-word-row">
            <th className="paper-check-cell">✓</th>
            <th className="paper-number-cell">④</th>
            <th>通夜</th>
            <td colSpan={4}>
              <div className="paper-schedule-line">
                <span><StatusChoiceMarks value={data.schedule.wakeStatus} /></span>
                <span>{formatMonthDayTime(data.schedule.wakeDateTime)} <span className="paper-hope">{data.schedule.wakeHope}</span></span>
                <span>場所 {data.schedule.wakePlace}</span>
              </div>
            </td>
          </tr>
          <tr className="paper-word-row">
            <th className="paper-check-cell">✓</th>
            <th className="paper-number-cell">⑤</th>
            <th>葬儀</th>
            <td colSpan={4}>
              <div className="paper-schedule-line">
                <span><StatusChoiceMarks value={data.schedule.funeralStatus} /></span>
                <span>{formatMonthDayTime(data.schedule.funeralDateTime)} <span className="paper-hope">{data.schedule.funeralHope}</span></span>
                <span>場所 {data.schedule.funeralPlace}</span>
              </div>
            </td>
          </tr>
          <tr className="paper-word-row">
            <th rowSpan={2} className="paper-check-cell">✓</th>
            <th rowSpan={2} className="paper-number-cell">⑥</th>
            <th rowSpan={2}>火葬場予約<br />（出棺時間）</th>
            <td colSpan={4}>
              <div className="paper-schedule-line cremation">
                <span><StatusChoiceMarks value={data.schedule.crematoriumStatus} /></span>
                <span>出棺 {formatMonthDayTime(data.schedule.departureDateTime)}</span>
                <span>火葬 {formatMonthDayTime(data.schedule.cremationDateTime)}</span>
              </div>
            </td>
          </tr>
          <tr className="paper-word-row">
            <td colSpan={4}>
              <div className="paper-schedule-line cremation">
                <span>場所 {data.schedule.crematoriumName}</span>
                <span>予約番号 {data.schedule.reservationNumber}</span>
                <span>待合室 {data.schedule.waitingRoom}</span>
                <span>予約 <CircleChoiceMarks label="火葬予約状況" value={data.schedule.cremationReservationStatus} options={["済", "未"]} /></span>
              </div>
            </td>
          </tr>
          <tr className="paper-word-row">
            <th className="paper-check-cell">✓</th>
            <th className="paper-number-cell">⑦</th>
            <th>霊柩車</th>
            <td colSpan={4}>
              <div className="paper-inline-list">
                <span>霊柩車 {data.supplies.hearse}</span>
                <span>車種 {data.supplies.vehicleType}</span>
              </div>
            </td>
          </tr>
          <tr className="paper-word-row">
            <th className="paper-check-cell">✓</th>
            <th className="paper-number-cell">⑧</th>
            <th>電話連絡</th>
            <td colSpan={4}>
              <div className="paper-inline-list">
                <span>{phoneContactDisplayText(data)}</span>
                <span>朝の連絡先 {morningContactText(data)}</span>
              </div>
            </td>
          </tr>
          <tr className="paper-word-row">
            <th className="paper-check-cell">✓</th>
            <th className="paper-number-cell">⑨</th>
            <th>遺影写真</th>
            <td colSpan={4}>写真 <CircleChoiceMarks label="遺影写真" value={data.contactAndNotes.portraitPhoto} options={["有", "未定", "無"]} /></td>
          </tr>
          <tr className="paper-word-row">
            <th className="paper-check-cell">✓</th>
            <th className="paper-number-cell">⑩</th>
            <th>使用品<br />搬送距離等</th>
            <td colSpan={4}>
              <table className="paper-subtable supplies-subtable supplies-compact">
                <tbody>
                  <tr>
                    <th>布団</th>
                    <td>{data.supplies.futon}</td>
                    <th>ドライアイス</th>
                    <td>{data.supplies.dryIceKg}</td>
                    <th>枕飾り</th>
                    <td>{data.supplies.pillowDecorationSet}</td>
                  </tr>
                  <tr>
                    <th>樒</th>
                    <td>{data.supplies.shikimi}</td>
                    <th>面布</th>
                    <td>{data.supplies.faceCloth}</td>
                    <th>棺</th>
                    <td>{coffinText}</td>
                  </tr>
                  <tr>
                    <th>木魚リンセット貸出No</th>
                    <td>{data.supplies.mokugyoSetNo}</td>
                    <th>搬送距離</th>
                    <td>{data.postWork.transportDistanceKm ? `${data.postWork.transportDistanceKm}km` : ""}</td>
                    <th>その他</th>
                    <td>{suppliesOther}</td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
          <tr>
            <th>葬儀社連絡先</th>
            <td colSpan={6}>{data.contactAndNotes.funeralCompanyContact}</td>
          </tr>
          <tr>
            <th>備考</th>
            <td colSpan={6}>
              {remarks.length ? (
                <ul className="paper-note-list">
                  {remarks.map((item) => <li key={item}>{item}</li>)}
                </ul>
              ) : "なし"}
            </td>
          </tr>
          {!compact ? (
            <tr>
              <th>署名</th>
              <td colSpan={6}>
                <div className="paper-signature-row">
                  <div className="paper-signature-image">
                    {data.relativeConfirmation.signatureDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img alt="署名" src={data.relativeConfirmation.signatureDataUrl} className="signature-image" />
                    ) : "署名未取得"}
                  </div>
                  <div className="paper-work-times">
                    <span>開始 {workStartText(data) || "-"}</span>
                    <span>終了 {workEndText(data) || "-"}</span>
                  </div>
                </div>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
