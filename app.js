// Audio Context setup
let audioCtx;
const initAudio = () => {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
};

// Sequencer state
const state = {
    isPlaying: false,
    tempo: 120,
    currentStep: 0,
    scale: 'minor_pentatonic',
    grid: Array(4).fill().map(() => Array(16).fill(false))
};

// Instruments setup
const instruments = [
    { name: 'Lead (Square)', type: 'square', baseFreq: 440 },
    { name: 'Arp (Saw)', type: 'sawtooth', baseFreq: 220 },
    { name: 'Bass (Tri)', type: 'triangle', baseFreq: 110 },
    { name: 'Noise', type: 'noise' }
];

const scales = {
    minor_pentatonic: [0, 3, 5, 7, 10], // C, Eb, F, G, Bb
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    blues: [0, 3, 5, 6, 7, 10]
};

// DOM Elements
const playBtn = document.getElementById('play-btn');
const clearBtn = document.getElementById('clear-btn');
const tempoInput = document.getElementById('tempo');
const tempoVal = document.getElementById('tempo-val');
const scaleSelect = document.getElementById('scale');
const gridContainer = document.getElementById('sequencer-grid');
const shareUrl = document.getElementById('share-url');
const copyBtn = document.getElementById('copy-btn');

// Initialize UI
function createGrid() {
    gridContainer.innerHTML = '';
    instruments.forEach((inst, rowIdx) => {
        const label = document.createElement('div');
        label.className = 'row-label';
        label.textContent = inst.name;
        gridContainer.appendChild(label);

        for (let colIdx = 0; colIdx < 16; colIdx++) {
            const step = document.createElement('div');
            step.className = 'step';
            step.dataset.row = rowIdx;
            step.dataset.col = colIdx;

            if (state.grid[rowIdx][colIdx]) {
                step.classList.add('active');
            }

            // Add keyboard accessibility
            step.tabIndex = 0;
            step.setAttribute('role', 'button');
            step.setAttribute('aria-label', `${inst.name} Step ${colIdx + 1}`);
            step.setAttribute('aria-pressed', state.grid[rowIdx][colIdx]);

            step.addEventListener('click', () => toggleStep(rowIdx, colIdx, step));
            step.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleStep(rowIdx, colIdx, step);
                }
            });

            gridContainer.appendChild(step);
        }
    });
}

function toggleStep(row, col, el) {
    state.grid[row][col] = !state.grid[row][col];
    el.classList.toggle('active');
    el.setAttribute('aria-pressed', state.grid[row][col]);
    updateHash();
}

// Event Listeners setup
tempoInput.addEventListener('input', (e) => {
    state.tempo = parseInt(e.target.value);
    tempoVal.textContent = state.tempo;
});

scaleSelect.addEventListener('change', (e) => {
    state.scale = e.target.value;
});

clearBtn.addEventListener('click', () => {
    state.grid = Array(4).fill().map(() => Array(16).fill(false));
    createGrid();
    updateHash();
});

// We'll hook up Play button and Hash logic in part 2
createGrid();

// Scheduler variables
let nextNoteTime = 0.0;
let timerID;

function scheduleNote(stepNumber, time) {
    // Update UI
    requestAnimationFrame(() => {
        document.querySelectorAll('.step.current').forEach(el => el.classList.remove('current'));
        document.querySelectorAll(`.step[data-col="${stepNumber}"]`).forEach(el => el.classList.add('current'));
    });

    const currentScale = scales[state.scale];

    // Play active notes
    state.grid.forEach((row, rowIdx) => {
        if (row[stepNumber]) {
            playTone(rowIdx, currentScale, time);
        }
    });
}

function playTone(instrumentIdx, scale, time) {
    const inst = instruments[instrumentIdx];

    if (inst.type === 'noise') {
        playNoise(time);
        return;
    }

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.type = inst.type;

    // Calculate frequency based on scale (simple pentatonic progression across steps)
    // To make it musical, we pick a note from the scale based on the step number
    const noteIdx = state.currentStep % scale.length;
    const semitones = scale[noteIdx];
    osc.frequency.value = inst.baseFreq * Math.pow(2, semitones / 12);

    // Envelope
    gainNode.gain.setValueAtTime(0.1, time);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    osc.start(time);
    osc.stop(time + 0.15);
}

function playNoise(time) {
    const bufferSize = audioCtx.sampleRate * 0.1; // 100ms
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;

    const gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(0.2, time);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

    // Simple lowpass filter for punchier noise (snare/hihat feel)
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 5000;

    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    noise.start(time);
}

function scheduler() {
    while (nextNoteTime < audioCtx.currentTime + 0.1) {
        scheduleNote(state.currentStep, nextNoteTime);
        nextNoteTime += (60.0 / state.tempo) / 4; // 16th notes
        state.currentStep = (state.currentStep + 1) % 16;
    }
    timerID = setTimeout(scheduler, 25);
}

playBtn.addEventListener('click', () => {
    initAudio();
    state.isPlaying = !state.isPlaying;

    if (state.isPlaying) {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        state.currentStep = 0;
        nextNoteTime = audioCtx.currentTime + 0.05;
        scheduler();
        playBtn.textContent = 'Pause';
        playBtn.style.backgroundColor = 'var(--accent-pink)';
        playBtn.style.color = 'var(--bg-color)';
    } else {
        clearTimeout(timerID);
        playBtn.textContent = 'Play';
        playBtn.style.backgroundColor = 'transparent';
        playBtn.style.color = 'var(--accent-cyan)';
    }
});

// URL Hash Logic (Sharing)
function updateHash() {
    // Compress grid to a hex string
    let binaryStr = '';
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 16; j++) {
            binaryStr += state.grid[i][j] ? '1' : '0';
        }
    }
    // Convert 64-bit binary string to hex
    let hexStr = '';
    for (let i = 0; i < 64; i += 4) {
        hexStr += parseInt(binaryStr.substr(i, 4), 2).toString(16);
    }

    const hash = `#t=${state.tempo}&s=${state.scale}&g=${hexStr}`;
    history.replaceState(undefined, undefined, hash);

    const fullUrl = window.location.href;
    shareUrl.value = fullUrl;
}

function parseHash() {
    if (!window.location.hash) {
        updateHash();
        return;
    }

    const params = new URLSearchParams(window.location.hash.substring(1));
    if (params.has('t')) {
        state.tempo = parseInt(params.get('t'));
        tempoInput.value = state.tempo;
        tempoVal.textContent = state.tempo;
    }
    if (params.has('s') && scales[params.get('s')]) {
        state.scale = params.get('s');
        scaleSelect.value = state.scale;
    }
    if (params.has('g')) {
        const hexStr = params.get('g');
        if (hexStr.length === 16) {
            let binaryStr = '';
            for (let i = 0; i < 16; i++) {
                binaryStr += parseInt(hexStr[i], 16).toString(2).padStart(4, '0');
            }

            let idx = 0;
            for (let i = 0; i < 4; i++) {
                for (let j = 0; j < 16; j++) {
                    state.grid[i][j] = binaryStr[idx] === '1';
                    idx++;
                }
            }
        }
    }
    createGrid();
    shareUrl.value = window.location.href;
}

copyBtn.addEventListener('click', () => {
    shareUrl.select();
    document.execCommand('copy');
    const originalText = copyBtn.textContent;
    copyBtn.textContent = 'Kopiert!';
    setTimeout(() => {
        copyBtn.textContent = originalText;
    }, 2000);
});

// Initialize from hash
window.addEventListener('load', parseHash);
