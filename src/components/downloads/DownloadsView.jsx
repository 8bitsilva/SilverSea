import { useEffect, useId, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock3,
  HardDrive,
  Pause,
  Play,
  Radio,
  Trash2,
  X,
} from "lucide-react";
import { formatBytes } from "../../utils/helpers";

const sampleLimit = 36;

function formatEta(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function SpeedGraph({ values = [] }) {
  const gradientId = useId().replace(/:/g, "");
  const safeValues = values.length ? values : [0];
  const max = Math.max(1, ...safeValues);
  const points = safeValues.map((value, index) => {
    const x = safeValues.length === 1 ? 0 : (index / (safeValues.length - 1)) * 100;
    const y = 35 - (value / max) * 29;
    return `${x},${y}`;
  });
  const line = points.join(" ");
  const area = `0,38 ${line} 100,38`;

  return (
    <svg className="download-speed-graph" viewBox="0 0 100 40" preserveAspectRatio="none" aria-label="Recent download speed">
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#dce1e8" stopOpacity=".25" />
          <stop offset="100%" stopColor="#dce1e8" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradientId})`} />
      <polyline points={line} fill="none" stroke="#dce1e8" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="download-stat">
      <Icon size={14} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function DownloadsView({ activeDownloads, completedDownloads, setCompletedDownloads }) {
  const [expandedGids, setExpandedGids] = useState(new Set());
  const [speedHistory, setSpeedHistory] = useState({});

  useEffect(() => {
    setSpeedHistory((previous) => {
      const next = {};
      for (const download of activeDownloads) {
        next[download.gid] = [...(previous[download.gid] || []), download.speed || 0].slice(-sampleLimit);
      }
      return next;
    });
  }, [activeDownloads]);

  const summary = useMemo(() => activeDownloads.reduce((total, download) => ({
    speed: total.speed + (download.speed || 0),
    completed: total.completed + (download.completed || 0),
    total: total.total + (download.total || 0),
  }), { speed: 0, completed: 0, total: 0 }), [activeDownloads]);

  const toggleExpand = (gid) => setExpandedGids((previous) => {
    const next = new Set(previous);
    if (next.has(gid)) next.delete(gid);
    else next.add(gid);
    return next;
  });

  return (
    <div className="downloads-page">
      <header className="downloads-page-header">
        <div>
          <p className="downloads-eyebrow">TRANSFER CENTER</p>
          <h1>Downloads</h1>
          <p>Track speed, progress and file activity in real time.</p>
        </div>
        <div className="download-total-speed">
          <Activity size={17} />
          <div><span>Total speed</span><strong>{formatBytes(summary.speed)}/s</strong></div>
        </div>
      </header>

      <section className="downloads-overview" aria-label="Download summary">
        <div><span>Active tasks</span><strong>{activeDownloads.length}</strong></div>
        <div><span>Downloaded</span><strong>{formatBytes(summary.completed)}</strong></div>
        <div><span>Remaining</span><strong>{formatBytes(Math.max(0, summary.total - summary.completed))}</strong></div>
      </section>

      <section className="downloads-section">
        <div className="downloads-section-heading">
          <div><h2>In progress</h2><span>{activeDownloads.length} {activeDownloads.length === 1 ? "transfer" : "transfers"}</span></div>
        </div>
        {!activeDownloads.length ? (
          <div className="downloads-empty"><ArrowDownToLine size={21} /><strong>Nothing downloading</strong><span>New transfers will appear here with live speed and progress.</span></div>
        ) : (
          <div className="download-list">
            {activeDownloads.map((download) => {
              const progress = download.total > 0 ? Math.min(100, (download.completed / download.total) * 100) : 0;
              const preparing = download.total === 0 && download.speed === 0 && download.status !== "paused";
              const paused = download.status === "paused";
              const expanded = expandedGids.has(download.gid);
              const eta = download.speed > 0 ? (download.total - download.completed) / download.speed : -1;
              const files = download.files || [];

              return (
                <article key={download.gid} className="download-card">
                  <div className="download-card-heading">
                    <div className="download-file-icon"><HardDrive size={17} /></div>
                    <div className="download-card-title">
                      <strong title={download.gameName || download.name}>{download.gameName || download.name}</strong>
                      <span>{download.isTorrent ? "Torrent transfer" : "Direct transfer"} <i /> {paused ? "Paused" : preparing ? "Preparing" : "Downloading"}</span>
                    </div>
                    <div className="download-speed-current">
                      <span>{paused ? "Paused" : preparing ? "Waiting for source" : `${formatBytes(download.speed)}/s`}</span>
                      <small>{download.connections ? `${download.connections} connections` : "Live speed"}</small>
                    </div>
                    <div className="download-controls">
                      {paused ? (
                        <button type="button" aria-label="Resume download" title="Resume" onClick={() => window.api.resumeDownload(download.gid)}><Play size={16} /></button>
                      ) : (
                        <button type="button" aria-label="Pause download" title="Pause" onClick={() => window.api.pauseDownload(download.gid)}><Pause size={16} /></button>
                      )}
                      <button type="button" className="download-cancel" aria-label="Cancel download" title="Cancel" onClick={() => window.api.cancelDownload(download.gid)}><X size={16} /></button>
                    </div>
                  </div>

                  <div className="download-progress-row">
                    <div className="download-progress-track"><span style={{ width: `${progress}%` }} /></div>
                    <strong>{download.total ? `${progress.toFixed(1)}%` : "—"}</strong>
                  </div>

                  <div className="download-detail-grid">
                    <Stat icon={ArrowDownToLine} label="Transferred" value={`${formatBytes(download.completed)} / ${download.total ? formatBytes(download.total) : "Unknown"}`} />
                    <Stat icon={Clock3} label="Time left" value={preparing ? "Calculating" : formatEta(eta)} />
                    <Stat icon={Radio} label="Peers" value={download.numSeeders ? `${download.numSeeders} seeds` : download.connections ? `${download.connections} active` : "—"} />
                  </div>

                  <div className="download-graph-wrap">
                    <div><span>Speed history</span><strong>{formatBytes(download.speed)}/s</strong></div>
                    <SpeedGraph values={speedHistory[download.gid]} />
                  </div>

                  {files.length > 1 && (
                    <div className="download-files">
                      <button type="button" onClick={() => toggleExpand(download.gid)}>
                        {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        {expanded ? "Hide files" : `Files (${files.length})`}
                      </button>
                      {expanded && <div className="download-file-list">{files.map((file, index) => {
                        const fileProgress = file.total > 0 ? (file.completed / file.total) * 100 : 0;
                        return <div className="download-file-row" key={`${file.path}-${index}`}><span title={file.path}>{file.path || "Resolving file…"}</span><strong>{file.total ? `${fileProgress.toFixed(1)}%` : "—"}</strong></div>;
                      })}</div>}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="downloads-section completed-section">
        <div className="downloads-section-heading">
          <div><h2>Completed</h2><span>{completedDownloads.length} saved</span></div>
          {completedDownloads.length > 0 && <button type="button" className="clear-download-history" onClick={() => window.api.clearCompleted().then(() => setCompletedDownloads([]))}><Trash2 size={14} /> Clear history</button>}
        </div>
        {!completedDownloads.length ? (
          <div className="completed-empty"><CheckCircle size={17} /> Completed downloads will be listed here.</div>
        ) : (
          <div className="completed-download-list">{completedDownloads.map((download, index) => (
            <div className="completed-download-row" key={download.gid || download.name || index}>
              <div className="completed-check"><CheckCircle size={17} /></div>
              <strong>{download.gameName || download.name}</strong>
              <span>{download.date ? new Date(download.date).toLocaleDateString() : "Completed"}</span>
              <span className="completed-status">Done</span>
            </div>
          ))}</div>
        )}
      </section>
    </div>
  );
}
