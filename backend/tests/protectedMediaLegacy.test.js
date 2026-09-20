import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BACKEND_ROOT } from '../services/video/videoPaths.js';
import { resolveProtectedVideoFile, resolveProtectedVideoStorageFile, rewriteProtectedPlaylist } from '../services/protectedMediaService.js';

const storagePath = 'uploads/videos/hls_1738920028716/master.m3u8';
afterEach(() => vi.restoreAllMocks());

describe('compatibilité du stockage historique protégé', () => {
  it('résout le maître, ses variantes et leurs segments sans URL publique', () => {
    const master = resolveProtectedVideoStorageFile(1204, storagePath);
    expect(master).toEqual({ absolutePath: path.join(BACKEND_ROOT, storagePath), relativePath: 'legacy/master.m3u8' });
    expect(rewriteProtectedPlaylist({ videoId: 1204, storagePath, playlistRelativePath: master.relativePath,
      content: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=900000\n720p/playlist.m3u8\n',
    })).toContain('/api/media/videos/1204/files/legacy/720p/playlist.m3u8');
    const variant = resolveProtectedVideoFile({ videoId: 1204, storagePath, relativePath: 'legacy/720p/playlist.m3u8' });
    expect(variant.absolutePath).toBe(path.join(BACKEND_ROOT, 'uploads/videos/hls_1738920028716/720p/playlist.m3u8'));
    const rewritten = rewriteProtectedPlaylist({ videoId: 1204, storagePath, playlistRelativePath: variant.relativePath,
      content: '#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:6,\nsegment.ts\n/uploads/videos/hls_1738920028716/720p/other.ts\n',
    });
    expect(rewritten).toContain('URI="/api/media/videos/1204/files/legacy/720p/init.mp4"');
    expect(rewritten).toContain('/api/media/videos/1204/files/legacy/720p/segment.ts');
    expect(rewritten).toContain('/api/media/videos/1204/files/legacy/720p/other.ts');
    expect(resolveProtectedVideoFile({ videoId: 1204, storagePath, relativePath: 'legacy/720p/segment.ts' }).absolutePath)
      .toBe(path.join(BACKEND_ROOT, 'uploads/videos/hls_1738920028716/720p/segment.ts'));
  });

  it.each(['1738920028716-123456_HLS', '1738920028716-123456_fixed_HLS'])(
    'conserve également le format historique %s', (folder) => {
      const stored = `uploads/videos/${folder}/master.m3u8`;
      const master = resolveProtectedVideoStorageFile(1204, stored);
      expect(master.absolutePath).toBe(path.join(BACKEND_ROOT, stored));
      expect(resolveProtectedVideoFile({ videoId: 1204, storagePath: stored, relativePath: 'legacy/720p/segment.ts' }).absolutePath)
        .toBe(path.join(BACKEND_ROOT, `uploads/videos/${folder}/720p/segment.ts`));
    },
  );

  it('accepte les anciens sous-titres et conserve les chemins modernes', () => {
    expect(resolveProtectedVideoStorageFile(1204, 'uploads/subtitles/1741946445495/subtitle_1.vtt').absolutePath)
      .toBe(path.join(BACKEND_ROOT, 'uploads/subtitles/1741946445495/subtitle_1.vtt'));
    expect(resolveProtectedVideoStorageFile(1204, 'uploads/video/1204/hls/master.m3u8').relativePath).toBe('hls/master.m3u8');
    expect(resolveProtectedVideoStorageFile(1204, 'uploads/video/1205/hls/master.m3u8')).toBeNull();
    expect(resolveProtectedVideoStorageFile(1204, 'uploads/videos/hls_a/../hls_b/master.m3u8')).toBeNull();
  });

  it('interdit les traversées et exige le chemin issu de la base pour les anciens dossiers', () => {
    for (const relativePath of ['legacy/../hls_other/master.m3u8', 'legacy/%2e%2e/master.m3u8', 'legacy//master.m3u8']) {
      expect(resolveProtectedVideoFile({ videoId: 1204, storagePath, relativePath })).toBeNull();
    }
    expect(resolveProtectedVideoFile({ videoId: 1204, relativePath: 'legacy/master.m3u8' })).toBeNull();
    expect(resolveProtectedVideoFile({ videoId: 1204, storagePath: 'uploads/video/1204/hls/master.m3u8', relativePath: 'legacy/master.m3u8' })).toBeNull();
  });

  it('refuse les liens symboliques vers un autre dossier', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'realpathSync')
      .mockReturnValueOnce(path.join(BACKEND_ROOT, 'uploads/videos/hls_1738920028716'))
      .mockReturnValueOnce(path.join(BACKEND_ROOT, 'uploads/videos/hls_other/segment.ts'));
    expect(resolveProtectedVideoFile({ videoId: 1204, storagePath, relativePath: 'legacy/segment.ts' })).toBeNull();
  });
});
