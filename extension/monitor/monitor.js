// LeadSnap — monitor window script
// Receives progress messages from background.js via chrome.runtime.onMessage.

const spinner      = document.getElementById('spinner');
const doneIcon     = document.getElementById('done-icon');
const titleEl      = document.getElementById('title');
const subtitleEl   = document.getElementById('subtitle');
const progressFill = document.getElementById('progress-fill');
const progressLabel= document.getElementById('progress-label');
const groupNameEl  = document.getElementById('group-name');
const btnCancel    = document.getElementById('btn-cancel');

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SCAN_PROGRESS') {
    const { groupName, current, total } = msg;
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;

    progressFill.style.width  = `${pct}%`;
    progressLabel.textContent = `${current} of ${total} group${total !== 1 ? 's' : ''}`;
    groupNameEl.textContent   = groupName || '';
  }

  if (msg.type === 'SCAN_COMPLETE') {
    const found   = msg.found ?? 0;
    const skipped = msg.skippedNotMonitored ?? 0;

    spinner.style.display    = 'none';
    doneIcon.style.display   = 'block';
    titleEl.textContent      = 'Scan Complete';
    progressFill.style.width = '100%';
    progressLabel.textContent = 'Done';
    groupNameEl.textContent  = '';
    btnCancel.disabled       = true;

    if (found > 0) {
      subtitleEl.textContent = `${found} new lead${found !== 1 ? 's' : ''} found!`;
    } else if (skipped > 0) {
      subtitleEl.textContent = `0 leads found. ${skipped} open tab${skipped !== 1 ? 's were' : ' was'} not in your monitored groups list — add them in Settings.`;
    } else {
      subtitleEl.textContent = '0 new leads — no posts matched your keywords this time.';
    }

    setTimeout(() => window.close(), skipped > 0 ? 4000 : 1800);
  }

  if (msg.type === 'SCAN_NO_TABS') {
    spinner.style.display     = 'none';
    titleEl.textContent       = 'No Facebook Group Tabs Open';
    subtitleEl.textContent    = 'Open one of your monitored Facebook groups in Chrome, then scan again. LeadSnap only scans tabs you already have open — it never opens new ones.';
    progressFill.style.width  = '0%';
    progressLabel.textContent = '';
    groupNameEl.textContent   = '';
    // Don't auto-close — user needs to read this
  }

  if (msg.type === 'SCAN_BLOCKED') {
    spinner.style.display     = 'none';
    titleEl.textContent       = 'Scan Blocked';
    subtitleEl.textContent    = msg.message || 'Cannot scan right now.';
    progressFill.style.width  = '0%';
    progressLabel.textContent = '';
    groupNameEl.textContent   = '';
    // Don't auto-close — user needs to read this
  }
});

btnCancel.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'SCAN_CANCEL' });
  window.close();
});
