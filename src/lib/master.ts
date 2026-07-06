export type VendorConfig = {
  id: string;
  name: string;
  funeralCompanyContact: string;
  vendorHandoffNoteOptions?: string[];
  showFuneralScale: boolean;
  showMembershipStatus: boolean;
  showUnionMemberType: boolean;
  showPreferredContact: boolean;
  requiresCremationReservation: boolean;
  showChiefMournerBirthDate: boolean;
  requiresChiefMournerBirthDate: boolean;
  externalInquiryResponseOptions: string[];
  notices: string[];
};

export const defaultVendorHandoffNoteOptions = [
  "火葬予約済み",
  "宗教者へ連絡済み",
  "宗教者へ未連絡",
  "ペースメーカーあり",
  "自宅安置",
  "ホール安置"
];

export const excludedVendorHandoffNoteOptions = [
  "死亡診断書あり",
  "死体検案書あり",
  "処置あり",
  "ドライアイス使用あり",
  "枕飾りセット使用あり",
  "棺使用なし",
  "面布使用なし",
  "火葬予約未完了",
  "宗教者から日程確認あり",
  "宗教者から日程確認なし",
  "遺影写真あり",
  "遺影写真未定",
  "ペースメーカーなし",
  "霊安室安置",
  "火葬場予約番号あり",
  "待合室未定",
  "業者から折り返し連絡希望",
  "至急確認事項あり"
];

export const branches = [
  {
    id: "head_office",
    name: "本社",
    vendorIds: [
      "ja_aichi_toyota_service",
      "ja_aichi_chuo",
      "ja_aichi_mikawa",
      "ja_yasuragi_center",
      "famille",
      "hanatemari",
      "minori_kaikan",
      "shirakawa_kaikan"
    ]
  }
] as const;

export const vendors: Record<string, VendorConfig> = {
  ja_aichi_toyota_service: {
    id: "ja_aichi_toyota_service",
    name: "JAあいち豊田サービス",
    funeralCompanyContact: "0120-725-171",
    showFuneralScale: true,
    showMembershipStatus: true,
    showUnionMemberType: true,
    showPreferredContact: false,
    requiresCremationReservation: false,
    showChiefMournerBirthDate: false,
    requiresChiefMournerBirthDate: false,
    externalInquiryResponseOptions: [],
    notices: ["火葬予約が未入力または未完了でも内容確認へ進めます。"]
  },
  ja_aichi_chuo: {
    id: "ja_aichi_chuo",
    name: "JAあいち中央",
    funeralCompanyContact: "未登録",
    showFuneralScale: true,
    showMembershipStatus: true,
    showUnionMemberType: true,
    showPreferredContact: true,
    requiresCremationReservation: false,
    showChiefMournerBirthDate: false,
    requiresChiefMournerBirthDate: false,
    externalInquiryResponseOptions: [],
    notices: ["火葬予約が未入力または未完了でも内容確認へ進めます。"]
  },
  ja_aichi_mikawa: {
    id: "ja_aichi_mikawa",
    name: "JAあいち三河",
    funeralCompanyContact: "0120-13-6891",
    showFuneralScale: true,
    showMembershipStatus: true,
    showUnionMemberType: true,
    showPreferredContact: true,
    requiresCremationReservation: false,
    showChiefMournerBirthDate: false,
    requiresChiefMournerBirthDate: false,
    externalInquiryResponseOptions: [],
    notices: ["火葬予約が未入力または未完了でも内容確認へ進めます。"]
  },
  ja_yasuragi_center: {
    id: "ja_yasuragi_center",
    name: "ジェイエイやすらぎセンター",
    funeralCompanyContact: "0120-797900",
    showFuneralScale: true,
    showMembershipStatus: false,
    showUnionMemberType: false,
    showPreferredContact: true,
    requiresCremationReservation: false,
    showChiefMournerBirthDate: false,
    requiresChiefMournerBirthDate: false,
    externalInquiryResponseOptions: [
      "①全て同意する(一般葬)",
      "②家族葬で執り行うが案内可能",
      "③家族葬で執り行うが案内不可",
      "④全て不可"
    ],
    notices: [
      "火葬予約が未入力または未完了でも内容確認へ進めます。",
      "葬儀に関する外部からの問い合わせ回答を確認してください。"
    ]
  },
  famille: {
    id: "famille",
    name: "家族葬のファミーユ",
    funeralCompanyContact: "0120-12-1616",
    showFuneralScale: false,
    showMembershipStatus: false,
    showUnionMemberType: false,
    showPreferredContact: true,
    requiresCremationReservation: true,
    showChiefMournerBirthDate: true,
    requiresChiefMournerBirthDate: true,
    externalInquiryResponseOptions: ["可", "不可"],
    notices: [
      "喪主・代表者の生年月日が必須です。",
      "火葬予約状況が「済」になるまで最終送信できません。",
      "葬儀に関する外部からの問い合わせ回答を確認してください。"
    ]
  },
  hanatemari: {
    id: "hanatemari",
    name: "花てまり",
    funeralCompanyContact: "0120-72-6410",
    showFuneralScale: true,
    showMembershipStatus: false,
    showUnionMemberType: false,
    showPreferredContact: true,
    requiresCremationReservation: true,
    showChiefMournerBirthDate: false,
    requiresChiefMournerBirthDate: false,
    externalInquiryResponseOptions: [],
    notices: ["火葬予約状況が「済」になるまで最終送信できません。"]
  },
  minori_kaikan: {
    id: "minori_kaikan",
    name: "みのり会館",
    funeralCompanyContact: "0120-345-788",
    showFuneralScale: true,
    showMembershipStatus: true,
    showUnionMemberType: false,
    showPreferredContact: true,
    requiresCremationReservation: false,
    showChiefMournerBirthDate: false,
    requiresChiefMournerBirthDate: false,
    externalInquiryResponseOptions: [],
    notices: ["火葬予約が未入力または未完了でも内容確認へ進めます。"]
  },
  shirakawa_kaikan: {
    id: "shirakawa_kaikan",
    name: "白川会館",
    funeralCompanyContact: "0120-133-216",
    showFuneralScale: true,
    showMembershipStatus: true,
    showUnionMemberType: false,
    showPreferredContact: true,
    requiresCremationReservation: false,
    showChiefMournerBirthDate: false,
    requiresChiefMournerBirthDate: false,
    externalInquiryResponseOptions: [],
    notices: ["火葬予約が未入力または未完了でも内容確認へ進めます。"]
  }
};

export const externalInquiryQuestion = "葬儀に関する外部からの問い合わせ回答";
export const funeralScaleQuestion = "葬儀規模";
export const membershipStatusQuestion = "会員・非会員";
export const unionMemberTypeQuestion = "組合員区分";
