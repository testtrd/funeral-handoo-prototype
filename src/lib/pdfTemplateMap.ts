import type { HandoffData } from "@/types/form";
import {
  externalInquiryQuestion,
  funeralScaleQuestion,
  membershipStatusQuestion,
  unionMemberTypeQuestion
} from "@/lib/master";
import { formatMonthDayFreeTime, formatMonthDayTime } from "@/lib/dates";
import { getVendorRule } from "@/lib/masterDataService";

export type PdfPosition = {
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  align?: "left" | "center";
  maxLines?: number;
};

export type PdfTextField = PdfPosition & {
  key: string;
  value: (data: HandoffData) => string;
};

export type PdfMarkField = {
  key: string;
  value: (data: HandoffData) => string;
  positions: Record<string, PdfPosition>;
};

export type PdfImageField = PdfPosition & {
  key: string;
  value: (data: HandoffData) => string;
};

// The scanned template is a landscape PDF with /Rotate 270.  These are the
// visually upright, portrait-page coordinates measured against that template.
// Keep all tuning here so a future paper form can be adjusted without touching
// the PDF drawing logic.
export const pdfTemplateReferenceSize = { width: 595.2, height: 841.68 };
export const pdfTemplatePath = "/templates/handoff-template.pdf";
// Development-only: add ?pdfDebug=1 to the app URL before creating a PDF to
// show red field outlines and emit their scaled coordinates in the console.
export const debugPdfPositions = process.env.NODE_ENV === "development" && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("pdfDebug");

const area = (x: number, y: number, width: number, height: number, fontSize = 9, maxLines = 1): PdfPosition => ({
  pageIndex: 0,
  x,
  y,
  width,
  height,
  fontSize,
  maxLines
});

const coffinText = (data: HandoffData) => (data.supplies.coffinUsage === "手入力" ? data.supplies.coffinDetail : data.supplies.coffinUsage);
const shouldShowPriestIdentity = (data: HandoffData) => data.religion.hasPriest !== "無" && data.religion.introductionWanted !== "希望する";
const vendorQuestionText = (data: HandoffData) => {
  const rule = getVendorRule(data.vendorId);
  const entries = [
    rule.showFuneralScale ? `${funeralScaleQuestion} ${data.vendorQuestions[funeralScaleQuestion] || ""}` : "",
    rule.showMembership ? `${membershipStatusQuestion} ${data.vendorQuestions[membershipStatusQuestion] || ""}` : "",
    rule.showUnionMemberType ? `${unionMemberTypeQuestion} ${data.vendorQuestions[unionMemberTypeQuestion] || ""}` : "",
    rule.showExternalInquiryAnswer ? `${externalInquiryQuestion} ${data.vendorQuestions[externalInquiryQuestion] || ""}` : ""
  ];
  return entries.filter(Boolean).join(" / ");
};

// All fixed text rectangles live in this one map.  x/y values deliberately
// correspond to what is seen on the printed portrait form, not an A4 constant.
export const pdfFieldPositions = {
  pickupAddress: area(94, 545, 455, 18, 9, 1),
  transportDestination: area(94, 508, 455, 16, 9, 1),
  religionSect: area(95, 496, 102, 16, 8, 1),
  priestKana: area(206, 496, 128, 16, 8, 1),
  priestName: area(206, 479, 128, 16, 8, 1),
  pillowDateTime: area(176, 422, 112, 16, 8, 1),
  pillowStatus: area(347, 422, 65, 16, 8, 1),
  wakeDate: area(205, 402, 55, 16, 8, 1),
  wakeTime: area(276, 402, 58, 16, 8, 1),
  wakeHope: area(341, 402, 40, 16, 8, 1),
  wakePlace: area(396, 402, 145, 16, 8, 1),
  funeralDate: area(205, 383, 55, 16, 8, 1),
  funeralTime: area(276, 383, 58, 16, 8, 1),
  funeralHope: area(341, 383, 40, 16, 8, 1),
  funeralPlace: area(396, 383, 145, 16, 8, 1),
  departureTime: area(270, 367, 70, 15, 8, 1),
  cremationTime: area(270, 350, 70, 15, 8, 1),
  crematoriumName: area(405, 367, 132, 15, 8, 1),
  reservationNumber: area(404, 350, 68, 15, 7, 1),
  waitingRoom: area(478, 350, 62, 15, 7, 1),
  hearse: area(245, 326, 160, 16, 8, 1),
  phoneContact: area(150, 298, 132, 16, 8, 1),
  dryIce: area(246, 283, 36, 14, 7, 1),
  pillowDecoration: area(371, 283, 40, 14, 7, 1),
  shikimi: area(452, 283, 34, 14, 7, 1),
  mokugyo: area(526, 283, 24, 14, 7, 1),
  faceCloth: area(170, 262, 36, 14, 7, 1),
  mileage: area(281, 262, 52, 14, 7, 1),
  coffin: area(406, 262, 80, 14, 7, 1),
  other: area(497, 262, 48, 14, 7, 1),
  funeralCompanyContact: area(126, 166, 250, 16, 8, 1),
  externalInquiry: area(38, 146, 500, 16, 8, 1),
  staff: area(405, 25, 120, 16, 8, 1),
  signature: area(370, -22, 176, 54)
} as const;

