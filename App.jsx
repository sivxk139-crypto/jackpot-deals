import React, { useState } from "react";
import { createWorker } from "tesseract.js";
import "./style.css";

const AMOUNT = "9.00";
const UPI_ID = "YOUR_UPI_ID"; // Replace with your UPI ID if you want the Open UPI button.
const PAYEE_NAME = "Jackpot Deal";

// Clearly marked sample entries for preview only. Replace with real, verified
// activity from your backend before presenting this as live customer activity.
const SAMPLE_ACTIVITY = [
  "Aarav K. — coupon unlocked",
  "Priya M. — got the deal",
  "Rahul S. — coupon unlocked",
  "Sneha R. — got the deal",
  "Vikram P. — coupon unlocked",
  "Ananya D. — got the deal",
  "Kiran T. — coupon unlocked",
  "Meera N. — got the deal",
  "Arjun V. — coupon unlocked",
  "Diya B. — got the deal",
  "Rohit G. — coupon unlocked",
  "Isha L. — got the deal",
  "Sai R. — coupon unlocked",
  "Neha P. — got the deal",
  "Aditya J. — coupon unlocked",
];

export default function App() {
  const [page, setPage] = useState("home");
  const [user, setUser] = useState({ name: "", phone: "", email: "" });
  const [reference, setReference] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [qrMissing, setQrMissing] = useState(false);
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptStatus, setReceiptStatus] = useState("idle");
  const [receiptMessage, setReceiptMessage] = useState("");
  const [ocrText, setOcrText] = useState("");
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminLoggedIn, setAdminLoggedIn] = useState(false);
  const [adminId, setAdminId] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState("");
  const [adminRequests, setAdminRequests] = useState([]);
  const [adminBusy, setAdminBusy] = useState(false);

  async function loadAdminRequests() {
    const response = await fetch("/api/admin/requests", { credentials: "include" });
    if (!response.ok) throw new Error("Could not load requests");
    setAdminRequests(await response.json());
  }

  async function adminLogin(event) {
    event.preventDefault();
    setAdminBusy(true); setAdminError("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ username: adminId, password: adminPassword })
      });
      if (!response.ok) throw new Error("Invalid admin ID or password.");
      setAdminLoggedIn(true); setAdminPassword("");
      await loadAdminRequests();
    } catch (error) { setAdminError(error.message || "Login failed."); }
    finally { setAdminBusy(false); }
  }

  async function updateRequestStatus(id, status) {
    setAdminBusy(true);
    try {
      const response = await fetch(`/api/admin/requests/${encodeURIComponent(id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ status })
      });
      if (!response.ok) throw new Error("Could not update request.");
      await loadAdminRequests();
    } catch (error) { setAdminError(error.message || "Update failed."); }
    finally { setAdminBusy(false); }
  }

  async function adminLogout() {
    await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
    setAdminLoggedIn(false); setAdminRequests([]); setAdminId(""); setAdminPassword("");
  }

  const upiLink = `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent(PAYEE_NAME)}&am=${AMOUNT}&cu=INR&tn=${encodeURIComponent("Jackpot Deal order")}`;

  function submitDetails(event) {
    event.preventDefault();
    if (!/^[0-9]{10}$/.test(user.phone)) return;
    setPage("payment");
  }

  async function checkReceipt(file) {
    setReceiptFile(file || null);
    setReference("");
    setSubmitted(false);
    setOcrText("");
    if (!file) { setReceiptStatus("idle"); setReceiptMessage(""); return; }
    if (!file.type.startsWith("image/")) {
      setReceiptStatus("rejected"); setReceiptMessage("Please upload a payment-history screenshot image."); return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setReceiptStatus("rejected"); setReceiptMessage("Image is too large. Upload an image smaller than 8 MB."); return;
    }
    setReceiptStatus("checking");
    setReceiptMessage("Checking screenshot text…");
    let worker;
    try {
      worker = await createWorker("eng");
      const result = await worker.recognize(file);
      const text = result.data.text || "";
      setOcrText(text);
      const normalized = text.toLowerCase().replace(/\s+/g, " ");
      const looksLikeHistory = /utr|upi|transaction|payment|paid to|paid|successful|success|reference|credited|debit|transfer|amount|₹|rs\.?/i.test(text);
      const hasSiva = /\bsiva\b/i.test(text);
      const utrMatch = text.match(/(?:UTR|UPI\s*(?:ref(?:erence)?|transaction)?\s*(?:ID|no\.?|number)?|RRN|reference(?:\s*(?:no\.?|number|ID))?)\s*[:#-]?\s*([A-Z0-9]{8,22})/i)
        || text.match(/\b[0-9]{12}\b/);
      if (!looksLikeHistory) {
        setReceiptStatus("rejected"); setReceiptMessage("This doesn't look like a payment-history screenshot. Please upload the correct screenshot.");
      } else if (!hasSiva) {
        setReceiptStatus("rejected"); setReceiptMessage('Recipient name “Siva” was not found. Upload a payment screenshot showing receiver name Siva.');
      } else if (!utrMatch) {
        setReceiptStatus("rejected"); setReceiptMessage("Receiver name Siva was found, but the UTR/reference number could not be read. Upload a clearer screenshot.");
      } else {
        setReference(utrMatch[1]);
        setReceiptStatus("accepted");
        setReceiptMessage('“Siva” found and a reference number was extracted. This is only a screenshot-text check; payment is not yet verified.');
      }
    } catch (error) {
      setReceiptStatus("rejected");
      setReceiptMessage("Could not read this image. Please upload a clear payment-history screenshot.");
    } finally {
      if (worker) await worker.terminate();
    }
  }

  function submitReference(event) {
    event.preventDefault();
    if (receiptStatus !== "accepted" || !reference) return;
    fetch("/api/requests", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: user.name, phone: user.phone, email: user.email, reference, amount: AMOUNT })
    }).then(async (response) => {
      if (!response.ok) {
        let details = {};
        try { details = await response.json(); } catch {}
        throw new Error(details.error || `Request failed (HTTP ${response.status}).`);
      }
      setSubmitted(true);
      setReceiptMessage("Your request was submitted and is awaiting admin review.");
    }).catch((error) => setReceiptMessage(`${error.message || "Could not submit your request."} Make sure the Node.js backend is running and the site is opened from that server.`));
  }

  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="#home" onClick={(e) => { e.preventDefault(); setPage("home"); }}>
          <span className="brand-mark">✦</span><span>JACKPOT <b>DEAL</b></span>
        </a>
        <div className="header-actions">
          <button className="admin-trigger" aria-label="Admin sign in" title="Admin" onClick={() => setAdminOpen((v) => !v)}>⋮</button>
          <span className="secure-pill"><span className="tiny-lock">⌑</span> CHECKOUT</span>
        </div>
      </header>

      {adminOpen && <section className="admin-wrap">
        <div className="admin-panel">
          <div className="admin-heading"><div><span className="step-label">PRIVATE AREA</span><h2>Admin dashboard</h2></div><button className="admin-close" onClick={() => { setAdminOpen(false); setAdminError(""); }}>×</button></div>
          {!adminLoggedIn ? <form className="admin-login" onSubmit={adminLogin}>
            <label htmlFor="admin-id">Admin ID</label><input id="admin-id" autoComplete="username" value={adminId} onChange={(e) => setAdminId(e.target.value)} required />
            <label htmlFor="admin-password">Password</label><input id="admin-password" type="password" autoComplete="current-password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} required />
            {adminError && <p className="admin-error">{adminError}</p>}
            <button className="primary-btn" disabled={adminBusy} type="submit">{adminBusy ? "PLEASE WAIT…" : "SIGN IN"}</button>
            <p className="microcopy">Admin credentials are checked by the server and are not embedded in the public React code.</p>
          </form> : <div className="admin-requests">
            <div className="admin-list-head"><h3>Customer requests ({adminRequests.length})</h3><button className="admin-text-btn" onClick={() => loadAdminRequests().catch((e) => setAdminError(e.message))}>Refresh</button></div>
            {adminError && <p className="admin-error">{adminError}</p>}
            {adminRequests.length === 0 ? <p className="microcopy">No requests submitted yet.</p> : adminRequests.map((request) => <article className="request-card" key={request.id}>
              <div className="request-top"><strong>{request.name}</strong><span className={`request-status ${request.status}`}>{request.status}</span></div>
              <p>Phone: {request.phone}{request.email ? ` · ${request.email}` : ""}</p>
              <p>Amount: ₹{request.amount} · UTR: {request.reference}</p>
              <p className="request-date">Submitted: {new Date(request.createdAt).toLocaleString()}</p>
              {request.status === "pending" && <div className="request-actions"><button disabled={adminBusy} onClick={() => updateRequestStatus(request.id, "approved")}>Approve</button><button disabled={adminBusy} onClick={() => updateRequestStatus(request.id, "rejected")}>Reject</button></div>}
            </article>)}
            <button className="admin-logout" onClick={adminLogout}>Sign out</button>
            <p className="microcopy">Approve only after independently confirming the payment in your UPI/bank records. Screenshot text alone is not proof of payment.</p>
          </div>}
        </div>
      </section>}

      <section className="activity-ticker" aria-label="Sample deal activity">
        <span className="activity-label"><span className="activity-dot" /> DEMO ACTIVITY</span>
        <div className="ticker-window">
          <div className="ticker-track">
            {[...SAMPLE_ACTIVITY, ...SAMPLE_ACTIVITY].map((item, index) => (
              <span className="ticker-item" key={`${item}-${index}`}>
                <span className="ticker-spark">✦</span> {item}
              </span>
            ))}
          </div>
        </div>
        <span className="activity-note">Sample names · not live purchases</span>
      </section>

      {page === "home" && <section className="hero">
        <div className="hero-glow" />
        <div className="deadline-banner" role="note">
          <div className="deadline-top">✦ LIMITED-TIME JACKPOT OFFER ✦</div>
          <div className="deadline-title">₹500 OFF COUPON</div>
          <div className="deadline-subtitle">GRAB IT FAST — DON'T MISS OUT!</div>
          <div className="deadline-time">OFFER ENDS: 19 OCTOBER AT 00:00 IST</div>
          <div className="deadline-note">Offer validity and coupon terms apply.</div>
        </div>
        <div className="eyebrow"><span className="sparkle">✦</span> A LITTLE DEAL. A BIG SURPRISE.</div>
        <div className="gift-scene" aria-hidden="true">
          <div className="orbit orbit-one" /><div className="orbit orbit-two" />
          <div className="gift-box"><div className="gift-lid"/><div className="gift-ribbon-v"/><div className="gift-ribbon-h"/><div className="gift-bow bow-left"/><div className="gift-bow bow-right"/></div>
          <span className="float-star star-a">✦</span><span className="float-star star-b">✧</span><span className="float-star star-c">✦</span>
        </div>
        <h1>Your next little<br/><span>surprise awaits.</span></h1>
        <p className="hero-copy">One simple deal. One special coupon.<br/>Make your ₹9 count.</p>
        <div className="offer-card"><div><span className="offer-label">YOUR DEAL FOR</span><div className="offer-price">₹9<span>.00</span></div></div><div className="offer-divider"/><div className="offer-right"><span className="offer-icon">✧</span><span>One-time<br/>payment</span></div></div>
        <button className="primary-btn" onClick={() => setPage("details")}>GET MY DEAL <span>↗</span></button>
        <div className="trust-row"><span>✓ Clear pricing</span><span>✓ UPI payment</span><span>✓ Coupon after verification</span></div>
        <p className="fineprint">Please review the offer details before paying. Your coupon is released only after payment is verified.</p>
      </section>}

      {page === "details" && <section className="panel-wrap"><div className="panel">
        <button className="back-link" onClick={() => setPage("home")}>← Back to deal</button>
        <div className="step-label">STEP 1 OF 2</div><h1 className="panel-title">Where should we<br/><span>send your deal?</span></h1>
        <p className="panel-copy">Enter your details to continue to secure checkout.</p>
        <form onSubmit={submitDetails} className="details-form">
          <label htmlFor="name">Full name</label><input id="name" autoComplete="name" type="text" maxLength="100" required placeholder="Enter your full name" value={user.name} onChange={(e) => setUser({ ...user, name: e.target.value })}/>
          <label htmlFor="phone">Mobile number</label><input id="phone" autoComplete="tel-national" type="tel" inputMode="numeric" pattern="[0-9]{10}" maxLength="10" required placeholder="10-digit mobile number" value={user.phone} onChange={(e) => setUser({ ...user, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}/>
          <label htmlFor="email">Email <span className="optional">OPTIONAL</span></label><input id="email" autoComplete="email" type="email" placeholder="you@example.com" value={user.email} onChange={(e) => setUser({ ...user, email: e.target.value })}/>
          <div className="privacy-note"><span>♧</span> Use your details only for this order and its confirmation.</div>
          <button className="primary-btn" type="submit">CONTINUE TO PAYMENT <span>→</span></button>
        </form>
      </div></section>}

      {page === "payment" && <section className="panel-wrap"><div className="panel payment-panel">
        <button className="back-link" onClick={() => { setPage("details"); setSubmitted(false); }}>← Edit details</button>
        <div className="step-label">STEP 2 OF 2</div><h1 className="panel-title">Complete your<br/><span>₹9 payment</span></h1>
        <p className="panel-copy">Hi {user.name.trim().split(/\s+/)[0] || "there"}, scan the QR with your UPI app.</p>
        <div className="amount-strip"><div><span className="offer-label">AMOUNT DUE</span><strong>₹9.00</strong></div><span className="one-time">ONE-TIME PAYMENT</span></div>
        <div className="qr-card">
          {!qrMissing ? <img className="qr-image" src="/upi-qr.png" alt="Your UPI payment QR code" onError={() => setQrMissing(true)}/> : <div className="qr-placeholder"><span className="qr-placeholder-icon">▦</span><b>Add your QR code</b><span>Place your QR image at<br/><code>public/upi-qr.png</code></span></div>}
          <div className="qr-caption"><span className="green-dot"/> Scan &amp; pay using a UPI app</div>
        </div>
        <div className="safety-callout"><span className="shield">✓</span><div><b>Check before you pay</b><p>Confirm the recipient name and ₹9 amount shown in your UPI app. Cancel if the details don't match.</p></div></div>
        <section className="retailer-section" aria-labelledby="retailer-title">
          <div className="retailer-heading"><span className="retailer-kicker">SHOPPING DESTINATIONS</span><h2 id="retailer-title">Where would you like to shop?</h2><p>Amazon, Flipkart and Myntra are shown as intended shopping destinations. Actual coupon use depends on the specific valid code and each retailer's terms.</p></div>
          <div className="retailer-grid">
            <div className="retailer-card amazon-card"><span className="retailer-mark">a</span><span className="retailer-name">amazon</span><span className="retailer-status">Code terms apply</span></div>
            <div className="retailer-card flipkart-card"><span className="retailer-mark">F</span><span className="retailer-name">Flipkart</span><span className="retailer-status">Code terms apply</span></div>
            <div className="retailer-card myntra-card"><span className="retailer-mark">M</span><span className="retailer-name">Myntra</span><span className="retailer-status">Code terms apply</span></div>
          </div>
          <p className="retailer-disclaimer">Important: paying ₹9 does not guarantee a universal discount on all three stores. Only a valid coupon with matching retailer terms can be advertised as applicable.</p>
        </section>
        {UPI_ID !== "YOUR_UPI_ID" && <a className="secondary-btn" href={upiLink}>OPEN UPI APP ↗</a>}
        <section className="reference-form receipt-upload">
          <label htmlFor="receipt">UPLOAD PAYMENT HISTORY SCREENSHOT <span className="optional">IMAGE</span></label>
          <p className="microcopy">Upload the transaction details/history screenshot after paying. We’ll read the text and look for receiver name “Siva”.</p>
          <input id="receipt" type="file" accept="image/*" onChange={(e) => checkReceipt(e.target.files?.[0])} />
          {receiptFile && <p className="microcopy">Selected: {receiptFile.name}</p>}
          {receiptStatus === "checking" && <div className="receipt-status checking" role="status">⌛ {receiptMessage}</div>}
          {receiptStatus === "rejected" && <div className="receipt-status rejected" role="alert">✕ {receiptMessage}</div>}
          {receiptStatus === "accepted" && <div className="receipt-status accepted" role="status">✓ {receiptMessage}</div>}
          {receiptStatus === "accepted" && <>
            <label htmlFor="reference">AUTO-FILLED UTR / REFERENCE NUMBER</label>
            <input id="reference" value={reference} readOnly aria-readonly="true" />
            <p className="microcopy">Please check the extracted number. OCR may make mistakes.</p>
            {!submitted ? <button className="primary-btn" type="button" onClick={() => submitReference({ preventDefault: () => {} })}>SUBMIT REQUEST FOR REVIEW <span>→</span></button> : <div className="pending-card"><span className="pending-icon">◷</span><div><b>Submitted — payment verification pending</b><p>Your screenshot and UTR have been read, but this demo cannot confirm the money reached Siva’s account. The coupon must remain locked until verified against trusted transaction records.</p></div></div>}
          </>}
        </section>
        <p className="microcopy receipt-warning">Screenshot text can be edited or reused. Finding “Siva” does not prove payment. Never unlock the coupon from OCR alone; verify the ₹9 transaction with actual UPI/bank records.</p>
        <div className="payment-foot"><span>⌑ Payment safety reminder</span><p>Never share your UPI PIN or OTP. You do not need to enter either on this website.</p></div>
      </div></section>}
      <footer className="footer"><span>© {new Date().getFullYear()} Jackpot Deal</span><span>Pay safely. Check the details.</span></footer>
    </main>
  );
}
