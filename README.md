# Close Eyes

A sentence listening, speaking practice, and spaced-repetition app. Paste paired original and translation sentences, or import a Markdown file with those pairs. Articles, saved sentences, speaking conversations, speaking cards, and progress are stored in Supabase and loaded after sign-in. The browser does not persist learning data or the authentication session, so sign in again after reloading the app. Speaking API keys can be encrypted and stored per account in Supabase for use across devices.

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

## Speaking practice

The Speaking page supports Gemini or Groq for conversation and Groq Whisper for English speech transcription. Users enter their own API keys and explicitly save them to Supabase from the page. The Edge Function encrypts the keys with AES-GCM before storing them in `user_ai_keys`; only the signed-in account can retrieve its keys through the function. The encryption secret must be configured separately and never committed. Speaking messages, saved vocabulary/phrases/sentences, review schedules, and recurring grammar patterns sync through `user_learning_data`.

Deploy the Edge Function once from this folder:

1. In PowerShell opened at the project folder, run `npx supabase login` and complete Supabase CLI authentication.
2. Run `npx supabase link --project-ref boxrkjgswlzbxeyvxgta`.
3. Run the full, updated `supabase-setup.sql` in Supabase Dashboard > SQL Editor. It creates the private `user_ai_keys` table.
4. In PowerShell, create and configure a random encryption secret (do not print or commit it):

   ```powershell
   $keyBytes = New-Object byte[] 32
   $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
   $rng.GetBytes($keyBytes)
   $speakingSecret = [Convert]::ToBase64String($keyBytes)
   npx supabase secrets set "SPEAKING_KEY_ENCRYPTION_SECRET=$speakingSecret"
   Remove-Variable speakingSecret,keyBytes,rng
   ```

5. Run `npx supabase functions deploy speaking-ai`.

Run these CLI commands in the current terminal with the working directory set to this project (`D:\Self_App\close_eyes_anki`). After deployment and the SQL update, sign into the app, enter keys on the Speaking page, and select **Save API keys to Supabase**. Other devices can then retrieve them after signing into that same account. If you later rotate the encryption secret, previously saved keys cannot be decrypted; clear and save them again with the new secret.

Gemini and Groq have their own API key and free-tier limits. The Speaking page shows the required-key notice and key entry fields.

## Deploy to Vercel

The frontend is a static site. Speaking AI calls use the Supabase Edge Function above. From PowerShell in this folder:

1. Run `npx vercel@latest login` and complete the browser sign-in.
2. Run `npx vercel@latest --prod`. If prompted, create a project and accept the current folder as its root.
3. Copy the production URL Vercel prints. In Supabase, set **Authentication > URL Configuration > Site URL** to that URL and add the URL plus `https://your-site.vercel.app/**` under **Redirect URLs** (replace the host with your actual Vercel domain).
4. Reload the deployed app, create/sign into a test account, and check that the same article appears after signing in from another browser/device.

The Vercel Hobby plan has usage limits and is intended for personal use.
