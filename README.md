# migaryos-site

Static landing page for **MIGARYOS — WIE Evidence Case**. Two files, no build
step, no framework, no external requests.

**Generated. Do not hand-edit.** The source of truth is `commercial/config.json`
in the private `wie` repository; the pages are rendered by
`commercial/build_site.py` and re-copied here. Editing the HTML directly makes
the site and the product copy drift apart, which is the one thing the generator
exists to prevent.

Served by GitHub Pages. GitHub Pages was chosen over Cloudflare Pages for one
concrete reason: `migaryos.com` runs Google Workspace mail on Gabia
nameservers, and GitHub Pages accepts an apex domain through A records, so the
domain can be pointed here **without moving nameservers and without touching
the MX record**.