export const pdfTextFields: PdfTextField[] = [
  { key: "pickupAddress", ...pdfFieldPositions.pickupAddress, value: (d) => d.transport.pickupAddress },
  { key: "transportDestination", ...pdfFieldPositions.transportDestination, value: (d) => [d.transport.destinationType, d.transport.destinationPlace].filter(Boolean).join(" ") },
  { key: "religionSect", ...pdfFieldPositions.religionSect, value: (d) => d.religion.denomination },
  { key: "priestKana", ...pdfFieldPositions.priestKana, value: (d) => shouldShowPriestIdentity(d) ? d.religion.priestKana : "" },
  { key: "priestName", ...pdfFieldPositions.priestName, value: (d) => shouldShowPriestIdentity(d) ? d.religion.priestName : "" },
  { key: "pillowDateTime", ...pdfFieldPositions.pillowDateTime, value: (d) => formatMonthDayTime(d.schedule.pillowSutraDateTime) },
  { key: "pillowStatus", ...pdfFieldPositions.pillowStatus, value: (d) => d.schedule.pillowSutraStatus },
  { key: "wakeDate", ...pdfFieldPositions.wakeDate, value: (d) => d.schedule.wakeDateTime.month && d.schedule.wakeDateTime.day ? `${d.schedule.wakeDateTime.month}月${d.schedule.wakeDateTime.day}日` : "" },
  { key: "wakeTime", ...pdfFieldPositions.wakeTime, value: (d) => d.schedule.wakeDateTime.time },
  { key: "wakeHope", ...pdfFieldPositions.wakeHope, value: (d) => d.schedule.wakeHope },
  { key: "wakePlace", ...pdfFieldPositions.wakePlace, value: (d) => d.schedule.wakePlace },
  { key: "funeralDate", ...pdfFieldPositions.funeralDate, value: (d) => d.schedule.funeralDateTime.month && d.schedule.funeralDateTime.day ? `${d.schedule.funeralDateTime.month}月${d.schedule.funeralDateTime.day}日` : "" },
  { key: "funeralTime", ...pdfFieldPositions.funeralTime, value: (d) => d.schedule.funeralDateTime.time },
  { key: "funeralHope", ...pdfFieldPositions.funeralHope, value: (d) => d.schedule.funeralHope },
  { key: "funeralPlace", ...pdfFieldPositions.funeralPlace, value: (d) => d.schedule.funeralPlace },
  { key: "departureTime", ...pdfFieldPositions.departureTime, value: (d) => formatMonthDayTime(d.schedule.departureDateTime) },
  { key: "cremationTime", ...pdfFieldPositions.cremationTime, value: (d) => formatMonthDayTime(d.schedule.cremationDateTime) },
  { key: "crematoriumName", ...pdfFieldPositions.crematoriumName, value: (d) => d.schedule.crematoriumName },
  { key: "reservationNumber", ...pdfFieldPositions.reservationNumber, value: (d) => d.schedule.reservationNumber ? `No.${d.schedule.reservationNumber}` : "" },
  { key: "waitingRoom", ...pdfFieldPositions.waitingRoom, value: (d) => d.schedule.waitingRoom },
  { key: "hearse", ...pdfFieldPositions.hearse, value: (d) => [d.supplies.hearse, d.supplies.vehicleType].filter(Boolean).join(" ") },
  { key: "phoneContact", ...pdfFieldPositions.phoneContact, value: (d) => formatMonthDayFreeTime(d.contactAndNotes.phoneContact) },
  { key: "dryIce", ...pdfFieldPositions.dryIce, value: (d) => d.supplies.dryIceKg },
  { key: "pillowDecoration", ...pdfFieldPositions.pillowDecoration, value: (d) => d.supplies.pillowDecorationSet },
  { key: "shikimi", ...pdfFieldPositions.shikimi, value: (d) => d.supplies.shikimi },
  { key: "mokugyo", ...pdfFieldPositions.mokugyo, value: (d) => d.supplies.mokugyoSetNo },
  { key: "faceCloth", ...pdfFieldPositions.faceCloth, value: (d) => d.supplies.faceCloth },
  { key: "mileage", ...pdfFieldPositions.mileage, value: (d) => d.supplies.mileageKm ? `${d.supplies.mileageKm}km` : "" },
  { key: "coffin", ...pdfFieldPositions.coffin, value: coffinText },
  { key: "other", ...pdfFieldPositions.other, value: (d) => d.supplies.other },
  { key: "funeralCompanyContact", ...pdfFieldPositions.funeralCompanyContact, value: (d) => d.contactAndNotes.funeralCompanyContact },
  { key: "vendorQuestions", ...pdfFieldPositions.externalInquiry, value: vendorQuestionText },
  { key: "staff", ...pdfFieldPositions.staff, value: () => "" }
];

