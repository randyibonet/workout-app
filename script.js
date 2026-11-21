const state = {
  days: [],
  day: null,
  session: [],
  exerciseIndex: 0,
  set: 1,
  phase: "work",
  side: 1,
  seconds: 0,
  running: false,
  interval: null,
};

const $ = (selector) => document.querySelector(selector);
const screens = {
  selection: $("#selection-screen"),
  preparation: $("#preparation-screen"),
  player: $("#player-screen"),
  complete: $("#complete-screen"),
};

const blockNames = {
  "1. Movilidad": "1. Movilidad",
  "2. Fuerza Principal": "2. Fuerza principal",
  "3. Accesorios": "3. Accesorios",
  "4. Core": "4. Core",
};

// ==========================================
// NUEVAS FUNCIONES: WAKE LOCK Y VOZ
// ==========================================
let wakeLock = null;

async function mantenerPantallaEncendida() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('Pantalla encendida (Wake Lock activo)');
    }
  } catch (err) {
    console.warn(`Wake Lock error: ${err.name}, ${err.message}`);
  }
}

function liberarPantalla() {
  if (wakeLock !== null) {
    wakeLock.release();
    wakeLock = null;
    console.log('Wake Lock liberado');
  }
}

// Si el usuario cambia de pestaña y vuelve, reactivamos el Wake Lock
document.addEventListener('visibilitychange', async () => {
  if (wakeLock !== null && document.visibilityState === 'visible') {
    wakeLock = await navigator.wakeLock.request('screen');
  }
});

function hablar(texto) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel(); 
    const mensaje = new SpeechSynthesisUtterance(texto);
    mensaje.lang = 'es-ES';
    mensaje.rate = 1.1;
    mensaje.pitch = 1;
    window.speechSynthesis.speak(mensaje);
  }
}
// ==========================================

