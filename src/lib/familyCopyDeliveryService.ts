import type { FamilyCopyDelivery } from "@/types/form";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isFamilyCopyDeliveryReady(delivery: FamilyCopyDelivery) {
  const email = delivery.email.trim();
  const confirmation = delivery.emailConfirmation.trim();
  return Boolean(email && confirmation && email === confirmation && emailPattern.test(email));
}

export function familyCopyDeliveryText(delivery: FamilyCopyDelivery) {
  return `メール: ${delivery.email || "未入力"}`;
}

export function buildFamilyCopyDeliveryPayload(delivery: FamilyCopyDelivery) {
  return {
    method: "email" as const,
    destination: delivery.email,
    confirmed: delivery.confirmed
  };
}

export function familyCopyDeliveryValidationMessage(delivery: FamilyCopyDelivery) {
  const email = delivery.email.trim();
  const confirmation = delivery.emailConfirmation.trim();
  if (!email || !confirmation) return "メールアドレスを2回入力してください。";
  if (!emailPattern.test(email)) return "メールアドレスの形式を確認してください。";
  if (email !== confirmation) return "メールアドレスが一致しません。もう一度確認してください。";
  return "";
}

export function normalizeFamilyCopyDelivery(value: unknown): FamilyCopyDelivery {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const email = typeof source.email === "string" ? source.email : "";
  const hasEmailConfirmation = Object.prototype.hasOwnProperty.call(source, "emailConfirmation");
  const readString = (key: string) => typeof source[key] === "string" ? source[key] as string : "";
  const readBoolean = (key: string) => typeof source[key] === "boolean" ? source[key] as boolean : false;
  return {
    method: "email",
    email,
    emailConfirmation: hasEmailConfirmation && typeof source.emailConfirmation === "string" ? source.emailConfirmation : email,
    confirmed: readBoolean("confirmed"),
    testSentAt: readString("testSentAt"),
    testSendStatus: readString("testSendStatus") as FamilyCopyDelivery["testSendStatus"],
    testSendError: readString("testSendError"),
    sentAt: readString("sentAt"),
    sendStatus: readString("sendStatus") as FamilyCopyDelivery["sendStatus"],
    sendError: readString("sendError"),
    messageTemplate: readString("messageTemplate"),
    mockSent: readBoolean("mockSent"),
    emailSentAt: readString("emailSentAt"),
    emailSendStatus: readString("emailSendStatus") as FamilyCopyDelivery["emailSendStatus"],
    emailSendError: readString("emailSendError")
  };
}
