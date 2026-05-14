# Buildcored — Orcas v1.5 site

The public landing page + project DB for the **Buildcored Orcas** 30-day creative engineering challenge. Static HTML/CSS/JS, no backend. Deployed via GitHub Pages.

## What's here

| File | Purpose |
| --- | --- |
| `index.html` | Single-page site — intro overlay → hero → about → programs → project DB → notes → apply → footer |
| `styles.css` | All styles (custom design system, dark theme) |
| `app.js` | Project DB rendering, modal, admin panel (`#admin` route) |
| `orca-animation.js` | The Orcas mark animation that plays on the program card |
| `projects.json` | The project database — 30 entries seeded with the catalog |
| `brand/` | Brand marks (SVG + PNG) |
| `logo/` | Favicons, OG image |
| `uploads/` | Admin-uploaded project images (only `d01.jpg`-style names are tracked) |

## Admin: how to submit a project

1. Visit the live site, add `#admin` to the URL (e.g. `https://yourdomain/index.html#admin`).
2. Click a day in the sidebar.
3. Fill in: builder, GitHub URL, demo URL, tags (`Python, OpenCV, …`), difficulty.
4. Pick a cover image (any size — gets stored as a data URL in your browser).
5. Tick **Shipped** (and optionally **Featured** / **Day Winner**). Edits autosave to localStorage.
6. **Export projects.json** → drop the downloaded file at the repo root.
7. **Download new images** → drop each file (`d01.png` …) into `uploads/`.
8. `git add projects.json uploads/ && git commit -m "ship d01 …" && git push`.
9. GH Pages redeploys in ~30s. The card flips from grey "Awaiting submission" to a green "Shipped" badge.

Nothing publishes until you commit and push — admin edits stay local to your browser until then.

## Local development

```sh
# Any static server works. From this folder:
python3 -m http.server 8080
# then open http://localhost:8080
```

## License

Open source under MIT.