function showScreen(name) {
  Object.entries(screens).forEach(([key, screen]) => {
    screen.classList.toggle("hidden", key !== name);
  });
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function selectExercises(dayData) {
  const amounts = { "1. Movilidad": 2, "2. Fuerza Principal": 4, "3. Accesorios": 3, "4. Core": 4 };
  let selected = [];

  dayData.forEach(bloque => {
    let limite = amounts[bloque.bloque] || 2;
    let shuffled = shuffle([...bloque.ejercicios]).slice(0, limite);

    shuffled.forEach(ej => {
      selected.push({
        name: ej.name,
        block: bloque.bloque,
        sets: ej.series,
        seconds: ej.duration,
        rest: ej.rest,
        reps: ej.unilateral ? `${ej.repetitions} reps · Por lado` : `${ej.repetitions} reps`,
        media: ej.media.replace("assets/", ""), 
        type: ej.type,
        unilateral: ej.unilateral
      });
    });
  });

  return selected;
}

function renderDays() {
  $("#day-list").innerHTML = state.days.map((day, index) => `
    <button class="day-card" data-day="${day.id}">
      <span class="number">0${index + 1}</span>
      <span class="copy"><strong>${day.label}</strong><small>${day.subtitle}</small></span>
      <span class="arrow">→</span>
    </button>
  `).join("");

  document.querySelectorAll(".day-card").forEach((button) => {
    button.addEventListener("click", () => startDay(button.dataset.day));
  });
}

function startDay(dayId) {
  state.day = state.days.find((day) => day.id === dayId);
  state.session = selectExercises(state.day.rawData);
  state.exerciseIndex = 0;
  state.set = 1;
  state.phase = "work";
  state.side = state.session[0].unilateral ? 1 : 0;
  state.running = false;
  state.seconds = state.session[0].seconds;
  
  clearInterval(state.interval);
  
  renderPreparation();
  showScreen("preparation");
}

function createPrepMedia(exercise) {
  const media = exercise.media || "";
  const path = `assets/${encodeURIComponent(media).replaceAll("%2F", "/")}`;

  if (media.toLowerCase().endsWith(".mp4")) {
    return `<video src="${path}" autoplay loop muted playsinline></video>`;
  } else if (media.toLowerCase().endsWith(".webp") || media.toLowerCase().endsWith(".webp")) {
    return `<img src="${path}" alt="${exercise.name}" />`;
  }
  return `<span class="no-media">Sin demo</span>`;
}

function renderPreparation() {
  const estimatedSeconds = state.session.reduce((total, exercise) => {
    const workTime = exercise.unilateral ? (exercise.seconds * 2) + 5 : exercise.seconds;
    return total + exercise.sets * workTime + Math.max(0, exercise.sets - 1) * exercise.rest;
  }, 0);

  $("#session-preview").innerHTML = state.session.map((exercise, index) => `
    <li class="session-item">
      <span class="item-number">${String(index + 1).padStart(2, "0")}</span>
      <div class="prep-media-wrapper">
        ${createPrepMedia(exercise)}
      </div>
      <span class="item-copy">
        <strong>${exercise.name}</strong>
        <small>${blockNames[exercise.block] || exercise.block} · ${exercise.sets} series · ${exercise.reps}${exercise.unilateral ? ' · 👈👉 Unilateral' : ''}</small>
      </span>
    </li>
  `).join("");

  $("#prep-count").textContent = `${state.session.length} ejercicios`;
  $("#prep-duration").textContent = `~${Math.ceil(estimatedSeconds / 60)} minutos activos`;
}

function beginWorkout() {
  showScreen("player");
  
  mantenerPantallaEncendida();
  hablar("A trabajar");
  
  state.running = true;
  beep(650);
  clearInterval(state.interval);
  state.interval = setInterval(tick, 1000);
  renderPlayer();
}

function currentExercise() {
  return state.session[state.exerciseIndex];
}

function renderPlayer() {
  const exercise = currentExercise();
  const resting = state.phase === "rest";
  const switching = state.phase === "switch";
  
  let duration;
  if (resting) duration = exercise.rest;
  else if (switching) duration = 5;
  else duration = exercise.seconds;
  
  const progress = duration ? ((duration - state.seconds) / duration) * 360 : 0;

  screens.player.classList.toggle("resting", resting);
  screens.player.classList.toggle("switching", switching);
  
  let titleText = exercise.name;
  let sideText = "";
  if (exercise.unilateral && state.phase === "work") {
    sideText = state.side === 1 ? " (👈 Lado 1)" : " (Lado 2 👉)";
  }
  
  if (resting) {
    if (state.set < exercise.sets) {
      titleText = `Prepárate: ${exercise.name}`;
    } else if (state.exerciseIndex < state.session.length - 1) {
      titleText = `Prepárate: ${state.session[state.exerciseIndex + 1].name}`;
    } else {
      titleText = "Último esfuerzo";
    }
  } else if (switching) {
    titleText = "Cambia de lado";
  }

  $("#block-name").textContent = resting ? "Respira y recupera" : (switching ? "Cambio de lado" : (blockNames[exercise.block] || exercise.block));
  $("#exercise-name").textContent = titleText + sideText;
  $("#exercise-number").textContent = state.exerciseIndex + 1;
  $("#exercise-total").textContent = state.session.length;
  
  $("#timer-label").textContent = resting ? "Descanso" : (switching ? "Cambio" : "Tiempo");
  $("#seconds").textContent = state.seconds;
  $("#reps").textContent = switching ? "Prepara el otro lado" : exercise.reps;
  $("#details").textContent = switching ? "5 segundos" : `${exercise.sets} series · ${exercise.rest}s de descanso`;
  
  $("#timer-ring").style.setProperty("--progress", `${progress}deg`);
  $("#previous-button").disabled = state.exerciseIndex === 0;
  $("#play-button").textContent = state.running ? "Ⅱ" : "▶";
  $("#play-button").setAttribute("aria-label", state.running ? "Pausar" : "Reproducir");

  // NUEVO: Cambiar el texto del botón Siguiente según el estado
  const nextBtnSpan = document.querySelector("#next-button span");
  if (resting) {
    nextBtnSpan.textContent = "Saltar descanso";
  } else if (switching) {
    nextBtnSpan.textContent = "Saltar cambio";
  } else {
    nextBtnSpan.textContent = "Siguiente";
  }
  
  $("#total-time").textContent = formatTime(totalRemaining());
  $("#session-progress").style.width = `${((state.exerciseIndex + 1) / state.session.length) * 100}%`;
  $("#current-day").textContent = state.day.label;
  $("#current-focus").textContent = state.day.subtitle;
  
  renderNext(resting);
  renderMediaUI(exercise, resting || switching);
}

function renderNext(resting) {
  const panel = $("#up-next");
  if (!resting) {
    panel.classList.add("hidden");
    return;
  }

  const exercise = currentExercise();
  const repeatsExercise = state.set < exercise.sets;
  const next = repeatsExercise ? exercise : state.session[state.exerciseIndex + 1];
  panel.classList.remove("hidden");

  if (!next) {
    $("#next-exercise-name").textContent = "Rutina completada";
    $("#next-exercise-detail").textContent = "Último esfuerzo del día";
  } else {
    $("#next-exercise-name").textContent = next.name;
    $("#next-exercise-detail").textContent = repeatsExercise
      ? `Serie ${state.set + 1} de ${exercise.sets}`
      : `${blockNames[next.block] || next.block}`;
  }
}

function renderMediaUI(currentEx, isBreak) {
  let exerciseToShow = currentEx;
  const badgeEl = $("#set-badge");
  const switching = state.phase === "switch";
  
  if (isBreak) {
    if (switching) {
      badgeEl.textContent = "Cambio";
    } else if (state.set < currentEx.sets) {
      exerciseToShow = currentEx; 
      badgeEl.textContent = `Siguiente: Serie ${state.set + 1}`;
    } else if (state.exerciseIndex < state.session.length - 1) {
      exerciseToShow = state.session[state.exerciseIndex + 1]; 
      badgeEl.textContent = `Próximo: ${exerciseToShow.name}`;
    } else {
      exerciseToShow = null; 
      badgeEl.textContent = "Finalizando...";
    }
  } else {
    if (currentEx.unilateral) {
      badgeEl.textContent = `Serie ${state.set} · Lado ${state.side}`;
    } else {
      badgeEl.textContent = `Serie ${state.set} de ${currentEx.sets}`;
    }
  }

  if (exerciseToShow) {
    renderMedia(exerciseToShow);
  } else {
    $("#exercise-video").classList.add("hidden");
    $("#exercise-image").classList.add("hidden");
    $("#media-fallback").classList.remove("hidden");
  }
}

function renderMedia(exercise) {
  const video = $("#exercise-video");
  const image = $("#exercise-image");
  const fallback = $("#media-fallback");
  const media = exercise.media || "";
  const path = `assets/${encodeURIComponent(media).replaceAll("%2F", "/")}`;

  video.classList.add("hidden");
  image.classList.add("hidden");
  fallback.classList.remove("hidden");

  if (media.toLowerCase().endsWith(".mp4")) {
    if (video.dataset.media !== media) {
      video.src = path;
      video.dataset.media = media;
      video.load();
    }
    video.classList.remove("hidden");
    fallback.classList.add("hidden");
    video.onerror = () => {
      video.classList.add("hidden");
      fallback.classList.remove("hidden");
    };
    video.play().catch(() => {});
  } else if (media.toLowerCase().endsWith(".webp") || media.toLowerCase().endsWith(".webp")) {
    if (image.dataset.media !== media) {
      image.src = path;
      image.dataset.media = media;
    }
    image.alt = `Demostración de ${exercise.name}`;
    image.classList.remove("hidden");
    fallback.classList.add("hidden");
    image.onerror = () => {
      image.classList.add("hidden");
      fallback.classList.remove("hidden");
    };
  } else {
    video.pause();
  }
}

function togglePlay() {
  state.running = !state.running;
  if (state.running) {
    beep(650);
    state.interval = setInterval(tick, 1000);
  } else {
    clearInterval(state.interval);
    $("#exercise-video").pause();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }
  renderPlayer();
}

function tick() {
  if (state.seconds > 1) {
    state.seconds -= 1;
    renderPlayer();
    return;
  }
  state.seconds = 0;
  advancePhase();
}

function advancePhase() {
  const exercise = currentExercise();
  
  if (state.phase === "work") {
    if (exercise.unilateral && state.side === 1) {
      state.phase = "switch";
      state.seconds = 5;
      beep(600);
      hablar("Cambia de lado");
    } else {
      if (state.set < exercise.sets) {
        state.phase = "rest";
        state.seconds = exercise.rest;
        beep(760);
        hablar("Descanso");
      } else {
        if (state.exerciseIndex < state.session.length - 1) {
          state.exerciseIndex += 1;
          state.set = 1;
          state.phase = "work";
          state.seconds = currentExercise().seconds;
          state.side = currentExercise().unilateral ? 1 : 0;
          beep(760);
          hablar("A trabajar");
        } else {
          finishWorkout();
          return;
        }
      }
    }
  } else if (state.phase === "switch") {
    state.phase = "work";
    state.seconds = exercise.seconds;
    state.side = 2;
    beep(650);
    hablar("A trabajar");
  } else if (state.phase === "rest") {
    state.set += 1;
    state.phase = "work";
    state.seconds = exercise.seconds;
    state.side = exercise.unilateral ? 1 : 0;
    beep(650);
    hablar("A trabajar");
  }
  
  renderPlayer();
}

function moveExercise(direction) {
  const next = state.exerciseIndex + direction;
  if (next < 0) return;
  if (next >= state.session.length) {
    finishWorkout();
    return;
  }
  state.exerciseIndex = next;
  state.set = 1;
  state.phase = "work";
  state.seconds = currentExercise().seconds;
  state.side = currentExercise().unilateral ? 1 : 0;
  renderPlayer();
}

function getWorkTime(e) {
  return e.unilateral ? (e.seconds * 2) + 5 : e.seconds;
}

function totalRemaining() {
  const exercise = currentExercise();
  const workTime = getWorkTime(exercise);
  let current;
  
  if (state.phase === "work") {
    if (exercise.unilateral && state.side === 1) {
      current = state.seconds + 5 + exercise.seconds + (exercise.sets - state.set) * (exercise.rest + workTime);
    } else {
      current = state.seconds + (exercise.sets - state.set) * (exercise.rest + workTime);
    }
    if (state.exerciseIndex < state.session.length - 1) current += exercise.rest;
  } else if (state.phase === "switch") {
    current = state.seconds + exercise.seconds + (exercise.sets - state.set) * (exercise.rest + workTime);
    if (state.exerciseIndex < state.session.length - 1) current += exercise.rest;
  } else {
    current = state.seconds + workTime + (exercise.sets - state.set - 1) * (exercise.rest + workTime);
  }
  
  const futureTime = state.session.slice(state.exerciseIndex + 1).reduce((total, item, index, remaining) => {
    const itemWorkTime = getWorkTime(item);
    return total + item.sets * itemWorkTime + Math.max(0, item.sets - 1) * item.rest +
      (index < remaining.length - 1 ? item.rest : 0);
  }, 0);
  
  return Math.max(0, current) + futureTime;
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function beep(frequency) {
  try {
    const context = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(.07, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .12);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + .12);
  } catch (_) {}
}

function finishWorkout() {
  clearInterval(state.interval);
  state.running = false;
  beep(880);
  liberarPantalla(); 
  hablar("Rutina completada. Buen trabajo."); 
  
  $("#completed-count").textContent = state.session.length;
  $("#completed-day").textContent = state.day.label;
  showScreen("complete");
}

function goHome() {
  clearInterval(state.interval);
  state.running = false;
  liberarPantalla(); 
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  $("#exercise-video").pause();
  showScreen("selection");
}

$("#play-button").addEventListener("click", togglePlay);
$("#previous-button").addEventListener("click", () => moveExercise(-1));

// NUEVA LÓGICA: El botón Siguiente ahora evalúa si estás en descanso o trabajando
$("#next-button").addEventListener("click", () => {
  if (state.phase === "rest") {
    // Saltar descanso: avanzar a la siguiente serie del mismo ejercicio
    const exercise = currentExercise();
    state.set += 1;
    state.phase = "work";
    state.seconds = exercise.seconds;
    state.side = exercise.unilateral ? 1 : 0;
    beep(650);
    hablar("A trabajar");
    renderPlayer();
  } else if (state.phase === "switch") {
    // Saltar cambio de lado
    const exercise = currentExercise();
    state.phase = "work";
    state.seconds = exercise.seconds;
    state.side = 2;
    beep(650);
    hablar("A trabajar");
    renderPlayer();
  } else {
    // Si estamos trabajando, avanzar al siguiente ejercicio
    moveExercise(1);
  }
});

$("#end-button").addEventListener("click", goHome);
$("#home-button").addEventListener("click", goHome);
$("#prep-back-button").addEventListener("click", goHome);
$("#begin-button").addEventListener("click", beginWorkout);

fetch("data.json")
  .then((response) => {
    if (!response.ok) throw new Error("No se pudo leer data.json");
    return response.json();
  })
  .then((data) => {
    state.days = [
      { id: "D1", label: "Día 1", subtitle: "Lower Pull & Upper Push", rawData: data.D1 },
      { id: "D2", label: "Día 2", subtitle: "Lower Push & Upper Pull", rawData: data.D2 },
      { id: "D3", label: "Día 3", subtitle: "Arms, Core & Mobility", rawData: data.D3 }
    ];
    renderDays();
  })
  .catch((error) => {
    $("#day-list").innerHTML = `<p>No se pudo cargar data.json. Abre esta carpeta con un servidor local.<br><small>${error.message}</small></p>`;
  });