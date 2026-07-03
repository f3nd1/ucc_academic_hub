/**
 * Open a tab synchronously (inside the user's click gesture, so popup blockers
 * allow it) and return a navigator to point it at a URL once async work — an
 * OAuth token round-trip, a Sheets API call — resolves. Calling `window.open`
 * only AFTER an await is outside the gesture and gets blocked by some browsers,
 * leaving the spreadsheet created but never shown.
 *
 * Pass `undefined` (no URL) to close the placeholder tab instead.
 */
export function openTabForAsyncUrl(): (url: string | undefined) => void {
  const tab = window.open('', '_blank');
  // Sever the reverse handle so the destination page cannot script us.
  if (tab) tab.opener = null;
  return (url) => {
    if (url && tab) {
      tab.location.href = url;
    } else if (url) {
      // Placeholder was blocked after all — best-effort direct open.
      window.open(url, '_blank', 'noopener');
    } else {
      tab?.close();
    }
  };
}
