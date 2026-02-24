function getVideoId() {
  const match = location.search.match(/[?&]v=([^&]+)/);
  return match ? match[1] : null;
}

function removeExistingMemo() {
  const existing = document.getElementById("yt-memo-box");
  if (existing) existing.remove();
  popupBox = null;
  timeContainer = null;
}

let popupBox = null;
let timeContainer = null;
let shownBase = false;
let activeTimes = {};
let closedByUser = false;
let lastMouse = { x: 20, y: 20 };

function isFullscreenMode() {
  return Boolean(document.fullscreenElement);
}

function getCursorAnchorPosition() {
  const offset = 2;
  const width = 280;
  const height = 220;

  const left = Math.min(lastMouse.x + offset, window.innerWidth - width - 8);
  const top = Math.min(lastMouse.y + offset, window.innerHeight - height - 8);

  return {
    left: Math.max(8, left),
    top: Math.max(8, top)
  };
}

function syncPopupPosition() {
  if (!popupBox) return;
  const { left, top } = getCursorAnchorPosition();
  popupBox.style.left = `${left}px`;
  popupBox.style.top = `${top}px`;
}

function syncPopupVisibilityForFullscreen() {
  if (!popupBox) return;
  popupBox.style.display = isFullscreenMode() ? "none" : "block";
}

function createBasePopup(baseText, titleText = "📌 Saved Memo") {
  removeExistingMemo();

  popupBox = document.createElement("div");
  popupBox.id = "yt-memo-box";

  Object.assign(popupBox.style, {
    position: "fixed",
    background: "#111",
    color: "#fff",
    padding: "12px",
    width: "260px",
    borderRadius: "8px",
    zIndex: "99999",
    boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
    fontSize: "13px",
    pointerEvents: "none"
  });

  const baseContainer = document.createElement("div");
  baseContainer.innerHTML = `
    <div style="font-weight:bold;margin-bottom:6px;">${titleText}</div>
    <div style="margin-bottom:8px;">${baseText}</div>
  `;

  timeContainer = document.createElement("div");
  timeContainer.id = "yt-time-container";
  timeContainer.style.marginTop = "6px";

  popupBox.appendChild(baseContainer);
  popupBox.appendChild(timeContainer);

  document.body.appendChild(popupBox);
  syncPopupPosition();
  syncPopupVisibilityForFullscreen();
}

function showTimeInsidePopup(text) {
  if (!timeContainer) return;

  const item = document.createElement("div");
  item.style.background = "#222";
  item.style.padding = "6px";
  item.style.marginTop = "6px";
  item.style.borderRadius = "4px";
  item.innerText = text;

  timeContainer.appendChild(item);

  setTimeout(() => {
    item.remove();
  }, 3000);
}

function getNormalizedMemos(data) {
  if (!data) return [];
  if (Array.isArray(data.memos)) {
    return data.memos.filter(m => m && typeof m.text === "string").map(m => ({
      time: Number.isFinite(m.time) ? Math.max(0, Math.floor(m.time)) : 0,
      text: m.text
    }));
  }
  if (typeof data === "string" && data.trim()) {
    return [{ time: 0, text: data.trim() }];
  }
  return [];
}

function ensurePopupForMemos(memos) {
  const base = memos.find(m => m.time === 0);
  if (base) {
    shownBase = true;
    createBasePopup(base.text, "📌 Saved Memo");
    return;
  }

  const firstTimeMemo = memos.find(m => m.time > 0);
  if (firstTimeMemo) {
    shownBase = true;
    createBasePopup("기본 메모 없이 시간 메모만 등록된 영상입니다.", "⏱ Time Memo Only");
  }
}

function forceShowMemoPopup(videoId) {
  chrome.storage.local.get([videoId], (result) => {
    const data = result[videoId];
    const memos = getNormalizedMemos(data);
    if (!memos.length) return;

    closedByUser = false;
    ensurePopupForMemos(memos);
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "GET_TIME") {
    const video = document.querySelector("video");
    if (video) {
      sendResponse({ time: video.currentTime });
      return;
    }
    sendResponse({ time: 0 });
    return;
  }

  if (request.type === "SHOW_MEMO_POPUP") {
    const currentId = getVideoId();
    const targetId = request.videoId || currentId;
    if (currentId && targetId && currentId === targetId) {
      forceShowMemoPopup(targetId);
    }
    return;
  }

  if (request.type === "SEEK_TO") {
    const video = document.querySelector("video");
    if (!video) {
      sendResponse({ ok: false });
      return;
    }

    const nextTime = Number.isFinite(request.time) ? Math.max(0, request.time) : 0;
    video.currentTime = nextTime;
    video.play().catch(() => {});
    sendResponse({ ok: true });
  }
});

function checkMemos() {
  const video = document.querySelector("video");
  if (!video) {
    removeExistingMemo();
    return;
  }

  const videoId = getVideoId();
  if (!videoId) {
    removeExistingMemo();
    return;
  }

  chrome.storage.local.get([videoId], (result) => {
    const data = result[videoId];
    const memos = getNormalizedMemos(data);

    if (!memos.length) {
      shownBase = false;
      activeTimes = {};
      removeExistingMemo();
      return;
    }

    if (!shownBase && !closedByUser) {
      ensurePopupForMemos(memos);
    }

    const currentTime = Math.floor(video.currentTime);

    memos.forEach((m, index) => {
      if (m.time > 0) {
        const diff = Math.abs(m.time - currentTime);
        const memoKey = `${m.time}-${index}`;

        if (diff <= 1) {
          if (!activeTimes[memoKey]) {
            if (!popupBox && !closedByUser) {
              ensurePopupForMemos(memos);
            }

            activeTimes[memoKey] = true;
            showTimeInsidePopup(`⏱ ${m.text}`);
          }
        } else {
          activeTimes[memoKey] = false;
        }
      }
    });
  });
}

setInterval(checkMemos, 1000);

let lastUrl = location.href;

new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    shownBase = false;
    activeTimes = {};
    closedByUser = false;
    removeExistingMemo();
    setTimeout(checkMemos, 500);
  }
}).observe(document, { subtree: true, childList: true });

document.addEventListener("mousemove", (event) => {
  lastMouse = { x: event.clientX, y: event.clientY };
  syncPopupPosition();
});

document.addEventListener("fullscreenchange", () => {
  syncPopupVisibilityForFullscreen();
});

checkMemos();
