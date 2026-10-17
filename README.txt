JACKPOT DEAL — ADMIN REQUEST DASHBOARD

RUN LOCALLY (DEVELOPMENT)
1. Install Node.js LTS.
2. Extract this ZIP and open a terminal in the jackpot-final folder.
3. Run: npm install
4. Keep the included .env file private. It contains the admin credentials and a session secret. For a fresh deployment, use a new long random SESSION_SECRET.
5. In Terminal 1, run: npm start
   The Node.js backend should say it is running at http://localhost:3000.
6. In Terminal 2 (same jackpot-final folder), run: npm run dev
7. Open the Vite URL shown in Terminal 2, usually http://localhost:5173. The included vite.config.js forwards /api requests to the backend on port 3000.

RUN LOCALLY (BUILT SITE)
1. Run: npm install
2. Run: npm run build
3. Run: npm start
4. Open http://localhost:3000

ADMIN
Tap the small ⋮ in the top-right corner and sign in using the private credentials in your .env file. Admin can approve or reject requests. Credentials are read by the server from .env and are not included in React/browser source. Login attempts are rate-limited and the session cookie is HTTP-only.

TROUBLESHOOTING
- If the site says “Request failed (HTTP 404)”, make sure `npm start` is running in one terminal and `npm run dev` is running in a second terminal. Do not open index.html directly from File Explorer.
- Check the backend by opening http://localhost:3000/api/health. It should return JSON with {"ok":true,"service":"jackpot-deal-api"}.
- If port 3000 is already in use, stop the other process or update PORT in .env and the target in vite.config.js to the same port.

IMPORTANT LIMITATIONS / DEPLOYMENT
- The request list is stored in data/requests.json on this server. Back up this file. This is suitable as a small demo, not a high-availability production store.
- To make it available to multiple customers online, deploy the Node server to a host with persistent storage, configure environment variables privately, and use HTTPS. Do not deploy only the static dist folder or open index.html directly; the API/server is required.
- Admin approval is a manual status change. Verify the actual payment in your UPI/bank account before approving. OCR or a UTR typed from a screenshot is not proof of payment. This app does not automatically verify UPI payments or release a coupon based on verified gateway webhooks.
- Replace the placeholder UPI QR and UPI ID with verified details before using checkout.
- User requests contain personal information (name, phone, optional email, UTR). Restrict server access and set a retention policy. For production, use a database and a persistent session store, add CSRF protection, privacy notice, validation, and audit logging.
