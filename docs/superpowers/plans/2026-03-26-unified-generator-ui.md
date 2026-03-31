# Unified Generator UI — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-category tab-panel generator UI with a single generation page — category dropdown, unified source input (Upload/Paste/URLs), and a structured prompt picker (Default/Load/New).

**Architecture:** All changes are confined to `index.html`. The `currentCategory` global and `extractedText` global are preserved; only the HTML panels that set them and the JS that reads them are restructured. Archive and reports cat bars remain untouched. The existing `promptTextarea` element and `generateReview()` are kept, with simplified branching.

**Tech Stack:** Inline HTML/CSS/JS in `index.html`. No build step. Deploy via `vercel --prod --yes`.

---

## Current State (what exists)

| Element | Lines | Role |
|---------|-------|------|
| `#catBar-generator` | 2323–2331 | Horizontal tab buttons, one per category |
| `#panel-clinical-reviews` | 2343–2358 | Single PDF/TXT file upload |
| `#panel-industry-news` | 2361–2387 | Paste text or URL fetch |
| `#panel-op-eds` | 2390–2406 | Tone toggle + multi-file upload |
| `#panel-white-papers` | 2409–2439 | Multi-file + source links + word count + design style |
| `#panel-infographics` | 2442–2459 | Single PDF/TXT + model restriction notice |
| `#panel-ibd-living` | 2462–2479 | URL links + paste tabs |
| `#sourceInputCard` | 2336–2483 | Wraps all panels |
| `promptTextarea` | 2552 | The textarea `generateReview()` reads from |
| Prompt library | 2577–2588 | List of saved prompts inline in prompt editor card |
| `generateReview()` | 6014–6130 | Branches on `currentCategory` for source + extra instructions |
| `switchCategory()` | 4788–4836 | Shows active panel, updates `currentCategory`, fires archive/report refresh |

---

## Target State (what we're building)

### Left Column Cards (in order):

1. **Category** card — `<select id="genCategorySelect">` replaces cat-bar buttons
2. **Prompt** card — 3 radio modes: Default / Load / New
3. **Source** card — tabs: Upload | Paste | URLs (always visible, all categories)
4. **Category Options** card — shown only for categories that have extras (tone, word count, design style, infographic notice)
5. **Hero Image** card — unchanged
6. **Generate button** — unchanged

### Right Column — unchanged except:
- Prompt Editor card still exists (for power users / keyboard access) but collapses by default when generator first loads
- Prompt Library list inside it stays (secondary UI)

---

## Files Modified

- **`index.html`** — all changes:
  - Replace HTML for `#catBar-generator` + all `panel-*` divs
  - Add new HTML: category `<select>`, prompt-mode card, unified source card, cat-options card
  - Modify `switchCategory()` — remove generator panel show/hide, update `#genCategorySelect`
  - Add `onGenCategoryChange()`, `switchGenSourceTab()`, `onGenPromptModeChange()`, `getGenSourceText()`, `loadGenCategoryPrompts()`
  - Modify `generateReview()` — simplify source + prompt reading to use new unified elements
  - Add CSS for new components

---

## Chunk 1: HTML Replacement

### Task 1: Replace Category Card HTML

**Files:** Modify `index.html` lines 2317–2333

The current category card has a flex row of `cat-bar-btn` buttons. Replace with a `<select>`.

- [ ] **Step 1: Replace the category card inner HTML**

