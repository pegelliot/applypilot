# ApplyPilot iPhone Setup

ApplyPilot Web is ready to use as a phone-friendly web app, but an iPhone needs a web address to open it.

## Easiest No-Mac Path

Use GitHub Pages, Netlify, or Vercel to host the `ApplyPilotWeb` folder.

Once hosted:

1. Open the hosted URL in Safari on your iPhone.
2. Tap Share.
3. Tap Add to Home Screen.
4. Name it ApplyPilot.
5. Open it from your Home Screen like an app.

## What Works In This Version

- Job tracking
- Company tracking
- Networking contacts
- Interview tracking
- Documents and master resume notes
- Master Resume upload for text, markdown, and RTF files
- Create Documents for fit reviews, resume suggestions, cover letters, LinkedIn messages, follow-ups, and interview prep
- Export/import backup
- Offline-ready files after hosting over HTTPS
- Optional browser notifications if your iPhone/Safari setup allows them

## Important

Your data is saved in Safari on the device. Use Export regularly so you have a backup.

This version does not connect to a real AI API yet. Create Documents uses built-in templates, your Master Resume text, and job-description keywords. A later version can connect to OpenAI or another AI provider.

## Supabase Login Setup

1. Open Supabase.
2. Go to SQL Editor.
3. Paste and run `supabase-setup.sql`.
4. Go to Authentication, then URL Configuration.
5. Add your GitHub Pages app URL as the Site URL.
6. Add the same URL under Redirect URLs if Supabase asks for it.
7. Upload `index.html`, `app.js`, `README.md`, `IPHONE_SETUP.md`, and `supabase-setup.sql` to GitHub.
