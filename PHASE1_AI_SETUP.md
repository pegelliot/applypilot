# ApplyPilot Phase 1 AI Setup

This adds real AI generation to **Create Documents**.

## What This Upgrade Does

When a signed-in user taps **Create > Generate**, ApplyPilot sends the selected job, Master Resume text, and draft type to a Supabase Edge Function. The Edge Function calls OpenAI and returns a tailored draft.

The OpenAI API key stays in Supabase. Do not paste it into `app.js`.

## Files To Upload To GitHub

Upload these updated web files:

- `app.js`
- `service-worker.js`

Also keep the new backend function folder in your local project:

- `supabase/functions/generate-documents/index.ts`

GitHub Pages will not deploy the Supabase function. That function must be deployed in Supabase.

## Step 1: Get An OpenAI API Key

1. Go to https://platform.openai.com/api-keys
2. Create a new API key.
3. Copy it once.
4. Do not put it in GitHub.

## Step 2: Install Supabase CLI

On your Dell, open PowerShell and run:

```powershell
npm install -g supabase
```

If `npm` is not installed, install Node.js first:

https://nodejs.org/

## Step 3: Log In To Supabase

```powershell
supabase login
```

Follow the browser prompt.

## Step 4: Link This Project

Your Supabase project ref is:

```text
yjxnksqyegdhaqewjwzq
```

From this folder:

```powershell
cd "C:\Users\pegme\OneDrive\Documents\New project\ApplyPilotWeb"
supabase link --project-ref yjxnksqyegdhaqewjwzq
```

## Step 5: Add The OpenAI Secret To Supabase

Replace `YOUR_OPENAI_API_KEY` with the key from OpenAI:

```powershell
supabase secrets set OPENAI_API_KEY=YOUR_OPENAI_API_KEY
```

Optional model override:

```powershell
supabase secrets set OPENAI_MODEL=gpt-4.1-mini
```

## Step 6: Deploy The Function

```powershell
supabase functions deploy generate-documents
```

## Step 7: Upload Updated Web Files To GitHub

Upload/replace:

- `app.js`
- `service-worker.js`

Then wait for GitHub Pages to deploy.

## Step 8: Test In ApplyPilot

1. Open ApplyPilot.
2. Go to **More**.
3. Sign in.
4. Make sure you have a **Master Resume** document.
5. Make sure one job has a job description.
6. Go to **Create**.
7. Pick the job.
8. Pick **Cover Letter**.
9. Tap **Generate**.

If the Edge Function is deployed correctly, the draft will be AI-generated. If not, the app will show a local starter draft plus a setup note.
