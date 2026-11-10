# FinHealth Atlas

Wealth & Healthcare Forecaster for the Indian market. It links SIP-driven wealth projection with healthcare inflation and insurance adequacy.

**There is no sample data.** Every figure is calculated from numbers the visitor enters, and those numbers are saved only in the visitor's own browser (localStorage). The site has no backend, no analytics, and loads no third-party resources.

- **My Numbers:** income, expenses, assets, SIP, insurance covers, and editable assumptions.
- **Age Slider (20-70):** drives years to retirement, projections, and age-relevant health suggestions.
- **Wealth Trajectory:** net worth, corpus at 60, SIP, stacked growth chart, scenario sliders.
- **Healthcare Risk Atlas:** your own health events and costs, out-of-pocket comparison across your three cover scenarios, adequacy indicator.
- **Data Governance:** per-category consent toggles, download / restore / erase, and an activity log.
- **Light and dark themes**, a guided first-run tour, INR in Lakhs and Crores.

Stack: React 18, Vite, Tailwind CSS, Recharts, Framer Motion, Lucide React.

## Run locally

```bash
npm install
npm run dev
```

## Deploy to GitHub Pages

1. Push this folder to the `main` branch of a GitHub repository.
2. In the repository, open **Settings -> Pages** and set **Source** to **GitHub Actions**.
3. The included workflow (`.github/workflows/deploy.yml`) builds and publishes on every push to `main`.

## Structure

- `src/App.jsx` - the whole application: storage, forecast models, and all pages.
- `src/main.jsx`, `src/index.css` - entry point and Tailwind directives.

## Note

A planning calculator, not financial, medical, or insurance advice. The quick-add health event suggestions carry rough cost estimates that visitors are asked to replace with their own.
