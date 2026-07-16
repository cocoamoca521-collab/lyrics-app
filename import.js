const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://dbpferzntxfaxkucusne.supabase.co';
const SUPABASE_KEY = 'sb_publishable_JUvwqzfkKsDR7Xwm3jJ6ug_TcVaeMwR';
const CHARACTER_NAME = '藤宮湊';

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({length: m + 1}, (_, i) => [i]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(
        dp[i-1][j] + 1, dp[i][j-1] + 1,
        dp[i-1][j-1] + (a[i-1] !== b[j-1] ? 1 : 0)
      );
  return dp[m][n];
}

function extractTitlesFromTOC(lines) {
  let inTOC = false;
  const titles = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.toLowerCase() === 'contents') { inTOC = true; continue; }
    if (inTOC && trimmed.startsWith('________________')) break;
    if (inTOC) {
      const m = trimmed.match(/^\d+\.\s*(.+?)(?:[\.…·]+\d+)?$/);
      if (m) titles.push(m[1].replace(/[\.…·]+$/, '').trim());
    }
  }
  return titles;
}

function parseLyricsFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split(/\r?\n/);

  const tocTitles = extractTitlesFromTOC(lines);
  const remainingTitles = new Set(tocTitles);

  let pastTOC = false;
  let separatorCount = 0;
  let songs = [];
  let currentTitle = null;
  let currentLyrics = [];
  let blankCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('________________')) {
      separatorCount++;
      if (separatorCount >= 2) {
        pastTOC = true;
        blankCount = 999;
      }
      continue;
    }
    if (!pastTOC) continue;
    if (trimmed.match(/^🎤|^🖋️|^🤖|^contents$/i)) continue;

    if (trimmed === '') {
      blankCount++;
      if (currentTitle !== null) currentLyrics.push(line);
      continue;
    }

    let matchedTitle = null;
    if (blankCount >= 3) {
      const norm = s => s.toLowerCase()
        .replace(/[.\s。、！？!?]+$/g, '')
        .replace(/[""「」'']/g, '"')
        .replace(/[''`]/g, "'")
        .replace(/～/g, '~')
        .trim();
      const fuzzy = s => norm(s).replace(/[^a-z0-9　-鿿]/g, '');
      for (const t of remainingTitles) {
        if (t === trimmed) { matchedTitle = t; break; }
      }
      if (!matchedTitle) {
        for (const t of remainingTitles) {
          if (t.toLowerCase() === trimmed.toLowerCase()) { matchedTitle = t; break; }
        }
      }
      if (!matchedTitle) {
        for (const t of remainingTitles) {
          if (norm(t) === norm(trimmed)) { matchedTitle = t; break; }
        }
      }
      if (!matchedTitle) {
        for (const t of remainingTitles) {
          if (fuzzy(t) === fuzzy(trimmed)) { matchedTitle = t; break; }
        }
      }
      if (!matchedTitle) {
        for (const t of remainingTitles) {
          const d = levenshtein(norm(t), norm(trimmed));
          if (d <= 2 && d < norm(t).length * 0.3) { matchedTitle = t; break; }
        }
      }
    }

    if (matchedTitle) {
      if (currentTitle && currentLyrics.length > 0) {
        songs.push({ title: currentTitle, lyrics: cleanLyrics(currentLyrics) });
      }
      remainingTitles.delete(matchedTitle);
      currentTitle = trimmed;
      currentLyrics = [];
      blankCount = 0;
      continue;
    }

    blankCount = 0;
    if (currentTitle !== null) currentLyrics.push(line);
  }

  if (currentTitle && currentLyrics.length > 0) {
    songs.push({ title: currentTitle, lyrics: cleanLyrics(currentLyrics) });
  }

  if (remainingTitles.size > 0) {
    console.log(`  [MISSED] ${[...remainingTitles].join(', ')}`);
  }

  return songs;
}

function cleanLyrics(lines) {
  let text = lines.join('\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.replace(/^\n+/, '').replace(/\n+$/, '');
  return text;
}

async function uploadToSupabase(songs) {
  const data = songs.map(s => ({
    character_name: CHARACTER_NAME,
    tag: CHARACTER_NAME,
    title: s.title,
    lyrics: s.lyrics,
    updated_at: new Date().toISOString()
  }));

  const res = await fetch(`${SUPABASE_URL}/rest/v1/lyrics`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(data)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Upload failed: ${res.status} ${err}`);
  }

  return await res.json();
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const fileArgs = args.filter(a => !a.startsWith('--'));

  let files = [];
  if (fileArgs.length > 0) {
    files = fileArgs;
  } else {
    const dlDir = path.join(process.env.USERPROFILE || process.env.HOME, 'Downloads');
    const all = fs.readdirSync(dlDir);
    files = all
      .filter(f => f.match(/湊くんキャラソン.*\.txt$/))
      .map(f => path.join(dlDir, f));
  }

  if (files.length === 0) {
    console.log('No files found!');
    process.exit(1);
  }

  console.log(`Found ${files.length} file(s)\n`);

  let allSongs = [];
  for (const f of files) {
    const songs = parseLyricsFile(f);
    console.log(`${path.basename(f)}: ${songs.length} songs`);
    songs.forEach(s => console.log(`  - ${s.title}`));
    allSongs.push(...songs);
  }

  console.log(`\nTotal: ${allSongs.length} songs`);

  if (dryRun) {
    console.log('\n[DRY RUN] No data uploaded.');
    return;
  }

  console.log('\nUploading to Supabase...');
  const result = await uploadToSupabase(allSongs);
  console.log(`Done! ${result.length} songs uploaded.`);
}

main().catch(e => { console.error(e); process.exit(1); });
