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

// 1. Unified Search API (Netease + YouTube + Bilibili)
app.get('/api/search', async (