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

// Helper to parse Bili duration "MM:SS" or "HH:MM:SS"
const parseBiliDuration = (str) => {
    if (!str) return 0;
    const parts = str.split(':').map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
};

const mapBiliSong = (item) => ({
    id: item.bvid,
    title: item.title.replace(/<[^>]*>/g, ''),
    artist: item.author,
    album: 'Bilibili',
    coverUrl: item.pic.startsWith('//') ? `https:${item.pic}` : item.pic,
    source: 'BILIBILI',
    duration: parseBiliDuration(item.duration),
    isGray: false
});

/**
 * Universal Proxy Function
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

// 1. Unified Search API (Netease + YouTube)
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

// 2. Bilibili Proxy Search API
app.get('/api/search/bilibili', async (req, res) => {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Query required' });

    try {
        const url = `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(q)}`;
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://www.bilibili.com/',
                'Cookie': "buvid3=INFOC;" // Sometimes needed to avoid simple blocks
            }
        });

        if (response.data && response.data.data && response.data.data.result) {
            const songs = response.data.data.result.map(mapBiliSong);
            return res.json({ songs });
        }
        return res.json({ songs: [] });
    } catch (e) {
        console.error("Bili Search Error:", e.message);
        return res.status(500).json({ error: 'Bilibili failed' });
    }
});

// 3. Get Playable URL (with Proxy logic)
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
          return res.json({ url: url }); 

      } catch (error) {
          return res.status(500).json({ error: 'Netease Error' });
      }
  } else if (source === 'YOUTUBE') {
      const streamUrl = `${protocol}://${host}/api/yt/play?id=${id}`;
      return res.json({ url: streamUrl });

  } else if (source === 'BILIBILI') {
      try {
        const viewRes = await axios.get(`https://api.bilibili.com/x/web-interface/view?bvid=${id}`);
        const cid = viewRes.data?.data?.cid;
        if (!cid) return res.status(404).json({ error: 'CID not found' });

        const playUrl = `https://api.bilibili.com/x/player/playurl?bvid=${id}&cid=${cid}&qn=64&fnval=1&platform=html5&high_quality=1`;
        const playRes = await axios.get(playUrl, { headers: { Referer: 'https://www.bilibili.com/' } });
        const realUrl = playRes.data?.data?.durl?.[0]?.url;
        
        if (!realUrl) return res.status(404).json({ error: 'Play URL not found' });

        const proxyUrl = `${protocol}://${host}/api/proxy?url=${encodeURIComponent(realUrl)}&referer=https://www.bilibili.com/`;
        return res.json({ url: proxyUrl });
      } catch (e) {
          console.error("Bilibili Error", e.message);
          return res.status(500).json({ error: 'Failed' });
      }
  }

  res.status(404).json({ error: 'Source not supported' });
});

// 4. YouTube Stream Endpoint
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

// 5. Generic Proxy
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