Find:
```html
    <!-- Category selector card -->
    <div class="card" style="overflow:hidden;">
      <div class="card-header">
        <h2>...Content Category...</h2>
      </div>
      <div class="card-body">
        <div class="cat-bar" id="catBar-generator" style="border-bottom:none;padding:0;background:none;flex-wrap:wrap;">
          <button class="cat-bar-btn active" data-cat="clinical-reviews" onclick="switchCategory('clinical-reviews')">Clinical Reviews</button>
          <button class="cat-bar-btn" data-cat="industry-news" onclick="switchCategory('industry-news')">Industry News</button>
          <button class="cat-bar-btn" data-cat="op-eds" onclick="switchCategory('op-eds')">Op-Eds</button>
          <button class="cat-bar-btn" data-cat="white-papers" onclick="switchCategory('white-papers')">White Papers</button>
          <button class="cat-bar-btn" data-cat="infographics" onclick="switchCategory('infographics')">Infographics</button>
          <button class="cat-bar-btn" data-cat="ibd-living" onclick="switchCategory('ibd-living')">IBD Living</button>
          <span id="customCatBtns-generator"></span>
        </div>
      </div>
    </div>
```

Replace with:
```html
    <!-- Category selector card -->
    <div class="card">
      <div class="card-header">
        <h2><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>Content Category</h2>
      </div>
      <div class="card-body">
        <select id="genCategorySelect" onchange="onGenCategoryChange()" style="width:100%;padding:8px 12px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:0.875rem;font-family:'Montserrat',sans-serif;">
          <option value="clinical-reviews">Clinical Reviews</option>
          <option value="industry-news">Industry News</option>
          <option value="op-eds">Op-Eds</option>
          <option value="white-papers">White Papers</option>
          <option value="infographics">Infographics</option>
          <option value="ibd-living">IBD Living</option>
        </select>
        <!-- Custom categories injected here by activateCustomCategories() -->
        <span id="customCatBtns-generator" style="display:none;"></span>
      </div>
    </div>
```

Note: `customCatBtns-generator` is kept (hidden) because `activateCustomCategories()` queries it; the real injection point for the dropdown is handled in Task 5.

- [ ] **Step 2: Add Prompt Mode card immediately after the category card**

Insert after the category card (before `<!-- Dynamic Category Input Panel -->`):

```html
    <!-- Prompt Mode card -->
    <div class="card" id="genPromptModeCard">
      <div class="card-header">
        <h2><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>Prompt</h2>
      </div>
      <div class="card-body">
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;">
          <label style="display:flex;align-items:center;gap:8px;font-size:0.82rem;cursor:pointer;">
            <input type="radio" name="genPromptMode" value="default" checked onchange="onGenPromptModeChange()">
            Use category default
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:0.82rem;cursor:pointer;">
            <input type="radio" name="genPromptMode" value="load" onchange="onGenPromptModeChange()">
            Load saved prompt
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:0.82rem;cursor:pointer;">
            <input type="radio" name="genPromptMode" value="new" onchange="onGenPromptModeChange()">
            Write custom prompt
          </label>
        </div>
        <!-- Load pane -->
        <div id="genPromptLoadPane" style="display:none;">
          <select id="genPromptSelect" onchange="onGenPromptSelectChange()" style="width:100%;padding:8px 12px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:0.82rem;font-family:'Montserrat',sans-serif;">
            <option value="">— Select a saved prompt —</option>
          </select>
          <div id="genPromptLoadPreview" style="margin-top:8px;font-size:0.72rem;color:var(--text-muted);display:none;max-height:80px;overflow-y:auto;border:1px solid var(--border);padding:8px;"></div>
        </div>
        <!-- New pane -->
        <div id="genPromptNewPane" style="display:none;">
          <textarea id="genPromptCustom" rows="5" style="width:100%;box-sizing:border-box;padding:8px 12px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:0.82rem;font-family:'Montserrat',sans-serif;resize:vertical;" oninput="syncPromptToEditor()"></textarea>
          <div style="display:flex;gap:6px;margin-top:6px;align-items:center;">
            <input type="text" id="genPromptSaveName" style="flex:1;padding:6px 10px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:0.78rem;font-family:'Montserrat',sans-serif;" placeholder="Name this prompt…">
            <button class="btn btn-orange btn-sm" onclick="saveGenPrompt()">Save</button>
          </div>
        </div>
      </div>
    </div>
```

