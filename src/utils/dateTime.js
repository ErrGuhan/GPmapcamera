/**
 * Formats the current date/time + timezone offset the same way
 * GPS Map Camera-style apps display it, e.g.:
 * "Friday, 11/09/2026 11:45 AM GMT +05:30"
 */
export function getFormattedDateTime() {
  const now = new Date();

  const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();

  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;

  const offsetMinutes = -now.getTimezoneOffset();
  const offsetSign = offsetMinutes >= 0 ? '+' : '-';
  const absOffset = Math.abs(offsetMinutes);
  const offsetHH = String(Math.floor(absOffset / 60)).padStart(2, '0');
  const offsetMM = String(absOffset % 60).padStart(2, '0');

  return `${dayName}, ${dd}/${mm}/${yyyy} ${hours}:${minutes} ${ampm} GMT ${offsetSign}${offsetHH}:${offsetMM}`;
}
