# Review & Edit Features Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan.

**Goal:** Add full article body to review emails and review page; fix return-to-app link; add inline article editing; add Review Requests card in the generate page left panel.

**Architecture:** All changes are isolated to three files: `api/review/send.js` (email HTML), `api/review/[token].js` (review page HTML + confirmation links), and `index.html` (edit mode UI + review requests card). No new API routes needed — the existing `PUT /api/content/{id}` endpoint handles article body updates, and `GET /api/content/{id}` feeds the review card.

**Tech Stack:** Vanilla JS, HTML/CSS (single-file SPA), Vercel KV (article state), Resend (email), `jose` JWT tokens (review links)

---

## Task 1: Full article body in review email

**Files:**
- Modify: `api/review/send.js` — `buildApprovalEmail()` function

The current email shows only a 300-char excerpt. We need to render the full `content.body` as readable HTML in the email. Since `body` is markdown-like text, strip tags and render as a preformatted block. Cap at ~4000 chars to stay inside email client limits.

- [ ] In `buildApprovalEmail()`, replace the excerpt `<p>` block with a full-body section:

```js
// After the metadata table, before the action buttons — replace the excerpt block:
const plainBody = (content.body || content.excerpt || '')
  .replace(/<[^>]+>/g, '')          // strip any HTML tags
  .replace(/#{1,6}\s*/g, '')        // strip markdown headings
  .trim();
const bodyPreview = plainBody.slice(0, 4000) + (plainBody.length > 4000 ? '\n\n[…article continues]' : '');
```

- [ ] Replace the existing excerpt conditional in the email HTML template:

**Before:**
```js
${content.excerpt ? `<p style="color:#555;font-size:14px;line-height:1.6;border-left:3px solid #dde3ea;padding-left:12px;margin:0 0 24px;">${content.excerpt.substring(0, 300)}…</p>` : ''}
```