- [ ] **Step 3: Replace the entire `#sourceInputCard` with unified source card**

Find the existing card from `<!-- Dynamic Category Input Panel -->` through to `</div><!-- /#sourceInputCard -->` (approx lines 2336–2483, ending with the `extractionStatus` div inside).

Replace entirely with:
```html
    <!-- Unified Source card -->
    <div class="card" id="sourceInputCard">
      <div class="card-header">
        <h2><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><span id="uploadCardTitle">Source</span></h2>
      </div>
      <div class="card-body">
        <div class="source-tabs">
          <button class="source-tab-btn active" id="genSrcTab-upload" onclick="switchGenSourceTab('upload')">Upload</button>
          <button class="source-tab-btn" id="genSrcTab-paste" onclick="switchGenSourceTab('paste')">Paste Text</button>
          <button class="source-tab-btn" id="genSrcTab-urls" onclick="switchGenSourceTab('urls')">URLs</button>
        </div>

        <!-- Upload pane -->
        <div class="source-pane active" id="genSrcPane-upload">
          <div class="upload-zone" id="uploadZone" onclick="document.getElementById('genFileInput').click()">
            <input type="file" id="genFileInput" accept=".pdf,.txt" multiple style="display:none;" onchange="handleGenFileSelect(event)" />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <p><strong>Drop PDF or TXT files here</strong>, or click to browse</p>
            <p style="font-size:0.68rem;margin-top:4px;">Supports multiple files</p>
          </div>
          <div class="multi-doc-list" id="genDocList"></div>
        </div>

        <!-- Paste pane -->
        <div class="source-pane" id="genSrcPane-paste">
          <textarea id="genPasteText" rows="7" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-family:'Montserrat',sans-serif;font-size:0.78rem;resize:vertical;box-sizing:border-box;" oninput="onGenPasteInput()" onpaste="setTimeout(onGenPasteInput,10)"></textarea>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;">
            <span id="genPasteWordCount" style="font-size:0.65rem;color:var(--text-muted);"></span>
            <button class="btn btn-outline btn-xs" id="genPasteClearBtn" onclick="clearGenPaste()" style="display:none;">Clear</button>
          </div>
        </div>

        <!-- URLs pane -->
        <div class="source-pane" id="genSrcPane-urls">
          <div style="display:flex;flex-direction:column;gap:6px;" id="genUrlList">
            <div style="display:flex;gap:6px;"><input type="url" class="gen-url-input" placeholder="https://…" style="flex:1;padding:6px 9px;border:1px solid var(--border);border-radius:6px;font-size:0.72rem;font-family:'Montserrat',sans-serif;" /><button class="btn btn-outline btn-xs" onclick="fetchGenUrl(this)">Fetch</button></div>
            <div style="display:flex;gap:6px;"><input type="url" class="gen-url-input" placeholder="https://…" style="flex:1;padding:6px 9px;border:1px solid var(--border);border-radius:6px;font-size:0.72rem;font-family:'Montserrat',sans-serif;" /><button class="btn btn-outline btn-xs" onclick="fetchGenUrl(this)">Fetch</button></div>
            <div style="display:flex;gap:6px;"><input type="url" class="gen-url-input" placeholder="https://…" style="flex:1;padding:6px 9px;border:1px solid var(--border);border-radius:6px;font-size:0.72rem;font-family:'Montserrat',sans-serif;" /><button class="btn btn-outline btn-xs" onclick="fetchGenUrl(this)">Fetch</button></div>
            <div style="display:flex;gap:6px;"><input type="url" class="gen-url-input" placeholder="https://…" style="flex:1;padding:6px 9px;border:1px solid var(--border);border-radius:6px;font-size:0.72rem;font-family:'Montserrat',sans-serif;" /><button class="btn btn-outline btn-xs" onclick="fetchGenUrl(this)">Fetch</button></div>
            <div style="display:flex;gap:6px;"><input type="url" class="gen-url-input" placeholder="https://…" style="flex:1;padding:6px 9px;border:1px solid var(--border);border-radius:6px;font-size:0.72rem;font-family:'Montserrat',sans-serif;" /><button class="btn btn-outline btn-xs" onclick="fetchGenUrl(this)">Fetch</button></div>
          </div>
          <div id="genUrlStatus" style="font-size:0.7rem;color:var(--text-muted);margin-top:6px;"></div>
        </div>

        <div id="extractionStatus" class="alert hidden" style="margin-top:8px;margin-bottom:0;"></div>
      </div>
    </div>

    <!-- Category-specific options card (shown conditionally) -->
    <div class="card" id="genCatOptionsCard" style="display:none;">
      <div class="card-header">
        <h2><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93L17.66 6.34M6.34 17.66L4.93 19.07M19.07 19.07L17.66 17.66M6.34 6.34L4.93 4.93M20 12H22M2 12H4M12 2V4M12 20V22"/></svg>Category Options</h2>
      </div>
      <div class="card-body">
        <!-- Tone (op-eds) -->
        <div id="genOptTone" style="display:none;margin-bottom:12px;">
          <label style="font-size:0.68rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;display:block;">Tone</label>
          <div class="tone-btn-group">
            <button class="tone-btn active" onclick="setTone('practitioner')" id="tone-practitioner">Practitioner</button>
            <button class="tone-btn" onclick="setTone('patient')" id="tone-patient">Patient-Facing</button>
          </div>
        </div>
        <!-- Word Count (white-papers) -->
        <div id="genOptWordCount" style="display:none;margin-bottom:12px;">
          <div class="option-row">
            <label>Word Count</label>
            <input type="number" id="wpWordCount" value="2000" min="500" max="10000" step="250" style="max-width:110px;" />
            <span style="font-size:0.68rem;color:var(--text-muted);">words (approx.)</span>
          </div>
        </div>
        <!-- Design Style (white-papers) -->
        <div id="genOptDesign" style="display:none;margin-bottom:12px;">
          <div style="font-size:0.68rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Design Style</div>
          <div class="design-options-grid" id="wpDesignGrid">
            <button class="design-option-btn active" onclick="setDesignOption(this,'Executive Summary')" data-design="Executive Summary">Executive Summary<br><span style="font-weight:400;font-size:0.62rem;">Concise, decision-focused</span></button>
            <button class="design-option-btn" onclick="setDesignOption(this,'Technical Deep-Dive')" data-design="Technical Deep-Dive">Technical Deep-Dive<br><span style="font-weight:400;font-size:0.62rem;">Data-rich, detailed</span></button>
            <button class="design-option-btn" onclick="setDesignOption(this,'Narrative Report')" data-design="Narrative Report">Narrative Report<br><span style="font-weight:400;font-size:0.62rem;">Story-driven, accessible</span></button>
            <button class="design-option-btn" onclick="setDesignOption(this,'Regulatory Briefing')" data-design="Regulatory Briefing">Regulatory Briefing<br><span style="font-weight:400;font-size:0.62rem;">Formal, compliance-ready</span></button>
          </div>
        </div>
        <!-- Infographic notice -->
        <div id="genOptInfographic" style="display:none;">
          <div class="alert" style="background:rgba(244,121,32,0.08);border:1px solid rgba(244,121,32,0.25);color:var(--sla-orange);font-size:0.72rem;padding:8px 12px;border-radius:6px;margin-bottom:0;">
            <strong>Note:</strong> Infographic generation uses models optimised for structured visual content. The model selector is pre-filtered to the most capable options.
          </div>
        </div>
      </div>
    </div>
```

