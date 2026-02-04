import { CapacitorHttp } from '@capacitor/core';
import { Song, MusicSource, AudioQuality, Artist, Playlist, DiagnosticResult } from "../types";

interface SongPlayDetails {
    url: string;
    lyric?: string;
    coverUrl?: string; 
    isMv?: boolean;
}

export class ClientSideService {
  private baseHeaders = {
    'Referer': 'https://music.163.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Real-IP': '115.239.211.112', 
    'X-Forwarded-For': '115.239.211.112'
  };
  
  private bilibiliHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.bilibili.com/'
  };

  // Invidious Instances (Fallback)
  private invidiousInstances = [
      'https://inv.tux.pizza',
      'https://vid.uff.net',
      'https://inv.nadeko.net',
      'https://invidious.jing.rocks',
      'https://yt.artemislena.eu'
  ];

  // Piped Instances (More stable for search)
  // Added more instances to increase success rate
  private pipedInstances = [
      'https://pipedapi.kavin.rocks',
      'https://api.piped.otter.sh',
      'https://pipedapi.drgns.space',
      'https://piped-api.lunar.icu',
      'https://pipedapi.system41.rocks',
      'https://api.piped.privacy.com.de'
  ];

  private currentInvInstance = this.invidiousInstances[0];
  private currentPipedInstance = this.pipedInstances[0];
  private customInvInstance = '';
  private plugins: any[] = [];
  // Reduced timeout to fail faster (3.5s) instead of hanging the UI
  private requestTimeout = 3500; 
  private guestCookie = '';
  private apiBaseUrl = ''; // Backend Node.js Server URL
  
  // Logging system for on-device debugging
  private logs: string[] = [];

  constructor() {
    this.currentInvInstance = this.invidiousInstances[Math.floor(Math.random() * this.invidiousInstances.length)];
    this.currentPipedInstance = this.pipedInstances[Math.floor(Math.random() * this.pipedInstances.length)];
    this.generateGuestHeaders();
  }

  // --- Logger Methods ---
  public log(msg: string) {
      const time = new Date().toLocaleTimeString();
      const entry = `[${time}] ${msg}`;
      this.logs.unshift(entry);
      if (this.logs.length > 100) this.logs.pop();
      console.log(entry); // Keep console for dev
  }

  public getLogs() {
      return this.logs;
  }
  
  public clearLogs() {
      this.logs = [];
  }

  // --- Configuration ---
  setApiBaseUrl(url: string) {
      this.apiBaseUrl = url.replace(/\/$/, '');
      this.log(`Configuration: Backend set to ${this.apiBaseUrl || 'None'}`);
  }
  
  setSearchTimeout(ms: number) {
      this.requestTimeout = ms;
  }
  
  setCustomInvidiousUrl(url: string) {
      this.customInvInstance = url ? url.replace(/\/$/, '') : '';
  }

  private randomHex(length: number) {
      let result = '';
      const characters = '0123456789abcdef';
      for (let i = 0; i < length; i++) {
          result += characters.charAt(Math.floor(Math.random() * characters.length));
      }
      return result;
  }

  private generateGuestHeaders() {
      const nmtid = this.randomHex(32);
      const deviceId = this.randomHex(16);
      this.guestCookie = `os=pc; appver=2.9.7; NMTID=${nmtid}; DeviceId=${deviceId};`;
  }

  private getHeaders() {
      const savedUser = localStorage.getItem('unistream_user');
      let cookieStr = this.guestCookie; 

      if (savedUser) {
          try {
              const userData = JSON.parse(savedUser);
              if (userData.cookie && userData.cookie.length > 5) {
                  let targetCookie = userData.cookie;
                  if (targetCookie.includes('MUSIC_U=')) {
                       if (!targetCookie.includes('os=pc')) cookieStr = `os=pc; appver=2.9.7; ${targetCookie}`;
                       else cookieStr = targetCookie; 
                  } else {
                       cookieStr = `os=pc; appver=2.9.7; MUSIC_U=${targetCookie};`;
                  }
              }
          } catch(e) {}
      }

      return {
          ...this.baseHeaders,
          'Cookie': cookieStr
      };
  }

  // --- Diagnostics Tool ---
  async runDiagnostics(): Promise<DiagnosticResult[]> {
      this.log("Starting full network diagnostics...");
      const results: DiagnosticResult[] = [];

      // 1. Netease Check
      results.push(await this.pingService("Netease Cloud", "https://music.163.com/api/search/hot", 2000));

      // 2. Bilibili Check
      results.push(await this.pingService("Bilibili API", "https://api.bilibili.com/x/web-interface/nav", 2000));

      // 3. Backend Check
      if (this.apiBaseUrl) {
          results.push(await this.pingService("Backend Server", `${this.apiBaseUrl}/search?q=test`, 3000));
      } else {
          results.push({ name: "Backend Server", status: 'skipped', latency: 0, message: "Not configured" });
      }

      // 4. Check Top 3 Piped Instances
      for (let i = 0; i < 3; i++) {
          const instance = this.pipedInstances[i];
          const host = new URL(instance).hostname;
          results.push(await this.pingService(`Piped (${host})`, `${instance}/streams/5qap5aO4i9A`, 4000));
      }

      // 5. Check Invidious
      const inv = this.customInvInstance || this.currentInvInstance;
      const invHost = new URL(inv).hostname;
      results.push(await this.pingService(`Invidious (${invHost})`, `${inv}/api/v1/stats`, 4000));

      this.log("Diagnostics finished.");
      return results;
  }

  private async pingService(name: string, url: string, timeout: number): Promise<DiagnosticResult> {
      const start = Date.now();
      try {
          const res = await CapacitorHttp.get({ url, connectTimeout: timeout, readTimeout: timeout });
          const latency = Date.now() - start;
          if (res.status >= 200 && res.status < 400) {
              return { name, status: 'ok', latency, message: `OK (${res.status})` };
          } else {
              return { name, status: 'error', latency, message: `HTTP ${res.status}` };
          }
      } catch (e: any) {
          return { name, status: 'error', latency: Date.now() - start, message: e.message || "Timeout/Network Error" };
      }
  }

  async getPings(): Promise<{ netease: number; youtube: number }> {
      // Lightweight Ping for Labs page
      const start = Date.now();
      let netease = -1;
      let youtube = -1;

      try {
          await CapacitorHttp.get({ url: 'https://music.163.com/api/search/hot', headers: this.getHeaders(), connectTimeout: 3000 });
          netease = Date.now() - start;
      } catch (e) { netease = -1; }

      const ytStart = Date.now();
      try {
           const piped = this.currentPipedInstance;
           await CapacitorHttp.get({ url: `${piped}/streams/5qap5aO4i9A`, connectTimeout: 3000 }); 
           youtube = Date.now() - ytStart;
      } catch (e) { youtube = -1; }
      
      return { netease, youtube };
  }

  // --- Search Implementations ---
  
  async searchMusic(query: string): Promise<Song[]> {
    this.log(`Searching: "${query}"`);
    
    // We use Promise.allSettled but with shorter timeouts per provider inside their functions
    const promises = [
        this.searchNetease(query),
        this.searchBilibili(query),
        this.searchYouTube(query),
        ...this.plugins.map(p => this.searchPlugin(p, query))
    ];
    
    const results = await Promise.allSettled(promises);
    let allSongs: Song[] = [];
    let successCount = 0;

    results.forEach((res, index) => {
        if (res.status === 'fulfilled') {
            const count = res.value.length;
            if (count > 0) successCount++;
            allSongs = [...allSongs, ...res.value];
        } else {
            this.log(`Provider ${index} crashed: ${res.reason}`);
        }
    });
    
    this.log(`Search completed. Found ${allSongs.length} songs from ${successCount} sources.`);
    return allSongs;
  }

  // Improved YouTube Search: Backend -> Piped -> Invidious
  private async searchYouTube(keyword: string): Promise<Song[]> {
      // 1. Try Backend (Most Reliable)
      if (this.apiBaseUrl) {
          try {
              this.log(`Checking Backend for YT: ${this.apiBaseUrl}`);
              const response = await CapacitorHttp.get({
                  url: `${this.apiBaseUrl}/search?q=${encodeURIComponent(keyword)}`,
                  connectTimeout: 5000
              });
              let data = response.data;
              if (typeof data === 'string') { try { data = JSON.parse(data); } catch(e){} }
              if (data && Array.isArray(data.songs)) {
                  const backendSongs = data.songs.filter((s: Song) => s.source === MusicSource.YOUTUBE);
                  this.log(`Backend returned ${backendSongs.length} YT songs`);
                  if (backendSongs.length > 0) return backendSongs;
              }
          } catch(e: any) { this.log(`Backend YT Search Failed: ${e.message}`); }
      }

      // 2. Try Piped Instances (Try up to 2 instances to speed up)
      const pipedCandidates = [...this.pipedInstances];
      // Randomize start index to load balance
      const startIdx = Math.floor(Math.random() * pipedCandidates.length);
      
      // Attempt 2 different piped instances max
      for (let i = 0; i < 2; i++) {
          const index = (startIdx + i) % pipedCandidates.length;
          const instance = pipedCandidates[index];
          this.log(`Trying Piped: ${instance}`);
          
          try {
              const url = `${instance}/search?q=${encodeURIComponent(keyword)}&filter=videos`;
              const response = await CapacitorHttp.get({ url, connectTimeout: 3500 }); // Fast fail
              let data = response.data;
              if (typeof data === 'string') { try { data = JSON.parse(data); } catch(e){} }
              
              if (response.status === 200 && data && Array.isArray(data.items)) {
                  this.currentPipedInstance = instance;
                  const songs = data.items.slice(0, 5).map((item: any) => ({
                      id: item.url.replace('/watch?v=', ''),
                      title: item.title,
                      artist: item.uploaderName,
                      album: 'YouTube',
                      coverUrl: item.thumbnail,
                      source: MusicSource.YOUTUBE,
                      duration: item.duration,
                      isGray: false,
                      mvId: item.url.replace('/watch?v=', '')
                  }));
                  this.log(`Piped success: Found ${songs.length} songs`);
                  return songs;
              }
          } catch(e: any) {
              this.log(`Piped ${instance} failed: ${e.message || 'Timeout'}`);
          }
      }

      // 3. Try Invidious Instances (Fallback)
      this.log("Falling back to Invidious...");
      const invCandidates = this.customInvInstance 
          ? [this.customInvInstance, ...this.invidiousInstances] 
          : [...this.invidiousInstances];
      
      // Try just 1 random invidious instance as last resort
      const randI = Math.floor(Math.random() * invCandidates.length);
      const instance = invCandidates[randI];

      try {
          const url = `${instance}/api/v1/search?q=${encodeURIComponent(keyword)}&type=video`;
          const response = await CapacitorHttp.get({ url, connectTimeout: 5000 });
          let data = response.data;
          if (typeof data === 'string') { try { data = JSON.parse(data); } catch(e){} }

          if (response.status === 200 && Array.isArray(data)) {
              this.currentInvInstance = instance; 
              const songs = data.slice(0, 5).map((item: any) => ({
                  id: item.videoId,
                  title: item.title,
                  artist: item.author,
                  album: 'YouTube',
                  coverUrl: item.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
                  source: MusicSource.YOUTUBE,
                  duration: item.lengthSeconds,
                  isGray: false,
                  mvId: item.videoId
              }));
              this.log(`Invidious success: ${songs.length} songs`);
              return songs;
          }
      } catch (e: any) { 
          this.log(`Invidious failed: ${e.message}`);
      }
      
      this.log("YouTube Search gave up.");
      return [];
  }

  private mapNeteaseSong(item: any): Song {
      return {
          id: String(item.id),
          title: item.name,
          artist: item.ar ? item.ar.map((a: any) => a.name).join('/') : (item.artists ? item.artists.map((a: any) => a.name).join('/') : 'Unknown'),
          artistId: item.ar ? String(item.ar[0].id) : (item.artists ? String(item.artists[0].id) : undefined),
          album: item.al ? item.al.name : (item.album ? item.album.name : ''),
          coverUrl: item.al?.picUrl ? item.al.picUrl.replace(/^http:/, 'https:') : (item.album?.picUrl ? item.album.picUrl.replace(/^http:/, 'https:') : ''),
          source: MusicSource.NETEASE,
          duration: Math.floor(item.dt / 1000),
          isGray: false,
          fee: item.fee,
          mvId: item.mv ? String(item.mv) : undefined
      };
  }

  private async searchNetease(keyword: string): Promise<Song[]> {
      try {
          const url = 'https://music.163.com/api/cloudsearch/pc';
          const data = `s=${encodeURIComponent(keyword)}&type=1&offset=0&limit=20&total=true`;
          const response = await CapacitorHttp.post({ url, headers: this.getHeaders(), data, connectTimeout: this.requestTimeout });
          let resData = response.data;
          if (typeof resData === 'string') { try { resData = JSON.parse(resData); } catch(e) {} }
          if (resData?.result?.songs) {
              return resData.result.songs.map((item: any) => this.mapNeteaseSong(item));
          }
      } catch (e: any) { this.log(`Netease Search Error: ${e.message}`); }
      return [];
  }

  private async searchBilibili(keyword: string): Promise<Song[]> {
      try {
          const url = `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(keyword)}`;
          const response = await CapacitorHttp.get({ url, headers: this.bilibiliHeaders, connectTimeout: this.requestTimeout });
          if (response.status === 200 && response.data?.data?.result) {
              return response.data.data.result.map((item: any) => ({
                  id: item.bvid,
                  title: item.title.replace(/<[^>]*>/g, ''),
                  artist: item.author,
                  album: 'Bilibili',
                  coverUrl: item.pic.startsWith('//') ? `https:${item.pic}` : item.pic,
                  source: MusicSource.BILIBILI,
                  duration: this.parseBiliDuration(item.duration),
                  isGray: false,
                  mvId: item.bvid 
              }));
          }
      } catch (e: any) { this.log(`Bilibili Search Error: ${e.message}`); }
      return [];
  }

  private parseBiliDuration(durationStr: string): number {
      if (!durationStr) return 0;
      const parts = durationStr.split(':').map(Number);
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      return 0;
  }

  private async searchPlugin(plugin: any, query: string): Promise<Song[]> {
      try {
          if (plugin.search) {
              const results = await plugin.search(query);
              return results.map((r: any) => ({ ...r, source: MusicSource.PLUGIN, pluginId: plugin.id, isGray: false }));
          }
      } catch (e) {}
      return [];
  }

  // --- NEW METHODS ---
  async getUserPlaylists(userId: string): Promise<Playlist[]> {
      try {
          const url = `https://music.163.com/api/user/playlist?uid=${userId}&limit=100`;
          const response = await CapacitorHttp.get({ url, headers: this.getHeaders() });
          let data = response.data;
          if (typeof data === 'string') { try { data = JSON.parse(data); } catch(e){} }
          
          if (data && data.code === 200 && data.playlist) {
              return data.playlist.map((pl: any) => ({
                  id: String(pl.id),
                  name: pl.name,
                  description: pl.description,
                  coverUrl: pl.coverImgUrl ? pl.coverImgUrl.replace(/^http:/, 'https:') : '',
                  songs: [],
                  isSystem: false
              }));
          }
      } catch (e) { this.log(`Fetch Playlists Error: ${e}`); }
      return [];
  }

  async getArtistDetail(artistId: string): Promise<{artist: Artist, songs: Song[]}> {
      let artist: Artist = { id: artistId, name: 'Unknown', coverUrl: '' };
      let songs: Song[] = [];
      try {
          const url = `https://music.163.com/api/artist/${artistId}`;
          const response = await CapacitorHttp.get({ url, headers: this.getHeaders() });
          let data = response.data;
          if (typeof data === 'string') { try { data = JSON.parse(data); } catch(e){} }

          if (data && data.code === 200 && data.artist) {
               artist = {
                   id: String(data.artist.id),
                   name: data.artist.name,
                   coverUrl: data.artist.picUrl ? data.artist.picUrl.replace(/^http:/, 'https:') : '',
                   description: data.artist.briefDesc,
                   songSize: data.artist.musicSize
               };
               if (data.hotSongs) {
                   songs = data.hotSongs.map((item: any) => this.mapNeteaseSong(item));
               }
          }
      } catch(e) { this.log(`Artist Detail Error: ${e}`); }
      return { artist, songs };
  }

  async importNeteasePlaylist(playlistId: string): Promise<Song[]> {
      this.log(`Importing Playlist: ${playlistId}`);
      try {
          const url = `https://music.163.com/api/v3/playlist/detail?id=${playlistId}&n=1000`;
          const response = await CapacitorHttp.post({ 
              url: `https://music.163.com/api/v3/playlist/detail`,
              headers: this.getHeaders(),
              data: `id=${playlistId}&n=1000`
          });
          let data = response.data;
          if (typeof data === 'string') { try { data = JSON.parse(data); } catch(e){} }
          
          if (data && data.playlist && data.playlist.tracks) {
               return data.playlist.tracks.map((item: any) => this.mapNeteaseSong(item));
          }
      } catch(e) { this.log(`Playlist Import Error: ${e}`); }
      return [];
  }

  async getDailyRecommendSongs(): Promise<Song[]> {
      try {
          const url = `https://music.163.com/api/v3/discovery/recommend/songs`;
          const response = await CapacitorHttp.post({ 
              url, 
              headers: this.getHeaders(), 
              data: 'limit=20'
          });
          let data = response.data;
          if (typeof data === 'string') { try { data = JSON.parse(data); } catch(e){} }
          
          if (data && data.code === 200 && data.recommend) {
              return data.recommend.map((item: any) => this.mapNeteaseSong(item));
          }
      } catch(e) { this.log(`Daily Recommend Error: ${e}`); }
      return [];
  }

  // ... (Audio details and Playback Logic kept same but logs added where relevant)
  
  async getSongDetails(song: Song, quality: AudioQuality = 'standard'): Promise<SongPlayDetails> {
      this.log(`Resolving URL for: ${song.title} (${song.source})`);
      
      // 1. If Backend is configured, try it first for Bilibili/YouTube (Crucial for Proxy/Referer)
      if (this.apiBaseUrl && (song.source === MusicSource.BILIBILI || song.source === MusicSource.YOUTUBE)) {
          try {
              const url = `${this.apiBaseUrl}/url?id=${song.id}&source=${song.source}`;
              const res = await CapacitorHttp.get({ url, connectTimeout: 10000 });
              if (res.status === 200 && res.data?.url) {
                  return { url: res.data.url };
              }
          } catch(e) { console.warn("Backend fetch failed", e); }
      }

      // 2. Client Side Fallback
      if (song.source === MusicSource.NETEASE) {
          return this.getNeteaseDetails(song, quality);
      } else if (song.source === MusicSource.YOUTUBE) {
          const url = await this.getYouTubeUrl(song.id);
          return { url };
      } else if (song.source === MusicSource.BILIBILI) {
          const url = await this.getBilibiliUrl(song.id);
          return { url };
      } else if (song.source === MusicSource.PLUGIN && (song as any).pluginId) {
          const plugin = this.plugins.find(p => p.id === (song as any).pluginId);
          if (plugin && plugin.getMediaUrl) {
              const url = await plugin.getMediaUrl(song);
              return { url };
          }
      } else if (song.source === MusicSource.LOCAL && song.audioUrl) {
          return { url: song.audioUrl };
      }
      return { url: '' };
  }

  // ... (Helper methods for download, etc)
  async downloadSongBlob(url: string): Promise<Blob | null> {
    try {
        const response = await CapacitorHttp.get({ url, responseType: 'blob', headers: this.baseHeaders });
        if (response.status === 200 && response.data) return response.data;
    } catch (e) { console.error(e); }
    return null;
  }
  
  async getRealAudioUrl(song: Song): Promise<string> {
      const details = await this.getSongDetails(song);
      return details.url;
  }
  
  async getMvUrl(song: Song): Promise<string | null> {
      if (song.source === MusicSource.YOUTUBE) {
           return this.getYouTubeUrl(song.id);
      } else if (song.source === MusicSource.BILIBILI) {
           return this.getBilibiliUrl(song.id);
      } else if (song.source === MusicSource.NETEASE && song.mvId) {
           try {
              const url = `https://music.163.com/api/mv/detail?id=${song.mvId}&type=mp4`;
              const response = await CapacitorHttp.get({ url, headers: this.getHeaders() });
              let data = response.data;
              if (typeof data === 'string') { try { data = JSON.parse(data); } catch(e) {} }
              if (data && data.data && data.data.brs) {
                  const brs = data.data.brs;
                  const keys = Object.keys(brs).sort((a,b) => Number(b) - Number(a));
                  if (keys.length > 0) return brs[keys[0]];
              }
          } catch(e) {}
      }
      return null;
  }

  // --- Playback Resolvers ---
  private async getNeteaseDetails(song: Song, quality: AudioQuality): Promise<SongPlayDetails> {
      let playUrl = '';
      let lyric = '';
      try {
           const id = song.id;
           let br = 128000;
           let level = 'standard';
           if (quality === 'exhigh') { br = 320000; level = 'exhigh'; }
           if (quality === 'lossless') { br = 999000; level = 'lossless'; }

           const urlApi = `https://music.163.com/api/song/enhance/player/url`;
           const data = `id=${id}&ids=[${id}]&br=${br}&level=${level}`; 
           
           const response = await CapacitorHttp.post({ url: urlApi, headers: this.getHeaders(), data, connectTimeout: this.requestTimeout });
           let resData = response.data;
           if (typeof resData === 'string') { try { resData = JSON.parse(resData); } catch(e) {} }
           const songData = resData?.data?.[0];

           if (response.status === 200 && songData) {
               if (!songData.url || songData.code !== 200 || songData.freeTrialInfo) {
                   throw new Error("VIP_REQUIRED");
               }
               playUrl = songData.url.replace(/^http:/, 'https:');
           }
           
           const lyricApi = `https://music.163.com/api/song/lyric?id=${id}&lv=1&kv=1&tv=-1`;
           const lyricRes = await CapacitorHttp.get({ url: lyricApi, headers: this.getHeaders() });
           let lyricData = lyricRes.data;
           if (typeof lyricData === 'string') { try { lyricData = JSON.parse(lyricData); } catch(e) {} }
           if (lyricData?.lrc?.lyric) lyric = lyricData.lrc.lyric;
      } catch (e: any) { 
          if (e.message === "VIP_REQUIRED") throw e;
          console.error(e); 
      }
      return { url: playUrl, lyric };
  }

  private async getYouTubeUrl(id: string): Promise<string> {
      // Try Piped first
      const piped = this.currentPipedInstance;
      this.log(`Fetching stream from ${piped}`);
      try {
         const res = await CapacitorHttp.get({ url: `${piped}/streams/${id}`, connectTimeout: 5000 });
         let data = res.data;
         if (typeof data === 'string') { try { data = JSON.parse(data); } catch(e) {} }
         if (data && data.audioStreams && data.audioStreams.length > 0) {
             return data.audioStreams[0].url; 
         }
      } catch(e) { this.log(`Piped Stream failed, falling back`); }

      // Fallback Invidious
      const targetHost = this.customInvInstance || this.currentInvInstance;
      try {
          return `${targetHost}/latest_version?id=${id}&itag=18&local=true`;
      } catch (e) {
          this.rotateInstance();
          const backupHost = this.customInvInstance || this.currentInvInstance;
          return `${backupHost}/latest_version?id=${id}&itag=18&local=true`;
      }
  }

  private async getBilibiliUrl(bvid: string): Promise<string> {
      try {
          const viewUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
          const viewRes = await CapacitorHttp.get({ url: viewUrl, headers: this.bilibiliHeaders });
          let cid = '';
          if (viewRes.data?.data?.cid) {
              cid = viewRes.data.data.cid;
          } else {
              return '';
          }
          const playUrl = `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=64&fnval=1&platform=html5&high_quality=1`;
          const playRes = await CapacitorHttp.get({ url: playUrl, headers: this.bilibiliHeaders });
          if (playRes.data?.data?.durl && playRes.data.data.durl.length > 0) {
              return playRes.data.data.durl[0].url;
          }
      } catch(e) { console.error(e); }
      return '';
  }
  
  // Login stubs (keep minimal for brevity)
  async getUserStatus(cookieInput: string): Promise<any> { 
      try {
          let finalCookie = cookieInput.trim();
          const musicUMatch = cookieInput.match(/MUSIC_U=([0-9a-zA-Z]+)/);
          if (musicUMatch) finalCookie = musicUMatch[1]; 
          else if (cookieInput.length > 50 && !cookieInput.includes('=')) finalCookie = cookieInput;
          const testHeader = `os=pc; appver=2.9.7; MUSIC_U=${finalCookie};`;
          const response = await CapacitorHttp.post({
              url: 'https://music.163.com/api/w/nuser/account/get',
              headers: { ...this.baseHeaders, 'Cookie': testHeader },
              connectTimeout: 8000
          });
          let resData = response.data;
          if (typeof resData === 'string') { try { resData = JSON.parse(resData); } catch(e) {} }
          if (resData && resData.code === 200) {
              resData._cleanedCookie = finalCookie;
          }
          return resData;
      } catch(e) { return { code: 500 }; }
  }
  async getLoginKey(): Promise<any> { return { code: 500 }; }
  async createLoginQR(key: string): Promise<any> { return { code: 500 }; }
  async checkLoginQR(key: string): Promise<any> { return { code: 500 }; }
  getPlugins() { return this.plugins; }
  
  async installPluginFromUrl(url: string): Promise<boolean> {
      try {
          const response = await CapacitorHttp.get({ url, connectTimeout: 10000 });
          if (response.status === 200 && response.data) {
             const content = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
             return await this.importPlugin(content);
          }
      } catch(e) { console.error(e); }
      return false;
  }

  async importPlugin(code: string): Promise<boolean> {
      try {
          const module = { exports: {} as any };
          const exports = module.exports;
          const fn = new Function('module', 'exports', code);
          fn(module, exports);
          const plugin = module.exports;
          
          if (plugin && (plugin.platform || plugin.search || plugin.id)) {
               plugin.id = plugin.platform || plugin.name || `plugin-${Date.now()}`;
               const idx = this.plugins.findIndex(p => p.id === plugin.id);
               if (idx > -1) this.plugins[idx] = plugin;
               else this.plugins.push(plugin);
               return true;
          }
      } catch(e) { console.error("Plugin load error", e); }
      return false;
  }

  private rotateInstance() {
      const idx = this.invidiousInstances.indexOf(this.currentInvInstance);
      this.currentInvInstance = this.invidiousInstances[(idx + 1) % this.invidiousInstances.length];
  }
}

export const musicService = new ClientSideService();