// renderRedirectStub: produce HTML meta-refresh stub for a single old BEE ID.
// Used by the buildEnd hook to write dist/{old-id}/index.html (and
// dist/zh-tw/{old-id}/index.html for the zh-TW locale).
//
// Output redirects to the new semantic URL with the project's base path
// prepended.
export function renderRedirectStub({ oldId, newPath, basePath, locale, title }) {
  const localePrefix = locale === 'zh-tw' ? '/zh-tw' : '';
  const fullDest = `${basePath}${localePrefix}${newPath}`;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0; url=${fullDest}">
<link rel="canonical" href="${fullDest}">
<title>Redirecting to ${title}</title>
</head>
<body>
<p>This page has moved to <a href="${fullDest}">${fullDest}</a>.</p>
</body>
</html>
`;
}