const mark = (x: number, y: number): PdfPosition => area(x, y, 11, 11, 9);

// Selection values use a small circle placed beside the printed choice, rather
// than writing a second "有" / "無" label into the form.
export const pdfMarkFields: PdfMarkField[] = [
  { key: "deathCertificate", value: (d) => d.deceased.deathCertificate, positions: { 有: mark(106, 572), 無: mark(161, 572) } },
  { key: "postmortemCertificate", value: (d) => d.deceased.postmortemCertificate, positions: { 有: mark(304, 572), 無: mark(359, 572) } },
  { key: "treatment", value: (d) => d.deceased.treatment, positions: { 有: mark(492, 572), 無: mark(547, 572) } },
  { key: "religionContact", value: (d) => d.religion.contactStatus, positions: { 連絡済み: mark(193, 430), 連絡未: mark(214, 430), 無: mark(236, 430) } },
  { key: "priestRelationship", value: (d) => d.religion.hasPriest !== "無" ? d.religion.relationship : "", positions: { 菩提寺等: mark(356, 479), 不明: mark(528, 479) } },
  { key: "wakeStatus", value: (d) => d.schedule.wakeStatus, positions: { 決: mark(167, 402), 仮: mark(186, 402), 未: mark(205, 402) } },
  { key: "funeralStatus", value: (d) => d.schedule.funeralStatus, positions: { 決: mark(167, 383), 仮: mark(186, 383), 未: mark(205, 383) } },
  { key: "crematoriumStatus", value: (d) => d.schedule.crematoriumStatus, positions: { 決: mark(167, 367), 仮: mark(186, 367), 未: mark(205, 367) } },
  { key: "cremationReservation", value: (d) => d.schedule.cremationReservationStatus, positions: { 未: mark(466, 350), 済: mark(490, 350) } },
  { key: "portraitPhoto", value: (d) => d.contactAndNotes.portraitPhoto, positions: { 有: mark(210, 296), 未定: mark(241, 296), 無: mark(277, 296) } },
  { key: "privacyAgree", value: () => "", positions: { 同意する: mark(27, 93), 同意しない: mark(112, 93) } }
];

export const pdfImageFields: PdfImageField[] = [
  { key: "signature", ...pdfFieldPositions.signature, value: () => "" }
];
