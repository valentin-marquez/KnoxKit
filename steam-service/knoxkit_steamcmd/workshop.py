from dataclasses import dataclass
import json
from typing import List, Optional, Dict, Set
from bs4 import BeautifulSoup, Tag
import logging
import requests
import asyncio
import aiohttp
from pathlib import Path
import time
from datetime import datetime, timedelta
import sqlite3
from functools import lru_cache
from knoxkit_steamcmd.logmanager import LogManager
from .config import ConfigManager

logger = LogManager.get_logger("SteamCMDSetup")

RATE_LIMIT = 20
RATE_LIMIT_WINDOW = 60
MAX_CONCURRENT_REQUESTS = 5


@dataclass
class WorkshopItem:
    id: str
    title: str
    description: str
    authors: List[str]
    image_url: Optional[str]
    url: str
    required_items: List[Dict[str, str]]

    def to_json(self) -> str:
        return json.dumps(self.__dict__, indent=2)


@dataclass
class WorkshopCollection:
    id: str
    title: str
    description: str
    banner_url: str
    items: List[WorkshopItem]

    def to_json(self) -> str:
        collection_dict = {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "banner_url": self.banner_url,
            "items": [item.__dict__ for item in self.items],
        }
        return json.dumps(collection_dict, indent=2)


class Cache:
    def __init__(self):
        logger.info("Initializing workshop cache")
        config = ConfigManager()
        cache_path = Path(config.config_dir) / "workshop_cache.db"
        logger.info(f"Using cache file: {cache_path}")
        self.conn = sqlite3.connect(str(cache_path))
        self.create_tables()

    def create_tables(self):
        logger.debug("Creating/verifying cache tables")
        try:
            self.conn.execute(
                """
                CREATE TABLE IF NOT EXISTS items (
                    id TEXT PRIMARY KEY,
                    data TEXT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """
            )
            self.conn.execute(
                """
                CREATE TABLE IF NOT EXISTS collections (
                    id TEXT PRIMARY KEY,
                    data TEXT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """
            )
            self.conn.commit()
            logger.debug("Cache tables created successfully")
        except sqlite3.Error as e:
            logger.error(f"Error creating cache tables: {e}")
            raise

    def get_item(self, item_id: str) -> Optional[dict]:
        start_time = time.time()
        logger.debug(f"Attempting to retrieve item {item_id} from cache")
        try:
            cursor = self.conn.execute(
                "SELECT data, timestamp FROM items WHERE id = ?", (item_id,)
            )
            result = cursor.fetchone()
            if result:
                data, timestamp = result
                cache_time = datetime.strptime(timestamp, "%Y-%m-%d %H:%M:%S")
                if datetime.now() - cache_time < timedelta(hours=24):
                    logger.debug(f"Cache hit for item {item_id}")
                    return json.loads(data)
                else:
                    logger.debug(f"Cache expired for item {item_id}")
            else:
                logger.debug(f"Cache miss for item {item_id}")
        except Exception as e:
            logger.error(f"Error retrieving item {item_id} from cache: {e}")
        finally:
            logger.debug(f"Cache lookup took {time.time() - start_time:.2f} seconds")
        return None

    def set_item(self, item_id: str, data: dict):
        start_time = time.time()
        logger.debug(f"Attempting to cache item {item_id}")
        try:
            self.conn.execute(
                "INSERT OR REPLACE INTO items (id, data) VALUES (?, ?)",
                (item_id, json.dumps(data)),
            )
            self.conn.commit()
            logger.debug(f"Successfully cached item {item_id}")
        except Exception as e:
            logger.error(f"Error caching item {item_id}: {e}")
        finally:
            logger.debug(
                f"Caching operation took {time.time() - start_time:.2f} seconds"
            )


class RateLimiter:
    def __init__(self, rate_limit: int, window: int):
        logger.info(
            f"Initializing rate limiter: {rate_limit} requests per {window} seconds"
        )
        self.rate_limit = rate_limit
        self.window = window
        self.requests = []
        self.semaphore = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)

    async def acquire(self):
        start_time = time.time()
        logger.debug("Attempting to acquire rate limit slot")
        now = time.time()
        self.requests = [req for req in self.requests if now - req < self.window]

        if len(self.requests) >= self.rate_limit:
            sleep_time = self.requests[0] + self.window - now
            if sleep_time > 0:
                logger.debug(
                    f"Rate limit reached, sleeping for {sleep_time:.2f} seconds"
                )
                await asyncio.sleep(sleep_time)

        self.requests.append(now)
        await self.semaphore.acquire()
        logger.debug(
            f"Rate limit slot acquired after {time.time() - start_time:.2f} seconds"
        )

    def release(self):
        logger.debug("Releasing rate limit slot")
        self.semaphore.release()


