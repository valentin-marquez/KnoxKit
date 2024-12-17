from typing import TypedDict, Dict, List, Optional
from dataclasses import dataclass
from enum import Enum


class SetupStatus(Enum):
    PENDING = "pending"
    DOWNLOADING = "downloading"
    EXTRACTING = "extracting"
    INITIALIZING = "initializing"
    COMPLETED = "completed"
    FAILED = "failed"


class DownloadStatus(Enum):
    PENDING = "pending"
    DOWNLOADING = "downloading"
    COMPLETED = "completed"
    FAILED = "failed"


class WorkshopItemInfo(TypedDict):
    id: str
    title: str
    description: str
    authors: List[str]
    image_url: Optional[str]
    url: str
    required_items: List[Dict[str, str]]


class WorkshopItemResult(TypedDict):
    success: bool
    path: str
    size: int
    status: str
    error: Optional[str]
    info: Optional[WorkshopItemInfo]


class DownloadProgress(TypedDict):
    workshop_id: int
    status: str
    progress: int
    total_size: int


class BatchDownloadResult(TypedDict):
    items: Dict[int, WorkshopItemResult]
    total: int
    completed: int
    failed: int


@dataclass
class DownloadRequest:
    type: str
    app_id: int
    workshop_ids: List[int]
    destination: Optional[str] = None
