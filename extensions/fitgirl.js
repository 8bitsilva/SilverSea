const axios = require("axios");
const cheerio = require("cheerio");

const BASE_URL = "https://fitgirl-repacks.site";
const REQUEST_CONFIG = {
  timeout: 15000,
  headers: {
    "User-Agent": "SilverSea/0.1",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  },
};
const INDEX_PAGE_SIZE = 24;
let alphabeticalIndex = null;
let alphabeticalIndexLoadedAt = 0;

// The alphabetical search index uses FitGirl's paginated A–Z listing.
async function fetchHtml(url) {
  const { data } = await axios.get(url, REQUEST_CONFIG);
  if (typeof data !== "string" || !data.includes("<")) {
    throw new Error("The source returned a non-HTML response.");
  }
  return data;
}

function parseIndexPage(html) {
  const $ = cheerio.load(html);
  return $("#lcp_instance_0").children().toArray().flatMap((item) => {
    const link = $(item).find("a").first();
    const name = link.text().trim();
    const url = link.attr("href");
    return name && url ? [{ name: name.split(" – ")[0].trim(), url }] : [];
  });
}

async function getAlphabeticalIndex() {
  const cacheAge = Date.now() - alphabeticalIndexLoadedAt;
  if (alphabeticalIndex && cacheAge < 4 * 60 * 60 * 1000) return alphabeticalIndex;

  const firstPage = await fetchHtml(`${BASE_URL}/all-my-repacks-a-z/`);
  const pageNumbers = [...firstPage.matchAll(/lcp_page0=(\d+)#/g)].map((match) => Number(match[1]));
  const pageCount = Math.max(1, ...pageNumbers);
  if (!pageNumbers.length) {
    throw new Error("FitGirl's A–Z index did not include its pagination data.");
  }

  const pages = [];
  // Keep requests modest; this is a normal index crawl and never bypasses site controls.
  for (let page = 1; page <= pageCount; page += 4) {
    const batch = Array.from({ length: Math.min(4, pageCount - page + 1) }, (_, offset) => page + offset);
    pages.push(...(await Promise.all(batch.map(async (number) => {
      const html = number === 1
        ? firstPage
        : await fetchHtml(`${BASE_URL}/all-my-repacks-a-z/?lcp_page0=${number}`);
      return parseIndexPage(html);
    }))));
  }

  alphabeticalIndex = [...new Map(pages.flat().map((game) => [game.url, game])).values()];
  alphabeticalIndexLoadedAt = Date.now();
  if (!alphabeticalIndex.length) {
    throw new Error("FitGirl's A–Z index loaded, but no game entries were found.");
  }
  return alphabeticalIndex;
}

async function getCategoryIndex(categoryPath) {
  const firstPage = await fetchHtml(`${BASE_URL}/${categoryPath}/`);
  const pageNumbers = [...firstPage.matchAll(/lcp_page0=(\d+)#/g)].map((match) => Number(match[1]));
  const pageCount = Math.max(1, ...pageNumbers);
  const pages = [];
  for (let page = 1; page <= pageCount; page += 4) {
    const batch = Array.from({ length: Math.min(4, pageCount - page + 1) }, (_, offset) => page + offset);
    pages.push(...(await Promise.all(batch.map(async (number) => {
      const html = number === 1
        ? firstPage
        : await fetchHtml(`${BASE_URL}/${categoryPath}/?lcp_page0=${number}`);
      return parseIndexPage(html);
    }))));
  }
  return [...new Map(pages.flat().map((game) => [game.url, game])).values()];
}

module.exports = {
  name: "FitGirl",
  categories: [
    "Top 50 Repacks",
    "Top 150 Repacks",
    "Pink Paw Award",
    "Hypervisor Bypass",
    "Switch Emulated",
    "All Repacks",
  ],
  capabilities: {
    hasCategoryPagination: true,
    hasSearchPagination: true,
    hasStreaming: true,
  },

  async get_homepage_games(page_number = 1, onGameFound) {
    if (typeof page_number === "function") {
      onGameFound = page_number;
      page_number = 1;
    }
    if (onGameFound) {
      const seen = new Set();
      let count = 0;
      for (let firstPage = 1; firstPage <= 4 && count < 40; firstPage += 2) {
        const pageNumbers = [firstPage, firstPage + 1].filter((page) => page <= 4);
        const pages = await Promise.allSettled(pageNumbers.map((page) => this._scrapeWordPressLoop(
          page === 1 ? BASE_URL : `${BASE_URL}/page/${page}/`,
        )));
        if (firstPage === 1 && pages[0].status === "rejected") throw pages[0].reason;
        for (const result of pages) {
          if (result.status !== "fulfilled") continue;
          for (const game of result.value) {
            const key = game.url || game.name.toLocaleLowerCase();
            if (seen.has(key) || !/^https?:\/\//i.test(game.thumbnail_link || "")) continue;
            if (/^(upcoming repacks|updates digest|news|site updates?)(?:\b|\s|:)/i.test(game.name.trim())) continue;
            seen.add(key);
            onGameFound(game);
            count++;
          }
        }
      }
      return [];
    }
    const url =
      page_number === 1 ? BASE_URL : `${BASE_URL}/page/${page_number}/`;
    return this._scrapeWordPressLoop(url, onGameFound);
  },

  async search_games(query, page_number = 1, onGameFound) {
    if (typeof page_number === "function") {
      onGameFound = page_number;
      page_number = 1;
    }
    const needle = query.trim().toLocaleLowerCase();
    const matches = (await getAlphabeticalIndex())
      .filter((game) => game.name.toLocaleLowerCase().includes(needle));
    const start = (page_number - 1) * INDEX_PAGE_SIZE;
    const results = matches.slice(start, start + INDEX_PAGE_SIZE).map((game) => ({
      name: game.name,
      thumbnail_link: "",
      url: game.url,
      release_date: "",
      download_links: [],
    }));
    for (const game of results) onGameFound ? onGameFound(game) : null;
    return onGameFound ? [] : results;
  },

  async get_games_by_category(category, page_number = 1, onGameFound) {
    if (typeof page_number === "function") {
      onGameFound = page_number;
      page_number = 1;
    }
    if (category === "All Repacks") {
      const index = await getAlphabeticalIndex();
      const start = (page_number - 1) * INDEX_PAGE_SIZE;
      const results = index.slice(start, start + INDEX_PAGE_SIZE).map((game) => ({
        name: game.name,
        thumbnail_link: "",
        url: game.url,
        release_date: "",
        download_links: [],
      }));
      for (const game of results) onGameFound ? onGameFound(game) : null;
      return onGameFound ? [] : results;
    }

    let categoryPath = "";
    switch (category) {
      case "Top 50 Repacks":
        categoryPath = "pop-repacks";
        break;
      case "Top 150 Repacks":
        categoryPath = "popular-repacks-of-the-year";
        break;
      case "Pink Paw Award":
        categoryPath = "games-with-my-personal-pink-paw-award";
        break;
      case "Hypervisor Bypass":
        categoryPath = "all-hypervisor-bypassed-repacks-a-z";
        break;
      case "Switch Emulated":
        categoryPath = "all-switch-emulated-repacks-a-z";
        break;
      case "All Repacks":
        categoryPath = "all-my-repacks-a-z";
        break;
      default:
        categoryPath = "all-my-repacks-a-z";
    }

    if (category === "Hypervisor Bypass" || category === "Switch Emulated") {
      const index = await getCategoryIndex(categoryPath);
      const start = (page_number - 1) * INDEX_PAGE_SIZE;
      const results = index.slice(start, start + INDEX_PAGE_SIZE).map((game) => ({
        name: game.name,
        thumbnail_link: "",
        url: game.url,
        release_date: "",
        download_links: [],
      }));
      for (const game of results) onGameFound ? onGameFound(game) : null;
      return onGameFound ? [] : results;
    }

    const url =
      page_number === 1
        ? `${BASE_URL}/${categoryPath}/`
        : `${BASE_URL}/${categoryPath}/page/${page_number}/`;

    return this._scrapeWordPressLoop(url, onGameFound);
  },

  _cleanName(name) {
    return name.includes(" – ") ? name.split(" – ")[0] : name;
  },

  async _scrapeWordPressLoop(url, onGameFound) {
    try {
      const data = await fetchHtml(url);
      const $ = cheerio.load(data);
      const results = [];

      const articles = $("article").toArray();
      const found = new Set();
      const addGame = (name, link, thumbnail, dateStr = "") => {
        if (!name || !link || found.has(link)) return;
        found.add(link);
        const parsed = dateStr ? new Date(dateStr) : null;
        const game = {
          name: this._cleanName(name.trim()),
          thumbnail_link: thumbnail || "",
          url: link,
          release_date: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : "",
          download_links: [],
        };
        if (onGameFound) onGameFound(game);
        else results.push(game);
      };

      for (const article of articles) {
        const root = $(article);
        const titleTag = root.find("h1.entry-title a, h2.entry-title a, .entry-title a").first();
        if (titleTag.length) {
          const imgTag = root.find(".entry-content p img").first();
          const timeTag = root.find("time.entry-date").first();
          addGame(
            titleTag.text(),
            titleTag.attr("href"),
            imgTag.attr("src") || imgTag.attr("data-src"),
            timeTag.attr("datetime") || timeTag.text().trim(),
          );
        }

        // Current FitGirl ranking pages use a Jetpack image grid instead of post-title headings.
        root.find(".widget-grid-view-image a[title]").each((_, item) => {
          const link = $(item);
          const image = link.find("img").first();
          addGame(
            link.attr("title"),
            link.attr("href"),
            image.attr("src") || image.attr("data-src"),
          );
        });
      }
      return results;
    } catch (e) {
      console.error(`[FitGirl] Could not load ${url}:`, e.message);
      throw new Error(`FitGirl request failed: ${e.response?.status ? `HTTP ${e.response.status}` : e.message}`);
    }
  },

  async _scrapeSearchLoop(url, onGameFound) {
    return this._scrapeWordPressLoop(url, onGameFound);
  },

  async get_game_details(url) {
    try {
      const html = await fetchHtml(url);
      const $ = cheerio.load(html);

      const titleTag = $("h1.entry-title");
      const name = titleTag.text().trim();

      const content = $("article .entry-content, .entry-content").first();
      const imageUrl = (image) => image.attr("data-orig-file")
        || image.attr("data-large-file")
        || image.attr("data-lazy-src")
        || image.attr("data-src")
        || image.attr("src")
        || "";
      const normalizeImage = (src) => src
        .replace(/^http:\/\//i, "https://")
        .replace(/\.240p(\.[a-z0-9]+)$/i, "");
      const screenshotHeading = content.find("h1, h2, h3")
        .filter((_, el) => /screenshots/i.test($(el).text()))
        .first();
      const screenshotElements = [];
      if (screenshotHeading.length) {
        let sibling = screenshotHeading.next();
        while (sibling.length && !/^h[1-3]$/i.test(sibling.prop("tagName") || "")) {
          screenshotElements.push(...sibling.find("img").toArray());
          sibling = sibling.next();
        }
      }
      const screenshotImages = [...new Set(screenshotElements.map((el) => normalizeImage(imageUrl($(el))))
        .filter((src) => /^https?:\/\//i.test(src))
        .filter((src) => !/gravatar|emoji|logo|avatar|torrent-stats|\.gif(?:$|\?)/i.test(src)))];
      const coverImage = normalizeImage(imageUrl(content.find("img").first()));
      const images = screenshotImages.length ? screenshotImages : [...new Set(content.find("img").toArray().map((el) => normalizeImage(imageUrl($(el))))
        .filter((src) => /^https?:\/\//i.test(src))
        .filter((src) => !/gravatar|emoji|logo|avatar|torrent-stats|\.gif(?:$|\?)/i.test(src)))];
      const thumbnail = /^https?:\/\//i.test(coverImage) && !/torrent-stats|gravatar|emoji|logo|avatar|\.gif(?:$|\?)/i.test(coverImage)
        ? coverImage
        : images[0] || "";

      const origMatch = html.match(
        /Original Size:\s*<strong>([^<]+)<\/strong>/i,
      );
      const repackMatch = html.match(
        /Repack Size:\s*<strong>([^<]+)<\/strong>/i,
      );
      let size = "";
      if (origMatch && repackMatch)
        size = `${origMatch[1].trim()} (Real) / ${repackMatch[1].trim()} (Compressed)`;

      let tag = "";
      if (
        $("span").filter((_, el) => $(el).text().includes("HYPERVISOR"))
          .length > 0
      )
        tag = "HYPERVISOR";

      const download_links = [];

      const seenTorrents = new Set();
      $("a[href^='magnet:']").each((_, el) => {
        const link = $(el).attr("href");
        const infoHash = link?.match(/btih:([^&]+)/i)?.[1]?.toLowerCase();
        const key = infoHash || link;
        if (link && !seenTorrents.has(key)) {
          seenTorrents.add(key);
          download_links.push(link);
        }
      });

      return {
        name: this._cleanName(name),
        thumbnail_link: thumbnail,
        images,
        size,
        tag,
        download_links,
      };
    } catch (e) {
      console.error(`[FitGirl] Could not load details for ${url}:`, e.message);
      return null;
    }
  },
};
