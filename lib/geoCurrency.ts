// lib/geoCurrency.ts
export type Currency = "usd" | "cad" | "gbp" | "ngn";

const COUNTRY_TO_CURRENCY: Record<string, Currency> = {
  CA: "cad",
  US: "usd",
  GB: "gbp",
  NG: "ngn",
};

export function currencyFromCountry(countryCode?: string | null): Currency {
  const cc = String(countryCode || "").toUpperCase();
  return COUNTRY_TO_CURRENCY[cc] || "usd";
}

export function currencySymbol(c: Currency) {
  if (c === "usd") return "$";
  if (c === "cad") return "$";
  if (c === "gbp") return "£";
  if (c === "ngn") return "₦";
  return "$";
}

export function currencyLabel(c: Currency) {
  if (c === "usd") return "USD ($)";
  if (c === "cad") return "CAD ($)";
  if (c === "gbp") return "GBP (£)";
  if (c === "ngn") return "NGN (₦)";
  return "USD ($)";
}
