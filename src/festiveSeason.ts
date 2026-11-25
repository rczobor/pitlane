/** 25 November to 6 January (Epiphany), in the viewer's time zone. */
export function isFestiveSeason(date: Date) {
  const month = date.getMonth();
  return (month === 10 && date.getDate() >= 25) || month === 11 || (month === 0 && date.getDate() <= 6);
}
