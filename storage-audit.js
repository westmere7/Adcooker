/* ===========================================================================
   Adflow — Supabase storage audit
   ---------------------------------------------------------------------------
   Finds objects in the `projects` bucket that nothing references any more, and
   optionally deletes them.

   HOW TO RUN
     1. Open Adflow (local or rmit-adflow.netlify.app) and SIGN IN.
     2. Open DevTools ▸ Console.
     3. Paste this whole file and press Enter.  → dry run, deletes nothing.
     4. To delete the safe class (orphaned share snapshots):
            await adflowStorageAudit({ apply: true })
     5. To also delete orphaned project blobs — read the warning it prints first:
            await adflowStorageAudit({ apply: true, includeBlobs: true })

   WHAT COUNTS AS AN ORPHAN
     Project blobs        <uid>/<projectId>.flow  or  spaces/<sid>/<projectId>.flow
                          → orphaned when no row in `projects` points at them.
     Share snapshots      <uid>/shares/<token>.flow
                          → orphaned when no live project's `previewSharePath`
                            names them. These are the ones that leaked: the token
                            is recorded only INSIDE the project blob, so deleting
                            a project used to strand its snapshet forever.
     Base project         <uid>/default-startup.flow (+ .meta.json sidecar)
                          → never an orphan. Managed by Settings ▸ Base project.

   WHY BLOB DELETION IS GATED SEPARATELY
     Orphan detection relies on what the `projects` table returns to YOU under
     row-level security. If a row is hidden from you for any reason, its blob
     looks unreferenced when it is not. Snapshots carry no such risk (they are
     never the only copy of anything), which is why they are the default class.
   =========================================================================== */

