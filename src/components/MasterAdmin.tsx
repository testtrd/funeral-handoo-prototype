"use client";

import { Download, Plus, RefreshCw, RotateCcw, Save, Upload } from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { AuthStatus } from "@/components/AuthGate";
import {
  buildDefaultMasterData,
  deleteBranch,
  deleteExtraQuestion,
  deleteVendor,
  exportMasterDataJson,
  getMasterData,
  importMasterDataJsonText,
  optionsToText,
  resetMasterDataToDefault,
  saveBranch,
  saveExtraQuestion,
  saveVendor,
  saveVendorRule,
  splitOptions,
  type ExtraQuestion,
  type ManagedBranch,
  type ManagedVendor,
  type MasterData,
  type VendorRule
} from "@/lib/masterDataService";

type MasterSection = "overview" | "branches" | "vendors" | "rules" | "questions";

const sectionLabels: Record<MasterSection, string> = {
  overview: "概要",
  branches: "拠点",
  vendors: "業者",
  rules: "業者ルール",
  questions: "追加質問"
};

const sectionLinks: Array<[MasterSection, string]> = [
  ["overview", "/admin/master"],
  ["branches", "/admin/master/branches"],
  ["vendors", "/admin/master/vendors"]
];

function nowIso() {
  return new Date().toISOString();
}

function emptyBranch(vendorIds: string[] = []): ManagedBranch {
  return { id: "", name: "", enabled: true, vendorIds, createdAt: nowIso(), updatedAt: nowIso() };
}

function emptyVendor(branchIds: string[] = []): ManagedVendor {
  return { id: "", name: "", funeralCompanyContact: "", branchIds, pdfTemplate: "", outputFolder: "", sendTo: "", enabled: true, createdAt: nowIso(), updatedAt: nowIso() };
}

function emptyQuestion(vendorId = ""): ExtraQuestion {
  return {
    id: `question_${Date.now()}`,
    vendorId,
    label: "",
    description: "",
    inputType: "text",
    options: [],
    required: false,
    showOnConfirm: true,
    showOnVendorPdf: true,
    showOnInternalPdf: true,
    enabled: true,
    sortOrder: 50
  };
}

function toggleList(list: string[], value: string) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function vendorsForBranch(master: MasterData, branchId: string) {
  if (!branchId) return master.vendors.filter((vendor) => vendor.enabled);
  const branch = master.branches.find((item) => item.id === branchId);
  const branchVendorIds = new Set(branch?.vendorIds || []);
  return master.vendors.filter((vendor) => vendor.enabled && (
    branchVendorIds.has(vendor.id) || vendor.branchIds.includes(branchId)
  ));
}

function branchIdForVendor(master: MasterData, vendorId: string) {
  const vendor = master.vendors.find((item) => item.id === vendorId);
  return vendor?.branchIds[0] || master.branches.find((branch) => branch.vendorIds.includes(vendorId))?.id || master.branches[0]?.id || "";
}

