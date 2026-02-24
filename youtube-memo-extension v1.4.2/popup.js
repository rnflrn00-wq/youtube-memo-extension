function getVideoIdFromUrl(url) {
  const match = url.match(/[?&]v=([^&]+)/);
  return match ? match[1] : null;
}

function formatTime(seconds) {
  const safeSeconds = Math.max(0, Number.isFinite(seconds) ? Math.floor(seconds) : 0);
  const m = Math.floor(safeSeconds / 60);
  const s = safeSeconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function normalizeMemoData(videoId, rawData) {
  if (rawData && typeof rawData === "object") {
    return {
      title: typeof rawData.title === "string" ? rawData.title : videoId,
      channel: typeof rawData.channel === "string" ? rawData.channel : "Unknown Channel",
      thumbnail: typeof rawData.thumbnail === "string"
        ? rawData.thumbnail
        : `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      memos: Array.isArray(rawData.memos)
        ? rawData.memos.filter(m => m && typeof m.text === "string").map(m => ({
            time: Number.isFinite(m.time) ? Math.max(0, Math.floor(m.time)) : 0,
            text: m.text
          }))
        : []
    };
  }

  if (typeof rawData === "string" && rawData.trim()) {
    return {
      title: videoId,
      channel: "Unknown Channel",
      thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      memos: [{ time: 0, text: rawData.trim() }]
    };
  }

  return null;
}

function smartOpenVideo(videoId) {
  chrome.tabs.query({}, (tabs) => {
    const existingTab = tabs.find(t =>
      t.url && t.url.includes(`watch?v=${videoId}`)
    );

    if (existingTab) {
      chrome.tabs.update(existingTab.id, { active: true });
    } else {
      chrome.tabs.create({
        url: `https://www.youtube.com/watch?v=${videoId}`
      });
    }
  });
}

function smartOpenVideoAtTime(videoId, time) {
  chrome.tabs.query({}, (tabs) => {
    const existingTab = tabs.find(t =>
      t.url && t.url.includes(`watch?v=${videoId}`)
    );

    const targetUrl = `https://www.youtube.com/watch?v=${videoId}&t=${time}s`;

    if (existingTab) {
      chrome.tabs.update(existingTab.id, {
        url: targetUrl,
        active: true
      });
    } else {
      chrome.tabs.create({
        url: targetUrl
      });
    }
  });
}

let currentVideoId = null;
let allData = {};

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const url = tabs[0]?.url || "";
  currentVideoId = getVideoIdFromUrl(url);

  const label = document.getElementById("currentVideo");
  if (currentVideoId) {
    label.innerText = "영상 ID: " + currentVideoId;
  } else {
    label.innerText = "유튜브 영상 페이지가 아닙니다.";
  }
});

async function fetchVideoMeta(videoId) {
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    );
    const data = await response.json();

    return {
      title: data.title,
      author: data.author_name,
      thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
    };
  } catch (e) {
    return {
      title: videoId,
      author: "Unknown Channel",
      thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
    };
  }
}

function saveMemo(videoId, memoText, time) {
  chrome.storage.local.get([videoId], async (result) => {
    let existing = result[videoId];

    if (!existing || typeof existing === "string") {
      const meta = await fetchVideoMeta(videoId);
      existing = {
        title: meta.title,
        channel: meta.author,
        thumbnail: meta.thumbnail,
        memos: []
      };
    }

    if (!existing.memos) {
      existing.memos = [];
    }

    existing.memos.push({ time, text: memoText });

    chrome.storage.local.set({ [videoId]: existing }, () => {
      document.getElementById("memoInput").value = "";
      loadMemoList();
    });
  });
}

/* 기본 메모 */
document.getElementById("saveBaseMemoBtn").addEventListener("click", () => {
  const memoText = document.getElementById("memoInput").value.trim();
  if (!currentVideoId || !memoText) return;
  saveMemo(currentVideoId, memoText, 0);
});

/* 시간 메모 */
function getCurrentVideoTime(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { type: "GET_TIME" }, (response) => {
      if (response && response.time !== undefined) {
        callback(Math.floor(response.time));
      }
    });
  });
}

document.getElementById("saveTimeBtn").addEventListener("click", () => {
  const memoText = document.getElementById("memoInput").value.trim();
  if (!currentVideoId || !memoText) return;

  getCurrentVideoTime((time) => {
    saveMemo(currentVideoId, memoText, time);
  });
});

document.getElementById("searchInput").addEventListener("input", (e) => {
  renderList(e.target.value.toLowerCase());
});

function loadMemoList() {
  chrome.storage.local.get(null, (data) => {
    allData = data;
    renderList("");
  });
}

function renderList(filterText) {
  const list = document.getElementById("memoList");
  list.innerHTML = "";

  Object.keys(allData).forEach(videoId => {
    const itemData = normalizeMemoData(videoId, allData[videoId]);
    if (!itemData) return;

    const { title, thumbnail, memos = [] } = itemData;

    const matches =
      memos.some(m => m.text.toLowerCase().includes(filterText)) ||
      title.toLowerCase().includes(filterText);

    if (!matches) return;

    const container = document.createElement("div");
    container.className = "item";

    /* 컨테이너1 */
    const container1 = document.createElement("div");
    container1.className = "container1";

    container1.innerHTML = `
      <img class="thumb" src="${thumbnail}" />
      <div class="title">${title}</div>
    `;

    container1.onclick = () => smartOpenVideo(videoId);

    const baseMemos = memos.filter(m => m.time === 0);
    baseMemos.forEach(m => {
      const base = document.createElement("div");
      base.className = "base-memo";
      base.innerText = m.text;
      base.onclick = () => smartOpenVideo(videoId);
      container1.appendChild(base);
    });

    /* 컨테이너2 */
    const container2 = document.createElement("div");
    container2.className = "container2";

    const timeMemos = memos
      .filter(m => m.time > 0)
      .sort((a, b) => a.time - b.time);

    if (timeMemos.length > 0) {
      timeMemos.forEach(m => {
        const memo = document.createElement("div");
        memo.className = "timeline-memo";
        memo.innerText = `${formatTime(m.time)} "${m.text}"`;

        memo.onclick = (e) => {
          e.stopPropagation();
          smartOpenVideoAtTime(videoId, m.time);
        };

        container2.appendChild(memo);
      });
    } else {
      container2.style.display = "none";
    }

    /* 컨테이너3 */
    const container3 = document.createElement("div");
    container3.className = "container3";

    const deleteBtn = document.createElement("button");
    deleteBtn.innerText = "삭제";
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      chrome.storage.local.remove(videoId, loadMemoList);
    };

    container3.appendChild(deleteBtn);

    container.appendChild(container1);
    container.appendChild(container2);
    container.appendChild(container3);

    list.appendChild(container);
  });
}

loadMemoList();