---

## Chunk 2: JS — New Helper Functions

### Task 2: Add `onGenCategoryChange()` and `switchGenSourceTab()`

Add these functions after `switchCategory()` definition (around line 4836):

- [ ] **Step 1: Add `onGenCategoryChange()`**

```js
function onGenCategoryChange() {
  var sel = document.getElementById('genCategorySelect');
  if (!sel) return;
  switchCategory(sel.value);
  updateGenCatOptions(sel.value);
  loadGenCategoryPrompts(sel.value);
}
```

- [ ] **Step 2: Add `updateGenCatOptions(catId)`**

```js
function updateGenCatOptions(catId) {
  var card = document.getElementById('genCatOptionsCard');
  var toneEl = document.getElementById('genOptTone');
  var wcEl = document.getElementById('genOptWordCount');
  var dsEl = document.getElementById('genOptDesign');
  var infEl = document.getElementById('genOptInfographic');
  if (!card) return;
  var showTone = catId === 'op-eds';
  var showWP   = catId === 'white-papers';
  var showInf  = catId === 'infographics';
  if (toneEl) toneEl.style.display = showTone ? '' : 'none';
  if (wcEl)   wcEl.style.display   = showWP   ? '' : 'none';
  if (dsEl)   dsEl.style.display   = showWP   ? '' : 'none';
  if (infEl)  infEl.style.display  = showInf  ? '' : 'none';
  card.style.display = (showTone || showWP || showInf) ? '' : 'none';
}
```

