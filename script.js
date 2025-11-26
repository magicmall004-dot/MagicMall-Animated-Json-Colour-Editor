let animData = null;
let originalAnimData = null;
let anim = null;
let loaderAnimInstance = null;

let historyStack = [];
let redoStack = [];
const MAX_HISTORY = 60;

let savedThemes = JSON.parse(localStorage.getItem('lottieThemes')) || [];

const slider = document.getElementById("frameSlider");
const frameLabel = document.getElementById("frameLabel");
const totalLabel = document.getElementById("totalLabel");
const groupCheckbox = document.getElementById("groupDuplicates");
const colorsContainer = document.getElementById("colors");
const colorStats = document.getElementById("colorStats");
const layerListEl = document.getElementById("layerList");

const tgsScanModal = document.getElementById('tgs-scan-modal');
const tgsResultsEl = document.getElementById('tgs-results');

const themesList = document.getElementById('themesList');
const loadingIndicator = document.getElementById('loadingIndicator');
const loaderAnimEl = document.getElementById('loaderAnim');
const animContainer = document.getElementById('anim');
const browserWarning = document.getElementById('browserWarning');

const setModal = document.getElementById('settings-modal');
const inpW = document.getElementById('set-w');
const inpH = document.getElementById('set-h');
const inpFR = document.getElementById('set-fr');
const inpScale = document.getElementById('set-scale');

const modal = document.getElementById('export-modal');
const modalCard = modal.querySelector('.modalCard');

const standardModalContentTemplate = `
    <div style="text-align:center; margin-bottom:16px;">
        <i class="ri-download-cloud-2-line" style="font-size:32px; color:var(--primary)"></i>
    </div>
    <h3 style="margin:0 0 8px 0; font-size:18px;">Export Animation</h3>
    <p class="muted" style="margin:0; font-size:13px; line-height:1.5;">Choose your preferred format to download the modified animation.</p>

    <p id="browser-warning-text" style="
        font-size:14px; 
        color:#ef4444; 
        font-weight:600; 
        text-align:center; 
        margin:15px 0 10px 0;
        animation: pulse 1.5s infinite;
    ">
        <i class="ri-alert-line"></i> **If download is blocked**, tap (•••) > **Open in Browser** (Chrome/Safari) to save.
    </p>
    <style>
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.7; }
            100% { opacity: 1; }
        }
    </style>
    <div class="modal-btn-row">
        <button id="export-as-json" class="ghost" style="border:1px solid var(--primary); color:var(--primary)">
            <i class="ri-file-code-line"></i> Download JSON
        </button>
        <button id="export-as-tgs" class="primary" style="background:#2AABEE; border:none;">
            <i class="ri-telegram-line"></i> Download for Telegram
        </button>
        <button class="ghost modal-close" style="color:var(--text-muted); border-color:var(--surface-border)">
            Cancel
        </button>
    </div>
`;

let allExtractedColors = [];
let groupedColors = {};
let currentFilter = "All";

let playerState = { isPaused: true, currentFrame: 0 };
