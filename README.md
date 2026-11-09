# Depot Stock SHX on Vercel

Folders: api/ (server functions) | lib/ (storage, Excel reader, link + Outlook code) | public/index.html (the page) | vercel.json (12 PM schedule)

## Deploy, step by step
1. Put this folder in a GitHub repository (github.com > New repository > upload these files).
2. vercel.com > Add New > Project > import that repository > Deploy (no build settings needed).
3. Add storage: in the project open Storage > Create/Connect > Upstash Redis (Marketplace). Connect it to the project. This adds KV_REST_API_URL and KV_REST_API_TOKEN by itself.
4. Project > Settings > Environment Variables, add:
   UPLOAD_PASSWORD   your admin password
   CRON_SECRET       any long random text (protects the daily job)
   Optional, for Outlook sync: MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MS_MAILBOX, MAIL_SUBJECT_REGEX (e.g. NSER|Expance), MAIL_FROM
5. Redeploy (Deployments > ... > Redeploy). Open your vercel.app address.

## Loading data
- Paste the link from your mail (File Sender, OneDrive, SharePoint, Google Drive, direct .xlsx) in the Admin box > Update from link. The site remembers the link and re-checks it.
- Upload an Excel by hand (Admin login > Choose File). Vercel limits uploads to 4.5 MB, so for bigger files use the link box.
- Automatic: vercel.json runs /api/cron every day at 06:15 and 08:00 UTC (12:15 PM and 2:00 PM Dhaka). It re-checks saved links and reads new Outlook mail. Cron needs the project on Vercel; on the free Hobby plan each job runs once a day (up to an hour late). Edit the "schedule" lines in vercel.json to change the time (UTC).
- Outlook setup (Azure app with Mail.Read, once, by your IT admin): portal.azure.com > Entra ID > App registrations > New > copy client ID and tenant ID > Certificates & secrets > new secret > API permissions > Microsoft Graph > Application > Mail.Read > Grant admin consent.

## Limits
- Direct upload max 4.5 MB; link/Outlook downloads up to about 100 MB, but a very large Excel may need the Vercel Pro plan (more memory and time).
- Daily NSER files that arrive by link each day carry a new link: paste the new one, or use the Outlook sync.
