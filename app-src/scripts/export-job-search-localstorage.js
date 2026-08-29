/**
 * Run this in the browser console on the Personal OS site, ONCE, before you
 * clear site data.
 *
 * The deleted JobSearchWidget kept two keys in localStorage:
 *   job_search_cal_v1 — which rhythm items you ticked, by date
 *   job_search_ids_v1 — the Supabase `tasks` ids those ticks created
 *
 * Deleting the component does NOT delete these; they sit in your browser until
 * you clear storage. But nothing reads them any more, and the ids in
 * job_search_ids_v1 point at real task rows that are now unreferenced, so grab
 * a copy before it goes.
 *
 * Paste this whole file into the console. It prints a summary and downloads a
 * JSON backup.
 */
;(() => {
  const KEYS = ['job_search_cal_v1', 'job_search_ids_v1']
  const dump = {}

  for (const k of KEYS) {
    const raw = localStorage.getItem(k)
    if (raw == null) {
      console.log(`${k}: not present`)
      continue
    }
    try {
      dump[k] = JSON.parse(raw)
    } catch {
      dump[k] = raw // keep it verbatim rather than losing it to a parse error
    }
    console.log(`${k}: ${Object.keys(dump[k] ?? {}).length} day(s)`)
  }

  if (Object.keys(dump).length === 0) {
    console.log('Nothing to export — neither key is set in this browser.')
    return
  }

  const completions = Object.values(dump.job_search_cal_v1 ?? {})
    .reduce((n, day) => n + Object.values(day ?? {}).filter(Boolean).length, 0)
  const ids = Object.values(dump.job_search_ids_v1 ?? {})
    .flatMap(day => Object.values(day ?? {}))
  console.log(`Total ticked items: ${completions}`)
  console.log(`Task ids referenced: ${ids.length}`)
  console.table(dump.job_search_cal_v1 ?? {})

  const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `job-search-localstorage-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)

  console.log('Backup downloaded. Once you have the file, you can clear the keys with:')
  console.log("  localStorage.removeItem('job_search_cal_v1'); localStorage.removeItem('job_search_ids_v1')")
})()
