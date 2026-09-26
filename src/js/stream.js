/**
 * Сервис поиска аудиопотоков по названию трека.
 * Использует публичные и стабильные инстансы API Invidious (альтернативный плеер).
 */

// Список надежных зеркал Invidious с открытым CORS
const INVIDIOUS_INSTANCES = [
  "https://perennialte.ch",
  "https://melmac.space",
  "https://flokinet.to",
  "https://yewtu.be",
  "https://projectsegfau.lt"
];

export async function fetchAudioStreamUrl(trackTitle) {
  // Формируем поисковый запрос
  const searchQuery = encodeURIComponent(trackTitle);
  
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      console.log(`[Stream] Пробуем найти трек через инстанс: ${instance}`);
      
      // 1. Ищем видео по названию трека
      const searchUrl = `${instance}/api/v1/search?q=${searchQuery}&type=video`;
      const searchResponse = await fetch(searchUrl);
      
      if (!searchResponse.ok) continue;
      const searchData = await searchResponse.json();
      
      // Берем ID самого первого найденного видео результата
      if (!searchData || searchData.length === 0) continue;
      const videoId = searchData[0].videoId;
      
      if (!videoId) continue;
      console.log(`[Stream] Трек найден. ID видео: ${videoId}. Запрашиваем аудиопоток...`);

      // 2. Получаем данные о доступных адаптивных потоках для этого видео
      const videoUrl = `${instance}/api/v1/videos/${videoId}`;
      const videoResponse = await fetch(videoUrl);
      
      if (!videoResponse.ok) continue;
      const videoData = await videoResponse.json();
      
      // 3. Фильтруем и вытягиваем только чистые аудиопотоки
      const adaptiveFormats = videoData.adaptiveFormats || [];
      // Ищем форматы, где есть аудио, но нет видео-картинки (обычно это type: "audio/webm" или "audio/mp4")
      const audioStreams = adaptiveFormats.filter(format => 
        format.type && format.type.startsWith("audio/")
      );
      
      if (audioStreams.length === 0) continue;
      
      // Сортируем аудио по качеству (битрейту) и берем самый лучший
      const bestAudio = audioStreams.sort((a, b) => {
        const bitA = parseInt(a.bitrate || 0, 10);
        const bitB = parseInt(b.bitrate || 0, 10);
        return bitB - bitA;
      })[0];
      
      if (!bestAudio || !bestAudio.url) continue;
      
      // Браузеры иногда требуют абсолютный URL, если инстанс отдал относительный путь
      let finalUrl = bestAudio.url;
      if (finalUrl.startsWith("/")) {
        finalUrl = instance + finalUrl;
      }
      
      console.log(`[Stream] Успешно! Прямая ссылка на аудио получена.`);
      return finalUrl;
      
    } catch (error) {
      console.warn(`[Stream] Ошибка на инстансе ${instance}:`, error.message);
      // Если поймали CORS или 403/404 — цикл автоматически перейдет к следующему серверу в списке
    }
  }
  
  throw new Error("Не удалось получить аудиопоток. Все поисковые сервера вернули ошибку или заблокировали запрос.");
}
