/** 1 December to 6 January (Epiphany), in the viewer's time zone. */
export function isFestiveSeason(date: Date) {
  const month = date.getMonth();
  return month === 11 || (month === 0 && date.getDate() <= 6);
}