**After:**
```js
${bodyPreview ? `
<div style="margin:0 0 24px;">
  <p style="font-size:11px;color:#6b7a8d;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;">Full Article</p>
  <div style="background:#fafbfc;border:1px solid #dde3ea;border-radius:6px;padding:16px 18px;
              font-size:13px;color:#333;line-height:1.75;white-space:pre-wrap;font-family:Georgia,serif;
              max-height:600px;overflow:hidden;">
    ${bodyPreview.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
  </div>
</div>` : ''}
```

- [ ] Verify: no test change needed (email HTML is visual only); do a manual send after deploy.

- [ ] Commit:
```bash
git add api/review/send.js
git commit -m "feat: include full article body in review request email"
```

---

## Task 2: Full article body on review page

**Files:**
- Modify: `api/review/[token].js` — `feedbackPage()` function

Currently shows a 600-char excerpt. Replace with full rendered body in a scrollable container.

- [ ] In `feedbackPage()`, replace the excerpt extraction:

**Before:**
```js
const excerpt = (item.body || item.excerpt || '')
  .replace(/<[^>]+>/g, '')
  .replace(/#+\s*/g, '')
  .trim()
  .slice(0, 600);
```

**After:**
```js
const fullBody = (item.body || item.excerpt || '')
  .replace(/<[^>]+>/g, '')
  .replace(/#{1,6}\s*/g, '')
  .trim();
```

- [ ] Update the excerpt div in `feedbackPage()` HTML:

**Before:**
```js
${excerpt ? `<div class="excerpt">${escHtml(excerpt)}${excerpt.length >= 600 ? '…' : ''}</div>` : ''}
```

**After:**
```js
${fullBody ? `
<details open style="margin-bottom:20px;">
  <summary style="font-size:0.8rem;font-weight:700;color:#1e2d40;cursor:pointer;padding:8px 0;
                  list-style:none;display:flex;align-items:center;gap:6px;">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
         style="width:13px;height:13px;flex-shrink:0;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
    Full Article — ${escHtml(item.title)}
  </summary>
  <div style="background:#f8f9fa;border:1px solid #dde3ea;border-radius:0 0 6px 6px;
              padding:16px 18px;font-family:Georgia,serif;font-size:0.875rem;
              line-height:1.8;color:#333;white-space:pre-wrap;
              max-height:480px;overflow-y:auto;">${escHtml(fullBody)}</div>
</details>` : ''}
```

- [ ] Also add the `.excerpt` CSS class update in the `<style>` block in `shell()` — raise `max-height` to `480px` and add `overflow-y:auto` (already done above via inline style; existing `.excerpt` class can stay for other uses).

- [ ] Commit:
```bash
git add "api/review/[token].js"
git commit -m "feat: show full article body on review feedback page"
```

---

## Task 3: Return-to-app link → Pipeline tab

**Files:**
- Modify: `api/review/[token].js` — `confirmPage()` and `DOMContentLoaded` in `index.html`

The confirmation page after approving/rejecting currently links to `href="/"`. We need it to deep-link to `/#pipeline`. The SPA needs to read the hash on load and switch to the correct tab.

### 3a — Fix confirmation page link

- [ ] In `api/review/[token].js`, update `confirmPage()`:

**Before:**
```js
<a class="back" href="/">Return to app →</a>
```

**After:**
```js
<a class="back" href="/#pipeline">Return to app →</a>
```

### 3b — Add hash routing to SPA init

- [ ] In `index.html`, in the `DOMContentLoaded` listener (around line 5910, after `switchTab('dashboard')`), add:

```js
// Deep-link support: /#pipeline, /#generator, etc.
const hashTab = window.location.hash.replace('#', '');
if (hashTab && ['dashboard','generator','archive','pipeline','distribution','calendar','monitoring','settings','prompts','llm'].includes(hashTab)) {
  switchTab(hashTab);
  window.location.hash = ''; // clean URL after routing
}
```

- [ ] Commit:
```bash
git add "api/review/[token].js" index.html
git commit -m "feat: return-to-app links to pipeline tab via hash routing"
```

---

## Task 4: Inline article editing

**Files:**
- Modify: `index.html`
  - CSS: add `.article-edit-mode` styles (~15 lines)
  - HTML: add Edit button to article toolbar; add hidden edit-mode textarea + save controls
  - JS: `enterEditMode()`, `exitEditMode()`, `saveArticleEdits(replace)` functions
  - State: add `let currentContentId = null;`
  - After `queueCurrentForPublishing()` success: set `currentContentId`

### 4a — State variable

- [ ] After `let rawArticleText = '';` (around line 3800), add:
```js
let currentContentId = null; // pipeline KV id of the currently loaded/generated article
```

- [ ] After the `created` check in `queueCurrentForPublishing()` (around line 5570):

**Before:**
```js
if (created) {
  publishingQueue.push({ ...created, model, wordCount, queuedAt: created.createdAt });
}
```

**After:**
```js
if (created) {
  currentContentId = created.id;
  publishingQueue.push({ ...created, model, wordCount, queuedAt: created.createdAt });
}
```

### 4b — Edit mode CSS

- [ ] Add after existing `.article-output` CSS rules (around line 470):

```css
.article-edit-textarea {
  width: 100%; min-height: 420px; padding: 18px 22px;
  border: 2px solid var(--sla-orange); border-radius: var(--radius);
  font-family: 'Georgia', serif; font-size: 0.9rem; line-height: 1.8;
  color: var(--text); background: var(--card); resize: vertical;
  box-sizing: border-box; display: none;
}
.article-output.edit-mode .article-edit-textarea { display: block; }
.article-output.edit-mode #articleContent { display: none; }
.edit-mode-toolbar {
  display: none; gap: 8px; padding: 8px 0 4px; flex-wrap: wrap; align-items: center;
}
.article-output.edit-mode .edit-mode-toolbar { display: flex; }
.edit-hint { font-size: 0.65rem; color: var(--text-muted); margin-left: auto; }
```

### 4c — Edit button in article toolbar

- [ ] In the article toolbar HTML (around the `queueForPublishBtn` area), add an Edit button:

**Find** (near `saveReviewToArchive` button):
```html
<button onclick="saveReviewToArchive()">Save to Library</button>
```

**Add immediately after:**
```html
<button class="btn btn-outline btn-xs" id="editArticleBtn" onclick="enterEditMode()" disabled style="background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.15);color:#fff;">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
  Edit
</button>
```

- [ ] Also enable `editArticleBtn` alongside `queueForPublishBtn` and `sfrBtn` after generation completes (in the `setStatus('done', 'Done')` block):
```js
const editBtn = document.getElementById('editArticleBtn');
if (editBtn) editBtn.disabled = false;
```

### 4d — Edit mode UI inside article output

- [ ] Inside `#articleOutput` div (after `#articleContent`), add:

```html
<textarea class="article-edit-textarea" id="articleEditTextarea" placeholder="Edit article text here…"></textarea>
<div class="edit-mode-toolbar">
  <button class="btn btn-orange btn-sm" onclick="saveArticleEdits(true)">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg>
    Save Changes
  </button>
  <button class="btn btn-outline btn-sm" onclick="saveArticleEdits(false)">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
    Save as New
  </button>
  <button class="btn btn-outline btn-sm" onclick="exitEditMode()">Cancel</button>
  <span class="edit-hint">Save Changes replaces the current article. Save as New creates a copy.</span>
</div>
```

### 4e — Edit mode JS functions

- [ ] Add after `queueCurrentForPublishing()` function:

```js
function enterEditMode() {
  const ta = document.getElementById('articleEditTextarea');
  if (!ta) return;
  ta.value = rawArticleText;
  document.getElementById('articleOutput').classList.add('edit-mode');
  document.getElementById('editArticleBtn').style.display = 'none';
  ta.focus();
}

function exitEditMode() {
  document.getElementById('articleOutput').classList.remove('edit-mode');
  document.getElementById('editArticleBtn').style.display = '';
}

async function saveArticleEdits(replace) {
  const ta = document.getElementById('articleEditTextarea');
  if (!ta) return;
  const newText = ta.value.trim();
  if (!newText) return;

  // Update in-memory state
  rawArticleText = newText;
  document.getElementById('articleContent').innerHTML = formatArticleHTML(rawArticleText);
  document.getElementById('wordCount').textContent =
    rawArticleText.split(/\s+/).filter(w => w).length.toLocaleString() + ' words';
  exitEditMode();

  if (replace && currentContentId) {
    // Update existing pipeline item
    try {
      const r = await fetch(`/api/content/${currentContentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: newText, excerpt: newText.split(/\s+/).slice(0, 30).join(' ') + '…' }),
      });
      if (!r.ok) throw new Error((await r.json()).error || r.statusText);
      showAlert('generateAlert', '✓ Article updated in pipeline', 'success');
    } catch(e) {
      showAlert('generateAlert', 'Update failed: ' + e.message, 'error');
    }
  } else {
    // Save as new archive entry
    saveReviewToArchive();
  }
}
```

- [ ] Commit:
```bash
git add index.html
git commit -m "feat: inline article editing with save/save-as-new"
```

---

## Task 5: Review Requests card in left panel

**Files:**
- Modify: `index.html`
  - CSS: `.review-requests-card` styles
  - HTML: card above `.prompt-editor-card`
  - JS: `loadReviewRequestCard()`, `closeReviewRequest()`, `resendReview()`

The card is shown whenever `currentContentId` is set. It fetches the KV record on demand and renders status, reviewer feedback, and action buttons.

### 5a — CSS

- [ ] Add after existing `.prompt-editor-card { }` CSS:

```css
.review-req-card { border-left: 4px solid var(--sla-orange); }
.review-req-status { display: inline-flex; align-items: center; gap: 5px;
  font-size: 0.65rem; font-weight: 800; padding: 3px 8px; border-radius: 4px;
  text-transform: uppercase; letter-spacing: 0.5px; }
