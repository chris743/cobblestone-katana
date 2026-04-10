import {config} from '../../config';
import {fetchWithRetry} from './fetchwithRetry';

export async function fetchAllPages<T>(endpoint: string, limit = 250, extraParams = ''): Promise<T[]> {
  const results: T[] = [];
  let page = 1;

  console.log(`Starting pagination for ${endpoint}`);

  while (true) {
    const separator = endpoint.includes('?') ? '&' : '?';
    const url = `${config.katana.baseUrl}${endpoint}${separator}page=${page}&limit=${limit}${extraParams ? '&' + extraParams : ''}`;

    console.log(`Fetching page ${page}...`);
    const response = await fetchWithRetry(url);

    if (!response.ok) {
      throw new Error(`Katana API error: ${response.status} ${response.statusText}`);
    }

    const json = await response.json() as T[] | { data: T[] };

    // Handle both raw arrays and wrapped { data: [...] } responses
    const data: T[] = Array.isArray(json) ? json : (json.data || []);

    console.log(`Page ${page}: got ${data.length} items`);

    // If no data returned, we've reached the end
    if (data.length === 0) {
      console.log('Empty data, stopping pagination');
      break;
    }

    results.push(...data);
    console.log(`Total so far: ${results.length}`);

    // Check pagination header to determine if there are more pages
    const paginationHeader = response.headers.get('X-Pagination');
    console.log(`Raw pagination header: ${paginationHeader}`);

    if (paginationHeader) {
      const pagination = JSON.parse(paginationHeader);
      console.log(`Parsed pagination: last_page=${pagination.last_page}, page=${pagination.page}, total=${pagination.total}`);
      if (pagination.last_page === true) {
        console.log('last_page is true, stopping pagination');
        break;
      }
    }

    console.log(`Continuing to page ${page + 1}...`);
    page++;
  }

  console.log(`Pagination complete. Total items fetched: ${results.length}`);
  return results;
}
