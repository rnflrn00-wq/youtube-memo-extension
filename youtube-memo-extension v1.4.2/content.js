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

/* ===========================
   기본 팝업 생성
=========================== */
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

  /* 컨테이너1: 기본메모 */
  const baseContainer = document.createElement("div");
  baseContainer.innerHTML = `
    <div style="font-weight:bold;margin-bottom:6px;">📌 Saved Memo</div>
    <div style="margin-bottom:8px;">${baseText}</div>
  `;

  /* 컨테이너2: 시간메모 영역 */
  timeContainer = document.createElement("div");
  timeContainer.id = "yt-time-container";
  timeContainer.style.marginTop = "8px";

  const closeBtn = document.createElement("button");
  closeBtn.innerText = "닫기";
  closeBtn.style.marginTop = "8px";
  closeBtn.onclick = () => popupBox.remove();

  popupBox.appendChild(baseContainer);
  popupBox.appendChild(timeContainer);
  popupBox.appendChild(closeBtn);

  document.body.appendChild(popupBox);
}

/* ===========================
   시간 메모 내부 표시 (3초)
=========================== */
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

/* ===========================
   GET_TIME 유지
=========================== */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "GET_TIME") {
    const video = document.querySelector("video");
    if (video) {
      sendResponse({ time: video.currentTime });
    }
  }
});

/* ===========================
   재노출 가능 구조
=========================== */

let shownBase = false;
let activeTimes = {}; // 핵심 변경점

function checkMemos() {
  const video = document.querySelector("video");
  if (!video) return;

  const videoId = getVideoId();
  if (!videoId) return;

  chrome.storage.local.get([videoId], (result) => {
    const data = result[videoId];
    if (!data || !data.memos) return;

    /* 기본 메모 */
    if (!shownBase) {
      const base = data.memos.find(m => m.time === 0);
      if (base) {
        shownBase = true;
        createBasePopup(base.text);
      }
    }

    const currentTime = Math.floor(video.currentTime);

    data.memos.forEach(m => {
      if (m.time > 0) {
        const diff = Math.abs(m.time - currentTime);

        if (diff <= 1) {
          if (!activeTimes[m.time]) {
            activeTimes[m.time] = true;
            showTimeInsidePopup(`⏱ ${m.text}`);
          }
        } else {
          // 구간 벗어나면 다시 초기화
          activeTimes[m.time] = false;
        }
      }
    });
  });
}

setInterval(checkMemos, 1000);

/* ===========================
   SPA 대응
=========================== */
let lastUrl = location.href;

new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    shownBase = false;
    activeTimes = {};
    setTimeout(checkMemos, 500);
  }
}).observe(document, { subtree: true, childList: true });

checkMemos();