import { emptyDeathDate, emptyEraDate } from "@/lib/dates";
import type { HandoffData } from "@/types/form";

const today = new Date().toISOString().slice(0, 10);

export const defaultData: HandoffData = {
  branchId: "",
  vendorId: "",
  chiefMourner: {
    role: "",
    name: "",
    kana: "",
    address: "",
    homePhone: "",
    mobilePhone: "",
    preferredContact: "",
    otherContact: "",
    relationshipToDeceased: "",
    birthDate: emptyEraDate()
  },
  deceased: {
    name: "",
    kana: "",
    gender: "",
    birthDate: emptyEraDate(),
    age: "",
    deathDate: emptyDeathDate(),
    addressType: "",
    address: "",
    relationshipToChief: "",
    deathCertificate: "",
    postmortemCertificate: "",
    treatment: "",
    pacemaker: ""
  },
  transport: {
    pickupDate: emptyEraDate(),
    pickupTime: "",
    pickupName: "",
    pickupAddress: "",
    destinationType: "",
    destinationPlace: ""
  },
  religion: {
    hasPriest: "",
    introductionWanted: "",
    denomination: "",
    priestName: "",
    priestKana: "",
    relationship: "",
    isFirstFuneralForFamily: "",
    contactStatus: ""
  },
  vendorQuestions: {},
  schedule: {
    pillowSutraDateTime: { month: "", day: "", time: "" },
    pillowSutraStatus: "",
    wakeStatus: "",
    wakeHope: "",
    wakeDateTime: { month: "", day: "", time: "" },
    wakePlace: "",
    funeralStatus: "",
    funeralHope: "",
    funeralDateTime: { month: "", day: "", time: "" },
    funeralPlace: "",
    crematoriumStatus: "",
    crematoriumName: "",
    cremationDateTime: { month: "", day: "", time: "" },
    departureDateTime: { month: "", day: "", time: "" },
    departureTime: "",
    waitingRoom: "",
    reservationNumber: "",
    cremationReservationStatus: ""
  },
  supplies: {
    hearse: "",
    vehicleType: "",
    futon: "",
    dryIceKg: "",
    pillowDecorationSet: "",
    shikimi: "",
    coffinUsage: "",
    coffinDetail: "",
    mokugyoSetNo: "",
    faceCloth: "",
    mileageKm: "",
    other: ""
  },
  contactAndNotes: {
    phoneContact: { month: "", day: "", time: "" },
    portraitPhoto: "",
    funeralCompanyContact: ""
  },
  handoffNotes: {
    selectedItems: [],
    freeText: "",
    templeIntroductionWanted: "",
    morningContactToRepresentative: false
  },
  relativeCopy: {
    generated: false,
    sent: false,
    generatedAt: "",
    sentAt: "",
    fileName: ""
  },
  vendorCopy: {
    generated: false,
    sent: false,
    generatedAt: "",
    sentAt: "",
    fileName: ""
  },
  internalCopy: {
    generated: false,
    sent: false,
    generatedAt: "",
    sentAt: "",
    fileName: ""
  },
  relativeConfirmation: {
    confirmed: false,
    confirmedAt: "",
    signerName: "",
    signatureSource: "",
    signatureDataUrl: ""
  },
  familyCopyDelivery: {
    method: "none",
    smsPhoneNumber: "",
    email: "",
    confirmed: false,
    testSentAt: "",
    testSendStatus: "",
    testSendError: "",
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
  privacyConsent: {
    agreed: null,
    agreedAt: "",
    consentDate: today,
    signerName: "",
    signatureDataUrl: "",
    consentTextVersion: "hearse_japan_privacy_consent_2026_06",
    internalOnly: true
  },
  postWork: {
    transportDistanceKm: "",
    actualMileageKm: "",
    vendorNote: "",
    internalNote: "",
    returnTime: "",
    finishedAt: "",
    additionalSupplies: "",
    internalMemo: "",
    savedAt: "",
    savedBy: {
      userId: "",
      name: ""
    }
  },
  consent: {
    agreed: "",
    signatureDataUrl: "",
    staffName: ""
  }
};
