export function browseErrorHtml(title: string, detail: string, status = 502): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:system-ui,sans-serif;padding:1.5rem;max-width:36rem;line-height:1.5"><h1 style="font-size:1.1rem;margin:0 0 0.75rem">${title}</h1><p style="margin:0 0 0.5rem;color:#334">${detail}</p><p style="margin:0;font-size:0.9rem;color:#647">Try another URL, or check that the site allows automated access.</p></body></html>`;
}
