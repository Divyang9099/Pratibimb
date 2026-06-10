import { useEffect, useState } from 'react';
import { fetchPhotos } from '../api';

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export default function FieldPhotos({ projectId, accessKey }) {
  const [photos, setPhotos] = useState(null);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    if (!projectId || !accessKey) return;
    fetchPhotos(projectId, accessKey)
      .then((p) => {
        // Latest first, only entries that have an image.
        const sorted = [...p]
          .filter((x) => x.image)
          .sort((a, b) => new Date(b.date) - new Date(a.date) || new Date(b.createdAt) - new Date(a.createdAt));
        setPhotos(sorted);
      })
      .catch(() => setPhotos([]));
  }, [projectId, accessKey]);

  if (!photos) {
    return (
      <div className="panel">
        <div className="panel-title">Field Photos</div>
        <span className="sk sk-card" style={{ height: 120 }} />
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-title">Field Photos ({photos.length})</div>

      {!photos.length && (
        <p className="muted" style={{ fontSize: 14 }}>No field photos uploaded yet.</p>
      )}

      <div className="photo-grid">
        {photos.map((p) => (
          <div key={p._id} className="photo-thumb" onClick={() => setExpanded(p)}>
            <img src={p.image} alt={`${p.type} tower ${p.towerNo}`} />
            <div className="photo-meta">
              <span className={`photo-type ${p.type}`}>{p.type === 'start' ? 'Start' : 'End'}</span>
              <span>T{p.towerNo}</span>
              <span>{fmtDate(p.date)}</span>
            </div>
          </div>
        ))}
      </div>

      {expanded && (
        <div className="lightbox" onClick={() => setExpanded(null)}>
          <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <img src={expanded.image} alt="field" />
            <div className="lightbox-info">
              <span className={`photo-type ${expanded.type}`}>
                {expanded.type === 'start' ? 'Start Day' : 'End Day'}
              </span>
              <span>Tower {expanded.towerNo}</span>
              <span>{fmtDate(expanded.date)}</span>
              <span className="muted">{expanded.pilot?.name}</span>
              {expanded.note && <span className="muted">"{expanded.note}"</span>}
            </div>
            <button className="ghost" style={{ marginTop: 10 }} onClick={() => setExpanded(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