async function adflowStorageAudit(opts = {}) {
  const { apply = false, includeBlobs = false, concurrency = 6 } = opts;
  const BUCKET = 'projects';

  if (typeof sb === 'undefined' || !sb) {
    console.error('Cloud is not configured on this page.');
    return;
  }
  const u = (typeof authState !== 'undefined') ? authState.currentUser() : null;
  if (!u) {
    console.error('Not signed in. Sign in, then re-run.');
    return;
  }
  if (typeof JSZip === 'undefined') {
    console.error('JSZip is not loaded on this page — run this on the Adflow editor page.');
    return;
  }

  // Math.max(1, …) kept zero from rendering as "0 KB", but that made empty classes
  // report "1 KB" next to a count of 0, which reads as a missing object.
  const fmt = (b) => {
    if (!b) return '—';
    return b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  };

  // ---- 1. enumerate every object we are allowed to see ----------------------
  const listPage = async (prefix, offset) => {
    const { data, error } = await sb.storage.from(BUCKET)
      .list(prefix, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) { console.warn('list failed for', prefix || '<root>', '—', error.message); return []; }
    return data || [];
  };
  // Supabase list() is non-recursive and reports prefixes as rows without an id,
  // so directories have to be walked explicitly.
  const isFile = (row) => !!(row.id || (row.metadata && row.metadata.size !== undefined));
  const objects = [];
  const walk = async (prefix, depth = 0) => {
    if (depth > 3) return;
    let offset = 0;
    for (;;) {
      const page = await listPage(prefix, offset);
      if (!page.length) break;
      for (const row of page) {
        const path = prefix ? `${prefix}/${row.name}` : row.name;
        if (isFile(row)) {
          objects.push({
            path,
            size: (row.metadata && row.metadata.size) || 0,
            updatedAt: row.updated_at || row.created_at || null
          });
        } else {
          await walk(path, depth + 1);
        }
      }
      if (page.length < 100) break;
      offset += page.length;
    }
  };

  console.log('Scanning storage…');
  await walk(u.id);
  const { data: memberships } = await sb.from('space_members').select('space_id').eq('user_id', u.id);
  for (const m of (memberships || [])) await walk(`spaces/${m.space_id}`);

  // ---- 2. what the database says is live -----------------------------------
  const { data: rows, error: rowsErr } = await sb.from('projects')
    .select('id,name,storage_path,space_id,size_bytes,updated_at');
  if (rowsErr) { console.error('Could not read the projects table:', rowsErr.message); return; }
  const livePaths = new Set((rows || []).map(r => r.storage_path).filter(Boolean));

  // ---- 3. which snapshots are still referenced ------------------------------
  // The reference lives inside each project blob, so this is the expensive step.
  const referenced = new Set();
  const unreadable = [];
  const liveList = [...livePaths];
  let done = 0;
  const readOne = async (p) => {
    try {
      const { data: signed, error } = await sb.storage.from(BUCKET).createSignedUrl(p, 60);
      if (error) throw error;
      const resp = await fetch(`${signed.signedUrl}&_=${Date.now()}`, { cache: 'no-store' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const zip = await JSZip.loadAsync(await resp.blob());
      const f = zip.file('project.json');
      if (f) {
        const st = JSON.parse(await f.async('string'));
        if (st && typeof st.previewSharePath === 'string') referenced.add(st.previewSharePath);
      }
    } catch (e) {
      // A blob we cannot read might still reference a snapshot, so its snapshots
      // must NOT be treated as orphans. Record the uncertainty.
      unreadable.push({ path: p, reason: e.message || String(e) });
    } finally {
      done++;
      if (done % 5 === 0 || done === liveList.length) console.log(`  read ${done}/${liveList.length} project files`);
    }
  };
  for (let i = 0; i < liveList.length; i += concurrency) {
    await Promise.all(liveList.slice(i, i + concurrency).map(readOne));
  }

  // ---- 4. classify ---------------------------------------------------------
  const defaultStartup = `${u.id}/default-startup.flow`;
  // Its description sidecar counts as part of the base project, not as junk.
  const defaultStartupMeta = `${u.id}/default-startup.meta.json`;
  const buckets = { live: [], defaultStartup: [], snapshotReferenced: [], snapshotOrphan: [], blobOrphan: [], other: [] };
  for (const o of objects) {
    if (o.path === defaultStartup || o.path === defaultStartupMeta) buckets.defaultStartup.push(o);
    else if (livePaths.has(o.path)) buckets.live.push(o);
    else if (/\/shares\/[^/]+\.flow$/.test(o.path)) {
      (referenced.has(o.path) ? buckets.snapshotReferenced : buckets.snapshotOrphan).push(o);
    } else if (/\.flow$/.test(o.path)) buckets.blobOrphan.push(o);
    else buckets.other.push(o);
  }

  const sum = (arr) => arr.reduce((n, o) => n + (o.size || 0), 0);
  console.log('\n===== Adflow storage audit =====');
  console.log(`account          ${u.email}`);
  console.log(`objects seen     ${objects.length}  (${fmt(sum(objects))})`);
  console.log(`projects rows    ${(rows || []).length}`);
  console.table([
    { class: 'live project blobs', count: buckets.live.length, size: fmt(sum(buckets.live)) },
    { class: 'base project', count: buckets.defaultStartup.length, size: fmt(sum(buckets.defaultStartup)) },
    { class: 'snapshots (in use)', count: buckets.snapshotReferenced.length, size: fmt(sum(buckets.snapshotReferenced)) },
    { class: 'snapshots (ORPHAN)', count: buckets.snapshotOrphan.length, size: fmt(sum(buckets.snapshotOrphan)) },
    { class: 'project blobs (ORPHAN)', count: buckets.blobOrphan.length, size: fmt(sum(buckets.blobOrphan)) },
    { class: 'unrecognised', count: buckets.other.length, size: fmt(sum(buckets.other)) }
  ]);
  if (buckets.snapshotOrphan.length) { console.log('\nOrphaned share snapshots:'); console.table(buckets.snapshotOrphan); }
  if (buckets.blobOrphan.length) { console.log('\nOrphaned project blobs:'); console.table(buckets.blobOrphan); }
  if (buckets.other.length) { console.log('\nUnrecognised objects (never deleted by this tool):'); console.table(buckets.other); }
  if (unreadable.length) {
    console.warn(`\n${unreadable.length} live project file(s) could not be read. Their share snapshots may be ` +
                 'misreported as orphans — resolve these before deleting anything:');
    console.table(unreadable);
  }

  const reclaimable = sum(buckets.snapshotOrphan) + (includeBlobs ? sum(buckets.blobOrphan) : 0);
  if (!apply) {
    // Report both classes, not just the one the current flags would delete — a bare
    // "Reclaimable: —" reads as "nothing to do" while blobs are still sitting there.
    const snapBytes = sum(buckets.snapshotOrphan);
    const blobBytes = sum(buckets.blobOrphan);
    console.log(`\nDRY RUN — nothing deleted.`);
    console.log(`  orphaned snapshots     ${buckets.snapshotOrphan.length} · ${fmt(snapBytes)}`);
    console.log(`  orphaned project blobs ${buckets.blobOrphan.length} · ${fmt(blobBytes)}`);
    console.log('  await adflowStorageAudit({ apply: true })                        → orphaned snapshots');
    console.log('  await adflowStorageAudit({ apply: true, includeBlobs: true })    → also orphaned project blobs');
    return { buckets, unreadable, reclaimableBytes: reclaimable };
  }

  const targets = [...buckets.snapshotOrphan.map(o => o.path)];
  if (includeBlobs) {
    if (unreadable.length) {
      console.error('Refusing to delete project blobs while some live projects could not be read — ' +
                    'fix those first, or run without includeBlobs.');
      return { buckets, unreadable, deleted: [] };
    }
    targets.push(...buckets.blobOrphan.map(o => o.path));
  }
  if (!targets.length) { console.log('\nNothing to delete.'); return { buckets, unreadable, deleted: [] }; }

  console.log(`\nAbout to delete ${targets.length} object(s), ${fmt(reclaimable)}:`);
  targets.forEach(p => console.log('  ' + p));
  if (!confirm(`Delete ${targets.length} orphaned object(s) from Supabase storage?\n\nThis cannot be undone.`)) {
    console.log('Cancelled.');
    return { buckets, unreadable, deleted: [] };
  }

  const deleted = [];
  for (let i = 0; i < targets.length; i += 50) {
    const chunk = targets.slice(i, i + 50);
    const { error } = await sb.storage.from(BUCKET).remove(chunk);
    if (error) console.error('remove failed for chunk', i, error.message);
    else deleted.push(...chunk);
  }
  console.log(`\nDeleted ${deleted.length} object(s). Reclaimed about ${fmt(reclaimable)}.`);
  return { buckets, unreadable, deleted };
}

// Attach explicitly rather than relying on the declaration leaking into global
// scope. When this file is loaded via `fetch(...).then(eval)` the declaration
// lands in whatever scope the console gave that callback — in Firefox that is a
// throwaway `debugger eval code` scope, so the follow-up calls could not see it.
globalThis.adflowStorageAudit = adflowStorageAudit;

adflowStorageAudit();
