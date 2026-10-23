const axios = require("axios");
const cheerio = require("cheerio");

const BASE_URL = "https://steamrip.com";
const REQUEST_CONFIG = {
  timeout: 15000,
  headers: {
    "User-Agent": "SilverSea/0.1",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  },
};

async function fetchHtml(url) {
  try {
    const { data } = await axios.get(url, REQUEST_CONFIG);
    if (typeof data !== "string" || !data.includes("<")) throw new Error("The source returned a non-HTML response.");
    return data;
  } catch (error) {
    const status = error.response?.status;
    if (status === 403) throw new Error("SteamRIP returned HTTP 403 (access denied). The source is blocking this request; try again later or switch sources.");
    throw new Error(`SteamRIP request failed: ${status ? `HTTP ${status}` : error.message}`);
  }
}

module.exports = {
  name: "SteamRIP",
  categories: [
    "action",
    "adventure",
    "anime",
    "horror",
    "indie",
    "multiplayer",
    "open-world",
    "racing",
    "shooting",
    "simulation",
    "sports",
    "strategy",
    "vr",
  ],
  capabilities: {
    hasCategoryPagination: true,
    hasSearchPagination: true,
  },

  _cleanName(name) {
    return name.includes(":")
      ? name.split(":")[0]
      : name.split("Free Download")[0];
  },
  async get_homepage_games() {
    const data = await fetchHtml(BASE_URL);
    const $ = cheerio.load(data);
    const results = [];

    const posts = $("li.post").toArray();
    for (const post of posts) {
      const titleTag = $(post).find("h2.post-title a");
      if (!titleTag.length) continue;

      const name = titleTag.text().trim();
      const game_page_link = BASE_URL + "/" + titleTag.attr("href");
      const img = $(post).find("a.post-thumb img");
      const thumbnail_link =
        img.attr("data-src-webp") || img.attr("data-src") || img.attr("src");

      const classes = $(post).attr("class")
        ? $(post).attr("class").split(" ")
        : [];
      const categories = classes
        .filter((c) => c.startsWith("category-"))
        .map((c) => c.replace("category-", ""));

      results.push({
        name: this._cleanName(name),
        thumbnail_link,
        categories,
        url: game_page_link,
        download_links: [],
      });
    }
    return results;
  },

  async search_games(query, page_number = 1) {
    const formattedQuery = query.replace(/ /g, "+");
    const url =
      page_number === 1
        ? `${BASE_URL}/?s=${formattedQuery}`
        : `${BASE_URL}/page/${page_number}/?s=${formattedQuery}`;
    return this._scrapeSlideGrid(url, []);
  },

  async get_games_by_category(category, page_number = 1) {
    const url =
      page_number === 1
        ? `${BASE_URL}/category/${category}/`
        : `${BASE_URL}/category/${category}/page/${page_number}/`;
    return this._scrapeSlideGrid(url, [category]);
  },

  async _scrapeSlideGrid(url, defaultCategories) {
    try {
      const data = await fetchHtml(url);
      const $ = cheerio.load(data);
      const results = [];

      const games = $("div.slide").toArray();
      for (const game of games) {
        const titleTag = $(game).find("h2.thumb-title a");
        if (!titleTag.length) continue;

        const name = titleTag.text().trim();
        const link = BASE_URL + "/" + titleTag.attr("href");
        const thumbnail =
          $(game).attr("data-back-webp") || $(game).attr("data-back");

        results.push({
          name: this._cleanName(name),
          thumbnail_link: thumbnail,
          categories: defaultCategories,
          url: link,
          download_links: [],
        });
      }
      return results;
    } catch (e) {
      console.error(`[SteamRIP] Could not load ${url}:`, e.message);
      throw e;
    }
  },

  async get_game_details(url) {
    try {
      const html = await fetchHtml(url);
      const $ = cheerio.load(html);
      const download_links = [];

      $("a").each((_, el) => {
        if ($(el).text().trim() === "DOWNLOAD HERE") {
          let dl = $(el).attr("href");
          if (dl.startsWith("//")) dl = "https:" + dl;
          download_links.push(dl);
        }
      });
      return { download_links };
    } catch (err) {
      return { download_links: [] };
    }
  },
};
