import { EthDateTime } from 'ethiopian-calendar-date-converter';
import { getCurrentCountryPack } from './countryPacks';

export interface EthiopianDate {
  year: number;
  month: number;
  day: number;
}

export function toEthiopianDate(date: Date): EthiopianDate {
  const converted = EthDateTime.fromEuropeanDate(date);
  return { year: converted.year, month: converted.month, day: converted.date };
}

/** Receipt/history date, switching only when the Ethiopia country pack is active. */
export function formatShopDateTime(timestamp: number, locale: string): string {
  const date = new Date(timestamp);
  if (getCurrentCountryPack().calendar !== 'ethiopian') {
    return date.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
  }
  const eth = toEthiopianDate(date);
  const time = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  return `${eth.year}-${String(eth.month).padStart(2, '0')}-${String(eth.day).padStart(2, '0')} EC ${time}`;
}

/** Extra label beside a Gregorian sales-book day; storage keys remain stable. */
export function localCalendarDayLabel(dayKey: string): string | null {
  if (getCurrentCountryPack().calendar !== 'ethiopian') return null;
  const [year, month, day] = dayKey.split('-').map(Number);
  const eth = toEthiopianDate(new Date(year, month - 1, day, 12));
  return `${eth.day}/${eth.month}/${eth.year} EC`;
}
