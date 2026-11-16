// Fallback for when the IRSA search service (SIA) is down: saved observation
// lists for the challenge targets. Only the *list* is saved; every image is
// still fetched live from IRSA's file service by api/frame.js.
import saved from './target-snapshots.mjs';

const R = Math.PI / 180;
const separationDeg = (ra1, dec1, ra2, dec2) => {
  const s = Math.sin((dec2 - dec1) * R / 2) ** 2 + Math.cos(dec1 * R) * Math.cos(dec2 * R) * Math.sin((ra2 - ra1) * R / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(s))) / R;
};

// A saved list matches only the same field centre (within ~4 arcsec) and detector.
export function findSnapshot({ra, dec, detector}, snapshots = saved) {
  for (const [key, t] of Object.entries(snapshots.targets || {})) {
    const entry = t.detectors?.[detector];
    if (entry?.records?.length && separationDeg(ra, dec, t.ra, t.dec) < 0.001) return {key, name: t.name, ...entry};
  }
  return null;
}

export function snapshotResponse(found) {
  const when = new Date(found.retrievedAt).toUTCString().slice(5, 16);
  return {
    records: found.records, total: found.records.length, sampled: false,
    source: found.source || [], retrievedAt: found.retrievedAt, releases: ['DR1', 'QR3'],
    snapshot: {target: found.key, retrievedAt: found.retrievedAt},
    warnings: [`NASA/IPAC IRSA search is unavailable right now, so this uses the ${found.name} observation list saved on ${when}. Every image is still downloaded live from IRSA.`],
  };
}
