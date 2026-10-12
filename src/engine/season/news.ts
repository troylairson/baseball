import type { League, NewsItem } from '../model/types';

const MAX_NEWS = 200;

export function addNews(league: League, item: Omit<NewsItem, 'id' | 'date'> & { date?: string }): NewsItem {
  const news: NewsItem = { id: league.nextNewsId ?? 1, date: item.date ?? league.date, ...item };
  league.nextNewsId = news.id + 1;
  league.news = [news, ...(league.news ?? [])].slice(0, MAX_NEWS);
  return news;
}