- [ ] **Step 3: Add `switchGenSourceTab(tab)`**

```js
function switchGenSourceTab(tab) {
  ['upload','paste','urls'].forEach(function(t) {
    var btn = document.getElementById('genSrcTab-' + t);
    var pane = document.getElementById('genSrcPane-' + t);
    if (btn)  btn.classList.toggle('active', t === tab);
    if (pane) pane.classList.toggle('active', t === tab);
  });
  // Clear extractedText when switching away from paste
  if (tab !== 'paste') {
    extractedText = '';
    updateGenerateButton();
  }
}
```

### Task 3: Add prompt-mode functions

- [ ] **Step 1: Add `onGenPromptModeChange()`**

```js
function onGenPromptModeChange() {
  var mode = (document.querySelector('input[name="genPromptMode"]:checked') || {}).value || 'default';
  document.getElementById('genPromptLoadPane').style.display = mode === 'load' ? '' : 'none';
  document.getElementById('genPromptNewPane').style.display  = mode === 'new'  ? '' : 'none';
  if (mode === 'default') {
    resetToDefault();  // loads categoryConfigs[currentCategory].defaultPrompt into promptTextarea
  }
}
```

- [ ] **Step 2: Add `loadGenCategoryPrompts(catId)`**

Populates `#genPromptSelect` with saved prompts for the chosen category.

```js
function loadGenCategoryPrompts(catId) {
  var sel = document.getElementById('genPromptSelect');
  if (!sel) return;
  var prompts = (ghData[catId] && ghData[catId].prompts) ? ghData[catId].prompts : [];
  var lsPrompts = getPromptsForCat(catId) || [];
  var all = prompts.concat(lsPrompts);
  sel.innerHTML = '<option value="">— Select a saved prompt —</option>';
  all.forEach(function(p, i) {
    var opt = document.createElement('option');
    opt.value = i;
    opt.textContent = p.name || ('Prompt ' + (i+1));
    opt._promptBody = p.prompt || p.body || '';
    sel.appendChild(opt);
  });
  document.getElementById('genPromptLoadPreview').style.display = 'none';
}
```

- [ ] **Step 3: Add `onGenPromptSelectChange()`**

```js
function onGenPromptSelectChange() {
  var sel = document.getElementById('genPromptSelect');
  var preview = document.getElementById('genPromptLoadPreview');
  if (!sel || sel.value === '') { preview.style.display = 'none'; return; }
  var opt = sel.options[sel.selectedIndex];
  var body = opt._promptBody || '';
  preview.textContent = body.substring(0, 300) + (body.length > 300 ? '…' : '');
  preview.style.display = body ? '' : 'none';
  // Load into promptTextarea so generateReview() picks it up
  document.getElementById('promptTextarea').value = body;
}
```

