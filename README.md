# ApplyPilot Web

ApplyPilot Web is the iPhone-friendly version of the job search app. It is a static PWA, so it can run in Safari and be added to the iPhone Home Screen.

## Use On iPhone

The folder must be hosted somewhere first. Good starter options:

- GitHub Pages
- Netlify
- Vercel
- Any basic web host

After it is hosted, open the URL in Safari, tap Share, then choose Add to Home Screen.

## Local Testing On Windows

From this folder:

```powershell
python -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## Data

Data is saved in the browser with `localStorage`. Use Export in the app to keep a backup before clearing browser data or moving devices.
