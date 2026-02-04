import React, { useState, useEffect, useRef } from 'react';
import { musicService } from './services/geminiService';
import { Player } from './components/Player';
import { LoginModal } from './components/LoginModal';
import { Toast, ToastType } from './components/Toast';
import { HomeIcon, SearchIcon, LibraryIcon, NeteaseIcon, YouTubeIcon, BilibiliIcon, PlayIcon, LabIcon, PlaylistAddIcon, PluginFileIcon, MoreVerticalIcon, HeartIcon, DownloadIcon, NextPlanIcon, SettingsIcon, FolderIcon, ActivityIcon, TrashIcon, UserCheckIcon, UserPlusIcon, SmartphoneIcon } from './components/Icons';
import { Song, UserProfile, ViewState, MusicSource, Playlist, MusicPlugin, AudioQuality, Artist } from './types';

export default function App() {
  const [view, setView] = useState<ViewState>('HOME');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState<Song[]>([]);
  
  // Audio Quality
  const [quality, setQuality] = useState<AudioQuality>('standard');

  // Search Tabs
  const [activeTab, setActiveTab] = useState<'ALL' | 'NETEASE' | 'BILIBILI' | 'YOUTUBE' | 'PLUGIN'>('ALL');

  // Toast State
  const [toast, setToast] = useState<{msg: string, type: ToastType, show: boolean}>({ msg: '', type: 'info', show: false });

  // Playlists State (Persistence)
  const [playlists, setPlaylists] = useState<Playlist[]>(() => {
      const saved = localStorage.getItem('unistream_playlists');
      return saved ? JSON.parse(saved) : [
          { id: 'fav', name: '我喜欢的音乐', description: '红心收藏', songs: [], isSystem: true, coverUrl: 'https://picsum.photos/300?99' }
      ];
  });
  // Separate state for NetEase Playlists fetched from API
  const [neteasePlaylists, setNeteasePlaylists] = useState<Playlist[]>([]);
  const [activePlaylist, setActivePlaylist] = useState<Playlist | null>(null);

  // Followed Artists State
  const [followedArtists, setFollowedArtists] = useState<Artist[]>(() => {
      const saved = localStorage.getItem('unistream_artists');
      return saved ? JSON.parse(saved) : [];
  });
  const [activeArtist, setActiveArtist] = useState<{info: Artist, songs: Song[]} | null>(null);

  // Persistence Effect
  useEffect(() => {
      localStorage.setItem('unistream_playlists', JSON.stringify(playlists));
      localStorage.setItem('unistream_artists', JSON.stringify(followedArtists));
  }, [playlists, followedArtists]);

  // History State
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
      const saved = localStorage.getItem('unistream_search_history');
      return saved ? JSON.parse(saved) : [];
  });

  const [playHistory, setPlayHistory] = useState<Song[]>(() => {
      const saved = localStorage.getItem('unistream_play_history');
      return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => { localStorage.setItem('unistream_search_history', JSON.stringify(searchHistory)); }, [searchHistory]);
  useEffect(() => { localStorage.setItem('unistream_play_history', JSON.stringify(playHistory)); }, [playHistory]);

  // Plugins State
  const [installedPlugins, setInstalledPlugins] = useState<MusicPlugin[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localFileInputRef = useRef<HTMLInputElement>(null);
  const [pluginLoading, setPluginLoading] = useState(false);
  
  // Latency State
  const [pings, setPings] = useState({ netease: -1, youtube: -1 });
  const [pinging, setPinging] = useState(false);

  // Settings State (Persistence)
  const [settings, setSettings] = useState(() => {
      const savedSettings = localStorage.getItem('unistream_settings');
      const defaults = {
          downloadPath: 'Internal Storage/Music/UniStream',
          customInvidious: '',
          apiBaseUrl: '',
          searchTimeout: 15 
      };
      return savedSettings ? { ...defaults, ...JSON.parse(savedSettings) } : defaults;
  });

  useEffect(() => {
      localStorage.setItem('unistream_settings', JSON.stringify(settings));
      musicService.setCustomInvidiousUrl(settings.customInvidious);
      musicService.setApiBaseUrl(settings.apiBaseUrl);
      musicService.setSearchTimeout((settings.searchTimeout || 15) * 1000);
  }, [settings]);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Song[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Text Import State
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  
  // Netease Playlist Import State
  const [showNeteaseImport, setShowNeteaseImport] = useState(false);
  const [neteaseLink, setNeteaseLink] = useState('');

  // Active Context Menu
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const showToast = (msg: string, type: ToastType = 'info') => {
      setToast({ msg, type, show: true });
  };

  useEffect(() => {
    const savedUser = localStorage.getItem('unistream_user');
    if (savedUser) {
      try {
        const u = JSON.parse(savedUser);
        setUser(u);
        fetchUserResources(u);
      } catch (e) {}
    }
    checkLatency();
  }, []);

  const fetchUserResources = async (u: UserProfile) => {
      if (u.platform === 'netease' && u.id) {
          try {
              const pls = await musicService.getUserPlaylists(u.id);
              setNeteasePlaylists(pls);
          } catch(e) { console.error(e); }
      }
  };

  useEffect(() => {
    const handleClick = () => setOpenMenuId(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const checkLatency = async () => {
      setPinging(true);
      const res = await musicService.getPings();
      setPings(res);
      setPinging(false);
  };

  const handleLoginSuccess = async (loggedInUser: UserProfile) => {
    setUser(loggedInUser);
    localStorage.setItem('unistream_user', JSON.stringify(loggedInUser));
    setShowLogin(false);
    showToast(`欢迎回来, ${loggedInUser.nickname}`, 'success');
    await fetchUserResources(loggedInUser);
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('unistream_user');
    setNeteasePlaylists([]);
    showToast('已退出登录', 'info');
  };

  const addToPlayHistory = (song: Song) => {
      setPlayHistory(prev => {
          const filtered = prev.filter(s => s.id !== song.id);
          return [song, ...filtered].slice(0, 50); // Keep last 50
      });
  };

  const playSong = async (song: Song, newQueue?: Song[]) => {
    setIsPlaying(false);
    setCurrentSong(song);
    addToPlayHistory(song);
    if (newQueue) setQueue(newQueue);

    try {
        const details = await musicService.getSongDetails(song, quality);
        
        if (details.url) {
            const updatedSong: Song = { 
                ...song, 
                audioUrl: details.url, 
                lyric: details.lyric || song.lyric 
            };
            
            setCurrentSong(updatedSong);
            setQueue(prev => prev.map(s => s.id === song.id ? updatedSong : s));
            setIsPlaying(true);
        } else {
             throw new Error("NO_URL");
        }
    } catch (e: any) {
        setIsPlaying(false);
        if (e.message === "VIP_REQUIRED") {
            showToast('VIP 歌曲，无法播放', 'error');
        } else {
            showToast('资源加载失败', 'error');
        }
    }
  };

  // Re-fetch when quality changes
  useEffect(() => {
      if(currentSong && isPlaying) {
          playSong(currentSong);
          showToast(`切换音质: ${quality}`, 'info');
      }
  }, [quality]);

  const togglePlayPause = () => setIsPlaying(!isPlaying);

  const handleNext = () => {
    if (!currentSong) return;
    const currentIndex = queue.findIndex(s => s.id === currentSong.id);
    const nextSong = queue[(currentIndex + 1) % queue.length];
    if (nextSong) playSong(nextSong);
  };

  const handlePrev = () => {
    if (!currentSong) return;
    const currentIndex = queue.findIndex(s => s.id === currentSong.id);
    const prevSong = queue[(currentIndex - 1 + queue.length) % queue.length];
    if (prevSong) playSong(prevSong);
  };

  // UPDATED: System Download
  const handleDownload = async (song: Song) => {
      showToast(`正在解析下载地址: ${song.title}`, 'loading');
      try {
          // Always try 'lossless' to get best possible link
          const details = await musicService.getSongDetails(song, 'lossless');
          if (!details.url) throw new Error("No URL");
          
          showToast('调用系统下载器...', 'success');
          // Use system browser/downloader for best stability
          window.open(details.url, '_system');
      } catch (e) {
          showToast('下载解析失败', 'error');
      }
  };

  const handleToggleLike = (song: Song) => {
      const favList = playlists.find(p => p.id === 'fav');
      if (!favList) return;
      const exists = favList.songs.some(s => s.id === song.id);
      let newSongs;
      if (exists) {
          newSongs = favList.songs.filter(s => s.id !== song.id);
          showToast('已取消收藏', 'info');
      } else {
          newSongs = [song, ...favList.songs];
          showToast('已收藏', 'success');
      }
      setPlaylists(playlists.map(p => p.id === 'fav' ? { ...p, songs: newSongs } : p));
  };

  const handlePlayNext = (song: Song) => {
      if (!currentSong) {
          playSong(song, [song]);
          return;
      }
      const currentIndex = queue.findIndex(s => s.id === currentSong.id);
      if (currentIndex === -1) {
           setQueue([...queue, song]);
      } else {
           const newQueue = [...queue];
           newQueue.splice(currentIndex + 1, 0, song);
           setQueue(newQueue);
      }
      showToast('已添加到下一首', 'success');
  };

  const isLiked = (song: Song | null) => {
      if (!song) return false;
      return playlists.find(p => p.id === 'fav')?.songs.some(s => s.id === song.id) || false;
  };

  // --- Artist Logic ---
  const handleArtistClick = async (artistId: string) => {
      if (!artistId) return;
      showToast('正在获取歌手信息...', 'loading');
      try {
          const { artist, songs } = await musicService.getArtistDetail(artistId);
          setActiveArtist({ info: artist, songs });
          setView('ARTIST_DETAIL');
      } catch (e) {
          showToast('获取歌手信息失败', 'error');
      }
  };
  
  // --- Netease Playlist Click Logic ---
  const handleNeteasePlaylistClick = async (pl: Playlist) => {
      showToast(`正在获取歌单详情: ${pl.name}`, 'loading');
      try {
          // If fetched from user list, it might allow fetching full tracks now
          const songs = await musicService.importNeteasePlaylist(pl.id);
          if (songs.length > 0) {
              const fullPl = { ...pl, songs };
              setActivePlaylist(fullPl);
          } else {
               showToast('歌单为空或获取失败', 'error');
          }
      } catch (e) {
          showToast('歌单获取失败', 'error');
      }
  };
  
  const handleDailyRecommend = async () => {
      if (!user) { setShowLogin(true); return; }
      showToast('正在获取每日推荐...', 'loading');
      const songs = await musicService.getDailyRecommendSongs();
      if (songs.length > 0) {
          const dailyPl: Playlist = {
              id: 'daily-recommend',
              name: '每日推荐',
              description: '根据你的口味生成',
              songs: songs,
              coverUrl: songs[0].coverUrl
          };
          setActivePlaylist(dailyPl);
      } else {
          showToast('获取失败，请确保已登录', 'error');
      }
  };

  const toggleFollowArtist = (artist: Artist) => {
      const exists = followedArtists.some(a => a.id === artist.id);
      if (exists) {
          setFollowedArtists(prev => prev.filter(a => a.id !== artist.id));
          showToast('已取消关注', 'info');
      } else {
          setFollowedArtists(prev => [...prev, artist]);
          showToast('已关注歌手', 'success');
      }
  };

  const isFollowed = (artistId: string) => followedArtists.some(a => a.id === artistId);

  const handleSearch = async (e: React.FormEvent) => {
      e.preventDefault();
      if(!searchQuery.trim()) return;
      
      // Save History
      if(!searchHistory.includes(searchQuery)) {
          setSearchHistory(prev => [searchQuery, ...prev].slice(0, 10));
      }

      setSearchLoading(true);
      const results = await musicService.searchMusic(searchQuery);
      setSearchResults(results);
      setSearchLoading(false);
  };

  // Playlist Import: Text
  const handleTextImport = async () => {
      if (!importText.trim()) return;
      const lines = importText.split('\n').filter(line => line.trim());
      setShowImport(false);
      
      const targetPlaylist = activePlaylist || playlists.find(p => p.id === 'fav');
      if (!targetPlaylist) return;

      showToast(`开始搜索 ${lines.length} 首歌曲...`, 'loading');
      
      let successCount = 0;
      let newSongs = [...targetPlaylist.songs];

      for (const line of lines) {
          const results = await musicService.searchMusic(line.trim());
          if (results.length > 0) {
              const bestMatch = results[0];
              if (!newSongs.some(s => s.id === bestMatch.id)) {
                  newSongs.unshift(bestMatch);
                  successCount++;
              }
          }
      }

      setPlaylists(playlists.map(p => p.id === targetPlaylist.id ? { ...p, songs: newSongs } : p));
      setImportText('');
      showToast(`成功导入 ${successCount} 首歌曲`, 'success');
  };

  // Playlist Import: Netease Link
  const handleNeteaseImport = async () => {
      const match = neteaseLink.match(/id=(\d+)/);
      if (!match) {
          showToast('链接格式错误，未找到 ID', 'error');
          return;
      }
      const playlistId = match[1];
      setShowNeteaseImport(false);
      showToast(`正在提取歌单 ID: ${playlistId}`, 'loading');

      const songs = await musicService.importNeteasePlaylist(playlistId);
      if (songs.length > 0) {
          const newPl: Playlist = {
              id: `pl-${Date.now()}`,
              name: `导入歌单_${playlistId}`,
              songs: songs,
              coverUrl: songs[0].coverUrl
          };
          setPlaylists([...playlists, newPl]);
          showToast(`成功导入 ${songs.length} 首歌曲`, 'success');
      } else {
          showToast('导入失败，可能需要登录或歌单受限', 'error');
      }
      setNeteaseLink('');
  };

  // Local Music Import
  const handleLocalFileClick = () => { localFileInputRef.current?.click(); };
  
  const handleLocalFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      const newSongs: Song[] = [];
      for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const url = URL.createObjectURL(file);
          newSongs.push({
              id: `local-${Date.now()}-${i}`,
              title: file.name.replace(/\.[^/.]+$/, ""),
              artist: '本地音乐',
              album: 'Local',
              coverUrl: 'https://via.placeholder.com/150?text=Local',
              source: MusicSource.LOCAL,
              duration: 0,
              audioUrl: url,
              isGray: false
          });
      }

      const newPl: Playlist = {
          id: `pl-local-${Date.now()}`,
          name: '本地导入',
          songs: newSongs,
          coverUrl: 'https://via.placeholder.com/300/6366f1/ffffff?text=Local'
      };
      setPlaylists([...playlists, newPl]);
      showToast(`已添加 ${newSongs.length} 首本地歌曲`, 'success');
      if (localFileInputRef.current) localFileInputRef.current.value = '';
  };

  const createPlaylist = () => {
      const name = prompt("请输入新歌单名称");
      if (name) {
          const newPl: Playlist = {
              id: `pl-${Date.now()}`,
              name,
              songs: [],
              coverUrl: 'https://picsum.photos/300?random=' + Date.now()
          };
          setPlaylists([...playlists, newPl]);
          showToast('歌单创建成功', 'success');
      }
  };

  const handleImportPluginFileClick = () => { fileInputRef.current?.click(); };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      setPluginLoading(true);
      showToast('正在解析插件...', 'loading');
      
      const reader = new FileReader();
      reader.onload = async (event) => {
          const content = event.target?.result as string;
          if (!content) { setPluginLoading(false); return; }

          try {
              if (file.name.endsWith('.json')) {
                  const json = JSON.parse(content);
                  const list = Array.isArray(json) ? json : (json.plugins || []);
                  let count = 0;
                  for (const p of list) {
                      if (p.url && await musicService.installPluginFromUrl(p.url)) count++;
                  }
                  showToast(`导入 ${count} 个插件`, 'success');
              } else {
                  const success = await musicService.importPlugin(content);
                  success ? showToast('插件加载成功', 'success') : showToast('格式错误', 'error');
              }
              
              const rawPlugins = musicService.getPlugins();
              setInstalledPlugins(rawPlugins.map((p: any) => ({
                  id: p.id,
                  name: p.platform || p.name || 'Unknown Plugin',
                  version: p.version || '1.0',
                  author: p.author || 'Unknown',
                  sources: ['plugin'],
                  status: 'active'
              })));

          } catch (e) {
              showToast('文件解析失败', 'error');
          } finally {
              setPluginLoading(false);
          }
      };
      
      reader.readAsText(file);
      if (fileInputRef.current) fileInputRef.current.value = '';
  };
  
  const handleSaveCustomUrl = () => {
      setSettings(s => ({ ...s, customInvidious: settings.customInvidious }));
      showToast('设置已保存', 'success');
      checkLatency();
  };

  const songItemProps = (song: Song) => ({
      song,
      onClick: () => playSong(song, view === 'SEARCH' ? searchResults : (view === 'LIBRARY' && activePlaylist ? activePlaylist.songs : (view === 'ARTIST_DETAIL' && activeArtist ? activeArtist.songs : queue))),
      isCurrent: currentSong?.id === song.id,
      onToggleLike: () => handleToggleLike(song),
      onDownload: () => handleDownload(song),
      onPlayNext: () => handlePlayNext(song),
      isLiked: isLiked(song),
      isOpenMenu: openMenuId === song.id,
      setOpenMenu: (id: string | null) => setOpenMenuId(id),
      onArtistClick: handleArtistClick
  });

  const getLatencyColor = (ms: number) => {
      if (ms < 0) return 'text-red-500';
      if (ms < 200) return 'text-green-500';
      if (ms < 500) return 'text-yellow-500';
      return 'text-red-400';
  };

  const renderHome = () => (
    <div className="space-y-8 animate-fade-in pb-24">
      <div className="relative h-48 md:h-64 rounded-2xl bg-gradient-to-r from-gray-900 to-primary overflow-hidden flex items-center p-6 shadow-2xl">
        <div className="relative z-10 w-full">
          <h1 className="text-3xl font-bold mb-2">UniStream</h1>
          <p className="text-gray-200 mb-4 max-w-md text-sm md:text-base">
            聚合音乐播放器 V2.4<br/>
            <span className="text-xs opacity-75">智能节点切换 / 底部菜单优化 / 歌单同步</span>
          </p>
          <div className="flex gap-2">
             <div className="text-xs bg-white/20 px-2 py-1 rounded">访客身份已生成</div>
          </div>
        </div>
      </div>

      {/* Daily Recommend Quick Access if logged in */}
      {user && (
          <div onClick={handleDailyRecommend} className="bg-gradient-to-r from-netease to-red-800 p-4 rounded-xl flex items-center justify-between cursor-pointer hover:scale-[1.02] transition-transform">
              <div className="flex items-center gap-4">
                  <div className="bg-white/20 p-3 rounded-full"><NeteaseIcon className="text-white" /></div>
                  <div>
                      <h3 className="font-bold text-lg">每日推荐</h3>
                      <p className="text-xs text-white/70">根据你的音乐口味生成</p>
                  </div>
              </div>
              <PlayIcon fill="white" />
          </div>
      )}

      <div className="bg-dark-light p-4 rounded-xl border border-white/5">
          <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold">最近播放</h3>
              <button onClick={() => setPlayHistory([])} className="text-xs text-gray-500 hover:text-red-400"><TrashIcon size={14} /></button>
          </div>
          {playHistory.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-4">暂无听歌记录</p>
          ) : (
              <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                  {playHistory.map((song, i) => (
                      <div key={i} className="flex-shrink-0 w-24 cursor-pointer group" onClick={() => playSong(song)}>
                          <div className="relative aspect-square rounded-lg overflow-hidden mb-2">
                              <img src={song.coverUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                          </div>
                          <p className="text-xs truncate text-gray-300">{song.title}</p>
                      </div>
                  ))}
              </div>
          )}
      </div>
    </div>
  );

  const renderLibrary = () => (
      <div className="pb-24 animate-fade-in relative">
          {!activePlaylist ? (
              <>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold">我的音乐</h2>
                    <div className="flex gap-2 overflow-x-auto no-scrollbar">
                        <input type="file" ref={localFileInputRef} accept="audio/*" multiple className="hidden" onChange={handleLocalFileChange} />
                        <button onClick={handleLocalFileClick} className="bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 whitespace-nowrap">
                            本地
                        </button>
                        <button onClick={() => setShowNeteaseImport(true)} className="bg-netease/20 hover:bg-netease/30 text-netease px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 whitespace-nowrap">
                            云歌单
                        </button>
                        <button onClick={() => setShowImport(true)} className="bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 whitespace-nowrap">
                            搜歌导入
                        </button>
                        <button onClick={createPlaylist} className="bg-primary/20 hover:bg-primary/30 text-primary px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 whitespace-nowrap">
                            <PlaylistAddIcon className="w-4 h-4" /> 新建
                        </button>
                    </div>
                </div>
                
                {/* User Info Card */}
                <div onClick={() => !user ? setShowLogin(true) : null} className="bg-white/5 p-4 rounded-xl flex items-center gap-4 mb-6 cursor-pointer hover:bg-white/10 transition-colors">
                    <div className="w-16 h-16 rounded-full bg-gray-700 overflow-hidden">
                        {user?.avatarUrl ? <img src={user.avatarUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-400">?</div>}
                    </div>
                    <div>
                        <div className="font-bold text-lg">{user ? user.nickname : '点击登录网易云'}</div>
                        <div className="text-xs text-gray-400">{user ? (user.isVip ? 'VIP用户' : '普通用户') : '游客模式 (随机ID)'}</div>
                    </div>
                    {user && <button onClick={(e) => {e.stopPropagation(); handleLogout();}} className="ml-auto text-xs text-red-400 border border-red-400 px-2 py-1 rounded">退出</button>}
                </div>

                {/* Followed Artists Section */}
                <div className="mb-6">
                    <h3 className="font-bold text-lg mb-3">关注歌手</h3>
                    {followedArtists.length === 0 ? (
                        <p className="text-xs text-gray-500">暂无关注</p>
                    ) : (
                        <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                             {followedArtists.map(artist => (
                                 <div key={artist.id} className="flex-shrink-0 w-20 text-center cursor-pointer" onClick={() => handleArtistClick(artist.id)}>
                                     <img src={artist.coverUrl} className="w-20 h-20 rounded-full object-cover mb-2 border-2 border-transparent hover:border-primary transition-colors" />
                                     <p className="text-xs truncate">{artist.name}</p>
                                 </div>
                             ))}
                        </div>
                    )}
                </div>

                {/* Local & Created Playlists */}
                <h3 className="font-bold text-lg mb-3">我的歌单</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
                    {playlists.map(pl => (
                        <div key={pl.id} onClick={() => setActivePlaylist(pl)} className="group cursor-pointer">
                            <div className="relative aspect-square rounded-xl overflow-hidden mb-2 bg-gray-800 border border-white/5">
                                {pl.coverUrl && <img src={pl.coverUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />}
                                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors" />
                                {pl.id === 'fav' && <div className="absolute top-2 right-2 bg-netease/80 p-1.5 rounded-full"><HeartIcon size={12} fill="white" /></div>}
                            </div>
                            <h3 className="font-bold truncate">{pl.name}</h3>
                            <p className="text-xs text-gray-400">{pl.songs.length} 首歌曲</p>
                        </div>
                    ))}
                </div>

                {/* Netease Fetched Playlists */}
                {neteasePlaylists.length > 0 && (
                    <>
                        <h3 className="font-bold text-lg mb-3 flex items-center gap-2"><NeteaseIcon size={20} /> 网易云歌单</h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {neteasePlaylists.map(pl => (
                                <div key={pl.id} onClick={() => handleNeteasePlaylistClick(pl)} className="group cursor-pointer">
                                    <div className="relative aspect-square rounded-xl overflow-hidden mb-2 bg-gray-800 border border-white/5">
                                        <img src={pl.coverUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors" />
                                    </div>
                                    <h3 className="font-bold truncate">{pl.name}</h3>
                                    <p className="text-xs text-gray-400">云端歌单</p>
                                </div>
                            ))}
                        </div>
                    </>
                )}
              </>
          ) : (
              <div>
                  <button onClick={() => setActivePlaylist(null)} className="text-sm text-gray-400 hover:text-white mb-4 flex items-center gap-1">← 返回</button>
                  <div className="flex items-center gap-6 mb-8">
                      <img src={activePlaylist.coverUrl} className="w-32 h-32 rounded-xl shadow-lg" />
                      <div>
                          <h2 className="text-2xl font-bold mb-2">{activePlaylist.name}</h2>
                          <button onClick={() => { if(activePlaylist.songs.length) playSong(activePlaylist.songs[0], activePlaylist.songs) }} className="bg-primary hover:bg-indigo-600 text-white px-6 py-2 rounded-full flex items-center gap-2">
                                <PlayIcon className="w-4 h-4 fill-current" /> 播放全部
                          </button>
                      </div>
                  </div>
                  <div className="space-y-1">
                      {activePlaylist.songs.map((song, idx) => (
                          <div key={idx} className="flex items-center group p-3 rounded-lg hover:bg-white/5 relative">
                              <span className="text-gray-500 w-8 text-center">{idx + 1}</span>
                              <div className="flex-1 cursor-pointer min-w-0 mr-12" onClick={() => playSong(song, activePlaylist.songs)}>
                                  <div className={`font-medium truncate ${currentSong?.id === song.id ? 'text-primary' : 'text-white'}`}>{song.title}</div>
                                  <div className="text-xs text-gray-400 truncate">{song.artist}</div>
                              </div>
                              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                                 <button onClick={() => setOpenMenuId(song.id)} className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/10">
                                     <MoreVerticalIcon size={18} />
                                 </button>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          )}
          
          {/* Text Import Modal */}
          {showImport && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
                  <div className="bg-dark-light rounded-xl p-6 w-full max-w-md border border-white/10">
                      <h3 className="font-bold text-lg mb-2">批量搜歌导入</h3>
                      <textarea 
                          value={importText}
                          onChange={e => setImportText(e.target.value)}
                          className="w-full h-40 bg-black/30 rounded-lg p-3 text-sm focus:outline-none mb-4"
                          placeholder="在此粘贴歌曲列表..."
                      />
                      <div className="flex justify-end gap-2">
                          <button onClick={() => setShowImport(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white">取消</button>
                          <button onClick={handleTextImport} className="px-4 py-2 bg-primary rounded-lg text-sm text-white">开始导入</button>
                      </div>
                  </div>
              </div>
          )}

          {/* Netease Link Import Modal */}
          {showNeteaseImport && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
                  <div className="bg-dark-light rounded-xl p-6 w-full max-w-md border border-white/10">
                      <h3 className="font-bold text-lg mb-2">导入网易云歌单</h3>
                      <p className="text-xs text-gray-400 mb-4">请粘贴歌单链接 (包含 id=xxxxx)</p>
                      <input 
                          type="text"
                          value={neteaseLink}
                          onChange={e => setNeteaseLink(e.target.value)}
                          className="w-full bg-black/30 rounded-lg p-3 text-sm focus:outline-none mb-4 border border-white/10"
                          placeholder="https://music.163.com/playlist?id=..."
                      />
                      <div className="flex justify-end gap-2">
                          <button onClick={() => setShowNeteaseImport(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white">取消</button>
                          <button onClick={handleNeteaseImport} className="px-4 py-2 bg-netease rounded-lg text-sm text-white">开始解析</button>
                      </div>
                  </div>
              </div>
          )}
      </div>
  );
  
  // New Artist Detail View
  const renderArtistDetail = () => {
      if (!activeArtist) return null;
      const isFollowedArtist = isFollowed(activeArtist.info.id);

      return (
          <div className="pb-24 animate-fade-in">
               <button onClick={() => setView('LIBRARY')} className="text-sm text-gray-400 hover:text-white mb-4 flex items-center gap-1">← 返回我的音乐</button>
               <div className="flex flex-col md:flex-row items-center gap-6 mb-8">
                   <img src={activeArtist.info.coverUrl} className="w-40 h-40 rounded-full object-cover shadow-2xl border-4 border-white/10" />
                   <div className="text-center md:text-left">
                       <h2 className="text-3xl font-bold mb-2">{activeArtist.info.name}</h2>
                       <p className="text-gray-400 text-sm mb-4 line-clamp-3 max-w-lg">{activeArtist.info.description || '暂无简介'}</p>
                       <div className="flex gap-3 justify-center md:justify-start">
                           <button onClick={() => toggleFollowArtist(activeArtist.info)} className={`px-6 py-2 rounded-full text-sm font-bold flex items-center gap-2 transition-colors ${isFollowedArtist ? 'bg-white/10 text-white' : 'bg-netease text-white'}`}>
                               {isFollowedArtist ? <><UserCheckIcon size={16}/> 已关注</> : <><UserPlusIcon size={16}/> 关注</>}
                           </button>
                           <button onClick={() => playSong(activeArtist.songs[0], activeArtist.songs)} className="bg-primary hover:bg-indigo-600 text-white px-6 py-2 rounded-full flex items-center gap-2">
                                <PlayIcon className="w-4 h-4 fill-current" /> 播放热门
                          </button>
                       </div>
                   </div>
               </div>
               
               <h3 className="font-bold text-xl mb-4">热门 50 首</h3>
               <div className="space-y-1">
                   {activeArtist.songs.map((song, idx) => (
                      <div key={idx} className="flex items-center group p-3 rounded-lg hover:bg-white/5 relative">
                          <span className="text-gray-500 w-8 text-center">{idx + 1}</span>
                          <div className="flex-1 cursor-pointer min-w-0 mr-12" onClick={() => playSong(song, activeArtist.songs)}>
                              <div className={`font-medium truncate ${currentSong?.id === song.id ? 'text-primary' : 'text-white'}`}>{song.title}</div>
                              <div className="text-xs text-gray-400 truncate">{song.album}</div>
                          </div>
                          <div className="absolute right-2 top-1/2 -translate-y-1/2">
                             <button onClick={() => setOpenMenuId(song.id)} className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/10">
                                 <MoreVerticalIcon size={18} />
                             </button>
                          </div>
                      </div>
                   ))}
               </div>
          </div>
      );
  };

  const renderSearch = () => {
      // Filter logic
      const filteredResults = searchResults.filter(s => {
          if (activeTab === 'ALL') return true;
          if (activeTab === 'NETEASE') return s.source === MusicSource.NETEASE;
          if (activeTab === 'BILIBILI') return s.source === MusicSource.BILIBILI;
          if (activeTab === 'PLUGIN') return s.source === MusicSource.PLUGIN;
          if (activeTab === 'YOUTUBE') return s.source === MusicSource.YOUTUBE;
          return true;
      });

      return (
      <div className="pb-24 animate-fade-in">
           <form onSubmit={handleSearch} className="mb-4 sticky top-0 bg-dark z-20 py-4 shadow-xl">
                <div className="relative">
                    <SearchIcon className="absolute left-4 top-3.5 text-gray-400 w-5 h-5" />
                    <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="搜索全网音乐..." className="w-full bg-dark-light border border-white/10 rounded-xl py-3 pl-12 pr-4 focus:outline-none focus:border-primary transition-colors"/>
                </div>
           </form>
           
           {/* Search Tabs */}
           {searchResults.length > 0 && (
               <div className="flex items-center gap-2 mb-6 overflow-x-auto no-scrollbar px-1 sticky top-20 bg-dark z-10 py-2">
                    {[
                        { id: 'ALL', label: '全部' },
                        { id: 'NETEASE', label: '网易云' },
                        { id: 'BILIBILI', label: 'Bilibili' },
                        { id: 'YOUTUBE', label: 'YouTube' },
                        { id: 'PLUGIN', label: '扩展插件' }
                    ].map(tab => (
                        <button 
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                                activeTab === tab.id 
                                ? 'bg-primary text-white shadow-lg shadow-primary/30' 
                                : 'bg-white/5 text-gray-400 hover:bg-white/10'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
               </div>
           )}

           {/* Search History */}
           {!searchQuery && searchHistory.length > 0 && (
               <div className="mb-8 animate-fade-in">
                   <div className="flex justify-between items-center mb-3 px-1">
                       <h3 className="text-sm font-bold text-gray-400">历史搜索</h3>
                       <button onClick={() => setSearchHistory([])} className="text-gray-500 hover:text-red-400"><TrashIcon size={14} /></button>
                   </div>
                   <div className="flex flex-wrap gap-2">
                       {searchHistory.map((item, i) => (
                           <span key={i} onClick={() => setSearchQuery(item)} className="px-3 py-1 bg-white/5 hover:bg-white/10 rounded-full text-xs cursor-pointer text-gray-300 transition-colors">
                               {item}
                           </span>
                       ))}
                   </div>
               </div>
           )}
           
           {searchLoading && <div className="flex justify-center py-10"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>}
           
           {!searchLoading && filteredResults.length > 0 && (
               <div className="space-y-2">
                   {filteredResults.map(song => <SongItem key={song.id} {...songItemProps(song)} />)}
               </div>
           )}
           
           {!searchLoading && searchResults.length > 0 && filteredResults.length === 0 && (
               <div className="text-center text-gray-500 py-10">该分区下没有找到结果</div>
           )}
      </div>
      );
  };

  const renderLabs = () => (
      <div className="pb-24 animate-fade-in">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2"><LabIcon className="text-primary" size={28} /> 实验室</h2>
          
          <div className="bg-dark-light p-6 rounded-xl border border-white/5 mb-6">
               <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-lg flex items-center gap-2"><ActivityIcon className="text-blue-400" /> 网络延迟</h3>
                  <button onClick={checkLatency} disabled={pinging} className="text-xs bg-white/10 px-3 py-1 rounded hover:bg-white/20 transition-colors">
                      {pinging ? '检测中...' : '刷新'}
                  </button>
               </div>
               <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                   <div className="bg-black/20 p-4 rounded-lg flex flex-col items-center">
                       <span className="text-xs text-gray-400 mb-1">网易云</span>
                       <span className={`font-mono font-bold ${getLatencyColor(pings.netease)}`}>
                           {pings.netease === -1 ? 'Timeout' : `${pings.netease}ms`}
                       </span>
                   </div>
                   <div className="bg-black/20 p-4 rounded-lg flex flex-col items-center">
                       <span className="text-xs text-gray-400 mb-1">YouTube</span>
                       <span className={`font-mono font-bold ${getLatencyColor(pings.youtube)}`}>
                           {pings.youtube === -1 ? 'Timeout' : `${pings.youtube}ms`}
                       </span>
                   </div>
               </div>
          </div>

          <div className="bg-dark-light p-6 rounded-xl border border-white/5 mb-6">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><PluginFileIcon className="text-green-400" /> 插件管理</h3>
              <p className="text-sm text-gray-400 mb-4">支持导入 .js 插件文件或 .json 插件列表库。</p>
              
              {installedPlugins.length > 0 && (
                  <div className="space-y-2 mb-6 max-h-40 overflow-y-auto custom-scrollbar">
                      {installedPlugins.map(p => (
                          <div key={p.id} className="flex justify-between items-center bg-white/5 p-3 rounded-lg">
                              <div>
                                  <div className="font-bold text-sm">{p.name}</div>
                                  <div className="text-[10px] text-gray-500">{p.version} • {p.author}</div>
                              </div>
                              <div className="text-green-400 text-xs">● Active</div>
                          </div>
                      ))}
                  </div>
              )}

              <div className="flex gap-4">
                  <input type="file" accept=".js,.json" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileChange} />
                  <button onClick={handleImportPluginFileClick} disabled={pluginLoading} className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-sm transition-colors border border-white/10 w-full flex items-center justify-center gap-2">
                      {pluginLoading ? <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin"></div> : '导入插件 (.js / .json)'}
                  </button>
              </div>
          </div>
      </div>
  );

  const renderSettings = () => (
      <div className="pb-24 animate-fade-in">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2"><SettingsIcon className="text-gray-300" size={28} /> 设置</h2>
          <div className="space-y-6">
              <div className="bg-dark-light p-5 rounded-xl border border-white/5">
                  <h3 className="font-bold text-white mb-4 flex items-center gap-2"><SmartphoneIcon className="text-blue-500 w-5 h-5" /> 后端服务 (解决 403)</h3>
                  <div className="space-y-4">
                      <div>
                          <label className="block text-xs text-gray-400 mb-2">API 地址 (Node Server)</label>
                          <div className="flex gap-2">
                            <input 
                                type="text" 
                                placeholder="例如: http://192.168.1.100:3001/api" 
                                value={settings.apiBaseUrl} 
                                onChange={(e) => setSettings(s => ({ ...s, apiBaseUrl: e.target.value }))}
                                className="bg-black/30 w-full p-3 rounded-lg border border-white/10 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
                            />
                            <button onClick={handleSaveCustomUrl} className="bg-white/10 hover:bg-white/20 px-4 rounded-lg text-sm whitespace-nowrap">保存</button>
                          </div>
                          <p className="text-[10px] text-gray-500 mt-2">Bilibili 和 YouTube 播放需要后端支持以代理流量。</p>
                      </div>
                  </div>
              </div>

              <div className="bg-dark-light p-5 rounded-xl border border-white/5">
                  <h3 className="font-bold text-white mb-4 flex items-center gap-2"><YouTubeIcon className="text-red-500 w-5 h-5" /> YouTube 自定义源 (备用)</h3>
                  <div className="space-y-4">
                      <div>
                          <label className="block text-xs text-gray-400 mb-2">Invidious 镜像地址 (带 https://)</label>
                          <div className="flex gap-2">
                            <input 
                                type="text" 
                                placeholder="例如: https://invidious.jing.rocks" 
                                value={settings.customInvidious} 
                                onChange={(e) => setSettings(s => ({ ...s, customInvidious: e.target.value }))}
                                className="bg-black/30 w-full p-3 rounded-lg border border-white/10 text-sm text-gray-300 focus:outline-none focus:border-red-500"
                            />
                            <button onClick={handleSaveCustomUrl} className="bg-white/10 hover:bg-white/20 px-4 rounded-lg text-sm whitespace-nowrap">保存</button>
                          </div>
                      </div>
                  </div>
              </div>

               <div className="bg-dark-light p-5 rounded-xl border border-white/5">
                  <h3 className="font-bold text-white mb-4 flex items-center gap-2"><ActivityIcon className="text-blue-400 w-5 h-5" /> 网络设置</h3>
                  <div className="space-y-4">
                      <div>
                          <label className="block text-xs text-gray-400 mb-2">搜索超时时间 (秒)</label>
                          <input 
                              type="number" 
                              min="5"
                              max="60"
                              value={settings.searchTimeout} 
                              onChange={(e) => setSettings(s => ({ ...s, searchTimeout: parseInt(e.target.value) || 15 }))}
                              className="bg-black/30 w-full p-3 rounded-lg border border-white/10 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
                          />
                          <p className="text-[10px] text-gray-500 mt-2">如果搜索 B站/YouTube 经常失败，请尝试调大此数值 (默认 15秒)。</p>
                      </div>
                  </div>
              </div>
          </div>
      </div>
  );
  
  // Find song details for menu
  const menuSong = openMenuId 
      ? (activePlaylist?.songs.find(s => s.id === openMenuId) || searchResults.find(s => s.id === openMenuId) || playHistory.find(s => s.id === openMenuId) || activeArtist?.songs.find(s => s.id === openMenuId) || queue.find(s => s.id === openMenuId))
      : null;

  return (
    <div className="min-h-screen bg-dark text-white flex flex-col md:flex-row">
      <Toast message={toast.msg} type={toast.type} isVisible={toast.show} onClose={() => setToast(t => ({...t, show: false}))} />
      
      {/* Mobile & Desktop Nav layout remains same */}
      <div className="hidden md:flex flex-col w-64 border-r border-white/5 p-6 bg-dark">
        <div className="flex items-center gap-2 mb-10 text-xl font-bold tracking-tight">
            <div className="w-8 h-8 bg-gradient-to-br from-primary to-purple-600 rounded-lg flex items-center justify-center"><span className="text-white text-xs">U</span></div>
            UniStream
        </div>
        <nav className="space-y-2 flex-1">
          <NavBtn icon={<HomeIcon />} label="首页" active={view === 'HOME'} onClick={() => setView('HOME')} />
          <NavBtn icon={<SearchIcon />} label="搜索" active={view === 'SEARCH'} onClick={() => setView('SEARCH')} />
          <NavBtn icon={<LibraryIcon />} label="我的音乐" active={view === 'LIBRARY'} onClick={() => setView('LIBRARY')} />
          <div className="pt-4 pb-2 text-xs text-gray-500 font-bold px-4">扩展</div>
          <NavBtn icon={<LabIcon />} label="实验室" active={view === 'LABS'} onClick={() => setView('LABS')} />
          <NavBtn icon={<SettingsIcon />} label="设置" active={view === 'SETTINGS'} onClick={() => setView('SETTINGS')} />
        </nav>
      </div>

      <div className="flex-1 h-screen overflow-y-auto no-scrollbar relative">
        <div className="p-4 md:p-8 max-w-5xl mx-auto">
          {view === 'HOME' && renderHome()}
          {view === 'SEARCH' && renderSearch()}
          {view === 'LABS' && renderLabs()}
          {view === 'LIBRARY' && renderLibrary()}
          {view === 'ARTIST_DETAIL' && renderArtistDetail()}
          {view === 'SETTINGS' && renderSettings()}
        </div>
      </div>
      
      {/* Global Song Menu Bottom Sheet */}
      {menuSong && (
          <SongItemMenu 
              song={menuSong} 
              isLiked={isLiked(menuSong)} 
              onToggleLike={() => handleToggleLike(menuSong)}
              onDownload={() => handleDownload(menuSong)}
              onPlayNext={() => handlePlayNext(menuSong)}
              isOpen={!!menuSong}
              setOpen={() => setOpenMenuId(null)}
              onArtistClick={handleArtistClick}
          />
      )}

      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-dark-light/90 backdrop-blur-lg border-t border-white/5 flex justify-around items-center py-3 pb-safe z-50">
          <MobileNavBtn icon={<HomeIcon />} label="首页" active={view === 'HOME'} onClick={() => setView('HOME')} />
          <MobileNavBtn icon={<SearchIcon />} label="搜索" active={view === 'SEARCH'} onClick={() => setView('SEARCH')} />
          <MobileNavBtn icon={<LibraryIcon />} label="我的" active={view === 'LIBRARY'} onClick={() => setView('LIBRARY')} />
          <MobileNavBtn icon={<LabIcon />} label="实验室" active={view === 'LABS'} onClick={() => setView('LABS')} />
          <MobileNavBtn icon={<SettingsIcon />} label="设置" active={view === 'SETTINGS'} onClick={() => setView('SETTINGS')} />
      </div>

      <div className={`transition-all duration-300 ${currentSong ? 'mb-16 md:mb-0' : ''}`}>
         <Player 
            currentSong={currentSong} 
            isPlaying={isPlaying} 
            onPlayPause={togglePlayPause} 
            onNext={handleNext} 
            onPrev={handlePrev} 
            onToggleLike={handleToggleLike} 
            onDownload={handleDownload} 
            isLiked={isLiked(currentSong)} 
            quality={quality}
            setQuality={setQuality}
         />
      </div>

      {showLogin && <LoginModal onLogin={handleLoginSuccess} onClose={() => setShowLogin(false)} />}
    </div>
  );
}

// ... NavBtn, MobileNavBtn, SongItem components
const NavBtn = ({ icon, label, active, onClick }: any) => (
  <button onClick={onClick} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${active ? 'bg-white/10 text-white font-medium' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}>
    {React.cloneElement(icon, { size: 20 })}
    <span>{label}</span>
  </button>
);

const MobileNavBtn = ({ icon, label, active, onClick }: any) => (
    <button onClick={onClick} className={`flex flex-col items-center space-y-1 ${active ? 'text-white' : 'text-gray-500'}`}>
        {React.cloneElement(icon, { size: 20 })}
        <span className="text-[10px]">{label}</span>
    </button>
);

interface SongItemProps {
  song: Song;
  onClick: () => void;
  isCurrent: boolean;
  onToggleLike: () => void;
  onDownload: () => void;
  onPlayNext: () => void;
  isLiked: boolean;
  isOpenMenu: boolean;
  setOpenMenu: (id: string | null) => void;
  onArtistClick: (id: string) => void;
}

const SongItem: React.FC<SongItemProps> = ({ song, onClick, isCurrent, setOpenMenu, onArtistClick }) => (
  <div onClick={onClick} className={`group flex items-center p-3 rounded-xl cursor-pointer transition-colors ${isCurrent ? 'bg-white/10' : 'hover:bg-white/5'}`}>
    <div className="relative w-12 h-12 rounded-lg overflow-hidden mr-4 flex-shrink-0">
      <img src={song.coverUrl} alt={song.title} className={`w-full h-full object-cover ${song.isGray ? 'grayscale opacity-50' : ''}`} />
      <div className={`absolute inset-0 bg-black/40 flex items-center justify-center ${isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          {isCurrent ? <div className="w-3 h-3 bg-white rounded-full animate-pulse"/> : <PlayIcon size={16} className="text-white"/>}
      </div>
    </div>
    <div className="flex-1 min-w-0">
      <h3 className={`font-medium text-sm truncate ${isCurrent ? 'text-primary' : (song.isGray ? 'text-gray-500' : 'text-white')}`}>
          {song.title}
          {song.fee === 1 && <span className="ml-2 text-[9px] bg-netease text-white rounded px-1">VIP</span>}
      </h3>
      <p className="text-xs text-gray-400 truncate flex items-center gap-1">
        {song.source === MusicSource.NETEASE && <span className="text-[9px] px-1 rounded bg-gray-800 text-netease/80">网易云</span>}
        {song.source === MusicSource.BILIBILI && <span className="text-[9px] px-1 rounded bg-pink-500/20 text-pink-400">Bilibili</span>}
        {song.source === MusicSource.YOUTUBE && <span className="text-[9px] px-1 rounded bg-gray-800 text-youtube/80">YouTube</span>}
        {song.source === MusicSource.PLUGIN && <span className="text-[9px] px-1 rounded bg-gray-800 text-primary/80">Plugin</span>}
        {song.source === MusicSource.LOCAL && <span className="text-[9px] px-1 rounded bg-gray-600 text-white/80">本地</span>}
        <span onClick={(e) => {
            if (song.artistId && onArtistClick) {
                e.stopPropagation();
                onArtistClick(song.artistId);
            }
        }} className={song.artistId ? "hover:underline hover:text-white cursor-pointer" : ""}>{song.artist}</span> 
        <span>• {song.album}</span>
      </p>
    </div>
    <div className="flex items-center gap-2 ml-2" onClick={e => e.stopPropagation()}>
         <button onClick={() => setOpenMenu(song.id)} className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/10">
             <MoreVerticalIcon size={18} />
         </button>
    </div>
  </div>
);

// Updated: Bottom Sheet Style Menu
const SongItemMenu = ({ song, isLiked, onToggleLike, onDownload, onPlayNext, isOpen, setOpen, onArtistClick }: any) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[100] flex justify-center items-end md:items-center animate-fade-in">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)}></div>
            
            {/* Menu Content - Bottom Sheet on Mobile, Centered Modal on Desktop */}
            <div className="bg-dark-light w-full md:w-80 rounded-t-2xl md:rounded-2xl border border-white/10 shadow-2xl z-10 p-4 pb-safe animate-slide-up transform transition-transform">
                <div className="flex items-center gap-3 mb-4 pb-4 border-b border-white/5">
                    <img src={song.coverUrl} className="w-12 h-12 rounded-lg bg-gray-800 object-cover" />
                    <div className="flex-1 min-w-0">
                        <h4 className="font-bold truncate text-sm">{song.title}</h4>
                        <p className="text-xs text-gray-400 truncate">{song.artist}</p>
                    </div>
                </div>

                <div className="space-y-1">
                    <button onClick={() => { onPlayNext(); setOpen(false); }} className="w-full text-left px-4 py-3 text-sm hover:bg-white/5 rounded-lg flex items-center gap-3 text-white transition-colors">
                        <NextPlanIcon size={18} /> 下一首播放
                    </button>
                    <button onClick={() => { onToggleLike(); setOpen(false); }} className="w-full text-left px-4 py-3 text-sm hover:bg-white/5 rounded-lg flex items-center gap-3 text-white transition-colors">
                        <HeartIcon size={18} fill={isLiked ? "currentColor" : "none"} className={isLiked ? "text-netease" : ""} /> {isLiked ? "取消收藏" : "收藏"}
                    </button>
                    <button onClick={() => { onDownload(); setOpen(false); }} className="w-full text-left px-4 py-3 text-sm hover:bg-white/5 rounded-lg flex items-center gap-3 text-white transition-colors">
                        <DownloadIcon size={18} /> 下载 (跳转浏览器)
                    </button>
                    {song.artistId && (
                        <button onClick={() => { onArtistClick(song.artistId); setOpen(false); }} className="w-full text-left px-4 py-3 text-sm hover:bg-white/5 rounded-lg flex items-center gap-3 text-white transition-colors">
                            <UserCheckIcon size={18} /> 查看歌手
                        </button>
                    )}
                </div>
                
                <button onClick={() => setOpen(false)} className="w-full mt-4 py-3 text-center text-gray-500 hover:text-white border-t border-white/5 md:hidden">
                    关闭
                </button>
            </div>
        </div>
    );
};