- [ ] **Step 4: Add `syncPromptToEditor()`**

Keeps `promptTextarea` (used by `generateReview()`) in sync with the custom prompt textarea.

```js
function syncPromptToEditor() {
  var src = document.getElementById('genPromptCustom');
  var dest = document.getElementById('promptTextarea');
  if (src && dest) dest.value = src.value;
}
```

- [ ] **Step 5: Add `saveGenPrompt()`**

```js
async function saveGenPrompt() {
  var name = document.getElementById('genPromptSaveName').value.trim();
  var body = document.getElementById('genPromptCustom').value.trim();
  if (!name) { showToast('Enter a name for this prompt first.'); return; }
  if (!body) { showToast('Prompt is empty.'); return; }
  // Reuse existing savePromptAs logic by populating its inputs
  document.getElementById('promptNameInput').value = name;
  document.getElementById('promptTextarea').value = body;
  await savePromptAs();
  document.getElementById('genPromptSaveName').value = '';
  loadGenCategoryPrompts(currentCategory);
}
```

### Task 4: Add `handleGenFileSelect()`, `onGenPasteInput()`, `clearGenPaste()`, `fetchGenUrl()`

These replace the old per-category source handlers.

- [ ] **Step 1: Add `handleGenFileSelect(evt)`**

```js
async function handleGenFileSelect(evt) {
  var files = Array.from(evt.target.files);
  if (!files.length) return;
  var list = document.getElementById('genDocList');
  if (list) list.innerHTML = '<div style="padding:6px;font-size:0.72rem;color:var(--text-muted);">Reading files…</div>';
  var texts = [];
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    try {
      var t = f.name.toLowerCase().endsWith('.pdf') ? await extractPDFText(f) : await readTextFile(f);
      texts.push('--- ' + f.name + ' ---\n' + t);
    } catch(e) {
      texts.push('--- ' + f.name + ' [error: ' + e.message + '] ---');
    }
  }
  extractedText = texts.join('\n\n');
  if (list) {
    list.innerHTML = files.map(function(f, i) {
      return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:0.75rem;">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;color:var(--success);flex-shrink:0;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
        + escHtml(f.name) + '</div>';
    }).join('');
  }
  updateGenerateButton();
  heroLeftPopulateKeywords();
}
```

- [ ] **Step 2: Add `onGenPasteInput()`**

```js
function onGenPasteInput() {
  var ta = document.getElementById('genPasteText');
  var wc = document.getElementById('genPasteWordCount');
  var cb = document.getElementById('genPasteClearBtn');
  if (!ta) return;
  extractedText = ta.value.trim();
  var words = extractedText ? extractedText.split(/\s+/).filter(Boolean).length : 0;
  if (wc) wc.textContent = words ? words.toLocaleString() + ' words' : '';
  if (cb) cb.style.display = extractedText ? '' : 'none';
  updateGenerateButton();
  if (extractedText) heroLeftPopulateKeywords();
}
```

- [ ] **Step 3: Add `clearGenPaste()`**

```js
function clearGenPaste() {
  var ta = document.getElementById('genPasteText');
  if (ta) ta.value = '';
  extractedText = '';
  document.getElementById('genPasteWordCount').textContent = '';
  document.getElementById('genPasteClearBtn').style.display = 'none';
  updateGenerateButton();
}
```

- [ ] **Step 4: Add `fetchGenUrl(btn)`**

Fetches one URL and appends its content to `extractedText`.

