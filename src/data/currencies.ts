export const CURRENCIES = [
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', locale: 'en-NG' },
  { code: 'USD', name: 'US Dollar', symbol: '$', locale: 'en-US' },
  { code: 'GBP', name: 'British Pound', symbol: '£', locale: 'en-GB' },
  { code: 'EUR', name: 'Euro', symbol: '€', locale: 'en-IE' },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]['code'];

export function getCurrency(value: string | null | undefined, fallback: CurrencyCode = 'GBP') {
  const normalized = (value || fallback).trim().toUpperCase();
  return CURRENCIES.find((currency) => currency.code === normalized) || CURRENCIES.find((currency) => currency.code === fallback) || CURRENCIES[0];
}

export function formatMoney(value: number, currency: string | null | undefined): string {
  const definition = getCurrency(currency);
  return new Intl.NumberFormat(definition.locale, {
    style: 'currency',
    currency: definition.code,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}