function BoolField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="master-check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="master-field">
      <span>{label}</span>
      <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextAreaField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="master-field">
      <span>{label}</span>
      <textarea value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export default function MasterAdmin({ section = "overview" }: { section?: MasterSection }) {
  const [master, setMaster] = useState<MasterData>(() => getMasterData());
  const [branchForm, setBranchForm] = useState<ManagedBranch>(() => emptyBranch());
  const [vendorBranchId, setVendorBranchId] = useState(() => getMasterData().branches[0]?.id || "");
  const [vendorForm, setVendorForm] = useState<ManagedVendor>(() => emptyVendor());
  const [ruleBranchId, setRuleBranchId] = useState(() => getMasterData().branches[0]?.id || "");
  const [ruleVendorId, setRuleVendorId] = useState(() => {
    const data = getMasterData();
    const branchId = data.branches[0]?.id || "";
    return vendorsForBranch(data, branchId)[0]?.id || data.vendors[0]?.id || "";
  });
  const [ruleForm, setRuleForm] = useState<VendorRule | null>(null);
  const [questionBranchId, setQuestionBranchId] = useState(() => getMasterData().branches[0]?.id || "");
  const [questionForm, setQuestionForm] = useState<ExtraQuestion>(() => {
    const data = getMasterData();
    const branchId = data.branches[0]?.id || "";
    return emptyQuestion(vendorsForBranch(data, branchId)[0]?.id || data.vendors[0]?.id || "");
  });
  const importRef = useRef<HTMLInputElement>(null);

  const selectedRule = useMemo(() => {
    const base = buildDefaultMasterData().vendorRules[0];
    if (ruleForm?.vendorId === ruleVendorId) return ruleForm;
    return master.vendorRules.find((rule) => rule.vendorId === ruleVendorId) || { ...base, vendorId: ruleVendorId };
  }, [master.vendorRules, ruleForm, ruleVendorId]);
  const ruleVendors = useMemo(() => vendorsForBranch(master, ruleBranchId), [master, ruleBranchId]);

  useEffect(() => {
    if (!ruleVendors.length) {
      setRuleVendorId("");
      setRuleForm(null);
      return;
    }
    if (!ruleVendors.some((vendor) => vendor.id === ruleVendorId)) {
      setRuleVendorId(ruleVendors[0].id);
      setRuleForm(null);
    }
  }, [ruleVendors, ruleVendorId]);
  const questionVendors = useMemo(() => vendorsForBranch(master, questionBranchId), [master, questionBranchId]);

  useEffect(() => {
    if (!questionVendors.length) {
      setQuestionForm((current) => ({ ...current, vendorId: "" }));
      return;
    }
    if (!questionVendors.some((vendor) => vendor.id === questionForm.vendorId)) {
      setQuestionForm((current) => ({ ...current, vendorId: questionVendors[0].id }));
    }
  }, [questionVendors, questionForm.vendorId]);
  const visibleVendors = useMemo(() => vendorsForBranch(master, vendorBranchId), [master, vendorBranchId]);
  const isVendorSaved = useMemo(() => master.vendors.some((vendor) => vendor.id === vendorForm.id), [master.vendors, vendorForm.id]);
  const selectedVendorRule = useMemo(() => {
    if (!vendorForm.id) return null;
    const base = buildDefaultMasterData().vendorRules[0];
    if (ruleForm?.vendorId === vendorForm.id) return ruleForm;
    return master.vendorRules.find((rule) => rule.vendorId === vendorForm.id) || { ...base, vendorId: vendorForm.id };
  }, [master.vendorRules, ruleForm, vendorForm.id]);
  const vendorQuestions = useMemo(() => {
    if (!vendorForm.id) return [];
    return master.extraQuestions
      .filter((question) => question.vendorId === vendorForm.id)
      .sort((left, right) => left.sortOrder - right.sortOrder);
  }, [master.extraQuestions, vendorForm.id]);

  useEffect(() => {
    if (section !== "vendors" || !vendorForm.id) return;
    if (questionForm.vendorId !== vendorForm.id) {
      setQuestionForm(emptyQuestion(vendorForm.id));
    }
  }, [section, vendorForm.id, questionForm.vendorId]);

  function reload() {
    setMaster(getMasterData());
  }

  function importJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importMasterDataJsonText(String(reader.result));
        reload();
        alert("マスター設定を読み込みました。");
      } catch {
        alert("マスターJSONを読み込めませんでした。");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  function resetDefault() {
    const ok = window.confirm("現在の拠点・業者・業者別ルール設定をデフォルトに戻します。\nこの操作は元に戻せません。\n実行してよろしいですか？");
    if (!ok) return;
    resetMasterDataToDefault();
    reload();
  }

  function submitBranch() {
    if (!branchForm.id || !branchForm.name) return alert("拠点IDと拠点名を入力してください。");
    saveBranch(branchForm);
    setBranchForm(emptyBranch());
    reload();
  }

  function submitVendor() {
    if (!vendorForm.id || !vendorForm.name) return alert("業者IDと業者名を入力してください。");
    saveVendor(vendorForm);
    setVendorForm(emptyVendor());
    reload();
  }

  function selectVendorForEdit(vendor: ManagedVendor) {
    const branchId = branchIdForVendor(master, vendor.id);
    setVendorBranchId(branchId);
    setVendorForm(vendor);
    setRuleBranchId(branchId);
    setRuleVendorId(vendor.id);
    setRuleForm(null);
    setQuestionBranchId(branchId);
    setQuestionForm(emptyQuestion(vendor.id));
  }

  function submitRule(rule: VendorRule) {
    saveVendorRule(rule);
    reload();
  }

  function submitQuestion() {
    if (!questionForm.id || !questionForm.vendorId || !questionForm.label) return alert("質問ID・対象業者・項目名を入力してください。");
    saveExtraQuestion(questionForm);
    setQuestionForm(emptyQuestion(questionForm.vendorId));
    reload();
  }

  function submitVendorQuestion() {
    if (!vendorForm.id) return alert("先に業者を選択してください。");
    const nextQuestion = { ...questionForm, vendorId: vendorForm.id };
    if (!nextQuestion.id || !nextQuestion.label) return alert("質問ID・項目名を入力してください。");
    saveExtraQuestion(nextQuestion);
    setQuestionForm(emptyQuestion(vendorForm.id));
    reload();
  }

  function renderRuleFields(
    rule: VendorRule,
    onChange: (nextRule: VendorRule) => void,
    onSave: () => void,
    saveLabel = "ルールを保存"
  ) {
    return (
      <div className="master-form">
        <div className="master-check-grid">
          {[
            ["火葬予約済みを必須にする", "cremationReservationRequired"],
            ["未予約なら完了不可にする", "blockCompletionIfCremationNotReserved"],
            ["喪主・代表者の生年月日を表示", "showMournerBirthDate"],
            ["喪主・代表者の生年月日を必須", "requireMournerBirthDate"],
            ["連絡希望先を表示", "showPreferredContact"],
            ["葬儀規模を表示", "showFuneralScale"],
            ["会員・非会員を表示", "showMembership"],
            ["組合員区分を表示", "showUnionMemberType"],
            ["外部問い合わせ回答を表示", "showExternalInquiryAnswer"],
            ["遺影写真を表示", "showPortraitPhoto"],
            ["ペースメーカーを表示", "showPacemaker"],
            ["ペースメーカーを必須", "requirePacemaker"],
            ["火葬予約前確認を表示", "showCremationPreCheck"],
            ["有効", "enabled"]
          ].map(([label, key]) => (
            <BoolField
              key={key}
              label={label}
              checked={Boolean(rule[key as keyof VendorRule])}
              onChange={(checked) => onChange({ ...rule, [key]: checked })}
            />
          ))}
        </div>
        <TextAreaField label="葬儀規模 選択肢" value={optionsToText(rule.funeralScaleOptions)} onChange={(text) => onChange({ ...rule, funeralScaleOptions: splitOptions(text) })} />
        <TextAreaField label="会員・非会員 選択肢" value={optionsToText(rule.membershipOptions)} onChange={(text) => onChange({ ...rule, membershipOptions: splitOptions(text) })} />
        <TextAreaField label="組合員区分 選択肢" value={optionsToText(rule.unionMemberTypeOptions)} onChange={(text) => onChange({ ...rule, unionMemberTypeOptions: splitOptions(text) })} />
        <TextAreaField label="外部問い合わせ回答 選択肢" value={optionsToText(rule.externalInquiryAnswerOptions)} onChange={(text) => onChange({ ...rule, externalInquiryAnswerOptions: splitOptions(text) })} />
        <TextAreaField label="遺影写真 選択肢" value={optionsToText(rule.portraitPhotoOptions)} onChange={(text) => onChange({ ...rule, portraitPhotoOptions: splitOptions(text) })} />
        <TextAreaField
          label="業務終了後入力 引継ぎ候補"
          value={optionsToText(rule.handoffNoteOptions)}
          onChange={(text) => onChange({ ...rule, handoffNoteOptions: splitOptions(text) })}
          placeholder="例：火葬予約済み"
        />
        <button className="primary" disabled={!rule.vendorId} onClick={onSave}><Save size={18} /> {saveLabel}</button>
      </div>
    );
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">管理画面</p>
          <h1>マスター管理</h1>
          <p className="small">拠点、業者、業者ごとの表示ルールをブラウザ内に保存して管理します。</p>
        </div>
        <div className="toolbar">
          <AuthStatus />
          <button onClick={reload}><RefreshCw size={18} /> 更新</button>
          <button onClick={exportMasterDataJson}><Download size={18} /> JSON出力</button>
          <button onClick={() => importRef.current?.click()}><Upload size={18} /> JSON読込</button>
          <button onClick={resetDefault}><RotateCcw size={18} /> デフォルトに戻す</button>
          <a className="button-link" href="/dashboard">ダッシュボードへ戻る</a>
          <input ref={importRef} className="hidden-input" type="file" accept="application/json" onChange={importJson} />
        </div>
      </header>

      <nav className="master-nav" aria-label="マスター管理メニュー">
        {sectionLinks.map(([key, href]) => <a key={key} className={section === key ? "active" : ""} href={href}>{sectionLabels[key]}</a>)}
      </nav>

      {section === "overview" ? (
        <section className="admin-summary">
          <div><span>拠点</span><strong>{master.branches.length}件</strong></div>
          <div><span>業者</span><strong>{master.vendors.length}件</strong></div>
          <div><span>業者ルール</span><strong>{master.vendorRules.length}件</strong></div>
          <div><span>追加質問</span><strong>{master.extraQuestions.length}件</strong></div>
        </section>
      ) : null}

      {section === "branches" ? (
        <section className="master-layout">
          <article className="master-panel">
            <h2>拠点一覧</h2>
            <table className="admin-table compact">
              <thead><tr><th>拠点ID</th><th>拠点名</th><th>状態</th><th>業者数</th><th></th></tr></thead>
              <tbody>{master.branches.map((branch) => (
                <tr key={branch.id}>
                  <td>{branch.id}</td><td>{branch.name}</td><td>{branch.enabled ? "有効" : "無効"}</td><td>{branch.vendorIds.length}</td>
                  <td><button onClick={() => setBranchForm(branch)}>編集</button><button onClick={() => { deleteBranch(branch.id); reload(); }}>削除</button></td>
                </tr>
              ))}</tbody>
            </table>
          </article>
          <article className="master-panel">
            <h2>拠点を追加・編集</h2>
            <div className="master-form">
              <TextField label="拠点ID" value={branchForm.id} onChange={(id) => setBranchForm({ ...branchForm, id })} placeholder="例：head_office" />
              <TextField label="拠点名" value={branchForm.name} onChange={(name) => setBranchForm({ ...branchForm, name })} placeholder="例：本社" />
              <BoolField label="有効" checked={branchForm.enabled} onChange={(enabled) => setBranchForm({ ...branchForm, enabled })} />
              <button className="primary" onClick={submitBranch}><Save size={18} /> 保存</button>
              <button onClick={() => setBranchForm(emptyBranch())}><Plus size={18} /> 新規入力</button>
            </div>
          </article>
        </section>
      ) : null}

      {section === "vendors" ? (
        <section className="master-layout">
          <article className="master-panel">
            <h2>業者一覧</h2>
            <label className="master-field">
              <span>対象拠点</span>
              <select
                value={vendorBranchId}
                onChange={(event) => {
                  const nextBranchId = event.target.value;
                  setVendorBranchId(nextBranchId);
                  setVendorForm(emptyVendor(nextBranchId ? [nextBranchId] : []));
                }}
              >
                {master.branches.filter((branch) => branch.enabled).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </label>
            <table className="admin-table compact">
              <thead><tr><th>業者ID</th><th>業者名</th><th>葬儀社連絡先</th><th>状態</th><th></th></tr></thead>
              <tbody>{visibleVendors.map((vendor) => (
                <tr key={vendor.id}>
                  <td>{vendor.id}</td><td>{vendor.name}</td><td>{vendor.funeralCompanyContact || "未登録"}</td><td>{vendor.enabled ? "有効" : "無効"}</td>
                  <td><button onClick={() => selectVendorForEdit(vendor)}>編集</button><button onClick={() => { deleteVendor(vendor.id); reload(); }}>削除</button></td>
                </tr>
              ))}
              {!visibleVendors.length ? <tr><td colSpan={5} className="empty-state">この拠点に紐づく業者はありません。</td></tr> : null}</tbody>
            </table>
          </article>
          <article className="master-panel">
            <h2>業者を追加・編集</h2>
            <div className="master-form">
              <TextField label="業者ID" value={vendorForm.id} onChange={(id) => setVendorForm({ ...vendorForm, id })} placeholder="例：ja_aichi_toyota_service" />
              <TextField label="業者名" value={vendorForm.name} onChange={(name) => setVendorForm({ ...vendorForm, name })} />
              <TextField label="葬儀社連絡先" value={vendorForm.funeralCompanyContact} onChange={(funeralCompanyContact) => setVendorForm({ ...vendorForm, funeralCompanyContact })} placeholder="例：0120-000-000" />
              <TextField label="送信先" value={vendorForm.sendTo} onChange={(sendTo) => setVendorForm({ ...vendorForm, sendTo })} placeholder="メール・LINE WORKS等の控え" />
              <TextField label="PDFテンプレート" value={vendorForm.pdfTemplate} onChange={(pdfTemplate) => setVendorForm({ ...vendorForm, pdfTemplate })} />
              <TextField label="出力フォルダ" value={vendorForm.outputFolder} onChange={(outputFolder) => setVendorForm({ ...vendorForm, outputFolder })} />
              <BoolField label="有効" checked={vendorForm.enabled} onChange={(enabled) => setVendorForm({ ...vendorForm, enabled })} />
              <div className="master-check-grid">
                {master.branches.map((branch) => (
                  <BoolField key={branch.id} label={branch.name} checked={vendorForm.branchIds.includes(branch.id)} onChange={() => setVendorForm({ ...vendorForm, branchIds: toggleList(vendorForm.branchIds, branch.id) })} />
                ))}
              </div>
              <button className="primary" onClick={submitVendor}><Save size={18} /> 保存</button>
              <button onClick={() => setVendorForm(emptyVendor(vendorBranchId ? [vendorBranchId] : []))}><Plus size={18} /> 新規入力</button>
            </div>
          </article>
          {vendorForm.id && !isVendorSaved ? (
            <article className="master-panel">
              <h2>業者ルール・追加質問</h2>
              <p className="small">業者情報を保存すると、この画面で業者ルールと追加質問を編集できます。</p>
            </article>
          ) : null}
          {isVendorSaved && selectedVendorRule ? (
            <article className="master-panel">
              <h2>{vendorForm.name || vendorForm.id} の業者ルール</h2>
              <p className="small">選択中の業者に対する入力項目の表示条件や選択肢を設定します。</p>
              {renderRuleFields(
                selectedVendorRule,
                (nextRule) => setRuleForm(nextRule),
                () => {
                  submitRule(selectedVendorRule);
                  setRuleForm(null);
                },
                "業者ルールを保存"
              )}
            </article>
          ) : null}
          {isVendorSaved ? (
            <article className="master-panel">
              <h2>{vendorForm.name || vendorForm.id} の追加質問</h2>
              <table className="admin-table compact">
                <thead><tr><th>項目名</th><th>形式</th><th>必須</th><th>状態</th><th></th></tr></thead>
                <tbody>
                  {vendorQuestions.map((question) => (
                    <tr key={question.id}>
                      <td>{question.label}</td>
                      <td>{question.inputType}</td>
                      <td>{question.required ? "必須" : "-"}</td>
                      <td>{question.enabled ? "有効" : "無効"}</td>
                      <td>
                        <button onClick={() => setQuestionForm(question)}>編集</button>
                        <button onClick={() => { deleteExtraQuestion(question.id); reload(); }}>削除</button>
                      </td>
                    </tr>
                  ))}
                  {!vendorQuestions.length ? <tr><td colSpan={5} className="empty-state">この業者の追加質問はありません。</td></tr> : null}
                </tbody>
              </table>
              <div className="master-form">
                <TextField label="質問ID" value={questionForm.vendorId === vendorForm.id ? questionForm.id : ""} onChange={(id) => setQuestionForm({ ...(questionForm.vendorId === vendorForm.id ? questionForm : emptyQuestion(vendorForm.id)), id, vendorId: vendorForm.id })} />
                <TextField label="項目名" value={questionForm.vendorId === vendorForm.id ? questionForm.label : ""} onChange={(label) => setQuestionForm({ ...(questionForm.vendorId === vendorForm.id ? questionForm : emptyQuestion(vendorForm.id)), label, vendorId: vendorForm.id })} />
                <TextField label="説明文" value={questionForm.vendorId === vendorForm.id ? questionForm.description : ""} onChange={(description) => setQuestionForm({ ...(questionForm.vendorId === vendorForm.id ? questionForm : emptyQuestion(vendorForm.id)), description, vendorId: vendorForm.id })} />
                <label className="master-field">
                  <span>入力形式</span>
                  <select value={questionForm.vendorId === vendorForm.id ? questionForm.inputType : "text"} onChange={(event) => setQuestionForm({ ...(questionForm.vendorId === vendorForm.id ? questionForm : emptyQuestion(vendorForm.id)), inputType: event.target.value as ExtraQuestion["inputType"], vendorId: vendorForm.id })}>
                    {["text", "textarea", "radio", "checkbox", "date", "time", "number"].map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </label>
                <TextAreaField label="選択肢（1行に1つ、radio/checkbox用）" value={questionForm.vendorId === vendorForm.id ? optionsToText(questionForm.options) : ""} onChange={(text) => setQuestionForm({ ...(questionForm.vendorId === vendorForm.id ? questionForm : emptyQuestion(vendorForm.id)), options: splitOptions(text), vendorId: vendorForm.id })} />
                <TextField label="表示順" value={String(questionForm.vendorId === vendorForm.id ? questionForm.sortOrder : 50)} onChange={(sortOrder) => setQuestionForm({ ...(questionForm.vendorId === vendorForm.id ? questionForm : emptyQuestion(vendorForm.id)), sortOrder: Number(sortOrder) || 0, vendorId: vendorForm.id })} />
                <div className="master-check-grid">
                  <BoolField label="必須" checked={questionForm.vendorId === vendorForm.id ? questionForm.required : false} onChange={(required) => setQuestionForm({ ...(questionForm.vendorId === vendorForm.id ? questionForm : emptyQuestion(vendorForm.id)), required, vendorId: vendorForm.id })} />
                  <BoolField label="確認画面に表示" checked={questionForm.vendorId === vendorForm.id ? questionForm.showOnConfirm : true} onChange={(showOnConfirm) => setQuestionForm({ ...(questionForm.vendorId === vendorForm.id ? questionForm : emptyQuestion(vendorForm.id)), showOnConfirm, vendorId: vendorForm.id })} />
                  <BoolField label="業者提出用に表示" checked={questionForm.vendorId === vendorForm.id ? questionForm.showOnVendorPdf : true} onChange={(showOnVendorPdf) => setQuestionForm({ ...(questionForm.vendorId === vendorForm.id ? questionForm : emptyQuestion(vendorForm.id)), showOnVendorPdf, vendorId: vendorForm.id })} />
                  <BoolField label="社内保管用に表示" checked={questionForm.vendorId === vendorForm.id ? questionForm.showOnInternalPdf : true} onChange={(showOnInternalPdf) => setQuestionForm({ ...(questionForm.vendorId === vendorForm.id ? questionForm : emptyQuestion(vendorForm.id)), showOnInternalPdf, vendorId: vendorForm.id })} />
                  <BoolField label="有効" checked={questionForm.vendorId === vendorForm.id ? questionForm.enabled : true} onChange={(enabled) => setQuestionForm({ ...(questionForm.vendorId === vendorForm.id ? questionForm : emptyQuestion(vendorForm.id)), enabled, vendorId: vendorForm.id })} />
                </div>
                <button className="primary" onClick={submitVendorQuestion}><Save size={18} /> 追加質問を保存</button>
                <button onClick={() => setQuestionForm(emptyQuestion(vendorForm.id))}><Plus size={18} /> 新規入力</button>
              </div>
            </article>
          ) : null}
        </section>
      ) : null}

      {section === "rules" ? (
        <section className="master-panel">
          <h2>業者ルール</h2>
          <div className="master-form">
            <label className="master-field">
              <span>対象拠点</span>
              <select
                value={ruleBranchId}
                onChange={(event) => {
                  const nextBranchId = event.target.value;
                  const nextVendors = vendorsForBranch(master, nextBranchId);
                  setRuleBranchId(nextBranchId);
                  setRuleVendorId(nextVendors[0]?.id || "");
                  setRuleForm(null);
                }}
              >
                {master.branches.filter((branch) => branch.enabled).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </label>
            <label className="master-field">
              <span>対象業者</span>
              <select
                value={ruleVendorId}
                disabled={!ruleVendors.length}
                onChange={(event) => {
                  setRuleVendorId(event.target.value);
                  setRuleForm(null);
                }}
              >
                {ruleVendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
              </select>
            </label>
            {!ruleVendors.length ? <p className="small">この拠点に紐づく業者がありません。先に「業者」画面で対象拠点を設定してください。</p> : null}
            <div className="master-check-grid">
              {[
                ["火葬予約済みを必須にする", "cremationReservationRequired"],
                ["未予約なら完了不可にする", "blockCompletionIfCremationNotReserved"],
                ["喪主・代表者の生年月日を表示", "showMournerBirthDate"],
                ["喪主・代表者の生年月日を必須", "requireMournerBirthDate"],
                ["連絡希望先を表示", "showPreferredContact"],
                ["葬儀規模を表示", "showFuneralScale"],
                ["会員・非会員を表示", "showMembership"],
                ["組合員区分を表示", "showUnionMemberType"],
                ["外部問い合わせ回答を表示", "showExternalInquiryAnswer"],
                ["遺影写真を表示", "showPortraitPhoto"],
                ["ペースメーカーを表示", "showPacemaker"],
                ["ペースメーカーを必須", "requirePacemaker"],
                ["火葬予約前確認を表示", "showCremationPreCheck"],
                ["有効", "enabled"]
              ].map(([label, key]) => (
                <BoolField key={key} label={label} checked={Boolean(selectedRule[key as keyof VendorRule])} onChange={(checked) => setRuleForm({ ...selectedRule, [key]: checked })} />
              ))}
            </div>
            <TextAreaField label="葬儀規模 選択肢" value={optionsToText(selectedRule.funeralScaleOptions)} onChange={(text) => setRuleForm({ ...selectedRule, funeralScaleOptions: splitOptions(text) })} />
            <TextAreaField label="会員・非会員 選択肢" value={optionsToText(selectedRule.membershipOptions)} onChange={(text) => setRuleForm({ ...selectedRule, membershipOptions: splitOptions(text) })} />
            <TextAreaField label="組合員区分 選択肢" value={optionsToText(selectedRule.unionMemberTypeOptions)} onChange={(text) => setRuleForm({ ...selectedRule, unionMemberTypeOptions: splitOptions(text) })} />
            <TextAreaField label="外部問い合わせ回答 選択肢" value={optionsToText(selectedRule.externalInquiryAnswerOptions)} onChange={(text) => setRuleForm({ ...selectedRule, externalInquiryAnswerOptions: splitOptions(text) })} />
            <TextAreaField label="遺影写真 選択肢" value={optionsToText(selectedRule.portraitPhotoOptions)} onChange={(text) => setRuleForm({ ...selectedRule, portraitPhotoOptions: splitOptions(text) })} />
            <TextAreaField
              label="業務終了後入力 引継ぎ候補"
              value={optionsToText(selectedRule.handoffNoteOptions)}
              onChange={(text) => setRuleForm({ ...selectedRule, handoffNoteOptions: splitOptions(text) })}
              placeholder="例：火葬予約済み"
            />
            <button className="primary" disabled={!ruleVendorId} onClick={() => { submitRule(selectedRule); setRuleForm(null); }}><Save size={18} /> ルールを保存</button>
          </div>
        </section>
      ) : null}

      {section === "questions" ? (
        <section className="master-layout">
          <article className="master-panel">
            <h2>追加質問一覧</h2>
            <table className="admin-table compact">
              <thead><tr><th>対象業者</th><th>項目名</th><th>形式</th><th>必須</th><th>状態</th><th></th></tr></thead>
              <tbody>{master.extraQuestions.map((question) => (
                <tr key={question.id}>
                  <td>{master.vendors.find((vendor) => vendor.id === question.vendorId)?.name || question.vendorId}</td><td>{question.label}</td><td>{question.inputType}</td><td>{question.required ? "必須" : "-"}</td><td>{question.enabled ? "有効" : "無効"}</td>
                  <td><button onClick={() => { setQuestionBranchId(branchIdForVendor(master, question.vendorId)); setQuestionForm(question); }}>編集</button><button onClick={() => { deleteExtraQuestion(question.id); reload(); }}>削除</button></td>
                </tr>
              ))}</tbody>
            </table>
          </article>
          <article className="master-panel">
            <h2>追加質問を追加・編集</h2>
            <div className="master-form">
              <TextField label="質問ID" value={questionForm.id} onChange={(id) => setQuestionForm({ ...questionForm, id })} />
              <label className="master-field">
                <span>対象拠点</span>
                <select
                  value={questionBranchId}
                  onChange={(event) => {
                    const nextBranchId = event.target.value;
                    const nextVendors = vendorsForBranch(master, nextBranchId);
                    setQuestionBranchId(nextBranchId);
                    setQuestionForm({ ...questionForm, vendorId: nextVendors[0]?.id || "" });
                  }}
                >
                  {master.branches.filter((branch) => branch.enabled).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
              </label>
              <label className="master-field">
                <span>対象業者</span>
                <select value={questionForm.vendorId} disabled={!questionVendors.length} onChange={(event) => setQuestionForm({ ...questionForm, vendorId: event.target.value })}>
                  {questionVendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
                </select>
              </label>
              {!questionVendors.length ? <p className="small">この拠点に紐づく業者がありません。先に「業者」画面で対象拠点を設定してください。</p> : null}
              <TextField label="項目名" value={questionForm.label} onChange={(label) => setQuestionForm({ ...questionForm, label })} />
              <TextField label="説明文" value={questionForm.description} onChange={(description) => setQuestionForm({ ...questionForm, description })} />
              <label className="master-field">
                <span>入力形式</span>
                <select value={questionForm.inputType} onChange={(event) => setQuestionForm({ ...questionForm, inputType: event.target.value as ExtraQuestion["inputType"] })}>
                  {["text", "textarea", "radio", "checkbox", "date", "time", "number"].map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              <TextAreaField label="選択肢（1行に1つ、radio/checkbox用）" value={optionsToText(questionForm.options)} onChange={(text) => setQuestionForm({ ...questionForm, options: splitOptions(text) })} />
              <TextField label="表示順" value={String(questionForm.sortOrder)} onChange={(sortOrder) => setQuestionForm({ ...questionForm, sortOrder: Number(sortOrder) || 0 })} />
              <div className="master-check-grid">
                <BoolField label="必須" checked={questionForm.required} onChange={(required) => setQuestionForm({ ...questionForm, required })} />
                <BoolField label="確認画面に表示" checked={questionForm.showOnConfirm} onChange={(showOnConfirm) => setQuestionForm({ ...questionForm, showOnConfirm })} />
                <BoolField label="業者提出用に表示" checked={questionForm.showOnVendorPdf} onChange={(showOnVendorPdf) => setQuestionForm({ ...questionForm, showOnVendorPdf })} />
                <BoolField label="社内保管用に表示" checked={questionForm.showOnInternalPdf} onChange={(showOnInternalPdf) => setQuestionForm({ ...questionForm, showOnInternalPdf })} />
                <BoolField label="有効" checked={questionForm.enabled} onChange={(enabled) => setQuestionForm({ ...questionForm, enabled })} />
              </div>
              <button className="primary" disabled={!questionForm.vendorId} onClick={submitQuestion}><Save size={18} /> 保存</button>
              <button onClick={() => setQuestionForm(emptyQuestion(questionVendors[0]?.id || ""))}><Plus size={18} /> 新規入力</button>
            </div>
          </article>
        </section>
      ) : null}
    </main>
  );
}