```js
async function fetchGenUrl(btn) {
  var row = btn.parentElement;
  var input = row.querySelector('input');
  var url = input ? input.value.trim() : '';
  var statusEl = document.getElementById('genUrlStatus');
  if (!url) { if (statusEl) statusEl.textContent = 'Enter a URL first.'; return; }
  btn.disabled = true;
  btn.textContent = '…';
  if (statusEl) statusEl.textContent = 'Fetching ' + url + '…';
  try {
    var res = await apiFetch('/api/fetch-url', { method: 'POST', body: JSON.stringify({ url: url }) });
    var fetched = (res.text || res.content || '').trim();
    if (!fetched) throw new Error('No content returned');
    extractedText = (extractedText ? extractedText + '\n\n' : '') + 'Source URL: ' + url + '\n\n' + fetched;
    if (statusEl) statusEl.textContent = '✓ Fetched: ' + url;
    updateGenerateButton();
    heroLeftPopulateKeywords();
  } catch(e) {
    if (statusEl) statusEl.textContent = '✗ Failed: ' + e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Fetch';
  }
}
```

---

## Chunk 3: JS — Modify Existing Functions

### Task 5: Update `switchCategory()` — remove generator panel logic, update dropdown

Current `switchCategory()` (line ~4788) does panel show/hide for `panel-{catId}`. Since those panels are removed, we need to remove that logic but keep everything else (archive/report refresh, custom category panel for non-generator tabs, etc.).

- [ ] **Step 1: Remove generator panel show/hide from `switchCategory()`**

Find in `switchCategory()`:
```js
  const panel = document.getElementById('panel-' + catId);
```
…and the surrounding code that hides other panels and shows `panel`. Remove those lines — they'll error silently since the elements no longer exist, but better to remove cleanly.

- [ ] **Step 2: Add dropdown sync to `switchCategory()`**

After `currentCategory = catId;` in `switchCategory()`, add:
```js
  // Sync generator dropdown
  var genSel = document.getElementById('genCategorySelect');
  if (genSel && genSel.value !== catId) {
    genSel.value = catId;
    updateGenCatOptions(catId);
  }
```

### Task 6: Update `activateCustomCategories()` — inject into dropdown

Currently it injects buttons into `catBar-generator`. Now it should add `<option>` elements to `#genCategorySelect`.

- [ ] **Step 1: Find the injection into `catBar-generator` placeholder**

The code at line ~7638 does:
```js
placeholder.querySelectorAll('.cat-bar-btn').forEach(b => b.remove());
// adds cat-bar-btn elements
```
Replace the generator bar injection block with:
```js
var genSel = document.getElementById('genCategorySelect');
if (genSel) {
  // Remove previously injected custom options
  genSel.querySelectorAll('option[data-custom]').forEach(o => o.remove());
  customCategories.forEach(cat => {
    var opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.label;
    opt.dataset.custom = '1';
    genSel.appendChild(opt);
  });
}
```

Keep the archive and reports cat bar injection untouched.

### Task 7: Simplify `generateReview()` — unified source + prompt reading

- [ ] **Step 1: Replace source collection block (lines 6018–6030)**

Remove the `if (currentCategory === 'op-eds')` / `white-papers` branching for source text.

Current:
```js
  let sourceText = extractedText;
  if (currentCategory === 'op-eds') {
    if (!multiDocs['op-eds'].length) { ... return; }
    sourceText = multiDocs['op-eds'].map(...).join('\n\n');
  } else if (currentCategory === 'white-papers') {
    ...
  } else if (!sourceText) {
    showAlert('generateAlert', 'Please provide source content first.', 'error'); return;
  }
```

Replace with:
```js
  let sourceText = extractedText;
  if (!sourceText.trim()) {
    showAlert('generateAlert', 'Please provide source content first.', 'error');
    return;
  }
```

- [ ] **Step 2: Keep `extraInstructions` block unchanged**

The extra instructions block (lines 6032–6040) that reads `selectedTone`, `wpWordCount`, `selectedDesign` still works because those elements are now in `#genCatOptionsCard`. No change needed.

- [ ] **Step 3: Ensure `promptTextarea` is always populated before generation**

