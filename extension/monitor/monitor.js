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
    // Show a brief "done" state before closing
    spinner.style.display      = 'none';
    doneIcon.style.display     = 'block';
    titleEl.textContent        = 'Scan Complete';
    subtitleEl.textContent     = `${msg.found ?? 0} new lead${(msg.found ?? 0) !== 1 ? 's' : ''} found.`;
    progressFill.style.width   = '100%';
    progressLabel.textContent  = 'Done';
    groupNameEl.textContent    = '';
    btnCancel.disabled         = true;
    setTimeout(() => window.close(), 1800);
  }

  if (msg.type === 'SCAN_NO_TABS') {
    spinner.style.display  = 'none';
    titleEl.textContent    = 'No Facebook Tabs Found';
    subtitleEl.textContent = 'Open facebook.com in Chrome and try again.';
    progressLabel.textContent = '';
    groupNameEl.textContent = '';
  }
});

btnCancel.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'SCAN_CANCEL' });
  window.close();
});
