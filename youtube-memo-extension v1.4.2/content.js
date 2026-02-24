function getVideoId() {
  const match = location.search.match(/[?&]v=([^&]+)/);
  return match ? match[1] : null;
}

function removeExistingMemo() {
  const existing = document.getElementById("yt-memo-box");
  if (existing) existing.remove();
}

let popupBox = null;
let timeContainer = null;
let shownBase = false;
let activeTimes = {};
let closedByUser = false;

function createBasePopup(baseText) {
  removeExistingMemo();

  popupBox = document.createElement("div");
  popupBox.id = "yt-memo-box";

  Object.assign(popupBox.style, {
    position: "fixed",
    top: "80px",
    right: "20px",
    background: "#111",
    color: "#fff",
    padding: "14px",
    width: "260px",
    borderRadius: "8px",
    zIndex: "99999",
    boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
    fontSize: "14px"
  });

  const baseContainer = document.createElement("div");
  baseContainer.innerHTML = `
    <div style="font-weight:bold;margin-bottom:6px;">📌 Saved Memo</div>
    <div style="margin-bottom:8px;">${baseText}</div>
  `;

  timeContainer = document.createElement("div");
  timeContainer.id = "yt-time-container";
  timeContainer.style.marginTop = "8px";

  const closeBtn = document.createElement("button");
  closeBtn.innerText = "닫기";
  closeBtn.style.marginTop = "8px";
  closeBtn.onclick = () => {
    closedByUser = true;
    popupBox.remove();
  };

  popupBox.appendChild(baseContainer);
  popupBox.appendChild(timeContainer);
  popupBox.appendChild(closeBtn);

  document.body.appendChild(popupBox);
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

function forceShowMemoPopup(videoId) {
  chrome.storage.local.get([videoId], (result) => {
    const data = result[videoId];
    const memos = getNormalizedMemos(data);
    const base = memos.find(m => m.time === 0);
    if (!base) return;

    closedByUser = false;
    shownBase = true;
    createBasePopup(base.text);
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
      const base = memos.find(m => m.time === 0);
      if (base) {
        shownBase = true;
        createBasePopup(base.text);
      }
    }

    const currentTime = Math.floor(video.currentTime);

    memos.forEach(m => {
      if (m.time > 0) {
        const diff = Math.abs(m.time - currentTime);
        if (diff <= 1) {
          if (!activeTimes[m.time] && popupBox) {
            activeTimes[m.time] = true;
            showTimeInsidePopup(`⏱ ${m.text}`);
          }
        } else {
          activeTimes[m.time] = false;
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

checkMemos();