Before `const basePrompt = document.getElementById('promptTextarea').value.trim();`, add:
```js
  // If user is in "default" prompt mode, ensure promptTextarea is loaded
  var promptMode = (document.querySelector('input[name="genPromptMode"]:checked') || {}).value || 'default';
  if (promptMode === 'default') {
    var cfg = categoryConfigs[currentCategory];
    if (cfg && cfg.defaultPrompt && !document.getElementById('promptTextarea').value.trim()) {
      document.getElementById('promptTextarea').value = cfg.defaultPrompt;
    }
  }
```

### Task 8: Initial state on page load

- [ ] **Step 1: In the DOMContentLoaded / init block, call these after data loads:**

```js
updateGenCatOptions('clinical-reviews'); // default category
onGenPromptModeChange();                 // sets Default mode, loads default prompt
```

These should be called in the same place `switchCategory('clinical-reviews')` is called on init (around line 4788 area or wherever the app initializes).

---

## Chunk 4: CSS

### Task 9: Add CSS for new components

Add before `</style>`:

```css
/* Prompt mode card */
#genPromptModeCard .card-body { padding-bottom: 12px; }
#genPromptLoadPreview { font-size: 0.72rem; color: var(--text); line-height: 1.5; }
#genPromptNewPane textarea { border-radius: 0; }
#genPromptSaveName { border-radius: 0; }

/* Generator source tabs — reuse .source-tabs / .source-pane styles */
#sourceInputCard .source-tabs { margin-bottom: 12px; }
```

---

## Chunk 5: Cleanup & Verification

### Task 10: Remove dead code

- [ ] Remove `handleFileSelect()`, `removeFile()`, `updateExtractedFromNews()`, `clearNewsPaste()`, `fetchNewsLink()`, `handleMultiFileSelect()`, `addSourceLink()`, `handleInfographicFileSelect()`, `removeInfographicFile()`, `switchSourceTab()`, `fetchCustomLink()`, `updateCustomPasteExtract()` — only if these functions are not referenced anywhere outside the generator panel. Grep each one first before removing.

- [ ] Remove `multiDocs` branching in `generateReview()` if `multiDocs['op-eds']` and `multiDocs['white-papers']` are no longer populated.

- [ ] Remove CSS for `.cat-input-panel`, `#catBar-generator .cat-bar-btn` if no other references exist.

### Task 11: Smoke test

- [ ] Select each category from dropdown → correct category options card shows/hides
- [ ] Upload tab: select 2 PDF files → `genDocList` renders file names, `extractedText` non-empty, Generate button enables
- [ ] Paste tab: type text → word count updates, Generate button enables
- [ ] URLs tab: enter URL, click Fetch → `genUrlStatus` shows ✓, Generate button enables
- [ ] Prompt mode "Default" → `promptTextarea` loads category default
- [ ] Prompt mode "Load" → `genPromptSelect` shows saved prompts, selecting one populates `promptTextarea`
- [ ] Prompt mode "New" → textarea shows, typing syncs to `promptTextarea`, Save creates new saved prompt
- [ ] Click Generate → article appears in output panel
- [ ] Switch to Archive tab → cat bar still works, filtering by category works
- [ ] `switchCategory('industry-news')` from archive cat bar → `genCategorySelect` dropdown also updates to match

### Task 12: Deploy

```bash
vercel --prod --yes
```

---

## Notes

- `wpWordCount` and `wpDesignGrid` IDs are preserved in `#genCatOptionsCard` so existing references in `generateReview()` still work.
- `selectedTone` and `selectedDesign` globals remain — `setTone()` and `setDesignOption()` still target them.
- The `promptTextarea` in the right-column Prompt Editor card is still the source of truth for `generateReview()` — the new prompt mode UI syncs *into* it.
- Custom categories added via the Categories page continue to work: `activateCustomCategories()` now adds `<option>` tags to `#genCategorySelect` instead of `cat-bar-btn` elements.
- Archive cat bar (`#catBar-archive`) and reports cat bar (`#catBar-reports`) are completely untouched.
