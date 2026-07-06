export type Era = "taisho" | "showa" | "heisei" | "reiwa";

export type EraDateValue = {
  era: Era;
  year: string;
  month: string;
  day: string;
  time?: string;
  iso?: string;
};

export type DeathTimeType = "通常" | "推定" | "頃" | "不詳" | "その他";

export type DeathDateValue = {
  era: Era | "";
  year: string;
  month: string;
  day: string;
  timeType: DeathTimeType;
  period: "午前" | "午後" | "";
  hour: string;
  minute: string;
  otherText: string;
  iso: string | null;
  displayText: string;
};

export type CremationReservationStatus = "" | "済" | "未";

export type MonthDayTimeValue = {
  month: string;
  day: string;
  time: string;
};

export type CopyOutputStatus = {
  generated: boolean;
  sent: boolean;
  generatedAt: string;
  sentAt: string;
  fileName: string;
};

export type RelativeConfirmation = {
  confirmed: boolean;
  confirmedAt: string;
  signerName: string;
  signatureSource: "privacyConsent" | "new" | "";
  signatureDataUrl: string;
};

export type FamilyCopyDelivery = {
  method: "sms" | "email" | "none";
  smsPhoneNumber: string;
  email: string;
  confirmed: boolean;
  testSentAt?: string;
  testSendStatus?: "success" | "error" | "pending" | "";
  testSendError?: string;
  sentAt?: string;
  sendStatus?: "success" | "error" | "pending" | "";
  sendError?: string;
  messageTemplate?: string;
  mockSent?: boolean;
  emailSentAt?: string;
  emailSendStatus?: "success" | "error" | "pending" | "";
  emailSendError?: string;
  smsSentAt?: string;
  smsSendStatus?: "success" | "error" | "pending" | "";
  smsSendError?: string;
};

export type PrivacyConsent = {
  agreed: boolean | null;
  agreedAt: string;
  consentDate: string;
  signerName: string;
  signatureDataUrl: string;
  consentTextVersion: string;
  internalOnly: boolean;
};

export type PostWork = {
  transportDistanceKm: string;
  actualMileageKm: string;
  vendorNote: string;
  internalNote: string;
  returnTime: string;
  finishedAt: string;
  additionalSupplies: string;
  internalMemo: string;
  savedAt: string;
  savedBy: {
    userId: string;
    name: string;
  };
};

export type HandoffData = {
  branchId: string;
  vendorId: string;
  chiefMourner: {
    role: "喪主" | "代表者" | "";
    name: string;
    kana: string;
    address: string;
    homePhone: string;
    mobilePhone: string;
    preferredContact: "自宅" | "携帯" | "上記以外" | "";
    otherContact: string;
    relationshipToDeceased: string;
    birthDate: EraDateValue;
  };
  deceased: {
    name: string;
    kana: string;
    gender: "男" | "女" | "";
    birthDate: EraDateValue;
    age: string;
    deathDate: DeathDateValue;
    addressType: "same_as_mourner" | "other" | "";
    address: string;
    relationshipToChief: string;
    deathCertificate: "有" | "無" | "";
    postmortemCertificate: "有" | "無" | "";
    treatment: "有" | "無" | "";
    pacemaker: "有" | "無" | "";
  };
  transport: {
    pickupDate: EraDateValue;
    pickupTime: string;
    pickupName: string;
    pickupAddress: string;
    destinationType: "自宅" | "ホール" | "霊安室" | "その他" | "";
    destinationPlace: string;
  };
  religion: {
    hasPriest: "有" | "無" | "";
    introductionWanted: "希望する" | "希望しない" | "";
    denomination: string;
    priestName: string;
    priestKana: string;
    relationship: "菩提寺等" | "不明" | "";
    isFirstFuneralForFamily: "はい" | "いいえ" | "";
    contactStatus: "連絡済み" | "連絡未" | "無" | "";
  };
  vendorQuestions: Record<string, string>;
  schedule: {
    pillowSutraDateTime: MonthDayTimeValue;
    pillowSutraStatus: "済み" | "未定" | "予定" | "無し" | "";
    wakeStatus: "決" | "仮" | "未" | "";
    wakeHope: "希望" | "";
    wakeDateTime: MonthDayTimeValue;
    wakePlace: string;
    funeralStatus: "決" | "仮" | "未" | "";
    funeralHope: "希望" | "";
    funeralDateTime: MonthDayTimeValue;
    funeralPlace: string;
    crematoriumStatus: "決" | "仮" | "未" | "";
    crematoriumName: string;
    cremationDateTime: MonthDayTimeValue;
    departureDateTime: MonthDayTimeValue;
    departureTime: string;
    waitingRoom: string;
    reservationNumber: string;
    cremationReservationStatus: CremationReservationStatus;
  };
  supplies: {
    hearse: string;
    vehicleType: string;
    futon: "使用あり" | "使用なし" | "";
    dryIceKg: string;
    pillowDecorationSet: "仏式" | "神式" | "正宗" | "使用なし" | "";
    shikimi: "1束" | "2束" | "使用なし" | "";
    coffinUsage: "使用なし" | "手入力" | "";
    coffinDetail: string;
    mokugyoSetNo: string;
    faceCloth: "使用あり" | "使用なし" | "";
    mileageKm: string;
    other: string;
  };
  contactAndNotes: {
    phoneContact: MonthDayTimeValue;
    portraitPhoto: "有" | "未定" | "無" | "";
    funeralCompanyContact: string;
    vendorHandoffMemo?: string;
  };
  handoffNotes: {
    selectedItems: string[];
    freeText: string;
    templeIntroductionWanted: "希望する" | "希望しない" | "";
    morningContactToRepresentative: boolean;
  };
  relativeCopy: CopyOutputStatus;
  vendorCopy: CopyOutputStatus;
  internalCopy: CopyOutputStatus;
  relativeConfirmation: RelativeConfirmation;
  familyCopyDelivery: FamilyCopyDelivery;
  privacyConsent: PrivacyConsent;
  postWork: PostWork;
  consent: {
    agreed: "同意する" | "同意しない" | "";
    signatureDataUrl: string;
    staffName: string;
  };
};
