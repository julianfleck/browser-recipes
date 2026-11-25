import React, { useState } from 'react';
import WorkspaceChrome from './WorkspaceChrome';
import { Download, Puzzle } from 'lucide-react';
import { Button } from './components/arc/button/button';

const archiveName = 'agent-session-bridge.zip';
const unpackedName = 'agent-session-bridge';

const browsers = {
  arc: {
    label: 'Arc',
    address: 'arc://extensions',
    steps: [
      `Unzip the downloaded ${archiveName} file.`,
      'Open the extension manager in Arc. If it did not open automatically, copy the address below into Arc’s command bar.',
      'Turn on Developer mode, then choose Load unpacked.',
      `Select the unzipped ${unpackedName} folder, which contains manifest.json.`,
      'Return to the workspace and check browser access.',
    ],
  },
  chromium: {
    label: 'Chrome',
    address: 'chrome://extensions',
    steps: [
      `Unzip the downloaded ${archiveName} file.`,
      'Open the extension manager in Chrome. If it did not open automatically, copy the address below into the address bar.',
      'Turn on Developer mode, then choose Load unpacked.',
      `Select the unzipped ${unpackedName} folder, which contains manifest.json.`,
      'Return to the workspace and check browser access.',
    ],
  },
  edge: {
    label: 'Edge',
    address: 'edge://extensions',
    steps: [
      `Unzip the downloaded ${archiveName} file.`,
      'Open the extension manager in Edge. If it did not open automatically, copy the address below into the address bar.',
      'Turn on Developer mode, then choose Load unpacked.',
      `Select the unzipped ${unpackedName} folder, which contains manifest.json.`,
      'Return to the workspace and check browser access.',
    ],
  },
  firefox: {
    label: 'Firefox',
    address: 'about:debugging#/runtime/this-firefox',
    steps: [
      `Unzip the downloaded ${archiveName} file.`,
      'Open the debugging page in Firefox. If it did not open automatically, copy the address below into the address bar.',
      'Choose Load Temporary Add-on.',
      `Select manifest.json inside the unzipped ${unpackedName} folder.`,
      'Return to the workspace and check browser access. Firefox removes temporary add-ons when it restarts.',
    ],
  },
  safari: {
    label: 'Safari on Mac',
    address: null,
    steps: [
      `Unzip the downloaded ${archiveName} file.`,
      'Open Safari Settings and enable developer features if needed.',
      'In the Developer settings, allow unsigned extensions and choose Add Temporary Extension.',
      `Select the unzipped ${unpackedName} folder.`,
      'Return to the workspace and check browser access. This Safari path has not yet been verified with this pilot.',
    ],
  },
};

function initialBrowser() {
  if (navigator.userAgent.includes('Firefox')) return 'firefox';
  if (navigator.userAgent.includes('Edg/')) return 'edge';
  if (navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome')) return 'safari';
  return 'arc';
}

export default function InstallPage() {
  const [selected, setSelected] = useState(initialBrowser);
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const browser = browsers[selected];

  async function copyAddress() {
    if (!browser.address) return;
    await navigator.clipboard.writeText(browser.address);
    setCopied(true);
  }

  function downloadAndOpen() {
    const download = document.createElement('a');
    download.href = `/${archiveName}`;
    download.download = archiveName;
    document.body.append(download);
    download.click();
    download.remove();
    setDownloaded(true);
    if (browser.address) {
      try { window.open(browser.address, '_blank', 'noopener'); } catch { /* The address remains available to copy below. */ }
    }
  }

  return (
    <WorkspaceChrome page="Extension setup">
      <main className="workspace-main install-main install-workspace" id="main-content" tabIndex={-1}>
        <header className="install-heading"><span className="install-heading-icon"><Puzzle size={23}/></span><div><h1>Connect your browser</h1><p>Record website tools in your browser. Run them headlessly for your agent.</p></div></header>
        <section className="install-card" aria-label="Extension installation steps">
          <div className="browser-picker" aria-label="Choose your browser">
            {Object.entries(browsers).map(([id, item]) => <button key={id} type="button" className={selected === id ? 'selected' : ''} aria-pressed={selected === id} onClick={() => { setSelected(id); setCopied(false); setDownloaded(false); }}>{item.label}</button>)}
          </div>
          <div className="install-download"><Button type="button" onClick={downloadAndOpen}><Download size={15}/> Download extension</Button><p className="install-notice">{browser.address ? 'Downloads the extension and opens your extension manager.' : 'Download the extension, then follow the steps below.'}</p></div>
          {browser.address && <div className="install-address"><div><span>Extension manager address for {browser.label}</span><code>{browser.address}</code></div><Button type="button" variant="secondary" size="sm" onClick={copyAddress}>{copied ? 'Copied' : 'Copy address'}</Button></div>}
          {downloaded && <p className="install-notice" role="status">Download started.{browser.address ? ' If your browser blocked the extension-manager link, use the address above.' : ''}</p>}
          <ol className="install-steps">{browser.steps.map(step => <li key={step}>{step}</li>)}</ol>
        </section>
      </main>
    </WorkspaceChrome>
  );
}
