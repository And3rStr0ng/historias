 const STORAGE_KEY = "ephemeral_stories_v1";
    const MAX_WIDTH = 1080;
    const MAX_HEIGHT = 1920;
    const STORY_VIEW_MS = 5000;

    const storiesStrip = document.getElementById("storiesStrip");
    const addStoryBtn = document.getElementById("addStoryBtn");
    const imageInput = document.getElementById("imageInput");
    const ttlSelect = document.getElementById("ttlSelect");
    const activeCountEl = document.getElementById("activeCount");
    const helperTextEl = document.getElementById("helperText");
    const clearExpiredBtn = document.getElementById("clearExpiredBtn");

    // Elementos del visor
    const viewerBackdrop = document.getElementById("viewerBackdrop");
    const viewerCard = document.getElementById("viewerCard");
    const progressBars = document.getElementById("progressBars");
    const viewerCounter = document.getElementById("viewerCounter");
    const viewerRemaining = document.getElementById("viewerRemaining");
    const viewerImg = document.getElementById("viewerImg");
    const viewerStage = document.getElementById("viewerStage");
    const closeViewerBtn = document.getElementById("closeViewerBtn");
    const prevStoryBtn = document.getElementById("prevStoryBtn");
    const nextStoryBtn = document.getElementById("nextStoryBtn");
    const deleteStoryBtn = document.getElementById("deleteStoryBtn");

    let stories = [];
    let currentIndex = 0;
    let progressTimer = null;
    let elapsedMs = 0;

    function loadStories() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        stories = raw ? JSON.parse(raw) : [];
      } catch {
        stories = [];
      }
      return purgeExpiredStories();
    }

    function saveStories() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stories));
      } catch (err) {
        alert("No se pudo guardar en localStorage (posible límite de espacio excedido). Prueba con una imagen más liviana.");
      }
    }

    function purgeExpiredStories() {
      const now = Date.now();
      const before = stories.length;
      stories = stories.filter((s) => typeof s.expiresAt === "number" && s.expiresAt > now);
      if (stories.length !== before) {
        saveStories();
        if (viewerBackdrop.classList.contains("open")) {
          if (stories.length === 0) {
            closeViewer();
          } else {
            openViewer(Math.min(currentIndex, stories.length - 1));
          }
        }
      }
      renderStoriesStrip();
      return stories.length !== before;
    }

    function formatRemaining(expiresAt) {
      const diffSec = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      if (diffSec < 60) return `${diffSec}s restantes`;
      const mins = Math.floor(diffSec / 60);
      if (mins < 60) return `${mins}m restantes`;
      const hrs = Math.floor(mins / 60);
      const remMins = mins % 60;
      return `${hrs}h ${remMins}m restantes`;
    }

    function renderStoriesStrip() {
      activeCountEl.textContent = `Historias activas: ${stories.length}`;

      // Mantener el botón "+" como primer elemento
      storiesStrip.innerHTML = "";
      storiesStrip.appendChild(addStoryBtn);

      if (stories.length === 0) {
        helperTextEl.innerHTML =
          "Aún no hay historias activas. Pulsa <strong>+</strong> para subir una imagen y probar su ciclo de vida.";
      } else {
        helperTextEl.innerHTML =
          "Toca una historia para verla. Puedes navegar con clics, teclas o deslizando (<strong>swipe</strong>).";
      }

      stories.forEach((story, index) => {
        const item = document.createElement("div");
        item.className = "story-item";
        item.setAttribute("role", "button");
        item.setAttribute("tabindex", "0");
        item.setAttribute("aria-label", `Ver historia ${index + 1}`);

        item.innerHTML = `
          <div class="story-ring">
            <img class="story-thumb" src="${story.base64}" alt="Historia ${index + 1}" />
          </div>
          <span class="story-label mono">#${index + 1}</span>
          <span class="story-sub mono">${formatRemaining(story.expiresAt)}</span>
        `;

        item.addEventListener("click", () => openViewer(index));
        item.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openViewer(index);
          }
        });

        storiesStrip.appendChild(item);
      });
    }

    // Redimensiona a máximo 1080x1920 manteniendo proporción y devuelve Base64
    function fileToConstrainedBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Error al leer el archivo"));
        reader.onload = () => {
          const img = new Image();
          img.onerror = () => reject(new Error("Imagen no válida"));
          img.onload = () => {
            const scale = Math.min(1, MAX_WIDTH / img.width, MAX_HEIGHT / img.height);
            const targetW = Math.max(1, Math.round(img.width * scale));
            const targetH = Math.max(1, Math.round(img.height * scale));

            const canvas = document.createElement("canvas");
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, targetW, targetH);

            // JPEG comprimido ligeramente ayuda a no saturar localStorage
            const mimeType = file.type === "image/png" ? "image/png" : "image/jpeg";
            const base64 = mimeType === "image/jpeg"
              ? canvas.toDataURL("image/jpeg", 0.85)
              : canvas.toDataURL("image/png");

            resolve({ base64, width: targetW, height: targetH });
          };
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
    }

    addStoryBtn.addEventListener("click", () => imageInput.click());
    addStoryBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        imageInput.click();
      }
    });

    imageInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const { base64, width, height } = await fileToConstrainedBase64(file);
        const ttlMs = Number(ttlSelect.value) || 86400000;
        const now = Date.now();

        stories.push({
          id: crypto.randomUUID ? crypto.randomUUID() : `${now}-${Math.random()}`,
          base64,
          width,
          height,
          createdAt: now,
          expiresAt: now + ttlMs,
        });

        saveStories();
        renderStoriesStrip();
      } catch (err) {
        alert(err.message || "No se pudo procesar la imagen.");
      } finally {
        imageInput.value = "";
      }
    });

    clearExpiredBtn.addEventListener("click", () => {
      purgeExpiredStories();
    });

    // Visor de historias
    function buildProgressBars() {
      progressBars.innerHTML = "";
      stories.forEach((_, idx) => {
        const track = document.createElement("div");
        track.className = "progress-track";
        const fill = document.createElement("div");
        fill.className = "progress-fill";
        if (idx < currentIndex) fill.style.width = "100%";
        track.appendChild(fill);
        progressBars.appendChild(track);
      });
    }

    function startStoryTimer() {
      clearInterval(progressTimer);
      elapsedMs = 0;
      const fills = progressBars.querySelectorAll(".progress-fill");

      progressTimer = setInterval(() => {
        purgeExpiredStories();
        if (!stories[currentIndex]) return;

        elapsedMs += 100;
        viewerRemaining.textContent = formatRemaining(stories[currentIndex].expiresAt);

        const pct = Math.min(100, (elapsedMs / STORY_VIEW_MS) * 100);
        if (fills[currentIndex]) {
          fills[currentIndex].style.width = `${pct}%`;
        }

        if (elapsedMs >= STORY_VIEW_MS) {
          if (currentIndex < stories.length - 1) {
            openViewer(currentIndex + 1);
          } else {
            closeViewer();
          }
        }
      }, 100);
    }

    function openViewer(index) {
      if (stories.length === 0) return;
      currentIndex = Math.max(0, Math.min(index, stories.length - 1));
      const story = stories[currentIndex];

      viewerImg.src = story.base64;
      viewerCounter.textContent = `Historia ${currentIndex + 1} de ${stories.length}`;
      viewerRemaining.textContent = formatRemaining(story.expiresAt);

      prevStoryBtn.disabled = currentIndex === 0;
      nextStoryBtn.disabled = currentIndex === stories.length - 1;

      buildProgressBars();
      viewerBackdrop.classList.add("open");
      viewerBackdrop.setAttribute("aria-hidden", "false");
      startStoryTimer();
    }

    function closeViewer() {
      clearInterval(progressTimer);
      viewerBackdrop.classList.remove("open");
      viewerBackdrop.setAttribute("aria-hidden", "true");
    }

    closeViewerBtn.addEventListener("click", closeViewer);
    viewerBackdrop.addEventListener("click", (e) => {
      if (e.target === viewerBackdrop) closeViewer();
    });

    prevStoryBtn.addEventListener("click", () => {
      if (currentIndex > 0) openViewer(currentIndex - 1);
    });

    nextStoryBtn.addEventListener("click", () => {
      if (currentIndex < stories.length - 1) {
        openViewer(currentIndex + 1);
      } else {
        closeViewer();
      }
    });

    deleteStoryBtn.addEventListener("click", () => {
      stories.splice(currentIndex, 1);
      saveStories();
      renderStoriesStrip();
      if (stories.length === 0) {
        closeViewer();
      } else {
        openViewer(Math.min(currentIndex, stories.length - 1));
      }
    });

    // Clic izquierdo / derecho dentro del lienzo para avanzar o retroceder
    viewerStage.addEventListener("click", (e) => {
      const rect = viewerStage.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      if (clickX < rect.width * 0.35) {
        if (currentIndex > 0) openViewer(currentIndex - 1);
      } else {
        if (currentIndex < stories.length - 1) openViewer(currentIndex + 1);
        else closeViewer();
      }
    });

    // Soporte para deslizar (swipe) horizontal en táctil y ratón
    let swipeStartX = null;

    viewerCard.addEventListener("pointerdown", (e) => {
      swipeStartX = e.clientX;
    });

    viewerCard.addEventListener("pointerup", (e) => {
      if (swipeStartX === null) return;
      const deltaX = e.clientX - swipeStartX;
      swipeStartX = null;

      const threshold = 50;
      if (deltaX < -threshold && currentIndex < stories.length - 1) {
        openViewer(currentIndex + 1);
      } else if (deltaX > threshold && currentIndex > 0) {
        openViewer(currentIndex - 1);
      }
    });

    // Atajos de teclado
    document.addEventListener("keydown", (e) => {
      if (!viewerBackdrop.classList.contains("open")) return;
      if (e.key === "Escape") closeViewer();
      if (e.key === "ArrowRight" && currentIndex < stories.length - 1) openViewer(currentIndex + 1);
      if (e.key === "ArrowLeft" && currentIndex > 0) openViewer(currentIndex - 1);
    });

    // Revisión periódica de expiración y contadores en pantalla
    loadStories();
    setInterval(() => {
      purgeExpiredStories();
    }, 1000);