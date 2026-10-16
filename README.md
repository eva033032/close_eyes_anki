# Close Eyes

A sentence listening and spaced-repetition app. Paste paired original and translation sentences, or import a Markdown file with those pairs. Articles, saved sentences, and progress are stored in Supabase and loaded after sign-in. The browser does not persist learning data or the authentication session, so sign in again after reloading the app. No AI translation service is used.

## Run locally

1. Install Python 3.10 or later.
2. Open PowerShell in this folder and run `.\start.ps1`.
3. Open `http://127.0.0.1:8000`.

For each pair, put the original sentence on one line and its translation on the next line. Separate pairs with a blank line. The same format works in the paste box and in `.md` files. The importer rejects unpaired sentences. See `sentence-pairs-template.md`. When adding an article, choose YouTube, book, or a custom source and optionally add a URL. In the library, create folders and drag articles into them; sort by date added or name. Mark an article or folder public to share it with other signed-in accounts. Use the Public Library page to browse and import shared items.

## Supabase cloud sync

The SQL setup is in `supabase-setup.sql`. Run the full file in Supabase SQL Editor, including the public library table and policies, to enable cross-account sharing:

1. In the Supabase dashboard, open **Authentication > URL Configuration**. Set the **Site URL** to your deployed Vercel URL after deployment. Add that exact site URL and its auth callback URL to **Redirect URLs**.
2. In **Authentication > Providers > Email**, choose whether new accounts require email confirmation. If enabled, use a real inbox and confirm the message before signing in.
3. Open the app, create a Supabase account or sign in. Learning data is available only while signed in.

The browser uses the Supabase project URL and publishable key in `cloud-sync.js`. Never put a database password or service-role/secret key in browser code.

## Deploy to Vercel

This is a static site; it does not need server functions or AI environment variables. From PowerShell in this folder:

1. Run `npx vercel@latest login` and complete the browser sign-in.
2. Run `npx vercel@latest --prod`. If prompted, create a project and accept the current folder as its root.
3. Copy the production URL Vercel prints. In Supabase, set **Authentication > URL Configuration > Site URL** to that URL and add the URL plus `https://your-site.vercel.app/**` under **Redirect URLs** (replace the host with your actual Vercel domain).
4. Reload the deployed app, create/sign into a test account, and check that the same article appears after signing in from another browser/device.

The Vercel Hobby plan has usage limits and is intended for personal use.
