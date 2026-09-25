import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      // Этот блок перехватывает запросы к /spotify-desktop и перенаправляет их на Spotify
      '/spotify-desktop': {
        target: 'https://spotify.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/spotify-desktop/, ''),
        
        // 1. Подмена заголовков ЗАПРОСА (имитируем десктопный Chrome на Windows)
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            const desktopUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
            proxyReq.setHeader('User-Agent', desktopUA);
            proxyReq.setHeader('sec-ch-ua', '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"');
            proxyReq.setHeader('sec-ch-ua-mobile', '?0');
            proxyReq.setHeader('sec-ch-ua-platform', '"Windows"');
          });

          // 2. Модификация заголовков ОТВЕТА (удаляем защиту от встраивания в iframe)
          proxy.on('proxyRes', (proxyRes, req, res) => {
            delete proxyRes.headers['x-frame-options'];
            delete proxyRes.headers['content-security-policy'];
            proxyRes.headers['Access-Control-Allow-Origin'] = '*';
          });
        },
      },
    },
  },
});