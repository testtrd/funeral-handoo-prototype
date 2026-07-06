import type { DeathDateValue, Era, EraDateValue, MonthDayTimeValue } from "@/types/form";

const eraStartYear: Record<Era, number> = {
  taisho: 1912,
  showa: 1926,
  heisei: 1989,
  reiwa: 2019
};

export const eraLabels: Record<Era, string> = {
  taisho: "大正",
  showa: "昭和",
  heisei: "平成",
  reiwa: "令和"
};

export function emptyEraDate(withTime = false): EraDateValue {
  return { era: "reiwa", year: "", month: "", day: "", time: withTime ? "" : undefined, iso: "" };
}

export function emptyDeathDate(): DeathDateValue {
  return {
    era: "reiwa",
    year: "",
    month: "",
    day: "",
    timeType: "通常",
    period: "",
    hour: "",
    minute: "",
    otherText: "",
    iso: null,
    displayText: ""
  };
}

export function toWesternYear(era: Era, year: string): number | null {
  const numericYear = Number(year);
  if (!Number.isInteger(numericYear) || numericYear <= 0) return null;
  return eraStartYear[era] + numericYear - 1;
}

export function normalizeEraDate(value: EraDateValue, requireTime = false): { iso: string; error?: string } {
  if (!value.year || !value.month || !value.day) return { iso: "", error: "年月日を入力してください。" };
  const westernYear = toWesternYear(value.era, value.year);
  const month = Number(value.month);
  const day = Number(value.day);
  if (!westernYear || !Number.isInteger(month) || !Number.isInteger(day)) return { iso: "", error: "日付の形式を確認してください。" };
  const date = new Date(westernYear, month - 1, day);
  if (date.getFullYear() !== westernYear || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return { iso: "", error: "存在しない日付です。" };
  }
  const time = value.time || "";
  if (requireTime && !time) return { iso: "", error: "時刻を入力してください。" };
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { iso: "", error: "時刻は 00:00 から 23:59 の形式で入力してください。" };
  const datePart = `${westernYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { iso: time ? `${datePart}T${time}` : datePart };
}

export function formatEraDate(value?: EraDateValue): string {
  if (!value || !value.year || !value.month || !value.day) return "";
  const label = eraLabels[value.era] || "";
  const time = value.time ? ` ${value.time.replace(":", "時")}分` : "";
  return `${label}${value.year}年${Number(value.month)}月${Number(value.day)}日${time}`;
}

function validDateParts(era: Era | "", year: string, month: string, day: string) {
  if (!era || !year || !month || !day) return { datePart: "", error: "" };
  const westernYear = toWesternYear(era, year);
  const m = Number(month);
  const d = Number(day);
  if (!westernYear || !Number.isInteger(m) || !Number.isInteger(d)) return { datePart: "", error: "死亡日時の日付形式を確認してください。" };
  const date = new Date(westernYear, m - 1, d);
  if (date.getFullYear() !== westernYear || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return { datePart: "", error: "死亡日時に存在しない日付が入力されています。" };
  }
  return {
    datePart: `${westernYear}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    eraText: `${eraLabels[era]}${year}年${m}月${d}日`,
    error: ""
  };
}

export function normalizeDeathDate(value: DeathDateValue): { value: DeathDateValue; error?: string } {
  const parts = validDateParts(value.era, value.year, value.month, value.day);
  if (parts.error) return { value: { ...value, iso: null, displayText: "" }, error: parts.error };

  if (value.timeType === "不詳") {
    const displayText = parts.eraText ? `${parts.eraText} 時刻不詳` : "死亡日時不詳";
    return { value: { ...value, iso: null, displayText } };
  }

  if (value.timeType === "その他") {
    if (!value.otherText.trim()) return { value: { ...value, iso: null, displayText: "" }, error: "死亡日時のその他手入力欄を入力してください。" };
    const displayText = [parts.eraText, value.otherText.trim()].filter(Boolean).join(" ");
    return { value: { ...value, iso: null, displayText } };
  }

  if (!parts.eraText || !parts.datePart) {
    return { value: { ...value, iso: null, displayText: "" }, error: "死亡日時の年月日を入力してください。" };
  }

  const hasAnyTime = Boolean(value.period || value.hour || value.minute);
  const requiresTime = value.timeType === "通常";
  if (requiresTime || hasAnyTime) {
    if (!value.period || !value.hour || (value.timeType !== "頃" && !value.minute)) {
      return { value: { ...value, iso: null, displayText: "" }, error: "死亡日時の午前/午後・時・分を入力してください。" };
    }
    const hour = Number(value.hour);
    const minute = value.minute ? Number(value.minute) : 0;
    if (!Number.isInteger(hour) || hour < 1 || hour > 12 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
      return { value: { ...value, iso: null, displayText: "" }, error: "死亡日時の時は1〜12、分は0〜59で入力してください。" };
    }
    const hour24 = value.period === "午後" && hour !== 12 ? hour + 12 : value.period === "午前" && hour === 12 ? 0 : hour;
    const iso = `${parts.datePart}T${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    const suffix = value.timeType === "通常" ? "" : ` ${value.timeType}`;
    const minuteText = value.timeType === "頃" && !value.minute ? "" : `${String(minute).padStart(2, "0")}分`;
    const displayText = `${parts.eraText} ${value.period}${hour}時${minuteText}${suffix}`;
    return { value: { ...value, iso, displayText } };
  }

  return { value: { ...value, iso: null, displayText: `${parts.eraText} ${value.timeType}` } };
}

export function calculateAge(birthDate: EraDateValue, deathDate: DeathDateValue): { age: string; error?: string } {
  if (!birthDate.iso || !deathDate.era || !deathDate.year || !deathDate.month || !deathDate.day) return { age: "" };
  const birth = new Date(`${birthDate.iso}T00:00`);
  const deathParts = validDateParts(deathDate.era, deathDate.year, deathDate.month, deathDate.day);
  if (!deathParts.datePart || deathParts.error) return { age: "" };
  const death = new Date(`${deathParts.datePart}T00:00`);
  if (birth > death) return { age: "", error: "故人生年月日が死亡日より後になっています。" };
  let age = death.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    death.getMonth() < birth.getMonth() ||
    (death.getMonth() === birth.getMonth() && death.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return { age: String(age) };
}

export function formatMonthDayTime(value?: MonthDayTimeValue): string {
  if (!value || !value.month || !value.day) return "";
  const time = value.time ? ` ${value.time.replace(":", "時")}分` : "";
  return `${Number(value.month)}月${Number(value.day)}日${time}`;
}

export function formatMonthDayFreeTime(value?: MonthDayTimeValue): string {
  if (!value) return "";
  const date = value.day ? `${Number(value.day)}日` : "";
  const time = value.time.trim();
  const isSimpleTime = /^(午前|午後)?\s*\d{1,2}(:\d{2}|時(\d{1,2}分?)?)$/.test(time);
  const timeText = time && isSimpleTime && !time.endsWith("頃") ? `${time}頃` : time;
  return [date, timeText].filter(Boolean).join(" ");
}