.review-req-status.s-in_review { background: rgba(26,82,118,0.1); color: #1a5276; }
.review-req-status.s-approved   { background: rgba(39,174,96,0.1);  color: #1a7245; }
.review-req-status.s-rejected   { background: rgba(192,57,43,0.1);  color: #922b21; }
.review-req-status.s-draft      { background: rgba(100,100,100,0.1);color: #555; }
.review-req-log { display: flex; flex-direction: column; gap: 8px; margin: 10px 0; }
.review-req-log-item { background: var(--bg); border: 1px solid var(--border);
  border-radius: 6px; padding: 9px 12px; font-size: 0.72rem; line-height: 1.55; }
.review-req-log-item .rr-label { font-weight: 700; color: var(--sla-navy); margin-bottom: 3px; }
.review-req-log-item .rr-comment { color: var(--text); font-style: italic; margin-top: 4px;
  border-left: 2px solid var(--sla-orange); padding-left: 8px; }
.review-req-log-item .rr-ts { font-size: 0.6rem; color: var(--text-muted); margin-top: 4px; }
.review-req-actions { display: flex; gap: 7px; flex-wrap: wrap; margin-top: 10px; }
```

### 5b — HTML card (above Prompt Editor)

- [ ] Find the Prompt Editor card opening tag in the left panel:

```html
<!-- Prompt Editor -->
<div class="card prompt-editor-card">
```

- [ ] Insert the Review Requests card immediately before it:

```html
<!-- Review Requests Card -->
<div class="card review-req-card" id="reviewRequestsCard" style="display:none;">
  <div class="card-header">
    <h2>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5 19.79 19.79 0 0 1 1.61 5a2 2 0 0 1 1.99-2.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 10.5a16 16 0 0 0 5.55 5.55l1.87-1.87a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
      </svg>
      Review Requests
    </h2>
    <span class="review-req-status s-draft" id="reviewReqStatusBadge">Draft</span>
  </div>
  <div class="card-body" id="reviewRequestsBody">
    <p style="font-size:0.72rem;color:var(--text-muted);">Add article to pipeline to track review status.</p>
  </div>
</div>
```

### 5c — JS: loadReviewRequestCard

- [ ] Add the following function after `sendForReview()`:

```js
async function loadReviewRequestCard() {
  const card = document.getElementById('reviewRequestsCard');
  if (!card) return;

  if (!currentContentId) { card.style.display = 'none'; return; }
  card.style.display = '';

  const body = document.getElementById('reviewRequestsBody');
  const badge = document.getElementById('reviewReqStatusBadge');
  body.innerHTML = '<p style="font-size:0.72rem;color:var(--text-muted);">Loading…</p>';

  try {
    const r = await fetch(`/api/content/${currentContentId}`);
    if (!r.ok) throw new Error(r.statusText);
    const item = await r.json();

    const STATUS_LABELS = {
      draft: 'Draft', in_review: 'In Review',
      rejected: 'Changes Requested', approved: 'Approved',
      scheduled: 'Scheduled', published: 'Published',
    };
    const st = item.status || 'draft';
    badge.textContent = STATUS_LABELS[st] || st;
    badge.className = 'review-req-status s-' + st;

    // Build log items from rejection comments + current status
    const logItems = (item.rejectionComments || []).map(function(c) {
      return `<div class="review-req-log-item">
        <div class="rr-label">Changes Requested</div>
        <div class="rr-comment">${escapeHtml(c.comment)}</div>
        <div class="rr-ts">${c.at ? new Date(c.at).toLocaleString('en-GB') : ''}</div>
      </div>`;
    });

    if (item.approvals && item.approvals.length) {
      logItems.push(`<div class="review-req-log-item">
        <div class="rr-label" style="color:#1a7245;">✓ Approved</div>
        <div class="rr-ts">${item.approvedAt ? new Date(item.approvedAt).toLocaleString('en-GB') : ''}</div>
      </div>`);
    }

    const sentInfo = item.updatedAt
      ? `<p style="font-size:0.68rem;color:var(--text-muted);margin-bottom:8px;">
           Last updated: ${new Date(item.updatedAt).toLocaleString('en-GB')}
         </p>`
      : '';

    body.innerHTML = sentInfo +
      (logItems.length ? `<div class="review-req-log">${logItems.join('')}</div>` : '') +
      `<div class="review-req-actions">
        <button class="btn btn-orange btn-sm" onclick="resendReview()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          Resend for Review
        </button>
        ${st !== 'draft' ? `<button class="btn btn-outline btn-sm" onclick="closeReviewRequest()">Close &amp; Reset to Draft</button>` : ''}
      </div>`;

  } catch(e) {
    body.innerHTML = `<p style="font-size:0.72rem;color:var(--text-muted);">Could not load review status: ${e.message}</p>`;
  }
}

async function closeReviewRequest() {
  if (!currentContentId) return;
  const btn = event?.target;
  if (btn) { btn.disabled = true; btn.textContent = 'Resetting…'; }
  try {
    const r = await fetch(`/api/content/${currentContentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'draft', approvals: [], rejections: [], rejectionComments: [] }),
    });
    if (!r.ok) throw new Error((await r.json()).error || r.statusText);
    showAlert('generateAlert', '✓ Review closed — article reset to Draft', 'success');
    await loadReviewRequestCard();
  } catch(e) {
    showAlert('generateAlert', 'Reset failed: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Close & Reset to Draft'; }
  }
}

async function resendReview() {
  if (!currentContentId) return;
  await sendForReview(currentContentId);
  setTimeout(() => loadReviewRequestCard(), 1200);
}
```

### 5d — Wire loadReviewRequestCard into key events

- [ ] After `queueCurrentForPublishing()` sets `currentContentId`, call:
```js
loadReviewRequestCard();
```

- [ ] After `sendForReview()` success callback (inside the try block, after the `loadPipeline()` call):
```js
loadReviewRequestCard();
```

- [ ] After `closeReviewRequest()` success — already calls `loadReviewRequestCard()` (done above).

- [ ] Commit:
```bash
git add index.html
git commit -m "feat: review requests card in generate page left panel"
```

---

## Final: Syntax check + deploy

- [ ] Run syntax check:
```bash
node -e "const fs=require('fs');const html=fs.readFileSync('index.html','utf8');const m=html.match(/<script>([\s\S]*?)<\/script>/g);let ok=0,fail=0;(m||[]).forEach((s,i)=>{const code=s.replace(/<\/?script>/g,'');try{new Function(code);ok++;}catch(e){console.error('BLOCK',i,e.message.slice(0,120));fail++;}});console.log('OK:',ok,'FAIL:',fail);"
```
Expected: `OK: 1 FAIL: 0`

- [ ] Commit all remaining changes and deploy:
```bash
git add index.html api/review/send.js "api/review/[token].js"
git commit -m "feat: review email body, edit mode, review card, pipeline deep-link"
git push origin main && npx vercel --prod --yes
```
