import type { FamilyCopyDelivery } from "@/types/form";

export function isFamilyCopyDeliveryReady(delivery: FamilyCopyDelivery) {
  if (delivery.method === "sms") return Boolean(delivery.smsPhoneNumber.trim());
  if (delivery.method === "email") return Boolean(delivery.email.trim());
  return false;
}

export function familyCopyDeliveryText(delivery: FamilyCopyDelivery) {
  if (delivery.method === "sms") return `SMS: ${delivery.smsPhoneNumber || "未入力"}`;
  if (delivery.method === "email") return `メール: ${delivery.email || "未入力"}`;
  return "未選択";
}

export function buildFamilyCopyDeliveryPayload(delivery: FamilyCopyDelivery) {
  return {
    method: delivery.method,
    destination: delivery.method === "sms" ? delivery.smsPhoneNumber : delivery.method === "email" ? delivery.email : "",
    confirmed: delivery.confirmed
  };
}
