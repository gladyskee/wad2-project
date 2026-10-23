// Today's date where the user is, as 'YYYY-MM-DD'.
// (toISOString() gives the UTC date, which is still yesterday until 8 AM in Singapore)
export function localDate(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