class WorkshopScraper:
    def __init__(self):
        logger.info("Initializing WorkshopScraper")
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        self.base_url = "https://steamcommunity.com/sharedfiles/filedetails/?id={0}"
        self.cache = Cache()
        self.rate_limiter = RateLimiter(RATE_LIMIT, RATE_LIMIT_WINDOW)
        self.processed_items: Set[str] = set()

    async def fetch_url(self, session: aiohttp.ClientSession, url: str) -> str:
        start_time = time.time()
        logger.debug(f"Fetching URL: {url}")
        await self.rate_limiter.acquire()
        try:
            async with session.get(url, headers=self.headers) as response:
                content = await response.text()
                logger.debug(
                    f"URL fetch completed in {time.time() - start_time:.2f} seconds"
                )
                return content
        except Exception as e:
            logger.error(f"Error fetching URL {url}: {e}")
            raise
        finally:
            self.rate_limiter.release()

    @lru_cache(maxsize=100)
    def parse_item_html(self, html: str) -> Optional[dict]:
        start_time = time.time()
        logger.debug("Parsing item HTML")
        try:
            soup = BeautifulSoup(html, "html.parser")

            description = soup.find("div", class_="workshopItemDescription")
            description_text = description.text.strip() if description else ""

            title = soup.find("div", class_="workshopItemTitle")
            title_text = title.text.strip() if title else ""

            authors = []
            creators_block = soup.find("div", class_="creatorsBlock")
            if creators_block and isinstance(creators_block, Tag):
                for block in creators_block.find_all("div", class_="friendBlock"):
                    author = block.find("div", class_="friendBlockContent")
                    if author and author.contents:
                        authors.append(str(author.contents[0]).strip())

            image_link = soup.find("link", rel="image_src")
            image_url = image_link.get("href") if isinstance(image_link, Tag) else None

            required_items = []
            container = soup.find("div", class_="requiredItemsContainer")
            if container and isinstance(container, Tag):
                for item in container.find_all("a"):
                    href = item.get("href", "")
                    item_id = href.split("=")[-1] if href else ""
                    required_item_div = item.find("div", class_="requiredItem")
                    if required_item_div:
                        title = required_item_div.text.strip()
                        required_items.append({"id": item_id, "title": title})

            logger.debug(
                f"HTML parsing completed in {time.time() - start_time:.2f} seconds"
            )
            return {
                "title": title_text,
                "description": description_text,
                "authors": authors,
                "image_url": image_url,
                "required_items": required_items,
            }
        except Exception as e:
            logger.error(f"Error parsing item HTML: {e}")
            return None

    async def get_item_info(
        self, session: aiohttp.ClientSession, item_id: str
    ) -> Optional[WorkshopItem]:
        start_time = time.time()
        logger.info(f"Getting info for item {item_id}")

        cached_item = self.cache.get_item(item_id)
        if cached_item:
            logger.debug(f"Retrieved item {item_id} from cache")
            return WorkshopItem(
                id=item_id, url=self.base_url.format(item_id), **cached_item
            )

        try:
            html = await self.fetch_url(session, self.base_url.format(item_id))
            parsed_data = self.parse_item_html(html)

            if parsed_data:
                self.cache.set_item(item_id, parsed_data)
                logger.info(
                    f"Successfully processed item {item_id} in {time.time() - start_time:.2f} seconds"
                )
                return WorkshopItem(
                    id=item_id, url=self.base_url.format(item_id), **parsed_data
                )

        except Exception as e:
            logger.error(f"Error fetching workshop item {item_id}: {e}")

        return None

    async def process_item_recursively(
        self, session: aiohttp.ClientSession, item_id: str
    ) -> Optional[WorkshopItem]:
        if item_id in self.processed_items:
            return None

        self.processed_items.add(item_id)
        cached = self.cache.get_item(item_id)

        if cached:
            return WorkshopItem(id=item_id, url=self.base_url.format(item_id), **cached)

        item = await self.get_item_info(session, item_id)
        if not item:
            return None

        # Process dependencies in parallel
        if item.required_items:
            tasks = [
                self.process_item_recursively(session, req["id"])
                for req in item.required_items
                if req["id"] not in self.processed_items
            ]
            await asyncio.gather(*tasks)

        return item

    async def get_collection_info(
        self, collection_id: str
    ) -> Optional[WorkshopCollection]:
        start_time = time.time()
        logger.info(f"Getting info for collection {collection_id}")
        try:
            async with aiohttp.ClientSession() as session:
                html = await self.fetch_url(
                    session, self.base_url.format(collection_id)
                )
                soup = BeautifulSoup(html, "html.parser")

                title = soup.find("div", class_="workshopItemTitle")
                title_text = title.text.strip() if title else ""
                logger.debug(f"Collection title: {title_text}")

                description = soup.find("div", class_="workshopItemDescription")
                description_text = description.text.strip() if description else ""

                banner = soup.find("img", class_="collectionBackgroundImage")
                banner_url = banner.get("src") if isinstance(banner, Tag) else ""

                collection_items = []
                scripts = soup.find_all("script")
                for script in scripts:
                    if script.string and "SharedFileBindMouseHover" in script.string:
                        start = script.string.find("{")
                        end = script.string.rfind("}") + 1
                        if start > -1 and end > 0:
                            try:
                                item_data = json.loads(script.string[start:end])
                                collection_items.append(
                                    {"id": item_data["id"], "title": item_data["title"]}
                                )
                            except json.JSONDecodeError:
                                continue

                logger.info(f"Found {len(collection_items)} items in collection")

                tasks = [
                    self.process_item_recursively(session, item["id"])
                    for item in collection_items
                ]
                workshop_items = [
                    item for item in await asyncio.gather(*tasks) if item is not None
                ]

                logger.info(
                    f"Successfully processed collection {collection_id} in {time.time() - start_time:.2f} seconds"
                )
                return WorkshopCollection(
                    id=collection_id,
                    title=title_text,
                    description=description_text,
                    banner_url=banner_url if isinstance(banner_url, str) else "",
                    items=workshop_items,
                )

        except Exception as e:
            logger.error(f"Error fetching workshop collection {collection_id}: {e}")
            return None


async def main():
    logger.info("Starting workshop scraper")
    start_time = time.time()

    scraper = WorkshopScraper()
    collection = await scraper.get_collection_info("3342061277")

    if collection:
        logger.info(f"Collection: {collection.title}")
        logger.info(f"Total items (including dependencies): {len(collection.items)}")
        logger.debug(collection.to_json())

    total_time = time.time() - start_time
    logger.info(f"Script completed in {total_time:.2f} seconds")


if __name__ == "__main__":
    asyncio.run(main())
