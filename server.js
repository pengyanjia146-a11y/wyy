const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const os = require('os');
const axios = require('axios');
const { 
  search, 
  song_url, 
  login_qr_key, 
  login_qr_create, 
  login_qr_check,
  user_account
} = require('NeteaseCloudMusicApi');
const ytSearch = require('yt-search');
const ytdl = require('@distube/ytdl-core');

// Optional: Global Agent for Proxy (if configured via Env)
if (process.env.HTTP_PROXY) {
  const { bootstrap } = require('global-agent');
  process.env.GLOBAL_AGENT_HTTP_PROXY = process.env.HTTP_PROXY;
  bootstrap();
  console.log(`[Proxy] Enabled: ${process.env.HTTP_PROXY}`);
}

const app = express();
const PORT = 3001;

// Allow CORS and Cookies
app.use(cors({
  origin: true, 
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const mapNeteaseSong = (item) => ({
  id: String(item.id),
  title: item.name,
  artist: item.ar ? item.ar.map(a => a.name).join('/') : 'Unknown',
  album: item.al ? item.al.name : '',
  coverUrl: item.al ? item.al.picUrl : '',
  source: 'NETEASE',
  duration: Math.floor(item.dt / 1000),
  isGray: false 
});

const mapYoutubeSong = (item) => ({
  id: item.videoId,
  title: item.title,
  artist: item.author.name,
  album: 'YouTube',
  coverUrl: item.thumbnail,
  source: 'YOUTUBE',
  duration: item.seconds,
  isGray: false
});

/**
 * Universal Proxy Function
 * Handles Range requests to satisfy Android MediaPlayer and fixes 403 errors for Bilibili/Netease
 */
async function streamProxy(targetUrl, req, res, extraHeaders = {}) {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...extraHeaders
    };

    if (req.headers.range) {
        headers['Range'] = req.headers.range;
    }

    try {
        const response = await axios({
            method: 'get',
            url: targetUrl,
            responseType: 'stream',
            headers: headers,
            validateStatus: status => status >= 200 && status < 400
        });

        res.status(response.status);
        
        // Forward essential headers
        const keysToForward = [
            'content-type', 
            'content-length', 
            'content-range', 
            'accept-ranges', 
            'last-modified'
        ];
        
        keysToForward.forEach(key => {
            if (response.headers[key]) {
                res.setHeader(key, response.headers[key]);
            }
        });

        response.data.pipe(res);
        
        response.data.on('error', (err) => {
            console.error('[StreamProxy] Data Error:', err.message);
            res.end();
        });

    } catch (e) {
        console.error(`[StreamProxy] Error fetching ${targetUrl}:`, e.message);
        if (!res.headersSent) {
            res.status(502).send('Proxy Error');
        } else {
            res.end();
        }
    }
}

// --- API Endpoints ---

// 1. Search API
app.get('/api/search', async (req, res) => {
  const { q } = req.query;
  const cookie = req.query.cookie || ''; 
  
  if (!q) return res.status(400).json({ error: 'Query is required' });

  try {
    const [neteaseRes, ytRes] = await Promise.allSettled([
        search({ keywords: q, type: 1, limit: 10, cookie }),
        ytSearch(q)
    ]);

    let songs = [];

    if (neteaseRes.status === 'fulfilled' && neteaseRes.value.body.result?.songs) {
        songs = [...songs, ...neteaseRes.value.body.result.songs.map(mapNeteaseSong)];
    }

    if (ytRes.status === 'fulfilled' && ytRes.value.videos) {
        songs = [...songs, ...ytRes.value.videos.slice(0, 5).map(mapYoutubeSong)];
    }
    
    res.json({ songs });
  } catch (error) {
    console.error('Search Error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// 2. Get Playable URL (with Proxy logic)
app.get('/api/url', async (req, res) => {
  const { id, source, cookie } = req.query;
  const host = req.get('host'); 
  const protocol = req.protocol;

  if (source === 'NETEASE') {
      try {
          let result = await song_url({ id: id, level: 'standard', cookie: cookie || '' });
          let url = result.body?.data?.[0]?.url;

          if (!url) {
             result = await song_url({ id: id, level: 'exhigh', cookie: cookie || '' });
             url = result.body?.data?.[0]?.url;
          }

          if (!url) return res.status(404).json({ error: 'Unavailable' });

          // Proxy Netease to fix some IP restrictions or just pass through
          // For now, pass direct unless VIP issue logic is complex
          // Note: Netease usually checks cookie, not Referer for audio.
          return res.json({ url: url }); 

      } catch (error) {
          return res.status(500).json({ error: 'Netease Error' });
      }
  } else if (source === 'YOUTUBE') {
      const streamUrl = `${protocol}://${host}/api/yt/play?id=${id}`;
      return res.json({ url: streamUrl });

  } else if (source === 'BILIBILI') {
      try {
        // 1. Get CID
        const viewRes = await axios.get(`https://api.bilibili.com/x/web-interface/view?bvid=${id}`);
        const cid = viewRes.data?.data?.cid;
        if (!cid) return res.status(404).json({ error: 'CID not found' });

        // 2. Get Play URL
        const playUrl = `https://api.bilibili.com/x/player/playurl?bvid=${id}&cid=${cid}&qn=64&fnval=1&platform=html5&high_quality=1`;
        const playRes = await axios.get(playUrl, { headers: { Referer: 'https://www.bilibili.com/' } });
        const realUrl = playRes.data?.data?.durl?.[0]?.url;
        
        if (!realUrl) return res.status(404).json({ error: 'Play URL not found' });

        // 3. Proxy it (CRITICAL for Bilibili)
        const proxyUrl = `${protocol}://${host}/api/proxy?url=${encodeURIComponent(realUrl)}&referer=https://www.bilibili.com/`;
        return res.json({ url: proxyUrl });
      } catch (e) {
          console.error("Bilibili Error", e.message);
          return res.status(500).json({ error: 'Failed' });
      }
  }

  res.status(404).json({ error: 'Source not supported' });
});

// 3. YouTube Stream Endpoint
app.get('/api/yt/play', async (req, res) => {
    const { id } = req.query;
    if(!id) return res.status(400).end();

    try {
        const videoUrl = `https://www.youtube.com/watch?v=${id}`;
        const info = await ytdl.getInfo(videoUrl);
        const format = ytdl.chooseFormat(info.formats, { filter: 'audioonly', quality: 'lowestaudio' });

        if (!format || !format.url) return res.status(404).send('No audio');

        await streamProxy(format.url, req, res);
    } catch (e) {
        console.error("YouTube Play Error:", e.message);
        res.status(500).end();
    }
});

// 4. Generic Proxy
app.get('/api/proxy', async (req, res) => {
    const { url, referer } = req.query;
    if (!url) return res.status(400).send('No URL');
    
    const headers = referer ? { 'Referer': referer } : {};
    await streamProxy(decodeURIComponent(url), req, res, headers);
});

// Netease Login
app.get('/api/login/qr/key', async (req, res) => {
    try { const r = await login_qr_key({ timestamp: Date.now() }); res.json(r.body); } catch(e){res.status(500).send(e)}
});
app.get('/api/login/qr/create', async (req, res) => {
    try { const r = await login_qr_create({ key: req.query.key, qrimg: true, timestamp: Date.now() }); res.json(r.body); } catch(e){res.status(500).send(e)}
});
app.get('/api/login/qr/check', async (req, res) => {
    try { const r = await login_qr_check({ key: req.query.key, timestamp: Date.now() }); res.json({...r.body, cookie: r.cookie}); } catch(e){res.status(500).send(e)}
});
app.get('/api/login/status', async (req, res) => {
    try { const r = await user_account({ cookie: req.query.cookie }); res.json(r.body); } catch(e){res.status(500).send(e)}
});

app.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log(`UniStream Backend: http://${ip}:${PORT}`);
});